import { createHash, randomUUID } from 'node:crypto';

import { parseMcpImport } from './import-config.js';
import {
  credentialRefFor,
  isOwnedCredentialRef,
  launchFingerprint,
  redactInstance,
  redactSensitiveData,
  validateInstance,
} from './model.js';

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function credentialRefs(instance) {
  const values = instance.transport === 'stdio'
    ? [...instance.args, ...instance.env.map((row) => row.value)]
    : instance.headers.map((row) => row.value);
  return new Set(
    values
      .filter((value) => value.kind === 'credential')
      .map((value) => value.ref),
  );
}

function credentialRefsByPath(instance) {
  const refs = new Map();
  if (instance.transport === 'stdio') {
    instance.args.forEach((value, index) => {
      if (value.kind === 'credential') refs.set(`args.${index}`, value.ref);
    });
    instance.env.forEach((row) => {
      if (row.value.kind === 'credential') refs.set(`env.${row.name}`, row.value.ref);
    });
  } else {
    instance.headers.forEach((row) => {
      if (row.value.kind === 'credential') {
        refs.set(`headers.${row.name}`, row.value.ref);
      }
    });
  }
  return refs;
}

function ownedCredentialRefs(instance) {
  return new Set(
    [...credentialRefs(instance)]
      .filter((ref) => isOwnedCredentialRef(instance.id, ref)),
  );
}

function materializeValue(
  value,
  existingRefs,
  id,
  path,
  secrets,
  clears,
  writes,
  removals,
) {
  if (!value || typeof value !== 'object') {
    throw new TypeError(`mcp-manager: ${path} 必须是值对象`);
  }
  if (value.kind === 'literal') {
    return { kind: 'literal', value: value.value };
  }
  if (value.kind !== 'credential') {
    throw new TypeError(`mcp-manager: ${path}.kind 必须是 literal 或 credential`);
  }
  if (value.ref !== undefined) {
    throw new TypeError(`mcp-manager: ${path} 不得提交 credential ref`);
  }
  const sourcePath = value.sourcePath ?? path;
  if (typeof sourcePath !== 'string' || sourcePath.length === 0) {
    throw new TypeError(`mcp-manager: ${path}.sourcePath 无效`);
  }
  const existingRef = existingRefs.get(sourcePath);
  if (value.sourcePath !== undefined && !existingRef) {
    throw new TypeError(`mcp-manager: ${path}.sourcePath 不属于当前实例`);
  }
  if (existingRef) existingRefs.delete(sourcePath);
  const moved = Boolean(existingRef && sourcePath !== path);
  const ref = moved
    ? credentialRefFor(id, `moved:${sourcePath}->${path}`)
    : existingRef ?? credentialRefFor(id, path);
  const secret = secrets[path];
  if (clears[path] && secret !== undefined) {
    throw new TypeError(`mcp-manager: ${path} 不能同时替换和清除凭据`);
  }
  if (clears[path]) {
    if (!existingRef) throw new TypeError(`mcp-manager: ${path} 没有可清除的凭据`);
    removals.add(ref);
    return { kind: 'credential', ref };
  }
  if (secret !== undefined) {
    if (typeof secret !== 'string' || secret.length === 0) {
      throw new TypeError(`mcp-manager: ${path} 的凭据不能为空`);
    }
    writes.push([ref, secret]);
  } else if (moved) {
    writes.push([ref, { copyFrom: existingRef }]);
  } else if (!existingRef) {
    throw new TypeError(`mcp-manager: ${path} 必须提供凭据`);
  }
  return { kind: 'credential', ref };
}

function materializeInstance(input, existing, secrets = {}, clears = {}) {
  const draft = structuredClone(input);
  const existingRefs = existing ? credentialRefsByPath(existing) : new Map();
  draft.__credentialWrites = [];
  draft.__credentialRemovals = new Set();
  if (draft.transport === 'stdio') {
    draft.args = (draft.args ?? []).map((value, index) =>
      materializeValue(
        value,
        existingRefs,
        draft.id,
        `args.${index}`,
        secrets,
        clears,
        draft.__credentialWrites,
        draft.__credentialRemovals,
      ));
    draft.env = (draft.env ?? []).map((row) => ({
      name: row.name,
      value: materializeValue(
        row.value,
        existingRefs,
        draft.id,
        `env.${row.name}`,
        secrets,
        clears,
        draft.__credentialWrites,
        draft.__credentialRemovals,
      ),
    }));
  } else if (draft.transport === 'streamable-http') {
    draft.headers = (draft.headers ?? []).map((row) => ({
      name: row.name,
      value: materializeValue(
        row.value,
        existingRefs,
        draft.id,
        `headers.${row.name}`,
        secrets,
        clears,
        draft.__credentialWrites,
        draft.__credentialRemovals,
      ),
    }));
  } else {
    // validateInstance reports the unsupported transport.
  }
  const writes = draft.__credentialWrites;
  const removals = draft.__credentialRemovals;
  delete draft.__credentialWrites;
  delete draft.__credentialRemovals;
  return { instance: validateInstance(draft), writes, removals };
}

function assertUniqueServerName(instances, candidate) {
  if (
    instances.some((instance) =>
      instance.id !== candidate.id
      && instance.serverName.toLowerCase() === candidate.serverName.toLowerCase())
  ) {
    throw new TypeError(`mcp-manager: serverName ${candidate.serverName} 重复`);
  }
}

function assertUniqueId(instances, candidate) {
  if (instances.some((instance) => instance.id === candidate.id)) {
    throw new TypeError(`mcp-manager: id ${candidate.id} 重复`);
  }
}

function requiresApproval(instance) {
  return instance.transport === 'stdio'
    || new URL(instance.url).protocol === 'http:'
    || credentialRefs(instance).size > 0;
}

function assertExpectedRevision(value) {
  if (!Number.isInteger(value) || value < 0) {
    const error = new TypeError('mcp-manager: expectedRevision 必须是非负整数');
    error.code = 'INVALID_REVISION';
    throw error;
  }
}

function assertCurrentRevision(document, expectedRevision) {
  if (document.revision === expectedRevision) return;
  const error = new Error('mcp-manager: settings revision 已变化，请刷新后重试');
  error.code = 'SETTINGS_CONFLICT';
  throw error;
}

function approvalBinding(action, instance, writes, removals, expectedRevision) {
  const credentialChanges = writes
    .map(([ref, value]) => [
      ref,
      typeof value === 'string'
        ? createHash('sha256').update(value).digest('hex')
        : `copy:${value.copyFrom}`,
    ])
    .sort(([left], [right]) => left.localeCompare(right));
  return createHash('sha256')
    .update(JSON.stringify({
      action,
      instanceId: instance.id,
      expectedRevision,
      launch: launchFingerprint(instance),
      credentialChanges,
      credentialRemovals: [...removals].sort(),
    }))
    .digest('hex');
}

function redactMessage(message, secrets) {
  let redacted = message;
  const values = [...secrets]
    .filter((secret) => typeof secret === 'string' && secret.length > 0)
    .sort((left, right) => right.length - left.length);
  for (const secret of values) redacted = redacted.replaceAll(secret, '••••••');
  return redacted;
}

export class McpManagerController {
  #settings;
  #credentials;
  #runtime;
  #probe;
  #idFactory;
  #challengeFactory;
  #now;
  #challenges = new Map();
  #operations = new Map();
  #knownIds = new Set();
  #tail = Promise.resolve();

  constructor({
    settings,
    credentials,
    runtime,
    probe,
    idFactory = randomUUID,
    challengeFactory = randomUUID,
    now = Date.now,
  }) {
    this.#settings = settings;
    this.#credentials = credentials;
    this.#runtime = runtime;
    this.#probe = probe;
    this.#idFactory = idFactory;
    this.#challengeFactory = challengeFactory;
    this.#now = now;
  }

  async #document() {
    const document = await this.#settings.read();
    return {
      revision: document.revision,
      instances: document.instances ?? [],
      approvals: document.approvals ?? {},
    };
  }

  async #public(document) {
    const refs = new Set();
    for (const instance of document.instances) {
      for (const ref of credentialRefs(instance)) refs.add(ref);
    }
    const configured = new Set();
    await Promise.all([...refs].map(async (ref) => {
      if (await this.#credentials.configured(ref)) configured.add(ref);
    }));
    return {
      revision: document.revision,
      instances: document.instances.map((instance) => ({
        ...redactInstance(instance, configured),
        status: this.#runtime.status(instance.id),
        isApproved:
          document.approvals[instance.id] === launchFingerprint(instance),
        requiresApproval: requiresApproval(instance),
      })),
    };
  }

  async list() {
    return this.#public(await this.#document());
  }

  async parseImport({ text }) {
    const document = await this.#document();
    const result = parseMcpImport(text, { idFactory: this.#idFactory });
    const existingNames = new Map(
      document.instances.map((instance) => [
        instance.serverName.toLowerCase(),
        instance.id,
      ]),
    );
    for (const entry of result.entries) {
      const conflictId = existingNames.get(entry.instance.serverName.toLowerCase());
      if (!conflictId) continue;
      entry.conflictId = conflictId;
      result.notices.push({
        level: 'blocking',
        code: 'SERVER_NAME_CONFLICT',
        path: `mcpServers.${entry.sourceName}.serverName`,
        message: `server name ${entry.instance.serverName} 已存在，请选择更新或重命名。`,
      });
    }
    return { revision: document.revision, ...result };
  }

  sync(input) {
    const operation = () => this.#sync(input);
    const result = this.#tail.then(operation, operation);
    this.#tail = result.catch(() => {});
    return result;
  }

  async #sync(input) {
    const document = input
      ? {
        instances: input.instances ?? [],
        approvals: input.approvals ?? {},
      }
      : await this.#document();
    const currentIds = new Set(document.instances.map((instance) => instance.id));
    for (const id of this.#knownIds) {
      if (!currentIds.has(id)) {
        try {
          await this.#runtime.remove(id);
        } catch {
          // 外部配置变化不能回滚；runtime 会保留可见错误。
        }
      }
    }
    for (const instance of document.instances) {
      try {
        if (instance.enabled) {
          if (
            requiresApproval(instance)
            && document.approvals[instance.id] !== launchFingerprint(instance)
          ) {
            await this.#runtime.remove(instance.id);
            continue;
          }
          const { config, secrets } = await this.#resolved(instance);
          await this.#runtime.upsert(instance, config, secrets);
        } else {
          await this.#runtime.remove(instance.id);
        }
      } catch {
        // 单个实例失败不阻止其他实例启动。
      }
    }
    this.#knownIds = currentIds;
  }

  async #resolve(instance, overrides = new Map(), resolvedSecrets = new Set()) {
    const resolve = async (value, path) => {
      if (value.kind === 'literal') return value.value;
      let secret;
      if (overrides.has(value.ref)) {
        secret = overrides.get(value.ref);
      } else {
        const credential = await this.#credentials.resolve(value.ref);
        if (!credential?.value) {
          throw new Error(`mcp-manager: ${path} 的凭据尚未配置`);
        }
        secret = credential.value;
      }
      resolvedSecrets.add(secret);
      return secret;
    };
    const common = {
      serverName: instance.serverName,
      transport: instance.transport,
      toolCallTimeoutMs: instance.toolCallTimeoutMs,
      failOnStartupError: true,
      reconnect: instance.reconnect,
    };
    if (instance.transport === 'stdio') {
      const args = [];
      for (const [index, value] of instance.args.entries()) {
        args.push(await resolve(value, `args[${index}]`));
      }
      const env = {};
      for (const row of instance.env) env[row.name] = await resolve(row.value, `env.${row.name}`);
      return {
        ...common,
        command: instance.command,
        args,
        cwd: instance.cwd,
        env,
      };
    }
    const headers = {};
    for (const row of instance.headers) {
      headers[row.name] = await resolve(row.value, `headers.${row.name}`);
    }
    return { ...common, url: instance.url, headers };
  }

  async #resolved(instance, overrides = new Map()) {
    const secrets = new Set();
    try {
      const config = await this.#resolve(instance, overrides, secrets);
      return { config, secrets };
    } catch (error) {
      if (this.#runtime.fail) {
        const safe = await this.#runtime.fail(instance.id, error, secrets);
        throw safe ?? error;
      }
      await this.#runtime.remove(instance.id);
      throw error;
    }
  }

  async #probeCandidate(instance, writes, operationId) {
    if (
      operationId !== undefined
      && (typeof operationId !== 'string' || operationId.length === 0)
    ) {
      throw new TypeError('mcp-manager: operationId 必须是非空字符串');
    }
    if (operationId && this.#operations.has(operationId)) {
      const error = new Error(`mcp-manager: 操作 ${operationId} 正在执行`);
      error.code = 'OPERATION_CONFLICT';
      throw error;
    }
    const abortController = new AbortController();
    if (operationId) this.#operations.set(operationId, abortController);
    const overrides = new Map();
    const resolvedSecrets = new Set();
    try {
      for (const [ref, write] of writes) {
        if (typeof write === 'string') {
          overrides.set(ref, write);
          continue;
        }
        const credential = await this.#credentials.resolve(write.copyFrom);
        if (!credential?.value) {
          throw new Error('mcp-manager: 要移动的凭据尚未配置');
        }
        overrides.set(ref, credential.value);
      }
      const config = await this.#resolve(instance, overrides, resolvedSecrets);
      const result = await this.#probe(config, {
        signal: abortController.signal,
      });
      return {
        config,
        secrets: resolvedSecrets,
        result: redactSensitiveData(result, resolvedSecrets),
      };
    } catch (error) {
      const wrapped = new Error(
        abortController.signal.aborted
          ? 'mcp-manager: 测试已取消'
          : redactMessage(messageOf(error), resolvedSecrets),
      );
      wrapped.code = abortController.signal.aborted
        ? 'TEST_CANCELLED'
        : 'TEST_FAILED';
      throw wrapped;
    } finally {
      if (
        operationId
        && this.#operations.get(operationId) === abortController
      ) {
        this.#operations.delete(operationId);
      }
    }
  }

  cancelTest({ operationId }) {
    if (typeof operationId !== 'string' || operationId.length === 0) {
      throw new TypeError('mcp-manager: operationId 必须是非空字符串');
    }
    const operation = this.#operations.get(operationId);
    if (!operation) return { cancelled: false };
    operation.abort();
    return { cancelled: true };
  }

  #assertApproved({
    action,
    instance,
    writes = [],
    removals = new Set(),
    expectedRevision,
    confirmationToken,
    storedFingerprint,
    force = false,
  }) {
    if (!requiresApproval(instance)) return undefined;
    const expected = launchFingerprint(instance);
    if (!force && storedFingerprint === expected) return expected;
    const binding = approvalBinding(
      action,
      instance,
      writes,
      removals,
      expectedRevision,
    );
    if (confirmationToken) {
      const challenge = this.#challenges.get(confirmationToken);
      this.#challenges.delete(confirmationToken);
      if (
        challenge
        && challenge.binding === binding
        && challenge.expiresAt >= this.#now()
      ) {
        return expected;
      }
    }
    for (const [token, challenge] of this.#challenges) {
      if (challenge.expiresAt < this.#now()) this.#challenges.delete(token);
    }
    if (this.#challenges.size >= 64) {
      this.#challenges.delete(this.#challenges.keys().next().value);
    }
    const token = this.#challengeFactory();
    this.#challenges.set(token, {
      binding,
      expiresAt: this.#now() + 60_000,
    });
    const error = new Error('mcp-manager: 启用或测试前需要执行确认');
    error.code = 'EXECUTION_APPROVAL_REQUIRED';
    error.confirmationToken = token;
    throw error;
  }

  async #credentialSnapshot(refs) {
    const snapshot = new Map();
    for (const ref of refs) {
      const credential = await this.#credentials.resolve(ref);
      snapshot.set(ref, credential?.value
        ? { configured: true, value: credential.value }
        : { configured: false });
    }
    return snapshot;
  }

  async #restoreCredentials(snapshot) {
    const failures = [];
    for (const [ref, previous] of snapshot) {
      try {
        if (previous.configured) {
          await this.#credentials.set(ref, previous.value);
        } else {
          await this.#credentials.unset(ref);
        }
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      const error = new AggregateError(failures, 'mcp-manager: 凭据回滚失败');
      error.code = 'CREDENTIAL_ROLLBACK_FAILED';
      throw error;
    }
  }

  async #mutateCredentials(writes, removals = new Set()) {
    const refs = new Set([
      ...writes.map(([ref]) => ref),
      ...removals,
    ]);
    const snapshot = await this.#credentialSnapshot(refs);
    try {
      for (const [ref, write] of writes) {
        let value = write;
        if (typeof write !== 'string') {
          const credential = await this.#credentials.resolve(write.copyFrom);
          if (!credential?.value) {
            throw new Error('mcp-manager: 要移动的凭据尚未配置');
          }
          value = credential.value;
        }
        await this.#credentials.set(ref, value);
      }
      for (const ref of removals) await this.#credentials.unset(ref);
    } catch (error) {
      try {
        await this.#restoreCredentials(snapshot);
      } catch (rollbackError) {
        rollbackError.cause = error;
        throw rollbackError;
      }
      throw error;
    }
    return () => this.#restoreCredentials(snapshot);
  }

  async #rollbackOrThrow(rollback, originalError) {
    try {
      await rollback();
    } catch (rollbackError) {
      rollbackError.cause = originalError;
      throw rollbackError;
    }
    throw originalError;
  }

  async #compensateOrThrow(operations, originalError) {
    const failures = [];
    for (const operation of operations) {
      try {
        await operation();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      const error = new AggregateError(
        failures,
        'mcp-manager: 操作失败且自动补偿未完成；请刷新并检查实例运行状态',
      );
      error.code = 'COMPENSATION_FAILED';
      error.cause = originalError;
      throw error;
    }
    throw originalError;
  }

  async #restartIfApproved(instance, approvals) {
    if (!instance.enabled) return;
    if (
      requiresApproval(instance)
      && approvals[instance.id] !== launchFingerprint(instance)
    ) return;
    const { config, secrets } = await this.#resolved(instance);
    await this.#runtime.upsert(instance, config, secrets);
  }

  async create({
    instance: input,
    secrets = {},
    clears = {},
    expectedRevision,
  }) {
    assertExpectedRevision(expectedRevision);
    const document = await this.#document();
    assertCurrentRevision(document, expectedRevision);
    const draft = { ...input, id: this.#idFactory(), enabled: false };
    const { instance, writes, removals } = materializeInstance(
      draft,
      undefined,
      secrets,
      clears,
    );
    if (removals.size > 0) {
      throw new TypeError('mcp-manager: 新实例没有可清除的凭据');
    }
    assertUniqueServerName(document.instances, instance);
    const rollback = await this.#mutateCredentials(writes);
    try {
      await this.#settings.write({
        instances: [...document.instances, instance],
        approvals: document.approvals,
      }, expectedRevision);
    } catch (error) {
      await this.#rollbackOrThrow(rollback, error);
    }
    return this.list();
  }

  async createMany({ entries, expectedRevision }) {
    assertExpectedRevision(expectedRevision);
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new TypeError('mcp-manager: entries 必须是非空数组');
    }
    const document = await this.#document();
    assertCurrentRevision(document, expectedRevision);
    const instances = [...document.instances];
    const writes = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') {
        throw new TypeError('mcp-manager: entry 必须是对象');
      }
      const draft = {
        ...entry.instance,
        id: this.#idFactory(),
        enabled: false,
      };
      const materialized = materializeInstance(
        draft,
        undefined,
        entry.secrets ?? {},
        entry.clears ?? {},
      );
      if (materialized.removals.size > 0) {
        throw new TypeError('mcp-manager: 新实例没有可清除的凭据');
      }
      assertUniqueId(instances, materialized.instance);
      assertUniqueServerName(instances, materialized.instance);
      instances.push(materialized.instance);
      writes.push(...materialized.writes);
    }
    const rollback = await this.#mutateCredentials(writes);
    try {
      await this.#settings.write({
        instances,
        approvals: document.approvals,
      }, expectedRevision);
    } catch (error) {
      await this.#rollbackOrThrow(rollback, error);
    }
    return this.list();
  }

  async createAndEnable({
    instance: input,
    secrets = {},
    clears = {},
    expectedRevision,
    confirmationToken,
    operationId,
  }) {
    assertExpectedRevision(expectedRevision);
    const document = await this.#document();
    assertCurrentRevision(document, expectedRevision);
    const draft = { ...input, enabled: true };
    const { instance, writes, removals } = materializeInstance(
      draft,
      undefined,
      secrets,
      clears,
    );
    if (removals.size > 0) {
      throw new TypeError('mcp-manager: 新实例没有可清除的凭据');
    }
    assertUniqueId(document.instances, instance);
    assertUniqueServerName(document.instances, instance);
    const approvedFingerprint = this.#assertApproved({
      action: 'create-and-enable',
      instance,
      writes,
      expectedRevision,
      confirmationToken,
      force: writes.length > 0,
    });
    const tested = await this.#probeCandidate(instance, writes, operationId);
    const approvals = { ...document.approvals };
    if (approvedFingerprint) approvals[instance.id] = approvedFingerprint;
    const rollback = await this.#mutateCredentials(writes);
    try {
      await this.#runtime.upsert(instance, tested.config, tested.secrets);
      await this.#settings.write({
        instances: [...document.instances, instance],
        approvals,
      }, expectedRevision);
    } catch (error) {
      await this.#compensateOrThrow([
        () => this.#runtime.remove(instance.id),
        rollback,
      ], error);
    }
    return {
      state: await this.list(),
      testResult: tested.result,
    };
  }

  async update({
    instance: input,
    secrets = {},
    clears = {},
    expectedRevision,
    confirmationToken,
    operationId,
  }) {
    assertExpectedRevision(expectedRevision);
    const document = await this.#document();
    assertCurrentRevision(document, expectedRevision);
    const existing = document.instances.find((instance) => instance.id === input.id);
    if (!existing) {
      const error = new Error(`mcp-manager: 找不到实例 ${input.id}`);
      error.code = 'NOT_FOUND';
      throw error;
    }
    if (existing.enabled) {
      const result = await this.#updateAndApply({
        instance: input,
        secrets,
        clears,
        expectedRevision,
        confirmationToken,
        operationId,
      }, 'update');
      return result.state;
    }
    const { instance, writes, removals } = materializeInstance(
      { ...input, enabled: false },
      existing,
      secrets,
      clears,
    );
    assertUniqueServerName(document.instances, instance);
    const nextInstances = document.instances.map((item) =>
      item.id === instance.id ? instance : item);
    const approvals = { ...document.approvals };
    const currentFingerprint = launchFingerprint(instance);
    if (
      writes.length > 0
      || removals.size > 0
      || approvals[instance.id] !== currentFingerprint
    ) {
      delete approvals[instance.id];
    }
    const oldRefs = ownedCredentialRefs(existing);
    const nextRefs = ownedCredentialRefs(instance);
    const removedRefs = new Set([...oldRefs].filter((ref) => !nextRefs.has(ref)));
    for (const ref of removals) removedRefs.add(ref);
    const rollback = await this.#mutateCredentials(writes, removedRefs);
    try {
      await this.#settings.write({ instances: nextInstances, approvals }, expectedRevision);
    } catch (error) {
      await this.#rollbackOrThrow(rollback, error);
    }
    await this.#runtime.remove(instance.id);
    return this.list();
  }

  async updateAndApply(payload) {
    return this.#updateAndApply(payload, 'update-and-apply');
  }

  async #updateAndApply({
    instance: input,
    secrets = {},
    clears = {},
    expectedRevision,
    confirmationToken,
    operationId,
  }, approvalAction) {
    assertExpectedRevision(expectedRevision);
    const document = await this.#document();
    assertCurrentRevision(document, expectedRevision);
    const existing = document.instances.find((instance) => instance.id === input.id);
    if (!existing) {
      const error = new Error(`mcp-manager: 找不到实例 ${input.id}`);
      error.code = 'NOT_FOUND';
      throw error;
    }
    if (!existing.enabled) {
      throw new TypeError('mcp-manager: 禁用实例请使用普通保存');
    }
    const { instance, writes, removals } = materializeInstance(
      { ...input, enabled: true },
      existing,
      secrets,
      clears,
    );
    if (removals.size > 0) {
      throw new TypeError('mcp-manager: 清除凭据后不能测试并应用');
    }
    assertUniqueServerName(document.instances, instance);
    const approvedFingerprint = this.#assertApproved({
      action: approvalAction,
      instance,
      writes,
      expectedRevision,
      confirmationToken,
      storedFingerprint: document.approvals[instance.id],
      force: writes.length > 0,
    });
    const previousSecrets = new Set();
    const previousConfig = await this.#resolve(
      existing,
      new Map(),
      previousSecrets,
    );
    const tested = await this.#probeCandidate(instance, writes, operationId);
    const nextInstances = document.instances.map((item) =>
      item.id === instance.id ? instance : item);
    const approvals = { ...document.approvals };
    if (approvedFingerprint) approvals[instance.id] = approvedFingerprint;
    const oldRefs = ownedCredentialRefs(existing);
    const nextRefs = ownedCredentialRefs(instance);
    const removedRefs = new Set([...oldRefs].filter((ref) => !nextRefs.has(ref)));
    const rollback = await this.#mutateCredentials(writes, removedRefs);
    try {
      await this.#runtime.upsert(instance, tested.config, tested.secrets);
      await this.#settings.write({
        instances: nextInstances,
        approvals,
      }, expectedRevision);
    } catch (error) {
      await this.#compensateOrThrow([
        () => this.#runtime.upsert(
          existing,
          previousConfig,
          previousSecrets,
        ),
        rollback,
      ], error);
    }
    return {
      state: await this.list(),
      testResult: tested.result,
    };
  }

  async setEnabled({
    id,
    enabled,
    expectedRevision,
    confirmationToken,
    operationId,
  }) {
    assertExpectedRevision(expectedRevision);
    const document = await this.#document();
    assertCurrentRevision(document, expectedRevision);
    const existing = document.instances.find((instance) => instance.id === id);
    if (!existing) {
      const error = new Error(`mcp-manager: 找不到实例 ${id}`);
      error.code = 'NOT_FOUND';
      throw error;
    }
    if (existing.enabled === enabled) return this.#public(document);
    const instance = { ...existing, enabled };
    const approvedFingerprint = enabled
      ? this.#assertApproved({
        action: 'set-enabled',
        instance,
        expectedRevision,
        confirmationToken,
        storedFingerprint: document.approvals[id],
      })
      : undefined;
    const approvals = { ...document.approvals };
    if (approvedFingerprint) approvals[id] = approvedFingerprint;
    if (enabled) {
      const tested = await this.#probeCandidate(instance, [], operationId);
      try {
        await this.#runtime.upsert(instance, tested.config, tested.secrets);
        await this.#settings.write({
          instances: document.instances.map((item) => item.id === id ? instance : item),
          approvals,
        }, expectedRevision);
      } catch (error) {
        await this.#compensateOrThrow([
          () => this.#runtime.remove(id),
        ], error);
      }
    } else {
      const previousSecrets = new Set();
      let previousConfig;
      try {
        previousConfig = await this.#resolve(
          existing,
          new Map(),
          previousSecrets,
        );
      } catch {
        // 缺失凭据的失败实例仍必须可以禁用。
      }
      await this.#runtime.remove(id);
      try {
        await this.#settings.write({
          instances: document.instances.map((item) => item.id === id ? instance : item),
          approvals,
        }, expectedRevision);
      } catch (error) {
        if (previousConfig) {
          await this.#compensateOrThrow([
            () => this.#runtime.upsert(existing, previousConfig, previousSecrets),
          ], error);
        }
        throw error;
      }
    }
    return this.list();
  }

  async remove({ id, expectedRevision }) {
    assertExpectedRevision(expectedRevision);
    const document = await this.#document();
    assertCurrentRevision(document, expectedRevision);
    const existing = document.instances.find((instance) => instance.id === id);
    if (!existing) return this.#public(document);
    await this.#runtime.remove(id);
    const refs = ownedCredentialRefs(existing);
    let rollback;
    try {
      rollback = await this.#mutateCredentials([], refs);
    } catch (error) {
      await this.#compensateOrThrow([
        () => this.#restartIfApproved(existing, document.approvals),
      ], error);
    }
    const approvals = { ...document.approvals };
    delete approvals[id];
    try {
      await this.#settings.write({
        instances: document.instances.filter((instance) => instance.id !== id),
        approvals,
      }, expectedRevision);
    } catch (error) {
      await this.#compensateOrThrow([
        rollback,
        () => this.#restartIfApproved(existing, document.approvals),
      ], error);
    }
    return this.list();
  }

  async reload({ id, expectedRevision, confirmationToken }) {
    assertExpectedRevision(expectedRevision);
    const document = await this.#document();
    assertCurrentRevision(document, expectedRevision);
    const instance = document.instances.find((item) => item.id === id);
    if (!instance) throw new Error(`mcp-manager: 找不到实例 ${id}`);
    if (!instance.enabled) throw new Error('mcp-manager: 禁用实例不能重载');
    const approvedFingerprint = this.#assertApproved({
      action: 'reload',
      instance,
      expectedRevision,
      confirmationToken,
      storedFingerprint: document.approvals[id],
    });
    if (approvedFingerprint && document.approvals[id] !== approvedFingerprint) {
      await this.#settings.write({
        instances: document.instances,
        approvals: {
          ...document.approvals,
          [id]: approvedFingerprint,
        },
      }, expectedRevision);
    }
    await this.#runtime.remove(id);
    const resolved = await this.#resolved(instance);
    await this.#runtime.upsert(instance, resolved.config, resolved.secrets);
    return this.list();
  }

  async tools({ id }) {
    return this.#runtime.tools(id);
  }

  async test({
    instance: input,
    secrets = {},
    clears = {},
    confirmationToken,
    operationId,
    expectedRevision,
  }) {
    const document = await this.#document();
    if (expectedRevision !== undefined) {
      assertExpectedRevision(expectedRevision);
      assertCurrentRevision(document, expectedRevision);
    }
    const existing = document.instances.find((instance) => instance.id === input.id);
    const { instance, writes, removals } = materializeInstance(
      input,
      existing,
      secrets,
      clears,
    );
    if (removals.size > 0) {
      throw new TypeError('mcp-manager: 清除凭据后不能测试连接');
    }
    assertUniqueServerName(document.instances, instance);
    this.#assertApproved({
      action: 'test',
      instance,
      writes,
      expectedRevision: expectedRevision ?? document.revision,
      confirmationToken,
      storedFingerprint: document.approvals[instance.id],
      force: writes.length > 0,
    });
    return (await this.#probeCandidate(instance, writes, operationId)).result;
  }

  async #dispatch(endpoint, payload) {
    if (endpoint === 'list') return this.list();
    if (endpoint === 'parse-import') return this.parseImport(payload);
    if (endpoint === 'create') return this.create(payload);
    if (endpoint === 'create-many') return this.createMany(payload);
    if (endpoint === 'create-and-enable') return this.createAndEnable(payload);
    if (endpoint === 'update') return this.update(payload);
    if (endpoint === 'update-and-apply') return this.updateAndApply(payload);
    if (endpoint === 'set-enabled') return this.setEnabled(payload);
    if (endpoint === 'delete') return this.remove(payload);
    if (endpoint === 'reload') return this.reload(payload);
    if (endpoint === 'test') return this.test(payload);
    if (endpoint === 'cancel-test') return this.cancelTest(payload);
    if (endpoint === 'tools') return this.tools(payload);
    const error = new Error(`mcp-manager: 未知操作 ${endpoint}`);
    error.code = 'NOT_FOUND';
    throw error;
  }

  async handle(endpoint, payload) {
    try {
      const operation = () => this.#dispatch(endpoint, payload);
      let value;
      if (
        endpoint === 'list'
        || endpoint === 'tools'
        || endpoint === 'parse-import'
        || endpoint === 'test'
        || endpoint === 'cancel-test'
      ) {
        value = await operation();
      } else {
        const result = this.#tail.then(operation, operation);
        this.#tail = result.catch(() => {});
        value = await result;
      }
      return { ok: true, value };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: error?.code ?? 'INTERNAL',
          message: messageOf(error),
          details: error?.confirmationToken
            ? { confirmationToken: error.confirmationToken }
            : {},
        },
      };
    }
  }
}
