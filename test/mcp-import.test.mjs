import assert from 'node:assert/strict';
import test from 'node:test';

import { McpManagerController } from '../plugins/mcp-manager/lib/controller.js';
import { parseMcpImport } from '../plugins/mcp-manager/lib/import-config.js';

function makeIdFactory() {
  let sequence = 0;
  return () => `018f0f40-7b0a-7b13-8f6a-${String(++sequence).padStart(12, '0')}`;
}

test('imports a fenced JSONC mcpServers document and classifies environment values', () => {
  const result = parseMcpImport(`
    \`\`\`jsonc
    {
      // copied from a third-party README
      "mcpServers": {
        "mcp-dbx": {
          "command": "npx",
          "args": ["-y", "@example/mcp-dbx"],
          "cwd": "D:\\\\workspace",
          "env": {
            "LOG_LEVEL": "info",
            "DBX_API_KEY": "top-secret",
          },
        },
      },
    }
    \`\`\`
  `, { idFactory: makeIdFactory() });

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].instance.serverName, 'mcp-dbx');
  assert.equal(result.entries[0].instance.command, 'npx');
  assert.equal(result.entries[0].instance.cwd, 'D:\\workspace');
  assert.deepEqual(result.entries[0].instance.env, [
    { name: 'LOG_LEVEL', value: { kind: 'literal', value: 'info' } },
    { name: 'DBX_API_KEY', value: { kind: 'credential' } },
  ]);
  assert.deepEqual(result.entries[0].secrets, {
    'env.DBX_API_KEY': 'top-secret',
  });
  assert.ok(result.notices.some((notice) => notice.code === 'CODE_FENCE_REMOVED'));
  assert.ok(result.notices.some((notice) => notice.code === 'JSONC_NORMALIZED'));
  assert.doesNotMatch(JSON.stringify(result.notices), /top-secret/u);
});

test('imports one raw server object and derives an editable server name', () => {
  const result = parseMcpImport(JSON.stringify({
    displayName: 'Local Search MCP',
    command: 'node',
    args: ['server.js'],
  }), { idFactory: makeIdFactory() });

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].instance.displayName, 'Local Search MCP');
  assert.equal(result.entries[0].instance.serverName, 'local-search-mcp');
  assert.equal(result.entries[0].instance.transport, 'stdio');
});

test('imports multiple servers without enabling them', () => {
  const result = parseMcpImport(JSON.stringify({
    first: { command: 'node', args: ['first.js'] },
    second: { url: 'https://mcp.example.com' },
  }), { idFactory: makeIdFactory() });

  assert.deepEqual(
    result.entries.map((entry) => [entry.instance.serverName, entry.instance.enabled]),
    [['first', false], ['second', false]],
  );
});

test('imports a DSH Profile YAML patch for the official MCP client', () => {
  const result = parseMcpImport(String.raw`
    - insert:
        - id: mcp-dbx
          name: '@deepseek-ai/dsh-mcp-client'
          config:
            serverName: dbx
            transport: stdio
            command: "C:\\Tools\\node.exe"
            args: ["C:\\Tools\\mcp-dbx\\dist\\index.js"]
  `, { idFactory: makeIdFactory() });

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].sourceName, 'mcp-dbx');
  assert.equal(result.entries[0].instance.serverName, 'dbx');
  assert.equal(result.entries[0].instance.transport, 'stdio');
  assert.equal(
    result.entries[0].instance.command,
    String.raw`C:\Tools\node.exe`,
  );
  assert.deepEqual(result.entries[0].instance.args, [{
    kind: 'literal',
    value: String.raw`C:\Tools\mcp-dbx\dist\index.js`,
  }]);
  assert.ok(result.notices.some((notice) => notice.code === 'YAML_PARSED'));
  assert.ok(result.notices.some((notice) => notice.code === 'PROFILE_SEQUENCE_UNWRAPPED'));
  assert.ok(result.notices.some((notice) => notice.code === 'PROFILE_PATCH_UNWRAPPED'));
  assert.ok(!result.notices.some((notice) => notice.level === 'blocking'));
});

test('does not treat unrelated DSH Profile insert entries as MCP Servers', () => {
  assert.throws(
    () => parseMcpImport(`
      insert:
        - id: another-plugin
          name: '@example/another-plugin'
          config:
            command: node
    `),
    (error) => error.code === 'IMPORT_SHAPE_ERROR',
  );
});

test('rejects YAML aliases and duplicate keys', () => {
  assert.throws(
    () => parseMcpImport(`
      command: &launcher node
      args: [*launcher]
    `),
    (error) => error.code === 'IMPORT_PARSE_ERROR',
  );
  assert.throws(
    () => parseMcpImport(`
      command: node
      command: other
    `),
    (error) => error.code === 'IMPORT_PARSE_ERROR',
  );
});

test('marks credential placeholders as blocking instead of saving them as values', () => {
  const result = parseMcpImport(JSON.stringify({
    mcpServers: {
      remote: {
        command: 'npx',
        env: {
          API_KEY: '${API_KEY}',
          ACCESS_TOKEN: '<token>',
          PRIVATE_KEY: '$PRIVATE_KEY',
          PASSWORD: '%PASSWORD%',
          AUTH_TOKEN: '$env:AUTH_TOKEN',
          CLIENT_SECRET: '{{CLIENT_SECRET}}',
        },
      },
    },
  }), { idFactory: makeIdFactory() });

  assert.deepEqual(result.entries[0].secrets, {});
  assert.equal(
    result.notices.filter((notice) => notice.code === 'CREDENTIAL_REQUIRED').length,
    6,
  );
  assert.ok(result.notices
    .filter((notice) => notice.code === 'CREDENTIAL_REQUIRED')
    .every((notice) => notice.level === 'blocking'));
});

test('rejects unsupported transports and reports unknown launch fields without dropping them silently', () => {
  const sse = parseMcpImport(JSON.stringify({
    mcpServers: {
      legacy: {
        type: 'sse',
        url: 'https://mcp.example.com/sse',
      },
    },
  }), { idFactory: makeIdFactory() });
  assert.ok(sse.notices.some((notice) =>
    notice.level === 'blocking' && notice.code === 'UNSUPPORTED_TRANSPORT'));

  const unknown = parseMcpImport(JSON.stringify({
    command: 'node',
    args: ['server.js'],
    launchMode: 'sandbox',
  }), { idFactory: makeIdFactory() });
  assert.ok(unknown.notices.some((notice) =>
    notice.level === 'blocking'
    && notice.code === 'UNKNOWN_LAUNCH_FIELD'
    && notice.path.endsWith('launchMode')));
});

test('imports HTTPS custom headers as credentials and blocks plaintext credential transport', () => {
  const secure = parseMcpImport(JSON.stringify({
    remote: {
      type: 'http',
      url: 'https://mcp.example.com',
      headers: {
        Accept: 'application/json',
        'X-API-Key': 'header-secret',
      },
    },
  }), { idFactory: makeIdFactory() });
  assert.deepEqual(secure.entries[0].instance.headers, [
    { name: 'Accept', value: { kind: 'literal', value: 'application/json' } },
    { name: 'X-API-Key', value: { kind: 'credential' } },
  ]);
  assert.deepEqual(secure.entries[0].secrets, {
    'headers.X-API-Key': 'header-secret',
  });

  const insecure = parseMcpImport(JSON.stringify({
    remote: {
      url: 'http://mcp.example.com',
      headers: { Authorization: 'Bearer secret' },
    },
  }), { idFactory: makeIdFactory() });
  assert.ok(insecure.notices.some((notice) =>
    notice.level === 'blocking' && notice.code === 'INSECURE_CREDENTIAL_TRANSPORT'));
});

test('does not guess at ambiguous Windows path escape semantics', () => {
  const result = parseMcpImport(
    '{"command":"node","cwd":"C:\\tools"}',
    { idFactory: makeIdFactory() },
  );
  assert.ok(result.notices.some((notice) =>
    notice.level === 'blocking'
    && notice.code === 'SUSPICIOUS_PATH_ESCAPE'
    && notice.path.endsWith('.cwd')));
});

test('blocks ambiguous path escapes in command and arguments', () => {
  const result = parseMcpImport(
    '{"command":"C:\\tools","args":["C:\\tools"]}',
    { idFactory: makeIdFactory() },
  );
  assert.ok(result.notices.some((notice) =>
    notice.code === 'SUSPICIOUS_PATH_ESCAPE'
    && notice.path.endsWith('.command')));
  assert.ok(result.notices.some((notice) =>
    notice.code === 'SUSPICIOUS_PATH_ESCAPE'
    && notice.path.endsWith('.args.0')));
});

test('bounds pasted configuration size and server count', () => {
  assert.throws(
    () => parseMcpImport(`{"command":"node","description":"${'x'.repeat(600_000)}"}`),
    (error) => error.code === 'IMPORT_TOO_LARGE',
  );
  const many = Object.fromEntries(
    Array.from({ length: 101 }, (_, index) => [
      `server-${index}`,
      { command: 'node' },
    ]),
  );
  assert.throws(
    () => parseMcpImport(JSON.stringify({ mcpServers: many })),
    (error) => error.code === 'IMPORT_TOO_LARGE',
  );
});

test('controller exposes import parsing as a read-only RPC operation', async () => {
  const controller = new McpManagerController({
    settings: {
      read: () => ({ revision: 7, instances: [], approvals: {} }),
      write: async () => {
        throw new Error('parse-import must not write settings');
      },
    },
    credentials: {
      set: async () => {},
      unset: async () => {},
      resolve: async () => undefined,
      configured: async () => false,
    },
    runtime: {
      remove: async () => {},
      status: () => ({ phase: 'disabled', toolCount: 0 }),
    },
    probe: async () => ({ latencyMs: 1, tools: [] }),
    idFactory: makeIdFactory(),
  });

  const response = await controller.handle('parse-import', {
    text: '{"mcpServers":{"search":{"command":"node","args":["server.js"]}}}',
  });

  assert.equal(response.ok, true);
  assert.equal(response.value.revision, 7);
  assert.equal(response.value.entries[0].instance.serverName, 'search');
});

test('controller identifies an existing instance for explicit import conflict resolution', async () => {
  const existing = parseMcpImport(
    '{"search":{"command":"node","args":["old.js"]}}',
    { idFactory: makeIdFactory() },
  ).entries[0].instance;
  const controller = new McpManagerController({
    settings: {
      read: () => ({ revision: 2, instances: [existing], approvals: {} }),
      write: async () => {},
    },
    credentials: {
      configured: async () => false,
    },
    runtime: {
      status: () => ({ phase: 'disabled', toolCount: 0 }),
    },
    probe: async () => ({ latencyMs: 1, tools: [] }),
    idFactory: makeIdFactory(),
  });

  const response = await controller.handle('parse-import', {
    text: '{"search":{"command":"node","args":["new.js"]}}',
  });

  assert.equal(response.ok, true);
  assert.equal(response.value.entries[0].conflictId, existing.id);
  assert.ok(response.value.notices.some((notice) =>
    notice.code === 'SERVER_NAME_CONFLICT'));
});
