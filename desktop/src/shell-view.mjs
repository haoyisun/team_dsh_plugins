import { redactSecrets } from './runtime-contract.mjs';

export const SHELL_APPLIED_CHANNEL = 'dsh-desktop:shell-applied';
export const SHELL_STATE_CHANNEL = 'dsh-desktop:shell-state';

const RECOVERY_ACTIONS = new Set([
  'reload-page',
  'restart-runtime',
  'retry-start',
]);
const ERROR_KINDS = new Set(['page', 'runtime', 'startup', 'surface']);
const SHELL_STATES = new Set(['error', 'ready', 'starting']);
const UPDATE_ACTIVITIES = new Set(['checking', 'upgrading']);

function bounded(value, limit) {
  return String(value || '').slice(0, limit);
}

function normalizeModel(model) {
  return {
    state: SHELL_STATES.has(model?.state) ? model.state : 'error',
    errorKind: ERROR_KINDS.has(model?.errorKind)
      ? model.errorKind
      : 'startup',
    message: redactSecrets(bounded(model?.message, 800)),
    version: bounded(model?.version, 64),
    canRestart: String(model?.canRestart === true),
    canCheckUpdates: String(model?.canCheckUpdates === true),
    restartActivity: model?.restartActivity === 'restarting'
      ? 'restarting'
      : '',
    updateActivity: UPDATE_ACTIVITIES.has(model?.updateActivity)
      ? model.updateActivity
      : '',
    recoveryAction: RECOVERY_ACTIONS.has(model?.recoveryAction)
      ? model.recoveryAction
      : 'retry-start',
  };
}

export class ShellView {
  #appliedListener;
  #disposed = false;
  #ipcMain;
  #latest;
  #loaded = false;
  #pending = new Map();
  #revision = 0;
  #statusPage;
  #window;

  constructor({
    ipcMain,
    statusPage,
    window,
  }) {
    this.#ipcMain = ipcMain;
    this.#statusPage = statusPage;
    this.#window = window;
    this.#appliedListener = (event, revision) => {
      if (event.sender !== this.#window.webContents) return;
      const pending = this.#pending.get(revision);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.#pending.delete(revision);
      pending.resolve();
    };
    ipcMain.on(SHELL_APPLIED_CHANNEL, this.#appliedListener);
  }

  async render(model) {
    this.#assertAvailable();
    const normalized = normalizeModel(model);
    const revision = ++this.#revision;
    this.#latest = { ...normalized, revision };
    if (!this.#loaded) {
      await this.#window.loadFile(this.#statusPage, {
        query: normalized,
      });
      this.#loaded = true;
      return;
    }

    const applied = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(revision);
        reject(new Error('DSH Desktop 工具栏状态更新超时'));
      }, 2_000);
      timeout.unref?.();
      this.#pending.set(revision, { reject, resolve, timeout });
    });
    this.#window.webContents.send(SHELL_STATE_CHANNEL, this.#latest);
    await applied;
  }

  async recover() {
    this.#assertAvailable();
    if (!this.#latest) throw new Error('DSH Desktop 工具栏尚未初始化');
    this.#loaded = false;
    const { revision: _revision, ...query } = this.#latest;
    try {
      await this.#window.loadFile(this.#statusPage, { query });
      this.#loaded = true;
      this.#resolvePending();
    } catch (error) {
      this.#rejectPending(error);
      throw error;
    }
  }

  rendererGone() {
    this.#loaded = false;
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#ipcMain.off(SHELL_APPLIED_CHANNEL, this.#appliedListener);
    this.#rejectPending(new Error('DSH Desktop 工具栏已关闭'));
  }

  #assertAvailable() {
    if (this.#disposed || this.#window.isDestroyed()) {
      throw new Error('DSH Desktop 工具栏不可用');
    }
  }

  #rejectPending(error) {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  #resolvePending() {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.resolve();
    }
    this.#pending.clear();
  }
}
