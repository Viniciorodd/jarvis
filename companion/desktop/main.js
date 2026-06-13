// JARVIS Companion — Electron desktop shell.
// Boots the companion server as a child (in Node mode via ELECTRON_RUN_AS_NODE),
// opens a frameless dark window with the orb, and binds a global summon hotkey.
// Closing the window hides it (stays running); quit with Ctrl+Shift+Q.
'use strict';
const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = Number(process.env.COMPANION_PORT || 8095);
const URL = `http://localhost:${PORT}`;
const SERVER = path.join(__dirname, '..', 'server.js');
const SUMMON = 'CommandOrControl+Shift+J';

let win = null, server = null, tray = null;
app.isQuitting = false;

function startServer() {
  server = spawn(process.execPath, [SERVER], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', COMPANION_PORT: String(PORT) },
    stdio: 'inherit',
  });
  server.on('exit', (code) => { if (!app.isQuitting) console.error('companion server exited', code); });
}

function createWindow() {
  win = new BrowserWindow({
    width: 900, height: 760, minWidth: 420, minHeight: 520,
    frame: false, backgroundColor: '#04070f', show: false,
    title: 'JARVIS', alwaysOnTop: false,
    webPreferences: { contextIsolation: true },
  });
  win.removeMenu();

  const tryLoad = (n = 0) => win.loadURL(URL).catch(() => { if (n < 40) setTimeout(() => tryLoad(n + 1), 400); });
  tryLoad();

  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
}

function toggle() {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) win.hide();
  else { win.show(); win.focus(); }
}

function makeTray() {
  // 1x1 transparent fallback so Tray never crashes if no icon asset is present
  const img = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  );
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

app.whenReady().then(() => {
  startServer();
  createWindow();
  makeTray();
  globalShortcut.register(SUMMON, toggle);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { /* keep running in tray */ });
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (server) server.kill(); });
