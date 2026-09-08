window.__ModuleLoader__.load({
	id: "@team-dsh-plugins/mcp-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const h = React.createElement;

		const NS = "mcp-manager";
		const zh = {
			section: "MCP 管理",
			title: "MCP Server",
			subtitle: "管理当前 DSH Web Profile 的全局 MCP 连接。",
			add: "添加 MCP",
			emptyTitle: "还没有 MCP Server",
			emptyBody: "添加 stdio 或 Streamable HTTP 连接后，可在这里启停、测试和查看工具。",
			enabled: "已启用",
			disabled: "已禁用",
			starting: "启动中",
			loaded: "已加载",
			failed: "启动失败",
			tools: "工具",
			edit: "编辑",
			reload: "重载",
			delete: "删除",
			test: "测试连接",
			save: "保存",
			cancel: "取消",
			name: "显示名称",
			serverName: "Server name",
			transport: "Transport",
			command: "Command",
			args: "Arguments",
			cwd: "Working directory",
			env: "Environment",
			url: "URL",
			headers: "Headers",
			timeout: "工具调用超时（毫秒）",
			reconnect: "自动重连",
			initialDelay: "初始延迟",
			maxDelay: "最大延迟",
			maxAttempts: "最大次数",
			value: "值",
			key: "名称",
			secret: "凭据",
			configured: "已配置；留空保持不变",
			addRow: "添加一项",
			remove: "移除",
			loading: "正在加载…",
			loadError: "加载失败",
			saveError: "保存失败",
			testSuccess: "连接测试成功",
			testWarning: "测试会建立一条临时连接，并在列出工具后立即断开。",
			executionTitle: "确认执行 MCP Server",
			executionBody: "DSH 将按以下配置启动进程或连接明文 HTTP。确认你信任该目标。",
			confirm: "确认",
			deleteTitle: "删除 MCP Server",
			deleteBody: "该操作会断开连接，并永久删除关联凭据。请输入 Server name 以确认。",
			discard: "有未保存的修改，确定放弃吗？",
			conflict: "配置已被其他窗口修改，请刷新后重试。",
			refresh: "刷新",
			noDescription: "无描述",
			schema: "输入 Schema",
			credentialMissing: "凭据未配置",
			clearCredential: "清除凭据",
		};
		const en = {
			section: "MCP",
			title: "MCP Servers",
			subtitle: "Manage global MCP connections for the current DSH Web Profile.",
			add: "Add MCP",
			emptyTitle: "No MCP servers",
			emptyBody: "Add a stdio or Streamable HTTP connection to manage it here.",
			enabled: "Enabled",
			disabled: "Disabled",
			starting: "Starting",
			loaded: "Loaded",
			failed: "Failed",
			tools: "Tools",
			edit: "Edit",
			reload: "Reload",
			delete: "Delete",
			test: "Test connection",
			save: "Save",
			cancel: "Cancel",
			name: "Display name",
			serverName: "Server name",
			transport: "Transport",
			command: "Command",
			args: "Arguments",
			cwd: "Working directory",
			env: "Environment",
			url: "URL",
			headers: "Headers",
			timeout: "Tool timeout (ms)",
			reconnect: "Automatic reconnect",
			initialDelay: "Initial delay",
			maxDelay: "Maximum delay",
			maxAttempts: "Maximum attempts",
			value: "Value",
			key: "Name",
			secret: "Credential",
			configured: "Configured; leave blank to keep it",
			addRow: "Add row",
			remove: "Remove",
			loading: "Loading…",
			loadError: "Failed to load",
			saveError: "Failed to save",
			testSuccess: "Connection test succeeded",
			testWarning: "Testing opens a temporary connection and closes it after listing tools.",
			executionTitle: "Confirm MCP execution",
			executionBody: "DSH will launch this command or connect over plain HTTP. Confirm that you trust it.",
			confirm: "Confirm",
			deleteTitle: "Delete MCP server",
			deleteBody: "This disconnects the server and permanently deletes its credentials. Type the Server name to confirm.",
			discard: "Discard unsaved changes?",
			conflict: "Settings changed in another window. Refresh and try again.",
			refresh: "Refresh",
			noDescription: "No description",
			schema: "Input schema",
			credentialMissing: "Credential is not configured",
			clearCredential: "Clear credential",
		};

		const css = [
			".mm-root{width:100%;max-width:820px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:16px}",
			".mm-head{display:flex;align-items:flex-start;gap:16px}.mm-headText{flex:1;min-width:0}.mm-head h2{margin:0;font-size:18px;line-height:26px}.mm-head p,.mm-empty p{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}",
			".mm-button{border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;padding:6px 12px;cursor:pointer}.mm-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.mm-button:focus-visible,.mm-input:focus-visible,.mm-select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.mm-button:disabled{opacity:.45;cursor:default}.mm-primary{background:var(--dsw-alias-state-business-primary);border-color:transparent;color:#fff}.mm-danger{color:var(--dsw-alias-state-error-primary)}",
			".mm-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}.mm-card{background:var(--dsw-alias-bg-layer-3);box-shadow:var(--dsw-elevation-stroke);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px}.mm-cardTop{display:flex;align-items:center;gap:12px}.mm-cardTitle{flex:1;min-width:0}.mm-cardTitle strong{display:block;font-size:14px;line-height:20px}.mm-meta{color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:11px;overflow-wrap:anywhere}.mm-status{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px}.mm-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}.mm-dot[data-phase=loaded]{background:var(--dsw-alias-state-success-primary)}.mm-dot[data-phase=failed]{background:var(--dsw-alias-state-error-primary)}.mm-dot[data-phase=starting]{background:var(--dsw-alias-state-business-primary)}",
			".mm-actions{display:flex;flex-wrap:wrap;gap:8px}.mm-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;overflow-wrap:anywhere}.mm-warning{color:var(--dsw-alias-state-warning-primary,#b45309);font-size:12px;line-height:18px}.mm-empty{padding:36px 20px;text-align:center;border:.5px dashed var(--dsw-alias-border-l3);border-radius:12px}",
			".mm-overlay{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;padding:20px}.mm-dialog{width:min(680px,100%);max-height:min(760px,calc(100vh - 40px));overflow:auto;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:14px;box-shadow:var(--dsw-elevation-panel);padding:18px;display:flex;flex-direction:column;gap:14px}.mm-dialog h3{margin:0;font-size:16px}.mm-dialog p{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.mm-dialogActions{display:flex;justify-content:flex-end;gap:8px}",
			".mm-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mm-field{display:flex;flex-direction:column;gap:5px;min-width:0}.mm-field>span,.mm-groupTitle{font-size:12px;color:var(--dsw-alias-label-secondary)}.mm-wide{grid-column:1/-1}.mm-input,.mm-select{box-sizing:border-box;width:100%;height:36px;border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;padding:0 10px}.mm-input[type=checkbox]{width:16px;height:16px}.mm-check{display:flex;align-items:center;gap:7px;font-size:12px}.mm-rows{display:flex;flex-direction:column;gap:8px}.mm-row{display:grid;grid-template-columns:minmax(100px,.75fr) minmax(160px,1fr) auto auto;gap:8px;align-items:center}.mm-rowArgs{grid-template-columns:minmax(200px,1fr) auto auto}.mm-code{font-family:var(--ds-font-family-code);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:10px}.mm-tool{border-top:.5px solid var(--dsw-alias-border-l2);padding-top:8px}.mm-tool summary{cursor:pointer;font-size:13px;font-weight:600}.mm-tool p{font-size:12px}.mm-testResult{background:var(--dsw-alias-bg-layer-2);border-radius:10px;padding:10px}",
			"@media (max-width:680px){.mm-grid{grid-template-columns:1fr}.mm-wide{grid-column:auto}.mm-cardTop{align-items:flex-start;flex-wrap:wrap}.mm-row,.mm-rowArgs{grid-template-columns:1fr}.mm-head{flex-direction:column}.mm-head .mm-button{width:100%}}",
		].join("");
		if (!document.querySelector('style[data-plugin-css="@team-dsh-plugins/mcp-manager"]')) {
			const style = document.createElement("style");
			style.dataset.pluginCss = "@team-dsh-plugins/mcp-manager";
			style.textContent = css;
			document.head.appendChild(style);
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
				reconnect: { enabled: true, initialDelayMs: 1000, maxDelayMs: 30000, maxAttempts: 10 },
			};
		}

		function editableValue(value) {
			return value.kind === "credential"
				? { kind: "credential", configured: value.configured, clear: false, text: "" }
				: { kind: "literal", text: value.value };
		}

		function editableInstance(value) {
			if (!value) return defaultInstance();
			const next = { ...value, reconnect: { ...value.reconnect } };
			if (next.transport === "stdio") {
				next.args = next.args.map(editableValue);
				next.env = next.env.map((row) => ({ name: row.name, value: editableValue(row.value) }));
			} else {
				next.headers = next.headers.map((row) => ({ name: row.name, value: editableValue(row.value) }));
			}
			delete next.status;
			delete next.isApproved;
			delete next.requiresApproval;
			return next;
		}

		function ConfirmDialog({ state, t }) {
			const [typed, setTyped] = React.useState("");
			React.useEffect(() => setTyped(""), [state]);
			if (!state) return null;
			const allowed = !state.phrase || typed === state.phrase;
			return h("div", { className: "mm-overlay" },
				h("div", { className: "mm-dialog", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "mm-confirm-title" },
					h("h3", { id: "mm-confirm-title" }, state.title),
					h("p", null, state.body),
					state.details && h("pre", { className: "mm-code" }, state.details),
					state.phrase && h("input", {
						className: "mm-input",
						"aria-label": state.phrase,
						value: typed,
						autoFocus: true,
						onChange: (event) => setTyped(event.target.value),
					}),
					h("div", { className: "mm-dialogActions" },
						h("button", { className: "mm-button", onClick: () => state.resolve(false) }, t("cancel")),
						h("button", { className: "mm-button " + (state.danger ? "mm-danger" : "mm-primary"), disabled: !allowed, onClick: () => state.resolve(true) }, t("confirm")),
					),
				),
			);
		}

		function ValueRows({ rows, setRows, named, title, t, defaultCredential = false }) {
			const update = (index, patch) => setRows(rows.map((row, rowIndex) =>
				rowIndex === index ? { ...row, ...patch } : row));
			return h("div", { className: "mm-field mm-wide" },
				h("span", { className: "mm-groupTitle" }, title),
				h("div", { className: "mm-rows" },
					rows.map((row, index) => {
						const value = named ? row.value : row;
						const setValue = (patch) => named
							? update(index, { value: { ...value, ...patch } })
							: update(index, { ...value, ...patch });
						return h("div", { className: named ? "mm-row" : "mm-row mm-rowArgs", key: index },
							named && h("input", {
								className: "mm-input",
								placeholder: t("key"),
								value: row.name,
								onChange: (event) => update(index, { name: event.target.value }),
							}),
							h("input", {
								className: "mm-input",
								type: value.kind === "credential" ? "password" : "text",
								placeholder: value.kind === "credential" && value.configured ? t("configured") : t("value"),
								value: value.text,
								disabled: value.clear,
								onChange: (event) => setValue({ text: event.target.value, clear: false }),
							}),
							h("label", { className: "mm-check" },
								h("input", {
									type: "checkbox",
									checked: value.kind === "credential",
									onChange: (event) => setValue({
										kind: event.target.checked ? "credential" : "literal",
										text: "",
										configured: event.target.checked ? value.configured : undefined,
										clear: false,
									}),
								}),
								t("secret"),
							),
							value.kind === "credential" && value.configured && h("button", {
								className: "mm-button",
								type: "button",
								onClick: () => setValue({ clear: !value.clear, text: "" }),
							}, value.clear ? t("cancel") : t("clearCredential")),
							h("button", { className: "mm-button mm-danger", type: "button", onClick: () => setRows(rows.filter((_, rowIndex) => rowIndex !== index)) }, t("remove")),
						);
					}),
				),
				h("button", {
					className: "mm-button",
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
				}, t("addRow")),
			);
		}

		function serializeDraft(draft) {
			const secrets = {};
			const clears = {};
			const value = (row, path) => {
				if (row.kind === "literal") return { kind: "literal", value: row.text };
				if (row.text) secrets[path] = row.text;
				if (row.clear) clears[path] = true;
				return { kind: "credential" };
			};
			const instance = { ...draft, reconnect: { ...draft.reconnect } };
			if (draft.transport === "stdio") {
				instance.args = draft.args.map((row, index) => value(row, `args.${index}`));
				instance.env = draft.env.map((row) => ({ name: row.name, value: value(row.value, `env.${row.name}`) }));
				delete instance.url;
				delete instance.headers;
			} else {
				instance.headers = draft.headers.map((row) => ({ name: row.name, value: value(row.value, `headers.${row.name}`) }));
				delete instance.command;
				delete instance.args;
				delete instance.cwd;
				delete instance.env;
			}
			return { instance, secrets, clears };
		}

		function launchDetails(instance) {
			if (instance.transport === "stdio") {
				const args = instance.args.map((row) => row.kind === "credential" ? "••••••" : row.text);
				return [instance.command, ...args].join(" ") + (instance.cwd ? `\nCWD: ${instance.cwd}` : "");
			}
			return instance.url;
		}

		function Editor({ original, revision, rpc, ask, onSaved, onClose, t }) {
			const [draft, setDraft] = React.useState(() => editableInstance(original));
			const baseline = React.useRef(JSON.stringify(draft));
			const [busy, setBusy] = React.useState(false);
			const [error, setError] = React.useState("");
			const [testResult, setTestResult] = React.useState(null);
			const isNew = !original;
			const dirty = JSON.stringify(draft) !== baseline.current;
			const close = async () => {
				if (!dirty || await ask({ title: t("cancel"), body: t("discard") })) onClose();
			};
			const callWithApproval = async (endpoint, payload) => {
				let result;
				try {
					result = await rpc(endpoint, payload);
				} catch (failure) {
					if (failure.code !== "EXECUTION_APPROVAL_REQUIRED") throw failure;
					const approved = await ask({
						title: t("executionTitle"),
						body: t("executionBody"),
						details: launchDetails(draft),
					});
					if (!approved) throw new Error(t("cancel"));
					result = await rpc(endpoint, {
						...payload,
						confirmationToken: failure.details.confirmationToken,
					});
				}
				return result;
			};
			const save = async () => {
				setBusy(true); setError("");
				try {
					const payload = { ...serializeDraft(draft), expectedRevision: revision };
					const result = isNew
						? await rpc("create", payload)
						: await callWithApproval("update", payload);
					onSaved(result);
				} catch (failure) {
					setError(failure.code === "SETTINGS_CONFLICT" ? t("conflict") : failure.message);
				} finally { setBusy(false); }
			};
			const test = async () => {
				setBusy(true); setError(""); setTestResult(null);
				try {
					const result = await callWithApproval("test", serializeDraft(draft));
					setTestResult(result);
				} catch (failure) { setError(failure.message); }
				finally { setBusy(false); }
			};
			const patch = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
			const number = (key, value) => patch(key, Number(value));
			return h("div", { className: "mm-overlay" },
				h("div", { className: "mm-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "mm-editor-title" },
					h("h3", { id: "mm-editor-title" }, isNew ? t("add") : t("edit")),
					h("div", { className: "mm-grid" },
						h("label", { className: "mm-field" }, h("span", null, t("name")), h("input", { className: "mm-input", value: draft.displayName, onChange: (e) => patch("displayName", e.target.value) })),
						h("label", { className: "mm-field" }, h("span", null, t("serverName")), h("input", { className: "mm-input", value: draft.serverName, onChange: (e) => patch("serverName", e.target.value) })),
						h("label", { className: "mm-field" }, h("span", null, t("transport")), h("select", { className: "mm-select", value: draft.transport, onChange: (e) => {
							const transport = e.target.value;
							setDraft((current) => transport === "stdio"
								? { ...current, transport, command: current.command || "", args: current.args || [], cwd: current.cwd || "", env: current.env || [] }
								: { ...current, transport, url: current.url || "", headers: current.headers || [] });
						} }, h("option", { value: "stdio" }, "stdio"), h("option", { value: "streamable-http" }, "streamable-http"))),
						draft.transport === "stdio"
							? [
								h("label", { className: "mm-field mm-wide", key: "command" }, h("span", null, t("command")), h("input", { className: "mm-input", value: draft.command, onChange: (e) => patch("command", e.target.value) })),
								h("label", { className: "mm-field mm-wide", key: "cwd" }, h("span", null, t("cwd")), h("input", { className: "mm-input", value: draft.cwd, onChange: (e) => patch("cwd", e.target.value) })),
								h(ValueRows, { key: "args", rows: draft.args, setRows: (rows) => patch("args", rows), title: t("args"), t }),
								h(ValueRows, { key: "env", rows: draft.env, setRows: (rows) => patch("env", rows), named: true, defaultCredential: true, title: t("env"), t }),
							]
							: [
								h("label", { className: "mm-field mm-wide", key: "url" }, h("span", null, t("url")), h("input", { className: "mm-input", value: draft.url, onChange: (e) => patch("url", e.target.value) })),
								h(ValueRows, { key: "headers", rows: draft.headers, setRows: (rows) => patch("headers", rows), named: true, defaultCredential: true, title: t("headers"), t }),
							],
						h("label", { className: "mm-field" }, h("span", null, t("timeout")), h("input", { className: "mm-input", type: "number", min: 1000, value: draft.toolCallTimeoutMs, onChange: (e) => number("toolCallTimeoutMs", e.target.value) })),
						h("label", { className: "mm-check" }, h("input", { type: "checkbox", checked: draft.reconnect.enabled, onChange: (e) => patch("reconnect", { ...draft.reconnect, enabled: e.target.checked }) }), t("reconnect")),
						h("label", { className: "mm-field" }, h("span", null, t("initialDelay")), h("input", { className: "mm-input", type: "number", min: 1, value: draft.reconnect.initialDelayMs, onChange: (e) => patch("reconnect", { ...draft.reconnect, initialDelayMs: Number(e.target.value) }) })),
						h("label", { className: "mm-field" }, h("span", null, t("maxDelay")), h("input", { className: "mm-input", type: "number", min: 1, value: draft.reconnect.maxDelayMs, onChange: (e) => patch("reconnect", { ...draft.reconnect, maxDelayMs: Number(e.target.value) }) })),
						h("label", { className: "mm-field" }, h("span", null, t("maxAttempts")), h("input", { className: "mm-input", type: "number", min: 1, value: draft.reconnect.maxAttempts, onChange: (e) => patch("reconnect", { ...draft.reconnect, maxAttempts: Number(e.target.value) }) })),
					),
					h("p", { className: "mm-warning" }, t("testWarning")),
					error && h("div", { className: "mm-error", role: "alert" }, error),
					testResult && h("div", { className: "mm-testResult", role: "status" },
						h("strong", null, `${t("testSuccess")} · ${testResult.latencyMs} ms · ${testResult.tools.length} ${t("tools")}`),
						testResult.tools.map((tool) => h(ToolDetails, { key: tool.name, tool, t })),
					),
					h("div", { className: "mm-dialogActions" },
						h("button", { className: "mm-button", disabled: busy, onClick: close }, t("cancel")),
						h("button", { className: "mm-button", disabled: busy, onClick: test }, t("test")),
						h("button", { className: "mm-button mm-primary", disabled: busy, onClick: save }, t("save")),
					),
				),
			);
		}

		function ToolDetails({ tool, t }) {
			return h("details", { className: "mm-tool" },
				h("summary", null, tool.name),
				h("p", null, tool.description || t("noDescription")),
				h("div", { className: "mm-groupTitle" }, t("schema")),
				h("pre", { className: "mm-code" }, JSON.stringify(tool.inputSchema || tool.parameters || {}, null, 2)),
			);
		}

		function McpManagerSection({ rpc, t }) {
			const [data, setData] = React.useState(null);
			const [error, setError] = React.useState("");
			const [editor, setEditor] = React.useState(undefined);
			const [tools, setTools] = React.useState({});
			const [confirmState, setConfirmState] = React.useState(null);
			const loadGeneration = React.useRef(0);
			const ask = (options) => new Promise((resolve) => setConfirmState({
				...options,
				resolve: (answer) => { setConfirmState(null); resolve(answer); },
			}));
			const load = React.useCallback(async () => {
				const generation = ++loadGeneration.current;
				try {
					const next = await rpc("list");
					if (generation !== loadGeneration.current) return;
					setData(next);
					setError("");
				} catch (failure) {
					if (generation === loadGeneration.current) setError(failure.message);
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
			const toggle = async (instance) => {
				const payload = {
					id: instance.id,
					enabled: !instance.enabled,
					expectedRevision: data.revision,
				};
				try {
					const next = await rpc("set-enabled", payload);
					acceptMutation(next);
				} catch (failure) {
					if (failure.code !== "EXECUTION_APPROVAL_REQUIRED") {
						setError(failure.code === "SETTINGS_CONFLICT" ? t("conflict") : failure.message);
						return;
					}
					const approved = await ask({
						title: t("executionTitle"),
						body: t("executionBody"),
						details: launchDetails(editableInstance(instance)),
					});
					if (!approved) return;
					try {
						const next = await rpc("set-enabled", {
							...payload,
							confirmationToken: failure.details.confirmationToken,
						});
						acceptMutation(next);
					} catch (retryFailure) {
						setError(retryFailure.code === "SETTINGS_CONFLICT"
							? t("conflict")
							: retryFailure.message);
					}
				}
			};
			const remove = async (instance) => {
				const approved = await ask({ title: t("deleteTitle"), body: t("deleteBody"), phrase: instance.serverName, danger: true });
				if (!approved) return;
				try {
					acceptMutation(await rpc("delete", {
						id: instance.id,
						expectedRevision: data.revision,
					}));
				}
				catch (failure) { setError(failure.message); }
			};
			const reload = async (instance) => {
				const payload = { id: instance.id, expectedRevision: data.revision };
				try {
					acceptMutation(await rpc("reload", payload));
				} catch (failure) {
					if (failure.code !== "EXECUTION_APPROVAL_REQUIRED") {
						setError(failure.message);
						return;
					}
					const approved = await ask({
						title: t("executionTitle"),
						body: t("executionBody"),
						details: launchDetails(editableInstance(instance)),
					});
					if (!approved) return;
					try {
						acceptMutation(await rpc("reload", {
							...payload,
							confirmationToken: failure.details.confirmationToken,
						}));
					} catch (retryFailure) {
						setError(retryFailure.code === "SETTINGS_CONFLICT"
							? t("conflict")
							: retryFailure.message);
					}
				}
			};
			const showTools = async (instance) => {
				try {
					const next = await rpc("tools", { id: instance.id });
					setTools((current) => ({ ...current, [instance.id]: next }));
				}
				catch (failure) { setError(failure.message); }
			};
			if (!data && !error) return h("div", { className: "mm-root", "aria-busy": "true" }, t("loading"));
			return h("section", { className: "mm-root", "aria-labelledby": "mm-title" },
				h("div", { className: "mm-head" },
					h("div", { className: "mm-headText" }, h("h2", { id: "mm-title" }, t("title")), h("p", null, t("subtitle"))),
					h("button", {
						className: "mm-button mm-primary",
						disabled: !data,
						onClick: () => setEditor({ original: null, revision: data.revision }),
					}, t("add")),
				),
				error && h("div", { className: "mm-error", role: "alert" }, error, " ", h("button", { className: "mm-button", onClick: load }, t("refresh"))),
				data && data.instances.length === 0
					? h("div", { className: "mm-empty" }, h("strong", null, t("emptyTitle")), h("p", null, t("emptyBody")))
					: h("ul", { className: "mm-list" }, data?.instances.map((instance) =>
						h("li", { className: "mm-card", key: instance.id },
							h("div", { className: "mm-cardTop" },
								h("div", { className: "mm-cardTitle" }, h("strong", null, instance.displayName), h("div", { className: "mm-meta" }, `${instance.serverName} · ${instance.transport}`)),
								h("span", { className: "mm-status" }, h("span", { className: "mm-dot", "data-phase": instance.status.phase }), t(instance.status.phase), ` · ${instance.status.toolCount} ${t("tools")}`),
								h("label", { className: "mm-check" }, h("input", { type: "checkbox", checked: instance.enabled, onChange: () => toggle(instance), "aria-label": instance.enabled ? t("enabled") : t("disabled") }), instance.enabled ? t("enabled") : t("disabled")),
							),
							instance.status.lastError && h("div", { className: "mm-error" }, instance.status.lastError),
							h("div", { className: "mm-actions" },
								h("button", { className: "mm-button", onClick: () => setEditor({ original: instance, revision: data.revision }) }, t("edit")),
								h("button", { className: "mm-button", disabled: !instance.enabled, onClick: () => reload(instance) }, t("reload")),
								h("button", { className: "mm-button", onClick: () => showTools(instance) }, t("tools")),
								h("button", { className: "mm-button mm-danger", onClick: () => remove(instance) }, t("delete")),
							),
							tools[instance.id]?.map((tool) => h(ToolDetails, { key: tool.name, tool, t })),
						),
					)),
				editor !== undefined && h(Editor, {
					original: editor.original,
					revision: editor.revision,
					rpc,
					ask,
					t,
					onClose: () => setEditor(undefined),
					onSaved: (next) => {
						acceptMutation(next);
						setEditor(undefined);
					},
				}),
				h(ConfirmDialog, { state: confirmState, t }),
			);
		}

		const inject = ["slots", "locale", "connection"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "mcp-manager: locales");
			const t = ctx.locale.bind(NS);
			const rpc = async (endpoint, payload) => {
				const result = await ctx.connection.rpc.call("/mcp-manager", endpoint, payload ?? null);
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
	}
});
