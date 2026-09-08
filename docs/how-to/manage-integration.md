# 管理 DSH 接入

## 初始化

```powershell
pnpm run init
```

命令使用 `$DSH_HOME`；未设置时使用用户目录下的 `.dsh`。它会备份并幂等更新 Web Profile patch，将工作区插件注册表作为 Include 接入，然后建立 `@team-dsh-plugins` scope 目录链接。

## 诊断

```powershell
pnpm run doctor
```

错误表示接入不可用；未知 DSH 版本是告警，不阻止继续运行。工作区插件协议不兼容时，在 `profiles/web.yml` 中将对应条目标记为 `disabled: true`。

## 管理外源插件

启动 DSH 后打开设置侧边栏中的“插件管理”。该页面读取当前 Web Profile 的实际状态，并通过官方 DSH plugin 流程添加、删除、检查更新和更改 npm 外源插件版本。

外源包会以当前用户权限执行。管理器只接受 npm registry 包名、`latest` 或精确 semver，不接受版本范围、其他 tag、URL、git spec 或文件路径。Bundle 变更后需重启 DSH Web。完整步骤和紧急恢复命令见[添加和管理外源插件](manage-plugins.md)。

## 管理 MCP Server

启动 DSH 后打开设置侧边栏中的“MCP 管理”。可以直接粘贴第三方 JSON/JSONC/YAML 配置，也可以粘贴 `insert` 中注册 `@deepseek-ai/dsh-mcp-client` 的 DSH Profile patch；核对解析提示和凭据分类后测试并启用。也可以切换到手动表单。该页面管理全局 stdio 和 Streamable HTTP 连接，支持测试、启停、重新启动、工具查看和删除。

实例配置及凭据属于 DSH Home，不写入本仓库。插件只管理连接，不安装或升级 MCP Server。

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
