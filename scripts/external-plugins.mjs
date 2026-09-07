import { execFile } from 'node:child_process';
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse, stringify } from 'yaml';

const execFileAsync = promisify(execFile);
const REGISTRY_FILENAME = 'web.external.yml';
const START_MARKER = '# >>> team-dsh-plugins managed external overrides >>>';
const END_MARKER = '# <<< team-dsh-plugins managed external overrides <<<';
const EXACT_SEMVER =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const NPM_PACKAGE =
  /^(?:@[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/)?[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;

function registryPath(repoRoot) {
  return path.join(repoRoot, 'profiles', REGISTRY_FILENAME);
}

function profileDir(dshHome) {
  return path.join(dshHome, 'profiles', 'web');
}

function profilePatchPath(dshHome) {
  return path.join(profileDir(dshHome), 'cordis.patch.yml');
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

export async function readExternalRegistry({ repoRoot }) {
  const data = parse(await readFile(registryPath(repoRoot), 'utf8'));
  if (!Array.isArray(data)) {
    throw new TypeError(`profiles/${REGISTRY_FILENAME} 必须是插件条目数组`);
  }
  return data;
}

export function validateExternalRegistry(entries) {
  const errors = [];
  const packages = new Set();
  const entryIds = new Set();

  if (!Array.isArray(entries)) {
    return {
      errors: [`profiles/${REGISTRY_FILENAME} 必须是插件条目数组`],
      warnings: [],
    };
  }

  for (const [index, entry] of entries.entries()) {
    const label = `外源插件条目 ${index + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${label} 必须是对象`);
      continue;
    }

    const packageName = entry.package;
    if (!isNonEmptyString(packageName) || packageName.length > 214 || !NPM_PACKAGE.test(packageName)) {
      errors.push(`${label} 必须包含合法的 npm registry 包名 package`);
    } else {
      if (packageName.startsWith('@team-dsh-plugins/')) {
        errors.push(`${label} 不得使用工作区 scope @team-dsh-plugins/*`);
      }
      if (packages.has(packageName)) errors.push(`重复的外源插件包名：${packageName}`);
      packages.add(packageName);
    }

    if (!isNonEmptyString(entry.version) || !EXACT_SEMVER.test(entry.version)) {
      errors.push(`${label} 的 version 必须是精确 semver`);
    }
    if (entry.disabled !== undefined && typeof entry.disabled !== 'boolean') {
      errors.push(`${label} 的 disabled 必须是布尔值`);
    }
    if (!Array.isArray(entry.entries) || entry.entries.length === 0) {
      errors.push(`${label} 必须显式声明至少一个 Bundle entry`);
      continue;
    }

    for (const bundleEntry of entry.entries) {
      if (
        !bundleEntry
        || typeof bundleEntry !== 'object'
        || !isNonEmptyString(bundleEntry.id)
        || !isNonEmptyString(bundleEntry.name)
      ) {
        errors.push(`${label} 的每个 Bundle entry 都必须包含字符串 id 和 name`);
        continue;
      }
      if (entryIds.has(bundleEntry.id)) {
        errors.push(`重复的外源 entry id：${bundleEntry.id}`);
      }
      entryIds.add(bundleEntry.id);
    }
  }

  return { errors, warnings: [] };
}

export function buildDshPluginAddInvocation(
  packageName,
  version,
  platform = process.platform,
  env = process.env,
) {
  const args = [
    '--yes',
    '@deepseek-ai/dsh',
    'plugin',
    '--profile',
    'web',
    'add',
    '--save-exact',
    `${packageName}@${version}`,
  ];
  if (platform === 'win32') {
    return {
      file: env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npx.cmd', ...args],
    };
  }
  return {
    file: 'npx',
    args,
  };
}

async function defaultRunDshPlugin({ packageName, version, dshHome }) {
  const invocation = buildDshPluginAddInvocation(packageName, version);
  await execFileAsync(invocation.file, invocation.args, {
    env: { ...process.env, DSH_HOME: dshHome },
    timeout: 5 * 60_000,
  });
}

async function readInstalledManifest(dshHome, packageName) {
  const parts = packageName.split('/');
  const candidates = [
    path.join(profileDir(dshHome), 'node_modules', ...parts, 'package.json'),
    path.join(dshHome, 'profiles', 'node_modules', ...parts, 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      return {
        directory: path.dirname(candidate),
        manifest: JSON.parse(await readFile(candidate, 'utf8')),
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return undefined;
}

async function readProfileManifest(dshHome) {
  try {
    return JSON.parse(
      await readFile(path.join(profileDir(dshHome), 'package.json'), 'utf8'),
    );
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function isRegisteredProfileBundle(manifest, plugin) {
  return manifest.dependencies?.[plugin.package] === plugin.version
    && manifest.dsh?.profile?.bundles?.includes(plugin.package);
}

async function readBundleEntries(installed) {
  const relativePatch = installed.manifest.dsh?.bundle?.patch;
  if (!isNonEmptyString(relativePatch) || path.isAbsolute(relativePatch)) {
    throw new Error('未声明安全的相对 dsh.bundle patch');
  }
  const filename = path.resolve(installed.directory, relativePatch);
  const relative = path.relative(installed.directory, filename);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('dsh.bundle patch 超出插件包目录');
  }
  const patches = parse(await readFile(filename, 'utf8'));
  if (!Array.isArray(patches)) throw new Error('dsh.bundle patch 必须是数组');

  const entries = [];
  for (const patch of patches) {
    if (!Array.isArray(patch?.insert)) continue;
    for (const entry of patch.insert) {
      if (!isNonEmptyString(entry?.id) || !isNonEmptyString(entry?.name)) {
        throw new Error('dsh.bundle 插入项必须包含稳定的 id 和 name');
      }
      entries.push({ id: entry.id, name: entry.name });
    }
  }
  return entries;
}

async function bundleEntriesIssue(installed, plugin) {
  try {
    const actual = await readBundleEntries(installed);
    const normalize = (entries) => entries
      .map(({ id, name }) => `${id}\0${name}`)
      .sort();
    if (JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(plugin.entries))) {
      return 'Bundle entries 与声明不一致';
    }
  } catch (error) {
    return `无法校验 Bundle entries：${error.message}`;
  }
  return undefined;
}

async function installedPluginIssue(installed, plugin) {
  if (
    installed?.manifest?.name !== plugin.package
    || installed.manifest.version !== plugin.version
    || !isNonEmptyString(installed.manifest.dsh?.bundle?.patch)
  ) {
    return '安装结果无效或未声明 dsh.bundle';
  }
  return bundleEntriesIssue(installed, plugin);
}

async function unmanagedPluginWarnings(dshHome, entries) {
  const manifest = await readProfileManifest(dshHome);
  const declared = new Set(entries.map((plugin) => plugin.package));
  const warnings = [];
  for (const packageName of Object.keys(manifest.dependencies ?? {})) {
    if (declared.has(packageName)) continue;
    const installed = await readInstalledManifest(dshHome, packageName);
    if (isNonEmptyString(installed?.manifest?.dsh?.bundle?.patch)) {
      warnings.push(`外源插件 ${packageName} 已脱离仓库管理；保留当前安装和启停状态`);
    }
  }
  return warnings;
}

function extractManagedPatches(content) {
  const start = content.indexOf(START_MARKER);
  if (start < 0) return [];
  const end = content.indexOf(END_MARKER, start);
  if (end < 0) throw new Error('DSH profile patch contains an incomplete external managed block');
  const body = content.slice(start + START_MARKER.length, end).trim();
  if (!body) return [];
  const patches = parse(body);
  if (!Array.isArray(patches)) throw new Error('DSH external managed block must contain a patch array');
  return patches;
}

function withoutManagedBlock(content) {
  const start = content.indexOf(START_MARKER);
  if (start < 0) return content;
  const end = content.indexOf(END_MARKER, start);
  if (end < 0) throw new Error('DSH profile patch contains an incomplete external managed block');
  return `${content.slice(0, start)}${content.slice(end + END_MARKER.length)}`
    .replace(/\n{3,}/gu, '\n\n')
    .trimEnd();
}

function managedPatchMap(content) {
  const managed = new Map();
  for (const patch of extractManagedPatches(content)) {
    if (isNonEmptyString(patch?.id) && patch.disabled === true) {
      managed.set(patch.id, patch);
    }
  }
  return managed;
}

function renderManagedPatch(content, entries) {
  const managed = managedPatchMap(content);
  const declaredIds = new Set();
  for (const plugin of entries) {
    for (const entry of plugin.entries) {
      declaredIds.add(entry.id);
      if (plugin.disabled) {
        managed.set(entry.id, { id: entry.id, name: entry.name, disabled: true });
      } else {
        managed.delete(entry.id);
      }
    }
  }

  const warnings = [...managed.keys()]
    .filter((id) => !declaredIds.has(id))
    .map((id) => `外源 entry ${id} 已脱离仓库管理；保留最后的禁用状态`);
  const base = withoutManagedBlock(content);
  if (managed.size === 0) {
    const parsed = parse(base);
    if (parsed != null && !Array.isArray(parsed)) {
      throw new Error('DSH profile patch must contain a patch array');
    }
    const trimmed = base.trimEnd();
    const empty = parsed == null
      ? `${trimmed}${trimmed ? '\n' : ''}[]`
      : base;
    return { content: `${empty.trimEnd()}\n`, warnings };
  }

  const block = [
    START_MARKER,
    stringify([...managed.values()]).trimEnd(),
    END_MARKER,
  ].join('\n');
  const next = /^\s*(?:#.*\r?\n)*\s*\[\]\s*$/u.test(base)
    ? base.replace(/\[\]\s*$/u, block)
    : `${base.trimEnd()}\n\n${block}`;
  return { content: `${next}\n`, warnings };
}

async function backupAndWrite(repoRoot, target, content) {
  let current;
  try {
    current = await readFile(target, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (current === content) return;

  if (current !== undefined) {
    const stamp = new Date().toISOString().replaceAll(':', '-');
    const backupDir = path.join(repoRoot, '.backups', stamp);
    await mkdir(backupDir, { recursive: true });
    await copyFile(target, path.join(backupDir, 'cordis.patch.yml'));
  }
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, target);
}

export async function syncExternalPlugins({
  repoRoot,
  dshHome,
  runDshPlugin = defaultRunDshPlugin,
}) {
  const entries = await readExternalRegistry({ repoRoot });
  const validation = validateExternalRegistry(entries);
  if (validation.errors.length > 0) {
    throw new Error(validation.errors.join('\n'));
  }

  const actions = [];
  let profileManifest = await readProfileManifest(dshHome);
  for (const plugin of entries) {
    let installed = await readInstalledManifest(dshHome, plugin.package);
    if (
      installed?.manifest.version !== plugin.version
      || !isRegisteredProfileBundle(profileManifest, plugin)
    ) {
      await runDshPlugin({
        packageName: plugin.package,
        version: plugin.version,
        dshHome,
      });
      installed = await readInstalledManifest(dshHome, plugin.package);
      profileManifest = await readProfileManifest(dshHome);
      actions.push(`${plugin.package}@${plugin.version}`);
    }
    const issue = await installedPluginIssue(installed, plugin);
    if (issue) {
      throw new Error(`外源插件 ${plugin.package}@${plugin.version} ${issue}`);
    }
    if (!isRegisteredProfileBundle(profileManifest, plugin)) {
      throw new Error(`外源插件 ${plugin.package}@${plugin.version} 未作为精确直接依赖注册到 Web Profile Bundle`);
    }
  }

  const patchPath = profilePatchPath(dshHome);
  let current = '[]\n';
  try {
    current = await readFile(patchPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const rendered = renderManagedPatch(current, entries);
  await backupAndWrite(repoRoot, patchPath, rendered.content);
  return {
    errors: [],
    warnings: [
      ...new Set([
        ...rendered.warnings,
        ...await unmanagedPluginWarnings(dshHome, entries),
      ]),
    ],
    actions,
  };
}

export async function diagnoseExternalPlugins({ repoRoot, dshHome }) {
  const errors = [];
  const warnings = [];
  let entries;
  try {
    entries = await readExternalRegistry({ repoRoot });
  } catch (error) {
    return { errors: [`无法读取 profiles/${REGISTRY_FILENAME}：${error.message}`], warnings };
  }
  const validation = validateExternalRegistry(entries);
  errors.push(...validation.errors);
  warnings.push(...validation.warnings);
  if (errors.length > 0) return { errors, warnings };

  let patch = '[]\n';
  try {
    patch = await readFile(profilePatchPath(dshHome), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      errors.push(`无法读取 Web Profile patch：${error.message}`);
      return { errors, warnings };
    }
  }

  let managed;
  try {
    managed = managedPatchMap(patch);
  } catch (error) {
    errors.push(error.message);
    return { errors, warnings };
  }
  const declaredIds = new Set(entries.flatMap((plugin) => plugin.entries.map((entry) => entry.id)));
  const profileManifest = await readProfileManifest(dshHome);

  for (const plugin of entries) {
    const installed = await readInstalledManifest(dshHome, plugin.package);
    if (!installed) {
      errors.push(`外源插件 ${plugin.package}@${plugin.version} 尚未安装`);
    } else {
      if (installed.manifest.name !== plugin.package) {
        errors.push(`外源插件 ${plugin.package} 的安装包身份不匹配`);
      }
      if (installed.manifest.version !== plugin.version) {
        errors.push(
          `外源插件 ${plugin.package} 版本漂移：声明 ${plugin.version}，实际 ${installed.manifest.version}`,
        );
      }
      if (!isNonEmptyString(installed.manifest.dsh?.bundle?.patch)) {
        errors.push(`外源插件 ${plugin.package} 未声明 dsh.bundle`);
      } else {
        const issue = await bundleEntriesIssue(installed, plugin);
        if (issue) errors.push(`外源插件 ${plugin.package} ${issue}`);
      }
    }
    if (profileManifest.dependencies?.[plugin.package] !== plugin.version) {
      errors.push(`外源插件 ${plugin.package} 不是 Web Profile 的精确直接依赖`);
    }
    if (!profileManifest.dsh?.profile?.bundles?.includes(plugin.package)) {
      errors.push(`外源插件 ${plugin.package} 未注册到 Web Profile Bundle`);
    }

    for (const entry of plugin.entries) {
      const override = managed.get(entry.id);
      if (plugin.disabled && (override?.name !== entry.name || override.disabled !== true)) {
        errors.push(`外源 entry ${entry.id} 的禁用覆盖缺失`);
      }
      if (!plugin.disabled && override?.disabled === true) {
        errors.push(`外源 entry ${entry.id} 仍被受管覆盖禁用`);
      }
    }
  }

  for (const id of managed.keys()) {
    if (!declaredIds.has(id)) {
      warnings.push(`外源 entry ${id} 已脱离仓库管理；保留最后的禁用状态`);
    }
  }
  warnings.push(...await unmanagedPluginWarnings(dshHome, entries));
  return { errors, warnings };
}

export const externalPluginPaths = {
  profilePatchPath,
  registryPath,
};
