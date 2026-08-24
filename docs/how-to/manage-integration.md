# 管理 DSH 接入

## 初始化

```powershell
pnpm run init
```

命令使用 `$DSH_HOME`；未设置时使用用户目录下的 `.dsh`。它会备份并幂等更新 Web Profile patch，然后建立 `@team-dsh-plugins` scope 目录链接。

## 诊断

```powershell
pnpm run doctor
```

错误表示接入不可用；未知 DSH 版本是告警，不阻止继续运行。插件协议级不兼容时，在 `profiles/web.yml` 将对应条目标记为 `disabled: true`。

## 解除接入

```powershell
pnpm run unlink
```

该命令只移除受管 Include 和 scope 链接。插件设置、业务数据、缓存和会话均不会删除。

## 更换仓库路径

移动已有仓库后，先重建 pnpm 依赖链接，再重新初始化接入：

```powershell
pnpm install --force
pnpm run init
pnpm run doctor
```

重新 clone 到新路径时，使用普通的 `pnpm install`，然后运行 `init` 和 `doctor`。

`init` 会自动替换指向旧仓库或目标已经不存在的受管 scope 链接，并更新 Web Profile 中的仓库引用。为避免覆盖用户文件，同名路径如果是真实目录而不是符号链接或 Junction，命令仍会报错并停止。不要手工复制插件到 `.dsh/profiles/node_modules`。
