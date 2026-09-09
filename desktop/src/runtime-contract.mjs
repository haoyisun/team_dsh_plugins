import { isExactDshVersion } from './dsh-release.mjs';

const MAX_STARTUP_BUFFER = 16_384;
const DSH_URL_PATTERN = /dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/?\?token=[^\s]+)/i;

function parseDshUrl(candidate) {
  try {
    const url = new URL(candidate);
    const port = Number(url.port);
    if (
      url.protocol !== 'http:'
      || url.hostname !== '127.0.0.1'
      || !Number.isInteger(port)
      || port < 1
      || port > 65_535
      || !url.searchParams.get('token')
    ) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

export class DshUrlParser {
  #buffer = '';

  push(chunk) {
    this.#buffer = `${this.#buffer}${String(chunk)}`.slice(-MAX_STARTUP_BUFFER);
    const match = this.#buffer.match(DSH_URL_PATTERN);
    return match ? parseDshUrl(match[1]) : undefined;
  }
}

export function redactSecrets(value) {
  return String(value)
    .replace(/(\btoken\s*[:=]\s*)[^\s&]+/gi, '$1[REDACTED]')
    .replace(/([?&]token=)[^&\s]+/gi, '$1[REDACTED]');
}

export class RedactedLineStream {
  #buffer = '';
  #dropping = false;
  #maxLineLength;

  constructor({ maxLineLength = 16_384 } = {}) {
    this.#maxLineLength = maxLineLength;
  }

  push(chunk) {
    let input = String(chunk);
    let output = '';
    if (this.#dropping) {
      const newline = input.indexOf('\n');
      if (newline === -1) return '';
      input = input.slice(newline + 1);
      this.#dropping = false;
    }

    this.#buffer += input;
    while (true) {
      const newline = this.#buffer.indexOf('\n');
      if (newline === -1) break;
      const line = this.#buffer.slice(0, newline + 1);
      this.#buffer = this.#buffer.slice(newline + 1);
      output += line.length > this.#maxLineLength
        ? '[省略过长输出行]\n'
        : redactSecrets(line);
    }

    if (this.#buffer.length > this.#maxLineLength) {
      this.#buffer = '';
      this.#dropping = true;
      output += '[省略过长输出行]\n';
    }
    return output;
  }

  flush() {
    if (this.#dropping) {
      this.#dropping = false;
      return '';
    }
    const output = redactSecrets(this.#buffer);
    this.#buffer = '';
    return output;
  }
}

export function isAllowedDshNavigation(candidate, expectedOrigin) {
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' && url.origin === expectedOrigin;
  } catch {
    return false;
  }
}

export function externalHttpUrl(candidate) {
  const raw = String(candidate);
  if (raw.length > 2_081) return undefined;
  try {
    const url = new URL(raw);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:')
      || url.username
      || url.password
      || url.href.length > 2_081
    ) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

function isOfficialDshListener(process) {
  if (process.name.toLowerCase() !== 'node.exe') return false;
  const invocation = process.commandLine.match(
    /^\s*(?:"([^"]+)"|(\S+))\s+(?:"([^"]+)"|(\S+))\s+web(?=\s|$)/i,
  );
  if (!invocation) return false;
  const executable = (invocation[1] || invocation[2])
    .replaceAll('\\', '/')
    .split('/')
    .at(-1)
    .toLowerCase();
  const script = (invocation[3] || invocation[4])
    .replaceAll('\\', '/')
    .toLowerCase();
  return (
    (executable === 'node' || executable === 'node.exe')
    && script.endsWith('/@deepseek-ai/dsh/lib/bin.js')
  );
}

export function classifyListenerProcess(listenerPid, processes) {
  const byPid = new Map(processes.map((process) => [process.pid, process]));
  const listener = byPid.get(listenerPid);
  const unknown = {
    kind: 'unknown',
    listenerPid,
    commandLine: listener?.commandLine || listener?.name || '无法读取命令行',
  };

  if (!listener) return unknown;
  if (!listener.creationTime || !isOfficialDshListener(listener)) return unknown;
  return {
    kind: 'dsh',
    listenerPid,
    listenerCreationTime: listener.creationTime,
    rootPid: listenerPid,
    commandLine: listener.commandLine || listener.name || 'DSH Web',
    rootCommandLine: listener.commandLine,
  };
}

export function normalizeProcessInspection(value) {
  if (!value || typeof value !== 'object') {
    throw new TypeError('无法读取端口监听进程');
  }
  if (value.listenerPid === null) {
    return { listenerPid: null, processes: [] };
  }

  const listenerPid = Number(value.listenerPid);
  if (!Number.isInteger(listenerPid) || listenerPid < 1) {
    throw new TypeError('监听进程 PID 无效');
  }
  if (!Array.isArray(value.processes)) {
    throw new TypeError('监听进程列表无效');
  }

  const processes = value.processes.map((process) => {
    const pid = Number(process?.pid);
    const parentPid = Number(process?.parentPid);
    if (!Number.isInteger(pid) || pid < 1 || !Number.isInteger(parentPid)) {
      throw new TypeError('监听进程列表包含无效 PID');
    }
    return {
      pid,
      parentPid,
      name: typeof process.name === 'string' ? process.name : '',
      commandLine: typeof process.commandLine === 'string'
        ? process.commandLine
        : '',
      creationTime: typeof process.creationTime === 'string'
        ? process.creationTime
        : '',
    };
  });

  return { listenerPid, processes };
}

export function matchesDshInspection(expected, current) {
  return (
    expected?.kind === 'dsh'
    && current?.kind === 'dsh'
    && expected.port === current.port
    && expected.listenerPid === current.listenerPid
    && expected.listenerCreationTime === current.listenerCreationTime
    && expected.rootPid === current.rootPid
    && expected.rootCommandLine === current.rootCommandLine
  );
}

export function dshExecArgs(version) {
  if (!isExactDshVersion(version)) {
    throw new TypeError('DSH 启动版本必须是精确 semver');
  }
  return [
    '--yes',
    `@deepseek-ai/dsh@${version}`,
    'web',
    '--no-open',
  ];
}

export function npmExecPowerShellLaunch({
  version,
  npmCommand,
  powershellExecutable,
  runnerScript,
}) {
  dshExecArgs(version);
  return {
    executable: powershellExecutable,
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      runnerScript,
      npmCommand,
      version,
    ],
  };
}
