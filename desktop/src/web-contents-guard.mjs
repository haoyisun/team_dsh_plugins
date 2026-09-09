import {
  desktopNavigationAction,
  isAllowedDshNavigation,
} from './runtime-contract.mjs';

export function protectWebContents(contents, {
  getExpectedOrigin,
  onDesktopAction,
  onExternalError = () => {},
  onRendererGone,
  openExternal,
  role,
}) {
  const safelyOpenExternal = (candidate) => {
    void Promise.resolve()
      .then(() => openExternal(candidate))
      .catch(onExternalError);
  };
  contents.setWindowOpenHandler(({ url }) => {
    safelyOpenExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  const handleMainFrameNavigation = (event, candidate) => {
    const expectedOrigin = getExpectedOrigin();
    const action = desktopNavigationAction({
      candidate,
      current: contents.getURL(),
      expectedOrigin,
      role,
    });
    if (action === 'desktop-action') {
      event.preventDefault();
      onDesktopAction(candidate);
      return;
    }
    if (action === 'allow') return;
    event.preventDefault();
    safelyOpenExternal(candidate);
  };

  contents.on('will-navigate', (details) => {
    handleMainFrameNavigation(details, details.url);
  });
  contents.on('will-redirect', (details) => {
    const expectedOrigin = getExpectedOrigin();
    if (details.isMainFrame) {
      handleMainFrameNavigation(details, details.url);
    } else if (
      role !== 'dsh'
      || !expectedOrigin
      || !isAllowedDshNavigation(details.url, expectedOrigin)
    ) {
      details.preventDefault();
    }
  });
  contents.on('will-frame-navigate', (details) => {
    const expectedOrigin = getExpectedOrigin();
    if (
      !details.isMainFrame
      && (
        role !== 'dsh'
        || !expectedOrigin
        || !isAllowedDshNavigation(details.url, expectedOrigin)
      )
    ) {
      details.preventDefault();
    }
  });
  contents.on('render-process-gone', (_event, details) => {
    onRendererGone(details);
  });
}
