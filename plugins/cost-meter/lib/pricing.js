/**
 * dsh-cost-meter 定价模块（Node 半内部模块）。
 *
 * 负责：
 *  - 内置当前官方价格表（远程抓取失败时的兜底来源）；
 *  - 解析官方定价页（Docusaurus SSR HTML）中的模型价格表；
 *  - 按北京时间峰谷时段计价：高峰 = 周一至周五 9:00-12:00、14:00-18:00
 *    （官方规则，见定价页脚注 3），其余为空闲时段；空闲价 = 高峰价的一半。
 *  - 归一化模型 id：剥掉定价页脚注标记，并把官方公告的旧模型名映射到当前模型。
 *
 * 价格单位：CNY / 100 万 tokens。
 */

/** 官方定价页 URL（中文版）。 */
export const OFFICIAL_PRICING_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing';

/**
 * 官方定价页当前列出的模型名（脚注 1）决定的旧名映射。
 * 旧名仍可调用、并按当前模型计费，因此计价时按别名解析到对应价格行。
 */
export const MODEL_ALIASES = {
  'deepseek-v4-flash': 'deepseek-flash',
  'deepseek-v4-flash-vision-exp': 'deepseek-flash',
};

/**
 * 内置官方价格表（与定价页当前内容一致，作为远程抓取失败时的兜底）。
 * peak* 字段缺省时按空闲价计（即不分峰谷）。
 */
export const OFFICIAL_PRICES = [
  {
    model: 'deepseek-flash',
    inputPerM: 1,
    cacheReadPerM: 0.02,
    cacheWritePerM: 0,
    outputPerM: 4,
    peakInputPerM: 2,
    peakCacheReadPerM: 0.04,
    peakCacheWritePerM: 0,
    peakOutputPerM: 8,
  },
  {
    model: 'deepseek-v4-pro',
    inputPerM: 4.5,
    cacheReadPerM: 0.15,
    cacheWritePerM: 0,
    outputPerM: 13.5,
    peakInputPerM: 9,
    peakCacheReadPerM: 0.3,
    peakCacheWritePerM: 0,
    peakOutputPerM: 27,
  },
];

/**
 * 判断某个时间戳（epoch ms）是否落在北京时间的官方高峰时段。
 * 高峰 = 北京周一至周五 9:00-12:00、14:00-18:00（起始含、结束不含）。
 * @param time - epoch 毫秒。
 * @returns 是否高峰时段。
 */
export function isBeijingPeak(time) {
  // UTC+8 后直接读 UTC 时间即得北京时间。
  const shifted = new Date(time + 8 * 3600 * 1000);
  const day = shifted.getUTCDay();
  if (day === 0 || day === 6) return false; // 周末全天空闲
  const hour = shifted.getUTCHours();
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

/**
 * 归一化模型 id：剥掉定价页脚注标记（`(1)`、`（2）`、`[3]` 等）。
 *
 * 定价页把脚注上标写在模型名单元格里（`deepseek-flash<sup>(1)</sup>`），
 * 早期解析器只去标签、留下 `(1)` 文本，于是价格行的模型名和会话里真实
 * 的模型 id 永远匹配不上，费用被静默算成 0。这里统一在读写两侧归一化，
 * 既能修好新抓取的表格，也能让已写坏的 settings 价格行重新匹配。
 * @param model - 原始模型 id。
 * @returns 去掉脚注标记、并压缩空白的模型 id；非字符串返回空串（永不匹配任何价格行）。
 */
export function normalizeModelId(model) {
  if (typeof model !== 'string') return '';
  return model
    .trim()
    .replace(/\s*[([（【]\s*\d+\s*[)\]）】]\s*$/, '')
    .trim();
}

/** 取某模型单价行；先精确匹配、再按官方别名、最后回退 `*` 通配默认行。 */
export function priceRowFor(prices, model) {
  const id = normalizeModelId(model);
  const find = (candidate) => prices.find((p) => normalizeModelId(p.model) === candidate);
  const direct = find(id);
  if (direct !== undefined) return direct;
  const alias = MODEL_ALIASES[id];
  if (alias !== undefined) {
    const aliased = find(alias);
    if (aliased !== undefined) return aliased;
  }
  return find('*');
}

/**
 * 归一化价格行的模型 id。
 *
 * 历史版本的「同步官方价格」会把定价页脚注标记写进模型名
 * （`deepseek-flash (1)`），导致所有真实模型 id 都匹配不到单价、费用恒为 0。
 * 读取侧统一归一化后，已经写坏的 settings 价格行无需用户重新同步即可恢复计费。
 * @param rows - 价格行数组。
 * @returns 新的价格行数组（不修改输入）。
 */
export function normalizePriceRows(rows) {
  return rows.map((row) => (typeof row?.model === 'string' ? { ...row, model: normalizeModelId(row.model) } : row));
}

/**
 * 校验客户端提交的价格行数组。
 *
 * 拒绝空模型名与重复模型名：空名永远匹配不到任何模型，重复名会让后一行
 * 静默失效。两者都是「看起来配了价、实际不生效」的来源，因此在写入口直接
 * 报错，而不是留到计费阶段静默处理。
 * @param rows - 待校验的价格行数组。
 * @param parse - 单行 schema 解析函数（schemastery）。
 * @returns 归一化后的价格行数组。
 * @throws 结构非法、模型名为空或重复时抛出 Error。
 */
export function validatePriceRows(rows, parse) {
  if (!Array.isArray(rows)) throw new Error('prices must be an array');
  const seen = new Set();
  return rows.map((row, index) => {
    if (typeof row !== 'object' || row === null) throw new Error(`prices[${index}] must be an object`);
    const parsed = parse(row);
    const model = normalizeModelId(parsed.model);
    if (model.length === 0) throw new Error(`prices[${index}].model must not be empty`);
    if (seen.has(model)) throw new Error(`duplicate model "${model}"`);
    seen.add(model);
    return {
      model,
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

/**
 * 剥掉 HTML 标签与实体，压缩空白。
 * 上标元素（`<sup>`）是脚注引用、不属于单元格文本，整体丢弃。
 */
function cleanCell(html) {
  return html
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, ' ')
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
 *   [模型, deepseek-flash<sup>(1)</sup>, deepseek-v4-pro<sup>(2)</sup>]
 *   [价格 (3), 百万tokens输入（缓存命中）, 空闲时段, 0.02元, 0.15元]
 *   [高峰时段, 0.04元, 0.30元]
 *   [百万tokens输入（缓存未命中）, 空闲时段, 1元, 4.5元]
 *   [高峰时段, 2元, 9.0元]
 *   [百万tokens输出, 空闲时段, 4元, 13.5元]
 *   [高峰时段, 8元, 27.0元]
 *
 * 模型名单元格可能带 `<sup>` 脚注标记，解析时按 normalizeModelId 剥掉。
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
  const models = modelRow
    .slice(1)
    .map((cell) => normalizeModelId(cell))
    .filter((cell) => cell.length > 0);
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
