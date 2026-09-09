# ADR-010：增加可选 Windows 桌面壳

## 状态

Accepted（DSH 版本更新策略由 ADR-013 取代，窗口组合由 ADR-014 补充）

## 日期

2026-09-08

## 背景

ADR-001 保留 `npx @deepseek-ai/dsh web` 作为仓库的唯一公共启动契约，避免插件仓库拥有 DSH 运行时。个人开发时仍需要重复打开终端、定位进程并手工启停 DSH Web，Windows 也不会在启动终端意外退出后自动清理整个 Node.js 进程树。

需求是提供桌面图标、普通窗口、托盘、重启和更新操作，同时继续显示完整 DSH Web，不复制其页面、设置、数据或插件加载逻辑。

## 决策

- 在 `desktop/` 提供仅支持 Windows 的可选 Electron 壳。该目录是独立 pnpm 安装边界，不加入根 workspace，也不改变 README 中的默认 DSH 启动方式。
- Electron 使用官方 npm CLI 启动 `@deepseek-ai/dsh web --no-open`，解析 DSH 输出的 loopback token URL，并在安全隔离的 WebContents 中加载。ADR-014 在 DSH View 上方增加独立壳工具栏；壳仍不实现 DSH 页面或业务功能。
- App 使用单实例锁。启动前只检查 `127.0.0.1:3080` 的监听进程及其祖先进程命令行；只有识别为 DSH Web 后才向用户展示 PID、命令行和端口并请求终止确认。未知进程只报告端口冲突。
- DSH 子进程由本地编译的 Windows supervisor 放入启用 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` 的 Job Object。App 正常退出时主动停止 supervisor；App 异常消失后 supervisor 退出并由 Windows 清理整个 DSH 进程树。
- 窗口使用 Windows 原生标题栏。最小化进入任务栏，关闭窗口退出 App 并停止 DSH。托盘只提供版本信息、显示窗口、重启 DSH、检查 DSH 更新和退出。
- `BrowserWindow` 禁用 Node integration，启用 context isolation、sandbox 和 web security；只允许主窗口在本次 DSH origin 内导航。外部 HTTP(S) 链接交给系统浏览器，网页不能获得进程管理 IPC，token 在日志和诊断中脱敏。
- 不发布安装包或 Electron 自动更新。一次性脚本创建指向当前仓库的桌面快捷方式；壳代码通过 Git 更新，工作区插件继续通过现有目录链接传播。DSH 的精确版本选择与显式升级由 ADR-013 定义。

## 备选方案

- 将 Electron 加入根 workspace：安装简单，但会迫使所有插件贡献者和根 CI 下载 Electron。
- 制作 NSIS/MSI 和自动更新：适合独立桌面产品，但会把开发仓库与已安装插件快照分离，并引入签名和发布基础设施。
- 自己实现一套类似 DSH 的桌面 UI：无法随 DSH 页面升级自动保持一致，也会复制其交互和状态。
- 仅在退出时执行 `taskkill /T`：无法处理 Electron 主进程被强制终止后的孤儿进程。
- 按端口直接终止进程：可能误杀与 DSH 无关的本机服务。

## 结果

ADR-001 继续约束公开默认入口和维护脚本；桌面壳是显式安装、可移除的个人便利层，不是 DSH 的替代运行时。用户仍可绕过壳直接运行官方命令。

DSH Web 页面升级会自动反映在窗口中，但 DSH CLI 参数、启动输出或插件协议属于 Developer Preview 契约，发生破坏性变化时仍可能需要适配。Electron、Windows API 和本地编译 supervisor 增加了独立的维护与安全审查面。
