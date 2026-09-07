# 添加和管理外源插件

外源插件是发布到 npm、但源码不在本仓库 `plugins/` 中的 DSH 插件。它们统一声明在 `profiles/web.external.yml`，通过 `pnpm run sync:external` 安装和同步状态。

不要把外源插件写入 `profiles/web.yml`。该文件只登记 `@team-dsh-plugins/*` 工作区插件。

如果要配置 `@deepseek-ai/dsh-mcp-client` 连接实例，请使用 [`profiles/web.mcp.yml`](manage-mcp-servers.md)，不要把 MCP 配置写入外源插件清单。

## 前置条件

先完成仓库依赖安装和 DSH 接入：

```powershell
pnpm install
pnpm run init
```

外源插件会以当前用户权限执行。添加前应核对 npm 包名、发布者、许可证、版本和插件文档。

## 添加并启用插件

以 `dsh-context@0.44.0` 为例，在 `profiles/web.external.yml` 中加入：

```yaml
- package: dsh-context
  version: '0.44.0'
  entries:
    - id: dsh-context
      name: dsh-context
  disabled: false
```

然后执行：

```powershell
pnpm run validate
pnpm run sync:external
pnpm run doctor
```

`sync:external` 会调用等价的官方安装流程：

```powershell
npx @deepseek-ai/dsh plugin --profile web add --save-exact dsh-context@0.44.0
```

同步还会确认插件：

- 是 Web Profile 的精确直接依赖；
- 已加入 `dsh.profile.bundles`；
- 实际 Bundle entries 与 YAML 声明一致。

最后照常启动：

```powershell
npx @deepseek-ai/dsh web
```

## 如何填写 `entries`

`entries` 不是随意命名的别名，而是插件 Bundle patch 实际插入的 Cordis 行。

优先查看插件文档或源码中的 `package.json`：

```json
{
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

再查看该 patch 文件中的 `insert`：

```yaml
- insert:
    - id: dsh-context
      name: dsh-context
```

把每个插入行的 `id` 和 `name` 原样写入 `entries`。一个包插入多行时必须全部声明。填写错误时，`sync:external` 会以“Bundle entries 与声明不一致”停止，不会写入禁用覆盖。

## 禁用插件

将对应条目的 `disabled` 改为 `true`：

```yaml
- package: dsh-context
  version: '0.44.0'
  entries:
    - id: dsh-context
      name: dsh-context
  disabled: true
```

执行：

```powershell
pnpm run sync:external
pnpm run doctor
```

禁用只会在 Web Profile patch 中写入受管覆盖，不会卸载 npm 包，也不会删除设置、持久数据、缓存或凭据。

## 重新启用插件

将 `disabled` 改回 `false`，再次执行：

```powershell
pnpm run sync:external
pnpm run doctor
```

同步会移除对应的受管禁用覆盖。

## 升级或降级版本

将 `version` 改为另一个精确版本，例如：

```yaml
version: '0.45.0'
```

然后运行 `pnpm run sync:external`。不要使用 `latest`、`^0.45.0`、`~0.45.0` 或 `*`；版本变化必须通过清单和代码评审明确发生。

## 停止管理与彻底卸载

直接从 `profiles/web.external.yml` 删除条目，只表示停止由仓库管理。同步不会自动卸载该包，也不会改变它最后的启停状态；`doctor` 会报告“已脱离仓库管理”。

如果需要彻底卸载，先停止正在运行的 DSH，然后按以下顺序操作：

1. 保留声明，将 `disabled` 设为 `false` 并运行 `pnpm run sync:external`，清除受管禁用覆盖。
2. 运行：

   ```powershell
   npx @deepseek-ai/dsh plugin --profile web remove dsh-context
   ```

3. 从 `profiles/web.external.yml` 删除该条目。
4. 运行 `pnpm run validate` 和 `pnpm run doctor`。

卸载 npm 包不等于删除插件数据；如需清理设置、缓存或持久数据，应按插件自己的文档单独操作。

## 常见错误

### `version 必须是精确 semver`

把版本改为完整版本号，例如 `'0.44.0'` 或 `'1.0.0-rc.1'`。

### `Bundle entries 与声明不一致`

检查该版本插件的 `dsh.bundle.patch` 文件，确保所有 `insert` 行的 `id` 和 `name` 与清单完全一致。

### `尚未安装`、`版本漂移` 或 `未注册到 Web Profile Bundle`

运行：

```powershell
pnpm run sync:external
pnpm run doctor
```

如果同步失败，先确认 Node.js、pnpm、npm registry 和 DSH CLI 可用，再根据命令输出处理安装错误。

### `已脱离仓库管理`

这表示包仍安装在 Web Profile 中，但清单已不再声明它。根据需要恢复声明，或按上面的“彻底卸载”流程处理。
