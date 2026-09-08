window.__ModuleLoader__.load({
	id: "@team-dsh-plugins/mcp-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const {
			Button,
			IconCopyOutline16,
			IconEllipsisOutline16,
			IconLoadingOutline16,
			Menu,
			Modal,
			StateDot,
			Toast,
			Tooltip,
		} = require("@deepseek-ai/dsh-client-ui-primitives");
		const h = React.createElement;
		const NS = "mcp-manager";

		const zh = {
			section: "MCP 管理",
			title: "MCP Server",
			subtitle: "管理当前 DSH Web Profile 的全局 MCP 连接。",
			add: "添加 MCP",
			emptyTitle: "还没有 MCP Server",
			emptyBody: "粘贴第三方配置，或手动添加 stdio、Streamable HTTP 连接。",
			importMode: "粘贴配置",
			manualMode: "手动填写",
			importHint: "支持 JSON、JSONC、YAML、Markdown 代码块、完整 mcpServers、DSH Profile MCP patch 或单个 Server 配置。",
			importPlaceholder: "粘贴第三方提供的 MCP Server 配置",
			parse: "解析配置",
			parsing: "正在解析",
			imported: "已解析 {count} 个 MCP Server",
			importRepairs: "解析说明",
			conflictTitle: "Server name 已存在",
			conflictHint: "明确选择更新现有实例，或使用新的 server name 保存。",
			updateExisting: "更新现有实例",
			saveAsNew: "另存为新实例",
			batchSave: "保存所选项",
			batchSaved: "MCP Server 已保存为禁用状态。",
			select: "选择 {name}",
			requiredLegend: "* 为必填项",
			required: "必填",
			optional: "选填",
			name: "显示名称",
			serverName: "Server name",
			serverNameHelp: "用于工具前缀，仅支持字母、数字、- 和 _，最多 32 个字符。",
			transport: "传输方式",
			command: "Command",
			args: "Arguments（选填）",
			cwd: "工作目录（选填）",
			env: "环境变量（选填）",
			url: "URL",
			headers: "Headers（选填）",
			key: "名称",
			value: "值",
			secret: "敏感值",
			configured: "已配置；留空则保持不变",
			addRow: "添加一项",
			remove: "移除",
			clearCredential: "清除凭据",
			advanced: "高级设置",
			customized: "已自定义",
			restoreDefaults: "恢复默认值",
			timeout: "工具调用超时（毫秒）",
			reconnect: "自动重连",
			initialDelay: "初始延迟（毫秒）",
			maxDelay: "最大延迟（毫秒）",
			maxAttempts: "最大尝试次数",
			cancel: "取消",
			close: "关闭",
			save: "仅保存",
			saveEnable: "保存并启用",
			testApply: "测试并应用",
			test: "测试连接",
			testing: "正在测试连接",
			cancelTest: "取消测试",
			testSuccess: "测试通过",
			saveDisabledAfterFailure: "仍保存为禁用",
			saved: "MCP Server 已保存。",
			enabledDone: "MCP Server 已启用。",
			applied: "新配置已测试并应用。",
			discard: "当前修改尚未保存，确定放弃吗？",
			executionTitle: "确认执行第三方 MCP",
			executionBody: "测试或启用将以当前用户权限执行以下命令或访问目标地址。",
			deleteTitle: "删除 MCP Server？",
			deleteBody: "删除将停止实例并移除由管理器托管的凭据。",
			confirm: "确认",
			delete: "删除",
			edit: "编辑",
			enable: "启用",
			disable: "禁用",
			restart: "重新启动",
			restarting: "正在重新启动",
			retry: "重试启动",
			tools: "查看工具",
			toolsDisabled: "查看工具（启用后可用）",
			toolsTitle: "{name} 的工具",
			loadingTools: "正在获取工具",
			noTools: "当前没有可用工具。",
			noDescription: "无描述",
			schema: "Input Schema",
			moreActions: "更多操作",
			disabled: "已禁用",
			starting: "正在启动",
			loaded: "已启动",
			failed: "启动失败",
			unknown: "状态未知",
			toolCount: "{count} 个工具",
			operationFailed: "操作未完成",
			technicalDetails: "技术详情",
			copyDetails: "复制诊断信息",
			copied: "诊断信息已复制。",
			copyFailed: "复制失败，请手动选择。",
			refresh: "刷新",
			refreshFailed: "无法读取 MCP Server，请稍后重试。",
			conflict: "配置已被其他窗口修改，请刷新后重试。",
			errorRequired: "请填写此必填项。",
			errorServerName: "请输入合法的 server name。",
			errorUrl: "请输入 http 或 https URL。",
			errorHttpsCredential: "携带凭据的 Header 必须使用 HTTPS。",
			errorCredential: "请填写凭据，或取消“敏感值”。",
			errorNumber: "请输入有效的正整数。",
			errorPathEscape: "工作目录包含控制字符，请检查反斜杠转义。",
		};
		const en = {
			...zh,
			section: "MCP management",
			title: "MCP Servers",
			subtitle: "Manage global MCP connections for the current DSH Web Profile.",
			add: "Add MCP",
			emptyTitle: "No MCP Servers yet",
			emptyBody: "Paste a third-party config or add a stdio or Streamable HTTP connection.",
			importMode: "Paste config",
			manualMode: "Manual setup",
			importHint: "Supports JSON, JSONC, YAML, Markdown fences, mcpServers, DSH Profile MCP patches, and single-server objects.",
			importPlaceholder: "Paste an MCP Server configuration",
			parse: "Parse config",
			parsing: "Parsing",
			imported: "Parsed {count} MCP Servers",
			importRepairs: "Import notes",
			conflictTitle: "Server name already exists",
			conflictHint: "Choose whether to update the existing instance or use a new server name.",
			updateExisting: "Update existing",
			saveAsNew: "Save as new",
			batchSave: "Save selected",
			requiredLegend: "* marks required fields",
			required: "required",
			optional: "optional",
			name: "Display name",
			serverNameHelp: "Used in tool prefixes. Letters, numbers, - and _ only; up to 32 characters.",
			transport: "Transport",
			cwd: "Working directory (optional)",
			env: "Environment variables (optional)",
			headers: "Headers (optional)",
			key: "Name",
			value: "Value",
			secret: "Secret",
			configured: "Configured; leave blank to keep it",
			addRow: "Add item",
			remove: "Remove",
			clearCredential: "Clear credential",
			advanced: "Advanced settings",
			customized: "Customized",
			restoreDefaults: "Restore defaults",
			reconnect: "Reconnect automatically",
			cancel: "Cancel",
			close: "Close",
			save: "Save only",
			saveEnable: "Save and enable",
			testApply: "Test and apply",
			test: "Test connection",
			testing: "Testing connection",
			cancelTest: "Cancel test",
			testSuccess: "Test passed",
			saveDisabledAfterFailure: "Save disabled anyway",
			saved: "MCP Server saved.",
			enabledDone: "MCP Server enabled.",
			applied: "The new configuration was tested and applied.",
			discard: "Discard unsaved changes?",
			executionTitle: "Confirm third-party MCP execution",
			executionBody: "Testing or enabling runs this command or accesses this URL with your user permissions.",
			deleteTitle: "Delete MCP Server?",
			deleteBody: "Deleting stops the instance and removes credentials managed for it.",
			confirm: "Confirm",
			delete: "Delete",
			edit: "Edit",
			enable: "Enable",
			disable: "Disable",
			restart: "Restart",
			restarting: "Restarting",
			retry: "Retry startup",
			tools: "View tools",
			toolsDisabled: "View tools (enable first)",
			toolsTitle: "{name} tools",
			loadingTools: "Loading tools",
			noTools: "No tools are currently available.",
			noDescription: "No description",
			moreActions: "More actions",
			disabled: "Disabled",
			starting: "Starting",
			loaded: "Started",
			failed: "Startup failed",
			unknown: "Unknown status",
			toolCount: "{count} tools",
			operationFailed: "Operation did not complete",
			technicalDetails: "Technical details",
			copyDetails: "Copy diagnostics",
			copied: "Diagnostics copied.",
			copyFailed: "Copy failed. Select the text manually.",
			refresh: "Refresh",
			refreshFailed: "Could not load MCP Servers. Try again.",
			conflict: "The configuration changed in another window. Refresh and retry.",
			errorRequired: "Complete this required field.",
			errorServerName: "Enter a valid server name.",
			errorUrl: "Enter an http or https URL.",
			errorHttpsCredential: "Credential headers require HTTPS.",
			errorCredential: "Enter the credential or clear Secret.",
			errorNumber: "Enter a valid positive integer.",
			errorPathEscape: "The working directory contains a control character. Check backslash escaping.",
		};

		const css = [
			".mm-root{width:100%;max-width:860px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:20px}",
			".mm-header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-top:4px}.mm-heading{min-width:0}.mm-heading h2{margin:0;font-size:18px;line-height:26px}.mm-heading p,.mm-muted{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}",
			".mm-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.mm-card,.mm-empty{background:var(--dsw-alias-bg-layer-3);box-shadow:var(--dsw-elevation-stroke);border-radius:12px}.mm-card{padding:14px;display:flex;flex-direction:column;gap:10px}.mm-cardTop{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start}.mm-identity{display:flex;gap:10px;min-width:0}.mm-title{min-width:0}.mm-title strong{display:block;font-size:14px;line-height:20px}.mm-meta{color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:11px;line-height:18px;overflow-wrap:anywhere}.mm-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.mm-cardActions,.mm-rowActions,.mm-modalActions,.mm-modeTabs{display:flex;align-items:center;gap:8px}.mm-inlineError{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}.mm-empty{padding:32px 20px;text-align:center}.mm-empty strong{font-size:14px}.mm-empty p{margin:6px 0 14px;color:var(--dsw-alias-label-tertiary);font-size:13px}",
			".mm-editorDialog{width:min(720px,100%);max-height:calc(100vh - 48px)}.mm-modalBody{width:100%;min-width:0;max-height:min(60vh,560px);overflow-y:auto;overflow-x:hidden;padding-right:4px;display:flex;flex-direction:column;gap:14px}.mm-modalFooter{display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap;padding-top:10px}.mm-modeTabs{border-bottom:.5px solid var(--dsw-alias-border-l2);padding-bottom:10px}.mm-import{display:flex;flex-direction:column;gap:10px}.mm-textarea{box-sizing:border-box;width:100%;min-height:200px;max-height:400px;resize:vertical;border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:12px/18px var(--ds-font-family-code);padding:10px}.mm-textarea:focus-visible,.mm-input:focus-visible,.mm-select:focus-visible,.mm-advanced summary:focus-visible,.mm-tool summary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.mm-notices{display:flex;flex-direction:column;gap:6px;margin:0;padding:10px 10px 10px 28px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-size:12px;line-height:18px}.mm-notices li[data-level=blocking]{color:var(--dsw-alias-state-error-primary)}.mm-notices li[data-level=warning]{color:var(--dsw-alias-state-warning-primary)}.mm-batch{display:flex;flex-direction:column;gap:8px}.mm-batchItem{display:flex;align-items:flex-start;gap:10px;padding:10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px}.mm-batchItem input{margin-top:3px}.mm-batchText{min-width:0}.mm-batchText strong{display:block;font-size:13px}.mm-batchText span{font-size:11px;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code)}",
			".mm-legend{font-size:11px;color:var(--dsw-alias-label-tertiary)}.mm-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mm-field{display:flex;flex-direction:column;gap:5px;min-width:0}.mm-fieldWide{grid-column:1/-1}.mm-label,.mm-groupTitle{font-size:12px;color:var(--dsw-alias-label-secondary)}.mm-required{color:var(--dsw-alias-state-error-primary)}.mm-help,.mm-fieldError{font-size:11px;line-height:16px}.mm-help{color:var(--dsw-alias-label-tertiary)}.mm-fieldError{color:var(--dsw-alias-state-error-primary)}.mm-input,.mm-select{box-sizing:border-box;width:100%;height:36px;border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;padding:0 10px}.mm-input[aria-invalid=true],.mm-textarea[aria-invalid=true]{border-color:var(--dsw-alias-state-error-primary)}.mm-check{display:flex;align-items:center;gap:7px;font-size:12px}.mm-rows{display:flex;flex-direction:column;gap:8px}.mm-row{display:grid;grid-template-columns:minmax(110px,.7fr) minmax(170px,1fr) auto;gap:8px;align-items:start}.mm-rowArgs{grid-template-columns:minmax(200px,1fr) auto}.mm-rowValue{display:flex;flex-direction:column;gap:5px}.mm-advanced{grid-column:1/-1;border-top:.5px solid var(--dsw-alias-border-l2);padding-top:10px}.mm-advanced summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px}.mm-advancedGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.mm-advancedHead{display:flex;align-items:center;justify-content:space-between;gap:8px}.mm-badge{font-size:11px;color:var(--dsw-alias-state-business-primary);margin-left:6px}",
			".mm-operation{display:flex;align-items:center;gap:8px;padding:10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-size:12px}.mm-rotate{animation:mm-spin 1s linear infinite}@keyframes mm-spin{to{transform:rotate(360deg)}}.mm-testResult{border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px}.mm-toolList{max-height:240px;overflow:auto;padding-right:4px}.mm-tool{border-top:.5px solid var(--dsw-alias-border-l2);padding:8px 0}.mm-tool:first-child{border-top:0}.mm-tool summary{cursor:pointer;font-size:13px;font-weight:600}.mm-tool p{margin:4px 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.mm-code{font-family:var(--ds-font-family-code);font-size:11px;line-height:17px;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:10px}.mm-errorBox{border-left:3px solid var(--dsw-alias-state-error-primary);padding:8px 10px;background:var(--dsw-alias-bg-layer-2);font-size:12px}.mm-errorBox strong{display:block;color:var(--dsw-alias-state-error-primary)}.mm-errorBox p{margin:4px 0;color:var(--dsw-alias-label-secondary)}.mm-errorBox details{margin-top:6px}.mm-errorBox pre{max-height:160px;overflow:auto}",
			"@media(max-width:680px){.mm-header{flex-direction:column;gap:12px}.mm-header>button{width:100%}.mm-cardTop{grid-template-columns:1fr}.mm-cardActions{justify-content:flex-end}.mm-grid,.mm-advancedGrid{grid-template-columns:1fr}.mm-fieldWide,.mm-advanced{grid-column:auto}.mm-row,.mm-rowArgs{grid-template-columns:1fr}.mm-modalFooter>button{flex:1}}",

			"@media(prefers-reduced-motion:reduce){.mm-rotate{animation:none}}",
		].join("");
		if (!document.querySelector('style[data-plugin-css="@team-dsh-plugins/mcp-manager"]')) {
			const style = document.createElement("style");
			style.dataset.pluginCss = "@team-dsh-plugins/mcp-manager";
			style.textContent = css;
			document.head.appendChild(style);
		}

		const DEFAULT_RECONNECT = {
			enabled: true,
			initialDelayMs: 1000,
			maxDelayMs: 30000,
			maxAttempts: 10,
		};

		function interpolate(value, values) {
			return Object.entries(values).reduce(
				(text, [key, replacement]) => text.replaceAll(`{${key}}`, String(replacement)),
				value,
			);
		}

		function defaultInstance() {
			return {
				id: crypto.randomUUID(),
				displayName: "",
				serverName: "",
				enabled: false,
				transport: "stdio",
				command: "",
				args: [],
				cwd: "",
				env: [],
				toolCallTimeoutMs: 60000,
				reconnect: { ...DEFAULT_RECONNECT },
			};
		}

		function editableValue(value, secret, sourcePath) {
			return value.kind === "credential"
				? {
					kind: "credential",
					configured: value.configured,
					clear: false,
					text: secret || "",
					sourcePath: value.configured === undefined ? undefined : sourcePath,
				}
				: { kind: "literal", text: value.value };
		}

		function editableInstance(value, secrets = {}) {
			if (!value) return defaultInstance();
			const next = { ...value, reconnect: { ...value.reconnect } };
			if (next.transport === "stdio") {
				next.args = next.args.map((item, index) =>
					editableValue(item, secrets[`args.${index}`], `args.${index}`));
				next.env = next.env.map((row) => ({
					name: row.name,
					value: editableValue(
						row.value,
						secrets[`env.${row.name}`],
						`env.${row.name}`,
					),
				}));
			} else {
				next.headers = next.headers.map((row) => ({
					name: row.name,
					value: editableValue(
						row.value,
						secrets[`headers.${row.name}`],
						`headers.${row.name}`,
					),
				}));
			}
			delete next.status;
			delete next.isApproved;
			delete next.requiresApproval;
			return next;
		}

		function serializeDraft(draft) {
			const secrets = {};
			const clears = {};
			const value = (row, path) => {
				if (row.kind === "literal") return { kind: "literal", value: row.text };
				if (row.text) secrets[path] = row.text;
				if (row.clear) clears[path] = true;
				return {
					kind: "credential",
					...(row.sourcePath ? { sourcePath: row.sourcePath } : {}),
				};
			};
			const instance = { ...draft, reconnect: { ...draft.reconnect } };
			if (draft.transport === "stdio") {
				instance.args = draft.args.map((row, index) => value(row, `args.${index}`));
				instance.env = draft.env.map((row) => ({
					name: row.name,
					value: value(row.value, `env.${row.name}`),
				}));
				delete instance.url;
				delete instance.headers;
			} else {
				instance.headers = draft.headers.map((row) => ({
					name: row.name,
					value: value(row.value, `headers.${row.name}`),
				}));
				delete instance.command;
				delete instance.args;
				delete instance.cwd;
				delete instance.env;
			}
			return { instance, secrets, clears };
		}

		function launchDetails(draft) {
			if (draft.transport === "stdio") {
				const args = draft.args.map((row) =>
					row.kind === "credential" ? "••••••" : row.text);
				return [draft.command, ...args].join(" ")
					+ (draft.cwd ? `\nCWD: ${draft.cwd}` : "");
			}
			const credentialHeaders = draft.headers
				.filter((row) => row.value.kind === "credential")
				.map((row) => row.name);
			return draft.url + (credentialHeaders.length
				? `\n凭据 Header: ${credentialHeaders.join(", ")}`
				: "");
		}

		function slug(value) {
			return value
				.normalize("NFKD")
				.replace(/[^\x00-\x7F]/g, "")
				.replace(/[^A-Za-z0-9_-]+/g, "-")
				.replace(/-{2,}/g, "-")
				.replace(/^[-_]+|[-_]+$/g, "")
				.slice(0, 32)
				.toLowerCase() || "mcp-server";
		}

		function availableServerName(base, instances) {
			const used = new Set(instances.map((instance) =>
				instance.serverName.toLowerCase()));
			let result = base.slice(0, 32);
			let suffix = 2;
			while (used.has(result.toLowerCase())) {
				const marker = `-${suffix}`;
				result = `${base.slice(0, 32 - marker.length)}${marker}`;
				suffix += 1;
			}
			return result;
		}

		function fieldErrors(draft, t) {
			const errors = {};
			if (!draft.displayName.trim()) errors.displayName = t("errorRequired");
			if (
				!/^[A-Za-z0-9_-]{1,32}$/.test(draft.serverName)
				|| draft.serverName.includes("__")
			) errors.serverName = t("errorServerName");
			if (draft.transport === "stdio" && !draft.command.trim()) {
				errors.command = t("errorRequired");
			}
			if (
				draft.transport === "stdio"
				&& /[\u0000-\u001f]/.test(draft.command)
			) errors.command = t("errorPathEscape");
			if (draft.transport === "stdio" && /[\u0000-\u001f]/.test(draft.cwd)) {
				errors.cwd = t("errorPathEscape");
			}
			if (draft.transport === "streamable-http") {
				try {
					const url = new URL(draft.url);
					if (!["http:", "https:"].includes(url.protocol)) throw new Error();
					if (
						url.protocol === "http:"
						&& draft.headers.some((row) => row.value.kind === "credential")
					) errors.url = t("errorHttpsCredential");
				} catch {
					errors.url = t("errorUrl");
				}
			}
			const values = draft.transport === "stdio"
				? [
					...draft.args.map((value, index) => [`args.${index}`, value]),
					...draft.env.map((row) => [`env.${row.name}`, row.value]),
				]
				: draft.headers.map((row) => [`headers.${row.name}`, row.value]);
			for (const [path, value] of values) {
				if (
					path.startsWith("args.")
					&& /[\u0000-\u001f]/.test(value.text)
				) errors[path] = t("errorPathEscape");
				if (
					value.kind === "credential"
					&& !value.text
					&& !value.configured
					&& !value.clear
				) errors[path] = t("errorCredential");
			}
			for (const key of ["toolCallTimeoutMs"]) {
				if (!Number.isInteger(draft[key]) || draft[key] < 1) {
					errors[key] = t("errorNumber");
				}
			}
			for (const key of ["initialDelayMs", "maxDelayMs", "maxAttempts"]) {
				if (!Number.isInteger(draft.reconnect[key]) || draft.reconnect[key] < 1) {
					errors[key] = t("errorNumber");
				}
			}
			return errors;
		}

		async function copyText(value) {
			await navigator.clipboard.writeText(value);
		}

		function errorCopy(error, t) {
			if (!error) return null;
			const messages = {
				SETTINGS_CONFLICT: [t("conflict"), t("refresh")],
				TEST_FAILED: ["MCP Server 未能通过连接测试。", "检查命令、路径、网络和凭据后重试。"],
				TEST_CANCELLED: ["连接测试已取消。", "配置没有被保存或修改。"],
				IMPORT_PARSE_ERROR: ["无法解析粘贴的配置。", "检查 JSON 引号、逗号，或 YAML 缩进和反斜杠转义。"],
				IMPORT_SHAPE_ERROR: ["未找到可导入的 MCP Server。", "请检查 mcpServers、单个 Server，或 DSH Profile patch 的 insert 结构。"],
				EXECUTION_APPROVAL_REQUIRED: ["需要确认第三方执行。", "重新发起操作并确认最终命令或 URL。"],
				COMPENSATION_FAILED: ["操作失败且未能完全恢复原状态。", "立即刷新并检查实例状态；必要时禁用实例后重启 DSH Web。"],
			};
			const [reason, advice] = messages[error.code]
				|| [t("operationFailed"), "请根据技术详情检查配置后重试。"];
			return {
				reason,
				advice,
				details: `${error.code || "INTERNAL"}: ${error.message}`,
			};
		}

		function ErrorDetails({ error, t, notify }) {
			const copy = errorCopy(error, t);
			if (!copy) return null;
			return h("div", { className: "mm-errorBox", role: "alert" },
				h("strong", null, copy.reason),
				h("p", null, copy.advice),
				h("details", null,
					h("summary", null, t("technicalDetails")),
					h("pre", { className: "mm-code" }, copy.details),
					h(Button, {
						size: "sm",
						variant: "outline",
						icon: h(IconCopyOutline16, { size: 14 }),
						onClick: async () => {
							try {
								await copyText(copy.details);
								notify(t("copied"));
							} catch {
								notify(t("copyFailed"));
							}
						},
					}, t("copyDetails"))));
		}

		function ConfirmModal({ state, t }) {
			if (!state) return null;
			const footer = h("div", { className: "mm-modalFooter" },
				h(Button, { variant: "ghost", onClick: () => state.resolve(false) }, t("cancel")),
				h(Button, {
					variant: "primary",
					onClick: () => state.resolve(true),
				}, state.confirmLabel || t("confirm")));
			return h(Modal, {
				open: true,
				onClose: () => state.resolve(false),
				title: state.title,
				description: state.body,
				closeLabel: t("cancel"),
				footer,
			}, state.details && h("pre", { className: "mm-code" }, state.details));
		}

		function ToolDetails({ tool, t }) {
			return h("details", { className: "mm-tool" },
				h("summary", null, tool.name),
				h("p", null, tool.description || t("noDescription")),
				h("div", { className: "mm-groupTitle" }, t("schema")),
				h("pre", { className: "mm-code" },
					JSON.stringify(tool.inputSchema || tool.parameters || {}, null, 2)));
		}

		function ImportNotices({ notices, t }) {
			if (!notices?.length) return null;
			return h("div", null,
				h("div", { className: "mm-groupTitle" }, t("importRepairs")),
				h("ul", { className: "mm-notices" },
					notices.map((notice, index) =>
						h("li", {
							key: `${notice.code}-${index}`,
							"data-level": notice.level,
						}, notice.message))));
		}

		function ToolList({ tools, t }) {
			if (!tools?.length) return h("p", { className: "mm-muted" }, t("noTools"));
			return h("div", { className: "mm-toolList" },
				tools.map((tool) => h(ToolDetails, { key: tool.name, tool, t })));
		}

		function ToolsModal({ state, t, onClose }) {
			if (!state) return null;
			const footer = h("div", { className: "mm-modalFooter" },
				h(Button, { variant: "primary", onClick: onClose }, t("close")));
			return h(Modal, {
				open: true,
				onClose,
				title: interpolate(t("toolsTitle"), { name: state.name }),
				closeLabel: t("close"),
				footer,
			},
			h("div", { className: "mm-modalBody" },
				state.loading
					? h("div", { className: "mm-operation", role: "status" },
						h(IconLoadingOutline16, { size: 16, className: "mm-rotate" }),
						t("loadingTools"))
					: state.error
						? h(ErrorDetails, { error: state.error, t, notify: state.notify })
						: h(ToolList, { tools: state.tools, t })));
		}

		function Field({
			label,
			required,
			error,
			help,
			wide,
			children,
		}) {
			return h("label", { className: `mm-field${wide ? " mm-fieldWide" : ""}` },
				h("span", { className: "mm-label" },
					label,
					required && h("span", { className: "mm-required", "aria-hidden": "true" }, " *")),
				children,
				help && h("span", { className: "mm-help" }, help),
				error && h("span", { className: "mm-fieldError" }, error));
		}

		function ValueRows({
			rows,
			setRows,
			named,
			title,
			t,
			errors,
			defaultCredential = false,
		}) {
			const update = (index, patch) => setRows(rows.map((row, rowIndex) =>
				rowIndex === index ? { ...row, ...patch } : row));
			return h("div", { className: "mm-field mm-fieldWide" },
				h("span", { className: "mm-groupTitle" }, title),
				h("div", { className: "mm-rows" },
					rows.map((row, index) => {
						const value = named ? row.value : row;
						const path = named
							? `${title === t("env") ? "env" : "headers"}.${row.name}`
							: `args.${index}`;
						const setValue = (patch) => named
							? update(index, { value: { ...value, ...patch } })
							: update(index, { ...value, ...patch });
						return h("div", {
							className: named ? "mm-row" : "mm-row mm-rowArgs",
							key: index,
						},
						named && h("input", {
							className: "mm-input",
							placeholder: t("key"),
							value: row.name,
							onChange: (event) => update(index, { name: event.target.value }),
						}),
						h("div", { className: "mm-rowValue" },
							h("input", {
								className: "mm-input",
								type: value.kind === "credential" ? "password" : "text",
								placeholder: value.kind === "credential" && value.configured
									? t("configured")
									: t("value"),
								value: value.text,
								disabled: value.clear,
								"aria-invalid": Boolean(errors[path]),
								onChange: (event) =>
									setValue({ text: event.target.value, clear: false }),
							}),
							errors[path] && h("span", {
								className: "mm-fieldError",
							}, errors[path])),
						h("div", { className: "mm-rowActions" },
							h("label", { className: "mm-check" },
								h("input", {
									type: "checkbox",
									checked: value.kind === "credential",
									onChange: (event) => setValue({
										kind: event.target.checked ? "credential" : "literal",
										text: "",
										configured: event.target.checked
											? value.configured
											: undefined,
										clear: false,
									}),
								}),
								t("secret")),
							value.kind === "credential" && value.configured && h(Button, {
								size: "sm",
								variant: "ghost",
								type: "button",
								onClick: () => setValue({ clear: !value.clear, text: "" }),
							}, value.clear ? t("cancel") : t("clearCredential")),
							h(Button, {
								size: "sm",
								variant: "ghost",
								type: "button",
								onClick: () =>
									setRows(rows.filter((_, rowIndex) => rowIndex !== index)),
							}, t("remove"))));
					})),
				h(Button, {
					size: "sm",
					variant: "outline",
					type: "button",
					onClick: () => setRows([...rows, named
						? {
							name: "",
							value: defaultCredential
								? { kind: "credential", text: "", clear: false }
								: { kind: "literal", text: "" },
						}
						: defaultCredential
							? { kind: "credential", text: "", clear: false }
							: { kind: "literal", text: "" }]),
				}, t("addRow")));
		}

		function ManualForm({ draft, setDraft, errors, t, serverNameEdited, setServerNameEdited }) {
			const patch = (key, value) =>
				setDraft((current) => ({ ...current, [key]: value }));
			const number = (key, value) => patch(key, Number(value));
			const customized = draft.toolCallTimeoutMs !== 60000
				|| JSON.stringify(draft.reconnect) !== JSON.stringify(DEFAULT_RECONNECT);
			return h(React.Fragment, null,
				h("div", { className: "mm-legend" }, t("requiredLegend")),
				h("div", { className: "mm-grid" },
					h(Field, {
						label: t("name"),
						required: true,
						error: errors.displayName,
					}, h("input", {
						className: "mm-input",
						value: draft.displayName,
						"aria-invalid": Boolean(errors.displayName),
						onChange: (event) => {
							const displayName = event.target.value;
							setDraft((current) => ({
								...current,
								displayName,
								serverName: serverNameEdited
									? current.serverName
									: slug(displayName),
							}));
						},
					})),
					h(Field, {
						label: t("serverName"),
						required: true,
						error: errors.serverName,
						help: t("serverNameHelp"),
					}, h("input", {
						className: "mm-input",
						value: draft.serverName,
						"aria-invalid": Boolean(errors.serverName),
						onChange: (event) => {
							setServerNameEdited(true);
							patch("serverName", event.target.value);
						},
					})),
					h(Field, {
						label: t("transport"),
						required: true,
					}, h("select", {
						className: "mm-select",
						value: draft.transport,
						onChange: (event) => {
							const transport = event.target.value;
							setDraft((current) => transport === "stdio"
								? {
									...current,
									transport,
									command: current.command || "",
									args: current.args || [],
									cwd: current.cwd || "",
									env: current.env || [],
								}
								: {
									...current,
									transport,
									url: current.url || "",
									headers: current.headers || [],
								});
						},
					},
					h("option", { value: "stdio" }, "stdio"),
					h("option", { value: "streamable-http" }, "streamable-http"))),
					draft.transport === "stdio"
						? [
							h(Field, {
								key: "command",
								label: t("command"),
								required: true,
								error: errors.command,
								wide: true,
							}, h("input", {
								className: "mm-input",
								value: draft.command,
								"aria-invalid": Boolean(errors.command),
								onChange: (event) => patch("command", event.target.value),
							})),
							h(Field, {
								key: "cwd",
								label: t("cwd"),
								error: errors.cwd,
								wide: true,
							}, h("input", {
								className: "mm-input",
								value: draft.cwd,
								"aria-invalid": Boolean(errors.cwd),
								onChange: (event) => patch("cwd", event.target.value),
							})),
							h(ValueRows, {
								key: "args",
								rows: draft.args,
								setRows: (rows) => patch("args", rows),
								title: t("args"),
								errors,
								t,
							}),
							h(ValueRows, {
								key: "env",
								rows: draft.env,
								setRows: (rows) => patch("env", rows),
								named: true,
								title: t("env"),
								errors,
								t,
							}),
						]
						: [
							h(Field, {
								key: "url",
								label: t("url"),
								required: true,
								error: errors.url,
								wide: true,
							}, h("input", {
								className: "mm-input",
								value: draft.url,
								"aria-invalid": Boolean(errors.url),
								onChange: (event) => patch("url", event.target.value),
							})),
							h(ValueRows, {
								key: "headers",
								rows: draft.headers,
								setRows: (rows) => patch("headers", rows),
								named: true,
								defaultCredential: true,
								title: t("headers"),
								errors,
								t,
							}),
						],
					h("details", { className: "mm-advanced" },
						h("summary", null,
							t("advanced"),
							customized && h("span", { className: "mm-badge" }, t("customized"))),
						h("div", { className: "mm-advancedHead" },
							h("span", { className: "mm-muted" }),
							h(Button, {
								size: "sm",
								variant: "ghost",
								type: "button",
								onClick: () => setDraft((current) => ({
									...current,
									toolCallTimeoutMs: 60000,
									reconnect: { ...DEFAULT_RECONNECT },
								})),
							}, t("restoreDefaults"))),
						h("div", { className: "mm-advancedGrid" },
							h(Field, {
								label: t("timeout"),
								required: true,
								error: errors.toolCallTimeoutMs,
							}, h("input", {
								className: "mm-input",
								type: "number",
								min: 1000,
								value: draft.toolCallTimeoutMs,
								onChange: (event) =>
									number("toolCallTimeoutMs", event.target.value),
							})),
							h("label", { className: "mm-check" },
								h("input", {
									type: "checkbox",
									checked: draft.reconnect.enabled,
									onChange: (event) => patch("reconnect", {
										...draft.reconnect,
										enabled: event.target.checked,
									}),
								}),
								t("reconnect")),
							...[
								["initialDelayMs", "initialDelay"],
								["maxDelayMs", "maxDelay"],
								["maxAttempts", "maxAttempts"],
							].map(([key, label]) => h(Field, {
								key,
								label: t(label),
								required: true,
								error: errors[key],
							}, h("input", {
								className: "mm-input",
								type: "number",
								min: 1,
								value: draft.reconnect[key],
								onChange: (event) => patch("reconnect", {
									...draft.reconnect,
									[key]: Number(event.target.value),
								}),
							})))))));
		}

		function Editor({
			original,
			instances,
			revision,
			rpc,
			ask,
			notify,
			onSaved,
			onClose,
			t,
		}) {
			const [mode, setMode] = React.useState(original ? "manual" : "import");
			const [targetOriginal, setTargetOriginal] = React.useState(original);
			const [draft, setDraft] = React.useState(() => editableInstance(original));
			const baseline = React.useRef(null);
			if (baseline.current === null) baseline.current = JSON.stringify(draft);
			const [serverNameEdited, setServerNameEdited] = React.useState(Boolean(original));
			const [importText, setImportText] = React.useState("");
			const [importResult, setImportResult] = React.useState(null);
			const [selected, setSelected] = React.useState({});
			const [busy, setBusy] = React.useState("");
			const [error, setError] = React.useState(null);
			const [testResult, setTestResult] = React.useState(null);
			const [allowSaveDisabled, setAllowSaveDisabled] = React.useState(false);
			const operationId = React.useRef("");
			const isNew = !targetOriginal;
			const errors = fieldErrors(draft, t);
			const unresolvedConflict = Boolean(
				importResult?.entries.length === 1
				&& importResult.entries[0].conflictId,
			);
			const hardImportBlock = importResult?.entries.length === 1
				&& importResult.notices.some((notice) =>
					notice.level === "blocking"
					&& ![
						"CREDENTIAL_REQUIRED",
						"INSECURE_CREDENTIAL_TRANSPORT",
						"REQUIRED_FIELD",
						"SERVER_NAME_CONFLICT",
						"SUSPICIOUS_PATH_ESCAPE",
					].includes(notice.code));
			const invalid = Object.keys(errors).length > 0
				|| hardImportBlock
				|| unresolvedConflict;
			const dirty = JSON.stringify(draft) !== baseline.current
				|| importText.trim().length > 0;
			const close = async () => {
				if (!dirty || await ask({ title: t("cancel"), body: t("discard") })) onClose();
			};
			const callWithApproval = async (endpoint, payload) => {
				try {
					return await rpc(endpoint, payload);
				} catch (failure) {
					if (failure.code !== "EXECUTION_APPROVAL_REQUIRED") throw failure;
					const approved = await ask({
						title: t("executionTitle"),
						body: t("executionBody"),
						details: launchDetails(draft),
					});
					if (!approved) {
						const cancelled = new Error(t("cancel"));
						cancelled.code = "USER_CANCELLED";
						throw cancelled;
					}
					return rpc(endpoint, {
						...payload,
						confirmationToken: failure.details.confirmationToken,
					});
				}
			};
			const parse = async () => {
				setBusy("parse");
				setError(null);
				try {
					const result = await rpc("parse-import", { text: importText });
					if (
						targetOriginal
						&& result.entries.length === 1
						&& result.entries[0].conflictId === targetOriginal.id
					) {
						result.notices = result.notices.filter((notice) =>
							notice.code !== "SERVER_NAME_CONFLICT");
						delete result.entries[0].conflictId;
					}
					setImportResult(result);
					setSelected(Object.fromEntries(
						result.entries.map((_, index) => [index, true]),
					));
					if (result.entries.length === 1) {
						const entry = result.entries[0];
						setDraft(editableInstance({
							...entry.instance,
							id: targetOriginal?.id || entry.instance.id,
							enabled: targetOriginal?.enabled || false,
						}, entry.secrets));
						setServerNameEdited(true);
						if (targetOriginal || !entry.conflictId) setMode("manual");
					}
				} catch (failure) {
					setError(failure);
				} finally {
					setBusy("");
				}
			};
			const execute = async (kind) => {
				if (invalid) return;
				const id = crypto.randomUUID();
				operationId.current = id;
				setBusy(kind);
				setError(null);
				setTestResult(null);
				setAllowSaveDisabled(false);
				const payload = {
					...serializeDraft(draft),
					expectedRevision: revision,
					operationId: id,
				};
				try {
					if (kind === "test") {
						setTestResult(await callWithApproval("test", payload));
						notify(t("testSuccess"));
						return;
					}
					if (kind === "activate") {
						const result = await callWithApproval("create-and-enable", payload);
						onSaved(result.state);
						notify(t("enabledDone"));
						return;
					}
					if (kind === "apply") {
						const result = await callWithApproval("update-and-apply", payload);
						onSaved(result.state);
						notify(t("applied"));
						return;
					}
					const state = await rpc(isNew ? "create" : "update", payload);
					onSaved(state);
					notify(t("saved"));
				} catch (failure) {
					if (failure.code !== "USER_CANCELLED") setError(failure);
					if (failure.code === "TEST_FAILED" && kind === "activate") {
						setAllowSaveDisabled(true);
					}
				} finally {
					operationId.current = "";
					setBusy("");
				}
			};
			const cancelTest = async () => {
				if (!operationId.current) return;
				await rpc("cancel-test", { operationId: operationId.current }).catch(() => {});
			};
			const resolveConflict = (updateExisting) => {
				const entry = importResult.entries[0];
				const existing = instances.find((instance) =>
					instance.id === entry.conflictId);
				const target = updateExisting ? existing : null;
				setTargetOriginal(target);
				setDraft(editableInstance({
					...entry.instance,
					id: target?.id || entry.instance.id,
					enabled: target?.enabled || false,
					serverName: target
						? entry.instance.serverName
						: availableServerName(entry.instance.serverName, instances),
				}, entry.secrets));
				setImportResult((current) => {
					const resolvedEntry = { ...current.entries[0] };
					delete resolvedEntry.conflictId;
					return {
						...current,
						entries: [resolvedEntry],
						notices: current.notices.filter((notice) =>
							notice.code !== "SERVER_NAME_CONFLICT"),
					};
				});
				setMode("manual");
			};
			const batchSave = async () => {
				const entries = importResult.entries.filter((_, index) => selected[index]);
				setBusy("batch");
				setError(null);
				try {
					const state = await rpc("create-many", {
						entries,
						expectedRevision: importResult.revision,
					});
					onSaved(state);
					notify(t("batchSaved"));
				} catch (failure) {
					setError(failure);
				} finally {
					setBusy("");
				}
			};
			const conflictEntry = unresolvedConflict
				? importResult.entries[0]
				: null;
			const selectedCount = Object.values(selected).filter(Boolean).length;
			const selectedSources = new Set(
				importResult?.entries
					.filter((_, index) => selected[index])
					.map((entry) => entry.sourceName),
			);
			const blocking = importResult?.notices.some((notice) =>
				notice.level === "blocking"
				&& (
					notice.path === "$"
					|| [...selectedSources].some((sourceName) =>
						notice.path.startsWith(`mcpServers.${sourceName}`))
				));
			let footer;
			if (mode === "import" && importResult?.entries.length > 1) {
				footer = h("div", { className: "mm-modalFooter" },
					h(Button, { variant: "ghost", disabled: Boolean(busy), onClick: close }, t("cancel")),
					h(Button, {
						variant: "primary",
						disabled: Boolean(busy) || blocking || selectedCount === 0,
						icon: busy === "batch"
							? h(IconLoadingOutline16, { size: 16, className: "mm-rotate" })
							: undefined,
						onClick: batchSave,
					}, t("batchSave")));
			} else {
				footer = h("div", { className: "mm-modalFooter" },
					h(Button, { variant: "ghost", disabled: Boolean(busy), onClick: close }, t("cancel")),
					busy === "test" || busy === "activate" || busy === "apply"
						? h(Button, { variant: "outline", onClick: cancelTest }, t("cancelTest"))
						: h(Button, {
							variant: "outline",
							disabled: Boolean(busy) || invalid,
							onClick: () => execute("test"),
						}, t("test")),
					(isNew || !targetOriginal.enabled) && h(Button, {
						variant: "outline",
						disabled: Boolean(busy) || invalid,
						onClick: () => execute("save"),
					}, allowSaveDisabled ? t("saveDisabledAfterFailure") : t("save")),
					h(Button, {
						variant: "primary",
						disabled: Boolean(busy) || invalid,
						icon: busy
							? h(IconLoadingOutline16, { size: 16, className: "mm-rotate" })
							: undefined,
						onClick: () => execute(isNew
							? "activate"
							: targetOriginal.enabled
								? "apply"
								: "save"),
					}, isNew
						? t("saveEnable")
						: targetOriginal.enabled
							? t("testApply")
							: t("save")));
			}
			return h(Modal, {
				open: true,
				onClose: close,
				title: isNew ? t("add") : t("edit"),
				closeLabel: t("cancel"),
				className: "mm-editorDialog",
				footer,
			},
			h("div", { className: "mm-modalBody" },
				h("div", { className: "mm-modeTabs" },
					h(Button, {
						size: "sm",
						variant: mode === "import" ? "primary" : "ghost",
						onClick: () => setMode("import"),
					}, t("importMode")),
					h(Button, {
						size: "sm",
						variant: mode === "manual" ? "primary" : "ghost",
						onClick: () => setMode("manual"),
					}, t("manualMode"))),
				mode === "import"
					? h("div", { className: "mm-import" },
						h("p", { className: "mm-muted" }, t("importHint")),
						h("textarea", {
							className: "mm-textarea",
							value: importText,
							placeholder: t("importPlaceholder"),
							autoFocus: true,
							spellCheck: false,
							onChange: (event) => {
								setImportText(event.target.value);
								setImportResult(null);
							},
						}),
						h(Button, {
							variant: "primary",
							disabled: !importText.trim() || Boolean(busy),
							icon: busy === "parse"
								? h(IconLoadingOutline16, { size: 16, className: "mm-rotate" })
								: undefined,
							onClick: parse,
						}, busy === "parse" ? t("parsing") : t("parse")),
						importResult && h("strong", null, interpolate(t("imported"), {
							count: importResult.entries.length,
						})),
						h(ImportNotices, { notices: importResult?.notices, t }),
						conflictEntry && h("div", { className: "mm-errorBox" },
							h("strong", null, t("conflictTitle")),
							h("p", null, t("conflictHint")),
							h("div", { className: "mm-rowActions" },
								h(Button, {
									size: "sm",
									variant: "outline",
									onClick: () => resolveConflict(false),
								}, t("saveAsNew")),
								h(Button, {
									size: "sm",
									variant: "primary",
									onClick: () => resolveConflict(true),
								}, t("updateExisting")))),
						importResult?.entries.length > 1 && h("div", { className: "mm-batch" },
							importResult.entries.map((entry, index) =>
								h("label", { className: "mm-batchItem", key: entry.instance.id },
									h("input", {
										type: "checkbox",
										checked: Boolean(selected[index]),
										onChange: (event) => setSelected((current) => ({
											...current,
											[index]: event.target.checked,
										})),
										"aria-label": interpolate(t("select"), {
											name: entry.instance.displayName,
										}),
									}),
									h("span", { className: "mm-batchText" },
										h("strong", null, entry.instance.displayName),
										h("span", null,
											`${entry.instance.serverName} · ${entry.instance.transport}`))))),
					)
					: h(React.Fragment, null,
						h(ImportNotices, { notices: importResult?.notices, t }),
						h(ManualForm, {
							draft,
							setDraft,
							errors,
							t,
							serverNameEdited,
							setServerNameEdited,
						})),
				busy && busy !== "parse" && h("div", {
					className: "mm-operation",
					role: "status",
					"aria-live": "polite",
				},
				h(IconLoadingOutline16, { size: 16, className: "mm-rotate" }),
				busy === "test" || busy === "activate" || busy === "apply"
					? t("testing")
					: t("saved")),
				error && h(ErrorDetails, { error, t, notify }),
				testResult && h("div", {
					className: "mm-testResult",
					role: "status",
				},
				h("strong", null,
					`${t("testSuccess")} · ${testResult.latencyMs} ms · ${interpolate(t("toolCount"), {
						count: testResult.tools.length,
					})}`),
				h(ToolList, { tools: testResult.tools, t }))));
		}

		function statusKey(instance) {
			return ["disabled", "starting", "loaded", "failed"].includes(instance.status.phase)
				? instance.status.phase
				: "unknown";
		}

		function dotState(instance) {
			if (instance.status.phase === "failed") return "error";
			if (instance.status.phase === "loaded") return "done";
			return "warning";
		}

		function ServerCard({
			instance,
			busy,
			error,
			t,
			onEdit,
			onAction,
			notify,
		}) {
			const [menuOpen, setMenuOpen] = React.useState(false);
			const menuItems = [
				{ id: "edit", label: t("edit") },
				{ id: "test", label: t("test") },
				{ id: "restart", label: t("restart"), disabled: !instance.enabled },
				{
					id: "tools",
					label: instance.enabled ? t("tools") : t("toolsDisabled"),
					disabled: !instance.enabled,
				},
				{ type: "separator", id: "danger-separator" },
				{ id: "delete", label: t("delete"), danger: true },
			];
			const select = (action) => {
				setMenuOpen(false);
				if (action === "edit") onEdit();
				else onAction(action);
			};
			return h("li", { className: "mm-card" },
				h("div", { className: "mm-cardTop" },
					h("div", { className: "mm-identity" },
						h(StateDot, { state: dotState(instance), size: 10 }),
						h("div", { className: "mm-title" },
							h("strong", null, instance.displayName),
							h("div", { className: "mm-meta" },
								`${instance.serverName} · ${instance.transport}`),
							h("div", { className: "mm-status" },
								`${t(statusKey(instance))} · ${interpolate(t("toolCount"), {
									count: instance.status.toolCount,
								})}`))),
					h("div", { className: "mm-cardActions" },
						h(Button, {
							size: "sm",
							variant: instance.enabled ? "outline" : "primary",
							disabled: Boolean(busy),
							icon: busy === "toggle"
								? h(IconLoadingOutline16, { size: 14, className: "mm-rotate" })
								: undefined,
							onClick: () => onAction("toggle"),
						}, instance.enabled ? t("disable") : t("enable")),
						h(Menu, {
							open: menuOpen,
							align: "end",
							portal: true,
							compact: true,
							items: menuItems,
							onClose: () => setMenuOpen(false),
							onSelect: select,
							anchor: h(Tooltip, {
								label: t("moreActions"),
								side: "bottom",
							}, h("span", null,
								h(Button, {
									size: "sm",
									variant: "ghost",
									icon: h(IconEllipsisOutline16, { size: 16 }),
									disabled: Boolean(busy),
									"aria-label": t("moreActions"),
									onClick: () => setMenuOpen((open) => !open),
								}))),
						}))),
				busy && h("div", {
					className: "mm-operation",
					role: "status",
					"aria-live": "polite",
				},
				h(IconLoadingOutline16, { size: 14, className: "mm-rotate" }),
				busy === "restart" ? t("restarting")
					: busy === "tools" ? t("loadingTools")
						: busy === "test" ? t("testing")
							: busy === "toggle"
								? (instance.enabled ? t("disable") : t("enable"))
								: t("operationFailed"),
				(
					busy === "test"
					|| (busy === "toggle" && !instance.enabled)
				) && h(Button, {
					size: "sm",
					variant: "outline",
					onClick: () => onAction("cancel-test"),
				}, t("cancelTest"))),
				instance.status.lastError && h("div", { className: "mm-inlineError" },
					h("span", null, instance.status.lastError),
					instance.enabled && h(Button, {
						size: "sm",
						variant: "outline",
						disabled: Boolean(busy),
						onClick: () => onAction("restart"),
					}, t("retry"))),
				error && h(ErrorDetails, { error, t, notify }));
		}

		function McpManagerSection({ rpc, t }) {
			const [data, setData] = React.useState(null);
			const [loadError, setLoadError] = React.useState(null);
			const [editor, setEditor] = React.useState(undefined);
			const [operations, setOperations] = React.useState({});
			const [errors, setErrors] = React.useState({});
			const [confirmState, setConfirmState] = React.useState(null);
			const [toolsState, setToolsState] = React.useState(null);
			const [toast, setToast] = React.useState(null);
			const loadGeneration = React.useRef(0);
			const operationIds = React.useRef({});
			const notify = React.useCallback((text, holdMs = 3500) => {
				setToast({ id: `${Date.now()}-${Math.random()}`, text, holdMs });
			}, []);
			const ask = React.useCallback((options) => new Promise((resolve) => {
				let settled = false;
				setConfirmState({
					...options,
					resolve: (answer) => {
						if (settled) return;
						settled = true;
						setConfirmState(null);
						resolve(answer);
					},
				});
			}), []);
			const load = React.useCallback(async () => {
				const generation = ++loadGeneration.current;
				try {
					const next = await rpc("list");
					if (generation !== loadGeneration.current) return;
					setData(next);
					setLoadError(null);
				} catch (failure) {
					if (generation === loadGeneration.current) setLoadError(failure);
				}
			}, [rpc]);
			React.useEffect(() => {
				load();
				const timer = setInterval(load, 2000);
				return () => clearInterval(timer);
			}, [load]);
			const acceptMutation = (next) => {
				loadGeneration.current += 1;
				setData(next);
			};
			const callWithApproval = async (endpoint, payload, instance) => {
				try {
					return await rpc(endpoint, payload);
				} catch (failure) {
					if (failure.code !== "EXECUTION_APPROVAL_REQUIRED") throw failure;
					const approved = await ask({
						title: t("executionTitle"),
						body: t("executionBody"),
						details: launchDetails(editableInstance(instance)),
					});
					if (!approved) return undefined;
					return rpc(endpoint, {
						...payload,
						confirmationToken: failure.details.confirmationToken,
					});
				}
			};
			const act = async (instance, action) => {
				if (action === "cancel-test") {
					const operationId = operationIds.current[instance.id];
					if (operationId) {
						await rpc("cancel-test", { operationId }).catch(() => {});
					}
					return;
				}
				if (action === "delete") {
					const approved = await ask({
						title: t("deleteTitle"),
						body: t("deleteBody"),
						details: `${instance.displayName}\n${instance.serverName} · ${instance.transport}\n${t(statusKey(instance))}`,
						confirmLabel: t("delete"),
					});
					if (!approved) return;
				}
				const cancellable = action === "test"
					|| (action === "toggle" && !instance.enabled);
				const currentOperationId = cancellable ? crypto.randomUUID() : undefined;
				if (currentOperationId) {
					operationIds.current[instance.id] = currentOperationId;
				}
				setOperations((current) => ({ ...current, [instance.id]: action }));
				setErrors((current) => ({ ...current, [instance.id]: null }));
				try {
					if (action === "tools") {
						setToolsState({
							name: instance.displayName,
							loading: true,
							notify,
						});
						const tools = await rpc("tools", { id: instance.id });
						setToolsState({
							name: instance.displayName,
							tools,
							loading: false,
							notify,
						});
						return;
					}
					if (action === "test") {
						const result = await callWithApproval("test", {
							...serializeDraft(editableInstance(instance)),
							operationId: currentOperationId,
							expectedRevision: data.revision,
						}, instance);
						if (!result) return;
						setToolsState({
							name: instance.displayName,
							tools: result.tools,
							loading: false,
							notify,
						});
						notify(t("testSuccess"));
						return;
					}
					const endpoint = action === "toggle"
						? "set-enabled"
						: action === "restart"
							? "reload"
							: "delete";
					const payload = {
						id: instance.id,
						expectedRevision: data.revision,
						...(action === "toggle" ? { enabled: !instance.enabled } : {}),
						...(currentOperationId ? { operationId: currentOperationId } : {}),
					};
					const next = await callWithApproval(endpoint, payload, instance);
					if (next) {
						acceptMutation(next);
						notify(action === "toggle" && !instance.enabled
							? t("enabledDone")
							: action === "delete"
								? t("delete")
								: action === "restart"
									? t("restart")
									: t("saved"));
					}
				} catch (failure) {
					setErrors((current) => ({ ...current, [instance.id]: failure }));
					if (action === "tools") {
						setToolsState({
							name: instance.displayName,
							error: failure,
							loading: false,
							notify,
						});
					}
				} finally {
					delete operationIds.current[instance.id];
					setOperations((current) => ({ ...current, [instance.id]: "" }));
				}
			};
			return h("section", { className: "mm-root", "aria-labelledby": "mm-title" },
				h("header", { className: "mm-header" },
					h("div", { className: "mm-heading" },
						h("h2", { id: "mm-title" }, t("title")),
						h("p", null, t("subtitle"))),
					h(Button, {
						variant: "primary",
						disabled: !data,
						onClick: () => setEditor({ original: null, revision: data.revision }),
					}, t("add"))),
				loadError && h(ErrorDetails, { error: loadError, t, notify }),
				!data && !loadError && h("div", {
					className: "mm-empty",
					"aria-busy": "true",
				}, t("refresh")),
				data && data.instances.length === 0
					? h("div", { className: "mm-empty" },
						h("strong", null, t("emptyTitle")),
						h("p", null, t("emptyBody")),
						h(Button, {
							variant: "primary",
							onClick: () =>
								setEditor({ original: null, revision: data.revision }),
						}, t("add")))
					: data && h("ul", { className: "mm-list" },
						data.instances.map((instance) => h(ServerCard, {
							key: instance.id,
							instance,
							busy: operations[instance.id],
							error: errors[instance.id],
							t,
							notify,
							onEdit: () => setEditor({
								original: instance,
								revision: data.revision,
							}),
							onAction: (action) => act(instance, action),
						}))),
				editor !== undefined && h(Editor, {
					original: editor.original,
					instances: data.instances,
					revision: editor.revision,
					rpc,
					ask,
					notify,
					t,
					onClose: () => setEditor(undefined),
					onSaved: (next) => {
						acceptMutation(next);
						setEditor(undefined);
					},
				}),
				h(ConfirmModal, { state: confirmState, t }),
				h(ToolsModal, {
					state: toolsState,
					t,
					onClose: () => setToolsState(null),
				}),
				toast && h(Toast, {
					key: toast.id,
					text: toast.text,
					holdMs: toast.holdMs,
					onDone: () => setToast(null),
				}));
		}

		const inject = ["slots", "locale", "connection"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "mcp-manager: locales");
			const bound = ctx.locale.bind(NS);
			const t = (key) => bound(key);
			const rpc = async (endpoint, payload) => {
				const result = await ctx.connection.rpc.call(
					"/mcp-manager",
					endpoint,
					payload ?? null,
				);
				if (!result.ok) {
					const error = new Error(result.error.message);
					error.code = result.error.code;
					error.details = result.error.details || {};
					throw error;
				}
				return result.value;
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "mcp-manager",
				order: 35,
				label: () => t("section"),
				locale: NS,
				inject: () => ({ rpc, t }),
			}, McpManagerSection));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
