import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function runNpxRunner(...args) {
  return execFileAsync(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(desktopRoot, 'scripts', 'run-npx.ps1'),
      path.join(desktopRoot, 'test', 'fixtures', 'npx-shim.cmd'),
      ...args,
    ],
    { windowsHide: true },
  );
}

test(
  'PowerShell npm exec runner supports a standalone command shim',
  { skip: process.platform !== 'win32' },
  async () => {
    const { stdout } = await runNpxRunner('1.2.3');

    assert.equal(
      stdout.trim(),
      'exec --yes --prefer-offline -- @deepseek-ai/dsh@1.2.3 web --no-open',
    );
  },
);

test(
  'PowerShell npm exec runner can require fresh registry metadata',
  { skip: process.platform !== 'win32' },
  async () => {
    const { stdout } = await runNpxRunner('1.2.3', 'prefer-online');

    assert.equal(
      stdout.trim(),
      'exec --yes --prefer-online -- @deepseek-ai/dsh@1.2.3 web --no-open',
    );
  },
);

test(
  'PowerShell npm exec runner rejects unknown metadata modes',
  { skip: process.platform !== 'win32' },
  async () => {
    await assert.rejects(runNpxRunner('1.2.3', 'prefer-sometimes'));
  },
);

test(
  'PowerShell npm exec runner rejects non-exact versions',
  { skip: process.platform !== 'win32' },
  async () => {
    await assert.rejects(runNpxRunner('latest'));
  },
);
