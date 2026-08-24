# 命令参考

所有维护命令从仓库根目录执行。

## `pnpm run init`

校验仓库后，将 `profiles/web.yml` 作为嵌套 Cordis Include 接入 DSH Web Profile，并建立 `@team-dsh-plugins` scope 目录链接。可重复执行。

仓库路径改变后再次执行时，命令会更新 Profile 引用，并自动替换指向旧仓库或目标已不存在的 scope 链接。它不会覆盖同名真实目录。

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

只检查仓库静态契约，不读取或修改 `.dsh`。

## `pnpm test`

使用 Node.js 内置测试运行器验证初始化幂等、配置保留、解除接入、身份校验和版本告警策略。

## `npx @deepseek-ai/dsh web`

唯一的 DSH Web 启动方式。维护脚本只负责一次性接入，不包装或替代官方启动命令。
