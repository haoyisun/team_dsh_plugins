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

test(
  'PowerShell npm metadata runner supports a standalone command shim',
  { skip: process.platform !== 'win32' },
  async () => {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(desktopRoot, 'scripts', 'query-dsh-latest.ps1'),
        path.join(desktopRoot, 'test', 'fixtures', 'npx-shim.cmd'),
      ],
      { windowsHide: true },
    );

    assert.equal(
      stdout.trim(),
      'view @deepseek-ai/dsh dist-tags.latest --json --prefer-online',
    );
  },
);
