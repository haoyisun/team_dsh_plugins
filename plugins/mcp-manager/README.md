# @team-dsh-plugins/mcp-manager

在 DSH 设置侧边栏提供全局 MCP Server 的可视化管理：

- 添加、修改、启用、禁用和删除 stdio / Streamable HTTP 实例；
- 粘贴 JSON、JSONC、YAML、Markdown 代码块、完整 `mcpServers` 或 DSH Profile MCP patch 并安全预检；
- 使用 DSH credentials 保存敏感参数、环境变量和 HTTPS headers；
- 测试连接并查看 Server 暴露的工具与输入 Schema；
- 通过官方 `@deepseek-ai/dsh-mcp-client` 动态托管已启用实例。

插件只管理连接配置，不安装或升级 MCP Server。配置属于当前用户的 DSH Home，不写入源码仓库。

## 使用

运行仓库接入和检查：

```powershell
pnpm install
pnpm run init
pnpm run doctor
npx @deepseek-ai/dsh web
```

打开 DSH 设置，在“MCP 管理”中添加实例。默认入口可以直接粘贴第三方配置：

1. 粘贴配置并选择“解析配置”；
2. 核对自动修复、阻塞问题和凭据分类；
3. 单个 Server 选择“保存并启用”，系统会先测试，再保存并启动；
4. 多个 Server 可以一次保存为禁用，之后逐个测试和启用。

也可以切换到“手动填写”。必填项使用 `*` 标识，工具调用超时和重连参数位于默认折叠的“高级设置”中。列表中的“启用”同样会先执行连接测试；编辑已启用实例时，“测试并应用”只有在候选配置通过测试后才会替换旧配置。

测试或启用 stdio、明文 HTTP 及携带凭据的连接前需要明确确认。确认 challenge 短期有效、只能使用一次，并绑定操作、启动内容与当前 settings revision。

浏览器只能读取已保存凭据是否已配置，不能读取值或 credential ref。非敏感环境变量可以保存为普通值；敏感名称必须使用凭据。自定义 Header 凭据只允许通过 HTTPS 发送。URL 不允许包含凭据、查询参数或 fragment；测试连接拒绝重定向并限制入站响应体积。

导入器不会静默猜测未知启动字段、不支持的 transport、凭据占位符或可疑路径转义。修复报告、错误和诊断信息不得包含凭据。执行确认用于防止误操作，RPC 的身份安全仍依赖 DSH browser-session authentication。
