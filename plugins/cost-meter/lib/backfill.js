/**
 * dsh-cost-meter 回填模块（Node 半内部模块）。
 *
 * 纯函数、不依赖宿主服务，可被 `node --test` 直接覆盖。职责：
 *  - 定义用量样本的存储键（当前格式与历史格式）；
 *  - 从一个会话的事件序列折叠出 provider/model 路由上下文，并生成待写入的样本；
 *  - 产出增量游标，使下次启动只读游标之后的事件。
 *
 * 三个必须遵守的约束：
 *  1. **键必须 path-safe**（`[a-zA-Z0-9_-]+`）。storage-domain 的 `per-record`
 *     布局把记录键直接当路径段，非法键写入即被拒；其 legacy bootstrap 对非法键
 *     是**静默跳过**。历史键格式含 `:`，因此不能作为长期格式，这里保留读兼容、
 *     新写入一律用 `sessionId_seq`。
 *  2. **增量读必须由游标播种 provider/model**。只读游标之后的事件时，区间内
 *     通常没有 `request/context`、`request/header`，上下文会折叠成 `unknown`
 *     并污染样本；游标因此要携带 provider/model，而不只是 seq。
 *  3. **同一事件必须能被识别为「已记录」，不论用的是哪种键格式**。否则历史
 *     格式与当前格式会让同一个事件各写一条，费用被重复计入。
 */

/** 当前样本键：path-safe，sessionId 不含下划线，可用最后一个下划线反解。 */
export function sampleKey(sessionId, seq) {
  return `${sessionId}_${seq}`;
}

/** 历史样本键（含 `:`，非 path-safe），仅用于读兼容与迁移。 */
export function legacySampleKey(sessionId, seq) {
  return `${sessionId}:${seq}`;
}

/**
 * 实时（`llm/stream`）样本键：`llm-<进程令牌>_<序号>`。
 *
 * 实时调用没有会话日志里的 seq，因此需要一个独立且不会与回填键碰撞的命名空间；
 * 进程令牌用于避免同一存储被两个进程同时写入时键冲突，仍是 path-safe 的。
 * @param token - 进程级随机令牌。
 * @param seq - 进程内自增序号。
 * @returns 记录键。
 */
export function liveSampleKey(token, seq) {
  return `llm-${token}_${seq}`;
}

/**
 * per-record 布局把记录键当路径段，要求 `[a-zA-Z0-9_-]+`：非法键写入被拒，
 * 而 legacy bootstrap 对非法键是静默跳过。因此凡写入路径都要先用它判断。
 * @param key - 记录键。
 * @returns 是否可安全用作路径段。
 */
export function isPathSafeKey(key) {
  return typeof key === 'string' && /^[a-zA-Z0-9_-]+$/.test(key);
}

/**
 * 把 token 用量整理成持久化样本。
 * @param sessionId - 会话 id。
 * @param event - `assistant/message` 事件（`event.data.usage` 必须存在）。
 * @param provider - 折叠出的 provider。
 * @param model - 折叠出的 model。
 * @returns 样本记录。
 */
export function buildSample(sessionId, event, provider, model) {
  const usage = event.data.usage;
  return {
    sessionId,
    seq: event.seq,
    time: event.time,
    provider,
    model,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  };
}

/**
 * 判断某会话应从哪个 seq 开始读。
 *
 * 游标缺少 provider/model 时无法播种上下文（旧版本游标、或首次回填），
 * 必须从 0 全量读，否则会把正确样本污染成 `model: 'unknown'`。
 * @param cursor - 已存游标，可能为 undefined。
 * @returns 起始读取的 seq。
 */
export function backfillStartSeq(cursor) {
  if (!isTrustedCursor(cursor)) return 0;
  return cursor.seq + 1;
}

/** 游标是否携带可信的路由上下文（两个字段都是已知字符串）。 */
function isTrustedCursor(cursor) {
  if (cursor === undefined || cursor === null) return false;
  if (typeof cursor.seq !== 'number') return false;
  if (typeof cursor.provider !== 'string' || typeof cursor.model !== 'string') return false;
  return cursor.provider !== 'unknown' && cursor.model !== 'unknown';
}

/**
 * 折叠一个会话的事件序列，产出待写入样本与新游标。
 *
 * 游标只在折叠出**可信路由上下文**时才产出：游标一旦被信任，后续启动就只读
 * 增量，而增量区间内通常没有 `request/*` 事件——上下文为 unknown 的游标会让
 * 之后的样本全部被污染成 unknown。没有上下文的会话永远走全量读，代价可接受
 * 且保证正确。已可信且没有新事件时不重写游标，避免每次启动写一遍全部游标。
 *
 * `cutoff`（历史切点）之后的消息事件一律跳过：那段时间的调用由 `llm/stream`
 * 实时记录，两条路径按时间互斥，避免同一调用被计两次。切点只在首次启用实时
 * 采集时固定一次，之后不再变化。
 *
 * @param options.sessionId - 会话 id。
 * @param options.events - 本次读到的事件（按 seq 升序）。
 * @param options.cursor - 已存游标；可信时其 provider/model 用作折叠起点。
 * @param options.findStored - `(sessionId, seq) => sample | undefined`，跨两种键格式查已记录样本。
 * @param options.cutoff - 历史切点（epoch 毫秒）；缺失表示不设限（全部由回填负责）。
 * @param options.now - 游标时间戳来源（默认 `Date.now()`）。
 * @returns `{ inserts, cursor }`；`cursor` 为 undefined 表示无需更新游标。
 */
export function planSessionSamples({ sessionId, events, cursor, findStored = () => undefined, cutoff, now = Date.now() }) {
  let provider = cursor?.provider ?? 'unknown';
  let model = cursor?.model ?? 'unknown';
  const previousSeq = typeof cursor?.seq === 'number' ? cursor.seq : -1;
  let lastSeq = previousSeq;
  const inserts = [];

  for (const event of events) {
    if (typeof event?.seq === 'number' && event.seq > lastSeq) lastSeq = event.seq;
    if (event?.type === 'request/context') {
      provider = event.data?.provider ?? provider;
      model = event.data?.model ?? model;
    } else if (event?.type === 'request/header') {
      provider = event.data?.header?.config?.provider ?? provider;
      model = event.data?.header?.config?.model ?? model;
    } else if (event?.type === 'assistant/message' && event.data?.usage !== undefined) {
      // 切点之后的调用由实时路径负责，这里跳过以免重复计数。
      if (typeof cutoff === 'number' && typeof event.time === 'number' && event.time >= cutoff) continue;
      // 已有正确样本时不覆盖（实时监听可能已记录），仅补录缺失或被污染的样本。
      const existing = findStored(sessionId, event.seq);
      if (existing !== undefined && existing.model !== 'unknown') continue;
      inserts.push({ key: sampleKey(sessionId, event.seq), value: buildSample(sessionId, event, provider, model) });
    }
  }

  const folded = provider !== 'unknown' && model !== 'unknown';
  if (lastSeq < 0 || !folded) return { inserts, cursor: undefined };
  if (isTrustedCursor(cursor) && lastSeq <= previousSeq) return { inserts, cursor: undefined };
  return { inserts, cursor: { seq: lastSeq, at: now, provider, model } };
}
