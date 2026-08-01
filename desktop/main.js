// JARVIS — unified desktop shell (Electron). Boots the companion server locally,
// then switches between Jarvis World (localhost:8095) and HQ (NAS). Stays in tray;
// summon with Ctrl/Cmd+Shift+J.
'use strict';
const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, shell, session } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = 8095;
// companion/server.js lives two levels up from desktop/
const SERVER = path.join(__dirname, '..', 'companion', 'server.js');

let win = null, tray = null, server = null, overlay = null;
app.isQuitting = false;

// Windows: bind an explicit AppUserModelID so the taskbar groups under our icon
// (without this, an unpackaged `electron .` run shows the generic Electron icon).
if (process.platform === 'win32') app.setAppUserModelId('com.rodgate.jarvis');

// Is something already serving the companion on PORT? Two supervisors want that port — this app, and
// scripts/run-loop.cmd (the keep-alive wrapper). Spawning blindly meant whichever lost the race died with
// EADDRINUSE while the app still believed it had started a server, and every restart of the other one left a
// window where the UI showed "Could not reach Jarvis — Failed to fetch". Ask first.
function companionAlive(timeoutMs = 1200) {
  return fetch('http://127.0.0.1:' + PORT + '/api/cockpit', { signal: AbortSignal.timeout(timeoutMs) })
    .then((r) => r.ok).catch(() => false);
}

async function startCompanion() {
  if (!fs.existsSync(SERVER)) return;            // running outside the repo
  if (await companionAlive()) {                  // run-loop.cmd (or a dev run) already owns it — leave it be
    console.log('[jarvis] companion already running on ' + PORT + ' — not starting a second one');
    return;
  }
  const spawnOne = () => {
    server = spawn(process.execPath, [SERVER], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', COMPANION_PORT: String(PORT) },
      stdio: 'inherit',
    });
    server.on('exit', async (code) => {
      if (app.isQuitting) return;
      console.error('[jarvis] companion exited (' + code + ')');
      // If the OTHER supervisor took the port, that's fine — it's serving. Only respawn when nothing is.
      if (await companionAlive()) return;
      setTimeout(() => { if (!app.isQuitting) spawnOne(); }, 3000);
    });
  };
  spawnOne();
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

// ── THE OVERLAY (PRD "Jarvis Desktop Presence", build order #1) ────────────────────────────────────
// Operator: "Jarvis is a place he has to GO TO. Everything else is where he already IS." Ctrl+Shift+J
// already existed but it toggles the FULL 1180x860 app — which is the same friction, just faster. This is
// the Spotlight pattern: a small always-on-top panel over whatever he's doing, ask, answer, gone.
//
// Frameless + skipTaskbar + no menu so it reads as an overlay rather than another window to manage. It
// carries NO node integration and no preload: it only ever talks to the companion on 127.0.0.1:8095 over
// HTTP, exactly like the browser UI, so this window adds no new privilege to the machine.
function createOverlay() {
  overlay = new BrowserWindow({
    width: 660, height: 190, show: false, frame: false, transparent: true, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, autoHideMenuBar: true, fullscreenable: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  overlay.loadFile(path.join(__dirname, 'overlay.html'));
  // Float above full-screen apps too, or it is useless in exactly the moment he is heads-down in one.
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  // Escape dismisses. Handled here rather than in the page so it works even while the input has focus and
  // needs no preload bridge.
  overlay.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') { e.preventDefault(); hideOverlay(); }
  });
  // Click-away dismisses, like Spotlight. Without this it becomes a sticky window he has to go close.
  overlay.on('blur', () => { if (overlay && overlay.isVisible()) hideOverlay(); });
  overlay.on('closed', () => { overlay = null; });
  // "Open full Jarvis" from the panel — the page signals via a hash it cannot otherwise act on.
  overlay.webContents.on('did-navigate-in-page', (_e, url) => {
    if (!url.endsWith('#open-full')) return;
    hideOverlay();
    if (!win) createWindow(); else { win.show(); win.focus(); }
    overlay.webContents.executeJavaScript('history.replaceState(null,"",location.pathname)').catch(() => {});
  });
}

function hideOverlay() { if (overlay) overlay.hide(); }

function toggleOverlay() {
  if (!overlay) createOverlay();
  if (overlay.isVisible()) { hideOverlay(); return; }
  // Re-centre each time: he may have moved monitors since the last summon, and an overlay that opens on a
  // screen he is not looking at is worse than no overlay.
  overlay.center();
  overlay.show();
  overlay.focus();
  // Tell the page to clear the last answer — each summon is a fresh ask, not a scrollback.
  overlay.webContents.executeJavaScript('window.dispatchEvent(new Event("jarvis-overlay-shown"))').catch(() => {});
}

function makeTray() {
  let img = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  if (img.isEmpty()) img = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
  try {
    tray = new Tray(img);
    tray.setToolTip('JARVIS');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Ask Jarvis (overlay)\tCtrl+Shift+Space', click: toggleOverlay },
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

  // THE REAL blank-Home fix: a <webview> uses its OWN session, NOT session.defaultSession — so the launch-time
  // clear below never touched the webview's cache, and a stale cached bundle kept blacking out Home/Today/Jarvis.
  // Clear the actual webview session's cache + service workers the moment the webview's web-contents is created.
  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType && contents.getType() === 'webview') {
      try { contents.session.clearCache(); contents.session.clearStorageData({ storages: ['serviceworkers', 'cachestorage', 'shadercache'] }); } catch { /* best-effort */ }
    }
  });

  app.whenReady().then(async () => {
    // This app is served from localhost (always online) — a stale cache buys nothing and causes blank/half-
    // rendered screens when shipped UI changes only partly land. Clear the webview's HTTP cache + service
    // workers on every launch so the latest UI always shows. (2026-07-20 — fix for blank Home/Today.)
    try {
      await session.defaultSession.clearCache();
      await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage', 'shadercache'] });
    } catch { /* best-effort — never block launch on a cache clear */ }
    startCompanion();
    createWindow();
    createOverlay();          // built up front so the first summon is instant, not a cold window load
    makeTray();
    globalShortcut.register('CommandOrControl+Shift+J', toggle);
    // The overlay hotkey. Registration FAILS SILENTLY in Electron when another app already owns the combo,
    // so try a short list and log which one won — a hotkey that quietly does nothing is the worst outcome
    // here, because he'd conclude the whole feature is broken.
    const OVERLAY_KEYS = ['CommandOrControl+Shift+Space', 'CommandOrControl+Alt+J', 'CommandOrControl+Shift+K'];
    const bound = OVERLAY_KEYS.find((k) => { try { return globalShortcut.register(k, toggleOverlay); } catch { return false; } });
    if (bound) console.log('[jarvis] ask-overlay hotkey: ' + bound);
    else console.warn('[jarvis] no overlay hotkey available — all candidates are taken. Use the tray menu: "Ask Jarvis".');
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}
app.on('window-all-closed', () => { /* keep running in tray */ });
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (server) server.kill(); });
