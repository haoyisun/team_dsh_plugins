# ADR-0016：为 Desktop 快捷方式设置 AppUserModelID

## 状态

Accepted

## 日期

2026-09-09

## 背景

DSH Desktop 未打包成独立安装程序，开发态进程始终是 `electron.exe`。运行中的任务栏按钮使用 `BrowserWindow` 图标，因此显示自定义 `app-icon.ico`；用户把该按钮固定到任务栏时，Windows 按进程可执行文件建立快捷方式，于是固定项变成 Electron 默认原子图标。

桌面 `.lnk` 虽已设置 `IconLocation`，但主进程没有显式 AppUserModelID，Windows 无法把正在运行的窗口与该快捷方式认成同一应用。

## 决策

- 主进程在申请单实例锁之前调用 `app.setAppUserModelId('TeamDSH.DSHDesktop')`。
- `pnpm run shortcut` 改为由 Electron `shell.writeShortcutLink` 写入快捷方式，并写入同一 AppUserModelID 与自定义图标。
- 脚本同时创建当前用户桌面和开始菜单 `Programs` 下的 `DSH Desktop.lnk`。开始菜单是 Windows 按 AppUserModelID 查找启动快捷方式的首选位置。
- 快捷方式使用保存在 Electron `userData` 中、文件名包含内容哈希的图标副本。图标内容变化时路径随之变化，避免 Explorer 按旧 `IconLocation` 继续返回缓存图标。
- 快捷方式仍通过现有 `launch.ps1` 启动本地 `electron.exe`，不发布安装包，也不把 Electron 重命名为产品可执行文件。

本 ADR 补充 ADR-010 的快捷方式安装边界；进程所有权、Job Object 清理和官方 CLI 入口保持不变。

## 备选方案

- 只设置窗口图标：运行中正确，固定后仍回到 `electron.exe` 嵌入图标。
- 制作 NSIS/MSI 并把图标写入产品 exe：能彻底对齐任务栏身份，但与 ADR-010 不发布安装包的决策冲突。
- 继续用 WScript.Shell 写 `.lnk`：无法设置 AppUserModelID，Windows 仍无法把进程与快捷方式关联。

## 结果

重新运行 `pnpm run shortcut` 后，固定到任务栏会沿用自定义图标和 `launch.ps1` 启动路径。已经固定过 Electron 默认图标的用户需要先取消固定，再重新固定。仓库移动后仍须重新创建快捷方式。
