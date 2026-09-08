import { createHash, randomUUID } from 'node:crypto';

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
  const existingRef = existingRefs.get(path);
  const ref = existingRef ?? credentialRefFor(id, path);
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

function approvalBinding(action, instance, writes, removals, expectedRevision) {
  const credentialChanges = writes
    .map(([ref, value]) => [
      ref,
      createHash('sha256').update(value).digest('hex'),
    ])
    .sort(([left], [right]) => left.localeCompare(right));
  return createHash('sha256')
    .update(JSON.stringify({
      action,
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

  async sync(input) {
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
      for (const [ref, value] of writes) await this.#credentials.set(ref, value);
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

  async update({
    instance: input,
    secrets = {},
    clears = {},
    expectedRevision,
    confirmationToken,
  }) {
    assertExpectedRevision(expectedRevision);
    const document = await this.#document();
    const existing = document.instances.find((instance) => instance.id === input.id);
    if (!existing) {
      const error = new Error(`mcp-manager: 找不到实例 ${input.id}`);
      error.code = 'NOT_FOUND';
      throw error;
    }
    const { instance, writes, removals } = materializeInstance(
      input,
      existing,
      secrets,
      clears,
    );
    assertUniqueServerName(document.instances, instance);
    const approvedFingerprint = instance.enabled
      ? this.#assertApproved({
        action: 'update',
        instance,
        writes,
        removals,
        expectedRevision,
        confirmationToken,
        storedFingerprint: document.approvals[instance.id],
        force: writes.length > 0 || removals.size > 0,
      })
      : undefined;
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
    if (approvedFingerprint) approvals[instance.id] = approvedFingerprint;
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
    if (instance.enabled) {
      try {
        const resolved = await this.#resolved(instance);
        await this.#runtime.upsert(instance, resolved.config, resolved.secrets);
      } catch {
        // 配置已成功持久化；运行错误由 runtime 状态返回。
      }
    } else {
      await this.#runtime.remove(instance.id);
    }
    return this.list();
  }

  async setEnabled({
    id,
    enabled,
    expectedRevision,
    confirmationToken,
  }) {
    assertExpectedRevision(expectedRevision);
    const document = await this.#document();
    const existing = document.instances.find((instance) => instance.id === id);
    if (!existing) {
      const error = new Error(`mcp-manager: 找不到实例 ${id}`);
      error.code = 'NOT_FOUND';
      throw error;
    }
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
    await this.#settings.write({
      instances: document.instances.map((item) => item.id === id ? instance : item),
      approvals,
    }, expectedRevision);
    if (enabled) {
      try {
        const resolved = await this.#resolved(instance);
        await this.#runtime.upsert(instance, resolved.config, resolved.secrets);
      } catch {
        // 配置保留，错误通过 status 暴露。
      }
    } else {
      await this.#runtime.remove(id);
    }
    return this.list();
  }

  async remove({ id, expectedRevision }) {
    assertExpectedRevision(expectedRevision);
    const document = await this.#document();
    const existing = document.instances.find((instance) => instance.id === id);
    if (!existing) return this.#public(document);
    await this.#runtime.remove(id);
    const refs = ownedCredentialRefs(existing);
    let rollback;
    try {
      rollback = await this.#mutateCredentials([], refs);
    } catch (error) {
      await this.#restartIfApproved(existing, document.approvals).catch(() => {});
      throw error;
    }
    const approvals = { ...document.approvals };
    delete approvals[id];
    try {
      await this.#settings.write({
        instances: document.instances.filter((instance) => instance.id !== id),
        approvals,
      }, expectedRevision);
    } catch (error) {
      try {
        await rollback();
      } finally {
        await this.#restartIfApproved(existing, document.approvals).catch(() => {});
      }
      throw error;
    }
    return this.list();
  }

  async reload({ id, expectedRevision, confirmationToken }) {
    assertExpectedRevision(expectedRevision);
    const document = await this.#document();
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
  }) {
    const document = await this.#document();
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
      expectedRevision: document.revision,
      confirmationToken,
      storedFingerprint: document.approvals[instance.id],
      force: writes.length > 0,
    });
    const overrides = new Map(writes);
    const resolvedSecrets = new Set();
    try {
      const result = await this.#probe(
        await this.#resolve(instance, overrides, resolvedSecrets),
      );
      return redactSensitiveData(result, resolvedSecrets);
    } catch (error) {
      const message = redactMessage(messageOf(error), resolvedSecrets);
      const wrapped = new Error(message);
      wrapped.code = 'TEST_FAILED';
      throw wrapped;
    }
  }

  async #dispatch(endpoint, payload) {
    if (endpoint === 'list') return this.list();
    if (endpoint === 'create') return this.create(payload);
    if (endpoint === 'update') return this.update(payload);
    if (endpoint === 'set-enabled') return this.setEnabled(payload);
    if (endpoint === 'delete') return this.remove(payload);
    if (endpoint === 'reload') return this.reload(payload);
    if (endpoint === 'test') return this.test(payload);
    if (endpoint === 'tools') return this.tools(payload);
    const error = new Error(`mcp-manager: 未知操作 ${endpoint}`);
    error.code = 'NOT_FOUND';
    throw error;
  }

  async handle(endpoint, payload) {
    try {
      const operation = () => this.#dispatch(endpoint, payload);
      let value;
      if (endpoint === 'list' || endpoint === 'tools') {
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
