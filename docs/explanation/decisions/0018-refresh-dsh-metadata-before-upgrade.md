# ADR-018：Desktop 升级新版本时强制刷新 npm 元数据

## 状态

Accepted

## 日期

2026-09-10

## 背景

ADR-013 规定 Desktop 用
`npm exec --yes --prefer-offline -- @deepseek-ai/dsh@<exact-version> web --no-open`
启动 DSH，以便只要精确版本及其依赖仍在 npm 缓存中，断网也能启动和重启。

该参数在 npm 中映射为 `force-cache`：只要本机存在可匹配的 packument（包元数据）缓存，
npm 就跳过向 registry 的重新校验。而“检查 DSH 更新…”使用 `npm view --prefer-online`，
读取的是完整元数据，不会替换安装解析所用的精简元数据缓存。结果是检查能看到刚发布的版本，
安装却按过期元数据解析并失败。

2026-09-10 的实际故障：检查发现 `0.1.5-rc.1`（当日 `03:12:53Z` 发布），随后
`npm exec --prefer-offline` 报
`ETARGET notarget No matching version found for @deepseek-ai/dsh@0.1.5-rc.1`，
Desktop 按 ADR-013 回滚到 `0.1.2-rc.1`。现场日志只暴露 npm 原始错误，用户无法从界面
判断原因。

## 决策

- `desktop/scripts/run-npx.ps1` 增加第三个参数 `-CacheMode`，取值
  `prefer-offline` 或 `prefer-online`，默认仍是 `prefer-offline`。
- 只有已提交的精确版本才允许使用缓存元数据：普通启动、工具栏“重启 DSH”和托盘
  “重启 DSH”继续使用 `prefer-offline`，保持离线可用。
- 首次安装和升级到新版本使用 `prefer-online`：目标版本刚刚由“检查 DSH 更新…”
  在线确认过，这次解析需要重新校验 registry 元数据。
- 升级失败后的回滚仍使用 `prefer-offline`：回滚目标就是当前已提交并正在运行的版本，
  必须能在网络不可用时恢复。
- 升级失败并回滚时，若错误来自 npm 的 `ETARGET`/`notarget`，更新窗口在原始错误之外
  附加“本机 npm 元数据缓存过期”的恢复提示。
- DSH 启动失败的错误消息附带本次启动的脱敏输出尾部，使更新窗口、状态页和日志能显示
  npm 的真实错误行，而不只是 `exit code 1`。
- 元数据模式由 `desktop/src/dsh-release.mjs` 的纯函数按目标版本、已提交版本和提交状态
  推导，不散落在调用点。

## 备选方案

- 所有启动都改成 `--prefer-online`：修复升级，但每次普通启动都必须联网校验元数据，
  失去 ADR-013 的离线启动能力。
- 先用 `--prefer-offline`，失败后再用 `--prefer-online` 重试：保留离线能力，但每次
  真实故障都要多等一轮 npm 解析，并把部分错误掩盖成“重试”。
- 升级前清理 npm 缓存：破坏用户缓存，代价远大于一次元数据校验。
- 只依赖 `dsh-release.json`：它记录版本选择，不表示 npm 元数据的新鲜度。

## 结果

升级路径不再受本机 packument 缓存新鲜度影响；普通启动和回滚保持离线可用。
`--prefer-online` 会让首次安装和升级增加一次 registry 元数据请求，网络不可用时升级会
失败并回滚——这与“检查 DSH 更新…”本身已要求联网一致。

本 ADR 只修订 ADR-013 中“普通启动和重启始终使用 `--prefer-offline`”的实施细节，
版本固定、首次确认、提交与回滚顺序均保持不变。
