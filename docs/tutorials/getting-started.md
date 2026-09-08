# 从零接入插件仓库

本教程完成一次全新接入，并验证 DSH 能从仓库加载插件。

## 1. 准备环境

安装 DSH 支持的 Node.js，并启用 pnpm：

```powershell
node --version
corepack enable
pnpm --version
```

## 2. 克隆并安装依赖

```powershell
git clone https://github.com/haoyisun/team_dsh_plugins.git
cd team_dsh_plugins
pnpm install
```

## 3. 接入 DSH

```powershell
pnpm run init
```

该命令只做一次性接入：在 Web Profile 中引用 `profiles/web.yml`，并让 `@team-dsh-plugins/*` 解析到本仓库的 `plugins/`。

## 4. 检查接入

```powershell
pnpm run doctor
```

未知 DSH 版本只产生告警。注册表、包身份或目录链接错误会使检查失败。

## 5. 启动

```powershell
npx @deepseek-ai/dsh web
```

后续更新已有工作区插件代码或修改注册表后，继续使用同一条官方命令。注册表由 DSH Include/HMR 读取，无需复制插件源码到 `.dsh`。

启动后可在设置侧边栏中：

- 使用“插件管理”添加、删除或更改 npm 外源插件版本；
- 使用“MCP 管理”添加和维护 MCP Server 连接。

外源 Bundle 发生变化后需要重新启动 DSH Web。
