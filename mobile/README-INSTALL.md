# Install on Android

Two paths. The **GitHub Pages path is recommended** — installs as a true
PWA (WebAPK), works offline after first launch, no Termux required.
The Termux path is still documented for hacking or LAN-only setups.

## Path A — GitHub Pages (recommended)

The `dist/` bundle is published at:

```
https://mojoxanadu.github.io/rogue/mobile/dist/
```

1. Open that URL in **Chrome on Android**.
2. Wait a beat for the page to load (the service worker needs to register).
3. 3-dot menu → **Install app**.
   - If you only see "Add to Home Screen" (no "Install app"), the
     install criteria didn't trip — try a hard reload and wait a few
     more seconds before opening the menu. The PNG icons in this
     bundle exist specifically to satisfy the WebAPK installer.
4. Launch from the home-screen icon — opens chromeless, full-screen.
5. After first launch the service worker has cached the app shell, so
   the game runs offline. **Phone restart, airplane mode, GitHub Pages
   down — all fine.** The home-screen icon still launches the game.

### How do I know it installed as a real PWA?

Long-press the home-screen icon → **App info**.

- **WebAPK (good):** has its own entry in Android Settings → Apps,
  with its own storage line. Launches without browser chrome.
- **Shortcut (the failure mode you hit on the Termux install):**
  "App info" bounces you to Chrome's settings. Launches in a Chrome
  tab — fails hard when the origin is unreachable.

## Path B — Termux on the same device

Useful for hacking on the code or when you want a fully offline build
loop. **Note: installs from `localhost` often produce a shortcut, not
a WebAPK** — see Caveats below.

`dist/` contains six files in one flat directory:

```
dist/
├── index.html      (~1.3 MB, the game)
├── manifest.json
├── sw.js
├── icon.svg
├── icon-192.png
└── icon-512.png
```

### B.1 — Clone the mirror on Termux

```sh
pkg install git python              # one-time
git clone https://github.com/mojoxanadu/rogue.git
cd rogue/mobile/dist
python3 -m http.server 8000
```

### B.2 — Build on dev machine, transfer

```sh
cd ~/rogue
make mobile        # produces mobile/dist/
```

Copy all six files in `mobile/dist/` to any directory on the Android
device, then from that directory:

```sh
python3 -m http.server 8000
```

### Then install

1. Open Chrome → `http://localhost:8000`. Chrome treats `localhost`
   as a secure origin, so the service worker registers.
2. 3-dot menu → **Install app** if offered, else "Add to Home Screen".
3. Launch from home-screen icon.

## Caveats

- **Termux-installed PWAs may not survive a phone restart.** If
  "Add to Home Screen" produced a shortcut rather than a WebAPK,
  the launcher just opens `http://localhost:8000` in Chrome — and
  if Termux isn't running, you get `ECONNREFUSED`. **Use Path A
  (GitHub Pages) if you want survivability**; Path B is for dev.
- **Other devices on your LAN (Termux serving)**: Chrome refuses
  service-worker registration over plain HTTP on non-localhost
  origins. You'd need an HTTPS tunnel (ngrok, Tailscale Funnel,
  Cloudflare Tunnel). Path A sidesteps this entirely.
- **iOS**: PWA install works in Safari but with limited APIs vs
  Android. Not currently a target.
- **Updates**: `git pull` refreshes served files (Path B) or
  redeploying Pages refreshes them (Path A). To force the cached
  PWA to pick up the update, bump `CACHE_VERSION` in `sw.js` before
  publishing — the activate sweep on next launch purges the old
  cache.
