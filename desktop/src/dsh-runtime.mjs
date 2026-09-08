import { execFile, spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

import {
  DshUrlParser,
  npxPowerShellLaunch,
  RedactedLineStream,
  redactSecrets,
} from './runtime-contract.mjs';

const execFileAsync = promisify(execFile);
const STARTUP_TIMEOUT_MS = 120_000;
const DIAGNOSTIC_LIMIT = 40_000;

async function firstExecutable(name) {
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

async function resolveNpxLaunch(mode, runnerScript) {
  const npxCommand = await firstExecutable('npx.cmd');
  const powershellExecutable = await firstExecutable('powershell.exe');
  return npxPowerShellLaunch({
    mode,
    npxCommand,
    powershellExecutable,
    runnerScript,
  });
}

export class DshRuntime extends EventEmitter {
  #child;
  #diagnostics = '';
  #intentionalStops = new WeakSet();
  #logger;
  #ownerPid;
  #repoRoot;
  #supervisorPath;

  constructor({
    logger,
    ownerPid,
    repoRoot,
    supervisorPath,
  }) {
    super();
    this.#logger = logger;
    this.#ownerPid = ownerPid;
    this.#repoRoot = repoRoot;
    this.#supervisorPath = supervisorPath;
  }

  get running() {
    return Boolean(this.#child && this.#child.exitCode === null);
  }

  get diagnostics() {
    return this.#diagnostics || '尚无 DSH 进程输出。';
  }

  async start(mode = 'normal') {
    if (this.running) throw new Error('DSH 已由当前 App 启动');
    await access(this.#supervisorPath);
    const launch = await resolveNpxLaunch(
      mode,
      path.join(path.dirname(this.#supervisorPath), '..', 'scripts', 'run-npx.ps1'),
    );
    const parser = new DshUrlParser();
    const diagnosticStream = new RedactedLineStream();
    const child = spawn(
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
    this.#child = child;
    this.#record('desktop', `启动 DSH（${mode}）`);

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.stop()
          .finally(() => reject(new Error('DSH 在 120 秒内没有报告启动地址')));
      }, STARTUP_TIMEOUT_MS);

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
        if (url) finish(resolve, url);
      };
      child.stdout.on('data', (chunk) => consume('stdout', chunk));
      child.stderr.on('data', (chunk) => consume('stderr', chunk));
      child.once('error', (error) => {
        finish(reject, new Error(`无法启动 DSH supervisor：${error.message}`));
      });
      child.once('exit', (code, signal) => {
        const remainder = diagnosticStream.flush();
        if (remainder) this.#record('output', remainder);
        if (this.#child === child) this.#child = undefined;
        const reason = signal ? `signal ${signal}` : `exit code ${code}`;
        this.#record('desktop', `DSH 进程结束：${reason}`);
        if (!settled) {
          finish(reject, new Error(`DSH 启动前退出（${reason}）`));
        } else if (!this.#intentionalStops.has(child)) {
          this.emit('unexpected-exit', { code, signal });
        }
      });
    });
  }

  async stop() {
    const child = this.#child;
    if (!child || child.exitCode !== null) {
      this.#child = undefined;
      return;
    }

    this.#intentionalStops.add(child);
    child.kill();
    await Promise.race([
      once(child, 'exit'),
      delay(5_000),
    ]);
    if (child.exitCode === null) {
      await execFileAsync(
        'taskkill.exe',
        ['/PID', String(child.pid), '/T', '/F'],
        { windowsHide: true, timeout: 10_000 },
      ).catch(() => {});
      await Promise.race([once(child, 'exit'), delay(2_000)]);
    }
    if (this.#child === child) this.#child = undefined;
  }

  #record(source, value) {
    const safe = redactSecrets(value);
    this.#diagnostics = `${this.#diagnostics}${safe}`.slice(-DIAGNOSTIC_LIMIT);
    this.#logger?.write(source, safe);
  }
}
