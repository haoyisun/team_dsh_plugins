import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import Schema from '@deepseek-ai/schemastery';

import { McpManagerController } from './controller.js';
import { ManagedMcpRuntime, validateInstance } from './model.js';

const name = 'mcp-manager';
const inject = ['settings', 'credentials', 'connection', 'tools'];
const Config = Schema.object({});
const MAX_PROBE_PAGES = 32;
const MAX_PROBE_TOOLS = 1_000;
const MAX_PROBE_BYTES = 2 * 1024 * 1024;

function createBoundedFetch(fetchImpl, maxBytes = MAX_PROBE_BYTES) {
  return async (input, init) => {
    const response = await fetchImpl(input, {
      ...init,
      redirect: 'error',
    });
    if (!response.body) return response;
    const reader = response.body.getReader();
    let received = 0;
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) {
            controller.close();
            return;
          }
          received += chunk.value.byteLength;
          if (received > maxBytes) {
            await reader.cancel('mcp-manager: probe 响应超过安全上限');
            controller.error(new Error('mcp-manager: probe 响应超过安全上限'));
            return;
          }
          controller.enqueue(chunk.value);
        } catch (error) {
          controller.error(error);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

const SettingsConfig = Schema.object({
  instances: Schema.array(Schema.any()).default([]),
  approvals: Schema.dict(Schema.string()).default({}),
});

function validateSettings(value) {
  const serverNames = new Set();
  for (const instance of value.instances) {
    const normalized = validateInstance(instance);
    const key = normalized.serverName.toLowerCase();
    if (serverNames.has(key)) {
      throw new TypeError(`mcp-manager: serverName ${normalized.serverName} 重复`);
    }
    serverNames.add(key);
  }
}

async function probe(config) {
  const startedAt = Date.now();
  const client = new Client({
    name: '@team-dsh-plugins/mcp-manager-probe',
    version: '0.1.0',
  });
  const transport = config.transport === 'stdio'
    ? new StdioClientTransport({
      command: config.command,
      args: config.args,
      cwd: config.cwd || undefined,
      env: { ...getDefaultEnvironment(), ...config.env },
      stderr: 'pipe',
    })
    : new StreamableHTTPClientTransport(
      new URL(config.url),
      {
        requestInit: { headers: config.headers },
        fetch: createBoundedFetch(globalThis.fetch),
      },
    );
  try {
    await client.connect(transport, { timeout: config.toolCallTimeoutMs });
    const tools = [];
    const cursors = new Set();
    let pages = 0;
    let bytes = 0;
    let cursor;
    do {
      pages += 1;
      if (pages > MAX_PROBE_PAGES) {
        throw new Error(`mcp-manager: 工具列表超过 ${MAX_PROBE_PAGES} 页`);
      }
      const result = await client.listTools(
        cursor ? { cursor } : undefined,
        { timeout: config.toolCallTimeoutMs },
      );
      for (const tool of result.tools) {
        const projected = {
          name: tool.name,
          description: tool.description ?? '',
          inputSchema: tool.inputSchema,
        };
        bytes += Buffer.byteLength(JSON.stringify(projected), 'utf8');
        if (tools.length >= MAX_PROBE_TOOLS || bytes > MAX_PROBE_BYTES) {
          throw new Error('mcp-manager: 工具列表超过安全响应上限');
        }
        tools.push(projected);
      }
      cursor = result.nextCursor;
      if (cursor) {
        if (cursors.has(cursor)) {
          throw new Error('mcp-manager: 工具列表返回了重复 cursor');
        }
        cursors.add(cursor);
      }
    } while (cursor);
    return { latencyMs: Date.now() - startedAt, tools };
  } finally {
    await client.close().catch(() => {});
  }
}

async function apply(ctx) {
  const dshHome = process.env.DSH_HOME || path.join(homedir(), '.dsh');
  const profileRequire = createRequire(
    path.join(dshHome, 'profiles', 'web', 'package.json'),
  );
  const mcpClient = await import(pathToFileURL(
    profileRequire.resolve('@deepseek-ai/dsh-mcp-client'),
  ).href);
  const settingsScope = ctx.settings.register(name, SettingsConfig, {
    base: { instances: [], approvals: {} },
    validate: validateSettings,
  });
  const runtime = new ManagedMcpRuntime({
    startClient: async (config) => {
      const fiber = ctx.plugin(mcpClient, config);
      await fiber;
      return fiber;
    },
    listTools: () => ctx.tools.schemas(),
  });
  const settings = {
    read: () => {
      const descriptor = ctx.settings
        .describe({ redactSecrets: true })
        .find((entry) => entry.ns === name);
      if (!descriptor) throw new Error('mcp-manager: settings namespace 不可用');
      return {
        revision: descriptor.revision,
        ...settingsScope.get(),
      };
    },
    write: (next, expectedRevision) =>
      ctx.settings.replace(name, next, expectedRevision),
  };
  const credentials = {
    set: (ref, value) => ctx.credentials.set(ref, value),
    unset: (ref) => ctx.credentials.unset(ref),
    resolve: (ref) => ctx.credentials.resolve(ref),
    configured: async (ref) => (await ctx.credentials.describe(ref)).configured,
  };
  const controller = new McpManagerController({
    settings,
    credentials,
    runtime,
    probe,
  });

  await controller.sync(settingsScope.get());
  const unwatch = settingsScope.watch((next) => controller.sync(next));
  const removeRpc = ctx.connection.rpc.handle(
    '/mcp-manager',
    (endpoint, payload) => controller.handle(endpoint, payload),
  );
  ctx.effect(() => async () => {
    unwatch();
    await removeRpc();
    await runtime.dispose();
  });
}

export {
  apply,
  Config,
  createBoundedFetch,
  inject,
  name,
  probe as probeMcpConnection,
};
