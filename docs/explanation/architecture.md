# 架构说明

## 目标

仓库需要同时满足三个约束：开发源码留在 monorepo、继续使用官方裸启动命令、DSH Home 仍负责运行时状态。

## 组成

```text
team_dsh_plugins/
├─ plugins/          # 受信任插件包
├─ profiles/         # 显式 Cordis 注册表
├─ scripts/          # 接入与诊断
├─ test/             # 基础设施行为测试
└─ docs/             # Diátaxis 文档与 ADR
```

初始化建立三处接点：

1. Web Profile patch 中的受管 `cordis:include` 指向仓库 `profiles/web.yml`。
2. 仓库 `node_modules/@team-dsh-plugins` 目录链接指向 `plugins/`，供嵌套 Include 的 Host Loader 解析。
3. `$DSH_HOME/profiles/node_modules/@team-dsh-plugins` 目录链接同样指向 `plugins/`，供 Web Client module scanner 解析。

第一处让 DSH 每次启动读取显式注册表；后两处让 Host Loader 和 Web Client module scanner 都能按同一包名解析插件。仅写绝对插件路径无法可靠支持 Web Client，因为其启动图以包名作为模块 ID。

## 状态边界

仓库拥有插件代码、注册表、默认值、维护工具和规范。DSH Home 拥有 Profile 接入引用、用户设置、凭据、会话、持久数据和缓存。所谓保持 `.dsh` 纯粹，是不再复制插件源码或逐插件手工注册，而不是把 DSH 运行状态移出 DSH Home。

## 变化传播

- 修改已有插件代码：目录链接立即指向新代码，重启或 HMR 后生效。
- 新增插件：创建符合 scope 的目录并加入注册表，下次启动生效。
- 禁用插件：在注册表设置 `disabled: true`。
- DSH 升级：接入通常保留，但 Developer Preview 的插件协议可能变化；诊断工具告警而不阻止 latest。

## 安全边界

启用插件等同于以当前用户权限执行仓库代码。仓库和代码审查是信任边界；注册表不接受仓库外路径，密钥与运行数据不进入版本控制。
