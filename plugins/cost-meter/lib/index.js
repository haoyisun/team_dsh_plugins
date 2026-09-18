/**
 * dsh-cost-meter 宿主插件（Node 半）。
 *
 * 职责：
 *  - 订阅 `llm/stream` waterfall，捕获**每一次**流式模型调用的提供方 token 用量
 *    （含压缩摘要、自动标题、子 agent，以及失败/中止但已产生用量的 attempt）；
 *  - 按用户可配置的模型单价（settings 命名空间 `cost-meter`）计算费用；
 *  - 将原始用量样本持久化到 storage-domain（`cost_meter` 域，`samples` 表）；
 *    历史用量由会话日志回填，并按会话游标增量补录（`scans` 表记录 seq 与折叠出
 *    的路由上下文）；
 *  - 通过 ctx.webServer 注册 /api/cost-meter/* 路由，供浏览器客户端读取统计、
 *    刷新余额、读写价格；
 *  - 通过 DeepSeek 官方 balance 接口获取账号余额（key 来自 credentials 或环境变量）。
 *
 * 两条数据源按「历史切点」互斥：切点之前的调用由回填从会话日志补，之后的由
 * `llm/stream` 实时记录，因此同一调用不会被计两次（见 ADR-019）。
 *
 * 所有统计（今日/本周/本月/累计/每日历史/模型明细）均在读取时由原始样本
 * 结合当前价格实时计算，因此修改价格后历史费用会按新单价重新计算。
 *
 * 分层：纯逻辑集中在 pricing.js（定价）、aggregate.js（聚合与日历）、
 * backfill.js（会话折叠与样本键）、llm-usage.js（调用流透传与用量抄取），
 * 它们不依赖宿主服务，便于单测；本文件只做宿主接线与 IO。
 */

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
// settings 命名空间的 schema 使用 schemastery（其 Schema 实例方法如 required/role）；
// storage-domain 记录 schema 使用 zod，两者不同，这里分开导入。
import sz from '@deepseek-ai/schemastery';
import { buildStats as aggregateStats } from './aggregate.js';
import {
  backfillStartSeq,
  isPathSafeKey,
  legacySampleKey,
  liveSampleKey,
  planSessionSamples,
  sampleKey,
} from './backfill.js';
import { tapUsage } from './llm-usage.js';
import {
  OFFICIAL_PRICES,
  OFFICIAL_PRICING_URL,
  computeCost,
  normalizePriceRows,
  parsePricingHtml,
  priceRowFor,
  validatePriceRows,
} from './pricing.js';

/** 插件短名（settings 命名空间与 domain 名共用）。 */
const NS = 'cost-meter';

/** 默认模型单价表：单位 CNY / 1M tokens（= 当前官方价格表，用户可同步/覆盖）。 */
const DEFAULT_PRICES = OFFICIAL_PRICES;

/**
 * settings 命名空间的 schemastery schema。
 * 基础字段 = 空闲时段单价；peak* 字段 = 高峰时段单价（可选，缺省按空闲价计）。
 *
 * 数值默认值一律为 0：早先的默认值是上一代模型的官方价，于是手写的、缺字段的
 * 价格行会静默按一套无关的旧价计费。0 至少不会伪装成"已定价"的合理金额。
 */
const PriceRow = sz.object({
  model: sz.string().required(),
  inputPerM: sz.number().min(0).default(0),
  cacheReadPerM: sz.number().min(0).default(0),
  cacheWritePerM: sz.number().min(0).default(0),
  outputPerM: sz.number().min(0).default(0),
  peakInputPerM: sz.number().min(0),
  peakCacheReadPerM: sz.number().min(0),
  peakCacheWritePerM: sz.number().min(0),
  peakOutputPerM: sz.number().min(0),
});
const Config = sz.object({
  prices: sz.array(PriceRow).default(DEFAULT_PRICES),
  currency: sz.string().default('CNY'),
  balanceUrl: sz.string().default('https://api.deepseek.com/user/balance'),
  apiKeyEnv: sz.string().default('DEEPSEEK_API_KEY'),
  balanceTimeoutMs: sz.number().min(1000).default(10000),
  pricingUrl: sz.string().default(OFFICIAL_PRICING_URL),
  pricingTimeoutMs: sz.number().min(1000).default(15000),
  /**
   * 「今日/本周/本月」的日界偏移（分钟，东为正）。默认 480 = 北京时间，
   * 与官方峰谷规则的基准一致。进程本地时区与浏览器时区都不再参与日历运算。
   */
  dayOffsetMinutes: sz.number().min(-1440).max(1440).default(480),
  lastSyncAt: sz.number(),
  lastSyncSource: sz.string(),
  lastSyncError: sz.string(),
});

/** 用量样本的 zod schema（storage-domain 记录 schema 使用 zod）。 */
const SampleSchema = z.object({
  // 实时（llm/stream）调用可能没有 sessionId；只有回填样本才有 seq。
  sessionId: z.string().optional(),
  seq: z.number().int().nonnegative().optional(),
  time: z.number().int().nonnegative(),
  provider: z.string().optional(),
  model: z.string(),
  /** 辅助调用分类（`compaction` / `session-title`）；普通对话调用没有。 */
  purpose: z.string().optional(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
});
const ScanSchema = z.object({
  seq: z.number().int().nonnegative(),
  at: z.number().int().nonnegative(),
  // 折叠出的路由上下文，使下次启动可以只读游标之后的事件。缺失时回退全量读。
  provider: z.string().optional(),
  model: z.string().optional(),
});

/** 域级 singleton：记录一次性存储迁移的完成时间（zod schema 不能接受 null）。 */
const DomainGlobalSchema = z.object({
  /** 样本键完成 path-safe 迁移的时间戳；缺失表示尚未迁移。 */
  keysMigratedAt: z.number().int().nonnegative().optional(),
  /**
   * 历史切点：这个时刻之前的用量由会话日志回填负责，之后的由 `llm/stream` 实时
   * 记录。两条路径按时间互斥，因此同一调用不会被计两次。只在首次启用实时采集时
   * 固定一次，之后不再变化。
   */
  historyCutoff: z.number().int().nonnegative().optional(),
});

/** storage-domain 声明：原始样本 + 每个会话的回填游标。域名须匹配 /^[a-z][a-z0-9_]*$/。 */
const costMeterDomain = defineDomain({
  name: 'cost_meter',
  version: 1,
  /**
   * `per-record`：每条样本一个文档。
   *
   * 默认的 `single` 布局把整个单元放在一个文件里，**每次 put/delete 都重写整个
   * 文件并 fsync**（实测本机 800 KB 约 1.4 ms）。而样本是每次 LLM 调用写一条，
   * 写入量于是随历史长度线性放大：历史 n 条时，每条新样本都要重写和 n 条一样大
   * 的文件。per-record 每次只写该记录自己的小文件。
   *
   * 该布局把记录键直接当路径段（`[a-zA-Z0-9_-]+`），所以依赖启动时的键迁移。
   * 注意 DSH 的 legacy bootstrap **不做键安全检查**（它直接把键拼成文件名写），
   * 因此键没迁移干净时不是「静默跳过」而是直接失败；下面有 single 布局的退回路径，
   * 回填里也有「样本缺失但游标还在」的自愈。
   */
  layout: 'per-record',
  /**
   * 单条记录损坏时移走并跳过，而不是让整个域打不开。
   * `single` 布局的 unit 没有 `backupRecord`，该项在那种布局下会退化成原来的
   * 「整个 open 失败」，因此必须与 per-record 一起启用。
   */
  invalidRecords: 'backup-and-skip',
  global: { schema: DomainGlobalSchema, initial: {} },
  tables: {
    samples: domainTable(SampleSchema),
    scans: domainTable(ScanSchema),
  },
});

/**
 * 退回用声明：与正式声明同名同版本，但使用默认的 `single` 布局。
 *
 * 只在一个场景下使用：从**迁移前**的旧版本直接升级到本版本时，历史样本键里含
 * `:`。per-record 的 legacy bootstrap 不做键安全检查，直接把键拼成文件名写入
 * （Windows 上 `:` 非法 → open 直接失败；POSIX 上会写出之后读不回来的文件）。
 * 那时退回 single 布局先把键迁移干净，下一次启动再正常切到 per-record。
 */
const legacySingleDomain = defineDomain({
  name: 'cost_meter',
  version: 1,
  global: { schema: DomainGlobalSchema, initial: {} },
  tables: {
    samples: domainTable(SampleSchema),
    scans: domainTable(ScanSchema),
  },
});

/** cordis 插件名。 */
const name = 'cost-meter';
/**
 * 依赖的宿主服务。
 *  - `llm`：订阅覆盖全部模型调用的 `llm/stream` waterfall；
 *  - `sessions`：本插件不再直接使用会话对象，但历史用量来自会话日志，声明它既
 *    表达了这层子系统依赖，也让回填不会赶在会话子系统之前跑起来；
 *  - `settings`/`webServer`/`storageDomain`：配置、路由与持久化。
 * `sessionPersistence` 与 `credentials` 仍是可选取用（缺失时降级并记录日志）。
 */
const inject = ['sessions', 'settings', 'webServer', 'storageDomain', 'llm'];

/** 余额缓存有效期：过期后由下一次统计请求在后台刷新。 */
const BALANCE_TTL_MS = 60_000;

/* ── 工具函数 ─────────────────────────────────────────────────────────────── */

/** JSON 响应助手。 */
function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** 读取请求体（限制 1MB）。 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    req.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > 1024 * 1024) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(buffer));
    req.on('error', reject);
  });
}

/** settings 写冲突映射为 409，其余校验失败为 400。 */
function writeErrorStatus(error) {
  return error?.code === 'SETTINGS_CONFLICT' ? 409 : 400;
}

/* ── 插件主体 ─────────────────────────────────────────────────────────────── */

/**
 * 插件入口。整体采用“能降级就降级”的策略：任何子能力失败只记录日志，
 * 绝不让插件激活失败拖垮整个 web 组合。
 */
async function apply(ctx, config) {
  const resolved = Config(config);

  let settingsScope;
  try {
    settingsScope = ctx.settings.register(NS, Config, { base: resolved });
  } catch (error) {
    ctx.logger.error(`cost-meter: settings registration failed (${error?.message ?? error}); falling back to entry config`);
  }

  /**
   * 生效配置：settings 用户层优先，其次入口 config。
   * 除 prices/currency 之外的键（balanceUrl、apiKeyEnv、pricingUrl、超时、
   * dayOffsetMinutes）同样走这里，否则 settings.yaml 里改了也不生效。
   */
  const effective = () => settingsScope?.get() ?? resolved;
  const prices = () => normalizePriceRows(effective().prices);

  let domain;
  try {
    domain = await ctx.storageDomain.open(costMeterDomain);
  } catch (error) {
    // 最可能是从迁移前的旧版本直接升级：历史样本键含 `:`，per-record 的 bootstrap
    // 会拿它当文件名写而失败。退回 single 布局完成键迁移，下次启动自然切换。
    ctx.logger.warn(`cost-meter: per-record storage open failed (${error?.message ?? error}); retrying with the single layout to finish the sample-key migration`);
    try {
      domain = await ctx.storageDomain.open(legacySingleDomain);
      ctx.logger.warn('cost-meter: running on the single storage layout; restart DSH once the sample keys finish migrating to switch to per-record');
    } catch (fallbackError) {
      ctx.logger.error(`cost-meter: storage domain open failed (${fallbackError?.message ?? fallbackError}); statistics will not persist across restarts`);
    }
  }
  const samplesTable = () => domain?.table('samples');
  const scansTable = () => domain?.table('scans');

  /** 跨两种键格式查已记录样本，避免同一事件被重复计入。 */
  const findStoredSample = (table, sessionId, seq) =>
    table.get(sampleKey(sessionId, seq)) ?? table.get(legacySampleKey(sessionId, seq));

  /**
   * 实时用量采集：`llm/stream` 覆盖**每一次**流式模型调用。
   *
   * 相比原先订阅 session/event 的 `assistant/message`，这里能补齐三类漏计：
   * 压缩摘要（`purpose: 'compaction'`）、自动标题（`purpose: 'session-title'`），
   * 以及失败/中止且未产出消息的 attempt（会话日志只留不带 usage 的
   * `assistant/attempt`）。子 agent 的调用同样经过这条 waterfall，因此一并纳入。
   *
   * 与回填的分工：本路径只记录 `historyCutoff` 之后的调用，回填只记录切点之前的
   * 事件，两者按时间互斥，同一调用不会被计两次。
   */
  const liveToken = Math.random().toString(36).slice(2, 10);
  let liveSeq = 0;
  const recordLiveUsage = (options, usage, startedAt) => {
    const table = samplesTable();
    if (table === undefined || usage === undefined || usage === null) return;
    liveSeq += 1;
    const record = {
      time: startedAt,
      provider: typeof options?.provider === 'string' ? options.provider : 'unknown',
      model: typeof options?.model === 'string' ? options.model : 'unknown',
      sessionId: typeof options?.sessionId === 'string' ? options.sessionId : undefined,
      purpose: typeof options?.purpose === 'string' ? options.purpose : undefined,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
    };
    // 不 await：写盘不能拖慢模型流；put 入队后由域的写链与 close() 负责落盘。
    table.put(liveSampleKey(liveToken, liveSeq), record).catch((error) => {
      ctx.logger.error(`cost-meter: live sample persist failed (${error?.message ?? error})`);
    });
  };

  /**
   * 订阅模型调用 waterfall。`{ global: true }` 是必需的：事件在 LlmRuntime 所在的
   * 作用域派发，非全局监听器收不到其他作用域（子 agent、标题生成）发出的调用。
   *
   * 注册本身也要守住：实时采集是激活路径上唯一的必需能力，一旦抛错就会拖垮整个
   * web 组合——这里只降级并记录错误。
   */
  let offStream = () => {};
  try {
    offStream = ctx.on(
      'llm/stream',
      (options, next) => {
        const startedAt = Date.now();
        // 一次调用只记一条：适配器按契约只发一个 usage chunk，多发的忽略，
        // 避免同一次调用被计两次（流被提前放弃时也能记上已到的那一条）。
        let captured = false;
        return tapUsage(next(), (usage) => {
          if (captured) return;
          captured = true;
          recordLiveUsage(options, usage, startedAt);
        });
      },
      { global: true },
    );
  } catch (error) {
    ctx.logger.error(`cost-meter: llm/stream subscription failed (${error?.message ?? error}); live usage will not be recorded`);
  }

  /**
   * 启动回填：按会话游标补录缺失的 usage 样本。
   *
   * 读取使用服务契约里的 `open(id, 'read')` + `handle.read(seq)`。早期实现调用
   * 的 `persistence.readFrom(...)` 在当前 DSH 上并不存在（且 `list()` 的返回项
   * 没有 `id`），因此该路径长期在 per-session try/catch 里静默失败：既没有回填，
   * 也不再更新游标。
   *
   * 游标携带 provider/model 后即可安全增量：区间内缺失的 request/* 上下文由
   * 游标播种，不需要为了重建上下文回读整个会话日志。
   */
  const backfill = async () => {
    const persistence = ctx.get('sessionPersistence');
    if (persistence === undefined || domain === undefined) {
      // 历史用量只有这一条来源：服务缺失时必须留下痕迹，而不是静默没有历史。
      if (persistence === undefined) {
        ctx.logger.warn('cost-meter: sessionPersistence is unavailable; historical usage cannot be backfilled this run');
      }
      return;
    }
    let snapshots;
    try {
      snapshots = await persistence.list();
    } catch (error) {
      ctx.logger.error(`cost-meter: session list failed (${error?.message ?? error})`);
      return;
    }
    const table = samplesTable();
    if (table === undefined) return;
    const scans = scansTable();
    /**
     * 自愈：样本表为空、游标却还在。
     *
     * 成因不止一种（只恢复了 `scans` 的备份、所有样本记录都因损坏被移走、
     * 或 per-record 树只搬了一部分）。无论哪种，此时若仍按游标增量读，历史就永远
     * 不会被重新推导出来——必须忽略游标做全量重读，代价只是多读一遍会话日志。
     */
    const rederive = table.size === 0 && (scans?.size ?? 0) > 0;
    if (rederive) {
      ctx.logger.warn(
        `cost-meter: samples table is empty while ${scans.size} scan cursor(s) exist; re-deriving all samples from session logs`,
      );
    }
    // 切点之后的调用由 llm/stream 实时记录，回填只负责更早的历史。
    const cutoff = domain.global.get()?.historyCutoff;
    let skipped = 0;
    let inserted = 0;
    for (const snapshot of snapshots) {
      const sessionId = snapshot?.header?.id ?? snapshot?.id;
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        skipped += 1;
        continue;
      }
      const cursor = rederive ? undefined : scans?.get(sessionId);
      let events;
      try {
        const handle = await persistence.open(sessionId, 'read');
        try {
          events = (await handle.read(backfillStartSeq(cursor))).events;
        } finally {
          await handle.close().catch(() => {});
        }
      } catch (error) {
        skipped += 1;
        ctx.logger.warn(`cost-meter: backfill read failed for ${sessionId} (${error?.message ?? error})`);
        continue;
      }
      const plan = planSessionSamples({
        sessionId,
        events,
        cursor,
        cutoff,
        findStored: (id, seq) => findStoredSample(table, id, seq),
      });
      for (const { key, value } of plan.inserts) {
        try {
          await table.put(key, value);
          inserted += 1;
        } catch (error) {
          ctx.logger.error(`cost-meter: backfill sample persist failed (${error?.message ?? error})`);
        }
      }
      if (plan.cursor !== undefined) {
        try {
          await scans?.put(sessionId, plan.cursor);
        } catch (error) {
          ctx.logger.warn(`cost-meter: scan cursor persist failed for ${sessionId} (${error?.message ?? error})`);
        }
      }
    }
    if (skipped > 0) ctx.logger.warn(`cost-meter: backfill skipped ${skipped} session(s)`);
    if (inserted > 0) ctx.logger.info(`cost-meter: backfill inserted ${inserted} sample(s)`);
  };

  /**
   * 记录一条启动诊断：样本里出现、但价格表中没有对应单价行的模型。
   * 这类模型的费用恒为 0，只靠面板数字很难发现，因此在日志里留一条线索。
   */
  const reportUnpricedModels = () => {
    const table = samplesTable();
    if (table === undefined) return;
    const priced = prices();
    const missing = new Set();
    for (const [, sample] of table.entries()) {
      if (priceRowFor(priced, sample.model) === undefined) missing.add(sample.model);
    }
    if (missing.size > 0) {
      ctx.logger.warn(
        `cost-meter: no price row for model(s) ${[...missing].join(', ')}; their cost is counted as 0`,
      );
    }
  };

  /**
   * 一次性把样本键迁移为 path-safe 格式。
   *
   * 为什么必须做：storage-domain 的 `per-record` 布局把记录键直接当路径段，而
   * 早先的键是 `sessionId:seq`（含 `:`）。切布局时 backend 的 legacy bootstrap
   * 对非法键是**静默跳过**，历史样本会整体消失；而 `single` 布局下又没法避免
   * 「每条样本重写整个文件」的写入放大。所以先迁键、再切布局。
   *
   * 幂等性：新键已存在时不覆盖更可信的记录（只清掉旧键），完成后写域级标记，
   * 之后启动直接返回；中断也安全（标记没写就整体重跑）。
   */
  const migrateSampleKeys = async () => {
    const table = samplesTable();
    if (table === undefined || domain === undefined) return;
    if (domain.global.get()?.keysMigratedAt !== undefined) return;
    let migrated = 0;
    for (const [key, sample] of [...table.entries()]) {
      if (isPathSafeKey(key)) continue;
      const next = sampleKey(sample.sessionId, sample.seq);
      if (!isPathSafeKey(next)) {
        ctx.logger.warn(`cost-meter: sample ${sample.sessionId}#${sample.seq} has no path-safe key; left as is`);
        continue;
      }
      try {
        const existing = table.get(next);
        // 已有正确记录时不要用可能被污染的旧记录覆盖它。
        if (existing === undefined || existing.model === 'unknown') await table.put(next, sample);
        await table.delete(key);
        migrated += 1;
      } catch (error) {
        ctx.logger.error(`cost-meter: sample key migration failed for ${key} (${error?.message ?? error})`);
      }
    }
    try {
      // 合并写入而不是整体覆盖：域级 singleton 里还可能有 historyCutoff 等其他标记。
      await domain.global.set({ ...domain.global.get(), keysMigratedAt: Date.now() });
    } catch (error) {
      ctx.logger.error(`cost-meter: migration marker persist failed (${error?.message ?? error})`);
    }
    if (migrated > 0) ctx.logger.info(`cost-meter: migrated ${migrated} sample key(s) to the path-safe format`);
  };

  /**
   * 固定历史切点：首次启用实时采集时写一次，之后永不改变。
   *
   * 切点把两条数据源分开：它之前的调用由回填从会话日志补，之后的由 `llm/stream`
   * 实时记录。两者按时间互斥，因此不存在重复计数的可能。
   * @returns 切点时间戳（域不可用时为 undefined，此时回填按全量历史处理）。
   */
  const ensureHistoryCutoff = async () => {
    if (domain === undefined) return undefined;
    const current = domain.global.get() ?? {};
    if (typeof current.historyCutoff === 'number') return current.historyCutoff;
    const cutoff = Date.now();
    try {
      await domain.global.set({ ...current, historyCutoff: cutoff });
      ctx.logger.info('cost-meter: pinned the history cutoff; usage from now on is recorded live from llm/stream');
    } catch (error) {
      ctx.logger.error(`cost-meter: history cutoff persist failed (${error?.message ?? error})`);
    }
    return cutoff;
  };

  /**
   * 启动期一次性工作：键迁移 → 固定历史切点 → 历史回填 → 未定价诊断。
   *
   * 不阻塞插件激活（迁移与回填合计可达十几秒），但统计路由会等待它完成：
   * 迁移期间同一事件会短暂同时存在新旧两条记录，此时读统计会把费用算两遍。
   * 失败只记日志——统计退化为「不完整」而不是「不可用」。
   */
  let startupWork;
  const startupReady = () => {
    startupWork ??= (async () => {
      try {
        await migrateSampleKeys();
        await ensureHistoryCutoff();
        await backfill();
        reportUnpricedModels();
      } catch (error) {
        ctx.logger.error(`cost-meter: startup work failed (${error?.message ?? error})`);
      }
    })();
    return startupWork;
  };

  /** 汇总统计（实时计算；价格表每个请求只归一化一次）。 */
  const buildStats = () => {
    const current = effective();
    return {
      ...aggregateStats({
        samples: samplesTable()?.entries() ?? [],
        prices: normalizePriceRows(current.prices),
        compute: computeCost,
        currency: current.currency,
        now: Date.now(),
        offsetMinutes: current.dayOffsetMinutes,
      }),
      pricesMeta: {
        lastSyncAt: current.lastSyncAt,
        lastSyncSource: current.lastSyncSource,
        lastSyncError: current.lastSyncError,
      },
      balance: balanceForStats(),
    };
  };

  /* ── 余额 ─────────────────────────────────────────────────────────────── */

  let balanceCache;
  let balancePending;
  let nonLocalBindWarned = false;

  /**
   * 统计接口是否暴露账号余额。
   * webserver 绑定到所有网卡时，同网段任何人都能读 /api/cost-meter/stats，
   * 因此这种部署下不下发余额（其余统计仍然提供）。
   */
  const balanceExposed = () => {
    try {
      if (ctx.webServer?.host === '0.0.0.0') {
        if (!nonLocalBindWarned) {
          nonLocalBindWarned = true;
          ctx.logger.warn('cost-meter: web server is bound to all interfaces; account balance is withheld from /api/cost-meter/stats');
        }
        return false;
      }
    } catch {
      /* 宿主未提供 host 时按可暴露处理 */
    }
    return true;
  };

  /** 统计响应里的余额视图。缓存过期时在后台刷新，结果由下一次轮询带走。 */
  const balanceForStats = () => {
    if (!balanceExposed()) return { available: false, error: 'NON_LOCAL_BIND', at: balanceCache?.at };
    if (balanceCache === undefined || Date.now() - balanceCache.at > BALANCE_TTL_MS) refreshBalance();
    return balanceCache ?? { available: false, loading: true, at: undefined };
  };

  /** 解析 DeepSeek API key：credentials 服务优先，其次进程环境变量。 */
  const resolveApiKey = async () => {
    const apiKeyEnv = effective().apiKeyEnv;
    const credentials = ctx.get('credentials');
    if (credentials !== undefined) {
      try {
        const hit = await credentials.resolve(apiKeyEnv);
        if (hit !== undefined && hit.value.length > 0) return hit.value;
      } catch (error) {
        ctx.logger.warn(`cost-meter: credential resolve failed (${error?.message ?? error})`);
      }
    }
    const ambient = process.env[apiKeyEnv];
    return ambient !== undefined && ambient.length > 0 ? ambient : undefined;
  };

  /** 调用 DeepSeek balance 接口。force=true 时绕过缓存。 */
  const fetchBalance = async (force = false) => {
    if (balanceCache !== undefined && !force && Date.now() - balanceCache.at < BALANCE_TTL_MS) {
      return balanceCache;
    }
    const at = Date.now();
    const current = effective();
    try {
      const apiKey = await resolveApiKey();
      if (apiKey === undefined) {
        const result = { available: false, error: 'NO_API_KEY', at };
        balanceCache = result;
        return result;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), current.balanceTimeoutMs);
      let response;
      try {
        response = await fetch(current.balanceUrl, {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        const result = { available: false, error: `HTTP ${response.status}`, at };
        balanceCache = result;
        return result;
      }
      const data = await response.json();
      const infos = Array.isArray(data?.balance_infos) ? data.balance_infos : [];
      // 按展示币种挑选一条：跨币种求和会把不同币种的余额加成一个无意义的数。
      const primary = infos.find((info) => info?.currency === current.currency) ?? infos[0];
      const num = (value) => Number(value) || 0;
      const result = {
        available: data?.is_available === true,
        currency: primary?.currency ?? current.currency,
        totalBalance: num(primary?.total_balance),
        grantedBalance: num(primary?.granted_balance),
        toppedUpBalance: num(primary?.topped_up_balance),
        infos: infos.map((info) => ({ currency: info?.currency, totalBalance: num(info?.total_balance) })),
        at,
      };
      balanceCache = result;
      return result;
    } catch (error) {
      const result = {
        available: false,
        error: error?.name === 'AbortError' ? 'TIMEOUT' : String(error?.message ?? error),
        at,
      };
      balanceCache = result;
      return result;
    }
  };

  /** 合并并发刷新请求：同一时刻只发一次 balance 调用。 */
  const refreshBalance = () => {
    if (balancePending !== undefined) return balancePending;
    balancePending = fetchBalance(true)
      .catch((error) => {
        ctx.logger.warn(`cost-meter: balance refresh failed (${error?.message ?? error})`);
        return balanceCache;
      })
      .finally(() => {
        balancePending = undefined;
      });
    return balancePending;
  };

  /* ── 官方价格同步 ──────────────────────────────────────────────────────── */

  /** 从官方定价页抓取并解析价格表；失败抛错。 */
  const fetchOfficialPrices = async () => {
    const current = effective();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), current.pricingTimeoutMs);
    let html;
    try {
      const response = await fetch(current.pricingUrl, {
        headers: { 'user-agent': 'Mozilla/5.0' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      html = await response.text();
    } finally {
      clearTimeout(timer);
    }
    return parsePricingHtml(html);
  };

  /** 读取本命名空间当前 revision，供写入时做并发检测。 */
  const settingsRevision = () => {
    try {
      return ctx.settings.describe().find((entry) => entry.ns === NS)?.revision;
    } catch (error) {
      ctx.logger.warn(`cost-meter: settings describe failed (${error?.message ?? error})`);
      return undefined;
    }
  };

  /**
   * 写入本命名空间的用户层。
   * 带上 revision 后，面板与 DSH 设置页并发改价会以 409 拒绝后写者，而不是静默覆盖。
   */
  const writeSettings = async (patch) => {
    const revision = settingsRevision();
    if (revision === undefined) {
      await settingsScope.update(patch);
      return;
    }
    await ctx.settings.update(NS, patch, revision);
  };

  /**
   * 同步官方价格：远程抓取解析优先，失败回退内置官方价格表并附带错误信息。
   * 同步结果直接覆盖用户手动调整的价格（用户确认的策略）。
   */
  const syncPrices = async () => {
    if (settingsScope === undefined) {
      return { ok: false, error: 'settings unavailable' };
    }
    const now = Date.now();
    let source = 'remote';
    let rows;
    let error = '';
    try {
      rows = await fetchOfficialPrices();
    } catch (err) {
      source = 'builtin';
      error = String(err?.message ?? err);
      rows = OFFICIAL_PRICES;
      ctx.logger.warn(`cost-meter: official pricing fetch failed, using built-in table (${error})`);
    }
    try {
      await writeSettings({
        prices: rows,
        lastSyncAt: now,
        lastSyncSource: source,
        // 用空串而不是 undefined：settings 合并会剥掉 undefined 键，
        // 旧错误会永久留在用户配置里，面板会一直显示上一次的失败原因。
        lastSyncError: error,
      });
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err), code: err?.code };
    }
    return { ok: true, source, prices: rows };
  };

  /* ── HTTP 路由 ────────────────────────────────────────────────────────── */

  const routes = [
    {
      path: '/api/cost-meter/stats',
      handler: async (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });
        // 等启动期工作收尾：迁移中间态下同一事件会有新旧两条记录，此时读会翻倍。
        await startupReady();
        sendJson(res, 200, buildStats());
      },
    },
    {
      path: '/api/cost-meter/refresh-balance',
      handler: async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
        if (!balanceExposed()) return sendJson(res, 200, { available: false, error: 'NON_LOCAL_BIND' });
        sendJson(res, 200, await refreshBalance());
      },
    },
    {
      path: '/api/cost-meter/sync-prices',
      handler: async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
        const result = await syncPrices();
        // 失败的同步必须是非 2xx，否则客户端 fetchJson 会把 ok:false 当成功。
        sendJson(res, result.ok ? 200 : 503, result);
      },
    },
    {
      path: '/api/cost-meter/prices',
      handler: async (req, res) => {
        if (req.method === 'GET') {
          const current = effective();
          return sendJson(res, 200, {
            prices: normalizePriceRows(current.prices),
            currency: current.currency,
            dayOffsetMinutes: current.dayOffsetMinutes,
          });
        }
        if (req.method === 'POST') {
          if (settingsScope === undefined) {
            return sendJson(res, 503, { error: 'settings unavailable' });
          }
          let body;
          try {
            body = JSON.parse(await readBody(req));
          } catch {
            return sendJson(res, 400, { error: 'invalid JSON body' });
          }
          let next;
          try {
            next = validatePriceRows(body.prices, PriceRow);
          } catch (error) {
            return sendJson(res, 400, { error: String(error?.message ?? error) });
          }
          try {
            await writeSettings({ prices: next });
          } catch (error) {
            return sendJson(res, writeErrorStatus(error), {
              error: String(error?.message ?? error),
              code: error?.code,
            });
          }
          return sendJson(res, 200, { ok: true, prices: next });
        }
        sendJson(res, 405, { error: 'method not allowed' });
      },
    },
  ];
  const routeDisposers = [];
  for (const route of routes) {
    try {
      routeDisposers.push(ctx.webServer.register({ kind: 'exact', path: route.path, handler: route.handler }));
    } catch (error) {
      ctx.logger.error(`cost-meter: route ${route.path} registration failed (${error?.message ?? error})`);
    }
  }

  /* ── 生命周期 ─────────────────────────────────────────────────────────── */

  // 启动期工作（键迁移 + 回填）不阻塞插件激活，统计路由会等待它完成。
  startupReady();

  // 余额只做一次启动预热；之后由统计请求按需刷新，不再空转定时器。
  refreshBalance();

  // ctx.effect 的回调会立即执行，返回值才是卸载期的 disposer。
  ctx.effect(() => {
    return () => {
      offStream();
      for (const disposeRoute of routeDisposers) {
        try {
          disposeRoute();
        } catch {
          /* 忽略卸载期错误 */
        }
      }
      if (domain !== undefined) {
        domain.close().catch((error) => ctx.logger.warn(`cost-meter: domain close failed (${error?.message ?? error})`));
      }
    };
  }, 'cost-meter: host cleanup');
}

export { apply, Config, inject, name };
