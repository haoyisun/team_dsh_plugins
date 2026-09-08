# 架构说明

## 目标

仓库需要同时满足三个约束：开发源码留在 monorepo、继续使用官方裸启动命令、DSH Home 仍负责运行时状态。

## 组成

```text
team_dsh_plugins/
├─ plugins/          # 受信任插件包
├─ profiles/         # 工作区插件注册表
├─ scripts/          # 接入与诊断
├─ test/             # 基础设施行为测试
└─ docs/             # Diátaxis 文档与 ADR
```

初始化建立三处接点：

1. Web Profile patch 中的受管 `cordis:include` 指向仓库 `profiles/web.yml`。
2. 仓库 `node_modules/@team-dsh-plugins` 目录链接指向 `plugins/`，供嵌套 Include 的 Host Loader 解析。
3. `$DSH_HOME/profiles/node_modules/@team-dsh-plugins` 目录链接同样指向 `plugins/`，供 Web Client module scanner 解析。

第一处让 DSH 每次启动读取显式注册表；后两处让 Host Loader 和 Web Client module scanner 都能按同一包名解析插件。仅写绝对插件路径无法可靠支持 Web Client，因为其启动图以包名作为模块 ID。

外源插件使用 DSH 自身的 Bundle 接入路径。工作区插件 `@team-dsh-plugins/plugin-manager` 从 Web Profile 读取直接依赖、Bundle 列表和已安装 manifest，并在设置页调用当前 DSH 版本的官方 plugin 流程完成添加、卸载和版本变化。仓库不保存外源插件清单或复制其运行状态。

MCP Server 连接由工作区插件 `@team-dsh-plugins/mcp-manager` 管理。插件把实例配置保存在 DSH settings、把敏感值交给 DSH credentials，并通过 Cordis 子 Fiber 动态托管官方 `@deepseek-ai/dsh-mcp-client`。仓库只保存管理器代码，不保存本机实例。

## 状态边界

仓库拥有插件代码、注册表、默认值、维护工具和规范。DSH Home 拥有 Profile 接入引用、用户设置、凭据、会话、持久数据和缓存。所谓保持 `.dsh` 纯粹，是不再复制插件源码或逐插件手工注册，而不是把 DSH 运行状态移出 DSH Home。

## 变化传播

- 修改已有插件代码：目录链接立即指向新代码，重启或 HMR 后生效。
- 新增工作区插件：创建符合 scope 的目录并加入 `profiles/web.yml`，下次启动生效。
- 修改外源插件：在 DSH 设置侧边栏的“插件管理”页面操作，重启 DSH Web 后生效。
- 修改 MCP 实例：在 DSH 设置侧边栏的“MCP 管理”页面操作，保存后由管理器更新子实例。
- 禁用工作区插件：在 `profiles/web.yml` 设置 `disabled: true`。插件管理器不改写外源插件的 Profile 禁用覆盖。
- 删除外源插件：从 Web Profile 卸载包及 Bundle 注册，保留插件设置和业务数据。
- DSH 升级：接入通常保留，但 Developer Preview 的插件协议可能变化；诊断工具告警而不阻止 latest。

## 安全边界

启用插件或 stdio MCP Server 等同于以当前用户权限执行代码。工作区插件以仓库和代码审查为信任边界；外源插件还信任 npm registry、包维护者、目标版本及依赖的生命周期脚本。插件管理器拒绝版本范围、URL、git spec 和本地路径，使用短期单次确认绑定精确操作，并只向浏览器返回脱敏摘要。MCP 管理器不向浏览器返回 credential ref；stdio、明文 HTTP 和携带凭据的连接在首次执行或目标、启动参数、凭据变化后使用短期单次 challenge 确认。该确认用于防止误操作，DSH browser-session authentication 仍是 RPC 的身份信任边界；密钥与运行数据不进入版本控制。
