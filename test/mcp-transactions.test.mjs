import assert from 'node:assert/strict';
import test from 'node:test';

import { McpManagerController } from '../plugins/mcp-manager/lib/controller.js';
import { credentialRefFor, launchFingerprint } from '../plugins/mcp-manager/lib/model.js';

const ID = '018f0f40-7b0a-7b13-8f6a-29de7d24a671';

function stdio(overrides = {}) {
  return {
    id: ID,
    displayName: 'Search',
    serverName: 'search',
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

function harness({
  instances = [],
  approvals = {},
  probe = async () => ({ latencyMs: 4, tools: [{ name: 'search' }] }),
  revision = 0,
  runtime,
} = {}) {
  let document = { revision, instances, approvals };
  let idSequence = 0;
  const secrets = new Map();
  const runtimeEvents = [];
  const controller = new McpManagerController({
    settings: {
      read: () => structuredClone(document),
      write: async (next, expectedRevision) => {
        if (expectedRevision !== document.revision) {
          const error = new Error('stale');
          error.code = 'SETTINGS_CONFLICT';
          throw error;
        }
        document = { ...structuredClone(next), revision: document.revision + 1 };
      },
    },
    credentials: {
      set: async (ref, value) => secrets.set(ref, value),
      unset: async (ref) => secrets.delete(ref),
      resolve: async (ref) => secrets.has(ref) ? { value: secrets.get(ref) } : undefined,
      configured: async (ref) => secrets.has(ref),
    },
    runtime: runtime ?? {
      upsert: async (instance, config) => runtimeEvents.push(['upsert', instance, config]),
      remove: async (id) => runtimeEvents.push(['remove', id]),
      status: () => ({ phase: 'disabled', toolCount: 0 }),
      tools: () => [],
    },
    probe,
    idFactory: () => idSequence++ === 0
      ? ID
      : `018f0f40-7b0a-7b13-8f6a-${String(idSequence).padStart(12, '0')}`,
    challengeFactory: () => 'one-confirmation',
  });
  return {
    controller,
    document: () => document,
    secrets,
    runtimeEvents,
  };
}

async function approvalFor(controller, endpoint, payload) {
  const challenge = await controller.handle(endpoint, payload);
  assert.equal(challenge.ok, false);
  assert.equal(challenge.error.code, 'EXECUTION_APPROVAL_REQUIRED');
  return challenge.error.details.confirmationToken;
}

test('create-and-enable probes before one atomic persistence and starts the saved instance', async () => {
  const state = harness();
  const payload = {
    instance: stdio({
      env: [{ name: 'API_KEY', value: { kind: 'credential' } }],
    }),
    secrets: { 'env.API_KEY': 'temporary-secret' },
    expectedRevision: 0,
  };
  const token = await approvalFor(state.controller, 'create-and-enable', payload);

  const result = await state.controller.handle('create-and-enable', {
    ...payload,
    confirmationToken: token,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.testResult.latencyMs, 4);
  assert.equal(state.document().instances.length, 1);
  assert.equal(state.document().instances[0].enabled, true);
  assert.equal(
    state.document().approvals[ID],
    launchFingerprint(state.document().instances[0]),
  );
  assert.equal(
    state.secrets.get(credentialRefFor(ID, 'env.API_KEY')),
    'temporary-secret',
  );
  assert.equal(state.runtimeEvents.length, 1);
  assert.equal(state.runtimeEvents[0][0], 'upsert');
  assert.doesNotMatch(JSON.stringify(result), /temporary-secret/u);
});

test('create-and-enable leaves settings and credentials untouched when probe fails', async () => {
  const state = harness({
    probe: async () => {
      throw new Error('cannot connect');
    },
  });
  const payload = {
    instance: stdio({
      env: [{ name: 'API_KEY', value: { kind: 'credential' } }],
    }),
    secrets: { 'env.API_KEY': 'temporary-secret' },
    expectedRevision: 0,
  };
  const token = await approvalFor(state.controller, 'create-and-enable', payload);
  const result = await state.controller.handle('create-and-enable', {
    ...payload,
    confirmationToken: token,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'TEST_FAILED');
  assert.equal(state.document().instances.length, 0);
  assert.equal(state.secrets.size, 0);
  assert.deepEqual(state.runtimeEvents, []);
});

test('update-and-apply keeps an enabled instance and its runtime untouched when probe fails', async () => {
  const current = stdio({ enabled: true });
  const state = harness({
    instances: [current],
    approvals: { [ID]: launchFingerprint(current) },
    probe: async () => {
      throw new Error('candidate failed');
    },
  });
  const payload = {
    instance: { ...current, command: 'node-new' },
    expectedRevision: 0,
  };
  const token = await approvalFor(state.controller, 'update-and-apply', payload);
  const result = await state.controller.handle('update-and-apply', {
    ...payload,
    confirmationToken: token,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'TEST_FAILED');
  assert.equal(state.document().instances[0].command, 'node');
  assert.equal(state.document().revision, 0);
  assert.deepEqual(state.runtimeEvents, []);
});

test('create-many validates every disabled import before one settings write', async () => {
  const state = harness();
  const result = await state.controller.handle('create-many', {
    entries: [
      { instance: stdio({ serverName: 'first' }), secrets: {} },
      { instance: stdio({ serverName: 'second' }), secrets: {} },
    ],
    expectedRevision: 0,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    state.document().instances.map((instance) => [instance.serverName, instance.enabled]),
    [['first', false], ['second', false]],
  );
  assert.equal(state.document().revision, 1);
});

test('cancel-test aborts an in-flight probe and returns a distinct cancellation error', async () => {
  let probeStarted;
  const started = new Promise((resolve) => {
    probeStarted = resolve;
  });
  const state = harness({
    probe: async (_config, { signal }) => {
      probeStarted();
      await new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    },
  });
  const instance = {
    id: ID,
    displayName: 'Remote',
    serverName: 'remote',
    enabled: false,
    transport: 'streamable-http',
    url: 'https://mcp.example.com',
    headers: [],
    toolCallTimeoutMs: 30_000,
    reconnect: {
      enabled: true,
      initialDelayMs: 1_000,
      maxDelayMs: 30_000,
      maxAttempts: 10,
    },
  };

  const testing = state.controller.handle('test', {
    instance,
    operationId: 'probe-1',
  });
  await started;
  const cancelled = await state.controller.handle('cancel-test', {
    operationId: 'probe-1',
  });
  const result = await testing;

  assert.deepEqual(cancelled, { ok: true, value: { cancelled: true } });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'TEST_CANCELLED');
});

test('moving a positional credential keeps its explicit source instead of reusing the new index', async () => {
  const firstRef = credentialRefFor(ID, 'args.1');
  const secondRef = credentialRefFor(ID, 'args.3');
  let document = {
    revision: 0,
    instances: [stdio({
      args: [
        { kind: 'literal', value: '--first-token' },
        { kind: 'credential', ref: firstRef },
        { kind: 'literal', value: '--second-token' },
        { kind: 'credential', ref: secondRef },
      ],
    })],
    approvals: {},
  };
  const secrets = new Map([
    [firstRef, 'first-secret'],
    [secondRef, 'second-secret'],
  ]);
  const controller = new McpManagerController({
    settings: {
      read: () => structuredClone(document),
      write: async (next) => {
        document = { ...structuredClone(next), revision: 1 };
      },
    },
    credentials: {
      set: async (ref, value) => secrets.set(ref, value),
      unset: async (ref) => secrets.delete(ref),
      resolve: async (ref) => ({ value: secrets.get(ref) }),
      configured: async (ref) => secrets.has(ref),
    },
    runtime: {
      remove: async () => {},
      status: () => ({ phase: 'disabled', toolCount: 0 }),
    },
    probe: async () => ({ latencyMs: 1, tools: [] }),
  });

  const result = await controller.handle('update', {
    instance: stdio({
      args: [
        { kind: 'literal', value: '--second-token' },
        { kind: 'credential', sourcePath: 'args.3' },
      ],
    }),
    expectedRevision: 0,
  });

  assert.equal(result.ok, true);
  const movedRef = document.instances[0].args[1].ref;
  assert.notEqual(movedRef, firstRef);
  assert.notEqual(movedRef, secondRef);
  assert.equal(secrets.get(movedRef), 'second-secret');
  assert.equal(secrets.has(firstRef), false);
  assert.equal(secrets.has(secondRef), false);

  const secondUpdate = await controller.handle('update', {
    instance: stdio({
      args: [
        { kind: 'literal', value: '--second-token' },
        { kind: 'credential', sourcePath: 'args.1' },
        { kind: 'literal', value: '--new-token' },
        { kind: 'credential' },
      ],
    }),
    secrets: { 'args.3': 'new-secret' },
    expectedRevision: 1,
  });

  assert.equal(secondUpdate.ok, true);
  assert.equal(document.instances[0].args[1].ref, movedRef);
  assert.equal(document.instances[0].args[3].ref, secondRef);
  assert.equal(secrets.get(movedRef), 'second-secret');
  assert.equal(secrets.get(secondRef), 'new-secret');
});

test('create-and-enable rejects a stale revision before approval or probe execution', async () => {
  let probes = 0;
  const state = harness({
    revision: 1,
    probe: async () => {
      probes += 1;
      return { latencyMs: 1, tools: [] };
    },
  });

  const result = await state.controller.handle('create-and-enable', {
    instance: stdio(),
    expectedRevision: 0,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'SETTINGS_CONFLICT');
  assert.equal(probes, 0);
});

test('enabling a saved instance requires a successful probe before persistence', async () => {
  const remote = {
    id: ID,
    displayName: 'Remote',
    serverName: 'remote',
    enabled: false,
    transport: 'streamable-http',
    url: 'https://mcp.example.com',
    headers: [],
    toolCallTimeoutMs: 30_000,
    reconnect: {
      enabled: true,
      initialDelayMs: 1_000,
      maxDelayMs: 30_000,
      maxAttempts: 10,
    },
  };
  const state = harness({
    instances: [remote],
    probe: async () => {
      throw new Error('offline');
    },
  });

  const result = await state.controller.handle('set-enabled', {
    id: ID,
    enabled: true,
    expectedRevision: 0,
    operationId: 'enable-1',
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'TEST_FAILED');
  assert.equal(state.document().instances[0].enabled, false);
  assert.deepEqual(state.runtimeEvents, []);
});

test('legacy update RPC also tests enabled candidates before replacing them', async () => {
  const current = stdio({ enabled: true });
  const state = harness({
    instances: [current],
    approvals: { [ID]: launchFingerprint(current) },
    probe: async () => {
      throw new Error('candidate failed');
    },
  });
  const payload = {
    instance: { ...current, command: 'node-new' },
    expectedRevision: 0,
  };
  const token = await approvalFor(state.controller, 'update', payload);
  const result = await state.controller.handle('update', {
    ...payload,
    confirmationToken: token,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'TEST_FAILED');
  assert.equal(state.document().instances[0].command, 'node');
  assert.deepEqual(state.runtimeEvents, []);
});

test('legacy enabled update forwards operationId so its probe can be cancelled', async () => {
  let probeStarted;
  const started = new Promise((resolve) => {
    probeStarted = resolve;
  });
  const current = stdio({ enabled: true });
  const state = harness({
    instances: [current],
    approvals: { [ID]: launchFingerprint(current) },
    probe: async (_config, { signal }) => {
      probeStarted();
      await new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      });
    },
  });
  const payload = {
    instance: { ...current, command: 'node-new' },
    expectedRevision: 0,
    operationId: 'legacy-update-1',
  };
  const token = await approvalFor(state.controller, 'update', payload);
  const updating = state.controller.handle('update', {
    ...payload,
    confirmationToken: token,
  });
  await started;
  const cancelled = await state.controller.handle('cancel-test', {
    operationId: payload.operationId,
  });
  const result = await updating;

  assert.deepEqual(cancelled, { ok: true, value: { cancelled: true } });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'TEST_CANCELLED');
  assert.equal(state.document().instances[0].command, 'node');
});

test('create-and-enable reports compensation failure when a staged runtime cannot stop', async () => {
  const state = harness({
    runtime: {
      upsert: async () => {},
      remove: async () => {
        throw new Error('cannot stop staged runtime');
      },
      status: () => ({ phase: 'loaded', toolCount: 0 }),
      tools: () => [],
    },
  });
  state.controller = new McpManagerController({
    settings: {
      read: () => ({ revision: 0, instances: [], approvals: {} }),
      write: async () => {
        const error = new Error('stale');
        error.code = 'SETTINGS_CONFLICT';
        throw error;
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
      remove: async () => {
        throw new Error('cannot stop staged runtime');
      },
      status: () => ({ phase: 'loaded', toolCount: 0 }),
      tools: () => [],
    },
    probe: async () => ({ latencyMs: 1, tools: [] }),
    challengeFactory: () => 'compensation-confirmation',
  });
  const payload = {
    instance: stdio(),
    expectedRevision: 0,
  };
  const token = await approvalFor(state.controller, 'create-and-enable', payload);
  const result = await state.controller.handle('create-and-enable', {
    ...payload,
    confirmationToken: token,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'COMPENSATION_FAILED');
});

test('settings reconciliation waits for an in-flight activation transaction', async () => {
  let probeStarted;
  let releaseProbe;
  const started = new Promise((resolve) => {
    probeStarted = resolve;
  });
  const probeGate = new Promise((resolve) => {
    releaseProbe = resolve;
  });
  const remote = {
    id: ID,
    displayName: 'Remote',
    serverName: 'remote',
    enabled: false,
    transport: 'streamable-http',
    url: 'https://mcp.example.com',
    headers: [],
    toolCallTimeoutMs: 30_000,
    reconnect: {
      enabled: true,
      initialDelayMs: 1_000,
      maxDelayMs: 30_000,
      maxAttempts: 10,
    },
  };
  const state = harness({
    instances: [remote],
    probe: async () => {
      probeStarted();
      await probeGate;
      return { latencyMs: 1, tools: [] };
    },
  });
  await state.controller.sync();
  state.runtimeEvents.length = 0;

  const enabling = state.controller.handle('set-enabled', {
    id: ID,
    enabled: true,
    expectedRevision: 0,
    operationId: 'enable-with-sync',
  });
  await started;
  const syncing = state.controller.sync({ instances: [], approvals: {} });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(state.runtimeEvents, []);
  releaseProbe();
  await enabling;
  await syncing;
  assert.deepEqual(
    state.runtimeEvents.map(([action]) => action),
    ['upsert', 'remove'],
  );
});

test('execution approval cannot be reused for a different draft instance ID', async () => {
  const state = harness();
  const first = {
    instance: stdio(),
    expectedRevision: 0,
  };
  const token = await approvalFor(state.controller, 'create-and-enable', first);
  const second = await state.controller.handle('create-and-enable', {
    ...first,
    instance: {
      ...first.instance,
      id: '018f0f40-7b0a-7b13-8f6a-29de7d24a672',
    },
    confirmationToken: token,
  });

  assert.equal(second.ok, false);
  assert.equal(second.error.code, 'EXECUTION_APPROVAL_REQUIRED');
  assert.equal(state.document().instances.length, 0);
});
