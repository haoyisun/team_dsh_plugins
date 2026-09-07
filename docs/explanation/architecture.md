# 架构说明

## 目标

仓库需要同时满足三个约束：开发源码留在 monorepo、继续使用官方裸启动命令、DSH Home 仍负责运行时状态。

## 组成

```text
team_dsh_plugins/
├─ plugins/          # 受信任插件包
├─ profiles/         # 工作区注册表与外源插件声明
├─ scripts/          # 接入与诊断
├─ test/             # 基础设施行为测试
└─ docs/             # Diátaxis 文档与 ADR
```

初始化建立三处接点：

1. Web Profile patch 中的受管 `cordis:include` 分别指向仓库 `profiles/web.yml` 和 `profiles/web.mcp.yml`。
2. 仓库 `node_modules/@team-dsh-plugins` 目录链接指向 `plugins/`，供嵌套 Include 的 Host Loader 解析。
3. `$DSH_HOME/profiles/node_modules/@team-dsh-plugins` 目录链接同样指向 `plugins/`，供 Web Client module scanner 解析。

第一处让 DSH 每次启动读取显式注册表；后两处让 Host Loader 和 Web Client module scanner 都能按同一包名解析插件。仅写绝对插件路径无法可靠支持 Web Client，因为其启动图以包名作为模块 ID。

外源插件使用另一条接入路径：`profiles/web.external.yml` 固定 npm 包及版本，`pnpm run sync:external` 调用官方 `dsh plugin --profile web add` 安装到 Web Profile。插件自己的 `dsh.bundle` 负责注册；仓库只在 Web Profile patch 的独立受管块中维护禁用覆盖，不把外源插件放入工作区 Include。

MCP Server 不属于外源 Bundle。`profiles/web.mcp.yml` 保存 `@deepseek-ai/dsh-mcp-client` 实例，由第二个 Include 直接加载。本机可执行文件、入口路径和认证信息留在启动目录的 `.env` 中，注册表只保留受限的环境变量表达式。

## 状态边界

仓库拥有插件代码、注册表、默认值、维护工具和规范。DSH Home 拥有 Profile 接入引用、用户设置、凭据、会话、持久数据和缓存。所谓保持 `.dsh` 纯粹，是不再复制插件源码或逐插件手工注册，而不是把 DSH 运行状态移出 DSH Home。

## 变化传播

- 修改已有插件代码：目录链接立即指向新代码，重启或 HMR 后生效。
- 新增工作区插件：创建符合 scope 的目录并加入 `profiles/web.yml`，下次启动生效。
- 同步外源插件：修改 `profiles/web.external.yml` 后运行 `pnpm run sync:external`。
- 修改 MCP 实例：编辑 `profiles/web.mcp.yml`；首次接入或仓库移动后运行 `pnpm run init`。
- 禁用插件：在对应注册表设置 `disabled: true`；外源状态经同步写入 Profile 顶层覆盖。
- 删除外源声明：保留已安装包及最后启停状态，`doctor` 报告其已脱管；卸载必须显式执行 DSH plugin remove。
- DSH 升级：接入通常保留，但 Developer Preview 的插件协议可能变化；诊断工具告警而不阻止 latest。

## 安全边界

启用插件等同于以当前用户权限执行代码。工作区插件以仓库和代码审查为信任边界；外源插件还信任 npm registry、包维护者及固定版本的发布物。外源注册表只接受 npm 包名和精确版本，不接受仓库外路径、URL 或 git spec；密钥与运行数据不进入版本控制。
