import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  readMcpRegistry,
  validateMcpRegistry,
} from '../scripts/mcp-registry.mjs';

async function fixture(content) {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'team-dsh-mcp-'));
  await mkdir(path.join(repoRoot, 'profiles'));
  await writeFile(path.join(repoRoot, 'profiles', 'web.mcp.yml'), content);
  return repoRoot;
}

test('MCP registry accepts disabled stdio entries backed by environment expressions', async () => {
  const repoRoot = await fixture(`- id: mcp-dbx
  name: '@deepseek-ai/dsh-mcp-client'
  disabled: true
  config:
    serverName: dbx
    transport: stdio
    command: !!js process.env.DSH_MCP_DBX_COMMAND
    args:
      - !!js process.env.DSH_MCP_DBX_ENTRY
`);

  const entries = await readMcpRegistry({ repoRoot });

  assert.equal(entries[0].config.command.__jsExpr, 'process.env.DSH_MCP_DBX_COMMAND');
  assert.deepEqual(validateMcpRegistry(entries), { errors: [], warnings: [] });
});

test('MCP registry rejects absolute local paths and arbitrary JavaScript expressions', () => {
  const result = validateMcpRegistry([
    {
      id: 'mcp-dbx',
      name: '@deepseek-ai/dsh-mcp-client',
      config: {
        serverName: 'dbx',
        transport: 'stdio',
        command: 'D:\\InstalledSoft\\NodeJS\\node.exe',
        args: [
          '--config=C:/Users/example/config.json',
          '\\Users\\example\\config.json',
          '--api-key=committed-value',
          '--client-secret=committed-value',
          '--auth-token=committed-value',
          '--token',
          'committed-token',
          { __jsExpr: 'process.mainModule.require("node:fs")' },
        ],
      },
    },
  ]);

  assert.match(result.errors.join('\n'), /本机绝对路径/);
  assert.match(result.errors.join('\n'), /仅允许读取环境变量/);
  assert.match(result.errors.join('\n'), /敏感参数/);
});

test('MCP registry rejects expressions hidden in unknown fields', async () => {
  const repoRoot = await fixture(`- id: mcp-hidden
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: hidden
    transport: stdio
    command: node
    unknown:
      payload: !!js process.env.DSH_MCP_HIDDEN
`);

  const result = validateMcpRegistry(await readMcpRegistry({ repoRoot }));

  assert.match(result.errors.join('\n'), /不支持字段 unknown/);
});

test('MCP registry rejects expressions hidden in environment mapping keys', async () => {
  const repoRoot = await fixture(`- id: mcp-hidden-key
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: hidden-key
    transport: stdio
    command: node
    env:
      ? !!js Date.now()
      : !!js process.env.DSH_MCP_VALUE
`);

  const result = validateMcpRegistry(await readMcpRegistry({ repoRoot }));

  assert.match(result.errors.join('\n'), /env 键名无效/);
});

test('MCP registry enforces stable entry and server identities', () => {
  const result = validateMcpRegistry([
    {
      id: 'mcp-one',
      name: 'wrong-package',
      config: {
        serverName: 'same',
        transport: 'stdio',
        command: 'node',
      },
    },
    {
      id: 'mcp-one',
      name: '@deepseek-ai/dsh-mcp-client',
      config: {
        serverName: 'same',
        transport: 'stdio',
        command: 'node',
      },
    },
  ]);

  assert.match(result.errors.join('\n'), /必须是 @deepseek-ai\/dsh-mcp-client/);
  assert.match(result.errors.join('\n'), /重复的 MCP entry id/);
  assert.match(result.errors.join('\n'), /重复的 MCP serverName/);
});

test('MCP registry validates streamable HTTP entries and keeps credentials out of source', async () => {
  const repoRoot = await fixture(`- id: mcp-remote
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: remote
    transport: streamable-http
    url: https://mcp.example.com
    headers:
      Authorization: !!js process.env.DSH_MCP_REMOTE_AUTHORIZATION
`);
  const accepted = validateMcpRegistry(await readMcpRegistry({ repoRoot }));
  const rejected = validateMcpRegistry([
    {
      id: 'mcp-remote',
      name: '@deepseek-ai/dsh-mcp-client',
      config: {
        serverName: 'remote',
        transport: 'streamable-http',
        url: 'https://user:password@mcp.example.com?api_key=committed-value',
        headers: { Authorization: 'Bearer secret' },
      },
    },
  ]);

  assert.deepEqual(accepted, { errors: [], warnings: [] });
  assert.match(rejected.errors.join('\n'), /header.*环境变量表达式/i);
  assert.match(rejected.errors.join('\n'), /URL.*凭据/);
  assert.match(rejected.errors.join('\n'), /查询参数.*敏感值/);
});
