# @team-dsh-plugins/plugin-manager

在 DSH 设置侧边栏中可视化管理当前 Web Profile 的 npm 外源插件。

## 功能

- 查看外源 Bundle、DSH 系统 Bundle 和工作区插件；
- 为本页的查询和安装单独设置 npm registry（写入 DSH settings 的 `plugin-manager` namespace，不修改本机或 Profile 的 `.npmrc`）；
- 通过 npm 包名添加插件，或安装指定的精确版本；
- 手动检查单个插件的最新版本；
- 更新、降级、恢复上一版本和卸载外源插件；
- 对第三方代码执行进行服务端绑定确认；
- 在操作完成后核对 Web Profile 的实际状态。

系统 Bundle、工作区插件和管理器自身只读。所有 Bundle 增删和版本变化都需要重启 DSH Web 才会生效。

## 使用

运行 `pnpm run init` 后，以官方命令启动 DSH：

```powershell
npx @deepseek-ai/dsh web
```

打开设置侧边栏中的“插件管理”。可在页面顶部设置仅对本插件生效的 npm 镜像源。添加时只接受 npm registry 包名、`latest` 或精确 semver；不接受版本范围、URL、Git spec 和本地路径。

## 紧急恢复

若第三方插件导致 DSH 无法启动，在终端中执行：

```powershell
npx @deepseek-ai/dsh plugin --profile web remove <package>
```

该命令只卸载包和 Bundle 注册，不会删除插件设置及业务数据。
