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

import { validateSettings } from '../plugins/plugin-manager/lib/index.js';
import {
  operationFingerprint,
  parsePackageSpec,
  publicRegistry,
  redactProcessOutput,
  validateRegistryMetadata,
  validateRegistryUrl,
} from '../plugins/plugin-manager/lib/model.js';
import {
  ProfilePluginService,
  buildDshInvocation,
  buildPnpmInvocation,
  registryEnv,
} from '../plugins/plugin-manager/lib/service.js';
import { PluginManagerController } from '../plugins/plugin-manager/lib/controller.js';
import { runProcess } from '../plugins/plugin-manager/lib/process.js';

async function profileFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plugin-manager-'));
  const repoRoot = path.join(root, 'repo');
  const dshHome = path.join(root, '.dsh');
  const profileDir = path.join(dshHome, 'profiles', 'web');
  await mkdir(path.join(repoRoot, 'profiles'), { recursive: true });
  await mkdir(path.join(repoRoot, 'plugins', 'cost-meter'), { recursive: true });
  await mkdir(path.join(repoRoot, 'plugins', 'plugin-manager'), { recursive: true });
  await mkdir(path.join(profileDir, 'node_modules', 'dsh-context'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'profiles', 'web.yml'),
    [
      "- id: cost-meter\n  name: '@team-dsh-plugins/cost-meter'",
      "- id: plugin-manager\n  name: '@team-dsh-plugins/plugin-manager'",
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(profileDir, 'package.json'),
    JSON.stringify({
      dependencies: {
        'dsh-context': '0.44.0',
        'broken-plugin': '1.0.0',
        'plain-library': '2.0.0',
      },
      dsh: {
        profile: {
          bundles: [
            '@deepseek-ai/dsh-base',
            '@deepseek-ai/dsh-web-app',
            'dsh-context',
            'broken-plugin',
          ],
        },
      },
    }),
  );
  await writeFile(
    path.join(profileDir, 'node_modules', 'dsh-context', 'package.json'),
    JSON.stringify({
      name: 'dsh-context',
      version: '0.44.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }),
  );
  await writeFile(
    path.join(profileDir, 'node_modules', 'dsh-context', 'cordis.patch.yml'),
    [
      '- insert:',
      '    - id: dsh-context',
      '      name: dsh-context',
      '    - id: dsh-context-tools',
      '      name: dsh-context/tools',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(profileDir, 'cordis.patch.yml'),
    '- id: dsh-context\n  name: dsh-context\n  disabled: true\n',
  );
  return { repoRoot, dshHome, profileDir };
}

test('package specs accept registry names with latest or exact semver only', () => {
  assert.deepEqual(parsePackageSpec('@sugarforever/dsh-mcp-apps'), {
    packageName: '@sugarforever/dsh-mcp-apps',
    requestedVersion: 'latest',
  });
  assert.deepEqual(parsePackageSpec('dsh-context@0.44.0'), {
    packageName: 'dsh-context',
    requestedVersion: '0.44.0',
  });
  assert.deepEqual(parsePackageSpec('@scope/plugin@1.2.3-rc.1'), {
    packageName: '@scope/plugin',
    requestedVersion: '1.2.3-rc.1',
  });
});

test('package specs reject ranges, tags, paths, URLs, and workspace packages', () => {
  for (const spec of [
    '@scope/plugin@^1.0.0',
    '@scope/plugin@next',
    'github:user/plugin',
    'https://example.com/plugin.tgz',
    'file:../plugin',
    '../plugin',
    'sugarforever/dsh-mcp-apps',
    '@team-dsh-plugins/cost-meter',
  ]) {
    assert.throws(() => parsePackageSpec(spec), { name: 'TypeError' }, spec);
  }
});

test('registry metadata must describe the requested DSH bundle safely', () => {
  assert.deepEqual(
    validateRegistryMetadata('@scope/plugin', {
      name: '@scope/plugin',
      version: '1.2.3',
      description: 'Example plugin',
      homepage: 'https://example.com/plugin',
      'dist.tarball': 'https://registry.example.com/plugin/-/plugin-1.2.3.tgz',
      scripts: { postinstall: 'node install.js' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }),
    {
      name: '@scope/plugin',
      version: '1.2.3',
      description: 'Example plugin',
      homepage: 'https://example.com/plugin',
      registryHost: 'registry.example.com',
      lifecycleScripts: ['postinstall'],
      bundlePatch: './cordis.patch.yml',
    },
  );

  assert.throws(
    () => validateRegistryMetadata('@scope/plugin', {
      name: '@scope/other',
      version: '1.2.3',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }),
    /身份不匹配/,
  );
  assert.throws(
    () => validateRegistryMetadata('@scope/plugin', {
      name: '@scope/plugin',
      version: '1.2.3',
      dsh: { bundle: { patch: '../outside.yml' } },
    }),
    /patch 路径/,
  );
});

test('registry URLs accept http and https mirrors and keep the trailing slash', () => {
  assert.equal(validateRegistryUrl(''), '');
  assert.equal(validateRegistryUrl('   '), '');
  assert.equal(validateRegistryUrl(undefined), '');
  assert.equal(
    validateRegistryUrl('https://registry.npmmirror.com'),
    'https://registry.npmmirror.com/',
  );
  assert.equal(
    validateRegistryUrl('https://registry.npmmirror.com/'),
    'https://registry.npmmirror.com/',
  );
  assert.equal(
    validateRegistryUrl('https://registry.npmmirror.com/npm'),
    'https://registry.npmmirror.com/npm/',
  );
  assert.equal(
    validateRegistryUrl('https://mirrors.huaweicloud.com/repository/npm/'),
    'https://mirrors.huaweicloud.com/repository/npm/',
  );
  assert.equal(
    validateRegistryUrl('http://mirrors.cloud.tencent.com/npm/'),
    'http://mirrors.cloud.tencent.com/npm/',
  );
  assert.deepEqual(publicRegistry(''), {
    url: '',
    host: '',
    source: 'default',
  });
  assert.deepEqual(
    publicRegistry('https://mirrors.huaweicloud.com/repository/npm/'),
    {
      url: 'https://mirrors.huaweicloud.com/repository/npm/',
      host: 'mirrors.huaweicloud.com',
      source: 'custom',
    },
  );
});

test('registry URLs reject credentials, query strings, and non-http protocols', () => {
  for (const value of [
    'https://user:pass@registry.npmmirror.com',
    'https://registry.npmmirror.com/?token=1',
    'https://registry.npmmirror.com/#frag',
    'file:///tmp/registry',
    'git://github.com/npm/registry.git',
    'not-a-url',
    '//registry.npmmirror.com',
  ]) {
    assert.throws(() => validateRegistryUrl(value), { name: 'TypeError' }, value);
  }
});

test('settings validation keeps rollback and registry URL in the same namespace', () => {
  assert.doesNotThrow(() => validateSettings({
    rollback: { 'dsh-context': '1.0.0' },
    registryUrl: '',
  }));
  assert.doesNotThrow(() => validateSettings({
    rollback: {},
    registryUrl: 'https://registry.npmmirror.com/',
  }));
  assert.doesNotThrow(() => validateSettings({
    rollback: {},
    registryUrl: 'http://mirrors.cloud.tencent.com/npm/',
  }));
  assert.throws(
    () => validateSettings({
      rollback: {},
      registryUrl: 'https://user:token@registry.npmmirror.com',
    }),
    /registry URL/,
  );
});

test('operation approvals bind the exact action and process output is bounded and redacted', () => {
  const install = operationFingerprint({
    action: 'add',
    packageName: '@scope/plugin',
    targetVersion: '1.2.3',
  });
  const update = operationFingerprint({
    action: 'change-version',
    packageName: '@scope/plugin',
    currentVersion: '1.0.0',
    targetVersion: '1.2.3',
  });

  assert.notEqual(install, update);
  const output = redactProcessOutput(
    'Authorization: Bearer abc123\nC:\\Users\\Alice\\.npmrc\nhttps://user:secret@example.com/pkg',
    80,
  );
  assert.doesNotMatch(output, /abc123|Alice|secret/);
  assert.ok(output.length <= 80);
});

test('profile inspection separates manageable, system, workspace, and broken bundles', async () => {
  const { repoRoot, dshHome } = await profileFixture();
  const service = new ProfilePluginService({
    repoRoot,
    dshHome,
    dshBin: 'C:\\cache\\dsh\\lib\\bin.js',
    runProcess: async () => ({ stdout: '', stderr: '' }),
  });

  const plugins = await service.listPlugins();
  const context = plugins.find((plugin) => plugin.packageName === 'dsh-context');
  const broken = plugins.find((plugin) => plugin.packageName === 'broken-plugin');

  assert.equal(context.kind, 'external');
  assert.equal(context.readOnly, false);
  assert.equal(context.health, 'ready');
  assert.equal(context.activation, 'partially-disabled');
  assert.deepEqual(context.entries.map((entry) => entry.id), [
    'dsh-context',
    'dsh-context-tools',
  ]);
  assert.equal(broken.kind, 'external');
  assert.equal(broken.health, 'broken');
  assert.equal(
    plugins.find((plugin) => plugin.packageName === '@deepseek-ai/dsh-base').kind,
    'system',
  );
  assert.equal(
    plugins.find((plugin) => plugin.packageName === '@team-dsh-plugins/plugin-manager').kind,
    'workspace',
  );
  assert.equal(
    plugins.some((plugin) => plugin.packageName === 'plain-library'),
    false,
  );
});

test('metadata lookup uses profile pnpm configuration and validates the returned bundle', async () => {
  const { repoRoot, dshHome, profileDir } = await profileFixture();
  const calls = [];
  const service = new ProfilePluginService({
    repoRoot,
    dshHome,
    dshBin: 'D:\\npx-cache\\dsh\\lib\\bin.js',
    platform: 'win32',
    env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
    runProcess: async (invocation) => {
      calls.push(invocation);
      return {
        stdout: `C:\\profile>node "C:\\pnpm\\pnpm.cjs" view ...\r\n${JSON.stringify({
          name: '@scope/plugin',
          version: '1.2.3',
          'dist.tarball': 'https://registry.example.com/@scope/plugin/-/plugin-1.2.3.tgz',
          dsh: { bundle: { patch: './cordis.patch.yml' } },
        })}`,
        stderr: '',
      };
    },
  });

  const metadata = await service.resolvePackage('@scope/plugin@1.2.3');

  assert.equal(metadata.version, '1.2.3');
  assert.equal(calls[0].file, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(calls[0].args, [
    '/d',
    '/s',
    '/c',
    'pnpm.cmd',
    'view',
    '@scope/plugin@1.2.3',
    'name',
    'version',
    'description',
    'homepage',
    'dist.tarball',
    'scripts',
    'dsh',
    '--json',
  ]);
  assert.equal(calls[0].cwd, profileDir);
  assert.equal(Object.hasOwn(calls[0].env ?? {}, 'npm_config_registry'), false);
});

test('metadata lookup injects a configured registry without mutating the host env', async () => {
  const { repoRoot, dshHome, profileDir } = await profileFixture();
  const env = { ComSpec: 'C:\\Windows\\System32\\cmd.exe', SAFE_ENV: 'value' };
  const calls = [];
  const service = new ProfilePluginService({
    repoRoot,
    dshHome,
    dshBin: 'D:\\npx-cache\\dsh\\lib\\bin.js',
    platform: 'win32',
    env,
    getRegistryUrl: async () => 'https://registry.npmmirror.com/',
    runProcess: async (invocation) => {
      calls.push(invocation);
      return {
        stdout: JSON.stringify({
          name: '@scope/plugin',
          version: '1.2.3',
          'dist.tarball': 'https://registry.npmmirror.com/@scope/plugin/-/plugin-1.2.3.tgz',
          dsh: { bundle: { patch: './cordis.patch.yml' } },
        }),
        stderr: '',
      };
    },
  });

  await service.resolvePackage('@scope/plugin@1.2.3');

  assert.equal(calls[0].cwd, profileDir);
  assert.ok(calls[0].args.includes('--registry'));
  assert.equal(
    calls[0].args[calls[0].args.indexOf('--registry') + 1],
    'https://registry.npmmirror.com/',
  );
  assert.equal(calls[0].env.npm_config_registry, 'https://registry.npmmirror.com/');
  assert.equal(calls[0].env.SAFE_ENV, 'value');
  assert.equal(Object.hasOwn(env, 'npm_config_registry'), false);
});

test('registry env copies the base object and only sets npm_config_registry when configured', () => {
  const base = { PATH: '/usr/bin' };
  assert.deepEqual(registryEnv(base, ''), { PATH: '/usr/bin' });
  assert.deepEqual(registryEnv(base, 'https://registry.npmmirror.com'), {
    PATH: '/usr/bin',
    npm_config_registry: 'https://registry.npmmirror.com',
  });
  assert.equal(Object.hasOwn(base, 'npm_config_registry'), false);
});

test('process invocations keep package arguments separate and pin the running DSH CLI', () => {
  assert.deepEqual(
    buildDshInvocation(
      'C:\\Program Files\\nodejs\\node.exe',
      'D:\\npx cache\\dsh\\lib\\bin.js',
      ['add', '--save-exact', '@scope/plugin@1.2.3'],
    ),
    {
      file: 'C:\\Program Files\\nodejs\\node.exe',
      args: [
        'D:\\npx cache\\dsh\\lib\\bin.js',
        'plugin',
        '--profile',
        'web',
        'add',
        '--save-exact',
        '@scope/plugin@1.2.3',
      ],
    },
  );
  assert.deepEqual(
    buildPnpmInvocation(['view', 'plugin@1.0.0'], 'linux'),
    { file: 'pnpm', args: ['view', 'plugin@1.0.0'] },
  );
});

function controllerFixture(initialPlugins = [], initialRollback = {}, initialRegistry = '') {
  let plugins = structuredClone(initialPlugins);
  let rollbackState = { ...initialRollback };
  let registryUrl = initialRegistry;
  let releaseMutation;
  const calls = [];
  const service = {
    listPlugins: async () => structuredClone(plugins),
    getPackageState: async (packageName) => {
      const plugin = plugins.find((item) => item.packageName === packageName);
      return {
        exists: Boolean(plugin),
        bundleRegistered: Boolean(plugin),
        dependencySpec: plugin?.version,
        version: plugin?.version,
      };
    },
    resolvePackage: async (spec) => {
      const { packageName, requestedVersion } = parsePackageSpec(spec);
      return {
        name: packageName,
        version: requestedVersion === 'latest' ? '2.0.0' : requestedVersion,
        description: 'Resolved plugin',
        registryHost: 'registry.npmjs.org',
        lifecycleScripts: [],
        bundlePatch: './cordis.patch.yml',
      };
    },
    runMutation: async (operation) => {
      calls.push(operation);
      if (releaseMutation) await new Promise((resolve) => {
        releaseMutation.resolve = resolve;
      });
      if (
        operation.action === 'remove'
        || operation.action === 'undo-add'
        || operation.action === 'compensate-remove'
      ) {
        plugins = plugins.filter((item) => item.packageName !== operation.packageName);
      } else {
        plugins = plugins.filter((item) => item.packageName !== operation.packageName);
        plugins.push({
          packageName: operation.packageName,
          version: operation.targetVersion,
          kind: 'external',
          readOnly: false,
          health: 'ready',
          activation: 'enabled',
          entries: [{ id: operation.packageName, name: operation.packageName }],
        });
      }
      return 'completed';
    },
  };
  const rollback = {
    read: async () => ({ ...rollbackState }),
    write: async (next) => {
      rollbackState = { ...next };
    },
  };
  const registryPrefs = {
    read: async () => registryUrl,
    write: async (next) => {
      registryUrl = next;
    },
  };
  const controller = new PluginManagerController({
    service,
    rollback,
    registryPrefs,
    now: () => 1_000,
    createToken: () => `token-${calls.length}`,
  });
  return {
    controller,
    calls,
    rollback: () => rollbackState,
    registry: () => registryUrl,
    blockMutation() {
      releaseMutation = {};
      return () => releaseMutation.resolve();
    },
  };
}

test('controller requires a single-use approval and verifies actual state after install', async () => {
  const { controller, calls } = controllerFixture();
  const prepared = await controller.handle('prepare', {
    action: 'add',
    spec: '@scope/plugin',
  });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.value.operation.targetVersion, '2.0.0');
  assert.equal(prepared.value.operation.fingerprint.length, 64);

  const rejected = await controller.handle('execute', { approvalToken: 'wrong' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'APPROVAL_REQUIRED');

  const started = await controller.handle('execute', {
    approvalToken: prepared.value.approvalToken,
  });
  assert.equal(started.ok, true);
  await controller.waitForIdle();

  const state = await controller.handle('list');
  assert.equal(state.value.operation.status, 'completed');
  assert.equal(state.value.operation.restartRequired, true);
  assert.equal(state.value.plugins[0].version, '2.0.0');
  assert.deepEqual(state.value.registry, {
    url: '',
    host: '',
    source: 'default',
  });
  assert.deepEqual(prepared.value.operation.registry, {
    url: '',
    host: '',
    source: 'default',
  });
  assert.equal(calls.length, 1);

  const reused = await controller.handle('execute', {
    approvalToken: prepared.value.approvalToken,
  });
  assert.equal(reused.ok, false);
  assert.equal(reused.error.code, 'APPROVAL_REQUIRED');
});

test('controller serializes mutations and persists one rollback version per package', async () => {
  const initial = [{
    packageName: '@scope/plugin',
    version: '1.0.0',
    kind: 'external',
    readOnly: false,
    health: 'ready',
    activation: 'enabled',
    entries: [{ id: 'plugin', name: '@scope/plugin' }],
  }];
  const fixture = controllerFixture(initial);
  const release = fixture.blockMutation();
  const prepared = await fixture.controller.handle('prepare', {
    action: 'change-version',
    packageName: '@scope/plugin',
    targetVersion: '2.0.0',
  });
  await fixture.controller.handle('execute', {
    approvalToken: prepared.value.approvalToken,
  });

  const busy = await fixture.controller.handle('prepare', {
    action: 'remove',
    packageName: '@scope/plugin',
  });
  assert.equal(busy.ok, false);
  assert.equal(busy.error.code, 'OPERATION_BUSY');

  release();
  await fixture.controller.waitForIdle();
  assert.deepEqual(fixture.rollback(), { '@scope/plugin': '1.0.0' });

  const listed = await fixture.controller.handle('list');
  assert.equal(listed.value.plugins[0].rollbackVersion, '1.0.0');
});

test('controller never returns raw process details to the browser', async () => {
  const error = new Error(
    'Authorization: Bearer browser-secret C:\\Users\\Alice\\.npmrc',
  );
  error.code = 'PROCESS_FAILED';
  error.details = {
    stderr: 'https://user:registry-secret@example.com/package',
  };
  const controller = new PluginManagerController({
    service: {
      listPlugins: async () => [],
      getPackageState: async () => ({
        exists: false,
        bundleRegistered: false,
        dependencySpec: undefined,
        version: undefined,
      }),
      resolvePackage: async () => {
        throw error;
      },
    },
    rollback: {
      read: async () => ({}),
      write: async () => {},
    },
  });

  const result = await controller.handle('prepare', {
    action: 'add',
    spec: '@scope/plugin',
  });

  assert.equal(result.ok, false);
  assert.doesNotMatch(JSON.stringify(result), /browser-secret|Alice|registry-secret/);
});

test('remove fails verification when the Bundle registration remains', async () => {
  let plugins = [{
    packageName: 'broken-plugin',
    version: '1.0.0',
    kind: 'external',
    readOnly: false,
    health: 'broken',
    activation: 'unknown',
    entries: [],
  }];
  const controller = new PluginManagerController({
    service: {
      listPlugins: async () => structuredClone(plugins),
      getPackageState: async () => {
        const plugin = plugins[0];
        return {
          exists: Boolean(plugin),
          bundleRegistered: Boolean(plugin),
          dependencySpec: plugin?.version,
          version: plugin?.version,
        };
      },
      runMutation: async () => {
        plugins = [{
          ...plugins[0],
          kind: 'system',
          readOnly: true,
        }];
        return 'removed dependency';
      },
    },
    rollback: {
      read: async () => ({}),
      write: async () => {},
    },
    createToken: () => 'remove-token',
  });
  const prepared = await controller.handle('prepare', {
    action: 'remove',
    packageName: 'broken-plugin',
  });

  await controller.handle('execute', {
    approvalToken: prepared.value.approvalToken,
  });
  await controller.waitForIdle();

  const state = await controller.handle('list');
  assert.equal(state.value.operation.status, 'failed');
  assert.equal(state.value.operation.error.code, 'STATE_MISMATCH');
});

test('controller checks latest on demand and restores the previous exact version', async () => {
  const installed = [{
    packageName: '@scope/plugin',
    version: '2.0.0',
    kind: 'external',
    readOnly: false,
    health: 'ready',
    activation: 'enabled',
    entries: [{ id: 'plugin', name: '@scope/plugin' }],
  }];
  const fixture = controllerFixture(installed, {
    '@scope/plugin': '1.0.0',
  });

  const update = await fixture.controller.handle('check-update', {
    packageName: '@scope/plugin',
  });
  assert.equal(update.value.updateAvailable, false);
  assert.equal(update.value.targetVersion, '2.0.0');

  const prepared = await fixture.controller.handle('prepare', {
    action: 'restore',
    packageName: '@scope/plugin',
  });
  assert.equal(prepared.value.operation.targetVersion, '1.0.0');
  await fixture.controller.handle('execute', {
    approvalToken: prepared.value.approvalToken,
  });
  await fixture.controller.waitForIdle();

  assert.equal(fixture.calls[0].action, 'restore');
  assert.deepEqual(fixture.rollback(), { '@scope/plugin': '2.0.0' });
});

test('failed version changes automatically restore the previous exact version', async () => {
  let plugin = {
    packageName: '@scope/plugin',
    version: '1.0.0',
    kind: 'external',
    readOnly: false,
    health: 'ready',
    activation: 'enabled',
    entries: [{ id: 'plugin', name: '@scope/plugin' }],
  };
  const calls = [];
  const controller = new PluginManagerController({
    service: {
      listPlugins: async () => [structuredClone(plugin)],
      getPackageState: async () => ({
        exists: true,
        bundleRegistered: true,
        version: plugin.version,
      }),
      resolvePackage: async () => ({
        name: '@scope/plugin',
        version: '2.0.0',
        description: '',
        registryHost: 'registry.npmjs.org',
        lifecycleScripts: ['postinstall'],
        bundlePatch: './cordis.patch.yml',
      }),
      runMutation: async (operation) => {
        calls.push(operation);
        if (calls.length === 1) {
          plugin = { ...plugin, version: '2.0.0', health: 'broken' };
          const error = new Error(
            'ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL ELIFECYCLE Authorization: Bearer secret',
          );
          error.code = 'PROCESS_FAILED';
          error.details = { stderr: 'postinstall failed with token=secret' };
          throw error;
        }
        plugin = { ...plugin, version: '1.0.0', health: 'ready' };
      },
    },
    rollback: {
      read: async () => ({}),
      write: async () => {},
    },
    createToken: () => 'update-token',
  });
  const prepared = await controller.handle('prepare', {
    action: 'change-version',
    packageName: '@scope/plugin',
    targetVersion: '2.0.0',
  });

  await controller.handle('execute', {
    approvalToken: prepared.value.approvalToken,
  });
  await controller.waitForIdle();

  const state = await controller.handle('list');
  assert.deepEqual(calls.map((call) => call.action), [
    'change-version',
    'compensate',
  ]);
  assert.equal(state.value.operation.status, 'failed');
  assert.equal(state.value.operation.rollback.status, 'completed');
  assert.equal(state.value.operation.error.category, 'lifecycle-failed');
  assert.doesNotMatch(JSON.stringify(state.value.operation), /secret/);
  assert.equal(state.value.plugins[0].version, '1.0.0');
  assert.equal(state.value.plugins[0].pendingRestart, undefined);
});

test('a failed compensation reports the observed damaged state', async () => {
  let plugin = {
    packageName: 'dsh-context',
    version: '1.0.0',
    kind: 'external',
    readOnly: false,
    health: 'ready',
    activation: 'enabled',
    entries: [{ id: 'dsh-context', name: 'dsh-context' }],
  };
  let callCount = 0;
  const controller = new PluginManagerController({
    service: {
      listPlugins: async () => [structuredClone(plugin)],
      getPackageState: async () => ({
        exists: true,
        bundleRegistered: true,
        version: plugin.version,
      }),
      resolvePackage: async () => ({
        name: 'dsh-context',
        version: '2.0.0',
        description: '',
        registryHost: 'registry.npmjs.org',
        lifecycleScripts: [],
        bundlePatch: './cordis.patch.yml',
      }),
      runMutation: async () => {
        callCount += 1;
        if (callCount === 1) {
          plugin = { ...plugin, version: '2.0.0', health: 'broken' };
          throw Object.assign(new Error('install failed'), {
            code: 'PROCESS_FAILED',
          });
        }
        throw Object.assign(new Error('restore failed'), {
          code: 'PROCESS_FAILED',
        });
      },
    },
    rollback: {
      read: async () => ({}),
      write: async () => {},
    },
    createToken: () => 'failed-rollback-token',
  });
  const prepared = await controller.handle('prepare', {
    action: 'change-version',
    packageName: 'dsh-context',
    targetVersion: '2.0.0',
  });

  await controller.handle('execute', {
    approvalToken: prepared.value.approvalToken,
  });
  await controller.waitForIdle();

  const state = await controller.handle('list');
  assert.equal(state.value.operation.rollback.status, 'failed');
  assert.equal(state.value.operation.observed.version, '2.0.0');
  assert.equal(state.value.operation.observed.health, 'broken');
});

test('successful changes stay pending until an explicit undo or host restart', async () => {
  let plugin = {
    packageName: 'dsh-context',
    version: '1.0.0',
    kind: 'external',
    readOnly: false,
    health: 'ready',
    activation: 'enabled',
    entries: [{ id: 'dsh-context', name: 'dsh-context' }],
  };
  const service = {
    listPlugins: async () => [structuredClone(plugin)],
    getPackageState: async () => ({
      exists: true,
      bundleRegistered: true,
      version: plugin.version,
    }),
    resolvePackage: async (spec) => ({
      name: 'dsh-context',
      version: spec.endsWith('@latest') ? '2.0.0' : '1.0.0',
      description: '',
      registryHost: 'registry.npmjs.org',
      lifecycleScripts: [],
      bundlePatch: './cordis.patch.yml',
    }),
    runMutation: async (operation) => {
      plugin = {
        ...plugin,
        version: operation.targetVersion,
        health: 'ready',
      };
    },
  };
  let token = 0;
  const controller = new PluginManagerController({
    service,
    rollback: {
      read: async () => ({}),
      write: async () => {},
    },
    createToken: () => `pending-token-${token++}`,
  });
  const prepared = await controller.handle('prepare', {
    action: 'change-version',
    packageName: 'dsh-context',
    targetVersion: 'latest',
  });
  await controller.handle('execute', {
    approvalToken: prepared.value.approvalToken,
  });
  await controller.waitForIdle();

  let state = await controller.handle('list');
  assert.deepEqual(state.value.plugins[0].pendingRestart, {
    action: 'change-version',
    previousVersion: '1.0.0',
    targetVersion: '2.0.0',
  });
  const blocked = await controller.handle('prepare', {
    action: 'remove',
    packageName: 'dsh-context',
  });
  assert.equal(blocked.error.code, 'RESTART_PENDING');

  const undo = await controller.handle('prepare', {
    action: 'undo',
    packageName: 'dsh-context',
  });
  await controller.handle('execute', {
    approvalToken: undo.value.approvalToken,
  });
  await controller.waitForIdle();

  state = await controller.handle('list');
  assert.equal(state.value.plugins[0].version, '1.0.0');
  assert.equal(state.value.plugins[0].pendingRestart, undefined);
});

test('successful deletion is pending but cannot claim a reversible undo', async () => {
  const fixture = controllerFixture([{
    packageName: 'dsh-context',
    version: '1.0.0',
    kind: 'external',
    readOnly: false,
    health: 'ready',
    activation: 'enabled',
    entries: [{ id: 'dsh-context', name: 'dsh-context' }],
  }]);
  const prepared = await fixture.controller.handle('prepare', {
    action: 'remove',
    packageName: 'dsh-context',
  });

  await fixture.controller.handle('execute', {
    approvalToken: prepared.value.approvalToken,
  });
  await fixture.controller.waitForIdle();

  const state = await fixture.controller.handle('list');
  assert.equal(state.value.plugins[0].health, 'removed');
  assert.deepEqual(state.value.plugins[0].pendingRestart, {
    action: 'remove',
    previousVersion: '1.0.0',
    undoAvailable: false,
  });
  const undo = await fixture.controller.handle('prepare', {
    action: 'undo',
    packageName: 'dsh-context',
  });
  assert.equal(undo.error.code, 'NO_PENDING_UNDO');
  assert.equal(fixture.calls.length, 1);
});

test('profile state exposes direct dependencies even when they are not Bundles', async () => {
  const { repoRoot, dshHome } = await profileFixture();
  const service = new ProfilePluginService({
    repoRoot,
    dshHome,
    dshBin: 'C:\\cache\\dsh\\lib\\bin.js',
    runProcess: async () => ({ stdout: '', stderr: '' }),
  });

  assert.deepEqual(await service.getPackageState('plain-library'), {
    exists: true,
    bundleRegistered: false,
    dependencySpec: '2.0.0',
    version: '2.0.0',
  });
  assert.deepEqual(await service.getPackageState('missing-package'), {
    exists: false,
    bundleRegistered: false,
    dependencySpec: undefined,
    version: undefined,
  });
});

test('service runs mutations through the current DSH binary with DSH_HOME', async () => {
  const { repoRoot, dshHome, profileDir } = await profileFixture();
  const calls = [];
  const service = new ProfilePluginService({
    repoRoot,
    dshHome,
    dshBin: 'D:\\npx-cache\\dsh\\lib\\bin.js',
    nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
    env: { SAFE_ENV: 'value' },
    runProcess: async (invocation) => {
      calls.push(invocation);
      return { stdout: 'ok', stderr: '' };
    },
  });

  await service.runMutation({
    action: 'change-version',
    packageName: '@scope/plugin',
    targetVersion: '1.2.3',
  });
  await service.runMutation({
    action: 'remove',
    packageName: '@scope/plugin',
  });

  assert.deepEqual(calls[0], {
    file: 'C:\\Program Files\\nodejs\\node.exe',
    args: [
      'D:\\npx-cache\\dsh\\lib\\bin.js',
      'plugin',
      '--profile',
      'web',
      'add',
      '--save-exact',
      '@scope/plugin@1.2.3',
    ],
    cwd: profileDir,
    env: { SAFE_ENV: 'value', DSH_HOME: dshHome },
    timeoutMs: 300_000,
  });
  assert.deepEqual(calls[1].args.slice(-2), ['remove', '@scope/plugin']);
  assert.equal(Object.hasOwn(calls[0].env, 'npm_config_registry'), false);
});

test('mutations inherit the configured registry through child process env', async () => {
  const { repoRoot, dshHome } = await profileFixture();
  const env = { SAFE_ENV: 'value' };
  const calls = [];
  const service = new ProfilePluginService({
    repoRoot,
    dshHome,
    dshBin: 'D:\\npx-cache\\dsh\\lib\\bin.js',
    nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
    env,
    getRegistryUrl: async () => 'https://registry.npmmirror.com/',
    runProcess: async (invocation) => {
      calls.push(invocation);
      return { stdout: 'ok', stderr: '' };
    },
  });

  await service.runMutation({
    action: 'change-version',
    packageName: '@scope/plugin',
    targetVersion: '1.2.3',
  });

  assert.equal(calls[0].env.npm_config_registry, 'https://registry.npmmirror.com/');
  assert.equal(calls[0].env.DSH_HOME, dshHome);
  assert.equal(Object.hasOwn(env, 'npm_config_registry'), false);
});

test('controller persists a plugin-scoped registry URL and rejects invalid values', async () => {
  const fixture = controllerFixture();
  const listed = await fixture.controller.handle('list');
  assert.deepEqual(listed.value.registry, {
    url: '',
    host: '',
    source: 'default',
  });

  const invalid = await fixture.controller.handle('set-registry', {
    url: 'https://user:token@registry.npmmirror.com',
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'INVALID_REGISTRY');
  assert.equal(fixture.registry(), '');

  const saved = await fixture.controller.handle('set-registry', {
    url: 'https://registry.npmmirror.com/',
  });
  assert.equal(saved.ok, true);
  assert.deepEqual(saved.value.registry, {
    url: 'https://registry.npmmirror.com/',
    host: 'registry.npmmirror.com',
    source: 'custom',
  });
  assert.equal(fixture.registry(), 'https://registry.npmmirror.com/');

  const next = await fixture.controller.handle('list');
  assert.deepEqual(next.value.registry, saved.value.registry);

  const prepared = await fixture.controller.handle('prepare', {
    action: 'add',
    spec: '@scope/plugin',
  });
  assert.deepEqual(prepared.value.operation.registry, saved.value.registry);

  const huawei = await fixture.controller.handle('set-registry', {
    url: 'https://mirrors.huaweicloud.com/repository/npm/',
  });
  assert.equal(huawei.ok, true);
  assert.equal(
    huawei.value.registry.url,
    'https://mirrors.huaweicloud.com/repository/npm/',
  );

  const tencent = await fixture.controller.handle('set-registry', {
    url: 'http://mirrors.cloud.tencent.com/npm/',
  });
  assert.equal(tencent.ok, true);
  assert.deepEqual(tencent.value.registry, {
    url: 'http://mirrors.cloud.tencent.com/npm/',
    host: 'mirrors.cloud.tencent.com',
    source: 'custom',
  });

  const cleared = await fixture.controller.handle('set-registry', { url: '' });
  assert.deepEqual(cleared.value.registry, {
    url: '',
    host: '',
    source: 'default',
  });
});

test('controller rejects registry changes while a plugin operation is running', async () => {
  const fixture = controllerFixture();
  const release = fixture.blockMutation();
  const prepared = await fixture.controller.handle('prepare', {
    action: 'add',
    spec: '@scope/plugin',
  });
  await fixture.controller.handle('execute', {
    approvalToken: prepared.value.approvalToken,
  });

  const busy = await fixture.controller.handle('set-registry', {
    url: 'https://registry.npmmirror.com',
  });
  assert.equal(busy.ok, false);
  assert.equal(busy.error.code, 'OPERATION_BUSY');
  assert.equal(fixture.registry(), '');

  release();
  await fixture.controller.waitForIdle();
});

test('process runner terminates a timed-out child process', async () => {
  await assert.rejects(
    runProcess({
      file: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 10_000)'],
      cwd: os.tmpdir(),
      timeoutMs: 50,
    }),
    { code: 'PROCESS_TIMEOUT' },
  );
});

test('plugin package exposes an authenticated localized DSH settings section', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const manifest = JSON.parse(await readFile(
    path.join(root, 'plugins', 'plugin-manager', 'package.json'),
    'utf8',
  ));
  const host = await readFile(
    path.join(root, 'plugins', 'plugin-manager', 'lib', 'index.js'),
    'utf8',
  );
  const client = await readFile(
    path.join(root, 'plugins', 'plugin-manager', 'lib', 'client.js'),
    'utf8',
  );

  assert.equal(manifest.name, '@team-dsh-plugins/plugin-manager');
  assert.equal(manifest.exports['./client'], './lib/client.js');
  assert.equal(manifest.dsh.client.platform, 'web');
  assert.match(host, /ctx\.connection\.rpc\.handle\(\s*['"]\/plugin-manager['"]/);
  assert.match(host, /ctx\.settings\.register\(\s*name/);
  assert.match(host, /registryUrl/);
  assert.match(client, /id:\s*["']@team-dsh-plugins\/plugin-manager["']/);
  assert.match(client, /settings\.section/);
  assert.match(client, /ctx\.locale\.register/);
  assert.match(client, /ctx\.connection\.rpc\.call\(["']\/plugin-manager["']/);
  assert.match(client, /set-registry/);
  assert.match(client, /registryHeading/);
  assert.match(client, /registry\.npmmirror\.com/);
  assert.match(client, /\bButton\b/);
  assert.match(client, /\bModal\b/);
  assert.match(client, /\bToast\b/);
  assert.match(client, /\bTooltip\b/);
  assert.match(client, /\bStateDot\b/);
  assert.match(client, /\bMenu\b/);
  assert.match(client, /dsh-context/);
  assert.doesNotMatch(client, /className:\s*["']pm-button/);
  assert.doesNotMatch(client, /className:\s*["']pm-dialog/);
  assert.doesNotMatch(client, /className:\s*["']pm-spinner/);
  assert.match(client, /--dsw-/);
  assert.match(client, /aria-label|aria-labelledby/);
  assert.match(client, /@media\s*\(max-width:/);
});
