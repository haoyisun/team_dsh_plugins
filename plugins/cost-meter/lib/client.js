// dsh-cost-meter 客户端半（浏览器 bundle）—— v2。
// 按钮挂在会话头部 utilities 行（Session log 按钮旁边），面板为原生
// --dsw-* token 风格的下拉看板。由 client-modules 节点半以经典脚本方式加载，
// 本文件必须保持 window.__ModuleLoader__.load 格式。
window.__ModuleLoader__.load({
	id: "@team-dsh-plugins/cost-meter",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		//#region 样式（全部沿用 --dsw-* token，与 DSH 原生 UI 同源）
		const css = [
			// 触发器胶囊：与「Session log」按钮同款样式。
			".cm-wrap{position:relative;display:inline-flex}",
			".cm-trigger{border:1px solid var(--dsw-alias-border-l2);height:32px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);cursor:pointer;background:0 0;border-radius:18px;justify-content:center;align-items:center;gap:5px;padding:6px 12px;font-size:13px;font-weight:400;line-height:20px;display:inline-flex;min-width:0}",
			".cm-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
			".cm-triggerWarn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}",
			".cm-trigger span{flex:none;white-space:nowrap}",
			".cm-triggerVal{font-variant-numeric:tabular-nums}",
			// 面板：菜单风格浮层。
			".cm-panel{box-sizing:border-box;position:absolute;top:calc(100% + 6px);right:0;z-index:40;width:440px;max-width:min(460px,calc(100vw - 48px));max-height:min(600px,calc(100vh - 110px));display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv3);font-size:13px;line-height:20px}",
			".cm-head{display:flex;align-items:center;gap:8px;padding:12px 14px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".cm-title{flex:1;min-width:0;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".cm-iconBtn{box-sizing:border-box;border:0;background:0 0;color:var(--dsw-alias-label-tertiary);cursor:pointer;border-radius:6px;padding:3px;display:inline-flex;align-items:center;justify-content:center}",
			".cm-iconBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".cm-iconBtn:disabled{opacity:.5;cursor:default}",
			".cm-body{overflow-y:auto;padding:12px 14px 14px;display:flex;flex-direction:column;gap:12px;min-width:0}",
			".cm-card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-width:0}",
			".cm-cardLabel{font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary)}",
			".cm-balanceLine{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;min-width:0}",
			".cm-balanceValue{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}",
			".cm-balanceMeta{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);min-width:0}",
			".cm-balanceErr{font-size:12px;line-height:18px;color:var(--dsw-alias-state-warn-primary);min-width:0}",
			".cm-balanceRow{display:flex;align-items:center;gap:8px}",
			".cm-balanceRow .cm-cardLabel{flex:1;min-width:0}",
			// 统计卡片：今日/本周/本月/累计。
			".cm-periods{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}",
			".cm-period{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:2px;min-width:0}",
			".cm-periodLabel{font-size:11px;line-height:14px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".cm-periodValue{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".cm-periodSub{font-size:11px;line-height:14px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			// 每日柱状图。
			".cm-chart{display:flex;align-items:flex-end;gap:4px;height:64px}",
			".cm-bar{flex:1;min-width:0;border-radius:2px 2px 0 0;background:var(--dsw-alias-brand-primary);opacity:.85}",
			".cm-bar:hover{opacity:1}",
			".cm-barZero{background:var(--dsw-alias-fill-l2)}",
			".cm-chartLabels{display:flex;gap:4px;margin-top:4px}",
			".cm-chartLabel{flex:1;min-width:0;font-size:9px;line-height:12px;color:var(--dsw-alias-label-tertiary);text-align:center;white-space:nowrap;overflow:hidden}",
			// 模型明细行。
			".cm-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--dsw-alias-border-l1);min-width:0}",
			".cm-row:last-child{border-bottom:none}",
			".cm-rowModel{flex:1;min-width:0;display:flex;align-items:center;gap:6px;overflow:hidden}",
			".cm-modelTag{flex:none;max-width:100%;font-size:11px;line-height:16px;padding:0 6px;border-radius:5px;background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".cm-unpriced{background:var(--dsw-alias-state-warn-primary);color:#fff}",
			".cm-rowNum{flex:none;font-size:12px;line-height:16px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);text-align:right;white-space:nowrap}",
			".cm-rowCost{flex:none;font-size:12px;line-height:16px;font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}",
			// 按钮。
			".cm-btn{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:18px;font-size:12px;line-height:20px;padding:3px 12px;display:inline-flex;align-items:center;gap:5px}",
			".cm-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".cm-btn:disabled{opacity:.5;cursor:default}",
			".cm-btnPrimary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}",
			// 价格编辑器。
			".cm-priceCard{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px;min-width:0}",
			".cm-priceModelRow{display:flex;gap:6px;align-items:center;min-width:0}",
			".cm-priceModelRow .cm-input{flex:1;min-width:0}",
			".cm-priceModelRow .cm-iconBtn{flex:none}",
			".cm-bandHead{display:grid;grid-template-columns:34px repeat(4,minmax(0,1fr));gap:6px;font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary);padding:0 2px;min-width:0}",
			".cm-bandHead div{min-width:0;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".cm-bandHead div:first-child{text-align:left}",
			".cm-bandRow{display:grid;grid-template-columns:34px repeat(4,minmax(0,1fr));gap:6px;align-items:center;min-width:0}",
			".cm-bandTag{font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary);display:flex;align-items:center;white-space:nowrap}",
			".cm-bandRow .cm-input{min-width:0;width:100%}",
			".cm-syncLine{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);min-width:0}",
			".cm-syncOk{color:var(--dsw-alias-state-success-primary)}",
			".cm-syncWarn{color:var(--dsw-alias-state-warn-primary)}",
			".cm-input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-primary);border-radius:6px;font-size:12px;line-height:18px;padding:2px 6px;font-variant-numeric:tabular-nums;min-width:0}",
			".cm-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}",
			".cm-inputModel{font-family:var(--dsw-font-mono, monospace)}",
			".cm-inputNum{text-align:right}",
			".cm-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);min-width:0}",
			".cm-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);min-width:0}",
			".cm-foot .cm-btn{margin-left:auto}",
			".cm-empty{color:var(--dsw-alias-label-tertiary);font-size:12px;padding:6px 2px}",
			".cm-loading{color:var(--dsw-alias-label-tertiary);font-size:12px;padding:4px 2px}",
			".cm-chevron{transition:transform .12s}",
			".cm-chevronOpen{transform:rotate(180deg)}",
		].join("");
		const tagId = "dsh-cost-meter/CostMeter.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-cost-meter";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region 工具函数
		/** 金额显示：按大小自适应小数位，去掉多余尾零。 */
		function formatMoney(cost) {
			if (typeof cost !== "number" || !isFinite(cost)) return "0";
			const rounded = Math.round(cost * 10000) / 10000;
			let text;
			if (rounded >= 100) text = rounded.toFixed(2);
			else if (rounded >= 1) text = rounded.toFixed(3);
			else text = rounded.toFixed(4);
			return text.replace(/\.?0+$/, "");
		}

		/** 币种符号：CNY 显示为 ¥，其它显示代码加空格。 */
		function moneySymbol(currency) {
			return currency === "CNY" ? "¥" : (currency || "") + " ";
		}

		/** token 数量显示。 */
		function formatTokens(n) {
			if (!Number.isFinite(n)) return "0";
			if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
			if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
			if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
			return String(Math.round(n));
		}

		/** 价格行的稳定 id：给 React 做 key，避免增删行时 DOM/光标复用错位。 */
		let priceRowSeq = 0;
		function nextRowId() {
			priceRowSeq += 1;
			return "row-" + priceRowSeq;
		}

		/**
		 * 价格输入值 → 数字。
		 * 空串按 0；非法输入返回 NaN，序列化后是 null，由服务端 schema 明确拒绝，
		 * 而不是在客户端被静默吞成一个看似合理的数字。
		 */
		function toPriceNumber(value) {
			if (typeof value === "number") return value;
			const text = String(value ?? "").trim();
			if (text === "") return 0;
			return Number(text);
		}

		/**
		 * 简短日期 MM-DD。
		 * 近 14 天的日期键由服务端按配置的日界算出（`stats.dayKeys`），
		 * 客户端不再自行做时区运算——否则浏览器时区与宿主不同时柱状图会整体错位。
		 */
		function shortDate(key) {
			return key.slice(5);
		}

		/**
		 * 取 JSON。失败时抛出携带状态码与服务端错误文案的 Error：
		 * 面板需要区分 409（并发改价）与 400（校验失败），并直接展示服务端的原因，
		 * 而不是只看到「HTTP 400」。
		 */
		function fetchJson(url, options) {
			return fetch(url, options).then((res) =>
				res
					.json()
					.catch(() => null)
					.then((body) => {
						if (!res.ok) {
							const error = new Error((body && body.error) || "HTTP " + res.status);
							error.status = res.status;
							throw error;
						}
						return body;
					})
			);
		}
		//#endregion

		//#region 组件
		/** 余额卡片。 */
		function BalanceCard(props) {
			const { balance, currency, refreshing, onRefresh } = props;
			if (balance === null || balance.loading) {
				return react.createElement("div", { className: "cm-card" },
					react.createElement("div", { className: "cm-cardLabel" }, "账户余额"),
					react.createElement("div", { className: "cm-loading" }, "读取中…"));
			}
			if (!balance.available) {
				const hint = balance.error === "NO_API_KEY"
					? "未找到 DeepSeek API key（DEEPSEEK_API_KEY）"
					: balance.error === "NON_LOCAL_BIND"
						? "DSH Web 绑定在所有网卡，出于安全考虑不下发账户余额"
						: "余额查询失败：" + String(balance.error ?? "unknown");
				return react.createElement("div", { className: "cm-card" },
					react.createElement("div", { className: "cm-cardLabel" }, "账户余额"),
					react.createElement("div", { className: "cm-balanceErr" }, hint),
					react.createElement("div", { className: "cm-balanceRow" },
						react.createElement("button", { type: "button", className: "cm-btn", onClick: onRefresh, disabled: refreshing },
							refreshing ? "刷新中…" : "重试")));
			}
			const cur = balance.currency || currency;
			return react.createElement("div", { className: "cm-card" },
				react.createElement("div", { className: "cm-balanceRow" },
					react.createElement("div", { className: "cm-cardLabel" }, "账户余额"),
					react.createElement("button", {
						type: "button",
						className: "cm-iconBtn",
						title: "刷新余额",
						"aria-label": "刷新余额",
						onClick: onRefresh,
						disabled: refreshing,
					}, react.createElement(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, { size: 14 }))),
				react.createElement("div", { className: "cm-balanceLine" },
					react.createElement("span", { className: "cm-balanceValue" }, moneySymbol(cur) + formatMoney(balance.totalBalance)),
					react.createElement("span", { className: "cm-balanceMeta" }, "可用")),
				react.createElement("div", { className: "cm-balanceMeta" },
					"赠送 " + formatMoney(balance.grantedBalance ?? 0) + " · 充值 " + formatMoney(balance.toppedUpBalance ?? 0) +
					(balance.at ? " · 更新于 " + new Date(balance.at).toLocaleTimeString() : "")));
		}

		/** 计费口径的输入 token = 未命中 + 缓存命中 + 缓存写入。 */
		function billedInput(bucket) {
			return bucket.inputTokens + (bucket.cacheReadTokens ?? 0) + (bucket.cacheWriteTokens ?? 0);
		}

		/** 今日/本周/本月/累计卡片。 */
		function PeriodGrid(props) {
			const { currency, periods } = props;
			const rows = [
				["今日", periods.today],
				["本周", periods.week],
				["本月", periods.month],
				["累计", periods.total],
			];
			return react.createElement(
				"div",
				{ className: "cm-periods" },
				rows.map(([label, bucket]) =>
					react.createElement(
						"div",
						{ key: label, className: "cm-period" },
						react.createElement("div", { className: "cm-periodLabel" }, label),
						react.createElement("div", { className: "cm-periodValue", title: moneySymbol(currency) + formatMoney(bucket.cost) },
							moneySymbol(currency) + formatMoney(bucket.cost)),
						react.createElement("div", { className: "cm-periodSub", title:
							"输入（未命中 " + formatTokens(bucket.inputTokens) +
							" · 命中 " + formatTokens(bucket.cacheReadTokens ?? 0) +
							" · 写入 " + formatTokens(bucket.cacheWriteTokens ?? 0) +
							"）· 输出 " + formatTokens(bucket.outputTokens) },
							bucket.calls + " 次 · " + formatTokens(billedInput(bucket) + bucket.outputTokens))
					)
				)
			);
		}

		/** 近 14 天每日消耗柱状图（日期键来自服务端，见 shortDate 注释）。 */
		function DailyChart(props) {
			const { daily, currency, dayKeys } = props;
			const byDate = new Map();
			for (const row of daily) byDate.set(row.date, row);
			const keys = Array.isArray(dayKeys) && dayKeys.length > 0 ? dayKeys : [];
			// 按数据最大值定标：早先用 Math.max(1, …) 会让所有日消耗都低于 1 元时
			// 每根柱子都被压到同一最小高度，小额用户看不出趋势。
			const peakCost = Math.max(0, ...keys.map((k) => byDate.get(k)?.cost ?? 0));
			const maxCost = peakCost > 0 ? peakCost : 1;
			const bars = keys.map((key, index) => {
				const row = byDate.get(key);
				const cost = row?.cost ?? 0;
				const height = cost <= 0 ? 0 : Math.max(4, Math.round((cost / maxCost) * 60));
				return {
					key,
					cost,
					height,
					label: index % 2 === 1 ? shortDate(key) : "",
					title: shortDate(key) + "：" + (row ? moneySymbol(currency) + formatMoney(cost) : "无记录"),
				};
			});
			return react.createElement(
				"div",
				{ className: "cm-card" },
				react.createElement("div", { className: "cm-cardLabel" }, "近 14 天每日消耗"),
				react.createElement(
					"div",
					{ className: "cm-chart" },
					bars.map((bar) =>
						react.createElement("div", {
							key: bar.key,
							className: "cm-bar" + (bar.height === 0 ? " cm-barZero" : ""),
							style: { height: bar.height + "px" },
							title: bar.title,
						})
					)
				),
				react.createElement(
					"div",
					{ className: "cm-chartLabels" },
					bars.map((bar) =>
						react.createElement("div", { key: bar.key, className: "cm-chartLabel" }, bar.label)
					)
				)
			);
		}

		/** 模型明细列表。 */
		function ModelRows(props) {
			const { byModel, currency } = props;
			if (byModel.length === 0) {
				return react.createElement("div", { className: "cm-empty" }, "暂无模型用量记录");
			}
			return react.createElement(
				"div",
				{ className: "cm-card" },
				react.createElement("div", { className: "cm-cardLabel" }, "模型用量"),
				byModel.map((m) =>
					react.createElement(
						"div",
						{ key: m.model, className: "cm-row" },
						react.createElement(
							"div",
							{ className: "cm-rowModel" },
							react.createElement("span", { className: "cm-modelTag", title: m.model }, m.model),
							m.unpriced
								? react.createElement("span", { className: "cm-modelTag cm-unpriced", title: "该模型未配置单价，费用按 0 计" }, "未定价")
								: null
						),
						react.createElement("span", { className: "cm-rowNum", title: "调用次数" }, String(m.calls) + " 次"),
						react.createElement("span", { className: "cm-rowNum", title:
							"输入（未命中 " + formatTokens(m.inputTokens) +
							" · 命中 " + formatTokens(m.cacheReadTokens ?? 0) +
							" · 写入 " + formatTokens(m.cacheWriteTokens ?? 0) + "）" },
							formatTokens(billedInput(m))),
						react.createElement("span", { className: "cm-rowNum", title: "输出" },
							formatTokens(m.outputTokens)),
						react.createElement("span", { className: "cm-rowCost", title: "费用" },
							moneySymbol(currency) + formatMoney(m.cost))
					)
				)
			);
		}

		/** 价格数字输入框（type=number 的受控输入）。 */
		function priceInput(value, title, handler) {
			return react.createElement("input", {
				className: "cm-input cm-inputNum",
				type: "number",
				min: "0",
				step: "0.01",
				value,
				title,
				onChange: (e) => handler(e.target.value),
			});
		}

		/** 模型单价编辑器（空闲/高峰双档 + 同步官方价格）。 */
		function PriceEditor(props) {
			const { draft, currency, saving, syncing, syncError, saveError, expanded, syncMeta, onChange, onAddRow, onRemoveRow, onSave, onSync, onToggle } = props;
			const syncLabel = (() => {
				if (syncMeta === null || syncMeta === undefined || syncMeta.lastSyncAt === undefined) {
					return react.createElement("div", { className: "cm-syncLine" }, "尚未同步过官方价格");
				}
				const source = syncMeta.lastSyncSource === "remote" ? "远程" : "内置兜底";
				const when = new Date(syncMeta.lastSyncAt).toLocaleString();
				return react.createElement(
					"div",
					{ className: "cm-syncLine" },
					react.createElement("span", { className: syncMeta.lastSyncError ? "cm-syncWarn" : "cm-syncOk" },
						"上次同步：" + source + " · " + when),
					syncMeta.lastSyncError
						? react.createElement("span", { className: "cm-syncWarn" }, "（远程解析失败：" + syncMeta.lastSyncError + "）")
						: null
				);
			})();
			return react.createElement(
				"div",
				{ className: "cm-card" },
				react.createElement(
					"div",
					{ className: "cm-balanceRow" },
					react.createElement("div", { className: "cm-cardLabel" }, "模型单价（" + currency + " / 100 万 tokens）"),
					react.createElement("button", {
						type: "button",
						className: "cm-btn",
						title: "从官方定价页同步价格表（覆盖手动调整）",
						onClick: onSync,
						disabled: syncing,
					},
						react.createElement(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, { size: 12 }),
						syncing ? "同步中…" : "同步官方价格"),
					react.createElement("button", {
						type: "button",
						className: "cm-iconBtn",
						title: expanded ? "收起" : "展开",
						"aria-label": expanded ? "收起价格设置" : "展开价格设置",
						"aria-expanded": expanded,
						onClick: onToggle,
					}, react.createElement(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {
						size: 14,
						className: "cm-chevron" + (expanded ? " cm-chevronOpen" : ""),
					}))
				),
				!expanded
					? null
					: react.createElement(
							react.Fragment,
							null,
							react.createElement("div", { className: "cm-hint" },
								"高峰时段为北京时间周一至周五 9:00-12:00、14:00-18:00，其余为空闲时段；费用按每次调用的北京时间自动选档。缓存写官方无单独收费（默认 0）。"),
							syncError
								? react.createElement("div", { className: "cm-syncLine" },
									react.createElement("span", { className: "cm-syncWarn" }, "同步失败：" + syncError))
								: null,
							saveError
								? react.createElement("div", { className: "cm-syncLine" },
									react.createElement("span", { className: "cm-syncWarn" }, "保存失败：" + saveError))
								: null,
							syncLabel,
							draft.map((row, index) =>
								react.createElement(
									"div",
									{ key: row.id ?? index, className: "cm-priceCard" },
									react.createElement(
										"div",
										{ className: "cm-priceModelRow" },
										react.createElement("input", {
											className: "cm-input cm-inputModel",
											value: row.model,
											placeholder: "模型 id（* 为默认）",
											onChange: (e) => onChange(index, "model", e.target.value),
										}),
										react.createElement("button", {
											type: "button",
											className: "cm-iconBtn",
											title: "删除该行",
											"aria-label": "删除该模型",
											onClick: () => onRemoveRow(index),
										}, react.createElement(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, { size: 14 }))
									),
									react.createElement(
										"div",
										{ className: "cm-bandHead" },
										react.createElement("div", null),
										react.createElement("div", null, "输入"),
										react.createElement("div", null, "缓存读"),
										react.createElement("div", null, "缓存写"),
										react.createElement("div", null, "输出")
									),
									react.createElement(
										"div",
										{ className: "cm-bandRow" },
										react.createElement("span", { className: "cm-bandTag" }, "空闲"),
										priceInput(row.inputPerM ?? 0, "空闲时段输入单价", (v) => onChange(index, "inputPerM", v)),
										priceInput(row.cacheReadPerM ?? 0, "空闲时段缓存命中单价", (v) => onChange(index, "cacheReadPerM", v)),
										priceInput(row.cacheWritePerM ?? 0, "空闲时段缓存写入单价", (v) => onChange(index, "cacheWritePerM", v)),
										priceInput(row.outputPerM ?? 0, "空闲时段输出单价", (v) => onChange(index, "outputPerM", v))
									),
									react.createElement(
										"div",
										{ className: "cm-bandRow" },
										react.createElement("span", { className: "cm-bandTag" }, "高峰"),
										priceInput(row.peakInputPerM ?? row.inputPerM ?? 0, "高峰时段输入单价", (v) => onChange(index, "peakInputPerM", v)),
										priceInput(row.peakCacheReadPerM ?? row.cacheReadPerM ?? 0, "高峰时段缓存命中单价", (v) => onChange(index, "peakCacheReadPerM", v)),
										priceInput(row.peakCacheWritePerM ?? row.cacheWritePerM ?? 0, "高峰时段缓存写入单价", (v) => onChange(index, "peakCacheWritePerM", v)),
										priceInput(row.peakOutputPerM ?? row.outputPerM ?? 0, "高峰时段输出单价", (v) => onChange(index, "peakOutputPerM", v))
									)
								)
							),
							react.createElement(
								"div",
								{ className: "cm-foot" },
								react.createElement("button", { type: "button", className: "cm-btn", onClick: onAddRow },
									react.createElement(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 12 }), "添加模型"),
								react.createElement("button", { type: "button", className: "cm-btn cm-btnPrimary", onClick: onSave, disabled: saving },
									saving ? "保存中…" : "保存单价")
							)
						)
			);
		}

		/** 会话头部按钮 + 下拉看板。 */
		function CostMeterAction(props) {
			const [open, setOpen] = react.useState(false);
			const [stats, setStats] = react.useState(null);
			const [error, setError] = react.useState(null);
			const [draft, setDraft] = react.useState(null);
			const [saving, setSaving] = react.useState(false);
			const [syncing, setSyncing] = react.useState(false);
			const [syncError, setSyncError] = react.useState(null);
			const [saveError, setSaveError] = react.useState(null);
			const [refreshing, setRefreshing] = react.useState(false);
			const [pricesOpen, setPricesOpen] = react.useState(false);
			const rootRef = react.useRef(null);

			const load = react.useCallback(() => {
				fetchJson("/api/cost-meter/stats")
					.then((data) => {
						setStats(data);
						setError(null);
					})
					.catch((err) => setError(String(err && err.message ? err.message : err)));
			}, []);

			react.useEffect(() => {
				load();
				const timer = setInterval(load, 30000);
				return () => clearInterval(timer);
			}, [load]);

			/** 用服务端价格重置编辑器草稿（带上稳定行 id，避免 React 复用错行）。 */
			const resetDraft = react.useCallback((rows) => {
				setDraft((rows ?? []).map((row) => ({ ...row, id: nextRowId() })));
			}, []);

			// 统计首次加载后初始化价格草稿。只在草稿还没建立时初始化：
			// 30 秒轮询会带来新价格，直接覆盖会吞掉用户正在输入的内容。
			react.useEffect(() => {
				if (stats !== null && stats.prices !== undefined && draft === null) {
					resetDraft(stats.prices);
				}
			}, [stats, draft, resetDraft]);

			// 打开时同步一次；Esc 关闭；外部点击关闭。
			react.useEffect(() => {
				if (!open) return;
				load();
				const onKeyDown = (e) => {
					if (e.key === "Escape") setOpen(false);
				};
				document.addEventListener("keydown", onKeyDown);
				return () => document.removeEventListener("keydown", onKeyDown);
			}, [open, load]);
			(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(rootRef, open, setOpen);

			const refreshBalance = () => {
				setRefreshing(true);
				setSaveError(null);
				fetchJson("/api/cost-meter/refresh-balance", { method: "POST" })
					.then(() => load())
					.catch((err) => setSaveError("余额刷新失败：" + String(err && err.message ? err.message : err)))
					.finally(() => setRefreshing(false));
			};

			/**
			 * 编辑价格字段。
			 * 数值字段保存**原始字符串**：受控的 number 输入会把 "0." 立刻解析成 0 并写回
			 * "0"，导致 0.02 这类小数根本无法输入。真正解析推迟到保存时。
			 */
			const onPricesChange = (index, field, raw) => {
				setDraft((current) => {
					const next = current.map((row, i) => (i === index ? { ...row } : row));
					next[index][field] = raw;
					return next;
				});
			};

			const onAddRow = () => {
				setDraft((current) => [
					...(current ?? []),
					{ id: nextRowId(), model: "", inputPerM: 0, cacheReadPerM: 0, cacheWritePerM: 0, outputPerM: 0,
						peakInputPerM: 0, peakCacheReadPerM: 0, peakCacheWritePerM: 0, peakOutputPerM: 0 },
				]);
			};

			const onRemoveRow = (index) => {
				setDraft((current) => current.filter((_, i) => i !== index));
			};

			/** 高峰档价格：未填写时回退到空闲档，与编辑器显示的回退语义一致。 */
			const peakPrice = (peak, base) =>
				toPriceNumber(peak === "" || peak === undefined || peak === null ? base : peak);

			/** 把草稿里的字符串价格转成数字行（非法值序列化成 null，由服务端报错）。 */
			const toPriceRows = (rows) =>
				rows.map((row) => ({
					model: row.model,
					inputPerM: toPriceNumber(row.inputPerM),
					cacheReadPerM: toPriceNumber(row.cacheReadPerM),
					cacheWritePerM: toPriceNumber(row.cacheWritePerM),
					outputPerM: toPriceNumber(row.outputPerM),
					peakInputPerM: peakPrice(row.peakInputPerM, row.inputPerM),
					peakCacheReadPerM: peakPrice(row.peakCacheReadPerM, row.cacheReadPerM),
					peakCacheWritePerM: peakPrice(row.peakCacheWritePerM, row.cacheWritePerM),
					peakOutputPerM: peakPrice(row.peakOutputPerM, row.outputPerM),
				}));

			const savePrices = () => {
				if (draft === null) return;
				setSaving(true);
				setSaveError(null);
				fetchJson("/api/cost-meter/prices", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ prices: toPriceRows(draft) }),
				})
					.then(() => load())
					.catch((err) => {
						const conflict = err !== null && err !== undefined && err.status === 409;
						setSaveError(
							conflict
								? "价格已在别处修改，已重新载入最新价格"
								: String(err && err.message ? err.message : err),
						);
						if (conflict) {
							// 冲突时草稿必须回到服务端的真实价格，否则用户看到的仍是旧值。
							fetchJson("/api/cost-meter/stats")
								.then((data) => {
									if (Array.isArray(data.prices)) resetDraft(data.prices);
									setStats(data);
									setError(null);
								})
								.catch(() => {});
						} else {
							load();
						}
					})
					.finally(() => setSaving(false));
			};

			const syncPrices = () => {
				setSyncing(true);
				setSyncError(null);
				setSaveError(null);
				fetchJson("/api/cost-meter/sync-prices", { method: "POST" })
					.then((result) => {
						// 同步会覆盖价格表，编辑器草稿必须跟着换成新价，否则界面上仍是旧价，
						// 用户再点一次「保存单价」就把刚同步的价格覆盖回去了。
						if (result !== null && Array.isArray(result.prices)) resetDraft(result.prices);
						load();
					})
					.catch((err) => setSyncError(String(err && err.message ? err.message : err)))
					.finally(() => setSyncing(false));
			};

			const currency = stats !== null && stats.currency ? stats.currency : "CNY";
			const todayCost = stats !== null ? (stats.periods.today.cost ?? 0) : null;
			const triggerLabel = todayCost === null ? "…" : moneySymbol(currency) + formatMoney(todayCost);
			// 今日样本里存在没有单价行的模型时给出可见提示：这类情况下费用恒为 0，
			// 仅看胶囊数字无法区分“真的没花钱”和“价格表没匹配上”。
			const unpriced = stats !== null && stats.periods.today.unpriced === true;
			// 已有数据时刷新失败过去是完全静默的：胶囊会一直显示旧值，看起来一切正常。
			const stale = error !== null && stats !== null;
			const triggerHint = "今日 DS 消耗 " + triggerLabel + (unpriced ? "（有模型缺单价，按 0 计）" : "") + "，点击查看费用统计";

			const panel = open
				? react.createElement(
						"div",
						{ className: "cm-panel", role: "dialog", "aria-label": "费用统计" },
						react.createElement(
							"div",
							{ className: "cm-head" },
							react.createElement("div", { className: "cm-title" }, "费用统计"),
							react.createElement("button", {
								type: "button",
								className: "cm-iconBtn",
								title: "关闭",
								"aria-label": "关闭",
								onClick: () => setOpen(false),
							}, react.createElement(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, { size: 16 }))
						),
						react.createElement(
							"div",
							{ className: "cm-body" },
							error !== null && stats === null
								? react.createElement("div", { className: "cm-balanceErr" }, "加载失败：" + error)
								: stats === null
									? react.createElement("div", { className: "cm-loading" }, "加载中…")
									: react.createElement(
											react.Fragment,
											null,
											stale
												? react.createElement("div", { className: "cm-balanceErr" },
													"刷新失败，以下为上次成功读取的数据：" + error)
												: null,
											react.createElement(BalanceCard, { balance: stats.balance, currency, refreshing, onRefresh: refreshBalance }),
											react.createElement(PeriodGrid, { currency, periods: stats.periods }),
											react.createElement(DailyChart, { daily: stats.daily, currency, dayKeys: stats.dayKeys }),
											react.createElement(ModelRows, { byModel: stats.byModel, currency }),
											react.createElement(PriceEditor, {
												draft: draft ?? [],
												currency,
												saving,
												syncing,
												syncError,
												saveError,
												expanded: pricesOpen,
												syncMeta: stats.pricesMeta ?? null,
												onChange: onPricesChange,
												onAddRow,
												onRemoveRow,
												onSave: savePrices,
												onSync: syncPrices,
												onToggle: () => setPricesOpen((v) => !v),
											})
										),
							stats !== null
								? react.createElement(
										"div",
										{ className: "cm-foot" },
										react.createElement("span", null,
											"样本 " + stats.sampleCount + " 条" +
											(stats.since !== undefined ? " · 自 " + new Date(stats.since).toLocaleDateString() : "")),
										react.createElement("button", { type: "button", className: "cm-btn", onClick: load }, "刷新")
									)
								: null
						)
					)
				: null;

			return react.createElement(
				"div",
				{ ref: rootRef, className: "cm-wrap" },
				react.createElement(
					"button",
					{
						type: "button",
						className: "cm-trigger" + (unpriced || stale ? " cm-triggerWarn" : ""),
						"aria-expanded": open,
						"aria-label": triggerHint,
						title: triggerHint,
						onClick: () => setOpen((v) => !v),
					},
					react.createElement("span", null, "今日"),
					react.createElement("span", { className: "cm-triggerVal" }, triggerLabel),
					react.createElement(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {
						size: 12,
						className: "cm-chevron" + (open ? " cm-chevronOpen" : ""),
					})
				),
				panel
			);
		}
		//#endregion

		//#region 插件体
		/** 依赖的客户端服务。 */
		const inject = ["slots"];
		/**
		 * 客户端插件体：把费用按钮注册进会话头部 utilities 行
		 * （Session log 按钮旁边）。
		 */
		function apply(ctx) {
			ctx.slots.inject("conversation.session.header.utilities", () =>
				ctx.slots.register(
					{
						name: "conversation.session.header.utilities",
						id: "cost-meter",
						order: 10,
					},
					CostMeterAction
				)
			);
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
