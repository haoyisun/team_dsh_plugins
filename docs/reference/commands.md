# 命令参考

所有维护命令从仓库根目录执行。

## `pnpm run init`

校验仓库后，将 `profiles/web.yml` 和 `profiles/web.mcp.yml` 作为嵌套 Cordis Include 接入 DSH Web Profile，并建立 `@team-dsh-plugins` scope 目录链接。可重复执行。

仓库路径改变后再次执行时，命令会更新 Profile 引用，并自动替换指向旧仓库或目标已不存在的 scope 链接。它不会覆盖同名真实目录。

## `pnpm run doctor`

检查：

- 注册表、package manifest 和 Client module ID；
- Web Profile 受管 Include；
- scope 链接目标；
- MCP 注册表结构和接入路径；
- 外源插件安装版本与受管禁用覆盖；
- 当前 DSH 版本是否经过验证。

未知版本产生告警，其他接入错误返回非零退出码。

## `pnpm run unlink`

删除受管 Include 和当前仓库拥有的 scope 链接。拒绝删除真实目录或其他仓库拥有的链接，不删除插件数据。

## `pnpm run validate`

只检查工作区、外源和 MCP 注册表的静态契约，不读取或修改 `.dsh`。

## `pnpm run sync:external`

读取 `profiles/web.external.yml`，对缺失或版本漂移的包调用：

```powershell
npx @deepseek-ai/dsh plugin --profile web add --save-exact <package>@<version>
```

命令会验证包是 Web Profile 的精确直接依赖、已经加入 Bundle 层，且实际 Bundle entries 与声明一致；随后同步 Web Profile patch 中的受管禁用覆盖。它不会卸载未声明插件，也不会删除插件设置、数据、缓存或凭据。声明删除后保留最后启停状态，`doctor` 会将遗留覆盖报告为脱管。

操作示例和 `entries` 获取方法见[添加和管理外源插件](../how-to/manage-external-plugins.md)。

## `pnpm test`

使用 Node.js 内置测试运行器验证初始化幂等、配置保留、解除接入、身份校验和版本告警策略。

## `npx @deepseek-ai/dsh web`

唯一的 DSH Web 启动方式。维护脚本只负责一次性接入，不包装或替代官方启动命令。
