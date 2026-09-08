import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ManagedMcpRuntime,
  credentialRefFor,
  launchFingerprint,
  redactInstance,
  validateInstance,
} from '../plugins/mcp-manager/lib/model.js';
import { McpManagerController } from '../plugins/mcp-manager/lib/controller.js';
import { createBoundedFetch } from '../plugins/mcp-manager/lib/index.js';

const ID = '018f0f40-7b0a-7b13-8f6a-29de7d24a671';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function stdio(overrides = {}) {
  return {
    id: ID,
    displayName: 'DBX',
    serverName: 'dbx',
    enabled: false,
    transport: 'stdio',
    command: 'node',
    args: [{ kind: 'literal', value: 'server.js' }],
    cwd: '',
    env: [],
    toolCallTimeoutMs: 60_000,
    reconnect: {
      enabled: true,
      initialDelayMs: 1_000,
      maxDelayMs: 30_000,
      maxAttempts: 10,
    },
    ...overrides,
  };
}

test('instance validation accepts complete stdio and HTTP configurations', () => {
  assert.deepEqual(validateInstance(stdio()), stdio());
  assert.equal(
    validateInstance({
      id: ID,
      displayName: 'Remote',
      serverName: 'remote',
      enabled: true,
      transport: 'streamable-http',
      url: 'https://mcp.example.com',
      headers: [
        {
          name: 'Authorization',
          value: {
            kind: 'credential',
            ref: credentialRefFor(ID, 'headers.Authorization'),
          },
        },
      ],
      toolCallTimeoutMs: 30_000,
      reconnect: {
        enabled: true,
        initialDelayMs: 1_000,
        maxDelayMs: 30_000,
        maxAttempts: 10,
      },
    }).transport,
    'streamable-http',
  );
});

test('probe fetch rejects redirects and limits bytes before SDK parsing', async () => {
  let requestInit;
  const boundedFetch = createBoundedFetch(async (_input, init) => {
    requestInit = init;
    return new Response(new Uint8Array([1, 2, 3, 4, 5]));
  }, 4);

  const response = await boundedFetch('https://example.com/mcp', {
    method: 'POST',
    redirect: 'follow',
  });
  assert.equal(requestInit.redirect, 'error');
  await assert.rejects(response.arrayBuffer(), /probe 响应超过安全上限/);
});

test('instance validation rejects incomplete, duplicate, and unsafe fields', () => {
  assert.throws(
    () => validateInstance(stdio({ command: '' })),
    /command.*不能为空/,
  );
  assert.throws(
    () => validateInstance(stdio({
      env: [
        {
          name: 'DUPLICATE',
          value: {
            kind: 'credential',
            ref: credentialRefFor(ID, 'env.DUPLICATE'),
          },
        },
        {
          name: 'DUPLICATE',
          value: {
            kind: 'credential',
            ref: credentialRefFor(ID, 'env.DUPLICATE'),
          },
        },
      ],
    })),
    /重复.*DUPLICATE/,
  );
  assert.throws(
    () => validateInstance(stdio({
      args: [{ kind: 'credential', ref: 'not a credential ref' }],
    })),
    /credential ref/,
  );
  assert.throws(
    () => validateInstance(stdio({
      args: [{
        kind: 'credential',
        ref: 'MCP_MANAGER_018F0F407B0A7B138F6A29DE7D24A672_0123456789AB',
      }],
    })),
    /不属于实例/,
  );
  assert.throws(
    () => validateInstance(stdio({ serverName: 'ambiguous__server' })),
    /连续下划线/,
  );
  assert.throws(
    () => validateInstance(stdio({ command: 'C:\tools' })),
    /控制字符/,
  );
  assert.throws(
    () => validateInstance(stdio({
      args: [{ kind: 'literal', value: 'C:\tools' }],
    })),
    /控制字符/,
  );
  assert.throws(
    () => validateInstance({
      id: ID,
      displayName: 'Bad remote',
      serverName: 'bad-remote',
      enabled: false,
      transport: 'streamable-http',
      url: 'file:///tmp/server',
      headers: [],
      toolCallTimeoutMs: 30_000,
      reconnect: {
        enabled: true,
        initialDelayMs: 1_000,
        maxDelayMs: 30_000,
        maxAttempts: 10,
      },
    }),
    /http 或 https/,
  );
  assert.throws(
    () => validateInstance(stdio({
      args: [
        { kind: 'literal', value: '--token' },
        { kind: 'literal', value: 'committed-secret' },
      ],
    })),
    /args\[1\].*凭据/,
  );
  assert.throws(
    () => validateInstance(stdio({
      args: [{ kind: 'literal', value: 'PRIVATE_VALUE=committed-secret' }],
    })),
    /敏感参数必须使用凭据/,
  );
  assert.throws(
    () => validateInstance({
      id: ID,
      displayName: 'Leaky remote',
      serverName: 'leaky',
      enabled: false,
      transport: 'streamable-http',
      url: 'https://user:password@example.com/mcp?token=secret',
      headers: [],
      toolCallTimeoutMs: 30_000,
      reconnect: {
        enabled: true,
        initialDelayMs: 1_000,
        maxDelayMs: 30_000,
        maxAttempts: 10,
      },
    }),
    /凭据/,
  );
  assert.throws(
    () => validateInstance({
      id: ID,
      displayName: 'Query remote',
      serverName: 'query',
      enabled: false,
      transport: 'streamable-http',
      url: 'https://example.com/mcp?key=value',
      headers: [],
      toolCallTimeoutMs: 30_000,
      reconnect: {
        enabled: true,
        initialDelayMs: 1_000,
        maxDelayMs: 30_000,
        maxAttempts: 10,
      },
    }),
    /查询参数/,
  );
});

test('instance validation permits non-sensitive env literals and HTTPS secret headers', () => {
  const local = validateInstance(stdio({
    env: [{
      name: 'LOG_LEVEL',
      value: { kind: 'literal', value: 'info' },
    }],
  }));
  assert.deepEqual(local.env[0].value, { kind: 'literal', value: 'info' });

  const remote = validateInstance({
    id: ID,
    displayName: 'Remote API key',
    serverName: 'remote-api-key',
    enabled: false,
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    headers: [{
      name: 'X-API-Key',
      value: {
        kind: 'credential',
        ref: credentialRefFor(ID, 'headers.X-API-Key'),
      },
    }, {
      name: 'X.Trace+Key',
      value: {
        kind: 'credential',
        ref: credentialRefFor(ID, 'headers.X.Trace+Key'),
      },
    }],
    toolCallTimeoutMs: 30_000,
    reconnect: {
      enabled: true,
      initialDelayMs: 1_000,
      maxDelayMs: 30_000,
      maxAttempts: 10,
    },
  });
  assert.equal(remote.headers[0].name, 'X-API-Key');
  assert.equal(remote.headers[1].name, 'X.Trace+Key');
});

test('launch approval fingerprint changes only when launch behavior changes', () => {
  const initial = stdio();
  assert.equal(
    launchFingerprint(initial),
    launchFingerprint({ ...initial, displayName: 'Renamed', enabled: true }),
  );
  assert.notEqual(
    launchFingerprint(initial),
    launchFingerprint({ ...initial, cwd: 'D:\\workspace' }),
  );
});

test('public instance redacts credential references and reports configured state', () => {
  const tokenRef = credentialRefFor(ID, 'args.1');
  const apiKeyRef = credentialRefFor(ID, 'env.API_KEY');
  const instance = stdio({
    args: [
      { kind: 'literal', value: '--token' },
      { kind: 'credential', ref: tokenRef },
    ],
    env: [
      {
        name: 'API_KEY',
        value: { kind: 'credential', ref: apiKeyRef },
      },
    ],
  });

  const publicValue = redactInstance(
    instance,
    new Set([tokenRef]),
  );

  assert.deepEqual(publicValue.args[1], {
    kind: 'credential',
    configured: true,
  });
  assert.deepEqual(publicValue.env[0].value, {
    kind: 'credential',
    configured: false,
  });
  assert.doesNotMatch(JSON.stringify(publicValue), /MCP_MANAGER_/u);
});

test('managed runtime starts, counts tools, reloads, and disposes child instances', async () => {
  const events = [];
  let tools = [];
  const runtime = new ManagedMcpRuntime({
    startClient: async (config) => {
      events.push(['start', config.serverName]);
      return {
        dispose: async () => events.push(['dispose', config.serverName]),
      };
    },
    listTools: () => tools,
  });
  const enabled = stdio({ enabled: true });

  await runtime.upsert(enabled, { ...enabled, args: ['server.js'], env: {} });
  tools = [
    { name: 'mcp__dbx__query', description: 'Query data' },
    { name: 'other' },
  ];
  assert.deepEqual(runtime.status(ID), {
    phase: 'loaded',
    toolCount: 1,
    lastError: undefined,
  });

  await runtime.upsert(
    { ...enabled, command: 'node-new' },
    { ...enabled, command: 'node-new', args: ['server.js'], env: {} },
  );
  await runtime.remove(ID);

  assert.deepEqual(events, [
    ['start', 'dbx'],
    ['dispose', 'dbx'],
    ['start', 'dbx'],
    ['dispose', 'dbx'],
  ]);
});

test('managed runtime keeps startup failures observable without a child instance', async () => {
  const runtime = new ManagedMcpRuntime({
    startClient: async () => {
      throw new Error('offline');
    },
    listTools: () => [],
  });

  await assert.rejects(
    runtime.upsert(stdio({ enabled: true }), stdio({ enabled: true })),
    /offline/,
  );
  assert.deepEqual(runtime.status(ID), {
    phase: 'failed',
    toolCount: 0,
    lastError: 'offline',
  });
  await runtime.remove(ID);
  assert.deepEqual(runtime.status(ID), {
    phase: 'disabled',
    toolCount: 0,
    lastError: undefined,
  });
});

test('managed runtime restarts for resolved credential changes and redacts startup errors', async () => {
  const events = [];
  const tools = [{
    name: 'mcp__dbx__inspect',
    description: 'uses old',
    parameters: { properties: { old: { const: 'old' } } },
  }];
  const runtime = new ManagedMcpRuntime({
    startClient: async (config) => {
      events.push(['start', config.env.API_KEY]);
      if (config.env.API_KEY === 'leaky-secret') {
        throw new Error(`server rejected ${config.env.API_KEY}`);
      }
      return { dispose: async () => events.push(['dispose']) };
    },
    listTools: () => tools,
  });
  const instance = stdio({ enabled: true });

  await runtime.upsert(
    instance,
    { serverName: 'dbx', env: { API_KEY: 'old' } },
    new Set(['old']),
  );
  assert.deepEqual(runtime.tools(ID), [{
    name: 'mcp__dbx__inspect',
    description: 'uses ••••••',
    parameters: { properties: { '••••••': { const: '••••••' } } },
  }]);
  await runtime.upsert(
    instance,
    { serverName: 'dbx', env: { API_KEY: 'new' } },
    new Set(['new']),
  );
  await assert.rejects(
    runtime.upsert(
      instance,
      { serverName: 'dbx', env: { API_KEY: 'leaky-secret' } },
      new Set(['leaky-secret']),
    ),
    (error) => !error.message.includes('leaky-secret'),
  );

  assert.deepEqual(events.slice(0, 4), [
    ['start', 'old'],
    ['dispose'],
    ['start', 'new'],
    ['dispose'],
  ]);
  assert.doesNotMatch(runtime.status(ID).lastError, /leaky-secret/);
});

test('managed runtime redacts old credentials from disposal errors', async () => {
  const runtime = new ManagedMcpRuntime({
    startClient: async () => ({
      dispose: async () => {
        throw new Error('dispose echoed old-secret');
      },
    }),
    listTools: () => [],
  });
  const instance = stdio({ enabled: true });
  await runtime.upsert(
    instance,
    { serverName: 'dbx', env: { API_KEY: 'old-secret' } },
    new Set(['old-secret']),
  );

  await assert.rejects(
    runtime.remove(ID),
    (error) => !error.message.includes('old-secret'),
  );
  assert.doesNotMatch(runtime.status(ID).lastError, /old-secret/);
});

test('controller persists redacted credentials, enforces revision and removes owned secrets', async () => {
  let document = { revision: 0, instances: [], approvals: {} };
  const secrets = new Map();
  const runtimeEvents = [];
  const runtime = {
    upsert: async (instance, config) => runtimeEvents.push(['upsert', instance.id, config]),
    remove: async (id) => runtimeEvents.push(['remove', id]),
    status: () => ({ phase: 'disabled', toolCount: 0, lastError: undefined }),
  };
  const controller = new McpManagerController({
    settings: {
      read: () => structuredClone(document),
      write: async (next, expectedRevision) => {
        if (expectedRevision !== document.revision) {
          const error = new Error('stale');
          error.code = 'SETTINGS_CONFLICT';
          throw error;
        }
        document = {
          ...structuredClone(next),
          revision: document.revision + 1,
        };
      },
    },
    credentials: {
      set: async (ref, value) => secrets.set(ref, value),
      unset: async (ref) => secrets.delete(ref),
      resolve: async (ref) => secrets.has(ref) ? { value: secrets.get(ref) } : undefined,
      configured: async (ref) => secrets.has(ref),
    },
    runtime,
    probe: async () => ({ latencyMs: 12, tools: [] }),
    idFactory: () => ID,
  });
  const draft = stdio({
    args: [
      { kind: 'literal', value: '--token' },
      { kind: 'credential' },
    ],
  });

  const created = await controller.create({
    instance: draft,
    secrets: { 'args.1': 'top-secret' },
    expectedRevision: 0,
  });

  assert.equal(created.instances[0].enabled, false);
  assert.equal(created.instances[0].args[1].configured, true);
  assert.equal(created.instances[0].args[1].value, undefined);
  assert.equal(secrets.size, 1);
  await assert.rejects(
    controller.create({
      instance: {
        ...stdio(),
        id: '018f0f40-7b0a-7b13-8f6a-29de7d24a672',
        serverName: 'dbx-two',
      },
      secrets: {},
      expectedRevision: 0,
    }),
    (error) => error.code === 'SETTINGS_CONFLICT',
  );

  await controller.remove({ id: ID, expectedRevision: 1 });

  assert.equal(secrets.size, 0);
  assert.equal(document.instances.length, 0);
  assert.deepEqual(runtimeEvents, [['remove', ID]]);
});

test('controller blocks duplicate server names and unapproved executable launches', async () => {
  let document = {
    revision: 3,
    instances: [stdio()],
    approvals: {},
  };
  const controller = new McpManagerController({
    settings: {
      read: () => structuredClone(document),
      write: async (next) => {
        document = { ...structuredClone(next), revision: document.revision + 1 };
      },
    },
    credentials: {
      set: async () => {},
      unset: async () => {},
      resolve: async () => undefined,
      configured: async () => false,
    },
    runtime: {
      upsert: async () => {},
      remove: async () => {},
      status: () => ({ phase: 'disabled', toolCount: 0, lastError: undefined }),
    },
    probe: async () => ({ latencyMs: 1, tools: [] }),
    idFactory: () => '018f0f40-7b0a-7b13-8f6a-29de7d24a673',
  });

  await assert.rejects(
    controller.create({
      instance: {
        ...stdio(),
        id: '018f0f40-7b0a-7b13-8f6a-29de7d24a672',
        displayName: 'Duplicate',
      },
      secrets: {},
      expectedRevision: 3,
    }),
    /serverName.*重复/,
  );

  let confirmationToken;
  await assert.rejects(
    controller.setEnabled({
      id: ID,
      enabled: true,
      expectedRevision: 3,
    }),
    (error) => {
      confirmationToken = error.confirmationToken;
      return error.code === 'EXECUTION_APPROVAL_REQUIRED'
        && typeof confirmationToken === 'string';
    },
  );

  const fingerprint = launchFingerprint(stdio());
  await controller.setEnabled({
    id: ID,
    enabled: true,
    expectedRevision: 3,
    confirmationToken,
  });
  assert.equal(document.instances[0].enabled, true);
  assert.equal(document.approvals[ID], fingerprint);
});

test('controller enforces stored approvals during sync and reload', async () => {
  const instance = stdio({ enabled: true });
  const fingerprint = launchFingerprint(instance);
  let document = { revision: 0, instances: [instance], approvals: {} };
  const events = [];
  const controller = new McpManagerController({
    settings: {
      read: () => structuredClone(document),
      write: async (next, expectedRevision) => {
        assert.equal(expectedRevision, document.revision);
        document = { ...structuredClone(next), revision: document.revision + 1 };
      },
    },
    credentials: {
      set: async () => {},
      unset: async () => {},
      resolve: async () => undefined,
      configured: async () => false,
    },
    runtime: {
      upsert: async () => events.push('upsert'),
      remove: async () => events.push('remove'),
      status: () => ({ phase: 'disabled', toolCount: 0, lastError: undefined }),
    },
    probe: async () => ({ latencyMs: 1, tools: [] }),
  });

  await controller.sync();
  assert.deepEqual(events, ['remove']);
  let confirmationToken;
  await assert.rejects(
    controller.reload({ id: ID, expectedRevision: 0 }),
    (error) => {
      confirmationToken = error.confirmationToken;
      return error.code === 'EXECUTION_APPROVAL_REQUIRED';
    },
  );

  await controller.reload({
    id: ID,
    expectedRevision: 0,
    confirmationToken,
  });
  assert.equal(document.approvals[ID], fingerprint);
  assert.deepEqual(events, ['remove', 'remove', 'upsert']);
});

test('controller rolls back credential updates when settings persistence conflicts', async () => {
  const ref = credentialRefFor(ID, 'args.1');
  const instance = stdio({
    args: [
      { kind: 'literal', value: '--token' },
      { kind: 'credential', ref },
    ],
  });
  const document = { revision: 1, instances: [instance], approvals: {} };
  const secrets = new Map([[ref, 'old-secret']]);
  const controller = new McpManagerController({
    settings: {
      read: () => structuredClone(document),
      write: async () => {
        const error = new Error('stale');
        error.code = 'SETTINGS_CONFLICT';
        throw error;
      },
    },
    credentials: {
      set: async (key, value) => secrets.set(key, value),
      unset: async (key) => secrets.delete(key),
      resolve: async (key) => secrets.has(key) ? { value: secrets.get(key) } : undefined,
      configured: async (key) => secrets.has(key),
    },
    runtime: {
      upsert: async () => {},
      remove: async () => {},
      status: () => ({ phase: 'disabled', toolCount: 0, lastError: undefined }),
    },
    probe: async () => ({ latencyMs: 1, tools: [] }),
  });

  await assert.rejects(
    controller.update({
      instance: {
        ...instance,
        args: [
          { kind: 'literal', value: '--token' },
          { kind: 'credential' },
        ],
      },
      secrets: { 'args.1': 'new-secret' },
      expectedRevision: 0,
    }),
    (error) => error.code === 'SETTINGS_CONFLICT',
  );
  assert.equal(secrets.get(ref), 'old-secret');
});

test('controller requires fresh approval when an enabled launch credential changes', async () => {
  const ref = credentialRefFor(ID, 'args.1');
  const instance = stdio({
    enabled: true,
    args: [
      { kind: 'literal', value: '--token' },
      { kind: 'credential', ref },
    ],
  });
  const fingerprint = launchFingerprint(instance);
  const controller = new McpManagerController({
    settings: {
      read: () => ({
        revision: 0,
        instances: [instance],
        approvals: { [ID]: fingerprint },
      }),
      write: async () => {
        throw new Error('should require approval before writing');
      },
    },
    credentials: {
      set: async () => {},
      unset: async () => {},
      resolve: async () => ({ value: 'old-secret' }),
      configured: async () => true,
    },
    runtime: {
      upsert: async () => {},
      remove: async () => {},
      status: () => ({ phase: 'loaded', toolCount: 0, lastError: undefined }),
    },
    probe: async () => ({ latencyMs: 1, tools: [] }),
  });

  await assert.rejects(
    controller.update({
      instance: {
        ...instance,
        args: [
          { kind: 'literal', value: '--token' },
          { kind: 'credential' },
        ],
      },
      secrets: { 'args.1': 'new-secret' },
      expectedRevision: 0,
    }),
    (error) => error.code === 'EXECUTION_APPROVAL_REQUIRED',
  );
});

test('controller redacts stored credentials from successful and failed probes', async () => {
  const ref = credentialRefFor(ID, 'args.1');
  let probeFails = false;
  const instance = stdio({
    args: [
      { kind: 'literal', value: '--token' },
      { kind: 'credential', ref },
    ],
  });
  const controller = new McpManagerController({
    settings: {
      read: () => ({ revision: 0, instances: [instance], approvals: {} }),
      write: async () => {},
    },
    credentials: {
      set: async () => {},
      unset: async () => {},
      resolve: async () => ({ value: 'stored-secret' }),
      configured: async () => true,
    },
    runtime: {
      upsert: async () => {},
      remove: async () => {},
      status: () => ({ phase: 'disabled', toolCount: 0, lastError: undefined }),
    },
    probe: async () => {
      if (probeFails) throw new Error('server echoed stored-secret');
      return {
        latencyMs: 1,
        tools: [{
          name: 'inspect',
          description: 'server echoed stored-secret',
          inputSchema: {
            properties: {
              'stored-secret': { const: 'stored-secret' },
            },
          },
        }],
      };
    },
  });

  const input = {
    ...instance,
    args: [
      { kind: 'literal', value: '--token' },
      { kind: 'credential' },
    ],
  };
  const challenge = await controller.handle('test', {
    instance: input,
    secrets: {},
  });
  assert.equal(challenge.ok, false);
  assert.equal(challenge.error.code, 'EXECUTION_APPROVAL_REQUIRED');
  assert.doesNotMatch(JSON.stringify(challenge), /MCP_MANAGER_|approvalFingerprint/u);

  const success = await controller.handle('test', {
    instance: input,
    secrets: {},
    confirmationToken: challenge.error.details.confirmationToken,
  });
  assert.equal(success.ok, true);
  assert.doesNotMatch(JSON.stringify(success.value), /stored-secret/);

  probeFails = true;
  const failedChallenge = await controller.handle('test', {
    instance: input,
    secrets: {},
  });
  const failure = await controller.handle('test', {
    instance: input,
    secrets: {},
    confirmationToken: failedChallenge.error.details.confirmationToken,
  });
  assert.equal(failure.ok, false);
  assert.doesNotMatch(failure.error.message, /stored-secret/);
});

test('controller stops a stale child and reports credential resolution failures', async () => {
  const ref = credentialRefFor(ID, 'args.1');
  const instance = stdio({
    enabled: true,
    args: [
      { kind: 'literal', value: '--token' },
      { kind: 'credential', ref },
    ],
  });
  const events = [];
  const controller = new McpManagerController({
    settings: {
      read: () => ({
        revision: 0,
        instances: [instance],
        approvals: { [ID]: launchFingerprint(instance) },
      }),
      write: async () => {},
    },
    credentials: {
      set: async () => {},
      unset: async () => {},
      resolve: async () => undefined,
      configured: async () => false,
    },
    runtime: {
      upsert: async () => events.push('upsert'),
      remove: async () => events.push('remove'),
      fail: async (id, error) => events.push(['fail', id, error.message]),
      status: () => ({ phase: 'loaded', toolCount: 1, lastError: undefined }),
    },
    probe: async () => ({ latencyMs: 1, tools: [] }),
  });

  await controller.sync();
  assert.deepEqual(events, [
    ['fail', ID, 'mcp-manager: args[1] 的凭据尚未配置'],
  ]);
});

test('controller keeps a deletable instance when credential cleanup fails', async () => {
  const ref = credentialRefFor(ID, 'args.1');
  const instance = stdio({
    args: [
      { kind: 'literal', value: '--token' },
      { kind: 'credential', ref },
    ],
  });
  const document = { revision: 0, instances: [instance], approvals: {} };
  let writes = 0;
  const controller = new McpManagerController({
    settings: {
      read: () => structuredClone(document),
      write: async () => { writes += 1; },
    },
    credentials: {
      set: async () => {},
      unset: async () => { throw new Error('credential store unavailable'); },
      resolve: async () => ({ value: 'stored-secret' }),
      configured: async () => true,
    },
    runtime: {
      upsert: async () => {},
      remove: async () => {},
      status: () => ({ phase: 'disabled', toolCount: 0, lastError: undefined }),
    },
    probe: async () => ({ latencyMs: 1, tools: [] }),
  });

  await assert.rejects(
    controller.remove({ id: ID, expectedRevision: 0 }),
    /credential store unavailable/,
  );
  assert.equal(writes, 0);
  assert.equal(document.instances.length, 1);
});

test('controller requires revisions and binds confirmation challenges to one action', async () => {
  let document = { revision: 0, instances: [stdio()], approvals: {} };
  const controller = new McpManagerController({
    settings: {
      read: () => structuredClone(document),
      write: async (next) => {
        document = { ...structuredClone(next), revision: document.revision + 1 };
      },
    },
    credentials: {
      set: async () => {},
      unset: async () => {},
      resolve: async () => undefined,
      configured: async () => false,
    },
    runtime: {
      upsert: async () => {},
      remove: async () => {},
      status: () => ({ phase: 'disabled', toolCount: 0, lastError: undefined }),
    },
    probe: async () => ({ latencyMs: 1, tools: [] }),
    challengeFactory: () => `challenge-${Math.random()}`,
  });

  await assert.rejects(
    controller.setEnabled({ id: ID, enabled: false }),
    (error) => error.code === 'INVALID_REVISION',
  );

  let setEnabledToken;
  await assert.rejects(
    controller.setEnabled({ id: ID, enabled: true, expectedRevision: 0 }),
    (error) => {
      setEnabledToken = error.confirmationToken;
      return error.code === 'EXECUTION_APPROVAL_REQUIRED';
    },
  );
  await assert.rejects(
    controller.test({
      instance: stdio(),
      confirmationToken: setEnabledToken,
    }),
    (error) => error.code === 'EXECUTION_APPROVAL_REQUIRED',
  );
  await assert.rejects(
    controller.setEnabled({
      id: ID,
      enabled: true,
      expectedRevision: 0,
      confirmationToken: setEnabledToken,
    }),
    (error) => error.code === 'EXECUTION_APPROVAL_REQUIRED',
  );
});

test('controller hides credential refs and gates reuse against a new HTTPS origin', async () => {
  const ref = credentialRefFor(ID, 'headers.Authorization');
  const instance = {
    id: ID,
    displayName: 'Remote',
    serverName: 'remote',
    enabled: false,
    transport: 'streamable-http',
    url: 'https://trusted.example/mcp',
    headers: [{
      name: 'Authorization',
      value: { kind: 'credential', ref },
    }],
    toolCallTimeoutMs: 30_000,
    reconnect: {
      enabled: true,
      initialDelayMs: 1_000,
      maxDelayMs: 30_000,
      maxAttempts: 10,
    },
  };
  let probes = 0;
  const controller = new McpManagerController({
    settings: {
      read: () => ({ revision: 0, instances: [instance], approvals: {} }),
      write: async () => {},
    },
    credentials: {
      set: async () => {},
      unset: async () => {},
      resolve: async () => ({ value: 'stored-secret' }),
      configured: async () => true,
    },
    runtime: {
      upsert: async () => {},
      remove: async () => {},
      status: () => ({ phase: 'disabled', toolCount: 0, lastError: undefined }),
      tools: () => [],
    },
    probe: async () => {
      probes += 1;
      return { latencyMs: 1, tools: [] };
    },
  });

  const listed = await controller.list();
  assert.doesNotMatch(JSON.stringify(listed), /MCP_MANAGER_|approvalFingerprint/u);
  await assert.rejects(
    controller.test({
      instance: {
        ...instance,
        url: 'https://attacker.example/mcp',
        headers: [{
          name: 'Authorization',
          value: { kind: 'credential' },
        }],
      },
    }),
    (error) => error.code === 'EXECUTION_APPROVAL_REQUIRED',
  );
  assert.equal(probes, 0);
  await assert.rejects(
    controller.test({
      instance: {
        ...instance,
        headers: [{
          name: 'Authorization',
          value: { kind: 'credential', ref },
        }],
      },
    }),
    /不得提交 credential ref/,
  );
});

test('controller clears one credential without deleting its field', async () => {
  const ref = credentialRefFor(ID, 'args.1');
  let document = {
    revision: 0,
    instances: [stdio({
      args: [
        { kind: 'literal', value: '--token' },
        { kind: 'credential', ref },
      ],
    })],
    approvals: {},
  };
  const secrets = new Map([[ref, 'stored-secret']]);
  const controller = new McpManagerController({
    settings: {
      read: () => structuredClone(document),
      write: async (next) => {
        document = { ...structuredClone(next), revision: document.revision + 1 };
      },
    },
    credentials: {
      set: async (key, value) => secrets.set(key, value),
      unset: async (key) => secrets.delete(key),
      resolve: async (key) => secrets.has(key) ? { value: secrets.get(key) } : undefined,
      configured: async (key) => secrets.has(key),
    },
    runtime: {
      upsert: async () => {},
      remove: async () => {},
      status: () => ({ phase: 'disabled', toolCount: 0, lastError: undefined }),
    },
    probe: async () => ({ latencyMs: 1, tools: [] }),
  });

  const result = await controller.update({
    instance: {
      ...document.instances[0],
      args: [
        { kind: 'literal', value: '--token' },
        { kind: 'credential' },
      ],
    },
    clears: { 'args.1': true },
    expectedRevision: 0,
  });

  assert.equal(secrets.has(ref), false);
  assert.equal(document.instances[0].args[1].ref, ref);
  assert.equal(result.instances[0].args[1].configured, false);
});

test('client contributes a localized MCP settings section over authenticated RPC', async () => {
  const client = await readFile(
    path.join(repoRoot, 'plugins', 'mcp-manager', 'lib', 'client.js'),
    'utf8',
  );

  assert.match(
    client,
    /id:\s*["']@team-dsh-plugins\/mcp-manager["']/,
  );
  assert.match(client, /settings\.section/);
  assert.match(client, /ctx\.connection\.rpc\.call\(\s*["']\/mcp-manager["']/);
  assert.match(client, /ctx\.locale\.register/);
  assert.match(client, /aria-label|aria-labelledby/);
  assert.match(client, /确认|confirm/i);
  assert.doesNotMatch(client, /approvalFingerprint/);
  assert.match(client, /confirmationToken/);
  assert.match(client, /loadGeneration/);
  assert.match(client, /clearCredential/);
  assert.match(
    client,
    /require\(["']@deepseek-ai\/dsh-client-ui-primitives["']\)/,
  );
  for (const primitive of ['Button', 'Modal', 'Toast', 'StateDot', 'Menu', 'Tooltip']) {
    assert.match(client, new RegExp(`\\b${primitive}\\b`));
  }
  for (const endpoint of [
    'parse-import',
    'create-many',
    'create-and-enable',
    'update-and-apply',
    'cancel-test',
  ]) {
    assert.match(client, new RegExp(endpoint));
  }
  assert.doesNotMatch(client, /phrase:\s*instance\.serverName/u);
  assert.doesNotMatch(client, /checked:\s*instance\.enabled/u);
  assert.match(client, /高级设置|Advanced settings/u);
  assert.match(client, /保存并启用|Save and enable/u);

  const host = await readFile(
    path.join(repoRoot, 'plugins', 'mcp-manager', 'lib', 'index.js'),
    'utf8',
  );
  assert.match(host, /MAX_PROBE_PAGES/);
  assert.match(host, /MAX_PROBE_TOOLS/);
  assert.match(host, /重复 cursor/);
});

test('MCP editor widens the Modal shell without overflowing its body', async () => {
  const client = await readFile(
    path.join(repoRoot, 'plugins', 'mcp-manager', 'lib', 'client.js'),
    'utf8',
  );

  assert.match(client, /className:\s*["']mm-editorDialog["']/);
  assert.match(client, /\.mm-editorDialog\{[^}]*width:min\(720px,100%\)/);
  assert.match(client, /\.mm-modalBody\{width:100%/);
  assert.doesNotMatch(
    client,
    /\.mm-modalBody\{[^}]*width:min\(680px,calc\(100vw - 48px\)\)/,
  );
});
