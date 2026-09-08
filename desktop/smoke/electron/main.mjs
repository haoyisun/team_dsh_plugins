import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  app,
  BrowserWindow,
  nativeImage,
} from 'electron';

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
      },
    },
  );
  const page = await window.webContents.executeJavaScript(`({
    title: document.querySelector('#title')?.textContent,
    message: document.querySelector('#message')?.textContent,
    actionsHidden: document.querySelector('#actions')?.hidden,
    progressHidden: document.querySelector('#progress')?.hidden
  })`);
  if (
    page.title !== 'DSH 未能启动'
    || page.message !== 'smoke-test-message'
    || page.actionsHidden !== false
    || page.progressHidden !== true
  ) {
    throw new Error(`状态页渲染结果异常：${JSON.stringify(page)}`);
  }

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

  console.log('Electron ESM、导航事件、状态页与应用图标加载正常。');
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
