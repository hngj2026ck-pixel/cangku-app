// 给网页用的电脑端接口（window.cangkuDesktop）
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cangkuDesktop', {
  isDesktop: true,
  setPending: n => ipcRenderer.send('pending', n),
  setTitleBar: o => ipcRenderer.send('titlebar', o),
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  saveFile: (name, b64) => ipcRenderer.invoke('save-file', { name, b64 }),
  backupDone: (name, b64) => ipcRenderer.send('backup-done', { name, b64 }),
  backupFailed: msg => ipcRenderer.send('backup-failed', msg),
  onBackupRequest: cb => ipcRenderer.on('backup-request', () => cb()),
  onGoto: cb => ipcRenderer.on('goto', (_e, v) => cb(v))
});
