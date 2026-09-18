/**
 * dsh-cost-meter 实时用量采集（Node 半内部模块）。
 *
 * 纯逻辑、不依赖宿主服务，可被 `node --test` 直接覆盖。
 *
 * 为什么改用 `llm/stream` 采集：会话日志里的 `assistant/message` 只覆盖「产生了
 * 消息的成功调用」，会漏掉三类真实计费：
 *  - `purpose: 'compaction'` 的压缩摘要调用；
 *  - `purpose: 'session-title'` 的自动标题调用；
 *  - 失败/中止且没有产出消息的 attempt（会话日志里只留 `assistant/attempt`，
 *    而它按契约不携带 usage）。
 * `llm/stream` 是 DSH 覆盖**每一次**流式模型调用的 waterfall，且适配器保证在终止
 * finish 之前发出 `usage` chunk（`dsh-llm` 的 StreamChunk 契约），因此它是唯一
 * 完整的接入点。
 */

/**
 * 包一层 chunk 流：抄出 usage 后原样透传，不改变流的语义。
 *
 * 三条硬约束：
 *  - 每个 chunk 必须原样 yield（顺序与内容不变），否则会破坏模型输出；
 *  - 内层流的异常必须继续抛出，不能被吞掉；
 *  - 观察者自身的异常不能影响流——记账失败不该中断模型调用。
 *
 * @param stream - 内层 chunk 流（waterfall 里 `next()` 的返回值）。
 * @param onUsage - `(usage) => void`，收到 usage chunk 时同步调用。
 * @returns 供 waterfall 返回的异步可迭代对象。
 */
export function tapUsage(stream, onUsage) {
  return {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of stream) {
        if (chunk !== null && typeof chunk === 'object' && chunk.type === 'usage') {
          try {
            onUsage(chunk.usage);
          } catch {
            /* 记账失败不中断模型调用 */
          }
        }
        yield chunk;
      }
    },
  };
}
