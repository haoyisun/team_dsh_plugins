# Agent 工作约束

本仓库由 AI Coding 团队维护。先确认任务所属分支，再读取对应文档：

- 新增或修改插件：读取 `docs/reference/plugin-contract.md`；新增插件同时读取 `docs/how-to/add-plugin.md`。
- 修改接入、注册表或维护脚本：读取 `docs/explanation/architecture.md` 和相关 ADR。
- 修改 DSH Home：只调用 `scripts/cli.mjs` 提供的流程；接入块之外的用户配置与数据属于用户。
- 改变架构或公共契约：在 `docs/explanation/decisions/` 新增 ADR，并更新受影响的 Reference。

始终保持以下不变量：

- 插件包名为 `@dsh-plugins/<id>`，目录为 `plugins/<id>`，Client module ID 等于完整包名。
- `profiles/*.yml` 是唯一插件注册源；只有显式注册且未禁用的插件才加载。
- 设置、持久数据、缓存和凭据遵循插件开发契约，仓库不接收本机绝对路径、密钥或运行数据。
- 行为变更先写失败测试；完成后运行 `pnpm run validate` 和 `pnpm test`。
- DSH 仍通过 `npx @deepseek-ai/dsh web` 启动；不要引入仓库专用启动包装器。
