import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const name of [
  'build-supervisor.ps1',
  'create-shortcut.ps1',
  'launch.ps1',
  'query-dsh-latest.ps1',
  'run-npx.ps1',
]) {
  test(`${name} is readable by Windows PowerShell 5.1`, async () => {
    const bytes = await readFile(path.join(desktopRoot, 'scripts', name));
    const hasUtf8Bom =
      bytes[0] === 0xef
      && bytes[1] === 0xbb
      && bytes[2] === 0xbf;
    const text = bytes.toString('utf8');

    assert.ok(
      hasUtf8Bom || /^[\x00-\x7f]*$/u.test(text),
      `${name} must be ASCII-only or UTF-8 with BOM`,
    );
  });
}

test('shortcut launch uses the bundled Electron executable directly', async () => {
  const script = await readFile(
    path.join(desktopRoot, 'scripts', 'launch.ps1'),
    'utf8',
  );

  assert.match(script, /& \$electron \$desktopRoot/u);
  assert.doesNotMatch(script, /pnpm exec electron/u);
});
