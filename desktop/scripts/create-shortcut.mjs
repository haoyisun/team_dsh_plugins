import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, shell } from 'electron';

import {
  APP_DISPLAY_NAME,
  APP_USER_MODEL_ID,
} from '../src/app-identity.mjs';
import { findExecutable } from '../src/dsh-runtime.mjs';
import {
  buildShortcutPlan,
  shortcutIconPath,
} from '../src/shortcut.mjs';

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const iconPath = path.join(desktopRoot, 'bin', 'app-icon.ico');

app.setAppUserModelId(APP_USER_MODEL_ID);
app.setName(APP_DISPLAY_NAME);

async function ensureIcon() {
  if (existsSync(iconPath)) return;
  const node = await findExecutable('node.exe');
  const result = spawnSync(
    node,
    [path.join(desktopRoot, 'scripts', 'build-icon.mjs')],
    {
      cwd: desktopRoot,
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    throw new Error('Failed to build DSH Desktop icons');
  }
}

async function createShortcuts() {
  await ensureIcon();
  const iconContents = await readFile(iconPath);
  const iconCacheDirectory = path.join(app.getPath('userData'), 'icons');
  await mkdir(iconCacheDirectory, { recursive: true });
  const installedIconPath = shortcutIconPath(
    iconPath,
    iconContents,
    iconCacheDirectory,
  );
  await writeFile(installedIconPath, iconContents);
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const plan = buildShortcutPlan({
    desktopRoot,
    desktopDirectory: app.getPath('desktop'),
    startMenuDirectory: path.join(
      app.getPath('appData'),
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
    ),
    powershellExecutable: path.join(
      systemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    ),
    iconPath: installedIconPath,
  });

  for (const shortcut of plan) {
    const written = shell.writeShortcutLink(
      shortcut.path,
      'create',
      shortcut.options,
    );
    if (!written) {
      throw new Error(`Failed to write shortcut: ${shortcut.path}`);
    }
    console.log(`Created shortcut: ${shortcut.path}`);
  }
}

void app.whenReady().then(async () => {
  try {
    await createShortcuts();
    app.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    app.exit(1);
  }
});
