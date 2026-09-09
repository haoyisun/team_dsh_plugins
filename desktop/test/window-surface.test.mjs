import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';

import { WindowSurface } from '../src/window-surface.mjs';

class FakeContentView {
  children = [];

  addChildView(view) {
    if (!this.children.includes(view)) this.children.push(view);
  }

  removeChildView(view) {
    this.children = this.children.filter((child) => child !== view);
  }
}

class FakeWindow extends EventEmitter {
  contentView = new FakeContentView();
  bounds = { width: 800, height: 600 };
  destroyed = false;
  minimized = false;
  visible = true;

  getContentBounds() {
    return this.bounds;
  }

  isDestroyed() {
    return this.destroyed;
  }

  isMinimized() {
    return this.minimized;
  }

  isVisible() {
    return this.visible;
  }
}

class FakeView {
  appliedBounds = [];

  setBounds(bounds) {
    this.appliedBounds.push(bounds);
  }
}

test('minimizing never replaces the DSH view with invalid bounds', async () => {
  const window = new FakeWindow();
  const view = new FakeView();
  const surface = new WindowSurface({
    mainWindow: window,
    toolbarHeight: 44,
    view,
  });

  surface.showDsh();
  await nextTurn();
  assert.deepEqual(view.appliedBounds.at(-1), {
    x: 0,
    y: 44,
    width: 800,
    height: 556,
  });

  window.minimized = true;
  window.bounds = { width: 0, height: 0 };
  window.emit('resize');
  await nextTurn();

  assert.equal(view.appliedBounds.length, 1);
});

test('restoring a minimized window reapplies the DSH view bounds', async () => {
  const window = new FakeWindow();
  const view = new FakeView();
  const surface = new WindowSurface({
    mainWindow: window,
    toolbarHeight: 44,
    view,
  });

  surface.showDsh();
  await nextTurn();
  window.minimized = true;
  window.bounds = { width: 0, height: 0 };
  window.emit('resize');
  await nextTurn();

  window.minimized = false;
  window.bounds = { width: 1024, height: 768 };
  window.emit('restore');
  await nextTurn();

  assert.deepEqual(view.appliedBounds.at(-1), {
    x: 0,
    y: 44,
    width: 1024,
    height: 724,
  });
  assert.equal(window.contentView.children.includes(view), true);
});

test('status mode detaches the DSH view without changing focus', async () => {
  const window = new FakeWindow();
  const view = new FakeView();
  const surface = new WindowSurface({
    mainWindow: window,
    toolbarHeight: 44,
    view,
  });

  surface.showDsh();
  await nextTurn();
  surface.showStatus();
  await nextTurn();

  assert.equal(window.contentView.children.includes(view), false);
});

test('a queued layout does nothing after the surface is disposed', async () => {
  const window = new FakeWindow();
  const view = new FakeView();
  const surface = new WindowSurface({
    mainWindow: window,
    toolbarHeight: 44,
    view,
  });

  surface.showDsh();
  surface.dispose();
  await nextTurn();

  assert.deepEqual(view.appliedBounds, []);
});
