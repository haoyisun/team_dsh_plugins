# dsh-cost-meter

DSH（DeepSeek Harness）费用统计插件。

## 功能

- 自动记录**每一次**已报告用量的 LLM 调用的 token 用量（输入 / 输出 / 缓存命中 / 缓存写入）。数据源是绑定在 `LlmRuntime` 上的 `llm/stream` waterfall，因此压缩摘要、自动标题、子 agent 调用，以及失败/中止但仍产生用量的 attempt 都会计入——这些调用不产生会话消息，早期只用 `assistant/message` 的实现会整体漏掉。
- 按可配置的模型单价计算费用（单位：元 / 100 万 tokens），支持**峰谷双档计价**：高峰时段（北京时间周一至周五 9:00-12:00、14:00-18:00）用 `peak*` 单价，其余时段（含周末全天）用基础单价，按每次调用的北京时间自动选档。
- **模型 id 归一化**：价格表的模型名会剥掉定价页脚注标记（如 `deepseek-flash (1)` → `deepseek-flash`）；官方公告的旧模型名（`deepseek-v4-flash`、`deepseek-v4-flash-vision-exp`）按当前 Flash 价格计费，因此旧会话与旧配置也能正常计价。
- **同步官方价格**：价格编辑器里点「同步官方价格」，从官方定价页（https://api-docs.deepseek.com/zh-cn/quick_start/pricing ）抓取并解析最新价格表，直接覆盖手动调整的价格；抓取/解析失败时自动回退到插件内置的官方价格表并提示。也支持手动逐项调整并保存。
- 在 DSH web 的**会话头部**（Session log 按钮旁边）显示「今日 ¥…」胶囊按钮，点击打开下拉看板：
  - 账户余额（DeepSeek `user/balance` 接口，可手动刷新）；
  - 今日 / 本周 / 本月 / 累计消费；
  - 近 14 天每日消耗柱状图；
  - 按模型的调用次数、输入 / 输出 token 与费用明细；
  - 模型单价编辑（修改后历史费用按新单价重新计算）。
- 数据持久化在 `$DSH_HOME/storages`（storage-domain `cost_meter` 域）。**实时**用量来自 `llm/stream`；**历史**用量由会话日志回填，回填用 `scans` 表按会话记录已扫描到的 seq 以及折叠出的 provider/model，因此只有首次（或上下文未知时）才全量读会话日志，之后只读新增区间，历史每日消耗会包含安装前的记录。
- 两条数据源按**历史切点**（`cost_meter` 域级 singleton 里的 `historyCutoff`）互斥：切点只在首次启用实时采集时固定一次，之前的事件由回填负责、之后的调用由实时路径记录，因此在任何时刻同一调用都只被计一次。
- 样本键是 path-safe 的：回填样本用 `sessionId_seq`，实时样本用 `llm-<进程令牌>_<序号>`。存储采用 storage-domain 的 **`per-record` 布局**：每条样本是 `<storages>/cost_meter/samples/<键>.json` 一个小文件。默认的 `single` 布局会在每次写入时重写整个单元文件，而样本是每次模型调用写一条，写入量会随历史长度线性放大；`per-record` 下每次只写该记录自己的文件（约 300 字节）。
- 单条记录损坏时会被移走（同名 `.bak.<时间戳>`）并跳过，而不是让整个统计域打不开。

> **从旧版本升级**：插件先一次性把历史样本键改写为 path-safe 格式（2 千余条约 4-5 秒），再在**下一次启动**切换到 `per-record` 布局（backend 把旧的 `cost_meter.json` 逐条搬成小文件，约 2 秒）。若跳过键迁移直接切布局，`per-record` 的搬运过程会因为历史键含 `:` 而失败——插件检测到这种情况会自动退回 `single` 布局先把键迁移好，并在日志里提示再重启一次。

## 组成

| 文件 | 说明 |
|---|---|
| `lib/index.js` | 宿主插件（Node 半）：宿主接线 —— 持久化、余额、价格同步、`/api/cost-meter/*` 路由、settings 注册、启动期迁移与回填 |
| `lib/pricing.js` | 纯逻辑：内置/解析官方价格表、模型 id 归一化、峰谷选档与计费 |
| `lib/aggregate.js` | 纯逻辑：按日界偏移做日历运算，聚合今日/本周/本月/累计/每日/按模型 |
| `lib/backfill.js` | 纯逻辑：样本键格式、会话事件折叠、增量游标、历史切点 |
| `lib/llm-usage.js` | 纯逻辑：把 `llm/stream` 的 chunk 流原样透传，同时抄出 `usage` |
| `lib/client.js` | 浏览器半：会话头部小组件 + 面板 + 价格编辑器（`window.__ModuleLoader__.load` 格式，由 client-modules 直接服务） |

存储布局（`$DSH_HOME/storages/cost_meter/`）：

```
global.json                      域级 singleton（键迁移标记 + 历史切点）
samples/<键>.json                一条模型调用的用量样本
scans/<sessionId>.json           该会话的回填游标（seq + provider/model）
```

`pricing.js`、`aggregate.js`、`backfill.js`、`llm-usage.js` 不依赖宿主服务，可直接被 `node --test` 覆盖。

宿主插件依赖的宿主服务：`sessions`、`settings`、`webServer`、`storageDomain`、`llm`（可选使用 `sessionPersistence`、`credentials`）。

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
    - model: deepseek-flash
      inputPerM: 1          # 空闲时段输入（缓存未命中）
      cacheReadPerM: 0.02   # 空闲时段输入（缓存命中）
      cacheWritePerM: 0     # 缓存写入（官方无单独收费）
      outputPerM: 4         # 空闲时段输出
      peakInputPerM: 2      # 高峰时段输入
      peakCacheReadPerM: 0.04
      peakCacheWritePerM: 0
      peakOutputPerM: 8
    - model: deepseek-v4-pro
      inputPerM: 4.5
      cacheReadPerM: 0.15
      cacheWritePerM: 0
      outputPerM: 13.5
      peakInputPerM: 9
      peakCacheReadPerM: 0.3
      peakCacheWritePerM: 0
      peakOutputPerM: 27
```

`peak*` 字段缺省时按基础（空闲）单价计，即不分峰谷。`model` 填 `*` 可设置默认单价行。

其它配置键同样在 `settings.yaml` 中覆盖并即时生效：

| 键 | 默认值 | 说明 |
|---|---|---|
| `currency` | `CNY` | 展示币种 |
| `dayOffsetMinutes` | `480` | 「今日/本周/本月」的日界偏移（分钟，东为正）。默认 480 = 北京时间，与峰谷规则基准一致；进程本地时区与浏览器时区都不参与日历运算 |
| `balanceUrl` | `https://api.deepseek.com/user/balance` | 余额接口 |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | 余额接口使用的凭据名（先查 `ctx.credentials`，再查进程环境变量） |
| `balanceTimeoutMs` | `10000` | 余额请求超时 |
| `pricingUrl` | 官方定价页 | 「同步官方价格」的抓取地址 |
| `pricingTimeoutMs` | `15000` | 定价页抓取超时 |

价格行的 `model` 不能为空、也不能重复：两者都会让某一行静默失效，因此保存时直接返回 400 并给出原因。数值字段缺省时按 0 计（不再回退到某代官方价），避免「模型名写错却按无关旧价计费」。

## 数据口径说明

- 费用 = `输入token×输入单价 + 输出token×输出单价 + 缓存命中token×缓存命中单价 + 缓存写入token×缓存写入单价`，除以 100 万；单价按每次调用的北京时间在高峰/空闲档之间自动选择（高峰为周一至周五 9:00-12:00、14:00-18:00，周末全天空闲）。
- 「今日 / 本周 / 本月」按 `dayOffsetMinutes` 划分日界（默认北京时间），柱状图的日期键由服务端算好后下发，因此无论宿主机和浏览器处于哪个时区，两者始终一致。
- 未配置单价的模型按 0 元计，并在模型明细中标注“未定价”；此时左上角胶囊按钮转为警告色，避免把“价格表没匹配上”误读成“没有消费”。
- 价格表的模型名会去掉定价页脚注标记（如 `(1)`）后再匹配；官方公告的旧模型名按当前模型价格计费。
- 统计在读取时由原始样本实时聚合：修改或同步单价后，今日 / 本周 / 本月 / 累计与历史每日都会按新单价重新计算。
- 「同步官方价格」直接从官方定价页抓取解析；页面改版导致解析失败时回退到内置官方价格表，并在面板中提示。同步成功后旧的失败原因会被清空。
- 面板与 DSH 设置页同时改价时，后写者会因 settings 版本冲突被拒绝（HTTP 409），面板提示已重新载入最新价格——不会静默覆盖。
- 余额在启动时预热一次，之后由统计请求按需刷新（缓存 60 秒），没有空转定时器。若 DSH Web 绑定在 `0.0.0.0`，`/api/cost-meter/stats` 不下发账户余额（其余统计照常），因为该接口没有鉴权。
- 余额接口为 DeepSeek 官方 `GET https://api.deepseek.com/user/balance`，key 取自 `ctx.credentials`（优先）或环境变量；未配置 key 时面板给出提示，不影响用量统计。多币种账户按展示币种取对应那条，不做跨币种求和。
- 实时用量来自 `llm/stream`（每一次已报告用量的模型调用），历史用量来自会话日志回填；两者按固定一次的历史切点互斥。**切换瞬间在途的那一次调用可能两条路径都不记**——它开始于实时订阅生效之前、事件时间又落在切点之后；这只会发生一次，影响极小。
- 若 DSH 未提供 `llm` 服务，插件仍可运行，但只统计回填出来的历史数据，不再记录实时用量。
- 本插件只记录 token 用量并本地换算费用，DeepSeek 官方没有公开的消费明细接口，因此“消耗金额”为本地按单价估算，与官方账单可能存在差异（缓存命中计费口径、赠金抵扣等以官方为准）。

> 数据源与历史切点的设计取舍见 [ADR-019](../../docs/explanation/decisions/0019-capture-cost-meter-usage-from-llm-stream.md)。
