# 新增插件

本页只适用于仓库内维护的工作区插件。消费 npm 外源插件请参阅[添加和管理外源插件](manage-external-plugins.md)。

## 1. 创建包

在 `plugins/<id>/` 创建 npm 包，包名必须为 `@team-dsh-plugins/<id>`。Host 入口导出 Cordis `apply`；Web 双端插件还必须：

- 导出 `./client`；
- 声明 `dsh.client.platform: web`；
- 让 Client bundle 调用 `window.__ModuleLoader__.load` 时使用完整包名作为 ID。

完整字段见[插件开发契约](../reference/plugin-contract.md)。

## 2. 显式注册

在 `profiles/web.yml` 增加条目：

```yaml
- id: example
  name: '@team-dsh-plugins/example'
```

数组顺序是加载顺序。暂不启用时设置 `disabled: true`，不要依靠目录扫描。

## 3. 安装与验证

```powershell
pnpm install
pnpm run validate
pnpm test
```

行为逻辑必须先有失败测试。插件需要新配置、持久数据或缓存时，按开发契约选择对应 DSH 服务和路径。

## 4. 运行

```powershell
npx @deepseek-ai/dsh web
```

scope 目录映射已由一次性初始化建立；新增插件无需再运行 `dsh plugin add`。尚未接入本仓库的开发者只需在其机器运行一次 `pnpm run init`。
