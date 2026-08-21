# ADR-002：使用嵌套 Include 与 scope 目录映射

## 状态

Accepted

## 日期

2026-08-21

## 背景

DSH rc.7 没有 monorepo 自动扫描或 `pluginRepoPath`。Host Loader 可加载文件路径，但 Web Client module scanner 以 Loader entry 包名解析 `package.json`，绝对源码路径不能形成稳定的浏览器模块身份。

## 决策

- Web Profile 通过 `cordis:include` 引用仓库原生 YAML 注册表。
- 所有插件使用 `@team-dsh-plugins/<id>`。
- 仓库和 DSH Profile 各自的 `@team-dsh-plugins` scope 目录链接一次性指向仓库 `plugins/`，分别服务 Host Loader 与 Web Client module scanner。

## 备选方案

- 对每个插件执行 `dsh plugin add link:`：官方支持，但新增插件仍需同步。
- 自定义聚合 Loader 和 Client bundle：能隐藏包解析，但复杂且更依赖内部 API。
- 扫描所有目录：会意外执行示例或未完成插件。

## 结果

新增插件只需创建目录并显式注册。目录链接属于仓库维护工具的兼容层，DSH 改变 Profile 模块解析时需要适配。
