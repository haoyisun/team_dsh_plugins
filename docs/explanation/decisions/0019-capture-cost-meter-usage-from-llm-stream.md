# ADR-019：cost-meter 改用 `llm/stream` 采集用量并引入历史切点

## 状态

Accepted

## 日期

2026-09-18

## 背景

`@team-dsh-plugins/cost-meter` 原本订阅 `session/event`，只把会话日志中
`assistant/message` 携带的 usage 记为消耗。该来源**不完整**，会漏掉三类真实计费：

- 压缩摘要调用（`GenerateOptions.purpose === 'compaction'`）与自动标题调用
  （`'session-title'`）：它们是手工构造的一次性调用，不产生会话消息，usage 从不落盘；
- 失败、中止或重试的 attempt：agent loop 只为「未产出消息」的 attempt 追加
  `assistant/attempt`，而该事件按 `SessionEventMap` 契约不携带 usage；
- 由此，金额系统性低于官方账单，且面板上看不出任何异常。

DSH 中覆盖**每一次**流式模型调用的接入点是绑定在 `LlmRuntime` 上的 `llm/stream`
waterfall；`dsh-llm` 的 `StreamChunk` 契约保证适配器在终止 `finish` 之前发出
`usage` chunk。`dsh-session-title` 等内置包也用它观察调用，可作先例。

## 决策

- **实时采集改由 `llm/stream` 承担**：以 `{ global: true }` 注册（事件在
  `LlmRuntime` 所在作用域派发，非全局监听器收不到其他作用域——子 agent、标题
  生成——发出的调用）。会话日志的 `assistant/message` 订阅**移除**，不再作为
  实时数据源，避免同一调用被两条实时路径各记一次。
- **引入域级 singleton 的 `historyCutoff`**：首次启用实时采集时固定一次，之后
  永不变化。回填只补 `event.time < cutoff` 的事件，实时只记 `cutoff` 之后的调用。
  两条路径**按时间互斥**，因此同一调用不可能被计两次，不需要在键或内容上做去重。
- **回填保留，但只承担历史**：仍用 `sessionPersistence.open(id,'read')` +
  会话游标增量读取，语义从「补齐所有缺失样本」收窄为「补齐切点之前的历史」。
- **实时样本键为 `llm-<进程令牌>_<序号>`**：实时调用没有会话日志里的 seq，
  需要一个独立键空间；进程令牌避免同一存储被两个进程写入时键冲突，且键仍是
  `[a-zA-Z0-9_-]+`，满足 `per-record` 布局把键当路径段的要求。
- **样本 schema 放宽**：`sessionId`/`seq` 改为可选，新增可选 `purpose`。
  放宽必填项不会让既有记录失效，因此**不升 domain version、不需要迁移**。
- **纯逻辑外置**：chunk 透传与用量抄取放在 `lib/llm-usage.js`（`tapUsage`），
  不依赖宿主服务，可被 `node --test` 覆盖。
- **`inject` 增加 `llm`**：明确声明对 `LlmRuntime` 的依赖，保证监听器在
  运行时就绪后注册。

## 备选方案

- **只补 `purpose` 调用**：与现有路径结构上不相交、零重复风险，但仍然漏掉
  失败 attempt，等于只修一半。
- **用 `finish` 原因 + 是否产出内容判断 attempt 去向**：需要复刻 agent loop 内部
  `interruptedBlocks()` 的规则；一旦内部规则变化就会变成重复计数或静默漏计，脆弱。
- **不设切点，让回填按「已有键」跳过**：回填键与实时键不同，无法识别同一调用的
  两种键，必然重复计数。
- **`session/event` 与 `llm/stream` 双写**：实现最简单，但对每个成功的正常调用
  都会计两次。

## 结果

- 覆盖范围从「产生消息的成功调用」扩展到**每一次已报告用量的模型调用**：压缩摘要、
  自动标题、子 agent、失败/中止的 attempt 都计入，金额不再系统性偏低。
- 已知残留：切换瞬间**在途**的那一次调用可能两条路径都不记（它开始于订阅之前、
  事件时间又落在切点之后），概率与影响都极小，且只发生一次。
- 实时路径成为唯一数据源后，`llm` 服务缺失时不会记录实时用量；此时插件仍可用，
  但只有回填的历史数据。
- 每条模型调用一条样本记录，记录数比原先更多；写入成本由 `per-record` 布局承担
  （每次只写该记录自己的小文件），不再随历史长度放大。
- 插件对外接口不变：`/api/cost-meter/*` 路由、`cost-meter` settings 命名空间与
  `cost_meter` 域的形状均未变化。
