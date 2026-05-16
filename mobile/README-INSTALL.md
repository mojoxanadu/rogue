# Install on Android via Termux

The PWA bundle (the four files in `dist/`) is checked into the repo,
so you don't need Python or Make on Termux to run it — just `git`.

## What you need on Android

`dist/` contains exactly four files in one flat directory:

```
dist/
├── index.html      (~1.3 MB, the game)
├── manifest.json   (~440 B)
├── sw.js           (~1.6 KB)
└── icon.svg        (~1 KB)
```

## Two ways to get them

### A. Clone the repo on Termux (recommended)

```sh
pkg install git python              # one-time setup
git clone https://github.com/mojoxanadu/rogue.git
cd rogue/mobile/dist
python3 -m http.server 8000
```

### B. Build on a dev machine, transfer the four files

On the dev machine:

```sh
cd ~/rogue
make mobile        # produces mobile/dist/
```

Copy the four files in `mobile/dist/` to any directory on the
Android device (`scp`, USB, share intent — whatever works) then
from that directory:

```sh
python3 -m http.server 8000
```

## Install as a PWA

1. Open Chrome on the **same Android device** running the server.
2. Go to `http://localhost:8000`. Chrome treats `localhost` as a
   secure origin — the service worker registers and the install
   option becomes available.
3. 3-dot menu → **Install app** (or **Add to Home Screen**).
4. Launch from the home-screen icon. Opens chromeless, full-screen.

After install the service worker has cached the app shell, so you
can stop `python -m http.server` and the home-screen icon still
launches the game offline.

## Caveats

- **Other devices on your LAN**: if you want a laptop or another
  phone to install from your Termux instance over Wi-Fi, Chrome
  will refuse service-worker registration over plain HTTP — you'd
  need an HTTPS tunnel (ngrok, Tailscale Funnel, Cloudflare
  Tunnel) or a self-signed cert. Same-device `localhost` is the
  painless path.
- **iOS**: PWA install works in Safari but with limited APIs vs
  Android. Not currently a target.
- **Updates**: pulling fresh code (`git pull`) refreshes the
  served files. To force the cached PWA to pick up the update,
  bump `CACHE_VERSION` in `sw.js` before pulling — the activate
  sweep on the next launch will purge the old cache.
