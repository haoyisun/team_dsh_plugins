import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  shell,
  Tray,
  WebContentsView,
} from 'electron';

import { APP_DISPLAY_NAME, APP_USER_MODEL_ID } from './app-identity.mjs';
import {
  DesktopSession,
  StaleDesktopOperationError,
} from './desktop-session.mjs';
import {
  activateDshRelease,
  chooseDshReleaseForStartup,
  describeDshInstallFailure,
  dshStartCacheMode,
  DshReleaseStore,
  isNewerDshVersion,
  queryLatestDshVersion,
} from './dsh-release.mjs';
import {
  DshRuntime,
  findExecutable,
} from './dsh-runtime.mjs';
import {
  externalHttpUrl,
  isAllowedDshNavigation,
  redactSecrets,
} from './runtime-contract.mjs';
import { SafeLog } from './safe-log.mjs';
import { ShellView } from './shell-view.mjs';
import { WindowSurface } from './window-surface.mjs';
import { protectWebContents } from './web-contents-guard.mjs';
import {
  inspectDshPort,
  terminateDshProcessTree,
  waitForPortFree,
} from './windows-processes.mjs';

const fileDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(fileDirectory, '..');
const repoRoot = path.resolve(desktopRoot, '..');
const statusPage = path.join(fileDirectory, 'status', 'index.html');
const statusPreload = path.join(fileDirectory, 'status', 'preload.cjs');
const updateDialogPage = path.join(
  fileDirectory,
  'update-dialog',
  'index.html',
);
const iconPath = path.join(desktopRoot, 'bin', 'app-icon.ico');
const trayIconPath = path.join(desktopRoot, 'bin', 'tray-icon.ico');
const supervisorPath = path.join(
  desktopRoot,
  'bin',
  'dsh-supervisor.exe',
);
const DSH_PORT = 3080;
const TOOLBAR_HEIGHT = 44;

let allowedDshOrigin;
let cleanupStarted = false;
let currentDshOrigin;
const desktopSession = new DesktopSession();
let dshPageGeneration = 0;
let dshPageReady = false;
let dshView;
let log;
let mainWindow;
let npmCommand;
let pendingReleaseCommit;
let powershellCommand;
let releaseStore;
let runtime;
let selectedVersion;
let selectedVersionCommitted = false;
let shellErrorKind = 'startup';
let shellMessage = '';
let shellRecoveryAction = 'retry-start';
let shellRecoveryPromise;
let shellRecovering = false;
let shellState = 'starting';
let shellView;
let surface;
let tray;

app.setAppUserModelId(APP_USER_MODEL_ID);
app.setName(APP_DISPLAY_NAME);
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function safeMessage(error) {
  return redactSecrets(error instanceof Error ? error.message : String(error))
    .slice(0, 800);
}

function launchAction(action, { background = false } = {}) {
  void Promise.resolve()
    .then(action)
    .catch((error) => {
      if (cleanupStarted) return;
      if (background) {
        log?.write('desktop', `后台恢复失败：${safeMessage(error)}`);
        return;
      }
      dialog.showErrorBox('DSH Desktop 操作失败', safeMessage(error));
    });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function appIcon() {
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) throw new Error('无法加载 DSH Desktop 图标');
  return iconPath;
}

function trayIcon() {
  const image = nativeImage.createFromPath(trayIconPath);
  if (image.isEmpty()) throw new Error('无法加载 DSH Desktop 托盘图标');
  return image;
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: selectedVersion
        ? `DSH ${selectedVersion}`
        : 'DSH 版本未选择',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '显示主窗口',
      click: showMainWindow,
    },
    { type: 'separator' },
    {
      label: '重启 DSH',
      enabled: !desktopSession.busy && Boolean(selectedVersion),
      click: () => {
        launchAction(restartDsh);
      },
    },
    {
      label: '检查 DSH 更新…',
      enabled: !desktopSession.busy && selectedVersionCommitted,
      click: () => {
        launchAction(checkForDshUpdate);
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: requestExit,
    },
  ]));
}

async function loadShell(state, message, {
  errorKind = shellErrorKind,
  recoveryAction = shellRecoveryAction,
} = {}) {
  if (cleanupStarted || !mainWindow || mainWindow.isDestroyed()) return;
  shellState = state;
  shellErrorKind = errorKind;
  shellMessage = message;
  shellRecoveryAction = recoveryAction;
  if (shellRecoveryPromise) await shellRecoveryPromise;
  await shellView.render({
    state,
    errorKind,
    message: safeMessage(message),
    recoveryAction,
    version: selectedVersion || '',
    canRestart: !desktopSession.busy && Boolean(selectedVersion),
    canCheckUpdates: (
      !desktopSession.busy && selectedVersionCommitted
    ),
    restartActivity: desktopSession.restartActivity || '',
    updateActivity: desktopSession.updateActivity || '',
  });
}

async function showStatus(state, message, {
  errorKind = 'startup',
  recoveryAction = 'retry-start',
  reveal = true,
} = {}) {
  if (cleanupStarted || !mainWindow || mainWindow.isDestroyed()) return;
  allowedDshOrigin = undefined;
  await loadShell(state, message, { errorKind, recoveryAction });
  surface.showStatus();
  if (reveal) showMainWindow();
}

async function showDshPage({ reveal = true } = {}) {
  await loadShell('ready', '');
  surface.showDsh();
  if (reveal) showMainWindow();
}

async function finishDesktopOperation(operation) {
  const completed = desktopSession.completeOperation(operation);
  updateTrayMenu();
  if (completed && !cleanupStarted) {
    await loadShell(shellState, shellMessage);
  }
  return completed;
}

function runtimeRecoveryAction() {
  return desktopSession.runtimeStatus === 'running'
    ? 'reload-page'
    : 'restart-runtime';
}

async function showUpdateDialog({
  kind = 'info',
  title,
  message,
  detail = '',
  primary = '确定',
  secondary = '',
  initialFocus = 'primary',
}) {
  if (cleanupStarted || !mainWindow || mainWindow.isDestroyed()) {
    return 'cancel';
  }
  showMainWindow();
  const updateWindow = new BrowserWindow({
    parent: mainWindow,
    modal: true,
    width: 460,
    height: 320,
    minWidth: 420,
    minHeight: 280,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    title: title || 'DSH 更新',
    icon: appIcon(),
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  updateWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  let settle;
  let settled = false;
  const choice = new Promise((resolve) => {
    settle = resolve;
  });
  const finish = (value) => {
    if (settled) return;
    settled = true;
    settle(value);
    if (!updateWindow.isDestroyed()) updateWindow.close();
  };

  updateWindow.webContents.on('will-navigate', (event) => {
    const candidate = event.url;
    event.preventDefault();
    if (candidate?.startsWith('dsh-dialog://')) {
      finish(new URL(candidate).hostname);
    }
  });
  updateWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  updateWindow.webContents.on('render-process-gone', () => {
    finish('cancel');
  });
  updateWindow.on('closed', () => {
    finish('cancel');
  });

  try {
    await updateWindow.loadFile(updateDialogPage, {
      query: {
        kind,
        title: safeMessage(title),
        message: safeMessage(message),
        detail: safeMessage(detail),
        primary: safeMessage(primary),
        secondary: safeMessage(secondary),
        initialFocus,
      },
    });
  } catch (error) {
    finish('cancel');
    throw error;
  }
  if (!updateWindow.isDestroyed()) updateWindow.show();
  return choice;
}

async function openExternal(candidate) {
  const url = externalHttpUrl(candidate);
  if (url) await shell.openExternal(url);
}

function handleDesktopAction(candidate) {
  const action = new URL(candidate).hostname;
  if (action === 'retry') {
    launchAction(startWithPreflight);
  } else if (action === 'reload-page') {
    launchAction(reloadDshPage);
  } else if (action === 'restart') {
    launchAction(restartDsh);
  } else if (action === 'check-update') {
    launchAction(checkForDshUpdate);
  } else if (action === 'copy-diagnostics') {
    clipboard.writeText([
      `DSH Desktop ${app.getVersion()}`,
      `Electron ${process.versions.electron}`,
      `Windows ${process.getSystemVersion()}`,
      '',
      runtime?.diagnostics || '尚无 DSH 进程输出。',
    ].join('\n'));
  } else if (action === 'exit') {
    requestExit();
  }
}

function handleShellRendererGone(details) {
  if (cleanupStarted || !mainWindow || mainWindow.isDestroyed()) return;
  shellView.rendererGone();
  if (shellRecovering) {
    log?.write(
      'desktop',
      `工具栏页面连续异常退出（${details.reason}）`,
    );
    tray?.setToolTip('DSH Desktop（工具栏异常）');
    return;
  }
  shellRecovering = true;
  const recovery = shellView.recover();
  shellRecoveryPromise = recovery;
  launchAction(async () => {
    try {
      await recovery;
    } finally {
      shellRecovering = false;
      if (shellRecoveryPromise === recovery) {
        shellRecoveryPromise = undefined;
      }
    }
  }, { background: true });
}

function handleDshRendererGone(details) {
  if (cleanupStarted) return;
  dshPageGeneration += 1;
  dshPageReady = false;
  if ([
    'reloading',
    'restarting',
    'starting',
    'upgrading',
  ].includes(desktopSession.operationKind)) {
    return;
  }
  const backendRunning = desktopSession.runtimeStatus === 'running';
  desktopSession.cancelCurrentOperation();
  updateTrayMenu();
  launchAction(() => showStatus(
    'error',
    backendRunning
      ? `DSH 页面进程异常退出（${details.reason}）。DSH 后端仍在运行。`
      : `DSH 页面进程异常退出（${details.reason}）。`,
    {
      errorKind: backendRunning ? 'page' : 'runtime',
      recoveryAction: backendRunning
        ? 'reload-page'
        : 'restart-runtime',
      reveal: false,
    },
  ), { background: true });
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 860,
    minHeight: 600,
    show: false,
    title: 'DSH',
    icon: appIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: statusPreload,
      sandbox: true,
      webSecurity: true,
    },
  });
  protectWebContents(window.webContents, {
    getExpectedOrigin: () => allowedDshOrigin,
    onDesktopAction: handleDesktopAction,
    onExternalError: (error) => {
      log?.write('desktop', `无法打开外部链接：${safeMessage(error)}`);
    },
    onRendererGone: handleShellRendererGone,
    openExternal,
    role: 'shell',
  });
  dshView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  protectWebContents(dshView.webContents, {
    getExpectedOrigin: () => allowedDshOrigin,
    onDesktopAction: handleDesktopAction,
    onExternalError: (error) => {
      log?.write('desktop', `无法打开外部链接：${safeMessage(error)}`);
    },
    onRendererGone: handleDshRendererGone,
    openExternal,
    role: 'dsh',
  });
  shellView = new ShellView({
    ipcMain,
    statusPage,
    window,
  });
  surface = new WindowSurface({
    mainWindow: window,
    onError: (error) => {
      if (cleanupStarted) return;
      launchAction(() => showStatus(
        'error',
        `无法恢复 DSH 页面布局：${safeMessage(error)}`,
        {
          errorKind: 'surface',
          recoveryAction: desktopSession.runtimeRunId
            ? runtimeRecoveryAction()
            : 'restart-runtime',
          reveal: false,
        },
      ), { background: true });
    },
    screen,
    toolbarHeight: TOOLBAR_HEIGHT,
    view: dshView,
  });
  window.on('close', (event) => {
    if (cleanupStarted) return;
    event.preventDefault();
    requestExit();
  });
  window.on('closed', () => {
    shellView.dispose();
    surface.dispose();
    dshView?.webContents.close();
  });
  return window;
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('DSH Desktop');
  tray.on('click', showMainWindow);
  updateTrayMenu();
}

async function stopDsh(operation) {
  desktopSession.checkpoint(operation);
  const runId = desktopSession.runtimeRunId ?? runtime.currentRunId;
  if (runId !== undefined) {
    await runtime.stop(runId);
    desktopSession.recordRuntimeExit(runId);
  }
  currentDshOrigin = undefined;
  dshPageGeneration += 1;
  dshPageReady = false;
  await waitForPortFree(DSH_PORT);
  desktopSession.checkpoint(operation);
}

function startCacheMode(version) {
  return dshStartCacheMode({
    targetVersion: version,
    selectedVersion,
    selectedVersionCommitted,
  });
}

async function startDsh(operation, version, { cacheMode = 'prefer-offline' } = {}) {
  desktopSession.checkpoint(operation);
  const starting = runtime.start(version, { cacheMode });
  const runId = runtime.currentRunId;
  desktopSession.setRuntime(operation, runId, 'starting');
  try {
    const result = await starting;
    desktopSession.checkpoint(operation);
    if (result.runId !== runId) {
      throw new Error('DSH 启动实例发生变化');
    }
    desktopSession.setRuntime(operation, runId, 'running');
    return result.url;
  } catch (error) {
    desktopSession.recordRuntimeExit(runId);
    throw error;
  }
}

function currentRunId(operation) {
  desktopSession.checkpoint(operation);
  const runId = desktopSession.runtimeRunId;
  if (runId === undefined || !desktopSession.isCurrentRuntime(runId)) {
    throw new Error('DSH 进程已退出');
  }
  return runId;
}

async function loadDsh(operation, url) {
  const runId = currentRunId(operation);
  const pageGeneration = ++dshPageGeneration;
  dshPageReady = false;
  currentDshOrigin = new URL(url).origin;
  allowedDshOrigin = currentDshOrigin;
  await dshView.webContents.loadURL(url);
  desktopSession.checkpoint(operation);
  if (pageGeneration !== dshPageGeneration) {
    throw new Error('DSH 页面加载实例发生变化');
  }
  if (!desktopSession.isCurrentRuntime(runId)) {
    throw new Error('DSH 在页面加载期间退出');
  }
  dshPageReady = true;
}

function requireDshPage(operation) {
  currentRunId(operation);
  if (!dshPageReady) throw new Error('DSH 页面尚未就绪');
}

async function latestDshVersion() {
  return queryLatestDshVersion({
    npmCommand,
    powershellCommand,
  });
}

async function writeSelectedRelease(version) {
  const writing = releaseStore.write(version);
  pendingReleaseCommit = writing;
  try {
    await writing;
  } finally {
    if (pendingReleaseCommit === writing) {
      pendingReleaseCommit = undefined;
    }
  }
}

async function restartDsh() {
  if (cleanupStarted || !selectedVersion) return;
  await runSelectedDsh('正在重启 DSH…', 'restarting');
}

async function reloadDshPage() {
  if (cleanupStarted) return;
  const operation = desktopSession.beginOperation('reloading');
  if (!operation) return;
  updateTrayMenu();
  try {
    const runId = currentRunId(operation);
    const url = dshView.webContents.getURL();
    if (!isAllowedDshNavigation(url, currentDshOrigin)) {
      throw new Error('DSH 页面没有可重新加载的安全地址');
    }
    await showStatus('starting', '正在重新加载 DSH 页面…');
    await loadDsh(operation, url);
    if (!desktopSession.isCurrentRuntime(runId)) {
      throw new Error('DSH 在页面重新加载期间退出');
    }
    await showDshPage();
    requireDshPage(operation);
  } catch (error) {
    if (
      !(error instanceof StaleDesktopOperationError)
      && desktopSession.isCurrent(operation)
    ) {
      await showStatus(
        'error',
        safeMessage(error),
        {
          errorKind: runtimeRecoveryAction() === 'reload-page'
            ? 'page'
            : 'runtime',
          recoveryAction: runtimeRecoveryAction(),
          reveal: false,
        },
      );
    }
  } finally {
    await finishDesktopOperation(operation);
  }
}

async function runSelectedDsh(statusMessage, kind = 'starting') {
  if (cleanupStarted) return;
  if (!selectedVersion) {
    await showStatus('error', '尚未选择 DSH 版本。');
    return;
  }
  const operation = desktopSession.beginOperation(kind);
  if (!operation) return;
  updateTrayMenu();
  try {
    await showStatus('starting', statusMessage);
    desktopSession.checkpoint(operation);
    await activateDshRelease({
      targetVersion: selectedVersion,
      stop: () => stopDsh(operation),
      start: (version) => startDsh(operation, version, {
        cacheMode: startCacheMode(version),
      }),
      load: (url) => loadDsh(operation, url),
      commit: async (version) => {
        if (selectedVersionCommitted) return;
        requireDshPage(operation);
        await writeSelectedRelease(version);
        selectedVersionCommitted = true;
        desktopSession.checkpoint(operation);
      },
      validate: () => requireDshPage(operation),
    });
    requireDshPage(operation);
    await showDshPage();
    requireDshPage(operation);
  } catch (error) {
    if (
      !(error instanceof StaleDesktopOperationError)
      && desktopSession.isCurrent(operation)
    ) {
      await showStatus(
        'error',
        safeMessage(error),
        {
          errorKind: kind === 'starting'
            ? 'startup'
            : 'runtime',
          recoveryAction: runtimeRecoveryAction(),
          reveal: false,
        },
      );
    }
  } finally {
    await finishDesktopOperation(operation);
  }
}

async function chooseInitialDshVersion() {
  const selection = await chooseDshReleaseForStartup({
    storedVersion: selectedVersion,
    queryLatest: async () => {
      await showStatus('starting', '正在查询可安装的 DSH 版本…');
      return latestDshVersion();
    },
    confirm: async (latestVersion) => {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '首次设置 DSH',
        message: `安装并固定 DSH ${latestVersion}？`,
        detail: [
          'DSH Desktop 只会在您确认后安装这个精确版本。',
          '后续普通启动不会检查或自动升级 DSH。',
          '需要升级时，可从窗口左上角或托盘手动检查更新。',
        ].join('\n'),
        buttons: ['安装并启动', '退出'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      return result.response === 0;
    },
  });
  if (!selection) return false;
  selectedVersion = selection.version;
  selectedVersionCommitted = !selection.needsCommit;
  updateTrayMenu();
  return true;
}

async function checkForDshUpdate() {
  if (cleanupStarted || !selectedVersionCommitted) return;
  const operation = desktopSession.beginOperation('checking');
  if (!operation) return;
  updateTrayMenu();
  let switching = false;
  try {
    await loadShell(shellState, shellMessage);
    desktopSession.checkpoint(operation);
    const latestVersion = await latestDshVersion();
    desktopSession.checkpoint(operation);
    desktopSession.transitionOperation(
      operation,
      'awaiting-confirmation',
    );
    await loadShell(shellState, shellMessage);
    if (!isNewerDshVersion(latestVersion, selectedVersion)) {
      await showUpdateDialog({
        kind: 'info',
        title: 'DSH 更新',
        message: `当前已是最新版本：${selectedVersion}`,
        primary: '确定',
      });
      desktopSession.checkpoint(operation);
      return;
    }

    const confirmation = await showUpdateDialog({
      kind: 'warning',
      title: '升级 DSH',
      message: `发现 DSH ${latestVersion}`,
      detail: [
        `当前版本：${selectedVersion}`,
        `目标版本：${latestVersion}`,
        '',
        'DSH Developer Preview 的升级可能包含不兼容变更。',
        '只有确认后才会停止当前版本并开始升级。',
      ].join('\n'),
      primary: '升级并重启',
      secondary: '暂不升级',
      initialFocus: 'secondary',
    });
    desktopSession.checkpoint(operation);
    if (confirmation !== 'primary') return;

    switching = true;
    desktopSession.transitionOperation(operation, 'upgrading');
    const previousVersion = selectedVersion;
    await showStatus(
      'starting',
      `正在从 DSH ${previousVersion} 升级到 ${latestVersion}…`,
    );
    const result = await activateDshRelease({
      targetVersion: latestVersion,
      previousVersion,
      stop: () => stopDsh(operation),
      start: (version) => startDsh(operation, version, {
        cacheMode: version === previousVersion
          ? 'prefer-offline'
          : 'prefer-online',
      }),
      load: (url) => loadDsh(operation, url),
      commit: async (version) => {
        requireDshPage(operation);
        await writeSelectedRelease(version);
        selectedVersion = version;
        selectedVersionCommitted = true;
      },
      validate: () => requireDshPage(operation),
    });
    requireDshPage(operation);
    if (result.status === 'rolled-back') {
      desktopSession.transitionOperation(
        operation,
        'awaiting-confirmation',
      );
      await showDshPage();
      requireDshPage(operation);
      await showUpdateDialog({
        kind: 'error',
        title: 'DSH 升级失败',
        message: `已自动恢复 DSH ${previousVersion}`,
        detail: [
          safeMessage(result.error),
          describeDshInstallFailure(result.error?.message),
        ].filter(Boolean).join('\n'),
        primary: '确定',
      });
      desktopSession.checkpoint(operation);
      return;
    }
    desktopSession.transitionOperation(
      operation,
      'awaiting-confirmation',
    );
    await showDshPage();
    requireDshPage(operation);
    await showUpdateDialog({
      kind: 'info',
      title: 'DSH 升级完成',
      message: `当前版本：${latestVersion}`,
      primary: '确定',
    });
    desktopSession.checkpoint(operation);
  } catch (error) {
    if (error instanceof StaleDesktopOperationError) {
      return;
    }
    if (switching && desktopSession.isCurrent(operation)) {
      await showStatus(
        'error',
        safeMessage(error),
        {
          errorKind: runtimeRecoveryAction() === 'reload-page'
            ? 'page'
            : 'runtime',
          recoveryAction: runtimeRecoveryAction(),
          reveal: false,
        },
      );
    } else if (desktopSession.isCurrent(operation)) {
      await loadShell(shellState, shellMessage);
      await showUpdateDialog({
        kind: 'error',
        title: '无法检查 DSH 更新',
        message: safeMessage(error),
        primary: '确定',
      });
    }
  } finally {
    await finishDesktopOperation(operation);
  }
}

async function startWithPreflight() {
  if (cleanupStarted) return;
  const operation = desktopSession.beginOperation('starting');
  if (!operation) return;
  updateTrayMenu();
  let shouldStart = false;
  try {
    if (!await chooseInitialDshVersion()) {
      requestExit();
      return;
    }
    desktopSession.checkpoint(operation);
    await showStatus(
      'starting',
      `正在检查本机 DSH ${selectedVersion}…`,
    );
    const inspection = await inspectDshPort(DSH_PORT);
    desktopSession.checkpoint(operation);
    if (inspection.kind === 'unknown') {
      throw new Error(
        `127.0.0.1:${DSH_PORT} 已被未知进程占用（PID ${inspection.listenerPid}）。`
        + '为避免误杀，App 不会终止该进程。',
      );
    }
    if (inspection.kind === 'dsh') {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'DSH Web 已在运行',
        message: '检测到另一个 DSH Web 实例。',
        detail: [
          `监听地址：127.0.0.1:${DSH_PORT}`,
          `监听 PID：${inspection.listenerPid}`,
          `将终止的进程树 PID：${inspection.rootPid}`,
          `命令行：${redactSecrets(inspection.rootCommandLine)}`,
          '',
          '终止后，DSH Desktop 将启动并管理新的实例。',
        ].join('\n'),
        buttons: ['终止并启动', '退出'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      desktopSession.checkpoint(operation);
      if (result.response !== 0) {
        requestExit();
        return;
      }
      await terminateDshProcessTree(inspection);
      await waitForPortFree(DSH_PORT);
      desktopSession.checkpoint(operation);
    }
    shouldStart = true;
  } catch (error) {
    if (
      !(error instanceof StaleDesktopOperationError)
      && desktopSession.isCurrent(operation)
    ) {
      await showStatus(
        'error',
        safeMessage(error),
        { reveal: false },
      );
    }
  } finally {
    await finishDesktopOperation(operation);
  }
  if (shouldStart && !cleanupStarted) {
    await runSelectedDsh(`正在启动 DSH ${selectedVersion}…`);
  }
}

function requestExit() {
  if (cleanupStarted) return;
  app.quit();
}

async function initialize() {
  if (process.platform !== 'win32') {
    dialog.showErrorBox(
      '不支持当前系统',
      'DSH Desktop 当前仅支持 Windows。',
    );
    app.exit(1);
    return;
  }

  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.on('will-download', (event) => {
    event.preventDefault();
  });
  Menu.setApplicationMenu(null);

  log = new SafeLog(
    path.join(app.getPath('userData'), 'logs'),
  );
  await log.initialize();
  releaseStore = new DshReleaseStore(
    path.join(app.getPath('userData'), 'dsh-release.json'),
  );
  selectedVersion = await releaseStore.read();
  selectedVersionCommitted = Boolean(selectedVersion);
  [npmCommand, powershellCommand] = await Promise.all([
    findExecutable('npm.cmd'),
    findExecutable('powershell.exe'),
  ]);
  runtime = new DshRuntime({
    logger: log,
    npmCommand,
    ownerPid: process.pid,
    powershellExecutable: powershellCommand,
    repoRoot,
    supervisorPath,
  });
  runtime.on('unexpected-exit', ({ code, runId, signal }) => {
    if (
      cleanupStarted
      || !desktopSession.recordRuntimeExit(runId)
    ) {
      return;
    }
    if (desktopSession.operationKind === 'upgrading') return;
    currentDshOrigin = undefined;
    dshPageGeneration += 1;
    dshPageReady = false;
    desktopSession.cancelCurrentOperation();
    updateTrayMenu();
    const reason = signal ? `signal ${signal}` : `exit code ${code}`;
    launchAction(() => showStatus(
      'error',
      `DSH ${selectedVersion || ''} 意外退出（${reason}）。`,
      {
        errorKind: 'runtime',
        recoveryAction: 'restart-runtime',
        reveal: false,
      },
    ), { background: true });
  });

  mainWindow = createMainWindow();
  createTray();
  app.on('activate', showMainWindow);
  await startWithPreflight();
}

if (hasSingleInstanceLock) {
  app.on('second-instance', showMainWindow);
  app.on('before-quit', (event) => {
    if (cleanupStarted) return;
    event.preventDefault();
    cleanupStarted = true;
    desktopSession.close();
    updateTrayMenu();
    void Promise.allSettled([
      runtime?.close(),
      pendingReleaseCommit,
    ]).finally(() => {
      tray?.destroy();
      app.exit(0);
    });
  });
  void app.whenReady().then(initialize).catch(async (error) => {
    cleanupStarted = true;
    desktopSession.close();
    await runtime?.close().catch((cleanupError) => {
      log?.write(
        'desktop',
        `启动失败后的进程清理失败：${safeMessage(cleanupError)}`,
      );
    });
    dialog.showErrorBox('DSH Desktop 启动失败', safeMessage(error));
    app.exit(1);
  });
}
