# 贡献指南

感谢你为 [team_dsh_plugins](https://github.com/haoyisun/team_dsh_plugins) 做贡献。本仓库按 MIT 许可证开源，文档使用简体中文。

## 开始之前

1. 阅读 [行为准则](CODE_OF_CONDUCT.md) 和 [插件开发契约](docs/reference/plugin-contract.md)。
2. 搜索现有 Issue 和 Pull Request，避免重复工作。
3. 安全问题请按 [SECURITY.md](SECURITY.md) 私下披露，不要开公开 Issue。

## 开发流程

```powershell
git clone https://github.com/haoyisun/team_dsh_plugins.git
cd team_dsh_plugins
corepack enable
pnpm install
pnpm run validate
pnpm test
```

接入本机 DSH：

```powershell
pnpm run init
pnpm run sync:external
pnpm run doctor
npx @deepseek-ai/dsh web
```

## 提交约束

- 每个 PR 只做一件事：新增插件、修复、文档或基础设施。
- 行为变更先写失败测试，再实现。
- 提交前运行 `pnpm run validate` 和 `pnpm test`。
- 工作区插件包名必须是 `@team-dsh-plugins/<id>`，并显式登记到 `profiles/web.yml`。
- 外源插件只登记 npm 包名、精确版本和 Bundle entries，不接受路径、URL、git spec 或工作区 scope；变更必须审查发布者及版本。
- MCP 实例登记到 `profiles/web.mcp.yml`；本机路径和认证信息必须通过受限环境变量表达式提供。
- 架构或公共契约变化必须新增 ADR，并更新对应 Reference。
- 不要提交密钥、`.dsh`、`.backups`、本机绝对路径或运行数据。
- 提交信息使用 `type: 简短说明`，例如 `feat:`、`fix:`、`docs:`、`chore:`。

## 评审

- 维护者审查契约一致性、测试覆盖和文档是否同步。
- CI 必须通过后才能合并到 `main`。
- 破坏性变更需要迁移说明，并写入 `CHANGELOG.md`。
