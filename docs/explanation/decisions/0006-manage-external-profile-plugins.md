# ADR-006：以独立注册表安全同步外源插件

## 状态

Superseded by ADR-009

## 日期

2026-09-07

## 背景

外源 DSH 插件必须通过 `dsh plugin --profile web add` 安装，不能像工作区插件一样仅靠源码目录映射加载。团队仍需要在仓库中审查其版本和启停状态，同时不能让配置删除隐式卸载软件或删除用户数据。

## 决策

- `profiles/web.yml` 继续登记工作区插件；`profiles/web.external.yml` 登记 npm 外源插件。
- 外源条目声明 npm 包名、精确版本、Bundle entry 身份和禁用状态；不接受路径、URL、git spec 或 `@team-dsh-plugins/*`。
- `pnpm run sync:external` 显式调用官方 DSH plugin 流程并传入 `--save-exact`，安装缺失版本或对齐版本；同步同时验证直接依赖和 Bundle 注册，不在 `init` 或 Web 启动时联网。
- 外源禁用状态由 Web Profile 顶层 patch 覆盖 Bundle 插入行，不修改 `dsh.profile.bundles`。
- 删除声明不卸载插件，也不改变最后启停状态；`doctor` 将遗留覆盖报告为脱管状态。
- 外源插件和 npm 发布者进入代码执行信任边界。版本变化必须通过注册表评审。

## 备选方案

- 把外源插件直接写入 `profiles/web.yml`：会绕过 DSH Bundle 注册，并与安装命令自动加入的 Bundle 重复。
- 从 `dsh.profile.bundles` 删除以禁用：后续任意 plugin 操作的 reconciliation 会重新加入已安装 Bundle。
- 删除声明时自动卸载：收敛更彻底，但会把一次配置修改升级为破坏性本机操作。
- 在 `init` 或启动时自动同步：步骤更少，但引入隐式网络访问和代码安装。

## 结果

工作区插件和外源插件使用不同的安装机制，但都由 `profiles/*.yml` 显式声明。同步可重复执行；安装成功后才更新受管禁用覆盖。外源插件设置、持久数据、缓存和凭据仍属于 DSH Home，普通同步、禁用和解除接入均不删除这些数据。

本决策扩展 ADR-005 中原有的维护命令集合，并保留 ADR-001 的官方启动命令约束。

自 ADR-009 起，仓库不再维护 `profiles/web.external.yml` 和
`pnpm run sync:external`。本文件只保留为历史决策记录。
