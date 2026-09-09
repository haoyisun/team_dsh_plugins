import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the desktop process registers a stable AppUserModelID before taking the instance lock', async () => {
  const main = await readFile(path.join(desktopRoot, 'src', 'main.mjs'), 'utf8');

  assert.match(main, /from '\.\/app-identity\.mjs'/u);
  assert.match(main, /setAppUserModelId\(\s*APP_USER_MODEL_ID\s*\)/u);
  assert.ok(
    main.indexOf('setAppUserModelId') < main.indexOf('requestSingleInstanceLock'),
    'Windows must see the AppUserModelID before the process registers with the shell',
  );
});

test('shortcut plan stamps the same AppUserModelID and custom icon onto Desktop and Start Menu links', async () => {
  const { APP_DISPLAY_NAME, APP_USER_MODEL_ID } = await import(
    '../src/app-identity.mjs'
  );
  const { buildShortcutPlan } = await import('../src/shortcut.mjs');

  assert.match(APP_USER_MODEL_ID, /^[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)+$/u);
  assert.equal(APP_DISPLAY_NAME, 'DSH Desktop');

  const plan = buildShortcutPlan({
    desktopRoot: 'D:\\repo\\desktop',
    desktopDirectory: 'D:\\Users\\me\\Desktop',
    startMenuDirectory: 'D:\\Users\\me\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs',
    powershellExecutable: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    iconPath: 'D:\\repo\\desktop\\bin\\app-icon.ico',
  });

  assert.equal(plan.length, 2);
  assert.equal(
    plan[0].path,
    'D:\\Users\\me\\Desktop\\DSH Desktop.lnk',
  );
  assert.equal(
    plan[1].path,
    'D:\\Users\\me\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\DSH Desktop.lnk',
  );

  for (const shortcut of plan) {
    assert.equal(shortcut.options.appUserModelId, APP_USER_MODEL_ID);
    assert.equal(shortcut.options.icon, 'D:\\repo\\desktop\\bin\\app-icon.ico');
    assert.equal(shortcut.options.iconIndex, 0);
    assert.equal(
      shortcut.options.target,
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    );
    assert.match(shortcut.options.args, /launch\.ps1/u);
    assert.equal(shortcut.options.cwd, 'D:\\repo\\desktop');
  }
});

test('shortcut icon path changes with icon content to bypass Explorer icon cache', async () => {
  const { shortcutIconPath } = await import('../src/shortcut.mjs');
  const source = 'D:\\repo\\desktop\\bin\\app-icon.ico';

  const first = shortcutIconPath(source, Buffer.from('first icon'));
  const second = shortcutIconPath(source, Buffer.from('second icon'));

  assert.match(
    first,
    /^D:\\repo\\desktop\\bin\\app-icon-[a-f0-9]{12}\.ico$/u,
  );
  assert.notEqual(first, second);
  assert.equal(first, shortcutIconPath(source, Buffer.from('first icon')));
  assert.equal(
    shortcutIconPath(
      source,
      Buffer.from('first icon'),
      'D:\\Users\\me\\AppData\\Roaming\\DSH Desktop\\icons',
    ),
    `D:\\Users\\me\\AppData\\Roaming\\DSH Desktop\\icons\\${path.basename(first)}`,
  );
});

test('shortcut command writes links through Electron so AppUserModelID is preserved', async () => {
  const [pkgRaw, script] = await Promise.all([
    readFile(path.join(desktopRoot, 'package.json'), 'utf8'),
    readFile(path.join(desktopRoot, 'scripts', 'create-shortcut.mjs'), 'utf8'),
  ]);
  const pkg = JSON.parse(pkgRaw);

  assert.match(pkg.scripts.shortcut, /electron scripts\/create-shortcut\.mjs/u);
  assert.match(script, /writeShortcutLink/u);
  assert.match(script, /'create'/u);
  assert.match(script, /buildShortcutPlan/u);
  assert.match(script, /shortcutIconPath/u);
  assert.match(script, /APP_USER_MODEL_ID/u);
});
