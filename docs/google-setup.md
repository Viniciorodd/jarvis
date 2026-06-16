# Connect Jarvis to your Gmail + Calendar (read-only)

This lets the companion **read and summarize** your inbox and agenda ("read me my email", "what's my
agenda this week"). It is **read-only** — she can never send or change anything. ~10 minutes, one time.

You do this on the **same PC you run the companion on**, and you edit the same `.env` the rest of Jarvis uses.

## 1. Make a Google project + turn on the two APIs
1. Go to **https://console.cloud.google.com** (sign in with the Google account whose email/calendar you want).
2. Top bar → **project dropdown → New Project** → name it `Jarvis` → Create. Make sure it's selected.
3. Left menu → **APIs & Services → Library**. Search **"Gmail API"** → open it → **Enable**.
4. Back to Library, search **"Google Calendar API"** → open → **Enable**.

## 2. Set up the consent screen (so Google lets your own app in)
1. **APIs & Services → OAuth consent screen**.
2. User type: **External** → Create.
3. App name: `Jarvis`. User support email + developer email: your email. Save and continue.
4. **Scopes**: just Save and continue (the app asks for them at sign-in).
5. **Test users → Add users → add your own email address.** Save. (This is what lets you log in while the app is "unverified".)

## 3. Create the credentials
1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Desktop app** → name `Jarvis Desktop` → Create.
3. Copy the **Client ID** and **Client secret**.

## 4. Put them in `.env` and connect
Edit `C:\Users\vinic\Desktop\jarvis\.env` and fill:
```
GOOGLE_CLIENT_ID=<the client id>
GOOGLE_CLIENT_SECRET=<the client secret>
```
Then, in a terminal in that folder:
```
node scripts/google-auth.mjs
```
Your browser opens. **You'll see "Google hasn't verified this app" — that's normal, it's *your* app.**
Click **Advanced → Go to Jarvis (unsafe)**, then **Allow** Gmail + Calendar (read-only). The page will say
"✅ Jarvis is connected" and the script saves your token.

## 5. Use it
Restart the companion (`companion/start-jarvis.cmd` or `node companion/server.js`) and say:
- *"Read me my email"* / *"any important emails?"*
- *"What's on my calendar this week?"* / *"Am I free Thursday?"*

Nothing here goes to GitHub — your token lives only in `.env` on your PC.
