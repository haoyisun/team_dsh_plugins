# ADR-013：Desktop 固定 DSH 版本并要求显式升级

## 状态

Accepted（首次安装与升级的 npm 元数据新鲜度由 ADR-0018 修订）

## 日期

2026-09-08

## 背景

ADR-010 最初让 DSH Desktop 在普通启动时执行
`npx @deepseek-ai/dsh web --no-open`，在托盘“更新 DSH”时执行
`@deepseek-ai/dsh@latest`。仓库根目录没有安装 DSH，因此裸包名仍可能按 npm
缓存与 registry 元数据解析到新的 `latest`。这使普通启动与显式更新的边界不可靠，
用户无法确定重启后是否仍运行原版本。

DSH 仍处于 Developer Preview，升级可能改变 Host、Client module 或 Loader 契约。
桌面壳需要保留官方 CLI 入口和 npm 分发方式，同时让版本变化成为明确的用户操作。

## 决策

- Desktop 首次运行使用 `--prefer-online` 读取 npm `dist-tags.latest` 元数据，向用户显示目标精确版本；
  用户确认后才执行该版本。
- 成功加载 DSH Web 后，Desktop 在 Electron `userData` 中原子保存精确 semver。
  该文件只表示桌面壳选择的发行版本，不进入仓库，也不改写 DSH Home。
- 普通启动和重启始终通过同一个 `npm.cmd` 执行
  `npm exec --yes --prefer-offline -- @deepseek-ai/dsh@<exact-version> web --no-open`，
  不查询 `latest`。
- 托盘只提供“检查 DSH 更新…”。检查不会停止当前 DSH；发现更高版本后显示当前版、
  目标版和兼容性提示，只有用户确认才切换。
- 新版本完成启动、页面加载和版本记录提交后，升级才算成功。任一步失败都会停止候选
  进程并恢复原精确版本；若恢复也失败，则同时报告两次脱敏错误。
- Node 和 PowerShell 两个边界都只接受精确 semver。包名固定为官方
  `@deepseek-ai/dsh`，不接受 tag、范围、URL、git spec、路径或其他包名。

本 ADR 只取代 ADR-010 中“普通启动使用裸包、通过 `latest` 直接更新”的版本策略；
其余窗口隔离、进程接管、supervisor 和清理决策保持不变。

## 备选方案

- 每次启动解析 `latest`：实现最简单，但仍会静默改变运行版本。
- 把 DSH 固定为 `desktop/package.json` 依赖：可复现，但版本选择会成为仓库共享状态，
  用户无法独立决定何时升级，也需要修改安装边界。
- 只依赖 npx 缓存保留旧版：缓存不是版本契约，清理缓存或元数据过期后行为不可预测。
- 在 DSH Home 保存 Desktop 版本：会把桌面壳偏好混入 DSH 自有运行状态。

## 结果

普通启动固定 DSH 顶层包版本；离线时只要该精确包及所需内容仍在 npm 缓存中即可运行。
首次安装和主动检查更新仍需要 registry 网络访问。Electron 壳、工作区插件源码与 DSH
发行版继续使用三套独立升级路径。

版本记录损坏时 Desktop 会拒绝猜测或退回 `latest`，防止意外升级。失败恢复是尽力而为：
npm 缓存不是持久回滚资产；若旧版本缓存被清理、版本被撤包或网络不可用，恢复可能失败，
此时状态页会保留明确诊断。精确顶层版本也不等同于传递依赖或 DSH Home 数据格式快照。
