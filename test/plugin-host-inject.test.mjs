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
    if (!source?.includes('ctx.connection.rpc.handle(')) continue;

    const plugin = await import(pathToFileURL(entry).href);
    const name = path.basename(path.dirname(path.dirname(entry)));
    hostingRpcChannels.push(name);

    assert.ok(
      Array.isArray(plugin.inject) && plugin.inject.includes('webServer'),
      `${name} 通过 connection.rpc.handle 注册 HTTP RPC 通道，`
      + '必须按 DSH 客户端连接契约在 inject 中声明 webServer',
    );
  }

  assert.deepEqual(
    hostingRpcChannels.sort(),
    ['mcp-manager', 'plugin-manager'],
  );
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
