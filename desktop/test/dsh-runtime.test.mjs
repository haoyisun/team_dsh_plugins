import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { DshRuntime } from '../src/dsh-runtime.mjs';

class FakeChild extends EventEmitter {
  constructor(pid) {
    super();
    this.pid = pid;
    this.exitCode = null;
    this.signalCode = null;
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
  }

  kill() {
    if (this.killError) {
      queueMicrotask(() => this.emit('error', new Error('kill EPERM')));
      return false;
    }
    this.finish(null, 'SIGTERM');
    return true;
  }

  finish(code, signal) {
    if (this.exitCode !== null || this.signalCode !== null) return;
    this.exitCode = code;
    this.signalCode = signal;
    queueMicrotask(() => this.emit('exit', code, signal));
  }
}

function createRuntime() {
  const children = [];
  const forcedKills = [];
  const runtime = new DshRuntime({
    accessFile: async () => {},
    logger: undefined,
    execFile: async (...args) => {
      forcedKills.push(args);
      children.at(-1)?.finish(1, null);
    },
    forcedStopTimeoutMs: 5,
    gracefulStopTimeoutMs: 5,
    npmCommand: 'npm.cmd',
    ownerPid: 123,
    powershellExecutable: 'powershell.exe',
    repoRoot: 'D:\\repo',
    spawnProcess: () => {
      const child = new FakeChild(1_000 + children.length);
      children.push(child);
      return child;
    },
    supervisorPath: 'D:\\repo\\desktop\\bin\\dsh-supervisor.exe',
  });
  return { children, forcedKills, runtime };
}

test('DSH runtime identifies each started process generation', async () => {
  const { children, runtime } = createRuntime();

  const started = runtime.start('1.2.3');
  assert.equal(runtime.currentRunId, 1);
  await Promise.resolve();
  children[0].stdout.write(
    'dsh web: http://127.0.0.1:3080/?token=secret\r\n',
  );

  assert.deepEqual(await started, {
    runId: 1,
    url: 'http://127.0.0.1:3080/?token=secret',
  });

  const unexpectedExit = once(runtime, 'unexpected-exit');
  children[0].finish(7, null);
  assert.deepEqual(await unexpectedExit, [{
    code: 7,
    runId: 1,
    signal: null,
  }]);
});

test('a stale run cannot stop the current DSH process', async () => {
  const { children, runtime } = createRuntime();

  const first = runtime.start('1.2.3');
  await Promise.resolve();
  children[0].stdout.write(
    'dsh web: http://127.0.0.1:3080/?token=first\r\n',
  );
  const firstRun = await first;
  await runtime.stop(firstRun.runId);

  const second = runtime.start('1.2.3');
  await Promise.resolve();
  children[1].stdout.write(
    'dsh web: http://127.0.0.1:3080/?token=second\r\n',
  );
  const secondRun = await second;

  assert.equal(await runtime.stop(firstRun.runId), false);
  assert.equal(children[1].exitCode, null);
  assert.equal(runtime.currentRunId, secondRun.runId);
});

test('closing the runtime interrupts startup and prevents later starts', async () => {
  const { children, runtime } = createRuntime();

  const starting = runtime.start('1.2.3');
  await Promise.resolve();
  await runtime.close();

  await assert.rejects(starting, /启动前退出/u);
  assert.equal(children[0].signalCode, 'SIGTERM');
  await assert.rejects(
    runtime.start('1.2.3'),
    /正在退出/u,
  );
});

test('a normal signal exit does not invoke the forced process-tree fallback', async () => {
  const { children, forcedKills, runtime } = createRuntime();

  const starting = runtime.start('1.2.3');
  await Promise.resolve();
  children[0].stdout.write(
    'dsh web: http://127.0.0.1:3080/?token=secret\r\n',
  );
  const started = await starting;

  await runtime.stop(started.runId);

  assert.equal(children[0].signalCode, 'SIGTERM');
  assert.deepEqual(forcedKills, []);
});

test('a failed graceful kill retains ownership until forced cleanup', async () => {
  const { children, forcedKills, runtime } = createRuntime();

  const starting = runtime.start('1.2.3');
  await Promise.resolve();
  children[0].stdout.write(
    'dsh web: http://127.0.0.1:3080/?token=secret\r\n',
  );
  const started = await starting;
  children[0].killError = true;

  assert.equal(await runtime.stop(started.runId), true);
  assert.equal(forcedKills.length, 1);
  assert.equal(runtime.currentRunId, undefined);
});

test('runtime ownership is retained when forced cleanup cannot confirm exit', async () => {
  const children = [];
  const runtime = new DshRuntime({
    accessFile: async () => {},
    execFile: async () => {
      throw new Error('taskkill failed');
    },
    forcedStopTimeoutMs: 5,
    gracefulStopTimeoutMs: 5,
    logger: undefined,
    npmCommand: 'npm.cmd',
    ownerPid: 123,
    powershellExecutable: 'powershell.exe',
    repoRoot: 'D:\\repo',
    spawnProcess: () => {
      const child = new FakeChild(2_000);
      children.push(child);
      return child;
    },
    supervisorPath: 'D:\\repo\\desktop\\bin\\dsh-supervisor.exe',
  });

  const starting = runtime.start('1.2.3');
  await Promise.resolve();
  children[0].stdout.write(
    'dsh web: http://127.0.0.1:3080/?token=secret\r\n',
  );
  const started = await starting;
  children[0].killError = true;

  await assert.rejects(runtime.stop(started.runId), /无法终止/u);
  assert.equal(runtime.currentRunId, started.runId);
  assert.equal(runtime.running, true);
});

test('startup timeout reports cleanup failure without an unhandled rejection', async () => {
  const child = new FakeChild(3_000);
  child.killError = true;
  const runtime = new DshRuntime({
    accessFile: async () => {},
    execFile: async () => {
      throw new Error('taskkill failed');
    },
    forcedStopTimeoutMs: 5,
    gracefulStopTimeoutMs: 5,
    logger: undefined,
    npmCommand: 'npm.cmd',
    ownerPid: 123,
    powershellExecutable: 'powershell.exe',
    repoRoot: 'D:\\repo',
    spawnProcess: () => child,
    startupTimeoutMs: 5,
    supervisorPath: 'D:\\repo\\desktop\\bin\\dsh-supervisor.exe',
  });

  await assert.rejects(
    runtime.start('1.2.3'),
    /启动超时且进程清理失败/u,
  );
  assert.equal(runtime.currentRunId, 1);
});

test('failed supervisor access does not leave a stale runtime generation', async () => {
  const runtime = new DshRuntime({
    accessFile: async () => {
      throw new Error('missing supervisor');
    },
    logger: undefined,
    npmCommand: 'npm.cmd',
    ownerPid: 123,
    powershellExecutable: 'powershell.exe',
    repoRoot: 'D:\\repo',
    supervisorPath: 'D:\\missing.exe',
  });

  await assert.rejects(runtime.start('1.2.3'), /missing supervisor/u);
  assert.equal(runtime.currentRunId, undefined);
  assert.equal(runtime.running, false);
});

test('a supervisor spawn error clears the current runtime generation', async () => {
  const { children, runtime } = createRuntime();

  const starting = runtime.start('1.2.3');
  await Promise.resolve();
  children[0].emit('error', new Error('spawn failed'));

  await assert.rejects(starting, /spawn failed/u);
  assert.equal(runtime.currentRunId, undefined);
  assert.equal(runtime.running, false);
});
