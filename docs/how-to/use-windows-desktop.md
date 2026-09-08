# 使用 Windows 桌面壳

DSH Desktop 是本仓库附带的可选本机工具，目前只支持 64 位 Windows（x64 或 arm64）。它直接显示完整 DSH Web，并管理自己启动的 DSH 进程；不改变官方 `npx @deepseek-ai/dsh web` 启动方式，也不是独立安装包。

## 首次准备

先在仓库根目录完成普通接入：

```powershell
pnpm install
pnpm run init
pnpm run doctor
```

再单独安装桌面壳。`desktop/` 不属于根 workspace，因此必须进入该目录：

```powershell
cd desktop
pnpm install
pnpm test
pnpm run shortcut
```

安装会在本机编译 Windows supervisor。`shortcut` 在当前用户桌面创建 `DSH Desktop` 快捷方式，之后可直接双击启动。

## 启动与退出

App 启动时检查 `127.0.0.1:3080`：

- 端口空闲时，App 启动并嵌入 DSH Web。
- 已有 DSH Web 时，确认框显示 PID、命令行和端口。选择“终止并启动”后由 App 接管；选择“退出”不会改动已有进程。
- 未识别为 DSH 的进程占用端口时，App 只报告冲突，不会终止该进程。

窗口最小化后保留在任务栏；关闭窗口会退出 App 并停止它启动的 DSH。托盘菜单提供“显示主窗口”“重启 DSH”“更新 DSH”和“退出”。

DSH 启动失败时，状态页可重试或复制已脱敏的诊断信息。App 日志同样会移除启动 URL 中的 token。

## 更新

先退出 App，再更新桌面壳和工作区插件源码：

```powershell
git pull
pnpm install
cd desktop
pnpm install
```

重新启动 App 即可使用更新后的壳。桌面快捷方式仍指向当前仓库，无需重新创建；仓库移动后应重新运行根目录的 `pnpm run init` 和 `desktop` 目录的 `pnpm run shortcut`。

更新 DSH 本身时，在托盘菜单选择“更新 DSH”。App 使用 npm `latest` 重新解析官方 `@deepseek-ai/dsh`，随后重启 DSH 进程，不会把 DSH 固定或打包进 Electron。

## 让插件变更生效

已有插件代码由目录链接直接提供给 DSH，修改后使用 HMR 或托盘中的“重启 DSH”。

新增插件时：

1. 创建 `plugins/<id>`，包名使用 `@team-dsh-plugins/<id>`。
2. 将插件显式加入 `profiles/web.yml`。
3. 在根目录运行 `pnpm install`、`pnpm run validate` 和 `pnpm test`。
4. 从托盘重启 DSH。

已经执行过 `pnpm run init` 的机器不需要复制插件，也不需要运行 `dsh plugin add`。

## 移除桌面壳

退出 App，删除桌面的 `DSH Desktop` 快捷方式即可。需要释放磁盘空间时还可以删除 `desktop/node_modules` 和 `desktop/bin`；这不会删除 DSH Home 中的设置、会话、凭据或插件数据。
