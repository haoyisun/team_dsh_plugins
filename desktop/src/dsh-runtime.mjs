import { execFile, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  DshUrlParser,
  npmExecPowerShellLaunch,
  RedactedLineStream,
  redactSecrets,
} from './runtime-contract.mjs';

const execFileAsync = promisify(execFile);
const STARTUP_TIMEOUT_MS = 120_000;
const DIAGNOSTIC_LIMIT = 40_000;

function waitForExit(child) {
  return new Promise((resolve) => {
    child.once('exit', (...details) => resolve(details));
  });
}

async function waitForExitOrTimeout(exited, timeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      exited.then(() => true),
      new Promise((resolve) => {
        timeout = setTimeout(resolve, timeoutMs, false);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function findExecutable(name) {
  const { stdout } = await execFileAsync('where.exe', [name], {
    windowsHide: true,
    timeout: 10_000,
  });
  const executable = stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);
  if (!executable) throw new Error(`找不到 ${name}`);
  return executable;
}

export class DshRuntime extends EventEmitter {
  #accessFile;
  #closed = false;
  #current;
  #currentRunId;
  #diagnostics = '';
  #execFile;
  #forcedStopTimeoutMs;
  #gracefulStopTimeoutMs;
  #intentionalStops = new WeakSet();
  #logger;
  #nextRunId = 0;
  #npmCommand;
  #ownerPid;
  #powershellExecutable;
  #repoRoot;
  #spawnProcess;
  #startupTimeoutMs;
  #supervisorPath;

  constructor({
    accessFile = access,
    execFile = execFileAsync,
    forcedStopTimeoutMs = 2_000,
    gracefulStopTimeoutMs = 5_000,
    logger,
    npmCommand,
    ownerPid,
    powershellExecutable,
    repoRoot,
    spawnProcess = spawn,
    startupTimeoutMs = STARTUP_TIMEOUT_MS,
    supervisorPath,
  }) {
    super();
    this.#accessFile = accessFile;
    this.#execFile = execFile;
    this.#forcedStopTimeoutMs = forcedStopTimeoutMs;
    this.#gracefulStopTimeoutMs = gracefulStopTimeoutMs;
    this.#logger = logger;
    this.#npmCommand = npmCommand;
    this.#ownerPid = ownerPid;
    this.#powershellExecutable = powershellExecutable;
    this.#repoRoot = repoRoot;
    this.#spawnProcess = spawnProcess;
    this.#startupTimeoutMs = startupTimeoutMs;
    this.#supervisorPath = supervisorPath;
  }

  get running() {
    return Boolean(
      this.#current
      && this.#current.child.exitCode === null
      && this.#current.child.signalCode === null
    );
  }

  get currentRunId() {
    return this.#currentRunId;
  }

  get diagnostics() {
    return this.#diagnostics || '尚无 DSH 进程输出。';
  }

  async start(version) {
    if (this.#closed) throw new Error('DSH runtime 正在退出');
    if (this.running) throw new Error('DSH 已由当前 App 启动');
    const runId = ++this.#nextRunId;
    this.#currentRunId = runId;
    try {
      await this.#accessFile(this.#supervisorPath);
    } catch (error) {
      if (this.#currentRunId === runId) this.#currentRunId = undefined;
      throw error;
    }
    if (this.#closed || this.#currentRunId !== runId) {
      if (this.#currentRunId === runId) this.#currentRunId = undefined;
      throw new Error('DSH runtime 正在退出');
    }
    const launch = npmExecPowerShellLaunch({
      version,
      npmCommand: this.#npmCommand,
      powershellExecutable: this.#powershellExecutable,
      runnerScript: path.join(
        path.dirname(this.#supervisorPath),
        '..',
        'scripts',
        'run-npx.ps1',
      ),
    });
    const parser = new DshUrlParser();
    const diagnosticStream = new RedactedLineStream();
    const child = this.#spawnProcess(
      this.#supervisorPath,
      [
        '--parent-pid',
        String(this.#ownerPid),
        '--',
        launch.executable,
        ...launch.args,
      ],
      {
        cwd: this.#repoRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    const current = { child, runId };
    this.#current = current;
    this.#record('desktop', `启动 DSH ${version}`);

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        const timeoutError = new Error(
          'DSH 在 120 秒内没有报告启动地址',
        );
        void this.stop(runId).then(
          () => reject(timeoutError),
          (cleanupError) => reject(new AggregateError(
            [timeoutError, cleanupError],
            'DSH 启动超时且进程清理失败',
          )),
        );
      }, this.#startupTimeoutMs);

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback(value);
      };

      const consume = (source, chunk) => {
        const text = String(chunk);
        const safeOutput = diagnosticStream.push(text);
        if (safeOutput) this.#record(source, safeOutput);
        const url = parser.push(text);
        if (url) finish(resolve, { runId, url });
      };
      child.stdout.on('data', (chunk) => consume('stdout', chunk));
      child.stderr.on('data', (chunk) => consume('stderr', chunk));
      child.once('error', (error) => {
        if (settled) {
          this.#record(
            'desktop',
            `DSH supervisor 进程错误：${error.message}`,
          );
          return;
        }
        this.#intentionalStops.add(child);
        if (this.#current === current) {
          this.#current = undefined;
          this.#currentRunId = undefined;
        }
        finish(reject, new Error(`无法启动 DSH supervisor：${error.message}`));
      });
      child.once('exit', (code, signal) => {
        const remainder = diagnosticStream.flush();
        if (remainder) this.#record('output', remainder);
        if (this.#current === current) {
          this.#current = undefined;
          this.#currentRunId = undefined;
        }
        const reason = signal ? `signal ${signal}` : `exit code ${code}`;
        this.#record('desktop', `DSH 进程结束：${reason}`);
        if (!settled) {
          finish(reject, new Error(`DSH 启动前退出（${reason}）`));
        } else if (!this.#intentionalStops.has(child)) {
          this.emit('unexpected-exit', { code, runId, signal });
        }
      });
    });
  }

  async stop(runId = this.#current?.runId) {
    const current = this.#current;
    if (
      !current
      || current.child.exitCode !== null
      || current.child.signalCode !== null
      || current.runId !== runId
    ) {
      return false;
    }
    const { child } = current;

    this.#intentionalStops.add(child);
    const exited = waitForExit(child);
    try {
      child.kill();
    } catch (error) {
      this.#record('desktop', `无法请求 DSH 正常退出：${error.message}`);
    }
    const didExit = await waitForExitOrTimeout(
      exited,
      this.#gracefulStopTimeoutMs,
    );
    if (
      !didExit
      && child.exitCode === null
      && child.signalCode === null
    ) {
      let forceError;
      try {
        await this.#execFile(
          'taskkill.exe',
          ['/PID', String(child.pid), '/T', '/F'],
          { windowsHide: true, timeout: 10_000 },
        );
      } catch (error) {
        forceError = error;
      }
      const forcedExit = await waitForExitOrTimeout(
        exited,
        this.#forcedStopTimeoutMs,
      );
      if (
        !forcedExit
        && child.exitCode === null
        && child.signalCode === null
      ) {
        this.#intentionalStops.delete(child);
        const detail = forceError instanceof Error
          ? `：${forceError.message}`
          : '';
        throw new Error(`无法终止 DSH 进程树${detail}`);
      }
    }
    if (this.#current === current) {
      this.#current = undefined;
      this.#currentRunId = undefined;
    }
    return true;
  }

  async close() {
    this.#closed = true;
    await this.stop();
  }

  #record(source, value) {
    const safe = redactSecrets(value);
    this.#diagnostics = `${this.#diagnostics}${safe}`.slice(-DIAGNOSTIC_LIMIT);
    this.#logger?.write(source, safe);
  }
}
