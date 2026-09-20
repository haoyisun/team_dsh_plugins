# Changelog

本文件记录面向用户的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- `@team-dsh-plugins/plugin-manager` 支持为本页查询和安装单独设置 npm 镜像源，配置保存在 DSH settings，不修改本机或 Profile 的 `.npmrc`。
- 新增 `@team-dsh-plugins/message-navigator`，通过可滚动里程碑轨道预览并定位长会话中的用户提问。
- 新增 `@team-dsh-plugins/mcp-manager`，在 DSH 设置中可视化管理全局 MCP Client 实例、凭据、连接测试和工具列表。
- 新增 `@team-dsh-plugins/plugin-manager`，在 DSH 设置中可视化查看、添加、删除、检查更新、更改版本和恢复 npm 外源插件。
- 新增仅支持 Windows 的可选 DSH Desktop 壳，直接嵌入 DSH Web，并提供安全进程接管、托盘重启、DSH 更新和退出清理。

### Changed

- `@team-dsh-plugins/cost-meter` 新增配置键 `dayOffsetMinutes`（默认 480 = 北京时间）统一「今日/本周/本月」的日界，并新增 `lib/pricing.js`、`lib/aggregate.js`、`lib/backfill.js` 三个纯逻辑模块承载计费、聚合与回填折叠，使这部分可被单元测试覆盖。
- `@team-dsh-plugins/cost-meter` 样本键迁移为 path-safe 的 `sessionId_seq`（启动时一次性改写历史键，域级标记保证只跑一次），为切换 storage-domain 的 `per-record` 布局做准备；升级后的第一次启动会多花几秒用于逐条改写键，期间统计接口等待迁移收尾而不是返回中间态数字。
- `@team-dsh-plugins/cost-meter` 实时用量改由 `llm/stream` waterfall 采集（会话日志的 `assistant/message` 订阅已移除），压缩摘要、自动标题、子 agent 调用以及失败/中止但已报告用量的 attempt 从此都会被计入；历史用量仍由会话日志回填，两条数据源按固定一次的历史切点做时间互斥，同一调用不会重复计数。数据源契约的变更见新增的 [ADR-019](docs/explanation/decisions/0019-capture-cost-meter-usage-from-llm-stream.md)。
- `@team-dsh-plugins/cost-meter` 样本记录新增可选字段 `purpose`，`sessionId`/`seq` 改为可选（既有记录无需迁移）；实时样本键为 path-safe 的 `llm-<进程令牌>_<序号>`。
- 消息导航改用中央焦点线和点击锁定同步当前轮次，并增加带边框轨道、流式回复状态、窄屏面板、点位虚拟化及按需历史加载。
- 外源插件以 DSH Web Profile 实际状态为准；`init` 会安全迁移旧方案留下的禁用覆盖。
- MCP 管理器支持粘贴 JSON/JSONC/YAML 第三方配置和 DSH Profile MCP patch、安全预检及批量禁用导入；单实例可以在一次确认中测试、保存并启用，已启用实例只有在候选配置测试通过后才会切换。
- MCP 管理界面改用 DSH Web 原生控件，明确必填项、折叠高级设置，并为启停、测试、重新启动、工具查看和删除提供局部进度与结果反馈。
- DSH Desktop 改用 `deepseek-harness` 官方灰色鱼形路径生成的多分辨率图标。
- DSH Desktop 首次确认后固定官方 DSH 精确版本；普通启动不再查询 `latest`，用户可从托盘强制检查并确认升级，失败时尽力恢复原版本。
- DSH Desktop 窗口左上角新增常驻版本工具栏，提供与托盘同款样式的“重启 DSH”和“检查更新”，无需打开托盘即可重启当前固定版本或主动更新。
- DSH Desktop 检查更新时显示加载动效，并以匹配 DSH Web 风格的本地模态窗替代系统更新对话框。

### Fixed

- `pnpm run init` 现在会在仓库迁移后自动替换指向旧路径或已经悬空的插件 scope 链接。
- Windows PowerShell 5.1 现在可以正确解析桌面快捷方式创建与启动脚本。
- DSH Desktop 最小化后恢复会自动校正嵌入页面，不再停留在误导性的启动页；页面故障、后端退出和工具栏异常现在分别恢复，后台故障不会主动抢焦点。
- DSH Desktop 快捷方式直接调用本地 Electron，不再依赖 Explorer 环境中的 `pnpm` PATH；启动异常会显示退出码而不是静默闪退。
- DSH Desktop 为进程和快捷方式设置同一 AppUserModelID，并用内容哈希图标路径绕过 Explorer 旧缓存，固定或右键任务栏图标时继续使用自定义图标。
- DSH Desktop 任务栏图标改为标准多尺寸 ICO，避免 Windows 把透明背景画成黑底，从而和 `app-icon.png` 对不上。
- DSH Desktop 首次安装和升级现在强制刷新 npm 元数据，修复“检查能发现新版本、安装却报 `ETARGET` 并回滚”的问题；普通启动与回滚仍优先使用本机缓存，启动失败时错误信息会带上 npm 的真实输出。
- `@team-dsh-plugins/mcp-manager` 与 `@team-dsh-plugins/plugin-manager` 恢复可用：两者此前在 DSH 0.1.5-rc.1 及之后的版本上会因官方连接包回归而在加载期失败并拖垮 DSH 启动，只能保持禁用。现在它们的 RPC 通道注册改为官方优先、只在命中该缺陷时回退到插件自己通过 `ctx.webServer` 注册同协议通道，并继续复用官方 Host/Origin 与浏览器会话鉴权；在 0.1.2-rc.1、0.1.5-rc.2 与 0.1.6-alpha.2 上均可加载。
- `@team-dsh-plugins/mcp-manager` 与 `@team-dsh-plugins/plugin-manager` 按客户端连接契约声明 RPC 通道所需的 `webServer` 宿主服务依赖。
- `@team-dsh-plugins/cost-meter` 修复官方定价页改版后消费金额恒为 0 的问题：模型名单元格新增的 `<sup>(n)</sup>` 脚注标记被解析成模型 id 的一部分（`deepseek-flash (1)`），价格表与真实模型永远匹配不上；现在解析价格表时会剥掉脚注标记，读取价格时也会归一化模型名，已经被写坏的 settings 价格行无需重新同步即可恢复计费。
- `@team-dsh-plugins/cost-meter` 内置官方价格表更新为当前官网价格（`deepseek-flash`、`deepseek-v4-pro`），并按官方公告把已下线的旧模型名 `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp` 映射到 Flash 价格，历史会话不再显示为未定价。
- `@team-dsh-plugins/cost-meter` 按官方规则把高峰时段限制为北京时间周一至周五 9:00-12:00、14:00-18:00，周末全天按空闲价计费，不再多算一倍。
- `@team-dsh-plugins/cost-meter` 今日样本存在未定价模型时，左上角胶囊按钮转为警告色并在提示中说明，避免把价格表失配误读成“没有消费”。
- `@team-dsh-plugins/cost-meter` 修复历史回填完全不生效的问题：回填调用的是当前 DSH 上并不存在的 `sessionPersistence.readFrom()`（`list()` 的返回项也没有 `id`），异常被逐会话捕获后静默跳过，导致既没有补录历史、也不再更新扫描游标。现在改用服务契约里的 `open(id, 'read')` + `handle.read(seq)`，并把 `scans` 游标从“只写不读”变成真正的增量依据。
- `@team-dsh-plugins/cost-meter` 修复 `settings.yaml` 中 `balanceUrl`、`apiKeyEnv`、`balanceTimeoutMs`、`pricingUrl`、`pricingTimeoutMs` 改了不生效的问题：这些键此前只读入口配置，与 README 的说明不符。
- `@team-dsh-plugins/cost-meter` 修复价格编辑器在「同步官方价格」后仍显示旧草稿、再点「保存单价」就把同步结果覆盖回去的问题；同步与写入冲突（409）后都会用服务端价格重建草稿。
- `@team-dsh-plugins/cost-meter` 修复价格输入框无法输入小于 1 的小数（官方缓存命中价 `0.02` 会被输入成 `2`）的问题；未填写的高峰档仍按空闲档回退，不会因为编辑而变成 0。
- `@team-dsh-plugins/cost-meter` 保存单价或刷新余额失败时不再静默：补上错误处理并在面板内联提示，同步失败也改为非 2xx 状态码，避免被当作成功。
- `@team-dsh-plugins/cost-meter` 修复「今日/本周/本月」用宿主本地时区、峰谷用北京时间、柱状图用浏览器时区导致的口径不一致；日界改由 `dayOffsetMinutes`（默认 480 = 北京时间）统一计算，日期键由服务端下发，跨时区访问不再错位。
- `@team-dsh-plugins/cost-meter` 修复已有数据时刷新失败完全静默、柱状图在单日消耗不足 1 元时被压成同一高度、价格行以数组下标作 React key 的问题。
- `@team-dsh-plugins/cost-meter` 余额不再跨币种求和、不再每 5 分钟空转轮询（改为按需刷新），并在 DSH Web 绑定 `0.0.0.0` 时不下发账户余额。
- `@team-dsh-plugins/cost-meter` 价格行改为拒绝空模型名与重复模型名，数值字段缺省按 0 计而不再回退到上一代官方价，避免“模型名写错却按无关旧价计费”。
- `@team-dsh-plugins/cost-meter` 聚合时价格表只解析一次（原先每个样本最多解析 6 次），实测统计请求的聚合耗时下降约 30%。
- `@team-dsh-plugins/cost-meter` 存储改用 storage-domain 的 `per-record` 布局，消除写入放大：原先 `single` 布局下**每条样本都要重写整个单元文件**（800 KB 级，且随历史增长），现在每条样本只写自己约 240 字节的文件——按每天 400 次调用估算，年写入量从百 GB 级降到几十 MB 级。
- `@team-dsh-plugins/cost-meter` 启用 `invalidRecords: 'backup-and-skip'`：单条样本记录损坏时会被移走为 `.bak.<时间戳>` 并跳过，而不是让整个统计域打不开（该行为依赖 `per-record` 布局才可用）。
- `@team-dsh-plugins/cost-meter` 回填增加自愈：若样本表为空而会话游标仍在（从旧版本直接升级到 `per-record` 时，非 path-safe 的历史键会被 bootstrap 静默跳过），自动忽略游标并全量重建样本，避免历史静默消失。
- `@team-dsh-plugins/cost-meter` 样本键改为 path-safe 的 `sessionId_seq`，并兼容读取历史 `sessionId:seq` 键，为切换到 storage-domain 的 `per-record` 布局（消除“每条样本重写整个 JSON 文件”）做准备。

### Removed

- 移除 `profiles/web.external.yml`、`pnpm run sync:external` 及仓库级外源插件同步流程。

## [0.1.0] - 2026-08-21

### Added

- 以 `team_dsh_plugins` 作为开源 monorepo 发布。
- 通过 `pnpm run init` 将仓库一次性接入 DSH Web Profile。
- 提供 `doctor`、`unlink`、`validate` 维护命令。
- 内置费用统计插件 `@team-dsh-plugins/cost-meter`。
