import { randomBytes } from 'node:crypto';

import {
  isExactSemver,
  operationFingerprint,
  parsePackageSpec,
  redactProcessOutput,
} from './model.js';

const APPROVAL_TTL_MS = 5 * 60_000;

class PluginManagerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PluginManagerError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new PluginManagerError(code, `plugin-manager: ${message}`, details);
}

function packageNameOnly(input) {
  const parsed = parsePackageSpec(input);
  if (parsed.packageName !== input || parsed.requestedVersion !== 'latest') {
    fail('INVALID_INPUT', '此字段只接受包名');
  }
  return parsed.packageName;
}

function versionSpec(packageName, version) {
  if (version !== 'latest' && !isExactSemver(version)) {
    fail('INVALID_INPUT', '目标版本只允许 latest 或精确 semver');
  }
  return `${packageName}@${version}`;
}

function errorCategory(code, text) {
  if (code === 'PROCESS_TIMEOUT') return 'cli-timeout';
  if (code === 'STATE_MISMATCH') return 'verification-failed';
  if (code === 'INVALID_BUNDLE') return 'invalid-bundle';
  if (code === 'REGISTRY_METADATA_INVALID') return 'invalid-metadata';
  if (code === 'RESTART_PENDING') return 'restart-pending';
  if (/E401|E403|401|403|unauthorized|forbidden|authentication/iu.test(text)) {
    return 'registry-auth';
  }
  if (/E404|404|not found|ERR_PNPM_FETCH_404/iu.test(text)) {
    return 'package-not-found';
  }
  if (/ELIFECYCLE|lifecycle|postinstall|preinstall/iu.test(text)) {
    return 'lifecycle-failed';
  }
  if (/ENOTFOUND|ECONN|network|socket|proxy|certificate/iu.test(text)) {
    return 'registry-unavailable';
  }
  return 'operation-failed';
}

function publicError(error) {
  const code = typeof error?.code === 'string'
    ? error.code
    : error instanceof TypeError
      ? 'INVALID_INPUT'
      : 'OPERATION_FAILED';
  const rawDetails = [
    error?.message,
    error?.details?.stderr,
    error?.details?.stdout,
  ].filter(Boolean).join('\n');
  const technicalDetails = redactProcessOutput(rawDetails, 4_000);
  return {
    code,
    message: redactProcessOutput(error?.message ?? error, 500),
    category: errorCategory(code, rawDetails),
    ...(technicalDetails ? { technicalDetails } : {}),
    details: {},
  };
}

function removesPackage(action) {
  return action === 'remove' || action === 'undo-add';
}

function isUndo(action) {
  return action.startsWith('undo-');
}

function publicObserved(plugin, state) {
  if (plugin) {
    return {
      packageName: plugin.packageName,
      version: plugin.version,
      health: plugin.health,
      activation: plugin.activation,
    };
  }
  return {
    packageName: state.packageName,
    version: state.version,
    health: state.exists ? 'unknown' : 'absent',
    activation: 'unknown',
  };
}

export class PluginManagerController {
  #service;
  #rollback;
  #now;
  #createToken;
  #approvals = new Map();
  #pending = new Map();
  #operation;
  #idlePromise = Promise.resolve();

  constructor({
    service,
    rollback,
    now = Date.now,
    createToken = () => randomBytes(24).toString('hex'),
  }) {
    this.#service = service;
    this.#rollback = rollback;
    this.#now = now;
    this.#createToken = createToken;
  }

  #isBusy() {
    return this.#operation?.status === 'running';
  }

  #assertAvailable() {
    if (this.#isBusy()) fail('OPERATION_BUSY', '已有插件操作正在执行');
  }

  async #pluginsWithRollback() {
    const [plugins, rollback] = await Promise.all([
      this.#service.listPlugins(),
      this.#rollback.read(),
    ]);
    const result = plugins.map((plugin) => {
      const rollbackVersion = rollback?.[plugin.packageName];
      const pendingRestart = this.#pending.get(plugin.packageName);
      return {
        ...plugin,
        ...(plugin.kind === 'external' && isExactSemver(rollbackVersion)
          ? { rollbackVersion }
          : {}),
        ...(pendingRestart ? { pendingRestart } : {}),
      };
    });
    for (const [packageName, pendingRestart] of this.#pending) {
      if (
        pendingRestart.action === 'remove'
        && !result.some((plugin) => plugin.packageName === packageName)
      ) {
        result.push({
          packageName,
          version: pendingRestart.previousVersion,
          kind: 'external',
          readOnly: false,
          health: 'removed',
          activation: 'unknown',
          entries: [],
          pendingRestart,
        });
      }
    }
    return result.sort((left, right) =>
      left.kind.localeCompare(right.kind)
      || left.packageName.localeCompare(right.packageName));
  }

  async #state() {
    return {
      plugins: await this.#pluginsWithRollback(),
      operation: this.#operation ? { ...this.#operation } : null,
      readAt: this.#now(),
    };
  }

  async #manageable(
    packageName,
    { allowBroken = true, allowPending = false } = {},
  ) {
    if (!allowPending && this.#pending.has(packageName)) {
      fail('RESTART_PENDING', `${packageName} 有尚待重启生效的变更`);
    }
    const plugin = (await this.#service.listPlugins())
      .find((item) => item.packageName === packageName);
    if (!plugin) fail('NOT_INSTALLED', `${packageName} 尚未安装`);
    if (plugin.kind !== 'external' || plugin.readOnly) {
      fail('READ_ONLY_PLUGIN', `${packageName} 由系统或工作区管理`);
    }
    if (!allowBroken && plugin.health !== 'ready') {
      fail('BROKEN_PLUGIN', `${packageName} 当前安装状态损坏`);
    }
    return plugin;
  }

  async #prepare(payload) {
    this.#assertAvailable();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      fail('INVALID_INPUT', '操作参数必须是对象');
    }

    let operation;
    let metadata;
    let beforeState;
    if (payload.action === 'add') {
      const parsed = parsePackageSpec(payload.spec);
      const existing = (await this.#service.listPlugins())
        .find((item) => item.packageName === parsed.packageName);
      beforeState = await this.#service.getPackageState(parsed.packageName);
      if (existing || beforeState.exists || this.#pending.has(parsed.packageName)) {
        fail(
          existing?.readOnly ? 'READ_ONLY_PLUGIN' : 'ALREADY_INSTALLED',
          `${parsed.packageName} 已存在于 Web Profile`,
        );
      }
      metadata = await this.#service.resolvePackage(payload.spec);
      operation = {
        action: 'add',
        packageName: parsed.packageName,
        targetVersion: metadata.version,
      };
    } else if (payload.action === 'remove') {
      const packageName = packageNameOnly(payload.packageName);
      const current = await this.#manageable(packageName);
      beforeState = await this.#service.getPackageState(packageName);
      operation = {
        action: 'remove',
        packageName,
        currentVersion: current.version,
      };
    } else if (payload.action === 'change-version') {
      const packageName = packageNameOnly(payload.packageName);
      const current = await this.#manageable(packageName, { allowBroken: false });
      beforeState = await this.#service.getPackageState(packageName);
      metadata = await this.#service.resolvePackage(
        versionSpec(packageName, payload.targetVersion),
      );
      if (metadata.version === current.version) {
        fail('NO_VERSION_CHANGE', `${packageName} 已是目标版本`);
      }
      operation = {
        action: 'change-version',
        packageName,
        currentVersion: current.version,
        targetVersion: metadata.version,
      };
    } else if (payload.action === 'restore') {
      const packageName = packageNameOnly(payload.packageName);
      const current = await this.#manageable(packageName, { allowBroken: false });
      beforeState = await this.#service.getPackageState(packageName);
      const rollback = await this.#rollback.read();
      const previous = rollback?.[packageName];
      if (!isExactSemver(previous)) {
        fail('NO_ROLLBACK_VERSION', `${packageName} 没有可恢复版本`);
      }
      metadata = await this.#service.resolvePackage(
        versionSpec(packageName, previous),
      );
      operation = {
        action: 'restore',
        packageName,
        currentVersion: current.version,
        targetVersion: metadata.version,
      };
    } else if (payload.action === 'repair') {
      const packageName = packageNameOnly(payload.packageName);
      const current = await this.#manageable(packageName);
      if (current.health !== 'broken' || !isExactSemver(current.version)) {
        fail('REPAIR_NOT_AVAILABLE', `${packageName} 不需要或无法修复`);
      }
      beforeState = await this.#service.getPackageState(packageName);
      metadata = await this.#service.resolvePackage(
        versionSpec(packageName, current.version),
      );
      operation = {
        action: 'repair',
        packageName,
        currentVersion: current.version,
        targetVersion: metadata.version,
      };
    } else if (payload.action === 'undo') {
      const packageName = packageNameOnly(payload.packageName);
      const pending = this.#pending.get(packageName);
      if (!pending) {
        fail('NO_PENDING_CHANGE', `${packageName} 没有可撤销的待生效变更`);
      }
      if (pending.undoAvailable === false) {
        fail('NO_PENDING_UNDO', `${packageName} 的修复操作无法还原为损坏状态`);
      }
      beforeState = await this.#service.getPackageState(packageName);
      if (pending.action === 'add') {
        operation = {
          action: 'undo-add',
          packageName,
          currentVersion: pending.targetVersion,
        };
      } else {
        metadata = await this.#service.resolvePackage(
          versionSpec(packageName, pending.previousVersion),
        );
        operation = {
          action: pending.action === 'remove' ? 'undo-remove' : 'undo-change',
          packageName,
          currentVersion: pending.targetVersion,
          targetVersion: metadata.version,
        };
      }
    } else {
      fail('INVALID_ACTION', '不支持此插件操作');
    }

    const fingerprint = operationFingerprint(operation);
    const approvalToken = this.#createToken();
    const expiresAt = this.#now() + APPROVAL_TTL_MS;
    this.#approvals.set(approvalToken, {
      operation,
      beforeState,
      fingerprint,
      expiresAt,
    });
    return {
      approvalToken,
      expiresAt,
      operation: {
        ...operation,
        fingerprint,
        ...(metadata ? { metadata } : {}),
      },
    };
  }

  async #verify(operation) {
    const [plugins, state] = await Promise.all([
      this.#service.listPlugins(),
      this.#service.getPackageState(operation.packageName),
    ]);
    const installed = plugins.find((item) =>
      item.packageName === operation.packageName);
    if (removesPackage(operation.action)) {
      if (installed || state.exists || state.bundleRegistered) {
        fail('STATE_MISMATCH', '卸载后包或 Bundle 注册仍在 Web Profile 中');
      }
      return;
    }
    const plugin = installed?.kind === 'external' ? installed : undefined;
    if (
      !plugin
      || plugin.health !== 'ready'
      || plugin.version !== operation.targetVersion
      || !state.exists
      || !state.bundleRegistered
    ) {
      fail('STATE_MISMATCH', 'CLI 完成后实际插件状态与目标不一致');
    }
  }

  async #matchesSnapshot(packageName, snapshot) {
    const [plugins, state] = await Promise.all([
      this.#service.listPlugins(),
      this.#service.getPackageState(packageName),
    ]);
    if (!snapshot.exists) {
      return !state.exists
        && !state.bundleRegistered
        && !plugins.some((plugin) => plugin.packageName === packageName);
    }
    if (
      !state.exists
      || state.bundleRegistered !== snapshot.bundleRegistered
      || state.version !== snapshot.version
    ) {
      return false;
    }
    if (!snapshot.bundleRegistered) return true;
    const plugin = plugins.find((item) => item.packageName === packageName);
    return plugin?.kind === 'external' && plugin.health === 'ready';
  }

  async #compensate(operation, beforeState) {
    if (await this.#matchesSnapshot(operation.packageName, beforeState)) {
      return { status: 'not-needed' };
    }
    if (operation.action === 'remove' || operation.action === 'repair') {
      return { status: 'not-available' };
    }
    if (beforeState.exists) {
      if (!isExactSemver(beforeState.version)) {
        fail('ROLLBACK_UNAVAILABLE', '无法确定操作前的精确版本');
      }
      await this.#service.runMutation({
        action: 'compensate',
        packageName: operation.packageName,
        targetVersion: beforeState.version,
      });
    } else {
      await this.#service.runMutation({
        action: 'compensate-remove',
        packageName: operation.packageName,
      });
    }
    if (!await this.#matchesSnapshot(operation.packageName, beforeState)) {
      fail('STATE_MISMATCH', '自动恢复后实际插件状态仍与操作前不一致');
    }
    return {
      status: 'completed',
      ...(beforeState.version ? { targetVersion: beforeState.version } : {}),
    };
  }

  async #saveRollback(operation) {
    const current = await this.#rollback.read();
    const next = { ...current };
    if (operation.action === 'remove' || isUndo(operation.action)) {
      delete next[operation.packageName];
    } else if (
      operation.action === 'change-version'
      || operation.action === 'restore'
    ) {
      next[operation.packageName] = operation.currentVersion;
    }
    await this.#rollback.write(next);
  }

  #recordPending(operation) {
    if (isUndo(operation.action)) {
      this.#pending.delete(operation.packageName);
      return;
    }
    this.#pending.set(operation.packageName, {
      action: operation.action,
      ...(['remove', 'repair'].includes(operation.action)
        ? { undoAvailable: false }
        : {}),
      ...(operation.currentVersion
        ? { previousVersion: operation.currentVersion }
        : {}),
      ...(operation.targetVersion
        ? { targetVersion: operation.targetVersion }
        : {}),
    });
  }

  async #perform(operation, beforeState) {
    try {
      this.#operation = { ...this.#operation, stage: 'install' };
      await this.#service.runMutation(operation);
      this.#operation = { ...this.#operation, stage: 'verify' };
      await this.#verify(operation);
      let warning;
      try {
        await this.#saveRollback(operation);
      } catch {
        warning = 'ROLLBACK_STATE_NOT_SAVED';
      }
      this.#recordPending(operation);
      this.#operation = {
        ...this.#operation,
        status: 'completed',
        stage: 'completed',
        finishedAt: this.#now(),
        restartRequired: true,
        ...(warning ? { warning } : {}),
      };
    } catch (error) {
      const failure = publicError(error);
      this.#operation = { ...this.#operation, stage: 'rollback' };
      let rollback;
      let rollbackError;
      try {
        rollback = await this.#compensate(operation, beforeState);
      } catch (compensationFailure) {
        rollback = { status: 'failed' };
        rollbackError = publicError(compensationFailure);
      }
      const [plugins, state] = await Promise.all([
        this.#service.listPlugins().catch(() => []),
        this.#service.getPackageState(operation.packageName).catch(() => ({
          packageName: operation.packageName,
          exists: false,
          bundleRegistered: false,
        })),
      ]);
      const observedPlugin = plugins.find((plugin) =>
        plugin.packageName === operation.packageName);
      this.#operation = {
        ...this.#operation,
        status: 'failed',
        stage: 'failed',
        finishedAt: this.#now(),
        restartRequired: false,
        error: failure,
        rollback,
        ...(rollbackError ? { rollbackError } : {}),
        observed: publicObserved(observedPlugin, {
          packageName: operation.packageName,
          ...state,
        }),
      };
    }
  }

  async #execute(payload) {
    this.#assertAvailable();
    const token = payload?.approvalToken;
    const approval = typeof token === 'string'
      ? this.#approvals.get(token)
      : undefined;
    if (!approval || approval.expiresAt < this.#now()) {
      if (typeof token === 'string') this.#approvals.delete(token);
      fail('APPROVAL_REQUIRED', '操作确认无效或已经过期');
    }
    this.#approvals.delete(token);
    this.#operation = {
      id: `${this.#now()}-${approval.fingerprint.slice(0, 12)}`,
      ...approval.operation,
      fingerprint: approval.fingerprint,
      status: 'running',
      stage: 'validate',
      startedAt: this.#now(),
    };
    this.#idlePromise = this.#perform(
      approval.operation,
      approval.beforeState,
    );
    return { operation: { ...this.#operation } };
  }

  async #checkUpdate(payload) {
    this.#assertAvailable();
    const packageName = packageNameOnly(payload?.packageName);
    const current = await this.#manageable(packageName, { allowBroken: false });
    const metadata = await this.#service.resolvePackage(
      versionSpec(packageName, 'latest'),
    );
    return {
      packageName,
      currentVersion: current.version,
      targetVersion: metadata.version,
      updateAvailable: current.version !== metadata.version,
      metadata,
    };
  }

  async handle(endpoint, payload) {
    try {
      let value;
      if (endpoint === 'list') value = await this.#state();
      else if (endpoint === 'prepare') value = await this.#prepare(payload);
      else if (endpoint === 'execute') value = await this.#execute(payload);
      else if (endpoint === 'check-update') value = await this.#checkUpdate(payload);
      else fail('UNKNOWN_ENDPOINT', '未知 RPC endpoint');
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  }

  waitForIdle() {
    return this.#idlePromise;
  }
}
