import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';

import { externalHttpUrl } from '../src/runtime-contract.mjs';
import { protectWebContents } from '../src/web-contents-guard.mjs';

class FakeContents extends EventEmitter {
  currentUrl;

  constructor(currentUrl) {
    super();
    this.currentUrl = currentUrl;
  }

  getURL() {
    return this.currentUrl;
  }

  setWindowOpenHandler(handler) {
    this.windowOpenHandler = handler;
  }
}

function navigation(url, isMainFrame = true) {
  return {
    isMainFrame,
    prevented: false,
    url,
    preventDefault() {
      this.prevented = true;
    },
  };
}

test('shell contents cannot navigate into the DSH origin', () => {
  const contents = new FakeContents('file:///D:/desktop/status.html');
  const external = [];
  protectWebContents(contents, {
    getExpectedOrigin: () => 'http://127.0.0.1:3080',
    onDesktopAction: () => {},
    onRendererGone: () => {},
    openExternal: (url) => {
      const safe = externalHttpUrl(url);
      if (safe) external.push(safe);
    },
    role: 'shell',
  });
  const event = navigation('http://127.0.0.1:3080/?token=secret');

  contents.emit('will-navigate', event);

  assert.equal(event.prevented, true);
  assert.deepEqual(external, []);
});

test('shell actions are handled locally while DSH same-origin navigation is allowed', () => {
  const actions = [];
  const shell = new FakeContents('file:///D:/desktop/status.html');
  protectWebContents(shell, {
    getExpectedOrigin: () => 'http://127.0.0.1:3080',
    onDesktopAction: (url) => actions.push(url),
    onRendererGone: () => {},
    openExternal: () => {},
    role: 'shell',
  });
  const action = navigation('dsh-desktop://restart');
  shell.emit('will-navigate', action);

  const dsh = new FakeContents('http://127.0.0.1:3080/');
  protectWebContents(dsh, {
    getExpectedOrigin: () => 'http://127.0.0.1:3080',
    onDesktopAction: () => {},
    onRendererGone: () => {},
    openExternal: () => {},
    role: 'dsh',
  });
  const sameOrigin = navigation('http://127.0.0.1:3080/chat/1');
  dsh.emit('will-navigate', sameOrigin);

  assert.equal(action.prevented, true);
  assert.deepEqual(actions, ['dsh-desktop://restart']);
  assert.equal(sameOrigin.prevented, false);
});

test('external open failures are routed to the background error handler', async () => {
  const contents = new FakeContents('file:///D:/desktop/status.html');
  const errors = [];
  protectWebContents(contents, {
    getExpectedOrigin: () => undefined,
    onDesktopAction: () => {},
    onExternalError: (error) => errors.push(error.message),
    onRendererGone: () => {},
    openExternal: async () => {
      throw new Error('ShellExecute failed');
    },
    role: 'shell',
  });

  contents.emit('will-navigate', navigation('https://example.com/docs'));
  await nextTurn();

  assert.deepEqual(errors, ['ShellExecute failed']);
});
