import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';

const START_MARKER = '# >>> team-dsh-plugins managed include >>>';
const END_MARKER = '# <<< team-dsh-plugins managed include <<<';
const PLUGIN_SCOPE = '@team-dsh-plugins/';
const VERIFIED_DSH_VERSIONS = new Set(['0.1.0-rc.7']);

function profilePatchPath(dshHome) {
  return path.join(dshHome, 'profiles', 'web', 'cordis.patch.yml');
}

function scopeLinkPath(dshHome) {
  return path.join(dshHome, 'profiles', 'node_modules', '@team-dsh-plugins');
}

function workspaceScopeLinkPath(repoRoot) {
  return path.join(repoRoot, 'node_modules', '@team-dsh-plugins');
}

function managedBlock(repoRoot) {
  const registry = pathToFileURL(path.join(repoRoot, 'profiles', 'web.yml')).href;
  return [
    START_MARKER,
    '- insert:',
    '    - id: team-dsh-plugins-workspace',
    "      name: 'cordis:include'",
    '      config:',
    `        path: ${JSON.stringify(registry)}`,
    END_MARKER,
  ].join('\n');
}

function withoutManagedBlock(content) {
  const start = content.indexOf(START_MARKER);
  if (start < 0) return content;
  const end = content.indexOf(END_MARKER, start);
  if (end < 0) throw new Error('DSH profile patch contains an incomplete managed block');
  return `${content.slice(0, start)}${content.slice(end + END_MARKER.length)}`
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

async function exists(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function backupPatch(repoRoot, patchPath) {
  if (!(await exists(patchPath))) return;
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const backupDir = path.join(repoRoot, '.backups', stamp);
  await mkdir(backupDir, { recursive: true });
  await copyFile(patchPath, path.join(backupDir, 'cordis.patch.yml'));
}

async function ensureScopeLink(repoRoot, dshHome) {
  const target = path.resolve(repoRoot, 'plugins');
  const expected = await realpath(target);
  const links = [workspaceScopeLinkPath(repoRoot), scopeLinkPath(dshHome)];
  for (const link of links) {
    await mkdir(path.dirname(link), { recursive: true });
    const stat = await exists(link);
    if (stat) {
      if (!stat.isSymbolicLink()) {
        throw new Error(`Refusing to replace non-link path: ${link}`);
      }
      let actual;
      try {
        actual = await realpath(link);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (actual === expected) continue;
      await rm(link);
    }
    await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  }
}

export async function initWorkspace({ repoRoot, dshHome }) {
  const patchPath = profilePatchPath(dshHome);
  await mkdir(path.dirname(patchPath), { recursive: true });
  const current = (await exists(patchPath)) ? await readFile(patchPath, 'utf8') : '[]\n';
  const base = withoutManagedBlock(current);
  const block = managedBlock(repoRoot);
  const next = /^\s*(?:#.*\r?\n)*\s*\[\]\s*$/u.test(base)
    ? base.replace(/\[\]\s*$/u, `${block}\n`)
    : `${base.trimEnd()}\n\n${block}\n`;
  if (next !== current) {
    await backupPatch(repoRoot, patchPath);
    await writeFile(patchPath, next);
  }
  await ensureScopeLink(repoRoot, dshHome);
}

export async function unlinkWorkspace({ repoRoot, dshHome }) {
  const patchPath = profilePatchPath(dshHome);
  if (await exists(patchPath)) {
    const current = await readFile(patchPath, 'utf8');
    const next = `${withoutManagedBlock(current)}\n`;
    if (next !== current) {
      await backupPatch(repoRoot, patchPath);
      await writeFile(patchPath, next);
    }
  }

  const expected = await realpath(path.join(repoRoot, 'plugins'));
  for (const link of [workspaceScopeLinkPath(repoRoot), scopeLinkPath(dshHome)]) {
    const stat = await exists(link);
    if (!stat) continue;
    if (!stat.isSymbolicLink()) throw new Error(`Refusing to remove non-link path: ${link}`);
    if ((await realpath(link)) !== expected) {
      throw new Error(`Refusing to remove link owned by another workspace: ${link}`);
    }
    await rm(link);
  }
}

export async function validateWorkspace({ repoRoot }) {
  const errors = [];
  const warnings = [];
  let entries;
  try {
    entries = parse(await readFile(path.join(repoRoot, 'profiles', 'web.yml'), 'utf8'));
  } catch (error) {
    return { errors: [`无法读取 profiles/web.yml：${error.message}`], warnings };
  }
  if (!Array.isArray(entries)) {
    return { errors: ['profiles/web.yml 必须是插件条目数组'], warnings };
  }

  const ids = new Set();
  const names = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      errors.push('每个注册项都必须包含字符串 id 和 name');
      continue;
    }
    if (ids.has(entry.id)) errors.push(`重复的插件 id：${entry.id}`);
    if (names.has(entry.name)) errors.push(`重复的插件包名：${entry.name}`);
    ids.add(entry.id);
    names.add(entry.name);
    if (!entry.name.startsWith(PLUGIN_SCOPE)) {
      errors.push(`插件 ${entry.id} 必须使用 ${PLUGIN_SCOPE}<id> 包名`);
      continue;
    }

    const folder = entry.name.slice(PLUGIN_SCOPE.length);
    const packagePath = path.join(repoRoot, 'plugins', folder, 'package.json');
    let manifest;
    try {
      manifest = JSON.parse(await readFile(packagePath, 'utf8'));
    } catch (error) {
      errors.push(`插件 ${entry.id} 的 package.json 无法读取：${error.message}`);
      continue;
    }
    if (manifest.name !== entry.name) {
      errors.push(`插件 ${entry.id} 的注册包名与 package.json name 不一致`);
    }

    if (manifest.dsh?.client?.platform !== 'web') continue;
    const clientExport = manifest.exports?.['./client'];
    const relativeClient =
      typeof clientExport === 'string' ? clientExport : clientExport?.default;
    if (typeof relativeClient !== 'string') {
      errors.push(`插件 ${entry.id} 声明了 Web Client，但未导出 ./client`);
      continue;
    }
    try {
      const client = await readFile(path.join(path.dirname(packagePath), relativeClient), 'utf8');
      const moduleId = client.match(/__ModuleLoader__\.load\(\{\s*id:\s*["']([^"']+)["']/u)?.[1];
      if (moduleId !== entry.name) {
        errors.push(`插件 ${entry.id} 的 client module id 必须是 ${entry.name}`);
      }
    } catch (error) {
      errors.push(`插件 ${entry.id} 的 Client bundle 无法读取：${error.message}`);
    }
  }
  return { errors, warnings };
}

export function compatibilityStatus(version) {
  if (VERIFIED_DSH_VERSIONS.has(version)) return { supported: true };
  return {
    supported: false,
    warning: `DSH ${version} 尚未经过本仓库验证；将继续运行。`,
  };
}

export function dshVersionProbe(platform = process.platform, env = process.env) {
  const command = 'npm view @deepseek-ai/dsh version --json';
  if (platform === 'win32') {
    return {
      file: env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', command],
    };
  }
  return {
    file: 'npm',
    args: ['view', '@deepseek-ai/dsh', 'version', '--json'],
  };
}

export async function doctorWorkspace({ repoRoot, dshHome, dshVersion }) {
  const result = await validateWorkspace({ repoRoot });
  const errors = [...result.errors];
  const warnings = [...result.warnings];
  const patchPath = profilePatchPath(dshHome);
  try {
    const patch = await readFile(patchPath, 'utf8');
    if (!patch.includes(START_MARKER) || !patch.includes(END_MARKER)) {
      errors.push('Web Profile 尚未接入 team-dsh-plugins 注册表');
    }
  } catch (error) {
    errors.push(`无法读取 Web Profile patch：${error.message}`);
  }

  for (const link of [workspaceScopeLinkPath(repoRoot), scopeLinkPath(dshHome)]) {
    try {
      if ((await realpath(link)) !== (await realpath(path.join(repoRoot, 'plugins')))) {
        errors.push(`插件 scope 链接未指向当前仓库：${link}`);
      }
    } catch (error) {
      errors.push(`插件 scope 链接不可用：${error.message}`);
    }
  }

  if (dshVersion) {
    const compatibility = compatibilityStatus(dshVersion);
    if (!compatibility.supported) warnings.push(compatibility.warning);
  } else {
    warnings.push('未能检测 DSH 版本；仓库校验仍继续。');
  }
  return { errors, warnings };
}

export const workspacePaths = {
  profilePatchPath,
  scopeLinkPath,
  workspaceScopeLinkPath,
};
