# message-navigator

DSH Web 长会话消息导航插件。它在会话正文右侧显示一条里程碑轨道，每个用户提问对应一个圆点。

## 功能

- 点击圆点后，将对应提问平滑定位到正文视口上方约 20% 的位置。
- 以视口上方 25% 的阅读线判断当前位置，并高亮对应圆点。
- 在轨道上使用滚轮浏览超出可视区的圆点；到达边界后继续滚动正文。
- 悬停圆点展示提问序号、时间和三行纯文本预览。
- 将会话中的 steering 指令显示为缩进的小圆点。
- 首屏可用后在后台逐页加载更早历史；每批最多覆盖约 2,000 个连续事件，之后由用户继续加载。
- 跟随 DSH 的中英文、主题 token 和“减少动态效果”设置。

## 能力边界

- 插件只支持最新版 DSH Web 和桌面端 Chromium。
- 插件通过官方 `conversation.session.header.utilities` slot 管理生命周期，并使用 DSH 的 `data-conversation-scroll`、`data-chat-anchor-key` 语义标记完成定位。
- DSH 缺少公开的消息跳转 API；关键语义标记不存在时，插件会停止渲染并只输出兼容性警告。
- 插件没有 Host 业务逻辑，不读取文件，不保存设置，不访问外部网络。
- 插件不实现复制、Fork、thinking 折叠、搜索或消息聚合。

## 安装

本插件由 `team_dsh_plugins` monorepo 统一注册。首次使用按仓库根目录 README 执行：

```powershell
pnpm run init
npx @deepseek-ai/dsh web
```

不要将插件源码复制进 `.dsh`，也不要手工修改 DSH Profile 注册行。
