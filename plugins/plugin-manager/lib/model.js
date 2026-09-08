import { createHash } from 'node:crypto';
import path from 'node:path';

const EXACT_SEMVER =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const NPM_PACKAGE =
  /^(?:@[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/)?[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;
const LIFECYCLE_SCRIPTS = new Set([
  'preinstall',
  'install',
  'postinstall',
  'prepublish',
  'preprepare',
  'prepare',
  'postprepare',
]);

function fail(message) {
  throw new TypeError(`plugin-manager: ${message}`);
}

function parseNameAndVersion(value) {
  if (value.startsWith('@')) {
    const separator = value.indexOf('@', 1);
    return separator < 0
      ? [value, undefined]
      : [value.slice(0, separator), value.slice(separator + 1)];
  }
  const separator = value.lastIndexOf('@');
  return separator < 0
    ? [value, undefined]
    : [value.slice(0, separator), value.slice(separator + 1)];
}

export function isExactSemver(value) {
  return typeof value === 'string' && EXACT_SEMVER.test(value);
}

export function isPackageName(value) {
  return typeof value === 'string'
    && value.length <= 214
    && NPM_PACKAGE.test(value);
}

export function parsePackageSpec(input) {
  if (typeof input !== 'string' || input !== input.trim() || input.length === 0) {
    fail('包名不能为空或包含首尾空白');
  }
  const [packageName, version] = parseNameAndVersion(input);
  if (!isPackageName(packageName)) fail('只接受合法 npm registry 包名');
  if (packageName.startsWith('@team-dsh-plugins/')) {
    fail('工作区插件不能通过此页面管理');
  }
  const requestedVersion = version || 'latest';
  if (requestedVersion !== 'latest' && !isExactSemver(requestedVersion)) {
    fail('版本只允许 latest 或精确 semver');
  }
  return { packageName, requestedVersion };
}

function safeHttpUrl(value) {
  if (typeof value !== 'string' || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

function validateBundlePatch(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    fail('目标包未声明 dsh.bundle.patch');
  }
  const portable = value.replaceAll('\\', '/');
  const normalized = path.posix.normalize(portable);
  if (
    path.posix.isAbsolute(portable)
    || path.win32.isAbsolute(value)
    || normalized === '..'
    || normalized.startsWith('../')
    || normalized.includes('\0')
  ) {
    fail('dsh.bundle.patch 路径必须位于插件包目录内');
  }
  return value;
}

export function validateRegistryMetadata(packageName, metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    fail('registry 返回了无效元数据');
  }
  if (metadata.name !== packageName) fail('registry 包身份不匹配');
  if (!isExactSemver(metadata.version)) fail('registry 未返回精确版本');
  const bundlePatch = validateBundlePatch(metadata.dsh?.bundle?.patch);
  const description = typeof metadata.description === 'string'
    ? metadata.description.replace(/[\u0000-\u001f\u007f]/gu, ' ').slice(0, 300)
    : '';
  const homepage = safeHttpUrl(metadata.homepage);
  const tarball = safeHttpUrl(metadata['dist.tarball'] ?? metadata.dist?.tarball);
  const scripts = metadata.scripts && typeof metadata.scripts === 'object'
    ? metadata.scripts
    : {};
  return {
    name: packageName,
    version: metadata.version,
    description,
    ...(homepage ? { homepage } : {}),
    registryHost: tarball ? new URL(tarball).host : '',
    lifecycleScripts: Object.keys(scripts)
      .filter((name) => LIFECYCLE_SCRIPTS.has(name) && typeof scripts[name] === 'string')
      .sort(),
    bundlePatch,
  };
}

export function operationFingerprint(operation) {
  const shape = {
    action: operation.action,
    packageName: operation.packageName,
    currentVersion: operation.currentVersion ?? null,
    targetVersion: operation.targetVersion ?? null,
  };
  return createHash('sha256').update(JSON.stringify(shape)).digest('hex');
}

export function redactProcessOutput(input, maximumLength = 2_000) {
  const limit = Number.isInteger(maximumLength) && maximumLength >= 32
    ? maximumLength
    : 2_000;
  let output = String(input ?? '')
    .replace(
      /(authorization\s*:\s*(?:bearer|basic)\s+)[^\s]+/giu,
      '$1<redacted>',
    )
    .replace(
      /((?:_authToken|token|password|secret)\s*[=:]\s*)[^\s&]+/giu,
      '$1<redacted>',
    )
    .replace(
      /([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^@\s/]+)@/giu,
      '$1<redacted>@',
    )
    .replace(/[A-Za-z]:\\[^\r\n"']+/gu, '<path>')
    .replace(/\/(?:home|Users)\/[^/\s]+\/[^\s"']*/gu, '<path>');
  if (output.length > limit) output = `${output.slice(0, limit - 1)}…`;
  return output;
}
