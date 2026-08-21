# DSH Plugins

团队自维护的 DeepSeek Harness（DSH）插件 monorepo。仓库通过一次性接入连接到 DSH Web Profile；此后仍使用官方命令启动：

```powershell
npx @deepseek-ai/dsh web
```

## 快速开始

环境要求：Node.js `^22.19.0 || >=24`、pnpm 10。

```powershell
git clone http://gitlab.yifnauto.com/ai/dsh_plugins.git
cd dsh_plugins
corepack enable
pnpm install
pnpm run init
pnpm run doctor
npx @deepseek-ai/dsh web
```

已有手工安装版 `dsh-cost-meter` 的机器，请将 `pnpm run init` 替换为：

```powershell
pnpm run migrate
pnpm run doctor
```

迁移会保留 `.dsh/settings.yaml` 中的设置和 `.dsh/storages/cost_meter.json` 中的历史数据，并在仓库 `.backups/` 中备份被替换的接入文件。

## 常用命令

- `pnpm run init`：将当前仓库接入默认或 `$DSH_HOME` 指定的 DSH Home。
- `pnpm run doctor`：检查仓库、Profile、目录链接和 DSH 版本。
- `pnpm run unlink`：移除仓库接入，不删除插件设置和数据。
- `pnpm run migrate`：迁移旧版手工安装的 `dsh-cost-meter`。
- `pnpm run validate`：校验注册表、包名和 Client module ID。
- `pnpm test`：运行基础设施测试。

## 文档

- [入门教程](docs/tutorials/getting-started.md)
- [新增插件](docs/how-to/add-plugin.md)
- [管理 DSH 接入](docs/how-to/manage-integration.md)
- [升级 DSH](docs/how-to/upgrade-dsh.md)
- [架构说明](docs/explanation/architecture.md)
- [插件开发契约](docs/reference/plugin-contract.md)
- [命令参考](docs/reference/commands.md)
- [架构决策](docs/explanation/decisions/)

本仓库使用 Diátaxis 组织文档：教程用于学习，How-to 用于完成任务，Reference 描述契约，Explanation 解释设计取舍。
