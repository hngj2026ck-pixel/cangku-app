// 仓库软件电脑端（Electron）：打开线上网页 + 开机自启 + 托盘 + 新申报通知 + 每周自动备份
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog, shell, nativeImage, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');

const URL = 'https://gaotianci449-source.github.io/cangku/';
const KEEP_BACKUPS = 12;                 // 只保留最近 12 份备份
const WEEK = 7 * 24 * 3600 * 1000;
const BUILD = path.join(__dirname, 'build');

let win = null, tray = null, quitting = false, pending = 0, pendingMax = false;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const loadSettings = () => { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch (e) { return {}; } };
const saveSettings = s => { try { fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); } catch (e) {} };
const backupDir = () => path.join(app.getPath('documents'), '仓库备份');

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => showWin());
app.setAppUserModelId('com.cangku.desktop');

function showWin(view) {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (pendingMax) { pendingMax = false; win.maximize(); }
  win.show(); win.focus();
  if (view) win.webContents.send('goto', view);
}

async function createWindow(hidden) {
  // 窗口大小：记住上次的位置和大小；第一次打开直接铺满屏幕（最大化）
  const st = loadSettings(), wa = screen.getPrimaryDisplay().workArea;
  const b = st.bounds || { width: Math.min(1600, wa.width), height: wa.height };
  win = new BrowserWindow({
    ...b, minWidth: 420, minHeight: 600, show: false, title: '仓库',
    icon: path.join(BUILD, 'icon.png'), backgroundColor: '#E4E6E5', autoHideMenuBar: true,
    // 无边框：去掉 Windows 标题栏，最小化/最大化/关闭按钮画在网页顶栏右边
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#E4E6E5', symbolColor: '#2B3438', height: 64 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.setMenu(null);
  // 开机自启是藏在托盘里的；Windows 上隐藏时调用最大化会把窗口弹出来，所以等第一次打开时再最大化
  if (st.maximized !== false) { if (hidden) pendingMax = true; else win.maximize(); }
  if (!hidden) win.show();
  const remember = () => { if (!win || win.isMinimized()) return; const s2 = loadSettings(); s2.maximized = win.isMaximized(); if (!s2.maximized) s2.bounds = win.getBounds(); saveSettings(s2); };
  win.on('resized', remember); win.on('moved', remember); win.on('maximize', remember); win.on('unmaximize', remember);
  // 每次启动清掉网页的普通缓存，保证拿到最新版本（离线用的缓存不受影响）
  try { await session.defaultSession.clearCache(); } catch (e) {}
  win.loadURL(URL);
  win.webContents.on('did-fail-load', (_e, code, _d, url, isMain) => { if (isMain && code !== -3) win.loadFile(path.join(__dirname, 'offline.html')); });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // 网页里的下载（如果有）直接存到"下载"文件夹
  win.webContents.session.on('will-download', (_e, item) => item.setSavePath(path.join(app.getPath('downloads'), item.getFilename())));
  // 点关闭按钮只是缩到托盘
  win.on('close', e => { if (!quitting) { e.preventDefault(); win.hide(); } });
}

function trayImage() {
  return nativeImage.createFromPath(path.join(BUILD, pending > 0 ? 'tray16-dot.png' : 'tray16.png'));
}
function updateTray() {
  if (!tray) return;
  tray.setImage(trayImage());
  tray.setToolTip(pending > 0 ? `仓库：${pending} 条待处理` : '仓库');
  const s = loadSettings();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: pending > 0 ? `打开仓库（${pending} 条待处理）` : '打开仓库', click: () => showWin() },
    { label: '查看申报', click: () => showWin('req') },
    { type: 'separator' },
    { label: '立即备份', click: () => requestBackup(true) },
    { label: '打开备份文件夹', click: () => { fs.mkdirSync(backupDir(), { recursive: true }); shell.openPath(backupDir()); } },
    { label: s.lastBackup ? `上次备份：${new Date(s.lastBackup).toLocaleString('zh-CN')}` : '还没有备份过', enabled: false },
    { type: 'separator' },
    { label: '开机自动启动', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: m => setAutostart(m.checked) },
    { label: '退出', click: () => { quitting = true; app.quit(); } }
  ]));
}
function setAutostart(on) {
  app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
  const s = loadSettings(); s.autostartSet = true; saveSettings(s); updateTray();
}

// ---------- 每周备份 ----------
let manualBackup = false;
function requestBackup(manual) {
  manualBackup = !!manual;
  if (win) win.webContents.send('backup-request');
}
function checkBackup() {
  const s = loadSettings();
  if (!s.lastBackup || Date.now() - s.lastBackup > WEEK) requestBackup(false);
}
ipcMain.on('backup-done', (_e, { name, b64 }) => {
  try {
    const dir = backupDir(); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), Buffer.from(b64, 'base64'));
    const files = fs.readdirSync(dir).filter(f => /^仓库备份_.*\.xlsx$/.test(f)).sort();
    files.slice(0, Math.max(0, files.length - KEEP_BACKUPS)).forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
    const s = loadSettings(); s.lastBackup = Date.now(); saveSettings(s); updateTray();
    if (manualBackup) { new Notification({ title: '备份完成', body: `已保存到 文档\\仓库备份\\${name}` }).show(); manualBackup = false; }
  } catch (err) { new Notification({ title: '备份失败', body: String(err.message || err) }).show(); }
});
ipcMain.on('backup-failed', (_e, msg) => { if (manualBackup) new Notification({ title: '备份失败', body: msg }).show(); manualBackup = false; });

// ---------- 网页传来的事件 ----------
ipcMain.on('titlebar', (_e, o) => { try { if (win) win.setTitleBarOverlay(o); } catch (e) {} });
ipcMain.on('pending', (_e, n) => { if (n !== pending) { pending = n; updateTray(); if (win) win.setTitle(n > 0 ? `仓库（${n} 条待处理）` : '仓库'); } });
ipcMain.on('notify', (_e, { title, body }) => {
  const n = new Notification({ title, body, icon: path.join(BUILD, 'icon.png') });
  n.on('click', () => showWin('req')); n.show();
  if (win && !win.isFocused()) win.flashFrame(true);
});
ipcMain.handle('save-file', async (_e, { name, b64 }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('downloads'), name), filters: [{ name: 'Excel 表格', extensions: ['xlsx'] }] });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, Buffer.from(b64, 'base64')); shell.showItemInFolder(r.filePath); return true;
});

app.whenReady().then(() => {
  const hidden = process.argv.includes('--hidden');
  const s = loadSettings();
  if (!s.autostartSet && app.isPackaged) setAutostart(true);   // 第一次运行默认开启开机自启
  createWindow(hidden);
  tray = new Tray(trayImage());
  tray.on('click', () => showWin());
  updateTray();
  // 页面加载完 1 分钟后检查一次要不要备份，之后每 6 小时检查一次
  win.webContents.once('did-finish-load', () => setTimeout(checkBackup, 60 * 1000));
  setInterval(checkBackup, 6 * 3600 * 1000);
});
app.on('window-all-closed', e => e.preventDefault());
app.on('before-quit', () => { quitting = true; });
