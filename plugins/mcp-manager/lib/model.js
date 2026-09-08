import { createHash } from 'node:crypto';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/u;
const CREDENTIAL_REF = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const HEADER_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const SENSITIVE_NAME =
  /(?:api[-_]?key|access[-_]?key|private|credential|token|secret|password|authorization|auth)/iu;
const SAFE_LITERAL_HEADERS = new Set([
  'accept',
  'content-type',
  'mcp-protocol-version',
  'user-agent',
]);

function credentialOwner(id) {
  return id.replaceAll('-', '').toUpperCase();
}

export function credentialRefFor(id, path) {
  const field = createHash('sha256').update(path).digest('hex').slice(0, 12).toUpperCase();
  return `MCP_MANAGER_${credentialOwner(id)}_${field}`;
}

export function isOwnedCredentialRef(id, ref) {
  const prefix = `MCP_MANAGER_${credentialOwner(id)}_`;
  return ref.startsWith(prefix)
    && /^[0-9A-F]{12}$/u.test(ref.slice(prefix.length));
}

function fail(message) {
  throw new TypeError(`mcp-manager: ${message}`);
}

function expectObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} 必须是对象`);
  }
}

function expectString(value, label, { empty = false } = {}) {
  if (typeof value !== 'string' || (!empty && value.trim().length === 0)) {
    fail(`${label} 不能为空`);
  }
  return value;
}

function rejectUnknown(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} 不支持字段 ${key}`);
  }
}

function validateValue(value, label, ownerId) {
  expectObject(value, label);
  rejectUnknown(value, new Set(['kind', 'value', 'ref']), label);
  if (value.kind === 'literal') {
    return {
      kind: 'literal',
      value: expectString(value.value, `${label}.value`, { empty: true }),
    };
  }
  if (value.kind === 'credential') {
    if (typeof value.ref !== 'string' || !CREDENTIAL_REF.test(value.ref)) {
      fail(`${label}.credential ref 无效`);
    }
    if (!isOwnedCredentialRef(ownerId, value.ref)) {
      fail(`${label}.credential ref 不属于实例 ${ownerId}`);
    }
    return { kind: 'credential', ref: value.ref };
  }
  fail(`${label}.kind 必须是 literal 或 credential`);
}

function validateNamedValues(
  values,
  label,
  namePattern,
  ownerId,
  allowLiteral = () => true,
) {
  if (!Array.isArray(values)) fail(`${label} 必须是数组`);
  const names = new Set();
  return values.map((row, index) => {
    expectObject(row, `${label}[${index}]`);
    rejectUnknown(row, new Set(['name', 'value']), `${label}[${index}]`);
    const name = expectString(row.name, `${label}[${index}].name`);
    if (!namePattern.test(name)) fail(`${label}[${index}].name 无效`);
    if (names.has(name.toLowerCase())) fail(`${label} 包含重复名称 ${name}`);
    names.add(name.toLowerCase());
    const value = validateValue(row.value, `${label}[${index}].value`, ownerId);
    if (SENSITIVE_NAME.test(name) && value.kind !== 'credential') {
      fail(`${label}.${name} 必须使用凭据`);
    }
    if (value.kind === 'literal' && !allowLiteral(name)) {
      fail(`${label}.${name} 的值必须使用凭据`);
    }
    return {
      name,
      value,
    };
  });
}

function validateArgs(values, ownerId) {
  const args = values.map((value, index) =>
    validateValue(value, `args[${index}]`, ownerId));
  for (const [index, value] of args.entries()) {
    if (value.kind !== 'literal') continue;
    const assignment = value.value.match(/^(?:--?)?([^=]+)=(.*)$/u);
    if (assignment && SENSITIVE_NAME.test(assignment[1])) {
      fail(`args[${index}] 的敏感参数必须使用凭据`);
    }
    if (
      /^--?/u.test(value.value)
      && SENSITIVE_NAME.test(value.value.replace(/^--?/u, ''))
      && args[index + 1]?.kind !== 'credential'
    ) {
      fail(`args[${index + 1}] 的敏感参数值必须使用凭据`);
    }
    if (
      /^(?:--header|-H)$/iu.test(value.value)
      && args[index + 1]?.kind !== 'credential'
    ) {
      fail(`args[${index + 1}] 的 header 参数值必须使用凭据`);
    }
    if (/(?:authorization\s*:|(?:bearer|basic)\s+\S+)/iu.test(value.value)) {
      fail(`args[${index}] 不得包含明文认证信息`);
    }
  }
  return args;
}

function validateReconnect(value) {
  expectObject(value, 'reconnect');
  rejectUnknown(
    value,
    new Set(['enabled', 'initialDelayMs', 'maxDelayMs', 'maxAttempts']),
    'reconnect',
  );
  if (typeof value.enabled !== 'boolean') fail('reconnect.enabled 必须是布尔值');
  const result = { enabled: value.enabled };
  for (const key of ['initialDelayMs', 'maxDelayMs', 'maxAttempts']) {
    if (!Number.isInteger(value[key]) || value[key] <= 0) {
      fail(`reconnect.${key} 必须是正整数`);
    }
    result[key] = value[key];
  }
  if (result.maxDelayMs < result.initialDelayMs) {
    fail('reconnect.maxDelayMs 不得小于 initialDelayMs');
  }
  return result;
}

function validateCommon(instance) {
  if (typeof instance.id !== 'string' || !UUID.test(instance.id)) {
    fail('id 必须是 UUID');
  }
  const displayName = expectString(instance.displayName, 'displayName');
  if (displayName.length > 80) fail('displayName 不得超过 80 个字符');
  if (typeof instance.serverName !== 'string' || !SERVER_NAME.test(instance.serverName)) {
    fail('serverName 必须匹配 [A-Za-z0-9_-]{1,32}');
  }
  if (instance.serverName.includes('__')) {
    fail('serverName 不得包含连续下划线');
  }
  if (typeof instance.enabled !== 'boolean') fail('enabled 必须是布尔值');
  if (
    !Number.isInteger(instance.toolCallTimeoutMs)
    || instance.toolCallTimeoutMs < 1_000
    || instance.toolCallTimeoutMs > 3_600_000
  ) {
    fail('toolCallTimeoutMs 必须是 1000 到 3600000 之间的整数');
  }
  return {
    id: instance.id,
    displayName,
    serverName: instance.serverName,
    enabled: instance.enabled,
    transport: instance.transport,
    toolCallTimeoutMs: instance.toolCallTimeoutMs,
    reconnect: validateReconnect(instance.reconnect),
  };
}

export function validateInstance(input) {
  expectObject(input, 'instance');
  const common = validateCommon(input);
  if (input.transport === 'stdio') {
    rejectUnknown(
      input,
      new Set([
        'id',
        'displayName',
        'serverName',
        'enabled',
        'transport',
        'command',
        'args',
        'cwd',
        'env',
        'toolCallTimeoutMs',
        'reconnect',
      ]),
      'stdio instance',
    );
    if (!Array.isArray(input.args)) fail('args 必须是数组');
    return {
      ...common,
      transport: 'stdio',
      command: expectString(input.command, 'command'),
      args: validateArgs(input.args, common.id),
      cwd: expectString(input.cwd, 'cwd', { empty: true }),
      env: validateNamedValues(
        input.env,
        'env',
        ENV_NAME,
        common.id,
        () => false,
      ),
    };
  }
  if (input.transport === 'streamable-http') {
    rejectUnknown(
      input,
      new Set([
        'id',
        'displayName',
        'serverName',
        'enabled',
        'transport',
        'url',
        'headers',
        'toolCallTimeoutMs',
        'reconnect',
      ]),
      'streamable-http instance',
    );
    const urlValue = expectString(input.url, 'url');
    let url;
    try {
      url = new URL(urlValue);
    } catch {
      fail('url 无效');
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      fail('url 必须使用 http 或 https');
    }
    if (url.username || url.password) fail('url 不得包含凭据');
    if (url.search || url.hash) fail('url 不得包含查询参数或 fragment');
    const headers = validateNamedValues(
      input.headers,
      'headers',
      HEADER_NAME,
      common.id,
      (header) => SAFE_LITERAL_HEADERS.has(header.toLowerCase()),
    );
    for (const row of headers) {
      if (
        row.value.kind === 'credential'
        && row.name.toLowerCase() !== 'authorization'
      ) {
        fail(`headers.${row.name} 的凭据仅支持 Authorization header`);
      }
    }
    if (
      url.protocol === 'http:'
      && headers.some((row) => row.value.kind === 'credential')
    ) {
      fail('明文 HTTP 不得携带凭据');
    }
    return {
      ...common,
      transport: 'streamable-http',
      url: urlValue,
      headers,
    };
  }
  fail('transport 必须是 stdio 或 streamable-http');
}

function launchShape(instance) {
  const common = {
    serverName: instance.serverName,
    transport: instance.transport,
    toolCallTimeoutMs: instance.toolCallTimeoutMs,
    reconnect: instance.reconnect,
  };
  if (instance.transport === 'stdio') {
    return {
      ...common,
      command: instance.command,
      args: instance.args,
      cwd: instance.cwd,
      env: instance.env,
    };
  }
  return {
    ...common,
    url: instance.url,
    headers: instance.headers,
  };
}

export function launchFingerprint(instance) {
  return createHash('sha256')
    .update(JSON.stringify(launchShape(validateInstance(instance))))
    .digest('hex');
}

function redactValue(value, configured) {
  if (value.kind === 'literal') return { ...value };
  return {
    kind: 'credential',
    configured: configured.has(value.ref),
  };
}

export function redactInstance(instance, configured = new Set()) {
  const value = validateInstance(instance);
  if (value.transport === 'stdio') {
    return {
      ...value,
      args: value.args.map((item) => redactValue(item, configured)),
      env: value.env.map((row) => ({
        name: row.name,
        value: redactValue(row.value, configured),
      })),
    };
  }
  return {
    ...value,
    headers: value.headers.map((row) => ({
      name: row.name,
      value: redactValue(row.value, configured),
    })),
  };
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function redactMessage(message, secrets) {
  let redacted = message;
  const values = [...secrets]
    .filter((secret) => typeof secret === 'string' && secret.length > 0)
    .sort((left, right) => right.length - left.length);
  for (const secret of values) redacted = redacted.replaceAll(secret, '••••••');
  return redacted;
}

export function redactSensitiveData(value, secrets) {
  if (typeof value === 'string') return redactMessage(value, secrets);
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, secrets));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        redactMessage(key, secrets),
        redactSensitiveData(item, secrets),
      ]),
    );
  }
  return value;
}

function safeError(error, secrets) {
  const wrapped = new Error(redactMessage(messageOf(error), secrets));
  if (error?.code) wrapped.code = error.code;
  return wrapped;
}

function runtimeFingerprint(instance, resolvedConfig) {
  return createHash('sha256')
    .update(launchFingerprint(instance))
    .update('\0')
    .update(JSON.stringify(resolvedConfig))
    .digest('hex');
}

export class ManagedMcpRuntime {
  #children = new Map();
  #states = new Map();
  #startClient;
  #listTools;
  #tail = Promise.resolve();

  constructor({ startClient, listTools }) {
    this.#startClient = startClient;
    this.#listTools = listTools;
  }

  #enqueue(operation) {
    const result = this.#tail.then(operation, operation);
    this.#tail = result.catch(() => {});
    return result;
  }

  upsert(instance, resolvedConfig, secrets = new Set()) {
    return this.#enqueue(() => this.#upsert(instance, resolvedConfig, secrets));
  }

  async #upsert(instance, resolvedConfig, secrets) {
    const value = validateInstance(instance);
    if (!value.enabled) {
      await this.#remove(value.id);
      this.#states.set(value.id, { phase: 'disabled' });
      return;
    }
    const fingerprint = runtimeFingerprint(value, resolvedConfig);
    const current = this.#children.get(value.id);
    if (current?.fingerprint === fingerprint) return;
    if (current) {
      try {
        await current.child.dispose();
      } catch (error) {
        const safe = safeError(
          error,
          new Set([...current.secrets, ...secrets]),
        );
        this.#states.set(value.id, {
          phase: 'failed',
          lastError: safe.message,
        });
        throw safe;
      }
      this.#children.delete(value.id);
    }
    this.#states.set(value.id, { phase: 'starting' });
    try {
      const child = await this.#startClient(resolvedConfig);
      this.#children.set(value.id, {
        child,
        fingerprint,
        serverName: value.serverName,
        secrets: new Set(secrets),
      });
      this.#states.set(value.id, { phase: 'loaded' });
    } catch (error) {
      const safe = safeError(error, secrets);
      this.#states.set(value.id, {
        phase: 'failed',
        lastError: safe.message,
      });
      throw safe;
    }
  }

  remove(id) {
    return this.#enqueue(() => this.#remove(id));
  }

  fail(id, error, secrets = new Set()) {
    return this.#enqueue(() => this.#fail(id, error, secrets));
  }

  async #fail(id, error, secrets) {
    const current = this.#children.get(id);
    const knownSecrets = new Set([
      ...(current?.secrets ?? []),
      ...secrets,
    ]);
    let safe = safeError(error, knownSecrets);
    if (current) {
      try {
        await current.child.dispose();
        this.#children.delete(id);
      } catch (disposeError) {
        safe = safeError(disposeError, knownSecrets);
      }
    }
    this.#states.set(id, {
      phase: 'failed',
      lastError: safe.message,
    });
    return safe;
  }

  async #remove(id) {
    const current = this.#children.get(id);
    if (!current) return;
    try {
      await current.child.dispose();
      this.#children.delete(id);
      this.#states.delete(id);
    } catch (error) {
      const safe = safeError(error, current.secrets);
      this.#states.set(id, {
        phase: 'failed',
        lastError: safe.message,
      });
      throw safe;
    }
  }

  status(id) {
    const state = this.#states.get(id) ?? { phase: 'disabled' };
    const toolCount = this.tools(id).length;
    return {
      phase: state.phase,
      toolCount,
      lastError: state.lastError,
    };
  }

  tools(id) {
    const current = this.#children.get(id);
    const serverName = current?.serverName;
    if (!serverName) return [];
    const prefix = `mcp__${serverName}__`;
    return this.#listTools()
      .filter((tool) => tool.name.startsWith(prefix))
      .map((tool) => redactSensitiveData(tool, current.secrets));
  }

  async dispose() {
    const results = await Promise.allSettled(
      [...this.#children.keys()].map((id) => this.remove(id)),
    );
    const failures = results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, 'mcp-manager: 部分 MCP 实例释放失败');
    }
  }
}
