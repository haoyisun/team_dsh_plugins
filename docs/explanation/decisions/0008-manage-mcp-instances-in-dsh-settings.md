# ADR-008：在 DSH Settings 中管理 MCP 实例

## 状态

Accepted；凭据字段范围与测试后启用流程由 ADR-011 扩展

## 日期

2026-09-07

## 背景

ADR-007 使用仓库 `profiles/web.mcp.yml`、环境变量和第二个 Cordis Include 管理 MCP Client 实例。该设计能评审非敏感结构，但用户仍需在 YAML、`.env` 和 DSH 运行状态之间切换；添加、修改和诊断连接的操作成本过高。

MCP 实例通常包含本机命令、路径和凭据，本质上属于单机 DSH 状态，不适合作为仓库共享配置。

## 决策

- 新增工作区插件 `@team-dsh-plugins/mcp-manager`，在 `settings.section` 注册独立“MCP 管理”页面。
- 实例配置保存在 DSH settings 的 `mcp-manager` namespace；敏感参数使用 DSH credentials，浏览器只能查看是否已配置、替换或清除，不能读取原值或 credential ref。Host 按实例 ID 与字段路径绑定凭据，Client 不能选择或复用 ref。
- 管理器通过 Cordis 子 Fiber 动态托管官方 `@deepseek-ai/dsh-mcp-client`，不改写 `cordis.patch.yml`。
- 首版支持全局 stdio 和 Streamable HTTP 实例的添加、修改、测试、启停、重载、删除及工具查看，不安装 MCP Server，也不管理 Agent 级分配。
- 新实例默认禁用。stdio、明文 HTTP，以及携带凭据的远程连接首次执行或目标、启动参数、凭据发生变化后，必须重新确认。Host 使用短期、单次、绑定操作与 revision 的 challenge，列表接口不返回可复用确认值。
- 所有写操作使用 settings revision 拒绝过期更新；删除实例同时删除其关联 credentials。
- URL 不接受查询参数或 fragment；环境变量必须使用 credentials，HTTP header 默认使用 credentials，仅少数无敏感语义的标准 header 可保存 literal。远程凭据仅允许 HTTPS `Authorization`，避免自定义秘密 Header 随跨源重定向转发；参数中的常见认证形态也会被拒绝，但管理器不能判断任意字符串的业务语义，用户仍必须把秘密标记为凭据。
- 测试连接拒绝 HTTP 重定向，在传输读取阶段限制响应字节，并继续限制分页数、工具数和重复 cursor；Server 返回的错误、工具描述和 Schema 在进入 RPC 前按已解析凭据递归脱敏。
- 运行状态只声明管理器可可靠观察的子 Fiber 状态、工具数量和启动错误，不把“已加载”描述为精确网络连接状态。
- 删除 `profiles/web.mcp.yml`、第二个 Include、注册表校验脚本及专用 How-to；ADR-007 保留并标记为 Superseded。

## 备选方案

- 保留独立 MCP 注册表：可评审，但没有解决操作复杂度和本机状态进入仓库的问题。
- 让管理插件继续改写 Profile patch：会重新引入文件冲突、自举和 HMR 一致性问题。
- 在管理器中重写 MCP 工具桥接：可以提供更细的连接遥测，但会复制官方客户端的协议、安全和重连逻辑。
- 自动安装任意 MCP Server：会把连接管理器扩大为具有更高风险的包管理器和命令执行器。

## 结果

仓库只负责发布和接入管理插件。MCP 实例、路径和凭据留在 DSH Home，用户可在与 DSH 一致的设置界面中完成日常操作。管理器依赖 DSH 的 settings、credentials、connection RPC、tools 和 Cordis 生命周期能力；缺失这些能力时插件应保持不可用，而不是回退到改写配置文件。

确认对误操作提供防护，不是对已取得 DSH 浏览器会话控制权的攻击者建立第二套身份认证。RPC 仍以 DSH 的 browser-session authentication 为信任边界；若未来 DSH 提供可在空闲 Settings 操作中使用、带 Host 审计的人类审批 seam，应迁移到该能力。
