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

该命令只做一次性接入：在 Web Profile 中引用 `profiles/web.yml` 和 `profiles/web.mcp.yml`，并让 `@team-dsh-plugins/*` 解析到本仓库的 `plugins/`。MCP 实例默认可以保持禁用；启用方法见[添加和管理 MCP Server](../how-to/manage-mcp-servers.md)。

## 4. 同步外源插件

仓库的 `profiles/web.external.yml` 非空时，显式同步其中固定版本的 npm 插件：

```powershell
pnpm run sync:external
```

空清单不会安装任何内容。同步不会自动卸载已经安装但后来移出清单的插件。

## 5. 检查接入

```powershell
pnpm run doctor
```

未知 DSH 版本只产生告警。注册表、包身份或目录链接错误会使检查失败。

## 6. 启动

```powershell
npx @deepseek-ai/dsh web
```

后续更新已有插件代码或修改注册表后，继续使用同一条官方命令。注册表由 DSH Include/HMR 读取，无需复制插件源码到 `.dsh`。
