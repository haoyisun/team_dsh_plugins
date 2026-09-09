import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('tray icon uses the blue app silhouette on a transparent background', async () => {
  await execFileAsync(process.execPath, [
    path.join(desktopRoot, 'scripts', 'build-icon.mjs'),
  ]);

  const trayIconPath = path.join(desktopRoot, 'bin', 'tray-icon.png');
  const { data, info } = await sharp(trayIconPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  assert.equal(info.width, 16);
  assert.equal(info.height, 16);

  let bluePixels = 0;
  let transparentPixels = 0;
  let visiblePixels = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const [red, green, blue, alpha] = data.subarray(offset, offset + 4);
    if (alpha < 32) {
      transparentPixels += 1;
      continue;
    }
    visiblePixels += 1;
    if (red < 100 && green < 160 && blue > 180) bluePixels += 1;
  }

  assert.ok(visiblePixels >= 70, 'tray icon must preserve the app silhouette');
  assert.ok(transparentPixels >= 80, 'tray icon background must stay transparent');
  assert.ok(
    bluePixels / visiblePixels >= 0.8,
    'the visible silhouette must use a saturated deep blue',
  );
});

test('taskbar icon combines the gray mark with a light-to-black outline', async () => {
  await execFileAsync(process.execPath, [
    path.join(desktopRoot, 'scripts', 'build-icon.mjs'),
  ]);

  const appIconPath = path.join(desktopRoot, 'bin', 'app-icon.png');
  const { data, info } = await sharp(appIconPath)
    .resize(32, 32)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let darkEdgePixels = 0;
  let grayPixels = 0;
  let highlightPixels = 0;
  let occupiedEdgePixels = 0;
  let transparentPixels = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const [red, green, blue, alpha] = data.subarray(offset, offset + 4);
    const pixel = offset / info.channels;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    if (
      alpha >= 32
      && (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1)
    ) {
      occupiedEdgePixels += 1;
    }
    if (alpha < 32) {
      transparentPixels += 1;
    } else if (alpha >= 128 && red < 50 && green < 60 && blue < 80) {
      darkEdgePixels += 1;
    } else if (
      alpha >= 128
      && red >= 35
      && red <= 100
      && green >= 40
      && green <= 110
      && blue >= 50
      && blue <= 130
    ) {
      grayPixels += 1;
    } else if (alpha >= 128 && red > 140 && green > 150 && blue > 160) {
      highlightPixels += 1;
    }
  }

  assert.ok(transparentPixels >= 300, 'taskbar icon background must stay transparent');
  assert.equal(occupiedEdgePixels, 0, 'the outlined mark must fit inside the canvas');
  assert.ok(grayPixels >= 180, 'the original gray fill must remain recognizable');
  assert.ok(
    highlightPixels >= 20,
    'the highlighted edge must remain visible on dark taskbars',
  );
  assert.ok(
    darkEdgePixels >= 10,
    'the outline must transition to a deep-black edge',
  );
});
