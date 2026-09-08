import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const supervisorPath = path.join(
  desktopRoot,
  'bin',
  'dsh-supervisor.exe',
);

async function buildSupervisor() {
  await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(desktopRoot, 'scripts', 'build-supervisor.ps1'),
    ],
    { cwd: desktopRoot },
  );
}

test(
  'Windows supervisor forwards output and returns the managed process exit code',
  { skip: process.platform !== 'win32' },
  async () => {
    await buildSupervisor();
    const supervisor = spawn(
      supervisorPath,
      [
        '--parent-pid',
        String(process.pid),
        '--',
        process.execPath,
        '-e',
        'console.log("managed-output"); process.exit(7)',
      ],
      { windowsHide: true },
    );
    let stdout = '';
    supervisor.stdout.setEncoding('utf8');
    supervisor.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    const [exitCode] = await once(supervisor, 'exit');

    assert.equal(exitCode, 7);
    assert.match(stdout, /managed-output/);
  },
);

test(
  'Windows supervisor kills the managed process when its owner disappears',
  { skip: process.platform !== 'win32' },
  async () => {
    await buildSupervisor();
    const owner = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
    const supervisor = spawn(
      supervisorPath,
      [
        '--parent-pid',
        String(owner.pid),
        '--',
        process.execPath,
        '-e',
        'console.log(`MANAGED_PID=${process.pid}`); setInterval(() => {}, 1000)',
      ],
      { windowsHide: true },
    );
    supervisor.stdout.setEncoding('utf8');
    const [chunk] = await once(supervisor.stdout, 'data');
    const managedPid = Number(String(chunk).match(/MANAGED_PID=(\d+)/)?.[1]);
    assert.ok(Number.isInteger(managedPid));

    owner.kill();
    await once(supervisor, 'exit');

    assert.throws(() => process.kill(managedPid, 0), { code: 'ESRCH' });
  },
);
