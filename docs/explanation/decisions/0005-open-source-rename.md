# ADR-005：公开仓库更名为 team_dsh_plugins

## 状态

Accepted

## 日期

2026-08-21

## 背景

仓库从内部 GitLab 迁到 GitHub 开源维护，需要统一项目名、插件 scope 和远程地址，并去掉仅适用于本机旧安装的迁移路径。

## 决策

- 仓库名为 `team_dsh_plugins`，根包名为 `team-dsh-plugins`。
- 插件 npm scope 为 `@team-dsh-plugins/<id>`。
- 远程为 `https://github.com/haoyisun/team_dsh_plugins.git`。
- 公开文档使用简体中文。
- 接入路径只保留 `init` / `doctor` / `unlink` / `validate`。

## 备选方案

- 保留 `@dsh-plugins` scope：兼容旧标识，但与公开仓库名不一致。
- 保留 GitLab 远程：不符合开源托管目标。

## 结果

新用户只需 clone、安装、初始化后用官方命令启动。已接入旧路径或旧 scope 的本机环境需要解除接入后重新 `pnpm run init`。
