# 添加和管理 MCP Server

MCP Server 配置与外源 DSH 插件不同：

- `profiles/web.external.yml` 管理需要安装的 npm Bundle 插件；
- `profiles/web.mcp.yml` 管理 `@deepseek-ai/dsh-mcp-client` 的连接实例。

MCP 实例不需要运行 `pnpm run sync:external`。`pnpm run init` 会将 `profiles/web.mcp.yml` 作为独立 Cordis Include 接入 Web Profile。

## 启用内置的 DBX 示例

仓库已经提供默认禁用的 `mcp-dbx`：

```yaml
- id: mcp-dbx
  name: '@deepseek-ai/dsh-mcp-client'
  disabled: true
  config:
    serverName: dbx
    transport: stdio
    command: !!js process.env.DSH_MCP_DBX_COMMAND
    args:
      - !!js process.env.DSH_MCP_DBX_ENTRY
```

### 1. 创建本机环境文件

从仓库根目录执行：

```powershell
Copy-Item .env.example .env
```

编辑不会进入版本控制的 `.env`：

```dotenv
DSH_MCP_DBX_COMMAND=node
DSH_MCP_DBX_ENTRY=<本机 dbx MCP Server 的 dist/index.js 路径>
```

如果 `node` 不在 `PATH`，可以把 `DSH_MCP_DBX_COMMAND` 设置为本机 `node.exe` 的完整路径。不要把这些绝对路径直接写入 `profiles/web.mcp.yml`。

### 2. 启用实例

将 `profiles/web.mcp.yml` 中的：

```yaml
disabled: true
```

改为：

```yaml
disabled: false
```

省略 `disabled` 也表示启用。

### 3. 接入并检查

首次使用或仓库位置变化后执行：

```powershell
pnpm run validate
pnpm run init
pnpm run doctor
npx @deepseek-ai/dsh web
```

DSH 从仓库根目录启动时会读取该目录的 `.env`。如果 DSH 已经运行，Include/HMR 通常会重新加载配置；进程环境变量发生变化时仍需重启 DSH。

## 添加另一个 stdio MCP Server

在 `profiles/web.mcp.yml` 追加一个条目：

```yaml
- id: mcp-example
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: example
    transport: stdio
    command: !!js process.env.DSH_MCP_EXAMPLE_COMMAND
    args:
      - !!js process.env.DSH_MCP_EXAMPLE_ENTRY
```

然后在本机 `.env` 中提供对应变量，再运行 `pnpm run validate` 和 `pnpm run doctor`。

字段要求：

- `id` 在 `profiles/web.mcp.yml` 中唯一；
- `serverName` 匹配 `[A-Za-z0-9_-]{1,32}` 且唯一；
- `name` 固定为 `@deepseek-ai/dsh-mcp-client`；
- `command`、`args` 和 `cwd` 不得在仓库中包含本机绝对路径；
- `!!js` 只允许直接读取 `process.env.NAME`。

## 添加 Streamable HTTP MCP Server

```yaml
- id: mcp-remote
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: remote
    transport: streamable-http
    url: https://mcp.example.com
    headers:
      Authorization: !!js process.env.DSH_MCP_REMOTE_AUTHORIZATION
```

认证信息必须通过环境变量提供，不得提交到 YAML 或 `.env.example`。

## 禁用和重新启用

禁用：

```yaml
disabled: true
```

重新启用：

```yaml
disabled: false
```

禁用只会停止该 MCP Client 实例，不会删除 MCP Server 软件、本机环境变量或其他数据。

## 删除实例

从 `profiles/web.mcp.yml` 删除对应条目即可。该操作只移除 DSH 中的连接实例，不会卸载外部 MCP Server。

## 常见问题

### `本机绝对路径`

把路径移入仓库根目录的 `.env`，在 YAML 中通过 `!!js process.env.NAME` 引用。

### `仅允许读取环境变量`

仓库禁止在 `!!js` 中执行任意 JavaScript。只允许：

```yaml
!!js process.env.DSH_MCP_EXAMPLE_VALUE
```

### MCP 启动失败

依次确认：

1. `disabled` 已设为 `false`；
2. 从仓库根目录启动 DSH；
3. `.env` 中的命令和入口路径存在；
4. 在 PowerShell 中手工运行相同命令和参数；
5. `serverName` 没有与其他 MCP 实例重复。
