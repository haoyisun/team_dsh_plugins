import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  app,
  BrowserWindow,
  nativeImage,
  shell,
  WebContentsView,
} from 'electron';

import { APP_USER_MODEL_ID } from '../../src/app-identity.mjs';
import { buildShortcutPlan } from '../../src/shortcut.mjs';

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

function nextNavigation(contents, eventName) {
  return Promise.race([
    new Promise((resolve) => {
      contents.once(eventName, (details) => {
        details.preventDefault();
        resolve(details);
      });
    }),
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`未收到 ${eventName}`)),
        5_000,
      );
    }),
  ]);
}

app.whenReady().then(async () => {
  const icon = nativeImage.createFromPath(
    path.join(desktopRoot, 'bin', 'app-icon.ico'),
  );
  if (icon.isEmpty()) throw new Error('应用图标无法加载');
  const trayIcon = nativeImage.createFromPath(
    path.join(desktopRoot, 'bin', 'tray-icon.ico'),
  );
  if (trayIcon.isEmpty()) throw new Error('托盘图标无法加载');

  const shortcutDir = await mkdtemp(path.join(tmpdir(), 'dsh-desktop-shortcut-'));
  try {
    const [shortcut] = buildShortcutPlan({
      desktopRoot,
      desktopDirectory: shortcutDir,
      startMenuDirectory: shortcutDir,
      powershellExecutable: path.join(
        process.env.SystemRoot || 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      ),
      iconPath: path.join(desktopRoot, 'bin', 'app-icon.ico'),
    });
    if (!shell.writeShortcutLink(shortcut.path, 'create', shortcut.options)) {
      throw new Error('无法写入带 AppUserModelID 的快捷方式');
    }
    const details = shell.readShortcutLink(shortcut.path);
    assert.equal(details.appUserModelId, APP_USER_MODEL_ID);
    assert.equal(details.icon, shortcut.options.icon);
  } finally {
    await rm(shortcutDir, { recursive: true, force: true });
  }

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  await window.loadFile(
    path.join(desktopRoot, 'src', 'status', 'index.html'),
    {
      query: {
        state: 'error',
        message: 'smoke-test-message',
        version: '1.2.3',
        canRestart: 'true',
        canCheckUpdates: 'true',
      },
    },
  );
  const page = await window.webContents.executeJavaScript(`({
    title: document.querySelector('#title')?.textContent,
    message: document.querySelector('#message')?.textContent,
    actionsHidden: document.querySelector('#actions')?.hidden,
    progressHidden: document.querySelector('#progress')?.hidden,
    version: document.querySelector('#dsh-version')?.textContent,
    restartLabel: document.querySelector('#restart-label')?.textContent,
    restartDisabled: document.querySelector('#restart-dsh')?.disabled,
    updateDisabled: document.querySelector('#check-update')?.disabled,
    restartTag: document.querySelector('#restart-dsh')?.tagName,
    updateTag: document.querySelector('#check-update')?.tagName,
    restartClass: document.querySelector('#restart-dsh')?.className,
    updateClass: document.querySelector('#check-update')?.className,
    buttonStyles: (() => {
      const keys = [
        'minHeight',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
        'borderTopWidth',
        'borderRadius',
        'fontSize',
        'fontFamily',
        'backgroundColor',
        'color',
      ];
      const read = (selector) => {
        const style = getComputedStyle(document.querySelector(selector));
        return Object.fromEntries(keys.map((key) => [key, style[key]]));
      };
      return {
        restart: read('#restart-dsh'),
        update: read('#check-update'),
      };
    })()
  })`);
  if (
    page.title !== 'DSH 未能启动'
    || page.message !== 'smoke-test-message'
    || page.actionsHidden !== false
    || page.progressHidden !== true
    || page.version !== 'DSH 1.2.3'
    || page.restartLabel !== '重启 DSH'
    || page.restartDisabled !== false
    || page.updateDisabled !== false
    || page.restartTag !== 'BUTTON'
    || page.updateTag !== 'BUTTON'
    || page.restartClass !== page.updateClass
  ) {
    throw new Error(`状态页渲染结果异常：${JSON.stringify(page)}`);
  }
  assert.deepEqual(page.buttonStyles.restart, page.buttonStyles.update);

  const restartNavigation = nextNavigation(
    window.webContents,
    'will-navigate',
  );
  await window.webContents.executeJavaScript(
    'document.querySelector("#restart-dsh").click()',
  );
  assert.equal(
    (await restartNavigation).url,
    'dsh-desktop://restart',
  );

  const updateNavigation = nextNavigation(
    window.webContents,
    'will-navigate',
  );
  await window.webContents.executeJavaScript(
    'document.querySelector("#check-update").click()',
  );
  assert.equal(
    (await updateNavigation).url,
    'dsh-desktop://check-update',
  );

  await window.loadFile(
    path.join(desktopRoot, 'src', 'status', 'index.html'),
    {
      query: {
        state: 'ready',
        version: '1.2.3',
        canCheckUpdates: 'false',
        updateActivity: 'checking',
      },
    },
  );
  const checking = await window.webContents.executeJavaScript(`({
    buttonText: document.querySelector('#check-update')?.textContent.trim(),
    buttonBusy: document.querySelector('#check-update')?.getAttribute('aria-busy'),
    spinnerHidden: document.querySelector('#update-spinner')?.hidden
  })`);
  assert.deepEqual(checking, {
    buttonText: '检查中…',
    buttonBusy: 'true',
    spinnerHidden: false,
  });

  await window.loadFile(
    path.join(desktopRoot, 'src', 'status', 'index.html'),
    {
      query: {
        state: 'starting',
        message: '正在重启 DSH…',
        version: '1.2.3',
        canRestart: 'false',
        canCheckUpdates: 'false',
        restartActivity: 'restarting',
      },
    },
  );
  const restarting = await window.webContents.executeJavaScript(`({
    restartText: document.querySelector('#restart-label')?.textContent.trim(),
    restartBusy: document.querySelector('#restart-dsh')?.getAttribute('aria-busy'),
    restartSpinnerHidden: document.querySelector('#restart-spinner')?.hidden,
    restartDisabled: document.querySelector('#restart-dsh')?.disabled,
    updateText: document.querySelector('#update-label')?.textContent.trim(),
    updateBusy: document.querySelector('#check-update')?.getAttribute('aria-busy')
  })`);
  assert.deepEqual(restarting, {
    restartText: '重启中…',
    restartBusy: 'true',
    restartSpinnerHidden: false,
    restartDisabled: true,
    updateText: '检查更新',
    updateBusy: null,
  });

  await window.loadFile(
    path.join(desktopRoot, 'src', 'update-dialog', 'index.html'),
    {
      query: {
        kind: 'warning',
        title: '升级 DSH',
        message: '发现 DSH 2.0.0',
        detail: '当前版本：1.2.3\n目标版本：2.0.0',
        primary: '升级并重启',
        secondary: '暂不升级',
        initialFocus: 'secondary',
      },
    },
  );
  const dialogPage = await window.webContents.executeJavaScript(`({
    title: document.querySelector('#dialog-title')?.textContent,
    message: document.querySelector('#dialog-message')?.textContent,
    detail: document.querySelector('#dialog-detail')?.textContent,
    primary: document.querySelector('#primary-action')?.textContent,
    secondary: document.querySelector('#secondary-action')?.textContent,
    focused: document.activeElement?.id
  })`);
  assert.deepEqual(dialogPage, {
    title: '升级 DSH',
    message: '发现 DSH 2.0.0',
    detail: '当前版本：1.2.3\n目标版本：2.0.0',
    primary: '升级并重启',
    secondary: '暂不升级',
    focused: 'secondary-action',
  });
  const dialogChoice = nextNavigation(
    window.webContents,
    'will-navigate',
  );
  await window.webContents.executeJavaScript(
    'document.querySelector("#primary-action").click()',
  );
  assert.equal((await dialogChoice).url, 'dsh-dialog://primary');

  const dshView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.contentView.addChildView(dshView);
  dshView.setBounds({ x: 0, y: 44, width: 800, height: 556 });
  await dshView.webContents.loadFile(
    path.join(import.meta.dirname, 'frame.html'),
  );
  assert.deepEqual(
    dshView.getBounds(),
    { x: 0, y: 44, width: 800, height: 556 },
  );
  window.contentView.removeChildView(dshView);
  dshView.webContents.close();

  const mainNavigation = nextNavigation(
    window.webContents,
    'will-navigate',
  );
  await window.webContents.executeJavaScript(
    'window.location.href = "https://example.com/main-navigation"',
  );
  assert.equal(
    (await mainNavigation).url,
    'https://example.com/main-navigation',
  );

  await window.loadFile(path.join(import.meta.dirname, 'frame.html'));
  const frameNavigation = nextNavigation(
    window.webContents,
    'will-frame-navigate',
  );
  await window.webContents.executeJavaScript(`
    const frame = document.createElement('iframe');
    frame.src = 'https://example.com/frame-navigation';
    document.body.append(frame);
  `);
  const frameDetails = await frameNavigation;
  assert.equal(frameDetails.url, 'https://example.com/frame-navigation');
  assert.equal(frameDetails.isMainFrame, false);

  const server = createServer((_request, response) => {
    response.writeHead(302, {
      location: 'https://example.com/redirect-target',
    });
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const redirect = nextNavigation(window.webContents, 'will-redirect');
    const { port } = server.address();
    await window.loadURL(`http://127.0.0.1:${port}/`).catch(() => {});
    assert.equal(
      (await redirect).url,
      'https://example.com/redirect-target',
    );
  } finally {
    server.close();
    await once(server, 'close');
  }

  console.log('Electron ESM、导航事件、状态页与图标加载正常。');
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
