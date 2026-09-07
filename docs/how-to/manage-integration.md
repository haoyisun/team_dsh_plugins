# 管理 DSH 接入

## 初始化

```powershell
pnpm run init
```

命令使用 `$DSH_HOME`；未设置时使用用户目录下的 `.dsh`。它会备份并幂等更新 Web Profile patch，将工作区插件和 MCP 注册表作为两个 Include 接入，然后建立 `@team-dsh-plugins` scope 目录链接。

## 诊断

```powershell
pnpm run doctor
```

错误表示接入不可用；未知 DSH 版本是告警，不阻止继续运行。插件协议级不兼容时，在对应的工作区或外源注册表中将条目标记为 `disabled: true`。

## 同步外源插件

在 `profiles/web.external.yml` 声明经过审查的 npm 包、精确版本、Bundle entries 和 `disabled` 状态，然后执行：

```powershell
pnpm run sync:external
pnpm run doctor
```

同步命令通过官方 DSH plugin 流程安装缺失版本或对齐版本，并将禁用状态写入 Web Profile 的独立受管覆盖。它不会在 `init` 或启动时自动联网。

从清单删除条目只会停止仓库继续管理该插件：已安装包及最后启停状态保持不变。确认不再需要后，手工卸载：

```powershell
npx @deepseek-ai/dsh plugin --profile web remove <package>
```

外源包会以当前用户权限执行。提交清单变更前应核对包名、发布者、版本和 Bundle entry 身份，不要使用 `latest`、版本范围、URL、git spec 或文件路径。

完整的添加、禁用、启用、升级和卸载步骤见[添加和管理外源插件](manage-external-plugins.md)。

## 管理 MCP Server

MCP Client 实例登记在 `profiles/web.mcp.yml`，不走外源插件安装流程。本机命令、路径和认证信息应放在不入库的 `.env` 中，通过受限的 `!!js process.env.NAME` 表达式引用。

完整步骤见[添加和管理 MCP Server](manage-mcp-servers.md)。

## 解除接入

```powershell
pnpm run unlink
```

该命令只移除受管 Include 和 scope 链接。插件设置、业务数据、缓存和会话均不会删除。

## 更换仓库路径

移动已有仓库后，先重建 pnpm 依赖链接，再重新初始化接入：

```powershell
pnpm install --force
pnpm run init
pnpm run doctor
```

重新 clone 到新路径时，使用普通的 `pnpm install`，然后运行 `init` 和 `doctor`。

`init` 会自动替换指向旧仓库或目标已经不存在的受管 scope 链接，并更新 Web Profile 中的仓库引用。为避免覆盖用户文件，同名路径如果是真实目录而不是符号链接或 Junction，命令仍会报错并停止。不要手工复制插件到 `.dsh/profiles/node_modules`。
