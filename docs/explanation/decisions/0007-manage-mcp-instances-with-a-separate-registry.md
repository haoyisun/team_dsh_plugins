# ADR-007：以独立注册表管理 MCP 实例

## 状态

Superseded by [ADR-008](0008-manage-mcp-instances-in-dsh-settings.md)

## 日期

2026-09-07

## 背景

DSH 通过 `@deepseek-ai/dsh-mcp-client` 的 Cordis entry 连接 MCP Server。该配置创建插件实例，而不是安装带 `dsh.bundle` 的 npm 插件，因此不能复用 `profiles/web.external.yml` 的安装、版本和 Bundle 校验语义。

stdio MCP 配置经常包含本机可执行文件和入口路径，HTTP MCP 可能包含认证 header。把这些值直接提交到仓库会耦合机器状态并扩大泄密风险。

## 决策

- `profiles/web.mcp.yml` 是 Web Profile 的 MCP Client 实例注册源。
- `pnpm run init` 在现有受管块中增加第二个 `cordis:include`，直接加载 MCP 注册表。
- 每个条目的 `name` 固定为 `@deepseek-ai/dsh-mcp-client`；entry `id` 和 `serverName` 必须唯一。
- 本机路径、命令参数和认证信息放在不入库的 `.env`，YAML 只通过 `!!js process.env.NAME` 引用。
- 为降低 `!!js` 的代码执行风险，静态校验只接受直接环境变量读取，拒绝其他 JavaScript 表达式。
- `disabled: true` 停用实例；省略或设为 `false` 时启用。删除条目只移除连接，不卸载 MCP Server。

## 备选方案

- 扩展 `profiles/web.external.yml`：会把“安装 Bundle”和“实例化已有插件”混为一种契约。
- 直接维护 DSH Home 的 `cordis.patch.yml`：符合官方手工流程，但无法通过仓库评审共享非敏感配置。
- 将本机绝对路径提交到注册表：操作简单，但不可移植，并违反运行时状态边界。
- 允许任意 `!!js`：最灵活，但注册表将成为不受约束的代码执行入口。

## 结果

工作区插件、npm 外源插件和 MCP 实例分别使用 `profiles/web.yml`、`profiles/web.external.yml` 和 `profiles/web.mcp.yml`。三者均显式管理但生命周期不同。仓库可共享 MCP 身份和传输结构，本机路径及凭据仍由用户环境持有。

该方案要求用户编辑 YAML、维护环境变量并再次运行接入流程，实际操作成本过高。ADR-008 用 DSH Settings 内的可视化管理插件替代了注册表；相关注册表、Include 和操作文档已删除。
