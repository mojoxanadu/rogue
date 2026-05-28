# Rogue PWA wrapper

Turns the single-file game (`../dev_build.html`) into an installable
Progressive Web App: drop the contents of `dist/` on any HTTPS host
(GitHub Pages, Netlify, Cloudflare Pages, your own server) and an
Android visitor can "Add to Home Screen" from Chrome to install a
standalone, offline-capable app.

## Build

```sh
make           # produces dist/
make serve     # local HTTP server on :8000 for testing
make clean
```

From the repo root, `make mobile` does the same and ensures
`dev_build.html` is current first.

## How it works

- **manifest.json** — tells Android this is an installable app, names
  it, picks the icon, sets standalone + portrait display.
- **sw.js** — service worker; caches the app shell on first load so
  the game runs offline thereafter. Bump `CACHE_VERSION` on redeploy
  to invalidate stale caches.
- **icon.svg** — single SVG icon used at every requested size
  (modern Android Chrome accepts SVG manifest icons).
- **Makefile** — `sed`-injects the manifest link + service worker
  registration into a copy of the source HTML, then copies the PWA
  assets alongside. The source HTML is unchanged.

## Install (user-facing)

1. Open the deployed URL in Chrome on Android.
2. Tap the three-dot menu → "Add to Home Screen" / "Install app".
3. Launch from the home-screen icon — opens chromeless, full-screen.
4. Plays offline after the first launch (everything cached by the
   service worker).

## Save data

Saves are stored in the WebView's `localStorage` (same path as a
desktop browser). Uninstalling the PWA clears it. A future native
wrapper (Capacitor) could surface saves to Android's Storage Access
Framework for backup/share, but the PWA path keeps that off the
critical path.

## Known caveats

- **iOS** is the awkward one: Safari treats PWAs like web pages
  rather than apps. Most things work but the install experience and
  some APIs (notifications, etc.) are limited. Not currently a
  target.
- **Old Android (pre-Chrome 60)** may not honor SVG manifest icons.
  If we hit users on those devices, regenerate the icon as
  `icon-192.png` + `icon-512.png` and update manifest.json's `icons`
  list. PNG export from `icon.svg` via `rsvg-convert` or ImageMagick
  is one shell line.
