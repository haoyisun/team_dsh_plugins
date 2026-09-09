# ADR-017：稳定 Desktop 会话与窗口生命周期

## 状态

Accepted

## 日期

2026-09-09

## 背景

ADR-014 使用本地 `BrowserWindow` 提供工具栏，并在其上叠加
`WebContentsView` 显示 DSH。原实现只在 `resize` 时更新 View 边界；Windows
最小化窗口时可能产生无效内容尺寸，恢复窗口又不保证再次触发 `resize`。结果是
DSH 后端和 renderer 仍在运行，但 View 保持零高度，用户只看到本地页面默认的
“正在启动 DSH”，必须最大化窗口才能恢复。

同一编排层还用一个 `busy` 布尔值同时表示启动、重启、检查更新和升级。
`busy` 期间发生的真实进程退出会被忽略，异步完成顺序也不能与具体 DSH 进程实例
对应。本地状态每次变化都重新执行 `loadFile`，使工具栏 renderer 的导航失败可能
进一步覆盖真实 runtime 状态或永久保留禁用按钮。

## 决策

- `DshRuntime` 为每次启动分配单调递增的 `runId`。停止操作只接受当前 `runId`；
  陈旧操作不能停止后续实例。App 退出时先关闭 runtime，关闭后禁止新的启动，并
  继续由 supervisor 和 Job Object 清理已创建的进程树。
- Desktop 使用无第三方依赖的会话状态对象串行化用户操作。启动、页面重载、重启、
  检查更新、等待确认和升级是明确操作；按钮状态和加载动效由当前操作派生。异步
  边界使用操作代际校验，陈旧结果不能覆盖当前状态。
- runtime 退出事件携带 `runId`，不再因为正在执行其他操作而直接丢弃。升级候选在
  提交期间失效时继续执行 ADR-013 的旧版本恢复；若目标版本已经写入，则恢复过程
  同时补偿写回旧版本。
- `WindowSurface` 是 DSH View 挂载、移除和边界写入的唯一入口。窗口最小化、隐藏、
  销毁或尺寸无效时不写入边界；`resize`、`restore`、`show`、`move`、最大化变化和
  显示器变化统一合并到下一轮 reconcile。reconcile 不重新加载 DSH，也不改变焦点。
- 本地 shell 页面只加载一次。后续状态通过 sandbox preload 接收白名单化、限长且
  脱敏的 ViewModel，并在 DOM 应用后确认 revision。shell 与 DSH View 使用不同导航
  权限；带 preload 的本地页面不能导航到 DSH origin，DSH 页面也不能获得 shell IPC。
- 故障恢复按所有权区分：窗口几何异常静默 reconcile；shell renderer 异常时保留
  DSH View 并恢复工具栏；DSH renderer 异常时重新加载当前同源页面而不重启后端；
  runtime 退出时才提供“重新启动 DSH”。后台故障只更新状态，不主动恢复窗口或抢焦点。
- `desktop` 默认测试同时运行 Node 测试和 Electron 冒烟测试。Windows CI 必须覆盖
  真实最小化与恢复、持久 shell 更新、状态页语义和 supervisor 清理。

## 备选方案

- 只增加 `restore` 监听：可以修复当前复现，但最小化仍可能写入无效边界，也无法
  解决显示器变化、状态竞态和错误恢复动作不准确。
- 每次恢复都移除并重新添加 View：可能强制重绘，但会改变 z-order、产生闪烁并影响
  焦点；正常 reconcile 因此只调整有效边界。
- renderer 异常时统一重启 DSH：实现简单，但页面故障并不代表后端故障，会中断正在
  进行的会话。
- 引入第三方状态机框架：能表达更多状态，但当前生命周期只需要少量正交状态和独占
  操作；新增依赖与抽象成本高于收益。

## 结果

最小化、锁屏、显示器变化和任务栏恢复不再把 DSH View 留在无效尺寸。窗口恢复不会
重新启动 DSH、丢失页面状态或抢走其他应用焦点。工具栏状态更新不再依赖整页导航，
页面故障和进程故障提供不同恢复动作。

本 ADR 补充 ADR-010、ADR-013、ADR-014 和 ADR-015，并取代其中由分散 `busy`、
整页 `loadFile` 和单一 `resize` 监听实现窗口生命周期的细节。进程接管确认、token
脱敏、精确版本固定、DSH DOM 隔离和 `desktop/` 独立安装边界保持不变。
