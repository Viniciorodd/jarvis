' JARVIS companion server — auto-start launcher.
' Runs `node companion/server.js` hidden (no console window) at login so the
' desktop app's World tab always has a live server on http://localhost:8095.
' A copy of this file lives in the user's Startup folder; edit this source and
' re-copy it there to update. Safe if a server is already running — the second
' instance simply fails to bind 8095 and exits.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\vinic\Desktop\jarvis"
sh.Run """C:\Program Files\nodejs\node.exe"" companion\server.js", 0, False
