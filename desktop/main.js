// JARVIS — unified desktop shell (Electron). Boots the companion server locally,
// then switches between Jarvis World (localhost:8095) and HQ (NAS). Stays in tray;
// summon with Ctrl/Cmd+Shift+J.
'use strict';
const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = 8095;
// companion/server.js lives two levels up from desktop/
const SERVER = path.join(__dirname, '..', 'companion', 'server.js');

let win = null, tray = null, server = null;
app.isQuitting = false;

// Windows: bind an explicit AppUserModelID so the taskbar groups under our icon
// (without this, an unpackaged `electron .` run shows the generic Electron icon).
if (process.platform === 'win32') app.setAppUserModelId('com.rodgate.jarvis');

function startCompanion() {
  if (!fs.existsSync(SERVER)) return; // skip if running outside the repo
  server = spawn(process.execPath, [SERVER], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', COMPANION_PORT: String(PORT) },
    stdio: 'inherit',
  });
  server.on('exit', (code) => { if (!app.isQuitting) console.error('companion exited', code); });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 860, minWidth: 480, minHeight: 600,
    backgroundColor: '#04070f', title: 'Jarvis', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { webviewTag: true, contextIsolation: true },
  });
  win.loadFile(path.join(__dirname, 'shell.html'));
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function toggle() {
  if (!win) return createWindow();
  if (win.isVisible() && win.isFocused()) win.hide(); else { win.show(); win.focus(); }
}

function makeTray() {
  let img = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  if (img.isEmpty()) img = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
  try {
    tray = new Tray(img);
    tray.setToolTip('JARVIS');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show / hide Jarvis', click: toggle },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
    ]));
    tray.on('click', toggle);
  } catch { /* tray optional */ }
}

// Single-instance lock: a second launch (e.g. installer auto-start + a manual
// click) focuses the existing window instead of spawning a duplicate.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
    else createWindow();
  });

  app.whenReady().then(() => {
    startCompanion();
    createWindow();
    makeTray();
    globalShortcut.register('CommandOrControl+Shift+J', toggle);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}
app.on('window-all-closed', () => { /* keep running in tray */ });
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (server) server.kill(); });
