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

		/** 本地 YYYY-MM-DD。 */
		function dayKey(date) {
			const y = date.getFullYear();
			const m = String(date.getMonth() + 1).padStart(2, "0");
			const d = String(date.getDate()).padStart(2, "0");
			return y + "-" + m + "-" + d;
		}

		/** 近 N 天日期键（含今天）。 */
		function recentDayKeys(days) {
			const out = [];
			const now = new Date();
			for (let i = days - 1; i >= 0; i--) {
				out.push(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
			}
			return out;
		}

		/** 简短日期 MM-DD。 */
		function shortDate(key) {
			return key.slice(5);
		}

		function fetchJson(url, options) {
			return fetch(url, options).then((res) => {
				if (!res.ok) throw new Error("HTTP " + res.status);
				return res.json();
			});
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

		/** 近 14 天每日消耗柱状图。 */
		function DailyChart(props) {
			const { daily, currency } = props;
			const byDate = new Map();
			for (const row of daily) byDate.set(row.date, row);
			const keys = recentDayKeys(14);
			const maxCost = Math.max(1, ...keys.map((k) => byDate.get(k)?.cost ?? 0));
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
			const { draft, currency, saving, syncing, syncError, expanded, syncMeta, onChange, onAddRow, onRemoveRow, onSave, onSync, onToggle } = props;
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
								"高峰时段为北京时间 9:00-12:00、14:00-18:00，其余为空闲时段；费用按每次调用的北京时间自动选档。缓存写官方无单独收费（默认 0）。"),
							syncError
								? react.createElement("div", { className: "cm-syncLine" },
									react.createElement("span", { className: "cm-syncWarn" }, "同步失败：" + syncError))
								: null,
							syncLabel,
							draft.map((row, index) =>
								react.createElement(
									"div",
									{ key: index, className: "cm-priceCard" },
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

			// 统计加载后初始化价格草稿（仅当用户尚未开始编辑）。
			react.useEffect(() => {
				if (stats !== null && stats.prices !== undefined && draft === null) {
					setDraft(stats.prices.map((p) => ({ ...p })));
				}
			}, [stats, draft]);

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
				fetchJson("/api/cost-meter/refresh-balance", { method: "POST" })
					.then(() => load())
					.finally(() => setRefreshing(false));
			};

			const onPricesChange = (index, field, raw) => {
				setDraft((current) => {
					const next = current.map((row, i) => (i === index ? { ...row } : row));
					next[index][field] = field === "model" ? raw : Math.max(0, parseFloat(raw) || 0);
					return next;
				});
			};

			const onAddRow = () => {
				setDraft((current) => [
					...(current ?? []),
					{ model: "", inputPerM: 1.5, cacheReadPerM: 0.05, cacheWritePerM: 0, outputPerM: 4.5,
						peakInputPerM: 1.5, peakCacheReadPerM: 0.05, peakCacheWritePerM: 0, peakOutputPerM: 4.5 },
				]);
			};

			const onRemoveRow = (index) => {
				setDraft((current) => current.filter((_, i) => i !== index));
			};

			const savePrices = () => {
				if (draft === null) return;
				setSaving(true);
				fetchJson("/api/cost-meter/prices", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ prices: draft }),
				})
					.then(() => load())
					.finally(() => setSaving(false));
			};

			const syncPrices = () => {
				setSyncing(true);
				setSyncError(null);
				fetchJson("/api/cost-meter/sync-prices", { method: "POST" })
					.then(() => load())
					.catch((err) => setSyncError(String(err && err.message ? err.message : err)))
					.finally(() => setSyncing(false));
			};

			const currency = stats !== null && stats.currency ? stats.currency : "CNY";
			const todayCost = stats !== null ? (stats.periods.today.cost ?? 0) : null;
			const triggerLabel = todayCost === null ? "…" : moneySymbol(currency) + formatMoney(todayCost);

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
											react.createElement(BalanceCard, { balance: stats.balance, currency, refreshing, onRefresh: refreshBalance }),
											react.createElement(PeriodGrid, { currency, periods: stats.periods }),
											react.createElement(DailyChart, { daily: stats.daily, currency }),
											react.createElement(ModelRows, { byModel: stats.byModel, currency }),
											react.createElement(PriceEditor, {
												draft: draft ?? [],
												currency,
												saving,
												syncing,
												syncError,
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
						className: "cm-trigger",
						"aria-expanded": open,
						"aria-label": "今日 DS 消耗 " + triggerLabel + "，点击查看费用统计",
						title: "今日 DS 消耗 " + triggerLabel + "，点击查看费用统计",
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
