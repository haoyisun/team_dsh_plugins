# 插件开发契约

## 身份

对于工作区插件 `<id>`：

- 目录：`plugins/<id>/`
- npm 包名：`@team-dsh-plugins/<id>`
- Cordis entry ID：`<id>`
- Web Client module ID：`@team-dsh-plugins/<id>`
- Settings namespace：`<id>`
- Storage domain：将连字符替换为下划线的 `<id>`
- 缓存目录：`$DSH_HOME/cache/<id>/`

`pnpm run validate` 强制检查工作区插件的注册包名、manifest 名和 Client module ID，并静态检查外源注册表。

## 注册

工作区插件必须显式登记在目标 `profiles/<profile>.yml`。数组顺序决定加载顺序；`disabled: true` 表示停用。目录存在不代表启用。

Web Profile 的 npm 外源插件登记在 `profiles/web.external.yml`：

```yaml
- package: dsh-context
  version: '0.44.0'
  entries:
    - id: dsh-context
      name: dsh-context
  disabled: false
```

`package` 只接受 npm registry 包名且不得使用 `@team-dsh-plugins/*`；`version` 必须是精确 semver；`entries` 必须列出 Bundle 插入的全部 Cordis entry 身份。同步会校验实际安装包、Web Profile 直接依赖、Bundle 注册和 entry 身份。修改后运行 `pnpm run sync:external`。删除声明不会卸载插件或改变其最后启停状态。

MCP Client 实例登记在 `profiles/web.mcp.yml`，每项必须使用 `@deepseek-ai/dsh-mcp-client`，并声明唯一的 entry `id` 和 `serverName`。`stdio` 的 `command`、`args`、`cwd` 以及 HTTP headers 中的本机值或认证信息通过 `!!js process.env.NAME` 引用；注册表拒绝本机绝对路径和任意 JavaScript 表达式。`disabled` 省略或为 `false` 时启用，为 `true` 时禁用。

## Host 插件

Host 入口使用 ESM，并导出 `apply(ctx, config)`；按需导出 `name`、`inject` 和配置 Schema。依赖通过 `inject` 声明，副作用必须在 Cordis 生命周期结束时可释放。

插件内部可降级能力应捕获自身边界错误并记录日志，避免非关键能力拖垮 DSH。模块导入和协议不兼容无法在插件内部降级。

## Web Client 插件

manifest 必须导出 `./client` 并声明：

```json
{
  "dsh": {
    "client": {
      "platform": "web",
      "inject": []
    }
  }
}
```

Client artifact 使用 DSH Lazy-CJS 协议，注册 ID 必须等于完整 npm 包名。`inject` 仅描述浏览器模块图，不替代 Host 服务依赖。

## 状态所有权

- 用户可编辑配置：通过 DSH settings 服务按 `<id>` namespace 保存。
- 持久业务数据：通过 storage-domain 保存，不直接写源码仓库。
- 可删除缓存：写入 `$DSH_HOME/cache/<id>/`。
- 密钥：使用 DSH credentials 服务或环境变量。
- 禁用、解除接入和普通升级默认保留全部用户数据。

仓库禁止提交 `.dsh`、`.backups`、环境文件、凭据、会话、缓存或包含本机绝对路径的生成配置。

## 完成标准

行为变更先增加失败测试，再完成实现。提交前运行：

```powershell
pnpm run validate
pnpm test
```

架构或公共契约变化还必须新增 ADR，并更新对应 Reference。
