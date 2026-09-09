import { execFile as execFileCallback } from 'node:child_process';
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import semver from 'semver';

const execFileAsync = promisify(execFileCallback);
const RELEASE_SCHEMA_VERSION = 1;
const MAX_RELEASE_FILE_BYTES = 4_096;
const NPM_METADATA_TIMEOUT_MS = 15_000;
const fileDirectory = path.dirname(fileURLToPath(import.meta.url));
const npmMetadataRunner = path.resolve(
  fileDirectory,
  '..',
  'scripts',
  'query-dsh-latest.ps1',
);

function releaseError(message) {
  return new TypeError(`DSH Desktop: ${message}`);
}

export function isExactDshVersion(value) {
  return (
    typeof value === 'string'
    && semver.valid(value) === value
  );
}

function requireExactDshVersion(value) {
  if (!isExactDshVersion(value)) {
    throw releaseError('DSH 版本必须是精确 semver');
  }
  return value;
}

export function isNewerDshVersion(candidate, current) {
  return semver.gt(
    requireExactDshVersion(candidate),
    requireExactDshVersion(current),
  );
}

function parseReleaseDocument(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    throw releaseError('版本记录损坏，无法解析 JSON');
  }
  const keys = document && typeof document === 'object'
    ? Object.keys(document).sort()
    : [];
  if (
    Array.isArray(document)
    || keys.join(',') !== 'schemaVersion,selectedVersion,updatedAt'
    || document.schemaVersion !== RELEASE_SCHEMA_VERSION
    || !isExactDshVersion(document.selectedVersion)
    || typeof document.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(document.updatedAt))
    || new Date(document.updatedAt).toISOString() !== document.updatedAt
  ) {
    throw releaseError('版本记录损坏或包含不受支持的字段');
  }
  return document.selectedVersion;
}

export class DshReleaseStore {
  #file;
  #now;

  constructor(file, { now = () => new Date() } = {}) {
    this.#file = file;
    this.#now = now;
  }

  async read() {
    let details;
    try {
      details = await stat(this.#file);
    } catch (error) {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    }
    if (!details.isFile()) {
      throw releaseError('版本记录不是普通文件');
    }
    if (details.size > MAX_RELEASE_FILE_BYTES) {
      throw releaseError('版本记录过大');
    }
    const contents = await readFile(this.#file);
    if (contents.length > MAX_RELEASE_FILE_BYTES) {
      throw releaseError('版本记录过大');
    }
    return parseReleaseDocument(contents.toString('utf8'));
  }

  async write(version) {
    const selectedVersion = requireExactDshVersion(version);
    const directory = path.dirname(this.#file);
    const temporary = `${this.#file}.${process.pid}.${Date.now()}.tmp`;
    const document = {
      schemaVersion: RELEASE_SCHEMA_VERSION,
      selectedVersion,
      updatedAt: this.#now().toISOString(),
    };
    await mkdir(directory, { recursive: true });
    try {
      await writeFile(
        temporary,
        `${JSON.stringify(document, null, 2)}\n`,
        { encoding: 'utf8', flag: 'wx' },
      );
      await rename(temporary, this.#file);
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  }
}

export async function queryLatestDshVersion({
  npmCommand,
  powershellCommand,
  execFile = execFileAsync,
}) {
  if (typeof npmCommand !== 'string' || npmCommand.length === 0) {
    throw releaseError('找不到 npm.cmd');
  }
  if (
    typeof powershellCommand !== 'string'
    || powershellCommand.length === 0
  ) {
    throw releaseError('找不到 powershell.exe');
  }
  const { stdout } = await execFile(
    powershellCommand,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      npmMetadataRunner,
      npmCommand,
    ],
    {
      windowsHide: true,
      timeout: NPM_METADATA_TIMEOUT_MS,
      maxBuffer: MAX_RELEASE_FILE_BYTES,
    },
  );
  let version;
  try {
    version = JSON.parse(String(stdout));
  } catch {
    throw releaseError('npm registry 返回了无法解析的版本信息');
  }
  if (!isExactDshVersion(version)) {
    throw releaseError('npm registry 返回了无效版本');
  }
  return version;
}

export async function chooseDshReleaseForStartup({
  storedVersion,
  queryLatest,
  confirm,
}) {
  if (storedVersion !== undefined) {
    return {
      version: requireExactDshVersion(storedVersion),
      needsCommit: false,
    };
  }
  const latestVersion = requireExactDshVersion(await queryLatest());
  if (!await confirm(latestVersion)) return undefined;
  return { version: latestVersion, needsCommit: true };
}

export class DshReleaseRollbackError extends Error {
  constructor(updateError, rollbackError) {
    super(
      `升级失败：${updateError.message}；恢复上一版本也失败：${rollbackError.message}`,
      { cause: updateError },
    );
    this.name = 'DshReleaseRollbackError';
    this.rollbackError = rollbackError;
  }
}

export async function activateDshRelease({
  targetVersion,
  previousVersion,
  stop,
  start,
  load,
  commit,
  validate = async () => {},
}) {
  const target = requireExactDshVersion(targetVersion);
  const previous = previousVersion === undefined
    ? undefined
    : requireExactDshVersion(previousVersion);

  await stop();
  let committed = false;
  try {
    const url = await start(target);
    await load(url);
    await commit(target);
    committed = true;
    await validate(target);
    return { status: 'activated', version: target };
  } catch (updateError) {
    await stop().catch(() => {});
    if (!previous || previous === target) throw updateError;
    try {
      const previousUrl = await start(previous);
      await load(previousUrl);
      if (committed) await commit(previous);
      return {
        status: 'rolled-back',
        version: previous,
        error: updateError,
      };
    } catch (rollbackError) {
      throw new DshReleaseRollbackError(updateError, rollbackError);
    }
  }
}
