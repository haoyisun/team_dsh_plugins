# 升级 DSH

本仓库不固定 DSH 版本，日常仍运行：

```powershell
npx @deepseek-ai/dsh web
```

npm `latest` 可能仍是预发布版本。DSH Developer Preview 明确允许破坏兼容的变更，因此升级后执行：

```powershell
pnpm run doctor
pnpm run validate
pnpm test
npx @deepseek-ai/dsh web
```

## 出现插件加载故障

1. 记录 `npx @deepseek-ai/dsh --version`。
2. 在 `profiles/web.yml` 将故障插件设置为 `disabled: true`。
3. 确认 DSH 能继续启动。
4. 按新版本 Host 服务、事件和 Client module 契约适配插件。
5. 增加回归测试并更新插件契约或 ADR。
6. 重新启用插件并运行完整验证。

普通运行错误应由插件内部降级；模块无法导入、manifest 失效或 Loader 协议变化可能阻止 DSH 启动，无法承诺自动跳过。
