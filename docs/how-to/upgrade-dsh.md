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

npm `latest` 可能仍是预发布版本。DSH Developer Preview 明确允许破坏兼容的变更，因此升级后执行：

```powershell
pnpm run doctor
pnpm run validate
pnpm test
npx @deepseek-ai/dsh web
```

## 出现插件加载故障

1. 记录 `npx @deepseek-ai/dsh --version`。
2. 工作区插件在 `profiles/web.yml` 设置为 `disabled: true`；外源插件按[紧急恢复步骤](manage-plugins.md#紧急恢复)卸载。
3. 确认 DSH 能继续启动。
4. 按新版本 Host 服务、事件和 Client module 契约适配插件。
5. 增加回归测试并更新插件契约或 ADR。
6. 重新启用插件并运行完整验证。

普通运行错误应由插件内部降级；模块无法导入、manifest 失效或 Loader 协议变化可能阻止 DSH 启动，无法承诺自动跳过。
