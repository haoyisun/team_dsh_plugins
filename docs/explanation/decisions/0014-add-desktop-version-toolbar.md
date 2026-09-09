# ADR-014：为 Desktop 增加独立版本工具栏

## 状态

Accepted（工具栏增加“重启 DSH”由 ADR-015 补充）

## 日期

2026-09-08

## 背景

ADR-013 将 DSH 升级改为用户显式操作，但版本信息和“检查更新”入口只存在于 Windows
托盘菜单。托盘入口不易发现，用户需要离开主窗口才能确认当前版本或主动检查更新。

DSH Desktop 又必须继续显示官方 DSH Web，不能把壳控件注入 DSH DOM，否则 DSH 页面
结构变化可能破坏壳功能，也会扩大网页与本机进程管理之间的权限边界。

## 决策

- BrowserWindow 的本地页面负责一条 44px 高的壳工具栏和现有启动/错误状态。
- 工具栏左侧显示当前精确 DSH 版本，并提供原生 HTML `button` 触发“检查更新”。
- 官方 DSH Web 在独立 `WebContentsView` 中加载，视口位于工具栏下方；窗口缩放时同步
  更新边界。状态或致命错误出现时移除该 View，恢复本地状态页。
- 本地工具栏只能通过现有 `dsh-desktop://` 导航动作请求检查更新；`busy` 状态下按钮
  禁用并显示低干扰的加载指示。真正的版本查询、确认和进程切换仍全部在 Electron
  main process 中执行。
- 检查结果、升级确认和升级结果使用独立、模态、无边框的本地 `BrowserWindow`，样式
  与 DSH Web 的中性色、圆角、按钮层级和暗色模式保持一致。它不启用 Node integration，
  只通过受限的 `dsh-dialog://` 选择动作向 main process 返回结果。
- DSH View 保持 `contextIsolation`、sandbox、禁用 Node integration 和精确 origin 导航
  限制。窗口关闭时显式关闭 View 的 `webContents`，避免资源泄漏。
- 托盘中的版本和检查更新入口继续保留，作为窗口不可见时的等价入口。

本 ADR 取代 ADR-010 中“BrowserWindow 自身直接加载 DSH URL”的窗口组合细节；其余
进程所有权、token 脱敏和安全隔离决策保持不变。

## 备选方案

- 只修改窗口标题：可以显示版本，但无法提供可发现的操作按钮。
- 使用原生应用菜单：实现简单，但视觉层级重、占用更多高度，也不符合当前无菜单设计。
- 向 DSH Web 注入按钮：布局最紧凑，但依赖上游 DOM，并把壳行为暴露给远程页面。
- 用 iframe 包装 DSH Web：会引入 CSP、frame policy、导航和认证兼容问题。

## 结果

用户无需打开托盘即可看到版本和检查更新。壳工具栏与 DSH 页面保持独立升级边界，但
Desktop 需要维护两个 webContents 的布局、导航保护和显式资源释放。Electron 冒烟测试
覆盖工具栏加载态、键盘可访问按钮、自定义更新模态窗、受限动作和 `WebContentsView`
组合能力。
