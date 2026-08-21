/**
 * dsh-cost-meter 宿主插件（Node 半）。
 *
 * 职责：
 *  - 订阅 session/event，捕获每次 assistant/message 的提供方 token 用量；
 *  - 按用户可配置的模型单价（settings 命名空间 `cost-meter`）计算费用；
 *  - 将原始用量样本持久化到 storage-domain（`cost-meter` 域，`samples` 表），
 *    并在启动时对既有会话做增量回填（`scans` 表记录每个会话已扫描到的 seq）；
 *  - 通过 ctx.webServer 注册 /api/cost-meter/* 路由，供浏览器客户端读取统计、
 *    刷新余额、读写价格；
 *  - 通过 DeepSeek 官方 balance 接口获取账号余额（key 来自 credentials 或环境变量）。
 *
 * 所有统计（今日/本周/本月/累计/每日历史/模型明细）均在读取时由原始样本
 * 结合当前价格实时计算，因此修改价格后历史费用会按新单价重新计算。
 */

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
// settings 命名空间的 schema 使用 schemastery（其 Schema 实例方法如 required/role）；
// storage-domain 记录 schema 使用 zod，两者不同，这里分开导入。
import sz from '@deepseek-ai/schemastery';
import { OFFICIAL_PRICES, OFFICIAL_PRICING_URL, computeCost, parsePricingHtml } from './pricing.js';

/** 插件短名（settings 命名空间与 domain 名共用）。 */
const NS = 'cost-meter';

/** 默认模型单价表：单位 CNY / 1M tokens（= 当前官方价格表，用户可同步/覆盖）。 */
const DEFAULT_PRICES = OFFICIAL_PRICES;

/**
 * settings 命名空间的 schemastery schema。
 * 基础字段 = 空闲时段单价；peak* 字段 = 高峰时段单价（可选，缺省按空闲价计）。
 */
const PriceRow = sz.object({
  model: sz.string().required(),
  inputPerM: sz.number().min(0).default(1.5),
  cacheReadPerM: sz.number().min(0).default(0.05),
  cacheWritePerM: sz.number().min(0).default(0),
  outputPerM: sz.number().min(0).default(4.5),
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
  lastSyncAt: sz.number(),
  lastSyncSource: sz.string(),
  lastSyncError: sz.string(),
});

/** 用量样本的 zod schema（storage-domain 记录 schema 使用 zod）。 */
const SampleSchema = z.object({
  sessionId: z.string(),
  seq: z.number().int().nonnegative(),
  time: z.number().int().nonnegative(),
  provider: z.string().optional(),
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
});
const ScanSchema = z.object({
  seq: z.number().int().nonnegative(),
  at: z.number().int().nonnegative(),
});

/** storage-domain 声明：原始样本 + 每个会话的回填游标。域名须匹配 /^[a-z][a-z0-9_]*$/。 */
const costMeterDomain = defineDomain({
  name: 'cost_meter',
  version: 1,
  tables: {
    samples: domainTable(SampleSchema),
    scans: domainTable(ScanSchema),
  },
});

/** cordis 插件名。 */
const name = 'cost-meter';
/** 依赖的宿主服务。 */
const inject = ['sessions', 'settings', 'webServer', 'storageDomain'];

/* ── 工具函数 ─────────────────────────────────────────────────────────────── */

/** 取事件所在日期的本地 YYYY-MM-DD 键。 */
function localDayKey(time) {
  const d = new Date(time);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 本地当日 00:00 的时间戳。 */
function startOfLocalDay(time) {
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 本地本周一 00:00 的时间戳。 */
function startOfLocalWeek(time) {
  const d = new Date(time);
  const dow = (d.getDay() + 6) % 7; // 周一 = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow).getTime();
}

/** 本地本月 1 日 00:00 的时间戳。 */
function startOfLocalMonth(time) {
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** 构造一个持久化样本。 */
function buildSample(sessionId, event, provider, model) {
  const usage = event.data.usage;
  return {
    sessionId,
    seq: event.seq,
    time: event.time,
    provider,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  };
}

/** 把样本累加进聚合桶。 */
function accumulate(bucket, sample, prices) {
  const { cost, priced } = computeCost(prices, sample);
  bucket.calls += 1;
  bucket.inputTokens += sample.inputTokens;
  bucket.outputTokens += sample.outputTokens;
  bucket.cacheReadTokens += sample.cacheReadTokens ?? 0;
  bucket.cacheWriteTokens += sample.cacheWriteTokens ?? 0;
  bucket.cost += cost;
  if (!priced) bucket.unpriced = true;
  return bucket;
}

/** 空聚合桶。 */
function emptyBucket() {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 0,
    unpriced: false,
  };
}

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

/** 校验客户端提交的 prices 数组（按 schemastery schema）。高峰字段缺省回退到空闲价。 */
function normalizePrices(raw) {
  if (!Array.isArray(raw)) throw new Error('prices must be an array');
  return raw.map((row, index) => {
    if (typeof row !== 'object' || row === null) throw new Error(`prices[${index}] must be an object`);
    const parsed = PriceRow(row);
    return {
      model: parsed.model,
      inputPerM: parsed.inputPerM,
      cacheReadPerM: parsed.cacheReadPerM,
      cacheWritePerM: parsed.cacheWritePerM ?? 0,
      outputPerM: parsed.outputPerM,
      peakInputPerM: parsed.peakInputPerM ?? parsed.inputPerM,
      peakCacheReadPerM: parsed.peakCacheReadPerM ?? parsed.cacheReadPerM,
      peakCacheWritePerM: parsed.peakCacheWritePerM ?? 0,
      peakOutputPerM: parsed.peakOutputPerM ?? parsed.outputPerM,
    };
  });
}

/* ── 插件主体 ─────────────────────────────────────────────────────────────── */

/**
 * 插件入口。整体采用“能降级就降级”的策略：任何子能力失败只记录日志，
 * 绝不让插件激活失败拖垮整个 web 组合。
 */
async function apply(ctx, config) {
  const resolved = Config(config);
  const prices = () => settingsScope?.get()?.prices ?? resolved.prices;
  const currency = () => settingsScope?.get()?.currency ?? resolved.currency;

  let settingsScope;
  try {
    settingsScope = ctx.settings.register(NS, Config, { base: resolved });
  } catch (error) {
    ctx.logger.error(`cost-meter: settings registration failed (${error?.message ?? error}); falling back to entry config`);
  }

  let domain;
  try {
    domain = await ctx.storageDomain.open(costMeterDomain);
  } catch (error) {
    ctx.logger.error(`cost-meter: storage domain open failed (${error?.message ?? error}); statistics will not persist across restarts`);
  }
  const samplesTable = () => domain?.table('samples');
  const scansTable = () => domain?.table('scans');

  /** 记录一条样本（幂等：同 sessionId:seq 覆盖写入）。 */
  const recordSample = async (sessionId, event, provider, model) => {
    const table = samplesTable();
    if (table === undefined) return;
    try {
      await table.put(`${sessionId}:${event.seq}`, buildSample(sessionId, event, provider, model));
    } catch (error) {
      ctx.logger.error(`cost-meter: sample persist failed (${error?.message ?? error})`);
    }
  };

  /** 由事件对象记录样本；provider/model 为扫描上下文折叠出的路由事实。 */
  const recordFromEvent = (sessionId, event, provider, model) => {
    if (event.type !== 'assistant/message' || event.data.usage === undefined) return;
    return recordSample(sessionId, event, provider, model);
  };

  /** 订阅实时会话事件：assistant/message 携带 usage 时记录。 */
  const offEvents = ctx.on('session/event', (session, event) => {
    if (event.type !== 'assistant/message' || event.data.usage === undefined) return;
    let provider;
    let model;
    try {
      const route = session.requestContext();
      const header = session.requestHeader();
      provider = route?.provider ?? header?.config?.provider ?? 'unknown';
      model = route?.model ?? header?.config?.model ?? 'unknown';
    } catch {
      provider = 'unknown';
      model = 'unknown';
    }
    recordFromEvent(session.id, event, provider, model);
  });

  /**
   * 启动回填：对持久化会话全量折叠路由上下文并补录 usage 样本。
   *
   * 修复要点（v4）：
   *  - 改为全量读（readFrom(id, 0)）重建 provider/model 上下文，而不是只读
   *    游标之后的增量——增量区间内通常没有 request/header 事件，旧实现会
   *    把上下文折叠成 unknown，进而把正确样本污染成 model=unknown；
   *  - 只在样本缺失、或现有样本 model 为 unknown（已被污染）时写入，绝不
   *    覆盖实时监听已经记录的正确样本（同 key 幂等）。
   */
  const backfill = async () => {
    const persistence = ctx.get('sessionPersistence');
    if (persistence === undefined || domain === undefined) return;
    let headers;
    try {
      headers = await persistence.list();
    } catch (error) {
      ctx.logger.error(`cost-meter: session list failed (${error?.message ?? error})`);
      return;
    }
    for (const meta of headers) {
      let inspection;
      try {
        inspection = await persistence.readFrom(meta.id, 0);
      } catch (error) {
        ctx.logger.warn(`cost-meter: backfill read failed for ${meta.id} (${error?.message ?? error})`);
        continue;
      }
      let lastSeq = -1;
      let provider = 'unknown';
      let model = 'unknown';
      for (const event of inspection.events) {
        if (event.seq > lastSeq) lastSeq = event.seq;
        if (event.type === 'request/context') {
          provider = event.data.provider ?? provider;
          model = event.data.model ?? model;
        } else if (event.type === 'request/header') {
          provider = event.data.header?.config?.provider ?? provider;
          model = event.data.header?.config?.model ?? model;
        } else if (event.type === 'assistant/message' && event.data.usage !== undefined) {
          const table = samplesTable();
          if (table === undefined) continue;
          const key = `${meta.id}:${event.seq}`;
          try {
            const existing = table.get(key);
            if (existing !== undefined && existing.model !== 'unknown') continue;
            await table.put(key, buildSample(meta.id, event, provider, model));
          } catch (error) {
            ctx.logger.error(`cost-meter: backfill sample persist failed (${error?.message ?? error})`);
          }
        }
      }
      if (lastSeq >= 0) {
        try {
          await scansTable()?.put(meta.id, { seq: lastSeq, at: Date.now() });
        } catch (error) {
          ctx.logger.warn(`cost-meter: scan cursor persist failed for ${meta.id} (${error?.message ?? error})`);
        }
      }
    }
  };

  /** 汇总统计（实时计算）。 */
  const buildStats = () => {
    const now = Date.now();
    const todayStart = startOfLocalDay(now);
    const weekStart = startOfLocalWeek(now);
    const monthStart = startOfLocalMonth(now);
    const todayKey = localDayKey(now);

    const today = emptyBucket();
    const week = emptyBucket();
    const month = emptyBucket();
    const total = emptyBucket();
    const daily = new Map();
    const byModel = new Map();
    let earliest = Infinity;
    let count = 0;

    const table = samplesTable();
    if (table !== undefined) {
      for (const [, sample] of table.entries()) {
        count += 1;
        if (sample.time < earliest) earliest = sample.time;
        const key = localDayKey(sample.time);
        if (key === todayKey) accumulate(today, sample, prices());
        if (sample.time >= weekStart) accumulate(week, sample, prices());
        if (sample.time >= monthStart) accumulate(month, sample, prices());
        accumulate(total, sample, prices());
        let day = daily.get(key);
        if (day === undefined) {
          day = emptyBucket();
          daily.set(key, day);
        }
        accumulate(day, sample, prices());
        let m = byModel.get(sample.model);
        if (m === undefined) {
          m = { ...emptyBucket(), model: sample.model };
          byModel.set(sample.model, m);
        }
        accumulate(m, sample, prices());
      }
    }

    const dailyList = [...daily.entries()]
      .map(([date, bucket]) => ({ date, ...bucket }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const modelList = [...byModel.values()].sort((a, b) => b.cost - a.cost);

    return {
      currency: currency(),
      prices: prices(),
      pricesMeta: {
        lastSyncAt: settingsScope?.get()?.lastSyncAt,
        lastSyncSource: settingsScope?.get()?.lastSyncSource,
        lastSyncError: settingsScope?.get()?.lastSyncError,
      },
      now,
      since: Number.isFinite(earliest) ? earliest : undefined,
      sampleCount: count,
      periods: {
        today,
        week,
        month,
        total,
      },
      daily: dailyList,
      byModel: modelList,
      balance: balanceCache ?? { available: false, loading: true, at: undefined },
    };
  };

  /* ── 余额 ─────────────────────────────────────────────────────────────── */

  let balanceCache;

  /** 解析 DeepSeek API key：credentials 服务优先，其次进程环境变量。 */
  const resolveApiKey = async () => {
    const credentials = ctx.get('credentials');
    if (credentials !== undefined) {
      try {
        const hit = await credentials.resolve(resolved.apiKeyEnv);
        if (hit !== undefined && hit.value.length > 0) return hit.value;
      } catch (error) {
        ctx.logger.warn(`cost-meter: credential resolve failed (${error?.message ?? error})`);
      }
    }
    const ambient = process.env[resolved.apiKeyEnv];
    return ambient !== undefined && ambient.length > 0 ? ambient : undefined;
  };

  /** 调用 DeepSeek balance 接口。force=true 时绕过 60 秒缓存。 */
  const fetchBalance = async (force = false) => {
    if (balanceCache !== undefined && !force && Date.now() - balanceCache.at < 60_000) {
      return balanceCache;
    }
    const at = Date.now();
    try {
      const apiKey = await resolveApiKey();
      if (apiKey === undefined) {
        return { available: false, error: 'NO_API_KEY', at };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), resolved.balanceTimeoutMs);
      let response;
      try {
        response = await fetch(resolved.balanceUrl, {
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
      const sum = (field) => infos.reduce((acc, info) => acc + (Number(info[field]) || 0), 0);
      const result = {
        available: data?.is_available === true,
        currency: infos[0]?.currency ?? resolved.currency,
        totalBalance: sum('total_balance'),
        grantedBalance: sum('granted_balance'),
        toppedUpBalance: sum('topped_up_balance'),
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

  /* ── 官方价格同步 ──────────────────────────────────────────────────────── */

  /** 从官方定价页抓取并解析价格表；失败抛错。 */
  const fetchOfficialPrices = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), resolved.pricingTimeoutMs);
    let html;
    try {
      const response = await fetch(resolved.pricingUrl, {
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
    let error;
    try {
      rows = await fetchOfficialPrices();
    } catch (err) {
      source = 'builtin';
      error = String(err?.message ?? err);
      rows = OFFICIAL_PRICES;
      ctx.logger.warn(`cost-meter: official pricing fetch failed, using built-in table (${error})`);
    }
    try {
      await settingsScope.update({
        prices: rows,
        lastSyncAt: now,
        lastSyncSource: source,
        lastSyncError: source === 'builtin' ? error : undefined,
      });
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) };
    }
    return { ok: true, source, prices: rows, error };
  };

  /* ── HTTP 路由 ────────────────────────────────────────────────────────── */

  const routes = [
    {
      path: '/api/cost-meter/stats',
      handler: async (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });
        sendJson(res, 200, buildStats());
      },
    },
    {
      path: '/api/cost-meter/refresh-balance',
      handler: async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
        sendJson(res, 200, await fetchBalance(true));
      },
    },
    {
      path: '/api/cost-meter/sync-prices',
      handler: async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
        sendJson(res, 200, await syncPrices());
      },
    },
    {
      path: '/api/cost-meter/prices',
      handler: async (req, res) => {
        if (req.method === 'GET') {
          return sendJson(res, 200, { prices: prices(), currency: currency() });
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
          try {
            const next = normalizePrices(body.prices);
            await settingsScope?.update({ prices: next });
            sendJson(res, 200, { ok: true, prices: next });
          } catch (error) {
            sendJson(res, 400, { error: String(error?.message ?? error) });
          }
          return;
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

  await backfill();

  // 余额自动刷新：启动时立即拉取一次，之后每 5 分钟刷新缓存。
  fetchBalance().catch(() => {});
  const balanceTimer = setInterval(() => {
    fetchBalance().catch(() => {});
  }, 5 * 60 * 1000);

  // ctx.effect 的回调会立即执行，返回值才是卸载期的 disposer。
  ctx.effect(() => {
    return () => {
      clearInterval(balanceTimer);
      offEvents();
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
