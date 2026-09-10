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

安装会在本机编译 Windows supervisor。`shortcut` 在当前用户桌面和开始菜单创建带同一 AppUserModelID 的 `DSH Desktop` 快捷方式，之后可直接双击启动；固定到任务栏时也会沿用自定义图标。若任务栏上已经固定过旧的 Electron 默认图标，先取消固定，再重新运行 `pnpm run shortcut` 并重新固定。

首次启动会查询 npm 当前发布的 DSH 版本，并显示“安装并固定”确认框。只有确认后才会下载和启动；成功加载 DSH Web 后，Desktop 才保存该精确版本。

## 启动与退出

App 启动时检查 `127.0.0.1:3080`：

- 端口空闲时，App 启动并嵌入 DSH Web。
- 已有 DSH Web 时，确认框显示 PID、命令行和端口。选择“终止并启动”后由 App 接管；选择“退出”不会改动已有进程。
- 未识别为 DSH 的进程占用端口时，App 只报告冲突，不会终止该进程。

窗口左上角的工具栏常驻显示当前 DSH 精确版本，并提供与托盘文案一致的“重启 DSH”以及“检查更新”。两个按钮使用同一套样式；“重启 DSH”只回收当前 DSH 进程并启动已固定版本，不重启 Electron，也不检查更新。busy 期间两个按钮都会禁用；重启中显示“重启中…”，检查或升级中显示对应加载文案。检查结果和升级确认使用与 DSH Web 风格一致的本地窗口，不会向 DSH 页面注入壳权限。

窗口最小化后保留在任务栏；从任务栏或托盘恢复时会自动校正 DSH 页面尺寸，不需要最大化窗口，也不会重新启动 DSH 或抢占其他窗口焦点。关闭窗口会退出 App 并停止它启动的 DSH。托盘菜单仍提供版本信息、“显示主窗口”“重启 DSH”“检查 DSH 更新…”和“退出”。普通启动与重启只运行已保存的精确版本，不检查或自动升级。

DSH 启动失败时，状态页可重试或复制已脱敏的诊断信息。只有 DSH 后端退出时才提供“重新启动 DSH”；若只是嵌入页面异常，使用“重新加载页面”恢复，不会中断仍健康的后端。后台发生故障时 App 不会主动恢复窗口并抢走焦点。App 日志同样会移除启动 URL 中的 token。

## 更新

先退出 App，再更新桌面壳和工作区插件源码：

```powershell
git pull
pnpm install
cd desktop
pnpm install
```

重新启动 App 即可使用更新后的壳。已有快捷方式在仓库未移动时无需重建；若要让任务栏固定使用自定义图标，或仓库已经移动，应重新运行 `desktop` 目录的 `pnpm run shortcut`。仓库移动后还要重新运行根目录的 `pnpm run init`。

更新 DSH 本身时，在托盘菜单选择“检查 DSH 更新…”。检查只读取 npm 元数据，不停止当前 DSH。发现更高版本后，App 会显示当前版本和目标版本；选择“暂不升级”不会改变进程或版本记录，选择“升级并重启”才会切换。

App 始终使用同一个 npm 安装执行官方 `@deepseek-ai/dsh@<精确版本>`。新版本完成启动和页面加载后才会保存；失败时会尽力恢复原版本。首次安装和升级会强制刷新 npm 元数据，普通启动与恢复优先使用本机缓存。npm 缓存不是持久备份，若其中没有所需版本，首次安装、升级或恢复仍需要网络。

## 让插件变更生效

已有插件代码由目录链接直接提供给 DSH，修改后使用 HMR，或点击窗口工具栏 / 托盘中的“重启 DSH”。

新增插件时：

1. 创建 `plugins/<id>`，包名使用 `@team-dsh-plugins/<id>`。
2. 将插件显式加入 `profiles/web.yml`。
3. 在根目录运行 `pnpm install`、`pnpm run validate` 和 `pnpm test`。
4. 点击工具栏或托盘中的“重启 DSH”。

已经执行过 `pnpm run init` 的机器不需要复制插件，也不需要运行 `dsh plugin add`。

## 移除桌面壳

退出 App，删除桌面和开始菜单中的 `DSH Desktop` 快捷方式即可。需要释放磁盘空间时还可以删除 `desktop/node_modules` 和 `desktop/bin`；这不会删除 DSH Home 中的设置、会话、凭据或插件数据。
