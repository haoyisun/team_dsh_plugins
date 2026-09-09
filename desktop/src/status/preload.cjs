const { contextBridge, ipcRenderer } = require('electron');

const APPLIED_CHANNEL = 'dsh-desktop:shell-applied';
const STATE_CHANNEL = 'dsh-desktop:shell-state';

contextBridge.exposeInMainWorld('dshDesktopShell', {
  onState(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on(STATE_CHANNEL, (_event, state) => {
      callback(state);
      ipcRenderer.send(APPLIED_CHANNEL, state.revision);
    });
  },
});
