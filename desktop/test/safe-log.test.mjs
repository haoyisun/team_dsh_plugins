import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { SafeLog } from '../src/safe-log.mjs';

test('desktop log never persists the DSH URL token', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsh-desktop-log-'));
  try {
    const log = new SafeLog(directory);
    await log.initialize();
    await log.write(
      'stdout',
      'dsh web: http://127.0.0.1:3080/?token=top-secret',
    );

    const content = await readFile(path.join(directory, 'desktop.log'), 'utf8');
    assert.doesNotMatch(content, /top-secret/);
    assert.match(content, /token=\[REDACTED\]/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
