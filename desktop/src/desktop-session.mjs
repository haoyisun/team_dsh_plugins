const OPERATION_KINDS = new Set([
  'awaiting-confirmation',
  'checking',
  'reloading',
  'restarting',
  'starting',
  'upgrading',
]);

export class StaleDesktopOperationError extends Error {
  constructor() {
    super('DSH Desktop 操作已失效');
    this.name = 'StaleDesktopOperationError';
  }
}

function requireOperationKind(kind) {
  if (!OPERATION_KINDS.has(kind)) {
    throw new TypeError(`未知 Desktop 操作：${kind}`);
  }
  return kind;
}

export class DesktopSession {
  #lifecycle = 'active';
  #nextOperationId = 0;
  #operation;
  #runtime;

  get busy() {
    return Boolean(this.#operation);
  }

  get lifecycle() {
    return this.#lifecycle;
  }

  get operationKind() {
    return this.#operation?.kind;
  }

  get restartActivity() {
    return this.#operation?.kind === 'restarting'
      ? 'restarting'
      : undefined;
  }

  get runtimeRunId() {
    return this.#runtime?.runId;
  }

  get runtimeStatus() {
    return this.#runtime?.status || 'stopped';
  }

  get updateActivity() {
    if (this.#operation?.kind === 'checking') return 'checking';
    if (this.#operation?.kind === 'upgrading') return 'upgrading';
    return undefined;
  }

  isCurrent(operation) {
    return this.#lifecycle === 'active' && this.#owns(operation);
  }

  isCurrentRuntime(runId) {
    return this.#runtime?.runId === runId;
  }

  beginOperation(kind) {
    if (this.#lifecycle !== 'active' || this.#operation) return undefined;
    const operation = {
      id: ++this.#nextOperationId,
      kind: requireOperationKind(kind),
    };
    this.#operation = operation;
    return operation;
  }

  cancelOperation(operation) {
    if (!this.#owns(operation)) return false;
    this.#operation = undefined;
    return true;
  }

  cancelCurrentOperation() {
    if (!this.#operation) return false;
    this.#operation = undefined;
    return true;
  }

  checkpoint(operation) {
    if (this.#lifecycle !== 'active' || !this.#owns(operation)) {
      throw new StaleDesktopOperationError();
    }
  }

  close() {
    this.#lifecycle = 'quitting';
    this.#operation = undefined;
  }

  completeOperation(operation) {
    return this.cancelOperation(operation);
  }

  recordRuntimeExit(runId) {
    if (this.#runtime?.runId !== runId) return false;
    this.#runtime = undefined;
    return true;
  }

  setRuntime(operation, runId, status) {
    this.checkpoint(operation);
    if (
      !Number.isInteger(runId)
      || runId < 1
      || !['running', 'starting'].includes(status)
    ) {
      throw new TypeError('DSH runtime 状态无效');
    }
    this.#runtime = { runId, status };
  }

  transitionOperation(operation, kind) {
    this.checkpoint(operation);
    this.#operation.kind = requireOperationKind(kind);
  }

  #owns(operation) {
    return Boolean(
      operation
      && this.#operation
      && operation.id === this.#operation.id
    );
  }
}
