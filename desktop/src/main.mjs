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
} from 'electron';

import { DshRuntime } from './dsh-runtime.mjs';
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
const iconPath = path.join(desktopRoot, 'bin', 'app-icon.ico');
const supervisorPath = path.join(
  desktopRoot,
  'bin',
  'dsh-supervisor.exe',
);
const DSH_PORT = 3080;

let allowedDshOrigin;
let busy = false;
let cleanupStarted = false;
let mainWindow;
let runtime;
let tray;

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

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: showMainWindow,
    },
    { type: 'separator' },
    {
      label: '重启 DSH',
      enabled: !busy,
      click: () => {
        void runDsh('normal', '正在重启 DSH…');
      },
    },
    {
      label: '更新 DSH',
      enabled: !busy,
      click: () => {
        void runDsh('update', '正在更新并重启 DSH…');
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: requestExit,
    },
  ]));
}

async function showStatus(state, message) {
  if (cleanupStarted || !mainWindow || mainWindow.isDestroyed()) return;
  allowedDshOrigin = undefined;
  await mainWindow.loadFile(statusPage, {
    query: {
      state,
      message: safeMessage(message),
    },
  });
  showMainWindow();
}

async function openExternal(candidate) {
  const url = externalHttpUrl(candidate);
  if (url) await shell.openExternal(url);
}

function handleDesktopAction(candidate) {
  const action = new URL(candidate).hostname;
  if (action === 'retry') {
    void startWithPreflight();
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

function protectWebContents(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  const handleMainFrameNavigation = (event, candidate) => {
    const current = window.webContents.getURL();
    if (
      current.startsWith('file:')
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

  window.webContents.on('will-navigate', (details) => {
    handleMainFrameNavigation(details, details.url);
  });
  window.webContents.on('will-redirect', (details) => {
    if (details.isMainFrame) {
      handleMainFrameNavigation(details, details.url);
    } else if (
      !allowedDshOrigin
      || !isAllowedDshNavigation(details.url, allowedDshOrigin)
    ) {
      details.preventDefault();
    }
  });
  window.webContents.on('will-frame-navigate', (details) => {
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
  window.webContents.on('render-process-gone', (_event, details) => {
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
  protectWebContents(window);
  window.on('close', (event) => {
    if (cleanupStarted) return;
    event.preventDefault();
    requestExit();
  });
  return window;
}

function createTray() {
  const image = appIcon().resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('DSH Desktop');
  tray.on('click', showMainWindow);
  updateTrayMenu();
}

async function runDsh(mode, statusMessage) {
  if (busy || cleanupStarted) return;
  busy = true;
  updateTrayMenu();
  await showStatus('starting', statusMessage);
  try {
    await runtime.stop();
    await waitForPortFree(DSH_PORT);
    const url = await runtime.start(mode);
    allowedDshOrigin = new URL(url).origin;
    await mainWindow.loadURL(url);
    showMainWindow();
  } catch (error) {
    await showStatus('error', safeMessage(error));
  } finally {
    busy = false;
    updateTrayMenu();
  }
}

async function startWithPreflight() {
  if (busy || cleanupStarted) return;
  busy = true;
  updateTrayMenu();
  await showStatus('starting', '正在检查本机 DSH Web…');
  try {
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
  await runDsh('normal', '正在启动 DSH…');
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
  runtime = new DshRuntime({
    logger: log,
    ownerPid: process.pid,
    repoRoot,
    supervisorPath,
  });
  runtime.on('unexpected-exit', ({ code, signal }) => {
    if (busy || cleanupStarted) return;
    const reason = signal ? `signal ${signal}` : `exit code ${code}`;
    void showStatus('error', `DSH 意外退出（${reason}）。`);
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
