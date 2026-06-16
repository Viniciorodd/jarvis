// JARVIS — unified desktop shell (Electron). One window onto the whole system: switch between
// Jarvis World and HQ, pointed at your NAS over Tailscale (or localhost in dev). Stays in the tray;
// summon with Ctrl/Cmd+Shift+J. Package installers with `npm run dist` (per-platform).
'use strict';
const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('node:path');

let win = null, tray = null;
app.isQuitting = false;

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 860, minWidth: 480, minHeight: 600,
    backgroundColor: '#04070f', title: 'Jarvis', show: false, autoHideMenuBar: true,
    webPreferences: { webviewTag: true, contextIsolation: true },
  });
  win.loadFile(path.join(__dirname, 'shell.html'));
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
  // open external links (real sam.gov, etc.) in the system browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function toggle() {
  if (!win) return createWindow();
  if (win.isVisible() && win.isFocused()) win.hide(); else { win.show(); win.focus(); }
}

function makeTray() {
  const img = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
  try {
    tray = new Tray(img);
    tray.setToolTip('Jarvis');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show / hide Jarvis', click: toggle },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
    ]));
    tray.on('click', toggle);
  } catch { /* tray optional */ }
}

app.whenReady().then(() => {
  createWindow();
  makeTray();
  globalShortcut.register('CommandOrControl+Shift+J', toggle);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { /* keep running in the tray */ });
app.on('will-quit', () => globalShortcut.unregisterAll());
