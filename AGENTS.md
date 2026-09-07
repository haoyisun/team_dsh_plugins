# Agent 工作约束

本仓库是 GitHub 开源项目，由 AI Coding 团队维护。先确认任务所属分支，再读取对应文档：

- 新增或修改插件：读取 `docs/reference/plugin-contract.md`；新增插件同时读取 `docs/how-to/add-plugin.md`；完成前核对并维护根 `README.md` 的“插件列表”。
- 修改接入、注册表或维护脚本：读取 `docs/explanation/architecture.md` 和相关 ADR。
- 修改 DSH Home：只调用 `scripts/cli.mjs` 提供的流程；接入块之外的用户配置与数据属于用户。
- 改变架构或公共契约：在 `docs/explanation/decisions/` 新增 ADR，并更新受影响的 Reference。
- 对外贡献与发布：读取 `CONTRIBUTING.md`、`SECURITY.md` 和 `CHANGELOG.md`。

始终保持以下不变量：

- 工作区插件包名为 `@team-dsh-plugins/<id>`，目录为 `plugins/<id>`，Client module ID 等于完整包名；外源插件不得使用该 scope。
- 根 `README.md` 的“插件列表”是公开插件索引；新增、删除或修改插件功能、状态、包名、路径时必须同步更新对应条目及说明。
- `profiles/web.yml` 是工作区插件注册源，`profiles/web.external.yml` 是 npm 外源插件声明源，`profiles/web.mcp.yml` 是 MCP Client 实例注册源；禁止目录扫描。
- 外源插件固定精确版本，只能通过 `pnpm run sync:external` 调用官方 DSH plugin 流程同步；配置删除不得自动卸载或改变最后启停状态。
- MCP 注册表不得包含本机绝对路径、凭据或任意 `!!js`；机器相关值只通过 `!!js process.env.NAME` 引用。
- 设置、持久数据、缓存和凭据遵循插件开发契约，仓库不接收本机绝对路径、密钥或运行数据。
- 行为变更先写失败测试；完成后运行 `pnpm run validate` 和 `pnpm test`。
- DSH 仍通过 `npx @deepseek-ai/dsh web` 启动；不要引入仓库专用启动包装器。
- 公开文档保持简体中文；代码标识、命令、文件名和正式技术术语保留英文。
