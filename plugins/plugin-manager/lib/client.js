window.__ModuleLoader__.load({
	id: "@team-dsh-plugins/plugin-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const {
			Button,
			IconCheckOutline16,
			IconChevronRightOutline14,
			IconCopyOutline16,
			IconEllipsisOutline16,
			IconLoadingOutline16,
			IconQuestionOutline14,
			IconRefreshOutline16,
			Menu,
			Modal,
			StateDot,
			Toast,
			Tooltip,
		} = require("@deepseek-ai/dsh-client-ui-primitives");
		const h = React.createElement;
		const NS = "plugin-manager";

		const zh = {
			section: "插件管理",
			title: "插件管理",
			subtitle: "管理当前 DSH Web Profile 中通过 npm 安装的外源插件。",
			refresh: "刷新实际状态",
			refreshedNow: "刚刚更新",
			refreshedAt: "更新于 {time}",
			refreshFailed: "刷新失败，请检查 DSH 状态后重试。",
			addHeading: "添加 npm 插件",
			addHint: "输入 npm 包名。系统会先解析真实版本，再请你确认安装。",
			packageName: "包名",
			packagePlaceholder: "例如 dsh-context 或 @scope/plugin",
			specifyVersion: "指定版本（可选）",
			versionPlaceholder: "例如 1.2.3；留空则使用 latest",
			add: "添加插件",
			resolving: "正在解析",
			loading: "正在读取插件…",
			empty: "尚未安装外源插件。",
			external: "外源插件",
			system: "系统管理",
			systemTip: "这些 Bundle 由 DSH 或当前工作区提供，只在此展示状态，不能从本页面修改。",
			readOnly: "只读",
			version: "版本",
			enabled: "已注册",
			profileDisabled: "Profile 已停用",
			partiallyDisabled: "部分 entry 已停用",
			unknown: "状态未知",
			broken: "安装损坏",
			removed: "已删除，待重启",
			checkUpdate: "检查更新",
			checking: "正在检查",
			upToDate: "已是最新版本",
			updateAvailable: "可更新至 {version}",
			update: "更新至 {version}",
			repair: "按 {version} 修复",
			changeVersion: "更改版本",
			restore: "恢复历史版本 {version}",
			delete: "删除",
			moreActions: "更多操作",
			applyVersion: "继续",
			closeVersion: "收起",
			cancel: "取消",
			confirm: "确认",
			addTitle: "确认添加第三方插件",
			changeTitle: "确认更改插件版本",
			restoreTitle: "确认恢复历史版本",
			repairTitle: "确认修复插件",
			undoTitle: "确认撤销待生效变更",
			deleteTitle: "确认删除插件",
			executionWarning: "第三方代码及其依赖可能执行生命周期脚本，并将以当前用户权限运行。",
			deleteWarning: "将卸载此包并移除 Bundle 注册，但不会清理插件设置和业务数据。",
			undoWarning: "撤销会再次修改 Web Profile；完成后仍需重启 DSH Web。",
			currentVersion: "当前版本",
			targetVersion: "目标版本",
			registry: "Registry",
			homepage: "主页",
			lifecycle: "生命周期脚本",
			none: "无",
			operationRunning: "正在处理 {packageName}",
			stageValidate: "准备",
			stageInstall: "下载并安装",
			stageRemove: "卸载并移除注册",
			stageVerify: "核对真实状态",
			stageRollback: "自动恢复原状态",
			operationFailed: "操作未完成",
			rollbackCompleted: "已自动恢复到操作前状态。",
			rollbackNotNeeded: "实际状态未改变，无需恢复。",
			rollbackNotAvailable: "此操作无法安全自动恢复；以下方检测到的实际状态为准。",
			rollbackFailed: "自动恢复失败，请先按下方建议处理，再重启 DSH。",
			observed: "当前检测到：{version} · {health}",
			technicalDetails: "技术详情",
			copyDetails: "复制技术详情",
			copied: "已复制",
			copyFailed: "复制失败，请手动选择文本。",
			pendingTitle: "更改已保存，重启 DSH Web 后生效",
			pendingAdd: "将添加 {version}",
			pendingRemove: "将移除 {version}",
			pendingChange: "将从 {previous} 切换到 {target}",
			pendingRepair: "已按 {version} 重新安装；损坏状态无法作为撤销目标",
			undo: "撤销更改",
			copyRestart: "复制启动命令",
			safeExit: "安全退出说明",
			exitTip: "回到启动 DSH Web 的终端按 Ctrl+C，等待进程退出后，再运行已复制的启动命令。",
			later: "稍后处理",
			restartCopied: "已复制 DSH Web 启动命令。",
			prepareFailed: "无法准备此操作",
			errorPackageNotFound: "Registry 中未找到这个包或版本。",
			advicePackageNotFound: "核对包名和版本；私有包还需确认当前 Profile 使用的 registry。",
			errorRegistryAuth: "Registry 拒绝了访问。",
			adviceRegistryAuth: "检查 npm 登录状态、访问令牌和私有 registry 权限。",
			errorInvalidBundle: "目标包不是可用的 DSH Bundle。",
			adviceInvalidBundle: "确认该版本声明了有效的 dsh.bundle.patch；不要安装普通 npm 库。",
			errorInvalidMetadata: "Registry 返回的包信息无法验证。",
			adviceInvalidMetadata: "稍后重试，或检查 registry 代理是否改写了元数据。",
			errorLifecycle: "插件或依赖的安装脚本执行失败。",
			adviceLifecycle: "展开技术详情查看失败脚本；修复本机依赖或改用其他精确版本。",
			errorTimeout: "DSH CLI 操作超过五分钟，已终止。",
			adviceTimeout: "检查网络和 npm registry；确认没有残留安装进程后重试。",
			errorVerification: "CLI 已结束，但 Web Profile 的真实状态与目标不一致。",
			adviceVerification: "先刷新；若自动恢复失败，请使用文档中的紧急 CLI 恢复步骤。",
			errorNetwork: "无法连接 npm registry。",
			adviceNetwork: "检查网络、代理、证书和 registry 配置后重试。",
			errorRestartPending: "该插件已有待重启变更。",
			adviceRestartPending: "请先撤销该变更，或重启 DSH Web 使其生效。",
			errorGeneric: "插件操作失败。",
			adviceGeneric: "刷新真实状态后重试；仍失败时展开技术详情定位原因。",
			busy: "已有插件操作正在执行，请等待完成。",
			invalid: "请输入合法 npm 包名；版本只能是 latest 或精确 semver。",
			approval: "确认已失效，请重新发起操作。",
			noChange: "当前已是目标版本。",
		};
		const en = {
			...zh,
			section: "Plugins",
			title: "Plugin management",
			subtitle: "Manage external npm plugins in the current DSH Web Profile.",
			refresh: "Refresh actual state",
			refreshedNow: "Updated just now",
			refreshedAt: "Updated at {time}",
			refreshFailed: "Refresh failed. Check DSH and try again.",
			addHeading: "Add npm plugin",
			addHint: "Enter an npm package name. The resolved version is shown before installation.",
			packageName: "Package",
			packagePlaceholder: "For example, dsh-context or @scope/plugin",
			specifyVersion: "Specify version (optional)",
			versionPlaceholder: "For example, 1.2.3; blank uses latest",
			add: "Add plugin",
			resolving: "Resolving",
			loading: "Loading plugins…",
			empty: "No external plugins are installed.",
			external: "External plugins",
			system: "System managed",
			systemTip: "These Bundles are supplied by DSH or this workspace. Their state is visible here, but they are read-only.",
			readOnly: "Read-only",
			version: "Version",
			enabled: "Registered",
			profileDisabled: "Disabled by Profile",
			partiallyDisabled: "Some entries disabled",
			unknown: "Unknown state",
			broken: "Broken installation",
			removed: "Removed, restart pending",
			checkUpdate: "Check for updates",
			checking: "Checking",
			upToDate: "Up to date",
			updateAvailable: "Version {version} available",
			update: "Update to {version}",
			repair: "Repair {version}",
			changeVersion: "Change version",
			restore: "Restore {version}",
			delete: "Delete",
			moreActions: "More actions",
			applyVersion: "Continue",
			closeVersion: "Collapse",
			cancel: "Cancel",
			confirm: "Confirm",
			addTitle: "Confirm third-party plugin",
			changeTitle: "Confirm version change",
			restoreTitle: "Confirm version restore",
			repairTitle: "Confirm plugin repair",
			undoTitle: "Confirm undo",
			deleteTitle: "Confirm plugin deletion",
			executionWarning: "Third-party code and dependencies may run lifecycle scripts with your user permissions.",
			deleteWarning: "The package and Bundle registration will be removed. Plugin settings and business data are retained.",
			undoWarning: "Undo changes the Web Profile again. Restart DSH Web afterward.",
			currentVersion: "Current version",
			targetVersion: "Target version",
			registry: "Registry",
			homepage: "Homepage",
			lifecycle: "Lifecycle scripts",
			none: "None",
			operationRunning: "Working on {packageName}",
			stageValidate: "Prepare",
			stageInstall: "Download and install",
			stageRemove: "Uninstall and unregister",
			stageVerify: "Verify actual state",
			stageRollback: "Restore previous state",
			operationFailed: "Operation did not complete",
			rollbackCompleted: "The previous state was restored automatically.",
			rollbackNotNeeded: "The actual state did not change.",
			rollbackNotAvailable: "This operation cannot be safely restored automatically. Use the observed state below.",
			rollbackFailed: "Automatic restore failed. Follow the advice below before restarting DSH.",
			observed: "Observed: {version} · {health}",
			technicalDetails: "Technical details",
			copyDetails: "Copy technical details",
			copied: "Copied",
			copyFailed: "Copy failed. Select the text manually.",
			pendingTitle: "Change saved; restart DSH Web to apply",
			pendingAdd: "Adds {version}",
			pendingRemove: "Removes {version}",
			pendingChange: "Changes {previous} to {target}",
			pendingRepair: "Reinstalled {version}; a damaged state cannot be restored as an undo target",
			undo: "Undo change",
			copyRestart: "Copy start command",
			safeExit: "Safe exit instructions",
			exitTip: "Press Ctrl+C in the terminal running DSH Web, wait for it to exit, then run the copied start command.",
			later: "Handle later",
			restartCopied: "DSH Web start command copied.",
			prepareFailed: "Could not prepare this operation",
			busy: "Another plugin operation is running.",
			invalid: "Enter a valid npm package; versions must be latest or exact semver.",
			approval: "Confirmation expired. Start again.",
			noChange: "This version is already installed.",
			prepareFailed: "Could not prepare this operation",
			errorPackageNotFound: "The package or version was not found in the registry.",
			advicePackageNotFound: "Check the name and version. Private packages must use the Profile's configured registry.",
			errorRegistryAuth: "The registry denied access.",
			adviceRegistryAuth: "Check npm sign-in, access tokens, and private registry permissions.",
			errorInvalidBundle: "This package is not a usable DSH Bundle.",
			adviceInvalidBundle: "Use a version with a valid dsh.bundle.patch declaration.",
			errorInvalidMetadata: "The registry metadata could not be verified.",
			adviceInvalidMetadata: "Try again later or check whether a registry proxy is rewriting metadata.",
			errorLifecycle: "A plugin or dependency lifecycle script failed.",
			adviceLifecycle: "Open technical details to identify the script, then fix local prerequisites or choose another exact version.",
			errorTimeout: "The DSH CLI operation exceeded five minutes and was stopped.",
			adviceTimeout: "Check the network and registry, then verify no install process remains before retrying.",
			errorVerification: "The CLI finished, but the actual Web Profile state did not match the target.",
			adviceVerification: "Refresh first. If restore failed, use the documented emergency CLI recovery steps.",
			errorNetwork: "The npm registry could not be reached.",
			adviceNetwork: "Check the network, proxy, certificates, and registry configuration.",
			errorRestartPending: "This plugin already has a pending restart change.",
			adviceRestartPending: "Undo it or restart DSH Web to apply it.",
			errorGeneric: "The plugin operation failed.",
			adviceGeneric: "Refresh the actual state and retry. Open technical details if it still fails.",
		};

		const css = [
			".pm-root{width:100%;max-width:860px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:20px}",
			".pm-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.pm-heading{min-width:0}.pm-heading h2{margin:0;font-size:18px;line-height:26px}.pm-heading p,.pm-muted{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.pm-refresh{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap}.pm-tooltipAnchor{display:inline-flex}.pm-refreshButton{width:28px;padding:0;background:transparent}",
			".pm-addCard{background:var(--dsw-alias-bg-layer-3);box-shadow:var(--dsw-elevation-stroke);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px}.pm-addTitle{font-size:14px;line-height:20px;font-weight:600}.pm-addRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}.pm-field{display:flex;flex-direction:column;gap:6px}.pm-label{font-size:12px;color:var(--dsw-alias-label-secondary)}",
			".pm-input{box-sizing:border-box;width:100%;height:36px;border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;padding:0 10px}.pm-input::placeholder{color:var(--dsw-alias-label-tertiary)}.pm-input:focus-visible,.pm-details summary:focus-visible,.pm-system summary:focus-visible,.pm-info:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.pm-input:disabled{opacity:.5}.pm-versionBox{display:flex;gap:8px;align-items:end;margin-top:8px}.pm-versionBox .pm-field{flex:1}.pm-details summary,.pm-system summary{width:max-content;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px}.pm-details summary:hover,.pm-system summary:hover{color:var(--dsw-alias-label-primary)}",
			".pm-section{display:flex;flex-direction:column;gap:10px}.pm-sectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.pm-sectionHead h3{margin:0;font-size:14px;line-height:20px}.pm-count{color:var(--dsw-alias-label-tertiary);font-size:11px}.pm-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.pm-card{background:var(--dsw-alias-bg-layer-3);box-shadow:var(--dsw-elevation-stroke);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px}.pm-cardTop{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start}.pm-cardIdentity{display:flex;gap:10px;min-width:0}.pm-cardIdentity>span{margin-top:5px}.pm-cardTitle{min-width:0}.pm-cardTitle strong{display:block;font-size:14px;line-height:20px;overflow-wrap:anywhere}.pm-meta{color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:11px;line-height:18px;overflow-wrap:anywhere}.pm-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.pm-cardActions{display:flex;align-items:center;gap:6px}.pm-inlineError{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}.pm-empty{padding:28px 16px;text-align:center;border:.5px dashed var(--dsw-alias-border-l3);border-radius:12px;color:var(--dsw-alias-label-tertiary);font-size:13px}",
			".pm-update{color:var(--dsw-alias-state-success-primary);font-size:12px}.pm-versionEditor{border-top:.5px solid var(--dsw-alias-border-l3);padding-top:10px;display:grid;grid-template-columns:minmax(0,220px) auto;gap:8px;align-items:end}",
			".pm-operation{background:var(--dsw-alias-bg-layer-3);box-shadow:var(--dsw-elevation-stroke);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px}.pm-operationHead{display:flex;align-items:center;gap:9px;font-size:13px}.pm-operationHead svg{flex:0 0 auto}.pm-stageTrack{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.pm-stage{border-radius:7px;padding:6px 8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-size:11px;text-align:center}.pm-stage[data-active=true]{color:var(--dsw-alias-state-business-primary);font-weight:600}.pm-failure{display:flex;flex-direction:column;gap:7px}.pm-failure strong{font-size:13px}.pm-failure p{margin:0;font-size:12px;line-height:18px}.pm-dangerText{color:var(--dsw-alias-state-error-primary)}.pm-warningText{color:var(--dsw-alias-state-warning-primary)}.pm-technical summary{cursor:pointer;font-size:12px;color:var(--dsw-alias-label-secondary)}.pm-technical pre{max-height:180px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:9px;font:11px/17px var(--ds-font-family-code);color:var(--dsw-alias-label-secondary)}",
			".pm-pending{border:.5px solid color-mix(in srgb,var(--dsw-alias-state-warning-primary) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warning-primary) 8%,var(--dsw-alias-bg-layer-2));border-radius:9px;padding:10px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.pm-pendingText{min-width:0}.pm-pendingText strong{font-size:12px;line-height:18px}.pm-pendingText p{margin:2px 0 0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px}.pm-pendingActions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}",
			".pm-modalBody{display:flex;flex-direction:column;gap:12px}.pm-modalBody p{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}.pm-confirmGrid{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:7px 14px;font-size:12px}.pm-confirmGrid dt{color:var(--dsw-alias-label-tertiary)}.pm-confirmGrid dd{margin:0;overflow-wrap:anywhere}.pm-link{color:var(--dsw-alias-state-business-primary)}.pm-modalFooter{display:flex;justify-content:flex-end;gap:8px}",
			".pm-system{display:flex;flex-direction:column;gap:9px}.pm-system summary{display:flex;align-items:center;gap:6px;list-style:none;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}.pm-system summary::-webkit-details-marker{display:none}.pm-systemChevron{flex:0 0 auto;transition:transform .16s ease}.pm-system[open] .pm-systemChevron{transform:rotate(90deg)}.pm-info{display:inline-flex;color:var(--dsw-alias-label-tertiary);cursor:help}.pm-info:hover{color:var(--dsw-alias-label-secondary)}.pm-systemList{margin:0;padding:0;list-style:none;border-radius:10px;overflow:hidden;box-shadow:var(--dsw-elevation-stroke)}.pm-systemItem{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 12px;background:var(--dsw-alias-bg-layer-2);border-bottom:.5px solid var(--dsw-alias-border-l3);font-size:12px}.pm-systemItem:last-child{border-bottom:0}.pm-systemName{min-width:0;overflow-wrap:anywhere}.pm-systemMeta{color:var(--dsw-alias-label-tertiary);white-space:nowrap}",
			".pm-rotate{animation:pm-rotate .8s linear infinite}@keyframes pm-rotate{to{transform:rotate(360deg)}}",
			"@media (prefers-reduced-motion:reduce){.pm-rotate{animation:none}}",
			"@media (max-width:680px){.pm-header{align-items:flex-start}.pm-refreshText{display:none}.pm-addRow,.pm-cardTop,.pm-versionEditor{grid-template-columns:1fr}.pm-addRow>button,.pm-versionEditor>button{width:100%}.pm-cardActions{justify-content:flex-start}.pm-pending{flex-direction:column}.pm-pendingActions{width:100%}.pm-confirmGrid{grid-template-columns:1fr}.pm-modalFooter{flex-direction:column-reverse}.pm-modalFooter>button{width:100%}}",
		].join("");
		if (!document.querySelector('style[data-plugin-css="@team-dsh-plugins/plugin-manager"]')) {
			const style = document.createElement("style");
			style.dataset.pluginCss = "@team-dsh-plugins/plugin-manager";
			style.textContent = css;
			document.head.appendChild(style);
		}

		function interpolate(text, values) {
			return Object.entries(values || {}).reduce(
				(result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
				text,
			);
		}

		function formatTime(value) {
			if (!value) return "";
			return new Intl.DateTimeFormat(undefined, {
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
			}).format(new Date(value));
		}

		function statusKey(plugin) {
			if (plugin.health === "removed") return "removed";
			if (plugin.health === "broken") return "broken";
			if (plugin.activation === "profile-disabled") return "profileDisabled";
			if (plugin.activation === "partially-disabled") return "partiallyDisabled";
			if (plugin.activation === "enabled") return "enabled";
			return "unknown";
		}

		function dotState(plugin) {
			if (plugin.health === "broken") return "error";
			if (plugin.pendingRestart || plugin.activation !== "enabled") return "warning";
			return "done";
		}

		function errorCopy(error, t) {
			const category = error?.category || "operation-failed";
			const map = {
				"package-not-found": ["errorPackageNotFound", "advicePackageNotFound"],
				"registry-auth": ["errorRegistryAuth", "adviceRegistryAuth"],
				"invalid-bundle": ["errorInvalidBundle", "adviceInvalidBundle"],
				"invalid-metadata": ["errorInvalidMetadata", "adviceInvalidMetadata"],
				"lifecycle-failed": ["errorLifecycle", "adviceLifecycle"],
				"cli-timeout": ["errorTimeout", "adviceTimeout"],
				"verification-failed": ["errorVerification", "adviceVerification"],
				"registry-unavailable": ["errorNetwork", "adviceNetwork"],
				"restart-pending": ["errorRestartPending", "adviceRestartPending"],
			};
			if (error?.code === "OPERATION_BUSY") return { reason: t("busy"), advice: "" };
			if (error?.code === "INVALID_INPUT") return { reason: t("invalid"), advice: "" };
			if (error?.code === "APPROVAL_REQUIRED") return { reason: t("approval"), advice: "" };
			if (error?.code === "NO_VERSION_CHANGE") return { reason: t("noChange"), advice: "" };
			const keys = map[category] || ["errorGeneric", "adviceGeneric"];
			return { reason: t(keys[0]), advice: t(keys[1]) };
		}

		async function copyText(text) {
			if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
			await navigator.clipboard.writeText(text);
		}

		function ConfirmDialog({ state, t, onCancel, onConfirm }) {
			React.useEffect(() => {
				if (!state) return undefined;
				const closeOnlyThisDialog = (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					event.stopPropagation();
					event.stopImmediatePropagation();
					onCancel();
				};
				window.addEventListener("keydown", closeOnlyThisDialog, true);
				return () => window.removeEventListener("keydown", closeOnlyThisDialog, true);
			}, [state, onCancel]);
			if (!state) return null;
			const operation = state.operation;
			const metadata = operation.metadata;
			const titleKey = operation.action === "add"
				? "addTitle"
				: operation.action === "remove"
					? "deleteTitle"
					: operation.action === "restore"
						? "restoreTitle"
						: operation.action === "repair"
							? "repairTitle"
							: operation.action.startsWith("undo-")
								? "undoTitle"
								: "changeTitle";
			const warning = operation.action === "remove"
				? t("deleteWarning")
				: operation.action.startsWith("undo-")
					? t("undoWarning")
					: t("executionWarning");
			const footer = h("div", { className: "pm-modalFooter" },
				h(Button, { variant: "ghost", onClick: onCancel }, t("cancel")),
				h(Button, { variant: "primary", onClick: onConfirm }, t("confirm")));
			return h(Modal, {
				open: true,
				onClose: onCancel,
				title: t(titleKey),
				closeLabel: t("cancel"),
				description: warning,
				footer,
			},
			h("div", { className: "pm-modalBody" },
				h("dl", { className: "pm-confirmGrid" },
					h("dt", null, t("packageName")), h("dd", null, operation.packageName),
					operation.currentVersion && h(React.Fragment, null,
						h("dt", null, t("currentVersion")), h("dd", null, operation.currentVersion)),
					operation.targetVersion && h(React.Fragment, null,
						h("dt", null, t("targetVersion")), h("dd", null, operation.targetVersion)),
					metadata?.registryHost && h(React.Fragment, null,
						h("dt", null, t("registry")), h("dd", null, metadata.registryHost)),
					metadata && h(React.Fragment, null,
						h("dt", null, t("lifecycle")),
						h("dd", null, metadata.lifecycleScripts.length
							? metadata.lifecycleScripts.join(", ")
							: t("none"))),
					metadata?.homepage && h(React.Fragment, null,
						h("dt", null, t("homepage")),
						h("dd", null, h("a", {
							className: "pm-link",
							href: metadata.homepage,
							target: "_blank",
							rel: "noreferrer",
						}, metadata.homepage))),
				),
				metadata?.description && h("p", null, metadata.description)));
		}

		function FailureDetails({ operation, t, notify }) {
			const copy = errorCopy(operation.error, t);
			const rollbackKey = operation.rollback?.status === "completed"
				? "rollbackCompleted"
				: operation.rollback?.status === "not-needed"
					? "rollbackNotNeeded"
					: operation.rollback?.status === "not-available"
						? "rollbackNotAvailable"
						: "rollbackFailed";
			const details = [
				operation.error?.technicalDetails,
				operation.rollbackError?.technicalDetails,
			].filter(Boolean).join("\n\n");
			return h("div", { className: "pm-failure", role: "alert" },
				h("strong", { className: "pm-dangerText" }, t("operationFailed")),
				h("p", null, copy.reason),
				copy.advice && h("p", { className: "pm-muted" }, copy.advice),
				operation.rollback && h("p", {
					className: operation.rollback.status === "failed"
						? "pm-dangerText"
						: "pm-warningText",
				}, t(rollbackKey)),
				operation.observed && h("p", { className: "pm-muted" },
					interpolate(t("observed"), {
						version: operation.observed.version || "—",
						health: operation.observed.health,
					})),
				details && h("details", { className: "pm-technical" },
					h("summary", null, t("technicalDetails")),
					h("pre", null, details),
					h(Button, {
						size: "sm",
						variant: "outline",
						icon: h(IconCopyOutline16, { size: 14 }),
						onClick: async () => {
							try {
								await copyText(details);
								notify(t("copied"));
							} catch {
								notify(t("copyFailed"));
							}
						},
					}, t("copyDetails"))));
		}

		function OperationPanel({ operation, t, notify }) {
			if (!operation || operation.status === "completed") return null;
			if (operation.status === "failed") {
				return h("div", { className: "pm-operation" },
					h(FailureDetails, { operation, t, notify }));
			}
			const remove = operation.action === "remove"
				|| operation.action === "undo-add";
			const stages = [
				["validate", "stageValidate"],
				["install", remove ? "stageRemove" : "stageInstall"],
				["verify", "stageVerify"],
				["rollback", "stageRollback"],
			];
			return h("div", { className: "pm-operation", role: "status", "aria-live": "polite" },
				h("div", { className: "pm-operationHead" },
					h(IconLoadingOutline16, { size: 16, className: "pm-rotate" }),
					h("strong", null, interpolate(t("operationRunning"), {
						packageName: operation.packageName,
					}))),
				h("div", { className: "pm-stageTrack" },
					stages.map(([stage, label]) => h("span", {
						key: stage,
						className: "pm-stage",
						"data-active": operation.stage === stage,
					}, t(label)))));
		}

		function PendingNotice({ plugin, t, notify, onUndo }) {
			const [dismissed, setDismissed] = React.useState(false);
			const pending = plugin.pendingRestart;
			if (!pending || dismissed) return null;
			const detail = pending.action === "add"
				? interpolate(t("pendingAdd"), { version: pending.targetVersion })
				: pending.action === "remove"
					? interpolate(t("pendingRemove"), { version: pending.previousVersion })
					: pending.action === "repair"
						? interpolate(t("pendingRepair"), { version: pending.targetVersion })
						: interpolate(t("pendingChange"), {
							previous: pending.previousVersion,
							target: pending.targetVersion,
						});
			return h("div", { className: "pm-pending" },
				h("div", { className: "pm-pendingText" },
					h("strong", null, t("pendingTitle")),
					h("p", null, detail)),
				h("div", { className: "pm-pendingActions" },
					pending.undoAvailable !== false && h(Button, {
						size: "sm",
						variant: "outline",
						onClick: onUndo,
					}, t("undo")),
					h(Button, {
						size: "sm",
						variant: "ghost",
						icon: h(IconCopyOutline16, { size: 14 }),
						onClick: async () => {
							try {
								await copyText("npx @deepseek-ai/dsh web");
								notify(t("restartCopied"));
							} catch {
								notify(t("copyFailed"));
							}
						},
					}, t("copyRestart")),
					h(Button, {
						size: "sm",
						variant: "ghost",
						onClick: () => notify(t("exitTip"), 7000),
					}, t("safeExit")),
					h(Button, {
						size: "sm",
						variant: "ghost",
						onClick: () => setDismissed(true),
					}, t("later"))));
		}

		function PluginCard({
			plugin,
			busy,
			update,
			checking,
			t,
			notify,
			onCheck,
			onPrepare,
		}) {
			const [menuOpen, setMenuOpen] = React.useState(false);
			const [versionOpen, setVersionOpen] = React.useState(false);
			const [target, setTarget] = React.useState("");
			const pending = Boolean(plugin.pendingRestart);
			const menuItems = [
				...plugin.health === "ready" ? [{
					id: "change-version",
					label: t("changeVersion"),
				}] : [],
				...plugin.rollbackVersion && plugin.health === "ready" ? [{
					id: "restore",
					label: interpolate(t("restore"), { version: plugin.rollbackVersion }),
				}] : [],
				{ type: "separator", id: "danger-separator" },
				{ id: "remove", label: t("delete"), danger: true },
			];
			const selectMenu = (id) => {
				setMenuOpen(false);
				if (id === "change-version") setVersionOpen(true);
				else onPrepare(id);
			};
			let primary;
			if (pending && plugin.pendingRestart.undoAvailable !== false) {
				primary = h(Button, {
					size: "sm",
					variant: "outline",
					disabled: busy,
					onClick: () => onPrepare("undo"),
				}, t("undo"));
			} else if (pending) {
				primary = null;
			} else if (plugin.health === "broken") {
				primary = h(Button, {
					size: "sm",
					variant: "primary",
					disabled: busy,
					onClick: () => onPrepare("repair"),
				}, interpolate(t("repair"), { version: plugin.version || "—" }));
			} else if (update?.updateAvailable) {
				primary = h(Button, {
					size: "sm",
					variant: "primary",
					disabled: busy,
					onClick: () => onPrepare("change-version", update.targetVersion),
				}, interpolate(t("update"), { version: update.targetVersion }));
			} else {
				primary = h(Button, {
					size: "sm",
					variant: "outline",
					disabled: busy || checking,
					icon: checking
						? h(IconLoadingOutline16, { size: 14, className: "pm-rotate" })
						: h(IconRefreshOutline16, { size: 14 }),
					onClick: onCheck,
				}, checking ? t("checking") : t("checkUpdate"));
			}
			return h("li", { className: "pm-card" },
				h("div", { className: "pm-cardTop" },
					h("div", { className: "pm-cardIdentity" },
						h(StateDot, { state: dotState(plugin), size: 10 }),
						h("div", { className: "pm-cardTitle" },
							h("strong", null, plugin.packageName),
							h("div", { className: "pm-meta" },
								`${t("version")} ${plugin.version || "—"}`),
							h("div", { className: "pm-status" }, t(statusKey(plugin))))),
					h("div", { className: "pm-cardActions" },
						primary,
						!pending && h(Menu, {
							open: menuOpen,
							align: "end",
							portal: true,
							compact: true,
							items: menuItems,
							onClose: () => setMenuOpen(false),
							onSelect: selectMenu,
							anchor: h(Button, {
								size: "sm",
								variant: "toolbar",
								icon: h(IconEllipsisOutline16, { size: 16 }),
								disabled: busy,
								"aria-label": t("moreActions"),
								onClick: () => setMenuOpen((open) => !open),
							}),
						}))),
				plugin.issue && h("div", { className: "pm-inlineError", role: "alert" }, plugin.issue),
				update && !update.updateAvailable && h("div", { className: "pm-update" },
					h(IconCheckOutline16, { size: 14 }), " ", t("upToDate")),
				update?.updateAvailable && h("div", { className: "pm-update" },
					interpolate(t("updateAvailable"), { version: update.targetVersion })),
				versionOpen && !pending && h("form", {
					className: "pm-versionEditor",
					onSubmit: (event) => {
						event.preventDefault();
						onPrepare("change-version", target);
					},
				},
				h("label", { className: "pm-field" },
					h("span", { className: "pm-label" }, t("targetVersion")),
					h("input", {
						className: "pm-input",
						value: target,
						placeholder: t("versionPlaceholder"),
						onChange: (event) => setTarget(event.target.value),
						disabled: busy,
						autoFocus: true,
					})),
				h(Button, {
					type: "submit",
					variant: "primary",
					disabled: busy || !target,
				}, t("applyVersion"))),
				h(PendingNotice, {
					plugin,
					t,
					notify,
					onUndo: () => onPrepare("undo"),
				}));
		}

		function SystemList({ plugins, t }) {
			return h("details", { className: "pm-system" },
				h("summary", null,
					h(IconChevronRightOutline14, {
						size: 14,
						className: "pm-systemChevron",
					}),
					t("system"),
					h(Tooltip, {
						label: t("systemTip"),
						side: "top",
						maxWidth: 300,
					}, h("span", {
						className: "pm-info",
						"aria-label": t("systemTip"),
					}, h(IconQuestionOutline14, { size: 14 })))),
				h("ul", { className: "pm-systemList" },
					plugins.map((plugin) => h("li", {
						key: plugin.packageName,
						className: "pm-systemItem",
					},
					h("span", { className: "pm-systemName" }, plugin.packageName),
					h("span", { className: "pm-systemMeta" },
						`${plugin.version || "—"} · ${t("readOnly")}`)))));
		}

		function PluginManagerSection({ rpc, t }) {
			const [state, setState] = React.useState(null);
			const [packageName, setPackageName] = React.useState("");
			const [version, setVersion] = React.useState("");
			const [preparing, setPreparing] = React.useState("");
			const [refreshing, setRefreshing] = React.useState(false);
			const [failure, setFailure] = React.useState(null);
			const [confirm, setConfirm] = React.useState(null);
			const [updates, setUpdates] = React.useState({});
			const [checking, setChecking] = React.useState("");
			const [toast, setToast] = React.useState(null);
			const finalOperation = React.useRef("");
			const preparingLock = React.useRef(false);
			const checkingLock = React.useRef(false);
			const dismissToast = React.useCallback(() => setToast(null), []);
			const notify = React.useCallback((text, holdMs = 3500) => {
				setToast({ id: `${Date.now()}-${Math.random()}`, text, holdMs });
			}, []);
			const load = React.useCallback(async ({ announceFailure = true } = {}) => {
				setRefreshing(true);
				try {
					const next = await rpc("list");
					setState(next);
					setFailure(null);
					return next;
				} catch (error) {
					if (announceFailure) notify(t("refreshFailed"), 5000);
					throw error;
				} finally {
					setRefreshing(false);
				}
			}, [notify, rpc, t]);
			React.useEffect(() => {
				load().catch(() => {});
			}, [load]);
			React.useEffect(() => {
				const onFocus = () => load().catch(() => {});
				window.addEventListener("focus", onFocus);
				return () => window.removeEventListener("focus", onFocus);
			}, [load]);
			React.useEffect(() => {
				if (state?.operation?.status !== "running") return undefined;
				const timer = setInterval(() => load({ announceFailure: false }).catch(() => {}), 700);
				return () => clearInterval(timer);
			}, [state?.operation?.status, load]);
			React.useEffect(() => {
				const operation = state?.operation;
				if (!operation || operation.status === "running") return;
				const marker = `${operation.id}:${operation.status}`;
				if (finalOperation.current === marker) return;
				finalOperation.current = marker;
				if (operation.status === "completed") {
					setUpdates((current) => {
						const next = { ...current };
						delete next[operation.packageName];
						return next;
					});
				}
			}, [state?.operation]);
			const prepare = async (payload, key = payload.action) => {
				if (preparingLock.current) return;
				preparingLock.current = true;
				setPreparing(key);
				try {
					setConfirm(await rpc("prepare", payload));
					setFailure(null);
				} catch (error) {
					setFailure(error);
				} finally {
					preparingLock.current = false;
					setPreparing("");
				}
			};
			const execute = async () => {
				const current = confirm;
				setConfirm(null);
				try {
					const started = await rpc("execute", {
						approvalToken: current.approvalToken,
					});
					setState((previous) => ({
						...(previous || { plugins: [] }),
						operation: started.operation,
					}));
					setFailure(null);
				} catch (error) {
					setFailure(error);
				}
			};
			const checkUpdate = async (name) => {
				if (checkingLock.current) return;
				checkingLock.current = true;
				setChecking(name);
				try {
					const result = await rpc("check-update", { packageName: name });
					setUpdates((current) => ({ ...current, [name]: result }));
					setFailure(null);
				} catch (error) {
					setFailure(error);
				} finally {
					checkingLock.current = false;
					setChecking("");
				}
			};
			const busy = state?.operation?.status === "running";
			const controlsBusy = busy || Boolean(preparing);
			const external = state?.plugins.filter((plugin) => plugin.kind === "external") ?? [];
			const system = state?.plugins.filter((plugin) => plugin.kind !== "external") ?? [];
			const preparePlugin = (plugin, action, targetVersion) => prepare({
				action,
				packageName: plugin.packageName,
				...(targetVersion ? { targetVersion } : {}),
			}, `${plugin.packageName}:${action}`);
			const renderedError = failure && errorCopy(failure, t);
			return h("section", { className: "pm-root", "aria-labelledby": "pm-title" },
				h("header", { className: "pm-header" },
					h("div", { className: "pm-heading" },
						h("h2", { id: "pm-title" }, t("title")),
						h("p", null, t("subtitle"))),
					h("div", { className: "pm-refresh" },
						h("span", { className: "pm-refreshText" }, state?.readAt
							? interpolate(t("refreshedAt"), { time: formatTime(state.readAt) })
							: t("refreshedNow")),
						h(Tooltip, { label: t("refresh"), side: "bottom" },
							h("span", { className: "pm-tooltipAnchor" },
								h(Button, {
									size: "sm",
									variant: "ghost",
									className: "pm-refreshButton",
									icon: h(IconRefreshOutline16, {
										size: 16,
										className: refreshing ? "pm-rotate" : undefined,
									}),
									disabled: refreshing || controlsBusy,
									"aria-label": t("refresh"),
									onClick: () => load().catch(() => {}),
								}))))),
				h("form", {
					className: "pm-addCard",
					onSubmit: (event) => {
						event.preventDefault();
						const spec = version ? `${packageName}@${version}` : packageName;
						prepare({ action: "add", spec }, "add");
					},
				},
				h("div", null,
					h("div", { className: "pm-addTitle" }, t("addHeading")),
					h("p", { className: "pm-muted" }, t("addHint"))),
				h("div", { className: "pm-addRow" },
					h("label", { className: "pm-field" },
						h("span", { className: "pm-label" }, t("packageName")),
						h("input", {
							className: "pm-input",
							value: packageName,
							placeholder: t("packagePlaceholder"),
							autoComplete: "off",
							spellCheck: false,
							disabled: controlsBusy,
							onChange: (event) => setPackageName(event.target.value),
						})),
					h(Button, {
						type: "submit",
						variant: "primary",
						icon: preparing === "add"
							? h(IconLoadingOutline16, { size: 16, className: "pm-rotate" })
							: undefined,
						disabled: controlsBusy || !packageName,
					}, preparing === "add" ? t("resolving") : t("add"))),
				h("details", { className: "pm-details" },
					h("summary", null, t("specifyVersion")),
					h("div", { className: "pm-versionBox" },
						h("label", { className: "pm-field" },
							h("span", { className: "pm-label" }, t("targetVersion")),
							h("input", {
								className: "pm-input",
								value: version,
								placeholder: t("versionPlaceholder"),
								autoComplete: "off",
								spellCheck: false,
								disabled: controlsBusy,
								onChange: (event) => setVersion(event.target.value),
							}))))),
				renderedError && h("div", { className: "pm-inlineError", role: "alert" },
					h("strong", null, renderedError.reason),
					renderedError.advice && h("div", null, renderedError.advice)),
				h(OperationPanel, { operation: state?.operation, t, notify }),
				!state && h("div", {
					className: "pm-empty",
					"aria-busy": "true",
				}, t("loading")),
				state && h("section", { className: "pm-section", "aria-labelledby": "pm-external" },
					h("div", { className: "pm-sectionHead" },
						h("h3", { id: "pm-external" }, t("external")),
						h("span", { className: "pm-count" }, String(external.length))),
					external.length
						? h("ul", { className: "pm-list" }, external.map((plugin) =>
							h(PluginCard, {
								key: plugin.packageName,
								plugin,
								busy: controlsBusy,
								update: updates[plugin.packageName],
								checking: checking === plugin.packageName,
								t,
								notify,
								onCheck: () => checkUpdate(plugin.packageName),
								onPrepare: (action, targetVersion) =>
									preparePlugin(plugin, action, targetVersion),
							})))
						: h("div", { className: "pm-empty" }, t("empty"))),
				state && system.length > 0 && h(SystemList, { plugins: system, t }),
				h(ConfirmDialog, {
					state: confirm,
					t,
					onCancel: () => setConfirm(null),
					onConfirm: execute,
				}),
				toast && h(Toast, {
					key: toast.id,
					text: toast.text,
					holdMs: toast.holdMs,
					onDone: dismissToast,
				}));
		}

		const inject = ["slots", "locale", "connection"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "plugin-manager: locales");
			const bound = ctx.locale.bind(NS);
			const t = (key) => bound(key);
			const rpc = async (endpoint, payload) => {
				const result = await ctx.connection.rpc.call("/plugin-manager", endpoint, payload ?? null);
				if (!result.ok) {
					const error = new Error(result.error.message);
					error.code = result.error.code;
					error.category = result.error.category;
					error.technicalDetails = result.error.technicalDetails;
					error.details = result.error.details || {};
					throw error;
				}
				return result.value;
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "plugin-manager",
				order: 40,
				label: () => t("section"),
				locale: NS,
				inject: () => ({ rpc, t }),
			}, PluginManagerSection));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
