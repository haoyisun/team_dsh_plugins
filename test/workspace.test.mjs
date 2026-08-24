import assert from 'node:assert/strict';
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  compatibilityStatus,
  doctorWorkspace,
  dshVersionProbe,
  initWorkspace,
  unlinkWorkspace,
  validateWorkspace,
} from '../scripts/workspace.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'team-dsh-plugins-'));
  const repoRoot = path.join(root, 'repo');
  const dshHome = path.join(root, '.dsh');
  await mkdir(path.join(repoRoot, 'plugins', 'cost-meter'), { recursive: true });
  await mkdir(path.join(repoRoot, 'profiles'), { recursive: true });
  await mkdir(path.join(dshHome, 'profiles', 'web'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'profiles', 'web.yml'),
    "- id: cost-meter\n  name: '@team-dsh-plugins/cost-meter'\n",
  );
  await writeFile(
    path.join(repoRoot, 'plugins', 'cost-meter', 'package.json'),
    JSON.stringify({
      name: '@team-dsh-plugins/cost-meter',
      exports: { './client': './lib/client.js' },
      dsh: { client: { platform: 'web' } },
    }),
  );
  await mkdir(path.join(repoRoot, 'plugins', 'cost-meter', 'lib'));
  await writeFile(
    path.join(repoRoot, 'plugins', 'cost-meter', 'lib', 'client.js'),
    'window.__ModuleLoader__.load({ id: "@team-dsh-plugins/cost-meter", factory() {} });\n',
  );
  await writeFile(
    path.join(dshHome, 'profiles', 'web', 'cordis.patch.yml'),
    '# existing user patch\n[]\n',
  );
  return { root, repoRoot, dshHome };
}

test('init is idempotent and preserves the existing profile patch', async () => {
  const { repoRoot, dshHome } = await fixture();

  await initWorkspace({ repoRoot, dshHome });
  await initWorkspace({ repoRoot, dshHome });

  const patch = await readFile(
    path.join(dshHome, 'profiles', 'web', 'cordis.patch.yml'),
    'utf8',
  );
  assert.match(patch, /# existing user patch/);
  assert.equal(patch.match(/>>> team-dsh-plugins managed include/g)?.length, 1);
  assert.match(
    patch,
    new RegExp(pathToFileURL(path.join(repoRoot, 'profiles', 'web.yml')).href),
  );

  const link = path.join(dshHome, 'profiles', 'node_modules', '@team-dsh-plugins');
  assert.equal(await realpath(link), await realpath(path.join(repoRoot, 'plugins')));
  const workspaceLink = path.join(repoRoot, 'node_modules', '@team-dsh-plugins');
  assert.equal(
    await realpath(workspaceLink),
    await realpath(path.join(repoRoot, 'plugins')),
  );
});

test('init replaces dangling scope links after the repository moves', async () => {
  const { root, repoRoot, dshHome } = await fixture();
  const oldPlugins = path.join(root, 'old-repo', 'plugins');
  const links = [
    path.join(repoRoot, 'node_modules', '@team-dsh-plugins'),
    path.join(dshHome, 'profiles', 'node_modules', '@team-dsh-plugins'),
  ];
  await mkdir(oldPlugins, { recursive: true });
  for (const link of links) {
    await mkdir(path.dirname(link), { recursive: true });
    await symlink(oldPlugins, link, process.platform === 'win32' ? 'junction' : 'dir');
  }
  await rm(path.join(root, 'old-repo'), { recursive: true });

  await initWorkspace({ repoRoot, dshHome });

  for (const link of links) {
    assert.equal(await realpath(link), await realpath(path.join(repoRoot, 'plugins')));
  }
});

test('unlink removes only workspace integration and preserves DSH data', async () => {
  const { repoRoot, dshHome } = await fixture();
  const settings = path.join(dshHome, 'settings.yaml');
  const storage = path.join(dshHome, 'storages', 'cost_meter.json');
  await mkdir(path.dirname(storage), { recursive: true });
  await writeFile(settings, 'cost-meter:\n  currency: CNY\n');
  await writeFile(storage, '{"samples":[]}');
  await initWorkspace({ repoRoot, dshHome });

  await unlinkWorkspace({ repoRoot, dshHome });

  const patch = await readFile(
    path.join(dshHome, 'profiles', 'web', 'cordis.patch.yml'),
    'utf8',
  );
  assert.doesNotMatch(patch, /team-dsh-plugins managed include/);
  assert.equal(await readFile(settings, 'utf8'), 'cost-meter:\n  currency: CNY\n');
  assert.equal(await readFile(storage, 'utf8'), '{"samples":[]}');
  await assert.rejects(
    lstat(path.join(repoRoot, 'node_modules', '@team-dsh-plugins')),
    { code: 'ENOENT' },
  );
});

test('validate enforces registry, package, and client module identity', async () => {
  const { repoRoot } = await fixture();
  assert.deepEqual(await validateWorkspace({ repoRoot }), { errors: [], warnings: [] });

  await writeFile(
    path.join(repoRoot, 'plugins', 'cost-meter', 'lib', 'client.js'),
    'window.__ModuleLoader__.load({ id: "wrong-id", factory() {} });\n',
  );
  const result = await validateWorkspace({ repoRoot });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /client module id/);
});

test('unknown DSH versions warn and continue', () => {
  assert.deepEqual(compatibilityStatus('0.1.0-rc.7'), { supported: true });
  assert.deepEqual(compatibilityStatus('9.0.0'), {
    supported: false,
    warning: 'DSH 9.0.0 尚未经过本仓库验证；将继续运行。',
  });
});

test('doctor verifies repository and DSH integration without rejecting unknown versions', async () => {
  const { repoRoot, dshHome } = await fixture();
  await initWorkspace({ repoRoot, dshHome });

  const result = await doctorWorkspace({ repoRoot, dshHome, dshVersion: '0.2.0' });

  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /0\.2\.0/);
});

test('DSH version probing reads the npm latest tag without starting DSH', () => {
  assert.deepEqual(dshVersionProbe('win32', { ComSpec: 'C:\\Windows\\cmd.exe' }), {
    file: 'C:\\Windows\\cmd.exe',
    args: ['/d', '/s', '/c', 'npm view @deepseek-ai/dsh version --json'],
  });
});
