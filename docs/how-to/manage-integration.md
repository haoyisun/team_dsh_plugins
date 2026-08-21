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

移动或重新 clone 仓库后，在新路径运行 `pnpm run init`。工具会重建受管路径引用；不要手工复制插件到 `.dsh/profiles/node_modules`。
