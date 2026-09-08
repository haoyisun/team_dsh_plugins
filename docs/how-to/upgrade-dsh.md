# 升级 DSH

本仓库不固定 DSH 版本，日常仍运行：

```powershell
npx @deepseek-ai/dsh web
```

使用可选 Windows 桌面壳时，可从托盘菜单选择“更新 DSH”。该操作同样解析 npm `latest` 并重启官方 DSH Web，不更新 Electron 壳或插件源码。

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
