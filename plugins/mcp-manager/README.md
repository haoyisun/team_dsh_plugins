# @team-dsh-plugins/mcp-manager

在 DSH 设置侧边栏提供全局 MCP Server 的可视化管理：

- 添加、修改、启用、禁用和删除 stdio / Streamable HTTP 实例；
- 使用 DSH credentials 保存敏感参数、环境变量和 headers；
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

打开 DSH 设置，在“MCP 管理”中添加实例。新实例默认禁用；测试或启用 stdio、明文 HTTP 及携带凭据的连接前需要明确确认。确认 challenge 短期有效、只能使用一次，并绑定操作与当前 settings revision。

浏览器只能看到凭据是否已配置，不能读取值或 credential ref。URL 不允许查询参数；环境变量必须作为凭据保存，远程凭据仅支持 HTTPS `Authorization`。测试连接拒绝重定向并限制入站响应体积。该确认用于防止误操作，RPC 的身份安全仍依赖 DSH browser-session authentication。
