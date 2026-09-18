import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildStats,
  dayKey,
  recentDayKeys,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '../plugins/cost-meter/lib/aggregate.js';
import {
  backfillStartSeq,
  isPathSafeKey,
  legacySampleKey,
  liveSampleKey,
  planSessionSamples,
  sampleKey,
} from '../plugins/cost-meter/lib/backfill.js';
import { tapUsage } from '../plugins/cost-meter/lib/llm-usage.js';
import {
  OFFICIAL_PRICES,
  computeCost,
  isBeijingPeak,
  normalizeModelId,
  normalizePriceRows,
  parsePricingHtml,
  priceRowFor,
  validatePriceRows,
} from '../plugins/cost-meter/lib/pricing.js';

/**
 * 官方定价页表格的最小复刻（单元格文本与真实页面一致）。
 * 模型名带 `<sup>(n)</sup>` 脚注标记——2026-09 起的页面结构，
 * 旧版解析器会把标记当成模型名的一部分。
 */
const PRICING_HTML = `<html><body><table>
<tr><td colspan="3">模型</td><td>deepseek-flash<sup>(1)</sup></td><td>deepseek-v4-pro<sup>(2)</sup></td></tr>
<tr><td>价格 (3)</td><td>百万tokens输入 （缓存命中）</td><td>空闲时段</td><td>0.02元</td><td>0.15元</td></tr>
<tr><td>高峰时段</td><td>0.04元</td><td>0.30元</td></tr>
<tr><td>百万tokens输入 （缓存未命中）</td><td>空闲时段</td><td>1元</td><td>4.5元</td></tr>
<tr><td>高峰时段</td><td>2元</td><td>9.0元</td></tr>
<tr><td>百万tokens输出</td><td>空闲时段</td><td>4元</td><td>13.5元</td></tr>
<tr><td>高峰时段</td><td>8元</td><td>27.0元</td></tr>
</table></body></html>`;

/** 不带脚注标记的旧版页面结构。 */
const LEGACY_PRICING_HTML = PRICING_HTML.replace(/<sup>\(\d\)<\/sup>/g, '');

/** 北京时间的某个时刻（传入北京本地年月日时分）→ epoch 毫秒。 */
function beijing(year, month, day, hour, minute = 0) {
  return Date.UTC(year, month - 1, day, hour - 8, minute);
}

/** 2026-09-14 是周一，2026-09-19 是周六。 */
const MONDAY_10 = beijing(2026, 9, 14, 10);
const MONDAY_20 = beijing(2026, 9, 14, 20);
const SATURDAY_10 = beijing(2026, 9, 19, 10);

test('parsePricingHtml strips superscript footnote markers from model ids', () => {
  const rows = parsePricingHtml(PRICING_HTML);

  assert.deepEqual(rows.map((row) => row.model), ['deepseek-flash', 'deepseek-v4-pro']);
  assert.deepEqual(rows[0], {
    model: 'deepseek-flash',
    inputPerM: 1,
    cacheReadPerM: 0.02,
    cacheWritePerM: 0,
    outputPerM: 4,
    peakInputPerM: 2,
    peakCacheReadPerM: 0.04,
    peakCacheWritePerM: 0,
    peakOutputPerM: 8,
  });
  assert.deepEqual(rows[1], {
    model: 'deepseek-v4-pro',
    inputPerM: 4.5,
    cacheReadPerM: 0.15,
    cacheWritePerM: 0,
    outputPerM: 13.5,
    peakInputPerM: 9,
    peakCacheReadPerM: 0.3,
    peakCacheWritePerM: 0,
    peakOutputPerM: 27,
  });
});

test('parsePricingHtml still parses a page without footnote markers', () => {
  assert.deepEqual(
    parsePricingHtml(LEGACY_PRICING_HTML).map((row) => row.model),
    ['deepseek-flash', 'deepseek-v4-pro'],
  );
});

test('parsePricingHtml rejects an unrecognized table', () => {
  assert.throws(() => parsePricingHtml('<html><body>no table</body></html>'), /no table/);
  assert.throws(() => parsePricingHtml('<table><tr><td>x</td></tr></table>'), /shape unexpected/);
});

test('normalizeModelId removes trailing footnote markers only', () => {
  assert.equal(normalizeModelId('deepseek-flash (1)'), 'deepseek-flash');
  assert.equal(normalizeModelId('deepseek-v4-pro (2)'), 'deepseek-v4-pro');
  assert.equal(normalizeModelId('deepseek-v4-pro（2）'), 'deepseek-v4-pro');
  assert.equal(normalizeModelId('deepseek-v4-pro [3]'), 'deepseek-v4-pro');
  assert.equal(normalizeModelId('deepseek-flash'), 'deepseek-flash');
  assert.equal(normalizeModelId('deepseek-v3'), 'deepseek-v3');
  assert.equal(normalizeModelId('deepseek-v4.1-flash'), 'deepseek-v4.1-flash');
});

test('priceRowFor resolves the documented legacy model aliases', () => {
  const prices = [
    { model: 'deepseek-flash', inputPerM: 1, cacheReadPerM: 0.02, cacheWritePerM: 0, outputPerM: 4 },
  ];

  assert.equal(priceRowFor(prices, 'deepseek-v4-flash')?.model, 'deepseek-flash');
  assert.equal(priceRowFor(prices, 'deepseek-v4-flash-vision-exp')?.model, 'deepseek-flash');
  assert.equal(priceRowFor(prices, 'deepseek-flash')?.model, 'deepseek-flash');
  assert.equal(priceRowFor(prices, 'deepseek-unknown'), undefined);
});

test('priceRowFor prefers an explicit row over an alias and falls back to the wildcard', () => {
  const explicit = [
    { model: 'deepseek-flash', inputPerM: 1, cacheReadPerM: 0.02, cacheWritePerM: 0, outputPerM: 4 },
    { model: 'deepseek-v4-flash', inputPerM: 9, cacheReadPerM: 9, cacheWritePerM: 0, outputPerM: 9 },
  ];
  assert.equal(priceRowFor(explicit, 'deepseek-v4-flash')?.inputPerM, 9);

  const wildcard = [
    { model: '*', inputPerM: 1, cacheReadPerM: 0.02, cacheWritePerM: 0, outputPerM: 4 },
  ];
  assert.equal(priceRowFor(wildcard, 'deepseek-unknown')?.model, '*');
  assert.equal(priceRowFor(wildcard, 'deepseek-v4-flash')?.model, '*');
});

test('priceRowFor tolerates price rows stored with a footnote marker', () => {
  const stored = [
    { model: 'deepseek-flash (1)', inputPerM: 1, cacheReadPerM: 0.02, cacheWritePerM: 0, outputPerM: 4 },
  ];
  assert.equal(priceRowFor(stored, 'deepseek-flash')?.inputPerM, 1);
});

test('built-in price table matches the current official models', () => {
  assert.deepEqual(OFFICIAL_PRICES.map((row) => row.model), ['deepseek-flash', 'deepseek-v4-pro']);
});

test('computeCost prices both the current and the legacy flash model id', () => {
  const sample = {
    model: 'deepseek-flash',
    time: MONDAY_20,
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  const current = computeCost(OFFICIAL_PRICES, sample);
  assert.equal(current.priced, true);
  assert.equal(current.peak, false);
  assert.equal(current.cost, 5); // 1×1 + 1×4

  const legacy = computeCost(OFFICIAL_PRICES, { ...sample, model: 'deepseek-v4-flash' });
  assert.equal(legacy.priced, true);
  assert.equal(legacy.cost, 5);
});

test('computeCost charges peak prices on weekday peak hours only', () => {
  const sample = {
    model: 'deepseek-flash',
    time: MONDAY_10,
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  const peak = computeCost(OFFICIAL_PRICES, sample);
  assert.equal(peak.peak, true);
  assert.equal(peak.cost, 10); // 1×2 + 1×8

  const weekend = computeCost(OFFICIAL_PRICES, { ...sample, time: SATURDAY_10 });
  assert.equal(weekend.peak, false);
  assert.equal(weekend.cost, 5);
});

test('computeCost reports unpriced models as zero cost', () => {
  const result = computeCost(OFFICIAL_PRICES, {
    model: 'some-other-model',
    time: MONDAY_20,
    inputTokens: 1_000_000,
    outputTokens: 0,
  });
  assert.deepEqual(result, { cost: 0, priced: false, peak: false });
});

test('isBeijingPeak follows the weekday 9-12 and 14-18 windows', () => {
  assert.equal(isBeijingPeak(beijing(2026, 9, 14, 8, 59)), false);
  assert.equal(isBeijingPeak(beijing(2026, 9, 14, 9)), true);
  assert.equal(isBeijingPeak(beijing(2026, 9, 14, 11, 59)), true);
  assert.equal(isBeijingPeak(beijing(2026, 9, 14, 12)), false);
  assert.equal(isBeijingPeak(beijing(2026, 9, 14, 13, 59)), false);
  assert.equal(isBeijingPeak(beijing(2026, 9, 14, 14)), true);
  assert.equal(isBeijingPeak(beijing(2026, 9, 14, 17, 59)), true);
  assert.equal(isBeijingPeak(beijing(2026, 9, 14, 18)), false);
  assert.equal(isBeijingPeak(beijing(2026, 9, 18, 17)), true); // 周五
  assert.equal(isBeijingPeak(SATURDAY_10), false);
  assert.equal(isBeijingPeak(beijing(2026, 9, 20, 15)), false); // 周日
  assert.equal(isBeijingPeak(beijing(2026, 9, 21, 10)), true); // 下周一
});

/* ── 价格行归一化与校验 ───────────────────────────────────────────────────── */

test('normalizePriceRows strips footnote markers without mutating the input', () => {
  const input = [{ model: 'deepseek-flash (1)', inputPerM: 1 }];
  const output = normalizePriceRows(input);
  assert.equal(output[0].model, 'deepseek-flash');
  assert.equal(input[0].model, 'deepseek-flash (1)');
});

test('validatePriceRows rejects empty and duplicate model ids', () => {
  const parse = (row) => ({ cacheWritePerM: 0, ...row });

  assert.throws(() => validatePriceRows([{ model: '  ' }], parse), /must not be empty/);
  assert.throws(
    () => validatePriceRows([{ model: 'deepseek-flash' }, { model: 'deepseek-flash (1)' }], parse),
    /duplicate model "deepseek-flash"/,
  );
  assert.throws(() => validatePriceRows('nope', parse), /must be an array/);
  assert.throws(() => validatePriceRows([null], parse), /must be an object/);
});

test('validatePriceRows normalizes ids and falls peak fields back to the idle price', () => {
  const parse = (row) => ({ cacheWritePerM: 0, ...row });
  const rows = validatePriceRows(
    [{ model: 'deepseek-flash (1)', inputPerM: 1, cacheReadPerM: 0.02, outputPerM: 4 }],
    parse,
  );
  assert.deepEqual(rows, [
    {
      model: 'deepseek-flash',
      inputPerM: 1,
      cacheReadPerM: 0.02,
      cacheWritePerM: 0,
      outputPerM: 4,
      peakInputPerM: 1,
      peakCacheReadPerM: 0.02,
      peakCacheWritePerM: 0,
      peakOutputPerM: 4,
    },
  ]);
});

/* ── 日历与聚合 ───────────────────────────────────────────────────────────── */

test('day boundaries follow the configured offset, not the process timezone', () => {
  // 2026-09-18T18:00Z：北京（+480）已是 19 日 02:00，UTC 仍是 18 日。
  const time = Date.UTC(2026, 8, 18, 18, 0, 0);
  assert.equal(dayKey(time, 480), '2026-09-19');
  assert.equal(dayKey(time, 0), '2026-09-18');
  assert.equal(startOfDay(time, 480), Date.UTC(2026, 8, 18, 16, 0, 0));
  assert.equal(startOfDay(time, 0), Date.UTC(2026, 8, 18, 0, 0, 0));
});

test('week and month starts are computed in the offset frame', () => {
  // 2026-09-20 是周日；北京时间的当周周一是 09-14。
  const sunday = Date.UTC(2026, 8, 20, 6, 0, 0);
  assert.equal(dayKey(startOfWeek(sunday, 480), 480), '2026-09-14');
  assert.equal(dayKey(startOfMonth(sunday, 480), 480), '2026-09-01');

  // 北京时间 09-01 00:30 落在 UTC 的 08-31，月界必须按 +480 判定。
  const monthStartBeijing = Date.UTC(2026, 7, 31, 16, 30, 0);
  assert.equal(dayKey(startOfMonth(monthStartBeijing, 480), 480), '2026-09-01');
});

test('recentDayKeys returns ascending keys ending today', () => {
  const keys = recentDayKeys(Date.UTC(2026, 8, 18, 18, 0, 0), 480, 3);
  assert.deepEqual(keys, ['2026-09-17', '2026-09-18', '2026-09-19']);
});

test('buildStats buckets samples by day, week, month and model', () => {
  const prices = [{ model: 'm', inputPerM: 1, cacheReadPerM: 0, cacheWritePerM: 0, outputPerM: 1 }];
  const now = Date.UTC(2026, 8, 18, 12, 0, 0); // 北京 09-18 20:00（空闲档）
  const samples = [
    { model: 'm', time: now, inputTokens: 1_000_000, outputTokens: 0 },
    { model: 'm', time: Date.UTC(2026, 8, 17, 12, 0, 0), inputTokens: 1_000_000, outputTokens: 0 },
    { model: 'other', time: now, inputTokens: 1_000_000, outputTokens: 0 },
    { model: 'm', time: Date.UTC(2026, 7, 1, 12, 0, 0), inputTokens: 1_000_000, outputTokens: 0 },
  ];

  const stats = buildStats({ samples, prices, compute: computeCost, currency: 'CNY', now, offsetMinutes: 480 });

  assert.equal(stats.todayKey, '2026-09-18');
  assert.deepEqual(stats.dayKeys.slice(-2), ['2026-09-17', '2026-09-18']);
  assert.equal(stats.sampleCount, 4);
  assert.equal(stats.periods.today.calls, 2);
  // 只有 'm' 有单价行：1M 输入 × 1 元/M；'other' 未定价按 0 计。
  assert.equal(stats.periods.today.cost, 1);
  assert.equal(stats.periods.today.unpriced, true); // 'other' 无单价行
  assert.equal(stats.periods.month.calls, 3); // 8 月那条不算本月
  assert.equal(stats.periods.total.calls, 4);
  assert.equal(stats.byModel[0].model, 'm');
  assert.equal(stats.byModel[0].cost, 3);
  assert.equal(stats.daily.length, 3);
  assert.equal(stats.dayOffsetMinutes, 480);
});

test('buildStats resolves the price table once for the whole aggregation', () => {
  let resolutions = 0;
  const prices = [{ model: 'm', inputPerM: 1, cacheReadPerM: 0, cacheWritePerM: 0, outputPerM: 1 }];
  const compute = (table, sample) => {
    resolutions += 1;
    return computeCost(table, sample);
  };
  const now = Date.UTC(2026, 8, 18, 12, 0, 0);
  buildStats({
    samples: [
      { model: 'm', time: now, inputTokens: 1, outputTokens: 1 },
      { model: 'm', time: now, inputTokens: 1, outputTokens: 1 },
    ],
    prices,
    compute,
    currency: 'CNY',
    now,
    offsetMinutes: 480,
  });
  // 每个样本被计入 today/week/month/total/当日/按模型 6 次，但价格表只解析一次。
  assert.equal(resolutions, 12);
});

/* ── 样本键与回填折叠 ─────────────────────────────────────────────────────── */

test('sample keys are path-safe for the per-record storage layout', () => {
  const sessionId = 'session-5f296f8c-fc18-4ad2-9c3d-f93b749d4825';
  const key = sampleKey(sessionId, 1234);
  assert.equal(isPathSafeKey(key), true);
  assert.equal(isPathSafeKey(legacySampleKey(sessionId, 1234)), false);
  assert.equal(legacySampleKey(sessionId, 1234), `${sessionId}:1234`);
  assert.equal(isPathSafeKey('session-a_1'), true);
  assert.equal(isPathSafeKey(''), false);
  assert.equal(isPathSafeKey(undefined), false);
});

test('backfillStartSeq only trusts a cursor that carries the route context', () => {
  assert.equal(backfillStartSeq(undefined), 0);
  assert.equal(backfillStartSeq({ seq: 10, at: 1 }), 0); // 旧游标缺 provider/model
  assert.equal(backfillStartSeq({ seq: 10, at: 1, provider: 'unknown', model: 'unknown' }), 0);
  assert.equal(backfillStartSeq({ seq: 10, at: 1, provider: 'p', model: 'm' }), 11);
});

/** 构造一个最小事件序列：请求上下文 + 一条带 usage 的 assistant 消息。 */
function sessionEvents() {
  return [
    { seq: 1, type: 'request/context', data: { provider: 'deepseek-official', model: 'deepseek-flash' } },
    {
      seq: 2,
      type: 'assistant/message',
      time: 1_700_000_000_000,
      data: { usage: { inputTokens: 100, outputTokens: 20 }, message: {} },
    },
    { seq: 3, type: 'tool/result', data: { message: {} } },
    {
      seq: 4,
      type: 'assistant/message',
      time: 1_700_000_010_000,
      data: { usage: { inputTokens: 200, outputTokens: 40 }, message: {} },
    },
  ];
}

test('planSessionSamples folds route context and emits one sample per usage event', () => {
  const { inserts, cursor } = planSessionSamples({
    sessionId: 's1',
    events: sessionEvents(),
    now: 42,
  });

  assert.deepEqual(inserts.map((entry) => entry.key), ['s1_2', 's1_4']);
  assert.deepEqual(inserts[0].value, {
    sessionId: 's1',
    seq: 2,
    time: 1_700_000_000_000,
    provider: 'deepseek-official',
    model: 'deepseek-flash',
    inputTokens: 100,
    outputTokens: 20,
    cacheReadTokens: undefined,
    cacheWriteTokens: undefined,
  });
  assert.deepEqual(cursor, { seq: 4, at: 42, provider: 'deepseek-official', model: 'deepseek-flash' });
});

test('planSessionSamples seeds the route context from the cursor on an incremental read', () => {
  // 增量区间内没有 request/* 事件：必须由游标播种，否则 model 会退化成 unknown。
  const { inserts, cursor } = planSessionSamples({
    sessionId: 's1',
    events: [
      {
        seq: 11,
        type: 'assistant/message',
        time: 1_700_000_020_000,
        data: { usage: { inputTokens: 5, outputTokens: 1 }, message: {} },
      },
    ],
    cursor: { seq: 10, at: 1, provider: 'deepseek-official', model: 'deepseek-flash' },
  });

  assert.equal(inserts[0].value.model, 'deepseek-flash');
  assert.equal(inserts[0].value.provider, 'deepseek-official');
  assert.equal(cursor.seq, 11);
});

test('planSessionSamples skips samples already stored under either key format', () => {
  const stored = new Map([
    ['s1_2', { model: 'deepseek-flash' }],
    ['s1:4', { model: 'deepseek-flash' }],
  ]);
  const { inserts } = planSessionSamples({
    sessionId: 's1',
    events: sessionEvents(),
    findStored: (_sessionId, seq) => stored.get(`s1_${seq}`) ?? stored.get(`s1:${seq}`),
  });
  assert.deepEqual(inserts, []);
});

test('planSessionSamples re-records a sample whose model was folded to unknown', () => {
  const stored = new Map([['s1_2', { model: 'unknown' }]]);
  const { inserts } = planSessionSamples({
    sessionId: 's1',
    events: sessionEvents(),
    findStored: (_sessionId, seq) => stored.get(`s1_${seq}`),
  });
  assert.deepEqual(inserts.map((entry) => entry.key), ['s1_2', 's1_4']);
  assert.equal(inserts[0].value.model, 'deepseek-flash');
});

test('planSessionSamples advances the cursor only when new events were seen', () => {
  const noNewEvents = planSessionSamples({
    sessionId: 's1',
    events: [],
    cursor: { seq: 4, at: 1, provider: 'p', model: 'm' },
  });
  assert.equal(noNewEvents.cursor, undefined);

  const noEventsAtAll = planSessionSamples({ sessionId: 's1', events: [] });
  assert.deepEqual(noEventsAtAll, { inserts: [], cursor: undefined });
});

test('planSessionSamples upgrades a cursor that lacked the route context', () => {
  // 旧游标只有 seq：这次全量读折叠出了上下文，即使没有新事件也必须回写游标，
  // 否则每次启动都会重复全量读同一份会话日志。
  const { inserts, cursor } = planSessionSamples({
    sessionId: 's1',
    events: sessionEvents(),
    cursor: { seq: 4, at: 1 },
    now: 7,
  });
  assert.deepEqual(inserts.map((entry) => entry.key), ['s1_2', 's1_4']);
  assert.deepEqual(cursor, { seq: 4, at: 7, provider: 'deepseek-official', model: 'deepseek-flash' });
});

test('planSessionSamples withholds a cursor when no route context was folded', () => {
  // 上下文为 unknown 的游标一旦被信任，后续增量样本会被污染成 unknown，
  // 因此这类会话永远走全量读、不记游标。
  const { cursor } = planSessionSamples({
    sessionId: 's1',
    events: [
      { seq: 5, type: 'assistant/message', time: 1, data: { usage: { inputTokens: 1, outputTokens: 1 }, message: {} } },
    ],
  });
  assert.equal(cursor, undefined);
});

/* ── 插件 Config ──────────────────────────────────────────────────────────── */

test('plugin config defaults the day boundary to Beijing time and zeroes price defaults', async () => {
  const { Config } = await import('../plugins/cost-meter/lib/index.js');

  const defaults = Config({});
  assert.equal(defaults.dayOffsetMinutes, 480);
  assert.equal(defaults.currency, 'CNY');
  assert.equal(defaults.apiKeyEnv, 'DEEPSEEK_API_KEY');

  // 缺字段的价格行不再静默继承上一代官方价，避免"配错模型名却按旧价计费"。
  const [row] = Config({ prices: [{ model: 'x' }] }).prices;
  assert.equal(row.inputPerM, 0);
  assert.equal(row.outputPerM, 0);
  assert.equal(row.cacheReadPerM, 0);
  assert.equal(row.peakInputPerM, undefined);
});

/* ── 宿主接线（假 ctx 集成测试）───────────────────────────────────────────── */

/** 极简 storage-domain 域替身：内存表 + 域级 singleton + 记录调用。 */
function fakeDomain() {
  const tables = new Map();
  const handle = (name) => {
    if (!tables.has(name)) tables.set(name, new Map());
    const data = tables.get(name);
    return {
      get: (key) => data.get(key),
      put: async (key, value) => {
        data.set(key, value);
      },
      delete: async (key) => data.delete(key),
      entries: () => data.entries(),
      keys: () => data.keys(),
      get size() {
        return data.size;
      },
    };
  };
  let globalValue = {};
  const globalHandle = {
    get: () => globalValue,
    set: async (value) => {
      globalValue = value;
    },
  };
  return {
    handle,
    table: handle,
    global: globalHandle,
    async open() {
      return { table: handle, global: globalHandle, close: async () => {} };
    },
  };
}

/**
 * 用假 ctx 跑一次 apply()：锁定宿主接线，尤其是回填必须走服务契约里的
 * `list()` / `open(id, 'read')` / `handle.read(seq)` / `close()`。
 * 早期实现调用已不存在的 `persistence.readFrom(...)`，正是这段代码静默失效的原因。
 */
async function runPlugin({ persistence, config, seed, seedGlobal, storageDomain, domain: providedDomain, failListeners }) {
  const { apply } = await import('../plugins/cost-meter/lib/index.js');
  const domain = providedDomain ?? fakeDomain();
  if (seedGlobal !== undefined) await domain.global.set(seedGlobal);
  if (seed !== undefined) for (const [tableName, entries] of Object.entries(seed)) for (const [key, value] of entries) await domain.table(tableName).put(key, value);
  const routes = new Map();
  const opened = [];
  const closed = [];
  const logs = [];
  const cleanups = [];
  const listeners = [];

  const settingsValue = {
    prices: [{ model: 'deepseek-flash', inputPerM: 1, cacheReadPerM: 0.02, cacheWritePerM: 0, outputPerM: 4 }],
    currency: 'CNY',
    dayOffsetMinutes: 480,
    lastSyncAt: 1,
    lastSyncSource: 'remote',
    lastSyncError: '',
  };

  const settingsWrites = [];

  const ctx = {
    logger: {
      warn: (message) => logs.push(String(message)),
      error: (message) => logs.push(String(message)),
      info: () => {},
    },
    settings: {
      register: () => ({ get: () => settingsValue, update: async () => {}, replace: async () => {} }),
      describe: () => [{ ns: 'cost-meter', revision: 7 }],
      update: async (ns, patch, revision) => {
        settingsWrites.push({ ns, patch, revision });
      },
    },
    storageDomain: storageDomain ?? domain,
    webServer: {
      host: '127.0.0.1',
      register: (route) => {
        routes.set(route.path, route.handler);
        return () => routes.delete(route.path);
      },
    },
    get: (serviceName) => (serviceName === 'sessionPersistence' ? persistence : undefined),
    on: (eventName, listener, options) => {
      if (failListeners === true) throw new Error('listener registration refused');
      listeners.push({ eventName, listener, options });
      return () => {};
    },
    effect: (callback) => {
      cleanups.push(callback());
    },
  };

  await apply(ctx, { apiKeyEnv: 'COST_METER_TEST_ABSENT_KEY', ...config });

  return {
    domain,
    routes,
    opened,
    closed,
    logs,
    listeners,
    settingsWrites,
    global: domain.global,
    samples: domain.table('samples'),
    scans: domain.table('scans'),
    settingsValue,
    dispose: () => {
      for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup();
    },
  };
}

/**
 * 等启动期工作（键迁移 + 回填）收尾。
 * 它不阻塞插件激活，而统计路由会等待它——所以请求一次 stats 就是就绪屏障。
 */
async function settle(run) {
  return request(run, '/api/cost-meter/stats', 'GET');
}

function sessionLog() {
  return [
    { seq: 0, type: 'request/context', data: { provider: 'deepseek-official', model: 'deepseek-flash' } },
    { seq: 1, type: 'user/message', data: { message: {} } },
    {
      seq: 2,
      type: 'assistant/message',
      time: Date.UTC(2026, 8, 18, 4, 0, 0),
      data: { usage: { inputTokens: 1_000_000, outputTokens: 0 }, message: {} },
    },
  ];
}

test('apply() backfills through the documented open/read handle API', async () => {
  const events = sessionLog();
  const opened = [];
  const closed = [];
  const persistence = {
    async list() {
      return [{ header: { id: 'session-a' }, revision: 1 }];
    },
    async open(id, access) {
      opened.push([id, access]);
      return {
        id,
        access,
        async read(offset) {
          return { eventState: 'shared', events: events.filter((event) => event.seq >= offset) };
        },
        async close() {
          closed.push(id);
        },
      };
    },
  };

  const run = await runPlugin({ persistence });

  // 启动期工作不再阻塞激活，先等它就绪再断言。
  const stats = await settle(run);

  assert.deepEqual(opened, [['session-a', 'read']]);
  assert.deepEqual(closed, ['session-a']);

  // 样本写入当前（path-safe）键格式，并带上折叠出的路由上下文。
  const sample = run.samples.get('session-a_2');
  assert.equal(sample.model, 'deepseek-flash');
  assert.equal(sample.provider, 'deepseek-official');
  assert.equal(sample.inputTokens, 1_000_000);

  // 游标回写为带上下文的形态，下次启动才能只读增量。
  assert.deepEqual(run.scans.get('session-a'), {
    seq: 2,
    at: run.scans.get('session-a').at,
    provider: 'deepseek-official',
    model: 'deepseek-flash',
  });

  // 统计接口按当前价格算出费用（1M 输入 × 1 元/M = 1）。
  assert.equal(stats.status, 200);
  assert.equal(stats.body.sampleCount, 1);
  assert.equal(stats.body.periods.total.cost, 1);
  assert.equal(stats.body.periods.total.unpriced, false);
  assert.equal(stats.body.dayKeys.length, 14);
  assert.equal(stats.body.pricesMeta.lastSyncError, '');
  assert.equal(stats.body.balance.error, 'NO_API_KEY');

  run.dispose();
});

test('apply() skips backfill samples already stored under the legacy key format', async () => {
  const events = sessionLog();
  const persistence = {
    async list() {
      return [{ header: { id: 'session-a' }, revision: 1 }];
    },
    async open(id) {
      return {
        id,
        async read() {
          return { eventState: 'shared', events };
        },
        async close() {},
      };
    },
  };

  // 升级前已用历史键格式记录过同一事件：迁移会改写键，回填不得再写第二条。
  const run = await runPlugin({
    persistence,
    seed: {
      samples: [['session-a:2', { sessionId: 'session-a', seq: 2, time: 1, model: 'deepseek-flash' }]],
    },
  });

  const stats = await settle(run);
  assert.equal(run.samples.get('session-a:2'), undefined);
  assert.equal(run.samples.size, 1);
  assert.equal(run.samples.get('session-a_2').model, 'deepseek-flash');
  assert.equal(stats.body.sampleCount, 1);
  run.dispose();
});

test('apply() survives a persistence backend without the handle API', async () => {
  // 后端形状不符时只记日志并继续，不能让插件激活失败。
  const persistence = {
    async list() {
      return [{ header: { id: 'session-a' }, revision: 1 }];
    },
  };

  const run = await runPlugin({ persistence });
  const stats = await settle(run);

  assert.equal(run.samples.size, 0);
  assert.equal(run.logs.some((line) => line.includes('backfill read failed')), true);
  assert.equal(stats.status, 200);
  run.dispose();
});

/* ── 存储键迁移 ───────────────────────────────────────────────────────────── */

test('startup migration rewrites legacy sample keys to the path-safe format', async () => {
  const persistence = { async list() { return []; } };
  const legacy = [
    ['session-a:1', { sessionId: 'session-a', seq: 1, time: 1, model: 'deepseek-flash' }],
    ['session-b:7', { sessionId: 'session-b', seq: 7, time: 2, model: 'deepseek-flash' }],
    ['session-c_3', { sessionId: 'session-c', seq: 3, time: 3, model: 'deepseek-flash' }],
  ];

  const run = await runPlugin({ persistence, seed: { samples: legacy } });
  await settle(run);

  assert.equal(run.samples.size, 3);
  assert.deepEqual([...run.samples.keys()].sort(), ['session-a_1', 'session-b_7', 'session-c_3']);
  // 迁移只改键，不改记录内容。
  assert.deepEqual(run.samples.get('session-a_1'), {
    sessionId: 'session-a',
    seq: 1,
    time: 1,
    model: 'deepseek-flash',
  });
  // 标记写入域级 singleton，之后的启动直接跳过。
  assert.equal(typeof run.global.get().keysMigratedAt, 'number');
  run.dispose();
});

test('migration keeps a trustworthy record when both key formats exist', async () => {
  const persistence = { async list() { return []; } };
  const run = await runPlugin({
    persistence,
    seed: {
      samples: [
        // 同一事件：历史键那条件被污染成 unknown，新键那条是回填出的正确值。
        ['session-a:1', { sessionId: 'session-a', seq: 1, time: 1, model: 'unknown' }],
        ['session-a_1', { sessionId: 'session-a', seq: 1, time: 1, model: 'deepseek-flash' }],
      ],
    },
  });
  await settle(run);

  assert.equal(run.samples.size, 1);
  assert.equal(run.samples.get('session-a_1').model, 'deepseek-flash');
  run.dispose();
});

test('migration is skipped once the domain marker is set', async () => {
  const persistence = { async list() { return []; } };
  const run = await runPlugin({
    persistence,
    // 模拟上一次启动已完成迁移：标记必须在 apply() 之前就位。
    seedGlobal: { keysMigratedAt: 1 },
    seed: {
      samples: [['session-a:1', { sessionId: 'session-a', seq: 1, time: 1, model: 'deepseek-flash' }]],
    },
  });
  await settle(run);

  // 标记存在时不再动键（这条遗留记录本不该出现，正好证明迁移没有运行）。
  assert.equal(run.samples.get('session-a:1').model, 'deepseek-flash');
  assert.equal(run.samples.get('session-a_1'), undefined);
  run.dispose();
});

/* ── 回填的增量与自愈 ─────────────────────────────────────────────────────── */

/** 记录每次 read 的起始 seq，便于断言「只读了增量」还是「全量重读」。 */
function readTrackingPersistence(events) {
  const reads = [];
  return {
    reads,
    async list() {
      return [{ header: { id: 'session-a' }, revision: 1 }];
    },
    async open(id) {
      return {
        id,
        async read(offset) {
          reads.push(offset);
          return { eventState: 'shared', events: events.filter((event) => event.seq >= offset) };
        },
        async close() {},
      };
    },
  };
}

test('backfill reads only the increment when a trusted cursor and samples exist', async () => {
  const persistence = readTrackingPersistence(sessionLog());
  const run = await runPlugin({
    persistence,
    seed: {
      samples: [['session-a_2', { sessionId: 'session-a', seq: 2, time: 1, model: 'deepseek-flash' }]],
      scans: [['session-a', { seq: 2, at: 1, provider: 'deepseek-official', model: 'deepseek-flash' }]],
    },
  });
  await settle(run);

  assert.deepEqual(persistence.reads, [3]); // 游标 seq=2 → 从 3 起读
  assert.equal(run.samples.size, 1);
  run.dispose();
});

test('backfill re-derives everything when samples vanished but cursors survived', async () => {
  // 只剩游标的表若仍按增量读，历史将永不恢复（成因见实现注释）。
  const persistence = readTrackingPersistence(sessionLog());
  const run = await runPlugin({
    persistence,
    seed: {
      scans: [['session-a', { seq: 2, at: 1, provider: 'deepseek-official', model: 'deepseek-flash' }]],
    },
  });
  const stats = await settle(run);

  assert.deepEqual(persistence.reads, [0]);
  assert.equal(run.samples.get('session-a_2').model, 'deepseek-flash');
  assert.equal(stats.body.sampleCount, 1);
  assert.equal(run.logs.some((line) => line.includes('re-deriving')), true);
  run.dispose();
});

test('apply() falls back to the single layout when the per-record open fails', async () => {
  // 从迁移前的旧版本直接升级：per-record 的 bootstrap 拿含 ':' 的键当文件名而失败。
  // 此时必须退回 single 布局继续工作并完成键迁移，而不是让统计彻底停摆。
  const specs = [];
  const domain = fakeDomain();
  const storageDomain = {
    async open(spec) {
      specs.push(spec.layout ?? 'single');
      if (spec.layout === 'per-record') {
        throw new Error("EINVAL: invalid argument, rename 'x.tmp' -> 'samples/session-a:1.json'");
      }
      return { table: domain.table, global: domain.global, close: async () => {} };
    },
  };

  const run = await runPlugin({
    persistence: { async list() { return []; } },
    // 让播种、插件与断言共用同一个域替身实例。
    domain,
    storageDomain,
    seed: {
      samples: [['session-a:1', { sessionId: 'session-a', seq: 1, time: 1, model: 'deepseek-flash' }]],
    },
  });
  await settle(run);

  assert.deepEqual(specs, ['per-record', 'single']);
  assert.equal(run.logs.some((line) => line.includes('retrying with the single layout')), true);
  assert.equal(run.logs.some((line) => line.includes('restart DSH')), true);
  // 退回 single 后迁移照常完成。
  assert.equal(run.samples.get('session-a_1').model, 'deepseek-flash');
  run.dispose();
});

test('apply() answers sync-prices failures with a non-2xx status', async () => {
  const persistence = { async list() { return []; } };
  const run = await runPlugin({ persistence });

  // 未注册 settings 时同步必须失败：用不可用的 pricingUrl 模拟远程抓取失败时，
  // 仍会回退内置表并成功；这里直接验证价格写入接口的校验分支。
  const bad = await request(run, '/api/cost-meter/prices', 'POST', { prices: [{ model: '' }] });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /must not be empty/);

  const duplicate = await request(run, '/api/cost-meter/prices', 'POST', {
    prices: [{ model: 'deepseek-flash' }, { model: 'deepseek-flash (1)' }],
  });
  assert.equal(duplicate.status, 400);
  assert.match(duplicate.body.error, /duplicate model/);

  // 合法保存走带 revision 的写入路径，用于并发检测。
  const saved = await request(run, '/api/cost-meter/prices', 'POST', {
    prices: [{ model: 'deepseek-flash (1)', inputPerM: 2, cacheReadPerM: 0.04, outputPerM: 8 }],
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.prices[0].model, 'deepseek-flash');
  assert.equal(run.settingsWrites.length, 1);
  assert.equal(run.settingsWrites[0].ns, 'cost-meter');
  assert.equal(run.settingsWrites[0].revision, 7);
  assert.equal(run.settingsWrites[0].patch.prices[0].peakOutputPerM, 8); // 高峰缺省回退空闲价

  run.dispose();
});

/** 调用插件注册的路由，返回状态码与已解析的响应体。 */
async function request(run, path, method, body) {
  const handler = run.routes.get(path);
  assert.notEqual(handler, undefined, `route ${path} is not registered`);
  let status = 0;
  let payload = '';
  const res = {
    writeHead: (code) => {
      status = code;
    },
    end: (chunk) => {
      payload = chunk ?? '';
    },
  };
  const req = {
    method,
    on: (event, listener) => {
      if (event === 'data' && body !== undefined) listener(JSON.stringify(body));
      if (event === 'end') listener();
    },
  };
  await handler(req, res);
  return { status, body: payload.length > 0 ? JSON.parse(payload) : undefined };
}

/* ── 实时用量采集（llm/stream）────────────────────────────────────────────── */

/** 把 chunk 数组包成异步可迭代对象，模拟适配器的 chunk 流。 */
function asStream(chunks) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

/** 等一轮宏任务，让 fire-and-forget 的写入落地。 */
function settleMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('tapUsage passes every chunk through unchanged and reports usage', async () => {
  const chunks = [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: 'hi' },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 4 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ];
  const seen = [];
  const out = [];
  for await (const chunk of tapUsage(asStream(chunks), (usage) => seen.push(usage))) out.push(chunk);

  assert.deepEqual(out, chunks); // 顺序与内容都不变
  assert.deepEqual(seen, [{ inputTokens: 10, outputTokens: 2, cacheReadTokens: 4 }]);
});

test('tapUsage propagates stream failures instead of swallowing them', async () => {
  const stream = (async function* () {
    yield { type: 'text-delta', index: 0, text: 'a' };
    throw new Error('provider exploded');
  })();

  await assert.rejects(async () => {
    for await (const _chunk of tapUsage(stream, () => {})) void _chunk;
  }, /provider exploded/);
});

test('tapUsage contains observer failures so the model call survives', async () => {
  const chunks = [{ type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }, { type: 'finish', reason: { kind: 'stop' } }];
  const out = [];
  for await (const chunk of tapUsage(asStream(chunks), () => {
    throw new Error('observer failed');
  })) {
    out.push(chunk);
  }
  assert.deepEqual(out, chunks);
});

test('live sample keys are path-safe and live-prefixed', () => {
  const key = liveSampleKey('ab12cd34', 7);
  assert.equal(key, 'llm-ab12cd34_7');
  assert.equal(isPathSafeKey(key), true);
  // 两种键形式都是 `<前缀>_<序号>`，前缀互不相同即可避免碰撞；DSH 生成的会话 id
  // 一律是 `session-<uuid>` 或裸 uuid，不会以 `llm-` 开头。
  assert.equal(sampleKey('session-5f296f8c', 7).startsWith('llm-'), false);
});

test('planSessionSamples skips events at or after the history cutoff', () => {
  const events = sessionEvents(); // seq 2 @ 1_700_000_000_000；seq 4 @ 1_700_000_010_000
  const kept = planSessionSamples({ sessionId: 's1', events, cutoff: 1_700_000_005_000 });
  assert.deepEqual(kept.inserts.map((entry) => entry.key), ['s1_2']);

  const none = planSessionSamples({ sessionId: 's1', events, cutoff: 0 });
  assert.deepEqual(none.inserts, []);

  const all = planSessionSamples({ sessionId: 's1', events });
  assert.deepEqual(all.inserts.map((entry) => entry.key), ['s1_2', 's1_4']);
});

test('apply() records every llm/stream usage as a live sample', async () => {
  const run = await runPlugin({ persistence: { async list() { return []; } } });
  await settle(run);

  const hook = run.listeners.find((entry) => entry.eventName === 'llm/stream');
  assert.notEqual(hook, undefined, 'llm/stream listener must be registered');
  // 非全局监听器收不到其他作用域（子 agent、标题生成）发出的调用。
  assert.equal(hook.options?.global, true);

  const chunks = [
    { type: 'text-delta', index: 0, text: 'x' },
    { type: 'usage', usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 5 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ];
  const out = [];
  const stream = hook.listener(
    { provider: 'deepseek-official', model: 'deepseek-flash', sessionId: 'session-b', purpose: 'session-title' },
    () => asStream(chunks),
  );
  for await (const chunk of stream) out.push(chunk);
  assert.deepEqual(out, chunks);

  await settleMicrotasks();
  const entries = [...run.samples.entries()];
  assert.equal(entries.length, 1);
  const [key, record] = entries[0];
  assert.match(key, /^llm-[a-z0-9]+_1$/);
  assert.equal(record.model, 'deepseek-flash');
  assert.equal(record.provider, 'deepseek-official');
  assert.equal(record.sessionId, 'session-b');
  assert.equal(record.purpose, 'session-title');
  assert.equal(record.inputTokens, 100);
  assert.equal(record.outputTokens, 20);
  assert.equal(record.cacheReadTokens, 5);
  assert.equal(typeof record.time, 'number');

  // 统计把实时样本算进去：输入 100×1 + 输出 20×4 + 缓存命中 5×0.02 = 180.1 → ¥0.0001801
  const stats = await settle(run);
  assert.equal(stats.body.sampleCount, 1);
  assert.equal(stats.body.byModel[0].calls, 1);
  assert.ok(Math.abs(stats.body.periods.total.cost - 0.0001801) < 1e-9, String(stats.body.periods.total.cost));

  run.dispose();
});

test('apply() uses llm/stream as the only live source (no session/event listener)', async () => {
  const run = await runPlugin({ persistence: { async list() { return []; } } });
  assert.equal(run.listeners.some((entry) => entry.eventName === 'session/event'), false);
  run.dispose();
});

test('apply() records one sample per call even if the adapter repeats usage', async () => {
  const run = await runPlugin({ persistence: { async list() { return []; } } });
  await settle(run);
  const hook = run.listeners.find((entry) => entry.eventName === 'llm/stream');

  const chunks = [
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ];
  for await (const _chunk of hook.listener({ provider: 'p', model: 'deepseek-flash' }, () => asStream(chunks))) void _chunk;
  await settleMicrotasks();

  assert.equal(run.samples.size, 1);
  run.dispose();
});

test('apply() survives a failed llm/stream subscription without breaking activation', async () => {
  const domain = fakeDomain();
  const run = await runPlugin({
    persistence: { async list() { return []; } },
    domain,
    // 注册监听器抛错时：只能降级并记录，不能让插件激活失败。
    failListeners: true,
  });
  const stats = await settle(run);

  assert.equal(stats.status, 200);
  assert.equal(run.logs.some((line) => line.includes('llm/stream subscription failed')), true);
  run.dispose();
});

test('apply() pins the history cutoff once and reuses it across requests', async () => {
  const run = await runPlugin({ persistence: { async list() { return []; } } });
  await settle(run);

  const cutoff = run.global.get().historyCutoff;
  assert.equal(typeof cutoff, 'number');
  await settle(run);
  assert.equal(run.global.get().historyCutoff, cutoff);
  // 切点必须与键迁移标记共存，不能被彼此覆盖。
  assert.equal(typeof run.global.get().keysMigratedAt, 'number');
  run.dispose();
});

test('backfill leaves calls after the history cutoff to the live path', async () => {
  // 事件时间在切点之后：属于实时路径，回填必须跳过，否则会被计两次。
  const events = [
    { seq: 0, type: 'request/context', data: { provider: 'deepseek-official', model: 'deepseek-flash' } },
    {
      seq: 1,
      type: 'assistant/message',
      time: Date.now() + 3_600_000,
      data: { usage: { inputTokens: 1_000_000, outputTokens: 0 }, message: {} },
    },
  ];
  const run = await runPlugin({ persistence: readTrackingPersistence(events), seedGlobal: { historyCutoff: Date.now() } });
  const stats = await settle(run);

  assert.equal(run.samples.size, 0);
  assert.equal(stats.body.sampleCount, 0);
  run.dispose();
});
