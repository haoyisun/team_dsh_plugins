import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DesktopSession,
  StaleDesktopOperationError,
} from '../src/desktop-session.mjs';

test('desktop operations are exclusive and expose derived activity state', () => {
  const session = new DesktopSession();
  const restart = session.beginOperation('restarting');

  assert.ok(restart);
  assert.equal(session.busy, true);
  assert.equal(session.restartActivity, 'restarting');
  assert.equal(session.updateActivity, undefined);
  assert.equal(session.beginOperation('checking'), undefined);

  session.completeOperation(restart);
  assert.equal(session.busy, false);
});

test('stale asynchronous work cannot commit a newer desktop state', () => {
  const session = new DesktopSession();
  const checking = session.beginOperation('checking');

  session.cancelOperation(checking);

  assert.throws(
    () => session.checkpoint(checking),
    StaleDesktopOperationError,
  );
  assert.equal(session.busy, false);
});

test('runtime ownership ignores exits from stale process generations', () => {
  const session = new DesktopSession();
  const starting = session.beginOperation('starting');

  session.setRuntime(starting, 2, 'running');

  assert.equal(session.recordRuntimeExit(1), false);
  assert.equal(session.runtimeRunId, 2);
  assert.equal(session.recordRuntimeExit(2), true);
  assert.equal(session.runtimeRunId, undefined);
});

test('quitting invalidates operations and rejects later state changes', () => {
  const session = new DesktopSession();
  const upgrading = session.beginOperation('upgrading');

  session.close();

  assert.throws(
    () => session.checkpoint(upgrading),
    StaleDesktopOperationError,
  );
  assert.equal(session.beginOperation('starting'), undefined);
  assert.equal(session.lifecycle, 'quitting');
});

test('operation transitions derive update activity without parallel flags', () => {
  const session = new DesktopSession();
  const update = session.beginOperation('checking');

  assert.equal(session.updateActivity, 'checking');
  session.transitionOperation(update, 'awaiting-confirmation');
  assert.equal(session.updateActivity, undefined);
  assert.equal(session.busy, true);
  session.transitionOperation(update, 'upgrading');
  assert.equal(session.updateActivity, 'upgrading');
});
