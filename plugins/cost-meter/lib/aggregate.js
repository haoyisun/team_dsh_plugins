/**
 * dsh-cost-meter 聚合模块（Node 半内部模块）。
 *
 * 纯函数、不依赖宿主服务，因此可被 `node --test` 直接覆盖。职责：
 *  - 把原始用量样本按「今日 / 本周 / 本月 / 累计 / 每日 / 按模型」聚合；
 *  - 提供统一的日历键与周期起点计算，基准是**可配置的日界偏移**
 *    （`dayOffsetMinutes`，默认 480 = 北京时间）。
 *
 * 为什么日界要独立于进程时区：费用统计的峰谷规则由官方定义在北京时间，
 * 而 `Date` 的本地时区取自宿主机（WSL / 容器 / 云主机常常是 UTC），浏览器
 * 又是第三个时区。三者混用时「今日」的边界和前端柱状图的日期键会对不上，
 * 因此这里只用一个显式偏移做日历运算，并把算好的日期键交给客户端复用。
 *
 * 价格表在聚合开始时解析一次后传入，避免每个样本重复解析（原实现每个样本
 * 最多调用 6 次价格解析）。
 */

/** 一天的毫秒数。 */
const DAY_MS = 86_400_000;

/** 补零到两位。 */
function pad2(value) {
  return String(value).padStart(2, '0');
}

/** 把时间戳平移到目标日界的日历帧（该帧内的 UTC 字段即目标时区的本地字段）。 */
function shift(time, offsetMinutes) {
  return time + offsetMinutes * 60_000;
}

/**
 * 某个时间戳在给定日界偏移下的日期键（YYYY-MM-DD）。
 * @param time - epoch 毫秒。
 * @param offsetMinutes - 日界偏移（分钟，东为正）。
 * @returns 日期键。
 */
export function dayKey(time, offsetMinutes) {
  const d = new Date(shift(time, offsetMinutes));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** 该日界下「当日 00:00」的时间戳。 */
export function startOfDay(time, offsetMinutes) {
  const d = new Date(shift(time, offsetMinutes));
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - offsetMinutes * 60_000;
}

/** 该日界下「本周一 00:00」的时间戳。 */
export function startOfWeek(time, offsetMinutes) {
  const d = new Date(shift(time, offsetMinutes));
  const dow = (d.getUTCDay() + 6) % 7; // 周一 = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow) - offsetMinutes * 60_000;
}

/** 该日界下「本月 1 日 00:00」的时间戳。 */
export function startOfMonth(time, offsetMinutes) {
  const d = new Date(shift(time, offsetMinutes));
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - offsetMinutes * 60_000;
}

/**
 * 最近 `count` 天的日期键（含当天），按时间升序。
 * 客户端直接用这份键渲染柱状图，不再自行做时区运算。
 */
export function recentDayKeys(time, offsetMinutes, count) {
  const todayStart = startOfDay(time, offsetMinutes);
  const keys = [];
  for (let i = count - 1; i >= 0; i--) keys.push(dayKey(todayStart - i * DAY_MS, offsetMinutes));
  return keys;
}

/** 空聚合桶。 */
export function emptyBucket() {
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

/**
 * 把样本累加进聚合桶。
 * @param bucket - 目标桶（就地修改）。
 * @param sample - 用量样本。
 * @param prices - **已解析**的价格表（每次聚合只解析一次）。
 * @param compute - 计费函数 `(prices, sample) => {cost, priced}`，由调用方注入以保持本模块无依赖。
 */
export function accumulate(bucket, sample, prices, compute) {
  const { cost, priced } = compute(prices, sample);
  bucket.calls += 1;
  bucket.inputTokens += sample.inputTokens;
  bucket.outputTokens += sample.outputTokens;
  bucket.cacheReadTokens += sample.cacheReadTokens ?? 0;
  bucket.cacheWriteTokens += sample.cacheWriteTokens ?? 0;
  bucket.cost += cost;
  if (!priced) bucket.unpriced = true;
  return bucket;
}

/**
 * 由样本集合构建完整统计数据。
 *
 * @param options.samples - 样本可迭代对象（`[key, sample]` 或裸 sample 均可）。
 * @param options.prices - 已归一化的价格表。
 * @param options.compute - 计费函数 `(prices, sample) => {cost, priced, peak}`。
 * @param options.currency - 展示币种。
 * @param options.now - 当前时间（epoch 毫秒）。
 * @param options.offsetMinutes - 日界偏移（分钟）。
 * @param options.dayCount - 返回的最近日期键数量。
 * @returns 统计数据（不含宿主相关的余额与同步元信息）。
 */
export function buildStats({ samples, prices, compute, currency, now, offsetMinutes, dayCount = 14 }) {
  const todayKey = dayKey(now, offsetMinutes);
  const todayStart = startOfDay(now, offsetMinutes);
  const weekStart = startOfWeek(now, offsetMinutes);
  const monthStart = startOfMonth(now, offsetMinutes);

  const today = emptyBucket();
  const week = emptyBucket();
  const month = emptyBucket();
  const total = emptyBucket();
  const daily = new Map();
  const byModel = new Map();
  let earliest = Infinity;
  let count = 0;

  for (const entry of samples) {
    const sample = Array.isArray(entry) ? entry[1] : entry;
    if (sample === undefined || sample === null) continue;
    count += 1;
    if (sample.time < earliest) earliest = sample.time;
    const key = dayKey(sample.time, offsetMinutes);
    if (key === todayKey) accumulate(today, sample, prices, compute);
    if (sample.time >= weekStart) accumulate(week, sample, prices, compute);
    if (sample.time >= monthStart) accumulate(month, sample, prices, compute);
    accumulate(total, sample, prices, compute);
    let day = daily.get(key);
    if (day === undefined) {
      day = emptyBucket();
      daily.set(key, day);
    }
    accumulate(day, sample, prices, compute);
    let model = byModel.get(sample.model);
    if (model === undefined) {
      model = { ...emptyBucket(), model: sample.model };
      byModel.set(sample.model, model);
    }
    accumulate(model, sample, prices, compute);
  }

  const dailyList = [...daily.entries()]
    .map(([date, bucket]) => ({ date, ...bucket }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const modelList = [...byModel.values()].sort((a, b) => b.cost - a.cost);

  return {
    currency,
    prices,
    now,
    dayOffsetMinutes: offsetMinutes,
    todayKey,
    dayKeys: recentDayKeys(now, offsetMinutes, dayCount),
    since: Number.isFinite(earliest) ? earliest : undefined,
    sampleCount: count,
    periods: { today, week, month, total },
    daily: dailyList,
    byModel: modelList,
  };
}
