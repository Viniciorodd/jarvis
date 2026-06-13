# JARVIS Companion — Desktop app

Wraps the orb + brain in a real desktop window (frameless, dark) with a global summon hotkey
and a tray icon. The server runs inside Electron — you don't need Node installed separately.

## Run it (first time)
```powershell
cd C:\Users\vinic\Desktop\jarvis\companion\desktop
npm install      # downloads Electron (~250 MB, one time)
npm start
```

A dark JARVIS window opens with the orb. It reads your `ANTHROPIC_API_KEY` from the project
`.env` automatically (same key the rest of the system uses).

## Using her
- **Summon / hide from anywhere:** `Ctrl + Shift + J`
- **Talk:** click the 🎙 mic (push to talk), or toggle **"Hello Jarvis"** for hands-free
  ("Jarvis, create a folder called Invoices")
- **She speaks back** by default (🔊 voice toggle to mute) — browser-native voice for now;
  ElevenLabs is the next upgrade
- **Her workspace** (where she creates/edits files) is `~/Desktop/JARVIS-Workspace`.
  Change it by setting `JARVIS_ROOT` before launch.
- **Closing the window** hides her to the tray (she keeps running). **Quit** from the tray menu.

## Make a real installer later
`npm install -D electron-builder` then add a build config — produces a `.exe` you double-click,
no terminal. We'll do that once the app's feature set settles (voice + tools + pods).

## What's wired vs coming
- ✅ Chat brain (Claude), file/folder tools (in workspace), browser voice in/out, action chips, HQ link
- ⏳ Next: ElevenLabs voice, Picovoice "Hello Jarvis" wake word, delete/move + PC control (gated),
  calendar/email/Stripe, and live fusion with the agent pods.
