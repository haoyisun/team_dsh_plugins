# Changelog

本文件记录面向用户的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 新增 `@team-dsh-plugins/message-navigator`，通过可滚动里程碑轨道预览并定位长会话中的用户提问。

### Fixed

- `pnpm run init` 现在会在仓库迁移后自动替换指向旧路径或已经悬空的插件 scope 链接。

## [0.1.0] - 2026-08-21

### Added

- 以 `team_dsh_plugins` 作为开源 monorepo 发布。
- 通过 `pnpm run init` 将仓库一次性接入 DSH Web Profile。
- 提供 `doctor`、`unlink`、`validate` 维护命令。
- 内置费用统计插件 `@team-dsh-plugins/cost-meter`。
