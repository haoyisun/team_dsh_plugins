# team_dsh_plugins

开源的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件 monorepo。仓库通过一次性接入连接到 DSH Web Profile；此后仍使用官方命令启动：

```powershell
npx @deepseek-ai/dsh web
```

## 插件列表

| 插件 | 状态 | 说明 |
|---|---|---|
| [`@team-dsh-plugins/cost-meter`](plugins/cost-meter) | 可用 | 自动记录模型调用的 token 用量，按可配置的峰谷单价估算费用；在 DSH Web 中展示今日、本周、本月及累计消费、每日趋势、模型明细和 DeepSeek 账户余额。 |
| [`@team-dsh-plugins/message-navigator`](plugins/message-navigator) | 可用 | 通过带边框的响应式轨道导航长会话中的用户提问，支持当前轮次编号、流式回复提示、悬停预览和按需历史加载。 |
| [`@team-dsh-plugins/mcp-manager`](plugins/mcp-manager) | 可用 | 在 DSH 设置中粘贴或手动添加 MCP Server，安全预检 JSON/JSONC/YAML 与 DSH Profile MCP patch，并通过测试后保存启用、状态反馈和 DSH credentials 管理全局连接。 |
| [`@team-dsh-plugins/plugin-manager`](plugins/plugin-manager) | 可用 | 在 DSH 设置侧边栏中查看、添加、删除、检查更新、更改版本和恢复 Web Profile 的 npm 外源插件。 |

## 快速开始

环境要求：Node.js `^22.19.0 || >=24`、pnpm 10。

```powershell
git clone https://github.com/haoyisun/team_dsh_plugins.git
cd team_dsh_plugins
corepack enable
pnpm install
pnpm run init
pnpm run doctor
npx @deepseek-ai/dsh web
```

`pnpm run init` 会在默认或 `$DSH_HOME` 指定的 DSH Home 中登记本仓库，并建立 `@team-dsh-plugins` 目录映射。被修改的 Profile patch 会备份到仓库 `.backups/`（不进入版本控制）。

外源插件在 DSH 设置的“插件管理”页面维护。页面以 Web Profile 实际安装状态为准，通过官方 DSH plugin 流程执行变更，不在仓库保存本机插件清单。

MCP Server 连接在 DSH 设置的“MCP 管理”页面维护。可以粘贴常见第三方 JSON/JSONC/YAML 配置或 DSH Profile MCP patch，并在结构化预览中修复问题；配置与凭据保存在 DSH Home，不写入仓库。

## 可选 Windows 桌面壳

Windows 用户可以选择使用 [`desktop/`](desktop) 提供的 Electron 壳管理 DSH Web 进程。窗口直接加载完整 DSH Web，支持桌面快捷方式、单实例、托盘、重启 DSH、更新以及随 App 退出清理进程树。

桌面壳目前只支持 Windows，独立于根 pnpm workspace 安装，也不取代官方启动命令。安装和更新步骤见[使用 Windows 桌面壳](docs/how-to/use-windows-desktop.md)。

## 常用命令

- `pnpm run init`：将当前仓库接入 DSH Home。
- `pnpm run doctor`：检查仓库、Profile、目录链接和 DSH 版本。
- `pnpm run unlink`：移除仓库接入，不删除插件设置和数据。
- `pnpm run validate`：校验注册表、包名和 Client module ID。
- `pnpm test`：运行基础设施测试。

## 文档

- [入门教程](docs/tutorials/getting-started.md)
- [新增插件](docs/how-to/add-plugin.md)
- [添加和管理外源插件](docs/how-to/manage-plugins.md)
- [管理 DSH 接入](docs/how-to/manage-integration.md)
- [升级 DSH](docs/how-to/upgrade-dsh.md)
- [使用 Windows 桌面壳](docs/how-to/use-windows-desktop.md)
- [架构说明](docs/explanation/architecture.md)
- [插件开发契约](docs/reference/plugin-contract.md)
- [命令参考](docs/reference/commands.md)
- [架构决策](docs/explanation/decisions/)
- [贡献指南](CONTRIBUTING.md)
- [安全披露](SECURITY.md)

本仓库使用 Diátaxis 组织文档：教程用于学习，How-to 用于完成任务，Reference 描述契约，Explanation 解释设计取舍。

## 许可证

[MIT](LICENSE)
