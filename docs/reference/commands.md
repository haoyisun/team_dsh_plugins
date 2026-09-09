# 命令参考

所有维护命令从仓库根目录执行。

## `pnpm run init`

校验仓库后，将 `profiles/web.yml` 作为嵌套 Cordis Include 接入 DSH Web Profile，并建立 `@team-dsh-plugins` scope 目录链接。可重复执行。

仓库路径改变后再次执行时，命令会更新 Profile 引用，并自动替换指向旧仓库或目标已不存在的 scope 链接。它不会覆盖同名真实目录。

从旧外源注册表方案升级时，命令会移除旧受管覆盖标记。没有禁用项的旧块直接删除；已有禁用项转为用户 Profile patch 并保留效果。

## `pnpm run doctor`

检查：

- 注册表、package manifest 和 Client module ID；
- Web Profile 受管 Include；
- scope 链接目标；
- 当前 DSH 版本是否经过验证。

未知版本产生告警，其他接入错误返回非零退出码。

## `pnpm run unlink`

删除受管 Include 和当前仓库拥有的 scope 链接。拒绝删除真实目录或其他仓库拥有的链接，不删除插件数据。

## `pnpm run validate`

只检查工作区插件的静态契约，不读取或修改 `.dsh`。npm 外源插件通过 DSH 设置中的“插件管理”读取和修改实际 Web Profile。

## `pnpm test`

使用 Node.js 内置测试运行器验证初始化幂等、配置保留、解除接入、身份校验和版本告警策略。

## `npx @deepseek-ai/dsh web`

唯一的 DSH Web 启动方式。维护脚本只负责一次性接入，不包装或替代官方启动命令。

## Windows 桌面壳命令

以下命令只在独立的 `desktop/` 目录执行，目前仅支持 Windows：

- `pnpm install`：安装 Electron，并在本机编译 Job Object supervisor。
- `pnpm start`：从源码启动可选桌面壳。
- `pnpm test`：运行桌面壳契约和 supervisor 测试。
- `pnpm run test:electron`：在真实 Electron 中验证隔离状态页和应用图标。
- `pnpm run shortcut`：在当前用户桌面创建指向本仓库的快捷方式。

桌面壳是 ADR-010 定义的可选入口；根目录命令和官方 DSH 启动契约保持不变。Desktop 按 ADR-013 保存用户确认的 DSH 精确版本，普通启动不访问 `latest`；工具栏与托盘提供“重启 DSH”，检查与确认升级也可从这两处完成。
