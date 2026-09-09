import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  SHELL_APPLIED_CHANNEL,
  SHELL_STATE_CHANNEL,
  ShellView,
} from '../src/shell-view.mjs';

class FakeWebContents extends EventEmitter {
  sent = [];

  send(channel, value) {
    this.sent.push({ channel, value });
  }
}

class FakeWindow {
  destroyed = false;
  loads = [];
  webContents = new FakeWebContents();

  async loadFile(file, options) {
    this.loads.push({ file, options });
  }

  isDestroyed() {
    return this.destroyed;
  }
}

function model(overrides = {}) {
  return {
    canCheckUpdates: true,
    canRestart: true,
    errorKind: 'startup',
    message: '',
    recoveryAction: 'retry-start',
    restartActivity: '',
    state: 'ready',
    updateActivity: '',
    version: '1.2.3',
    ...overrides,
  };
}

test('shell loads once and applies later state through acknowledged messages', async () => {
  const ipcMain = new EventEmitter();
  const window = new FakeWindow();
  const shell = new ShellView({
    ipcMain,
    statusPage: 'status.html',
    window,
  });

  await shell.render(model());
  assert.equal(window.loads.length, 1);

  const rendering = shell.render(model({
    message: '正在检查更新',
    state: 'starting',
  }));
  const sent = window.webContents.sent.at(-1);
  assert.equal(sent.channel, SHELL_STATE_CHANNEL);
  assert.equal(sent.value.revision, 2);
  ipcMain.emit(
    SHELL_APPLIED_CHANNEL,
    { sender: window.webContents },
    sent.value.revision,
  );
  await rendering;

  assert.equal(window.loads.length, 1);
});

test('shell recovery reloads the latest state instead of the initial query', async () => {
  const ipcMain = new EventEmitter();
  const window = new FakeWindow();
  const shell = new ShellView({
    ipcMain,
    statusPage: 'status.html',
    window,
  });

  await shell.render(model());
  const rendering = shell.render(model({
    message: 'runtime failed',
    recoveryAction: 'restart-runtime',
    state: 'error',
  }));
  const sent = window.webContents.sent.at(-1);
  ipcMain.emit(
    SHELL_APPLIED_CHANNEL,
    { sender: window.webContents },
    sent.value.revision,
  );
  await rendering;

  await shell.recover();

  assert.equal(window.loads.length, 2);
  assert.equal(
    window.loads[1].options.query.recoveryAction,
    'restart-runtime',
  );
  assert.equal(window.loads[1].options.query.state, 'error');
});

test('renderer recovery completes an in-flight update with latest state', async () => {
  const ipcMain = new EventEmitter();
  const window = new FakeWindow();
  const shell = new ShellView({
    ipcMain,
    statusPage: 'status.html',
    window,
  });

  await shell.render(model());
  const rendering = shell.render(model({
    message: 'latest state',
    state: 'starting',
  }));

  shell.rendererGone();
  const recovery = shell.recover();

  await recovery;
  await rendering;
  assert.equal(window.loads.at(-1).options.query.message, 'latest state');
});

test('shell state is whitelisted, bounded, and token-redacted', async () => {
  const ipcMain = new EventEmitter();
  const window = new FakeWindow();
  const shell = new ShellView({
    ipcMain,
    statusPage: 'status.html',
    window,
  });

  await shell.render(model({
    ignored: 'must-not-cross-the-boundary',
    message: 'http://127.0.0.1:3080/?token=secret',
  }));

  const query = window.loads[0].options.query;
  assert.deepEqual(Object.keys(query).sort(), [
    'canCheckUpdates',
    'canRestart',
    'errorKind',
    'message',
    'recoveryAction',
    'restartActivity',
    'state',
    'updateActivity',
    'version',
  ]);
  assert.doesNotMatch(query.message, /secret/u);
  assert.match(query.message, /token=\[REDACTED\]/u);
});
