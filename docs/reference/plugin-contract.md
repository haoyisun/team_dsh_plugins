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

`pnpm run validate` 强制检查工作区插件的注册包名、manifest 名和 Client module ID。

## 注册

工作区插件必须显式登记在目标 `profiles/<profile>.yml`。数组顺序决定加载顺序；`disabled: true` 表示停用。目录存在不代表启用。

Web Profile 的 npm 外源插件由 `@team-dsh-plugins/plugin-manager` 管理。实际安装状态属于 DSH Home，不登记到仓库；管理器只接受 npm registry 包名、`latest` 或精确 semver，并通过当前 DSH 版本的官方 plugin 流程增删直接 Bundle 依赖。系统 Bundle、工作区插件和管理器自身只读。变更必须全局串行并在结束后核对 Profile；失败时按操作前精确版本尽力补偿，补偿结果和当前实际状态必须对用户可见。

外源插件的设置、持久数据、缓存和凭据不会随卸载删除。Bundle 新增、删除、修复和版本变化需要重启 DSH Web；宿主重启前，管理器必须保留待生效提示并允许安全撤销可逆变更。

MCP Client 实例由 `@team-dsh-plugins/mcp-manager` 管理。实例配置写入 DSH settings 的 `mcp-manager` namespace，敏感参数写入 DSH credentials；Client 不得读取或提交 credential ref，Host 按实例 ID 与字段路径绑定。所有写操作必须携带 settings revision。管理器通过 Cordis 子 Fiber 动态托管官方 `@deepseek-ai/dsh-mcp-client`，不得改写 Profile patch，也不得将实例或本机路径提交到仓库。

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
