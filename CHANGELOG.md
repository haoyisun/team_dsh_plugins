# Changelog

本文件记录面向用户的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 新增 `@team-dsh-plugins/message-navigator`，通过可滚动里程碑轨道预览并定位长会话中的用户提问。
- 新增 `@team-dsh-plugins/mcp-manager`，在 DSH 设置中可视化管理全局 MCP Client 实例、凭据、连接测试和工具列表。
- 新增 `@team-dsh-plugins/plugin-manager`，在 DSH 设置中可视化查看、添加、删除、检查更新、更改版本和恢复 npm 外源插件。
- 新增仅支持 Windows 的可选 DSH Desktop 壳，直接嵌入 DSH Web，并提供安全进程接管、托盘重启、DSH 更新和退出清理。

### Changed

- 消息导航改用中央焦点线和点击锁定同步当前轮次，并增加带边框轨道、流式回复状态、窄屏面板、点位虚拟化及按需历史加载。
- 外源插件以 DSH Web Profile 实际状态为准；`init` 会安全迁移旧方案留下的禁用覆盖。
- MCP 管理器支持粘贴 JSON/JSONC/YAML 第三方配置和 DSH Profile MCP patch、安全预检及批量禁用导入；单实例可以在一次确认中测试、保存并启用，已启用实例只有在候选配置测试通过后才会切换。
- MCP 管理界面改用 DSH Web 原生控件，明确必填项、折叠高级设置，并为启停、测试、重新启动、工具查看和删除提供局部进度与结果反馈。
- DSH Desktop 改用 `deepseek-harness` 官方灰色鱼形路径生成的多分辨率图标。
- DSH Desktop 首次确认后固定官方 DSH 精确版本；普通启动不再查询 `latest`，用户可从托盘强制检查并确认升级，失败时尽力恢复原版本。
- DSH Desktop 窗口左上角新增常驻版本工具栏和“检查更新”按钮，无需打开托盘即可查看版本或主动更新。
- DSH Desktop 检查更新时显示加载动效，并以匹配 DSH Web 风格的本地模态窗替代系统更新对话框。

### Fixed

- `pnpm run init` 现在会在仓库迁移后自动替换指向旧路径或已经悬空的插件 scope 链接。
- Windows PowerShell 5.1 现在可以正确解析桌面快捷方式创建与启动脚本。
- DSH Desktop 快捷方式直接调用本地 Electron，不再依赖 Explorer 环境中的 `pnpm` PATH；启动异常会显示退出码而不是静默闪退。

### Removed

- 移除 `profiles/web.external.yml`、`pnpm run sync:external` 及仓库级外源插件同步流程。

## [0.1.0] - 2026-08-21

### Added

- 以 `team_dsh_plugins` 作为开源 monorepo 发布。
- 通过 `pnpm run init` 将仓库一次性接入 DSH Web Profile。
- 提供 `doctor`、`unlink`、`validate` 维护命令。
- 内置费用统计插件 `@team-dsh-plugins/cost-meter`。
