import { createHash } from 'node:crypto';
import path from 'node:path';

import { APP_DISPLAY_NAME, APP_USER_MODEL_ID } from './app-identity.mjs';

export function shortcutIconPath(
  sourcePath,
  contents,
  directory = path.dirname(sourcePath),
) {
  const extension = path.extname(sourcePath);
  const base = path.basename(sourcePath, extension);
  const digest = createHash('sha256').update(contents).digest('hex').slice(0, 12);
  return path.join(directory, `${base}-${digest}${extension}`);
}

export function buildShortcutPlan({
  desktopRoot,
  desktopDirectory,
  startMenuDirectory,
  powershellExecutable,
  iconPath,
}) {
  const launchScript = path.join(desktopRoot, 'scripts', 'launch.ps1');
  const options = {
    target: powershellExecutable,
    args: `-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${launchScript}"`,
    cwd: desktopRoot,
    description: 'Launch and manage DSH Web',
    icon: iconPath,
    iconIndex: 0,
    appUserModelId: APP_USER_MODEL_ID,
  };
  const name = `${APP_DISPLAY_NAME}.lnk`;
  return [
    { path: path.join(desktopDirectory, name), options },
    { path: path.join(startMenuDirectory, name), options },
  ];
}
