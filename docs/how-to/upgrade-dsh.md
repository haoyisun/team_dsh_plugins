# 升级 DSH

不使用 Desktop 时，本仓库仍不固定 DSH 版本，公开默认入口保持为：

```powershell
npx @deepseek-ai/dsh web
```

使用可选 Windows 桌面壳时，首次启动会要求确认并固定一个精确 DSH 版本。以后普通启动以及工具栏或托盘中的“重启 DSH”都继续运行该版本，不查询 npm `latest`。

需要升级时：

1. 点击窗口左上角的“检查更新”，或从托盘菜单选择“检查 DSH 更新…”。查询期间按钮
   会显示旋转加载状态，当前 DSH 继续运行。
2. 在与 DSH Web 风格一致的更新窗口中核对当前版本和目标版本。
3. 选择“暂不升级”可继续使用当前版本，不产生状态变化。
4. 选择“升级并重启”后，Desktop 才停止当前 DSH 并启动目标精确版本。

新版本成功启动并加载页面后才会成为后续默认版本。升级失败时 Desktop 会尽力恢复原版本；若旧版本不在 npm 缓存且网络不可用，恢复仍可能失败，此时状态页会同时报告升级和恢复错误。此操作不更新 Electron 壳或插件源码。

升级时 Desktop 会强制刷新 npm 元数据；普通启动和回滚仍优先使用本机缓存。如果升级窗口提示 npm 在当前 registry 元数据中找不到该精确版本，说明本机 npm 元数据缓存过期：重试一次即可，仍失败时执行 `npm cache clean --force` 后再试。

npm `latest` 可能仍是预发布版本。DSH Developer Preview 明确允许破坏兼容的变更，因此升级后执行：

```powershell
pnpm run doctor
pnpm run validate
pnpm test
npx @deepseek-ai/dsh web
```

## 已知问题：DSH 0.1.5-rc.1 起无法加载带 RPC 通道的宿主插件

2026-09-10 实测：`@deepseek-ai/dsh-client-connection` 从 `0.1.5-rc.1` 起把
`webServer` 从自身 `inject` 中移除，却仍在 `HostConnectionService.register()`
里读取 `owner.webServer`。因此任何调用 `ctx.connection.rpc.handle(...)` 的宿主
插件都会在加载期失败：

```
Error: failed to apply loader entry <plugin>: cannot get property "webServer" without inject
```

2026-09-18 复核：`0.1.5-rc.2`（当前 `latest`）与 `0.1.6-alpha.2` 仍然存在该
缺陷；`0.1.2-rc.1` 正常。调用方无法通过自身 `inject`、Profile 条目 `inject` 或
`ctx.inject(['webServer'], ...)` 子上下文规避。

`@team-dsh-plugins/mcp-manager` 与 `@team-dsh-plugins/plugin-manager` 不再依赖
官方修复：两者通过 `plugins/mcp-manager/lib/rpc-channel.js` 注册 RPC 通道，先尝试
官方 `connection.rpc.handle`，只有命中该缺陷时才回退到插件自己用
`ctx.webServer.register()` 注册同一通道，并复用
`ctx.connection.requestRejection()` 保留 Host/Origin 与浏览器会话鉴权。因此这些
插件在 0.1.2-rc.1、0.1.5-rc.1、0.1.5-rc.2 与 0.1.6-alpha.2 上都能加载。

官方修复该缺陷后，回退分支不会再被触发；届时可以删除
`rpc-channel.js` 中的回退实现，恢复直接调用官方 API。

## 出现插件加载故障

1. 记录 `npx @deepseek-ai/dsh --version`。
2. 工作区插件在 `profiles/web.yml` 设置为 `disabled: true`；外源插件按[紧急恢复步骤](manage-plugins.md#紧急恢复)卸载。
3. 确认 DSH 能继续启动。
4. 按新版本 Host 服务、事件和 Client module 契约适配插件。
5. 增加回归测试并更新插件契约或 ADR。
6. 重新启用插件并运行完整验证。

普通运行错误应由插件内部降级；模块无法导入、manifest 失效或 Loader 协议变化可能阻止 DSH 启动，无法承诺自动跳过。
