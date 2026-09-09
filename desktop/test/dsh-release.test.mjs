import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  activateDshRelease,
  chooseDshReleaseForStartup,
  DshReleaseStore,
  isExactDshVersion,
  isNewerDshVersion,
  queryLatestDshVersion,
} from '../src/dsh-release.mjs';

test('release versions accept exact semver only', () => {
  assert.equal(isExactDshVersion('1.2.3'), true);
  assert.equal(isExactDshVersion('2.0.0-beta.1'), true);
  assert.equal(isExactDshVersion('latest'), false);
  assert.equal(isExactDshVersion('^1.2.3'), false);
  assert.equal(isExactDshVersion('../dsh'), false);
  assert.equal(isNewerDshVersion('1.3.0', '1.2.9'), true);
  assert.equal(isNewerDshVersion('1.2.3', '1.2.3'), false);
});

test('release store writes and reads one exact selected version atomically', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsh-release-'));
  const file = path.join(directory, 'dsh-release.json');
  try {
    const store = new DshReleaseStore(file, {
      now: () => new Date('2026-09-08T12:00:00.000Z'),
    });
    assert.equal(await store.read(), undefined);

    await store.write('1.2.3');

    assert.equal(await store.read(), '1.2.3');
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), {
      schemaVersion: 1,
      selectedVersion: '1.2.3',
      updatedAt: '2026-09-08T12:00:00.000Z',
    });

    await store.write('2.0.0');
    assert.equal(await store.read(), '2.0.0');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('release store rejects corrupt, unbounded, and non-exact state', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsh-release-'));
  const file = path.join(directory, 'dsh-release.json');
  try {
    const store = new DshReleaseStore(file);
    await mkdir(directory, { recursive: true });
    await writeFile(file, '{"selectedVersion":"latest"}', 'utf8');
    await assert.rejects(store.read(), /版本记录损坏/u);

    await writeFile(file, 'x'.repeat(5_000), 'utf8');
    await assert.rejects(store.read(), /版本记录过大/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('latest lookup reads bounded npm metadata without executing DSH', async () => {
  const calls = [];
  const version = await queryLatestDshVersion({
    npmCommand: 'C:\\Program Files\\nodejs\\npm.cmd',
    powershellCommand: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    execFile: async (...args) => {
      calls.push(args);
      return { stdout: '"2.1.0"\n', stderr: '' };
    },
  });

  assert.equal(version, '2.1.0');
  assert.equal(
    calls[0][0],
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  );
  assert.deepEqual(calls[0][1].slice(0, 6), [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
  ]);
  assert.match(calls[0][1][6], /query-dsh-latest\.ps1$/u);
  assert.equal(
    calls[0][1][7],
    'C:\\Program Files\\nodejs\\npm.cmd',
  );
  assert.equal(calls[0][2].windowsHide, true);
  assert.equal(calls[0][2].maxBuffer, 4_096);
});

test('latest lookup rejects malformed registry metadata', async () => {
  await assert.rejects(
    queryLatestDshVersion({
      npmCommand: 'npm.cmd',
      powershellCommand: 'powershell.exe',
      execFile: async () => ({ stdout: '"latest"', stderr: '' }),
    }),
    /无效版本/u,
  );
});

test('normal startup uses the stored version without checking latest', async () => {
  let queried = false;
  let confirmed = false;
  const selection = await chooseDshReleaseForStartup({
    storedVersion: '1.2.3',
    queryLatest: async () => {
      queried = true;
      return '2.0.0';
    },
    confirm: async () => {
      confirmed = true;
      return true;
    },
  });

  assert.deepEqual(selection, { version: '1.2.3', needsCommit: false });
  assert.equal(queried, false);
  assert.equal(confirmed, false);
});

test('cancelled first-run selection has no selected release', async () => {
  const selection = await chooseDshReleaseForStartup({
    storedVersion: undefined,
    queryLatest: async () => '2.0.0',
    confirm: async () => false,
  });

  assert.equal(selection, undefined);
});

test('release activation commits only after target starts and loads', async () => {
  const events = [];
  const result = await activateDshRelease({
    targetVersion: '2.0.0',
    stop: async () => events.push('stop'),
    start: async (version) => {
      events.push(`start:${version}`);
      return 'http://127.0.0.1:3080/?token=secret';
    },
    load: async () => events.push('load'),
    commit: async (version) => events.push(`commit:${version}`),
  });

  assert.deepEqual(result, { status: 'activated', version: '2.0.0' });
  assert.deepEqual(events, [
    'stop',
    'start:2.0.0',
    'load',
    'commit:2.0.0',
  ]);
});

test('failed first activation cleans up without committing a version', async () => {
  const events = [];
  await assert.rejects(
    activateDshRelease({
      targetVersion: '2.0.0',
      stop: async () => events.push('stop'),
      start: async () => {
        events.push('start');
        throw new Error('target failed');
      },
      load: async () => events.push('load'),
      commit: async () => events.push('commit'),
    }),
    /target failed/u,
  );

  assert.deepEqual(events, ['stop', 'start', 'stop']);
});

test('failed upgrades restore the previous exact version without committing', async () => {
  const events = [];
  const result = await activateDshRelease({
    targetVersion: '2.0.0',
    previousVersion: '1.5.0',
    stop: async () => events.push('stop'),
    start: async (version) => {
      events.push(`start:${version}`);
      if (version === '2.0.0') throw new Error('target failed');
      return 'http://127.0.0.1:3080/?token=old';
    },
    load: async () => events.push('load'),
    commit: async (version) => events.push(`commit:${version}`),
  });

  assert.equal(result.status, 'rolled-back');
  assert.equal(result.version, '1.5.0');
  assert.match(result.error.message, /target failed/u);
  assert.deepEqual(events, [
    'stop',
    'start:2.0.0',
    'stop',
    'start:1.5.0',
    'load',
  ]);
});

test('an upgrade that becomes unhealthy during commit restores runtime and selection', async () => {
  const events = [];
  const result = await activateDshRelease({
    targetVersion: '2.0.0',
    previousVersion: '1.5.0',
    stop: async () => events.push('stop'),
    start: async (version) => {
      events.push(`start:${version}`);
      return `http://127.0.0.1:3080/?version=${version}`;
    },
    load: async () => events.push('load'),
    commit: async (version) => events.push(`commit:${version}`),
    validate: async () => {
      events.push('validate');
      throw new Error('candidate exited during commit');
    },
  });

  assert.equal(result.status, 'rolled-back');
  assert.deepEqual(events, [
    'stop',
    'start:2.0.0',
    'load',
    'commit:2.0.0',
    'validate',
    'stop',
    'start:1.5.0',
    'load',
    'commit:1.5.0',
  ]);
});

test('failed rollback reports both activation failures', async () => {
  await assert.rejects(
    activateDshRelease({
      targetVersion: '2.0.0',
      previousVersion: '1.5.0',
      stop: async () => {},
      start: async (version) => {
        throw new Error(`${version} failed`);
      },
      load: async () => {},
      commit: async () => {},
    }),
    /2\.0\.0 failed[\s\S]*1\.5\.0 failed/u,
  );
});
