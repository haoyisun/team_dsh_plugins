import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pluginsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'plugins',
);

/**
 * 插件通过 `registerRpcChannel(ctx, ...)` 或直接 `ctx.connection.rpc.handle(...)`
 * 注册 RPC 通道；两者都要求宿主声明 `connection` 与 `webServer`。
 * @param source - 插件 Host 入口源码。
 * @returns 该插件是否注册了 HTTP RPC 通道。
 */
function hostsRpcChannel(source) {
  return /registerRpcChannel\(\s*ctx/u.test(source)
    || source.includes('ctx.connection.rpc.handle(');
}

async function hostPluginEntries() {
  const entries = await readdir(pluginsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(pluginsRoot, entry.name, 'lib', 'index.js'));
}

test('host plugins that serve RPC channels declare webServer', async () => {
  const hostingRpcChannels = [];
  for (const entry of await hostPluginEntries()) {
    const source = await readFile(entry, 'utf8').catch(() => undefined);
    if (!source || !hostsRpcChannel(source)) continue;

    const plugin = await import(pathToFileURL(entry).href);
    const name = path.basename(path.dirname(path.dirname(entry)));
    hostingRpcChannels.push(name);

    assert.ok(
      Array.isArray(plugin.inject) && plugin.inject.includes('webServer'),
      `${name} 通过 RPC 通道注册路由，`
      + '必须按 DSH 客户端连接契约在 inject 中声明 webServer',
    );
    assert.ok(
      plugin.inject.includes('connection'),
      `${name} 依赖 ctx.connection 服务，必须在 inject 中声明 connection`,
    );
  }

  assert.deepEqual(
    hostingRpcChannels.sort(),
    ['mcp-manager', 'plugin-manager'],
  );
});

test('the shared RPC channel helper prefers the official registration path', async () => {
  const helper = await readFile(
    path.join(pluginsRoot, 'mcp-manager', 'lib', 'rpc-channel.js'),
    'utf8',
  );
  assert.match(helper, /ctx\.connection\.rpc\.handle\(/u);
  assert.match(helper, /ctx\.webServer\.register\(/u);
  assert.match(helper, /requestRejection/u);
});

test('workspace host plugins are importable with declared dependencies', async () => {
  for (const entry of await hostPluginEntries()) {
    const source = await readFile(entry, 'utf8').catch(() => undefined);
    if (!source) continue;

    const plugin = await import(pathToFileURL(entry).href);
    assert.equal(typeof plugin.apply, 'function');
    for (const dependency of plugin.inject ?? []) {
      assert.equal(typeof dependency, 'string');
      assert.notEqual(dependency.trim(), '');
    }
  }
});
