# dsh-cost-meter

DSH（DeepSeek Harness）费用统计插件。

## 功能

- 自动记录每次 LLM 调用的 token 用量（输入 / 输出 / 缓存命中 / 缓存写入），数据源为会话日志中的 `assistant/message` 事件所携带的提供方 usage。
- 按可配置的模型单价计算费用（单位：元 / 100 万 tokens），支持**峰谷双档计价**：高峰时段（北京时间 9:00-12:00、14:00-18:00）用 `peak*` 单价，其余空闲时段用基础单价，按每次调用的北京时间自动选档。
- **同步官方价格**：价格编辑器里点「同步官方价格」，从官方定价页（https://api-docs.deepseek.com/zh-cn/quick_start/pricing ）抓取并解析最新价格表，直接覆盖手动调整的价格；抓取/解析失败时自动回退到插件内置的官方价格表并提示。也支持手动逐项调整并保存。
- 在 DSH web 的**会话头部**（Session log 按钮旁边）显示「今日 ¥…」胶囊按钮，点击打开下拉看板：
  - 账户余额（DeepSeek `user/balance` 接口，可手动刷新）；
  - 今日 / 本周 / 本月 / 累计消费；
  - 近 14 天每日消耗柱状图；
  - 按模型的调用次数、输入 / 输出 token 与费用明细；
  - 模型单价编辑（修改后历史费用按新单价重新计算）。
- 数据持久化在 `$DSH_HOME/storages`（storage-domain `cost-meter` 域），插件安装后会对既有会话做一次增量回填（`scans` 表记录每个会话已扫描到的 seq），因此历史每日消耗会包含安装前的记录。

## 组成

| 文件 | 说明 |
|---|---|
| `lib/index.js` | 宿主插件（Node 半）：用量记录、计费、持久化、余额、`/api/cost-meter/*` 路由、settings 注册 |
| `lib/client.js` | 浏览器半：左上角小组件 + 面板 + 价格编辑器（`window.__ModuleLoader__.load` 格式，由 client-modules 直接服务） |

宿主插件依赖的宿主服务：`sessions`、`settings`、`webServer`、`storageDomain`（可选使用 `sessionPersistence`、`credentials`）。

## 安装

本插件由 `team_dsh_plugins` monorepo 统一注册为 `@team-dsh-plugins/cost-meter`。首次使用按仓库根目录 README 执行：

```sh
pnpm run init
npx @deepseek-ai/dsh web
```

不要将插件源码复制进 `.dsh`，也不要手工修改 Profile 注册行。

## 配置

价格即存即生效，写入 `$DSH_HOME/settings.yaml` 的 `cost-meter:` 节（由插件面板同步/编辑，或手动编辑）。示例（当前官方价格）：

```yaml
cost-meter:
  prices:
    - model: deepseek-v4-flash
      inputPerM: 1.5        # 空闲时段输入（缓存未命中）
      cacheReadPerM: 0.05   # 空闲时段输入（缓存命中）
      cacheWritePerM: 0     # 缓存写入（官方无单独收费）
      outputPerM: 4.5       # 空闲时段输出
      peakInputPerM: 3.0    # 高峰时段输入
      peakCacheReadPerM: 0.1
      peakCacheWritePerM: 0
      peakOutputPerM: 9.0
```

`peak*` 字段缺省时按基础（空闲）单价计，即不分峰谷。`model` 填 `*` 可设置默认单价行。其它配置键（`currency`、`balanceUrl`、`apiKeyEnv`、`balanceTimeoutMs`、`pricingUrl`、`pricingTimeoutMs`）可同样在 `settings.yaml` 中覆盖。

## 数据口径说明

- 费用 = `输入token×输入单价 + 输出token×输出单价 + 缓存命中token×缓存命中单价 + 缓存写入token×缓存写入单价`，除以 100 万；单价按每次调用的北京时间在高峰/空闲档之间自动选择。
- 未配置单价的模型按 0 元计，并在模型明细中标注“未定价”。
- 统计在读取时由原始样本实时聚合：修改或同步单价后，今日 / 本周 / 本月 / 累计与历史每日都会按新单价重新计算。
- 「同步官方价格」直接从官方定价页抓取解析；页面改版导致解析失败时回退到内置官方价格表，并在面板中提示。
- 余额接口为 DeepSeek 官方 `GET https://api.deepseek.com/user/balance`，key 取自 `ctx.credentials`（优先）或环境变量 `DEEPSEEK_API_KEY`；未配置 key 时面板给出提示，不影响用量统计。
- 本插件只记录 token 用量并本地换算费用，DeepSeek 官方没有公开的消费明细接口，因此“消耗金额”为本地按单价估算，与官方账单可能存在差异（缓存命中计费口径、赠金抵扣等以官方为准）。
