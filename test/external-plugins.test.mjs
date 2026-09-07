import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildDshPluginAddInvocation,
  diagnoseExternalPlugins,
  readExternalRegistry,
  syncExternalPlugins,
  validateExternalRegistry,
} from '../scripts/external-plugins.mjs';

const ENABLED = `- package: dsh-context
  version: '0.44.0'
  entries:
    - id: dsh-context
      name: dsh-context
  disabled: false
`;

const DISABLED = ENABLED.replace('disabled: false', 'disabled: true');

async function fixture(registry = ENABLED) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'team-dsh-external-'));
  const repoRoot = path.join(root, 'repo');
  const dshHome = path.join(root, '.dsh');
  await mkdir(path.join(repoRoot, 'profiles'), { recursive: true });
  await mkdir(path.join(dshHome, 'profiles', 'web'), { recursive: true });
  await writeFile(path.join(repoRoot, 'profiles', 'web.external.yml'), registry);
  await writeFile(
    path.join(dshHome, 'profiles', 'web', 'cordis.patch.yml'),
    '# user patch\n- id: user-setting\n  disabled: true\n',
  );
  return { repoRoot, dshHome };
}

async function installFakePlugin(dshHome, packageName, version) {
  const profileDirectory = path.join(dshHome, 'profiles', 'web');
  const packageDir = path.join(
    profileDirectory,
    'node_modules',
    ...packageName.split('/'),
  );
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    path.join(packageDir, 'package.json'),
    JSON.stringify({
      name: packageName,
      version,
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }),
  );
  await writeFile(
    path.join(packageDir, 'cordis.patch.yml'),
    `- insert:\n    - id: ${packageName}\n      name: ${packageName}\n`,
  );
  const profileManifestPath = path.join(profileDirectory, 'package.json');
  let profileManifest = { dependencies: {} };
  try {
    profileManifest = JSON.parse(await readFile(profileManifestPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  profileManifest.dependencies ??= {};
  profileManifest.dependencies[packageName] = version;
  profileManifest.dsh ??= {};
  profileManifest.dsh.profile ??= {};
  profileManifest.dsh.profile.bundles ??= [];
  if (!profileManifest.dsh.profile.bundles.includes(packageName)) {
    profileManifest.dsh.profile.bundles.push(packageName);
  }
  await writeFile(profileManifestPath, JSON.stringify(profileManifest));
}

test('external registry accepts exact versions and explicit bundle entries', async () => {
  const { repoRoot } = await fixture();

  const entries = await readExternalRegistry({ repoRoot });

  assert.equal(entries.length, 1);
  assert.deepEqual(validateExternalRegistry(entries), { errors: [], warnings: [] });
});

test('external registry rejects ranges, install specs, workspace packages, and duplicate entry ids', () => {
  const entries = [
    {
      package: 'dsh-context',
      version: '^0.44.0',
      entries: [{ id: 'shared', name: 'dsh-context' }],
    },
    {
      package: 'github:user/plugin',
      version: '1.0.0',
      entries: [{ id: 'other', name: 'github:user/plugin' }],
    },
    {
      package: '@team-dsh-plugins/local',
      version: '1.0.0',
      entries: [{ id: 'shared', name: '@team-dsh-plugins/local' }],
    },
  ];

  const result = validateExternalRegistry(entries);

  assert.match(result.errors.join('\n'), /精确 semver/);
  assert.match(result.errors.join('\n'), /npm registry 包名/);
  assert.match(result.errors.join('\n'), /工作区 scope/);
  assert.match(result.errors.join('\n'), /重复的外源 entry id/);
});

test('plugin invocation keeps validated package specs out of a shell command string', () => {
  assert.deepEqual(
    buildDshPluginAddInvocation(
      'dsh-context',
      '0.44.0',
      'win32',
      { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
    ),
    {
      file: 'C:\\Windows\\System32\\cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        'npx.cmd',
        '--yes',
        '@deepseek-ai/dsh',
        'plugin',
        '--profile',
        'web',
        'add',
        '--save-exact',
        'dsh-context@0.44.0',
      ],
    },
  );
});

test('sync installs a missing exact version and is idempotent', async () => {
  const { repoRoot, dshHome } = await fixture();
  const calls = [];
  const runDshPlugin = async ({ packageName, version }) => {
    calls.push(`${packageName}@${version}`);
    await installFakePlugin(dshHome, packageName, version);
  };

  await syncExternalPlugins({ repoRoot, dshHome, runDshPlugin });
  await syncExternalPlugins({ repoRoot, dshHome, runDshPlugin });

  assert.deepEqual(calls, ['dsh-context@0.44.0']);
});

test('sync repairs a matching package that is not a direct registered profile bundle', async () => {
  const { repoRoot, dshHome } = await fixture();
  await installFakePlugin(dshHome, 'dsh-context', '0.44.0');
  await writeFile(
    path.join(dshHome, 'profiles', 'web', 'package.json'),
    JSON.stringify({ dependencies: {}, dsh: { profile: { bundles: [] } } }),
  );
  const calls = [];
  const diagnosis = await diagnoseExternalPlugins({ repoRoot, dshHome });
  assert.match(diagnosis.errors.join('\n'), /精确直接依赖/);
  assert.match(diagnosis.errors.join('\n'), /未注册到 Web Profile Bundle/);

  await syncExternalPlugins({
    repoRoot,
    dshHome,
    runDshPlugin: async ({ packageName, version }) => {
      calls.push(`${packageName}@${version}`);
      await installFakePlugin(dshHome, packageName, version);
    },
  });

  assert.deepEqual(calls, ['dsh-context@0.44.0']);
});

test('sync realigns a version drift through the official add flow', async () => {
  const { repoRoot, dshHome } = await fixture();
  await installFakePlugin(dshHome, 'dsh-context', '0.43.0');
  const calls = [];

  await syncExternalPlugins({
    repoRoot,
    dshHome,
    runDshPlugin: async ({ packageName, version }) => {
      calls.push(`${packageName}@${version}`);
      await installFakePlugin(dshHome, packageName, version);
    },
  });

  assert.deepEqual(calls, ['dsh-context@0.44.0']);
});

test('disabled plugins use a top-level managed patch without changing user content', async () => {
  const { repoRoot, dshHome } = await fixture(DISABLED);
  await installFakePlugin(dshHome, 'dsh-context', '0.44.0');

  await syncExternalPlugins({ repoRoot, dshHome });
  const patch = await readFile(
    path.join(dshHome, 'profiles', 'web', 'cordis.patch.yml'),
    'utf8',
  );

  assert.match(patch, /# user patch/);
  assert.match(patch, /id: dsh-context[\s\S]*name: dsh-context[\s\S]*disabled: true/);
  assert.equal(patch.match(/managed external overrides/g)?.length, 2);
});

test('enabling a declared plugin removes its managed disable override', async () => {
  const { repoRoot, dshHome } = await fixture(DISABLED);
  await installFakePlugin(dshHome, 'dsh-context', '0.44.0');
  await syncExternalPlugins({ repoRoot, dshHome });
  await writeFile(path.join(repoRoot, 'profiles', 'web.external.yml'), ENABLED);

  await syncExternalPlugins({ repoRoot, dshHome });
  const patch = await readFile(
    path.join(dshHome, 'profiles', 'web', 'cordis.patch.yml'),
    'utf8',
  );

  assert.doesNotMatch(patch, /id: dsh-context/);
  assert.match(patch, /# user patch/);
});

test('enabling the only patched plugin leaves a valid empty patch array', async () => {
  const { repoRoot, dshHome } = await fixture(DISABLED);
  await installFakePlugin(dshHome, 'dsh-context', '0.44.0');
  const patchPath = path.join(dshHome, 'profiles', 'web', 'cordis.patch.yml');
  await writeFile(patchPath, '[]\n');
  await syncExternalPlugins({ repoRoot, dshHome });
  await writeFile(path.join(repoRoot, 'profiles', 'web.external.yml'), ENABLED);

  await syncExternalPlugins({ repoRoot, dshHome });

  assert.equal(await readFile(patchPath, 'utf8'), '[]\n');
});

test('removing a declaration preserves the installed package and its last disabled state', async () => {
  const { repoRoot, dshHome } = await fixture(DISABLED);
  await installFakePlugin(dshHome, 'dsh-context', '0.44.0');
  await syncExternalPlugins({ repoRoot, dshHome });
  await writeFile(path.join(repoRoot, 'profiles', 'web.external.yml'), '[]\n');
  const calls = [];

  const result = await syncExternalPlugins({
    repoRoot,
    dshHome,
    runDshPlugin: async (command) => calls.push(command),
  });
  const patch = await readFile(
    path.join(dshHome, 'profiles', 'web', 'cordis.patch.yml'),
    'utf8',
  );

  assert.deepEqual(calls, []);
  assert.match(patch, /id: dsh-context/);
  assert.match(result.warnings.join('\n'), /脱离仓库管理/);
});

test('removing an enabled declaration reports the installed plugin as unmanaged', async () => {
  const { repoRoot, dshHome } = await fixture(ENABLED);
  await installFakePlugin(dshHome, 'dsh-context', '0.44.0');
  await syncExternalPlugins({ repoRoot, dshHome });
  await writeFile(path.join(repoRoot, 'profiles', 'web.external.yml'), '[]\n');

  const result = await syncExternalPlugins({ repoRoot, dshHome });

  assert.match(result.warnings.join('\n'), /dsh-context.*脱离仓库管理/);
});

test('a failed installation does not update the managed patch', async () => {
  const { repoRoot, dshHome } = await fixture(DISABLED);
  const patchPath = path.join(dshHome, 'profiles', 'web', 'cordis.patch.yml');
  const before = await readFile(patchPath, 'utf8');

  await assert.rejects(
    syncExternalPlugins({
      repoRoot,
      dshHome,
      runDshPlugin: async () => {
        throw new Error('install failed');
      },
    }),
    /install failed/,
  );

  assert.equal(await readFile(patchPath, 'utf8'), before);
});

test('sync rejects a declared entry identity that is absent from the installed bundle', async () => {
  const { repoRoot, dshHome } = await fixture();
  await installFakePlugin(dshHome, 'dsh-context', '0.44.0');
  const bundlePath = path.join(
    dshHome,
    'profiles',
    'web',
    'node_modules',
    'dsh-context',
    'cordis.patch.yml',
  );
  await writeFile(bundlePath, '- insert:\n    - id: actual-id\n      name: dsh-context\n');

  await assert.rejects(
    syncExternalPlugins({ repoRoot, dshHome }),
    /Bundle entries 与声明不一致/,
  );
});

test('doctor reports missing packages, version drift, and patch drift without changing files', async () => {
  const { repoRoot, dshHome } = await fixture(DISABLED);
  const patchPath = path.join(dshHome, 'profiles', 'web', 'cordis.patch.yml');
  const before = await readFile(patchPath, 'utf8');

  const missing = await diagnoseExternalPlugins({ repoRoot, dshHome });
  assert.match(missing.errors.join('\n'), /尚未安装/);

  await installFakePlugin(dshHome, 'dsh-context', '0.43.0');
  const drifted = await diagnoseExternalPlugins({ repoRoot, dshHome });
  assert.match(drifted.errors.join('\n'), /版本漂移/);
  assert.match(drifted.errors.join('\n'), /禁用覆盖缺失/);
  assert.equal(await readFile(patchPath, 'utf8'), before);
});
