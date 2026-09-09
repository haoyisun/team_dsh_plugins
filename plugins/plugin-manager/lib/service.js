import {
  readFile,
} from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

import {
  isExactSemver,
  parsePackageSpec,
  redactProcessOutput,
  validateRegistryMetadata,
  validateRegistryUrl,
} from './model.js';

const VIEW_FIELDS = [
  'name',
  'version',
  'description',
  'homepage',
  'dist.tarball',
  'scripts',
  'dsh',
];

async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'));
}

async function readJsonIfPresent(filename) {
  try {
    return await readJson(filename);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function parsePnpmJson(output) {
  try {
    return JSON.parse(output);
  } catch {
    const matches = [...output.matchAll(/^(?:\{|\[)/gmu)];
    for (const match of matches.toReversed()) {
      try {
        return JSON.parse(output.slice(match.index).trim());
      } catch {
        // Windows pnpm shims may echo a command before the actual JSON.
      }
    }
    throw new TypeError('plugin-manager: registry 返回了无法解析的元数据');
  }
}

function packageParts(packageName) {
  return packageName.split('/');
}

function profileDirectory(dshHome) {
  return path.join(dshHome, 'profiles', 'web');
}

function assertInsidePackage(directory, relativePatch) {
  const filename = path.resolve(directory, relativePatch);
  const relative = path.relative(directory, filename);
  if (
    relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new TypeError('plugin-manager: dsh.bundle.patch 路径超出插件包目录');
  }
  return filename;
}

function activationOf(entries, disabledIds) {
  if (entries.length === 0) return 'unknown';
  const count = entries.filter((entry) => disabledIds.has(entry.id)).length;
  if (count === 0) return 'enabled';
  if (count === entries.length) return 'profile-disabled';
  return 'partially-disabled';
}

async function readDisabledIds(profileDir) {
  try {
    const patches = parse(
      await readFile(path.join(profileDir, 'cordis.patch.yml'), 'utf8'),
    );
    if (!Array.isArray(patches)) return new Set();
    return new Set(
      patches
        .filter((patch) => patch?.disabled === true && typeof patch.id === 'string')
        .map((patch) => patch.id),
    );
  } catch (error) {
    if (error.code === 'ENOENT') return new Set();
    return new Set();
  }
}

export function buildDshInvocation(
  nodeExecutable,
  dshBin,
  pluginArguments,
) {
  return {
    file: nodeExecutable,
    args: [
      dshBin,
      'plugin',
      '--profile',
      'web',
      ...pluginArguments,
    ],
  };
}

export function buildPnpmInvocation(
  args,
  platform = process.platform,
  env = process.env,
) {
  if (platform === 'win32') {
    return {
      file: env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm.cmd', ...args],
    };
  }
  return { file: 'pnpm', args };
}

export function registryEnv(baseEnv, registryUrl) {
  const env = { ...baseEnv };
  if (registryUrl) env.npm_config_registry = registryUrl;
  return env;
}

export class ProfilePluginService {
  #repoRoot;
  #dshHome;
  #profileDir;
  #dshBin;
  #nodeExecutable;
  #runProcess;
  #platform;
  #env;
  #getRegistryUrl;

  constructor({
    repoRoot,
    dshHome,
    dshBin,
    nodeExecutable = process.execPath,
    runProcess,
    platform = process.platform,
    env = process.env,
    getRegistryUrl = async () => '',
  }) {
    this.#repoRoot = repoRoot;
    this.#dshHome = dshHome;
    this.#profileDir = profileDirectory(dshHome);
    this.#dshBin = dshBin;
    this.#nodeExecutable = nodeExecutable;
    this.#runProcess = runProcess;
    this.#platform = platform;
    this.#env = env;
    this.#getRegistryUrl = getRegistryUrl;
  }

  async #registryUrl() {
    return validateRegistryUrl(await this.#getRegistryUrl());
  }

  async #installedPackage(packageName) {
    const candidates = [
      path.join(this.#profileDir, 'node_modules', ...packageParts(packageName)),
      path.join(
        this.#dshHome,
        'profiles',
        'node_modules',
        ...packageParts(packageName),
      ),
    ];
    for (const directory of candidates) {
      const manifest = await readJsonIfPresent(path.join(directory, 'package.json'));
      if (manifest) return { directory, manifest };
    }
    return undefined;
  }

  async #bundleDetails(packageName, declaredVersion, disabledIds) {
    const installed = await this.#installedPackage(packageName);
    if (!installed) {
      return {
        packageName,
        version: declaredVersion,
        health: 'broken',
        activation: 'unknown',
        entries: [],
        issue: '已注册但安装包不可解析',
      };
    }
    try {
      validateRegistryMetadata(packageName, installed.manifest);
      const patch = assertInsidePackage(
        installed.directory,
        installed.manifest.dsh.bundle.patch,
      );
      const patches = parse(await readFile(patch, 'utf8'));
      if (!Array.isArray(patches)) {
        throw new TypeError('dsh.bundle.patch 必须是数组');
      }
      const entries = patches.flatMap((item) =>
        Array.isArray(item?.insert)
          ? item.insert
            .filter((entry) =>
              typeof entry?.id === 'string' && typeof entry?.name === 'string')
            .map((entry) => ({ id: entry.id, name: entry.name }))
          : []);
      if (entries.length === 0) {
        throw new TypeError('dsh.bundle.patch 未插入任何有效 entry');
      }
      return {
        packageName,
        version: installed.manifest.version,
        health: 'ready',
        activation: activationOf(entries, disabledIds),
        entries,
      };
    } catch (error) {
      return {
        packageName,
        version: installed.manifest.version ?? declaredVersion,
        health: 'broken',
        activation: 'unknown',
        entries: [],
        issue: redactProcessOutput(error.message, 300),
      };
    }
  }

  async #workspacePlugins() {
    let entries;
    try {
      entries = parse(
        await readFile(path.join(this.#repoRoot, 'profiles', 'web.yml'), 'utf8'),
      );
    } catch {
      return [];
    }
    if (!Array.isArray(entries)) return [];
    return Promise.all(entries
      .filter((entry) =>
        typeof entry?.name === 'string'
        && entry.name.startsWith('@team-dsh-plugins/'))
      .map(async (entry) => {
        const folder = entry.name.slice('@team-dsh-plugins/'.length);
        const manifest = await readJsonIfPresent(
          path.join(this.#repoRoot, 'plugins', folder, 'package.json'),
        );
        return {
          packageName: entry.name,
          version: manifest?.version ?? '',
          kind: 'workspace',
          readOnly: true,
          health: manifest ? 'ready' : 'broken',
          activation: entry.disabled === true ? 'profile-disabled' : 'enabled',
          entries: [{ id: entry.id, name: entry.name }],
          ...(manifest ? {} : { issue: '工作区插件 manifest 不可读取' }),
        };
      }));
  }

  async listPlugins() {
    const manifest = await readJsonIfPresent(
      path.join(this.#profileDir, 'package.json'),
    ) ?? {};
    const dependencies = manifest.dependencies ?? {};
    const bundles = Array.isArray(manifest.dsh?.profile?.bundles)
      ? manifest.dsh.profile.bundles
      : [];
    const disabledIds = await readDisabledIds(this.#profileDir);
    const result = [];

    for (const packageName of bundles) {
      if (Object.hasOwn(dependencies, packageName)) {
        result.push({
          ...await this.#bundleDetails(
            packageName,
            dependencies[packageName],
            disabledIds,
          ),
          kind: packageName.startsWith('@team-dsh-plugins/')
            ? 'workspace'
            : 'external',
          readOnly: packageName.startsWith('@team-dsh-plugins/'),
        });
      } else {
        const installed = await this.#installedPackage(packageName);
        result.push({
          packageName,
          version: installed?.manifest?.version ?? '',
          kind: 'system',
          readOnly: true,
          health: installed ? 'ready' : 'unknown',
          activation: 'enabled',
          entries: [],
        });
      }
    }

    for (const [packageName, declaredVersion] of Object.entries(dependencies)) {
      if (bundles.includes(packageName)) continue;
      const installed = await this.#installedPackage(packageName);
      if (installed?.manifest?.dsh?.bundle?.patch === undefined) continue;
      result.push({
        ...await this.#bundleDetails(packageName, declaredVersion, disabledIds),
        kind: packageName.startsWith('@team-dsh-plugins/')
          ? 'workspace'
          : 'external',
        readOnly: packageName.startsWith('@team-dsh-plugins/'),
      });
    }

    const seen = new Set(result.map((plugin) => plugin.packageName));
    for (const plugin of await this.#workspacePlugins()) {
      if (!seen.has(plugin.packageName)) result.push(plugin);
    }
    return result.sort((left, right) =>
      left.kind.localeCompare(right.kind)
      || left.packageName.localeCompare(right.packageName));
  }

  async getPackageState(packageName) {
    const manifest = await readJsonIfPresent(
      path.join(this.#profileDir, 'package.json'),
    ) ?? {};
    const dependencies = manifest.dependencies ?? {};
    const bundles = Array.isArray(manifest.dsh?.profile?.bundles)
      ? manifest.dsh.profile.bundles
      : [];
    const exists = Object.hasOwn(dependencies, packageName);
    const installed = await this.#installedPackage(packageName);
    const dependencySpec = exists ? dependencies[packageName] : undefined;
    return {
      exists,
      bundleRegistered: bundles.includes(packageName),
      dependencySpec,
      version: installed?.manifest?.version
        ?? (isExactSemver(dependencySpec) ? dependencySpec : undefined),
    };
  }

  async resolvePackage(spec) {
    const parsed = typeof spec === 'string' ? parsePackageSpec(spec) : spec;
    const registryUrl = await this.#registryUrl();
    const invocation = buildPnpmInvocation(
      [
        'view',
        `${parsed.packageName}@${parsed.requestedVersion}`,
        ...VIEW_FIELDS,
        '--json',
        ...(registryUrl ? ['--registry', registryUrl] : []),
      ],
      this.#platform,
      this.#env,
    );
    const result = await this.#runProcess({
      ...invocation,
      cwd: this.#profileDir,
      env: registryEnv(this.#env, registryUrl),
    });
    let metadata;
    try {
      metadata = parsePnpmJson(result.stdout);
    } catch (error) {
      error.code = 'REGISTRY_METADATA_INVALID';
      throw error;
    }
    try {
      return validateRegistryMetadata(parsed.packageName, metadata);
    } catch (error) {
      error.code = /dsh\.bundle\.patch|Bundle/iu.test(error.message)
        ? 'INVALID_BUNDLE'
        : 'REGISTRY_METADATA_INVALID';
      throw error;
    }
  }

  async runMutation(operation) {
    let pluginArguments;
    if (
      operation.action === 'remove'
      || operation.action === 'undo-add'
      || operation.action === 'compensate-remove'
    ) {
      pluginArguments = ['remove', operation.packageName];
    } else {
      if (!isExactSemver(operation.targetVersion)) {
        throw new TypeError('plugin-manager: 目标版本必须是精确 semver');
      }
      pluginArguments = [
        'add',
        '--save-exact',
        `${operation.packageName}@${operation.targetVersion}`,
      ];
    }
    const registryUrl = await this.#registryUrl();
    const result = await this.#runProcess({
      ...buildDshInvocation(
        this.#nodeExecutable,
        this.#dshBin,
        pluginArguments,
      ),
      cwd: this.#profileDir,
      env: registryEnv({ ...this.#env, DSH_HOME: this.#dshHome }, registryUrl),
      timeoutMs: 5 * 60_000,
    });
    return redactProcessOutput(`${result.stdout}\n${result.stderr}`.trim());
  }
}
