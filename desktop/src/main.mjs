import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  nativeImage,
  session,
  shell,
  Tray,
  WebContentsView,
} from 'electron';

import {
  activateDshRelease,
  chooseDshReleaseForStartup,
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
import {
  inspectDshPort,
  terminateDshProcessTree,
  waitForPortFree,
} from './windows-processes.mjs';

const fileDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(fileDirectory, '..');
const repoRoot = path.resolve(desktopRoot, '..');
const statusPage = path.join(fileDirectory, 'status', 'index.html');
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
let busy = false;
let cleanupStarted = false;
let dshView;
let dshViewAttached = false;
let mainWindow;
let npmCommand;
let powershellCommand;
let releaseStore;
let runtime;
let selectedVersion;
let selectedVersionCommitted = false;
let shellMessage = '';
let shellState = 'starting';
let restartActivity;
let tray;
let updateActivity;

app.setName('DSH Desktop');
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function safeMessage(error) {
  return redactSecrets(error instanceof Error ? error.message : String(error))
    .slice(0, 800);
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
  return image;
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
      enabled: !busy && Boolean(selectedVersion),
      click: () => {
        void restartDsh();
      },
    },
    {
      label: '检查 DSH 更新…',
      enabled: !busy && selectedVersionCommitted,
      click: () => {
        void checkForDshUpdate();
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: requestExit,
    },
  ]));
}

function layoutDshView() {
  if (!dshViewAttached || !mainWindow || mainWindow.isDestroyed()) return;
  const { width, height } = mainWindow.getContentBounds();
  dshView.setBounds({
    x: 0,
    y: TOOLBAR_HEIGHT,
    width,
    height: Math.max(0, height - TOOLBAR_HEIGHT),
  });
}

function hideDshView() {
  if (!dshViewAttached || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.contentView.removeChildView(dshView);
  dshViewAttached = false;
}

function attachDshView() {
  if (!dshViewAttached) {
    mainWindow.contentView.addChildView(dshView);
    dshViewAttached = true;
  }
  layoutDshView();
}

async function loadShell(state, message) {
  if (cleanupStarted || !mainWindow || mainWindow.isDestroyed()) return;
  shellState = state;
  shellMessage = message;
  await mainWindow.loadFile(statusPage, {
    query: {
      state,
      message: safeMessage(message),
      version: selectedVersion || '',
      canRestart: String(!busy && Boolean(selectedVersion)),
      canCheckUpdates: String(!busy && selectedVersionCommitted),
      restartActivity: restartActivity || '',
      updateActivity: updateActivity || '',
    },
  });
}

async function showStatus(state, message) {
  if (cleanupStarted || !mainWindow || mainWindow.isDestroyed()) return;
  allowedDshOrigin = undefined;
  hideDshView();
  await loadShell(state, message);
  showMainWindow();
}

async function showDshPage() {
  await loadShell('ready', '');
  attachDshView();
  showMainWindow();
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
    void startWithPreflight();
  } else if (action === 'restart') {
    void restartDsh();
  } else if (action === 'check-update') {
    void checkForDshUpdate();
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

function protectWebContents(contents, { allowDesktopActions = false } = {}) {
  contents.setWindowOpenHandler(({ url }) => {
    void openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  const handleMainFrameNavigation = (event, candidate) => {
    const current = contents.getURL();
    if (
      allowDesktopActions
      && current.startsWith('file:')
      && candidate.startsWith('dsh-desktop://')
    ) {
      event.preventDefault();
      handleDesktopAction(candidate);
      return;
    }
    if (
      allowedDshOrigin
      && isAllowedDshNavigation(candidate, allowedDshOrigin)
    ) {
      return;
    }
    event.preventDefault();
    void openExternal(candidate);
  };

  contents.on('will-navigate', (details) => {
    handleMainFrameNavigation(details, details.url);
  });
  contents.on('will-redirect', (details) => {
    if (details.isMainFrame) {
      handleMainFrameNavigation(details, details.url);
    } else if (
      !allowedDshOrigin
      || !isAllowedDshNavigation(details.url, allowedDshOrigin)
    ) {
      details.preventDefault();
    }
  });
  contents.on('will-frame-navigate', (details) => {
    if (
      !details.isMainFrame
      && (
        !allowedDshOrigin
        || !isAllowedDshNavigation(details.url, allowedDshOrigin)
      )
    ) {
      details.preventDefault();
    }
  });
  contents.on('render-process-gone', (_event, details) => {
    if (cleanupStarted) return;
    void showStatus(
      'error',
      `页面进程异常退出（${details.reason}）。DSH 进程仍由 App 管理。`,
    );
  });
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
      sandbox: true,
      webSecurity: true,
    },
  });
  protectWebContents(window.webContents, {
    allowDesktopActions: true,
  });
  dshView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  protectWebContents(dshView.webContents);
  window.on('resize', layoutDshView);
  window.on('close', (event) => {
    if (cleanupStarted) return;
    event.preventDefault();
    requestExit();
  });
  window.on('closed', () => {
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

async function stopDsh() {
  await runtime.stop();
  await waitForPortFree(DSH_PORT);
}

async function latestDshVersion() {
  return queryLatestDshVersion({
    npmCommand,
    powershellCommand,
  });
}

async function restartDsh() {
  if (busy || cleanupStarted || !selectedVersion) return;
  restartActivity = 'restarting';
  await runSelectedDsh('正在重启 DSH…');
}

async function runSelectedDsh(statusMessage) {
  if (busy || cleanupStarted) return;
  if (!selectedVersion) {
    await showStatus('error', '尚未选择 DSH 版本。');
    return;
  }
  busy = true;
  updateTrayMenu();
  await showStatus('starting', statusMessage);
  try {
    await activateDshRelease({
      targetVersion: selectedVersion,
      stop: stopDsh,
      start: (version) => runtime.start(version),
      load: async (url) => {
        allowedDshOrigin = new URL(url).origin;
        await dshView.webContents.loadURL(url);
      },
      commit: async (version) => {
        if (selectedVersionCommitted) return;
        await releaseStore.write(version);
        selectedVersionCommitted = true;
      },
    });
    await showDshPage();
  } catch (error) {
    await showStatus('error', safeMessage(error));
  } finally {
    restartActivity = undefined;
    busy = false;
    updateTrayMenu();
    if (dshViewAttached) await loadShell('ready', '');
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
  if (busy || cleanupStarted || !selectedVersionCommitted) return;
  busy = true;
  updateActivity = 'checking';
  updateTrayMenu();
  await loadShell(shellState, shellMessage);
  let switching = false;
  try {
    const latestVersion = await latestDshVersion();
    updateActivity = undefined;
    await loadShell(shellState, shellMessage);
    if (!isNewerDshVersion(latestVersion, selectedVersion)) {
      await showUpdateDialog({
        kind: 'info',
        title: 'DSH 更新',
        message: `当前已是最新版本：${selectedVersion}`,
        primary: '确定',
      });
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
    if (confirmation !== 'primary') return;

    switching = true;
    updateActivity = 'upgrading';
    const previousVersion = selectedVersion;
    await showStatus(
      'starting',
      `正在从 DSH ${previousVersion} 升级到 ${latestVersion}…`,
    );
    const result = await activateDshRelease({
      targetVersion: latestVersion,
      previousVersion,
      stop: stopDsh,
      start: (version) => runtime.start(version),
      load: async (url) => {
        allowedDshOrigin = new URL(url).origin;
        await dshView.webContents.loadURL(url);
      },
      commit: (version) => releaseStore.write(version),
    });
    if (result.status === 'rolled-back') {
      updateActivity = undefined;
      await showDshPage();
      await showUpdateDialog({
        kind: 'error',
        title: 'DSH 升级失败',
        message: `已自动恢复 DSH ${previousVersion}`,
        detail: safeMessage(result.error),
        primary: '确定',
      });
      return;
    }
    selectedVersion = latestVersion;
    selectedVersionCommitted = true;
    updateActivity = undefined;
    await showDshPage();
    await showUpdateDialog({
      kind: 'info',
      title: 'DSH 升级完成',
      message: `当前版本：${latestVersion}`,
      primary: '确定',
    });
  } catch (error) {
    updateActivity = undefined;
    if (switching) {
      await showStatus('error', safeMessage(error));
    } else {
      await loadShell(shellState, shellMessage);
      await showUpdateDialog({
        kind: 'error',
        title: '无法检查 DSH 更新',
        message: safeMessage(error),
        primary: '确定',
      });
    }
  } finally {
    updateActivity = undefined;
    busy = false;
    updateTrayMenu();
    if (dshViewAttached) await loadShell('ready', '');
  }
}

async function startWithPreflight() {
  if (busy || cleanupStarted) return;
  busy = true;
  updateTrayMenu();
  try {
    if (!await chooseInitialDshVersion()) {
      requestExit();
      return;
    }
    await showStatus(
      'starting',
      `正在检查本机 DSH ${selectedVersion}…`,
    );
    const inspection = await inspectDshPort(DSH_PORT);
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
      if (result.response !== 0) {
        requestExit();
        return;
      }
      await terminateDshProcessTree(inspection);
      await waitForPortFree(DSH_PORT);
    }
  } catch (error) {
    await showStatus('error', safeMessage(error));
    busy = false;
    updateTrayMenu();
    return;
  }
  busy = false;
  updateTrayMenu();
  await runSelectedDsh(`正在启动 DSH ${selectedVersion}…`);
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

  const log = new SafeLog(
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
  runtime.on('unexpected-exit', ({ code, signal }) => {
    if (busy || cleanupStarted) return;
    const reason = signal ? `signal ${signal}` : `exit code ${code}`;
    void showStatus(
      'error',
      `DSH ${selectedVersion || ''} 意外退出（${reason}）。`,
    );
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
    busy = true;
    updateTrayMenu();
    void Promise.resolve(runtime?.stop()).finally(() => {
      tray?.destroy();
      app.exit(0);
    });
  });
  void app.whenReady().then(initialize).catch(async (error) => {
    cleanupStarted = true;
    await runtime?.stop();
    dialog.showErrorBox('DSH Desktop 启动失败', safeMessage(error));
    app.exit(1);
  });
}
