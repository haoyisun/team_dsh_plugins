/**
 * dsh-cost-meter 定价模块（Node 半内部模块）。
 *
 * 负责：
 *  - 内置当前官方价格表（远程抓取失败时的兜底来源）；
 *  - 解析官方定价页（Docusaurus SSR HTML）中的模型价格表；
 *  - 按北京时间峰谷时段计价：高峰 = 9:00-12:00、14:00-18:00（官方规则），
 *    其余为空闲时段；空闲价 = 高峰价的一半（官方表格注释）。
 *
 * 价格单位：CNY / 100 万 tokens。
 */

/** 官方定价页 URL（中文版）。 */
export const OFFICIAL_PRICING_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing';

/**
 * 内置官方价格表（与定价页当前内容一致，作为远程抓取失败时的兜底）。
 * peak* 字段缺省时按空闲价计（即不分峰谷）。
 */
export const OFFICIAL_PRICES = [
  {
    model: 'deepseek-v4-flash',
    inputPerM: 1.5,
    cacheReadPerM: 0.05,
    cacheWritePerM: 0,
    outputPerM: 4.5,
    peakInputPerM: 3.0,
    peakCacheReadPerM: 0.1,
    peakCacheWritePerM: 0,
    peakOutputPerM: 9.0,
  },
  {
    model: 'deepseek-v4-pro',
    inputPerM: 4.5,
    cacheReadPerM: 0.15,
    cacheWritePerM: 0,
    outputPerM: 13.5,
    peakInputPerM: 9.0,
    peakCacheReadPerM: 0.3,
    peakCacheWritePerM: 0,
    peakOutputPerM: 27.0,
  },
];

/**
 * 判断某个时间戳（epoch ms）是否落在北京时间的官方高峰时段。
 * 高峰 = 北京 9:00-12:00、14:00-18:00（起始含、结束不含）。
 * @param time - epoch 毫秒。
 * @returns 是否高峰时段。
 */
export function isBeijingPeak(time) {
  // UTC+8 后直接读 UTC 小时即得北京小时。
  const shifted = new Date(time + 8 * 3600 * 1000);
  const hour = shifted.getUTCHours();
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

/** 取某模型单价行；支持 `*` 通配默认行。 */
export function priceRowFor(prices, model) {
  return prices.find((p) => p.model === model) ?? prices.find((p) => p.model === '*');
}

/**
 * 由样本 token 与价格表计算费用。按样本时间的北京峰谷自动选档：
 * 高峰用 peak* 单价，空闲用基础单价；peak* 缺省回退到基础单价（即不分峰谷）。
 * @param prices - 价格表（settings 中的 cost-meter.prices）。
 * @param sample - 用量样本（含 time 与各 token 桶）。
 * @returns 费用与计价事实。
 */
export function computeCost(prices, sample) {
  const row = priceRowFor(prices, sample.model);
  if (row === undefined) return { cost: 0, priced: false, peak: false };
  const peak = isBeijingPeak(sample.time);
  const input = peak ? (row.peakInputPerM ?? row.inputPerM) : row.inputPerM;
  const cacheRead = peak ? (row.peakCacheReadPerM ?? row.cacheReadPerM) : row.cacheReadPerM;
  const cacheWrite = peak ? (row.peakCacheWritePerM ?? row.cacheWritePerM) : row.cacheWritePerM;
  const output = peak ? (row.peakOutputPerM ?? row.outputPerM) : row.outputPerM;
  const cost =
    (sample.inputTokens * input +
      sample.outputTokens * output +
      (sample.cacheReadTokens ?? 0) * cacheRead +
      (sample.cacheWriteTokens ?? 0) * cacheWrite) /
    1e6;
  return { cost, priced: true, peak };
}

/** 从单元格文本解析价格数字（如 "0.05元"、"3.0"）。解析失败返回 null。 */
function parsePriceNumber(text) {
  const match = String(text).match(/(\d+(?:\.\d+)?)/);
  if (match === null) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

/** 剥掉 HTML 标签与实体，压缩空白。 */
function cleanCell(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * 解析官方定价页 HTML，提取模型价格表。
 *
 * 期望的表格结构（Docusaurus SSR 渲染）：
 *   [模型, deepseek-v4-flash, deepseek-v4-pro]
 *   [价格 (1), 百万tokens输入（缓存命中）, 空闲时段, 0.05元, 0.15元]
 *   [高峰时段, 0.10元, 0.30元]
 *   [百万tokens输入（缓存未命中）, 空闲时段, 1.5元, 4.5元]
 *   [高峰时段, 3.0元, 9.0元]
 *   [百万tokens输出, 空闲时段, 4.5元, 13.5元]
 *   [高峰时段, 9.0元, 27.0元]
 *
 * 解析失败（页面改版等）抛错，由调用方回退到内置官方价格表。
 * @param html - 定价页完整 HTML。
 * @returns 与 OFFICIAL_PRICES 同构的价格行数组。
 * @throws 结构不符合预期时抛出 Error。
 */
export function parsePricingHtml(html) {
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/);
  if (tableMatch === null) throw new Error('pricing page has no table');
  const table = tableMatch[1];
  if (!table.includes('缓存命中')) throw new Error('pricing table shape unexpected');

  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => cleanCell(cell[1]))
  );

  const modelRow = rows.find((row) => row[0] === '模型');
  if (modelRow === undefined) throw new Error('pricing table has no model row');
  const models = modelRow.slice(1).map((s) => s.trim()).filter((s) => s.length > 0);
  if (models.length === 0) throw new Error('pricing table has no models');

  const parsed = models.map((model) => ({
    model,
    inputPerM: null,
    cacheReadPerM: null,
    cacheWritePerM: 0,
    outputPerM: null,
    peakInputPerM: null,
    peakCacheReadPerM: null,
    peakCacheWritePerM: 0,
    peakOutputPerM: null,
  }));

  /** 把某一行空闲时段的价格数字填进 parsed[m][field]。 */
  const applyOffPeak = (row, field) => {
    const marker = row.indexOf('空闲时段');
    const values = row.slice(marker + 1);
    for (let m = 0; m < models.length; m++) {
      const value = parsePriceNumber(values[m]);
      if (value === null) throw new Error(`missing off-peak price for ${models[m]}`);
      parsed[m][field] = value;
    }
  };
  /** 把某一高峰行的价格数字填进 parsed[m][peakField]。 */
  const applyPeak = (row, peakField) => {
    for (let m = 0; m < models.length; m++) {
      const value = parsePriceNumber(row[m + 1]);
      if (value !== null) parsed[m][peakField] = value;
    }
  };

  let mode = null; // 'input' | 'cacheRead' | 'output'
  for (const row of rows) {
    const joined = row.join(' ');
    if (joined.includes('缓存命中') && row.includes('空闲时段')) {
      mode = 'cacheRead';
      applyOffPeak(row, 'cacheReadPerM');
    } else if (joined.includes('缓存未命中') && row.includes('空闲时段')) {
      mode = 'input';
      applyOffPeak(row, 'inputPerM');
    } else if (joined.includes('百万tokens输出') && row.includes('空闲时段')) {
      mode = 'output';
      applyOffPeak(row, 'outputPerM');
    } else if (row[0] === '高峰时段' && mode !== null) {
      const peakField = { input: 'peakInputPerM', cacheRead: 'peakCacheReadPerM', output: 'peakOutputPerM' }[mode];
      applyPeak(row, peakField);
      mode = null;
    }
  }

  for (const entry of parsed) {
    if (entry.inputPerM === null || entry.outputPerM === null || entry.cacheReadPerM === null) {
      throw new Error(`pricing table incomplete for ${entry.model}`);
    }
  }

  // 高峰缺失时回退到空闲价（不分峰谷），保证行结构完整。
  return parsed.map((entry) => ({
    model: entry.model,
    inputPerM: entry.inputPerM,
    cacheReadPerM: entry.cacheReadPerM,
    cacheWritePerM: 0,
    outputPerM: entry.outputPerM,
    peakInputPerM: entry.peakInputPerM ?? entry.inputPerM,
    peakCacheReadPerM: entry.peakCacheReadPerM ?? entry.cacheReadPerM,
    peakCacheWritePerM: 0,
    peakOutputPerM: entry.peakOutputPerM ?? entry.outputPerM,
  }));
}
