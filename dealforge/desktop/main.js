// DealForge — Electron desktop shell (Windows + macOS). Boots the DealForge server as a
// child in Node mode (ELECTRON_RUN_AS_NODE), opens a window on it, stays in the tray, and
// binds a global summon hotkey (Ctrl/Cmd+Shift+D). Mirrors the repo's companion/desktop shell.
//
// For a hosted/standalone build, set DEALFORGE_REMOTE_URL to point at a cloud backend instead
// of spawning the local server (so deals sync across machines).
'use strict';
const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = Number(process.env.DEALFORGE_PORT || 8096);
const REMOTE = process.env.DEALFORGE_REMOTE_URL || '';
const URL = REMOTE || `http://localhost:${PORT}`;
// Dev: server.js sits one level up. Packaged: it's unpacked into resources/app (see package.json).
const SERVER = app.isPackaged
  ? path.join(process.resourcesPath, 'app', 'server.js')
  : path.join(__dirname, '..', 'server.js');
const SUMMON = 'CommandOrControl+Shift+D';

let win = null, server = null, tray = null;
app.isQuitting = false;
if (process.platform === 'win32') app.setAppUserModelId('com.rodgate.dealforge');

function startServer() {
  if (REMOTE || !fs.existsSync(SERVER)) return; // hosted build, or running outside the repo
  // Packaged app bundle is read-only — keep user data (deals, uploads, secret) in userData.
  const dataDir = app.isPackaged ? path.join(app.getPath('userData'), 'data') : undefined;
  server = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env, ELECTRON_RUN_AS_NODE: '1', DEALFORGE_PORT: String(PORT),
      ...(dataDir ? { DEALFORGE_DATA_DIR: dataDir } : {}),
    },
    stdio: 'inherit',
  });
  server.on('exit', (code) => { if (!app.isQuitting) console.error('dealforge server exited', code); });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 880, minWidth: 560, minHeight: 640,
    backgroundColor: '#0e1117', title: 'DealForge', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true },
  });
  win.removeMenu();
  const tryLoad = (n = 0) => win.loadURL(URL).catch(() => { if (n < 40) setTimeout(() => tryLoad(n + 1), 400); });
  tryLoad();
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
  // open external links in the system browser, never inside the app shell
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function toggle() {
  if (!win) return createWindow();
  if (win.isVisible() && win.isFocused()) win.hide(); else { win.show(); win.focus(); }
}

function makeTray() {
  let img = nativeImage.createFromPath(path.join(__dirname, 'tray.png'));
  if (img.isEmpty()) img = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  try {
    tray = new Tray(img);
    tray.setToolTip('DealForge');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show / hide DealForge', click: toggle },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
    ]));
    tray.on('click', toggle);
  } catch { /* tray optional */ }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
    else createWindow();
  });
  app.whenReady().then(() => {
    startServer();
    createWindow();
    makeTray();
    globalShortcut.register(SUMMON, toggle);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}
app.on('window-all-closed', () => { /* keep running in tray */ });
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (server) server.kill(); });
