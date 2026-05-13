# Build Architecture (sketch)

Three independent build scripts. Each owns one tier; they communicate through
files on disk, not through Python imports, so any one can be re-run without
the others.

```
   ┌──────────────────┐         ┌──────────────────┐
   │  src/*.html,js   │         │  raw/  (PNG,     │
   │  (this repo)     │         │   TTF, mp3, ...) │
   └────────┬─────────┘         └────────┬─────────┘
            │                            │
            │ build_html.py              │ build_assets.py
            ▼                            ▼
   ┌──────────────────┐         ┌──────────────────┐
   │ dev_build.html   │         │ assets.json      │
   │ (no images)      │         │ (manifest +      │
   │                  │         │  base64 blobs)   │
   └────────┬─────────┘         └────────┬─────────┘
            │                            │
            └──────────┬─────────────────┘
                       ▼
              build_release.py
                       ▼
            ┌──────────────────────┐
            │ roguelike_<n>.html   │
            │ (final, self-cont.)  │
            └──────────────────────┘
```

## 1. `build_html.py` — dev build

Fastest iteration. For developers tweaking JS/HTML.

| | |
|---|---|
| **Inputs**  | `src/*.html`, `src/*.js` |
| **Outputs** | `dev_build.html` |
| **Skips**   | All binary asset embedding. `{{TITLE_IMAGE}}` etc. → empty data URI, and `<img>` tags with empty src get `display:none` via injected CSS so Chrome shows no broken-image icon. |
| **Time**    | < 1s |
| **Audience**| Developers |

This is roughly today's `build.py` minus the title-render block.

## 2. `build_assets.py` — asset build

Packages binaries into a manifest the release build consumes. Design team
re-runs this when art/audio changes; devs never need to.

| | |
|---|---|
| **Inputs**  | `raw/` directory (PNG, TTF, mp3, gif, …), `config` |
| **Outputs** | `assets.json` (manifest, see `assets.example.json`), `raw/title_rendered.png` (title + build-number overlay composited onto `raw/title.png` using `raw/fonts/PixelifySans-Bold.ttf`) |
| **Audience**| Designers, sound designers |

The script's job: walk `raw/`, base64-encode each file, write the manifest with
metadata (id, role, mime type, token name for HTML substitution). The
title-overlay render lives here — it's an asset transform (input PNG + font →
output PNG), and keeping it in tier 2 lets tier 3 stay pure string substitution.

## 3. `build_release.py` — integrated build

Combines source + assets into the final shippable HTML.

| | |
|---|---|
| **Inputs**  | `src/*` + `assets.json` |
| **Outputs** | `roguelike_build<N>.html` |
| **Behavior**| Concatenates source like `build_html.py`, then for each manifest entry replaces `{{TOKEN}}` in the assembled HTML with the entry's base64 data URI. Pure string substitution — no image processing. |
| **Audience**| Release / CI |

## Manifest contract

`assets.json` is the single source of truth between tier 2 and tier 3.

- **Schema version** (`schema_version`) is bumped on breaking changes; the
  release build refuses to consume an unknown version rather than silently
  miscompile.
- **Tokens** in `src/*.html` (`{{TITLE_IMAGE}}`, `{{FONT_PIXELIFY_BOLD}}`, …)
  are the join points. Adding a new asset = add a manifest entry + reference
  its token from HTML. No code change to `build_release.py` needed.
- **Embed mode** is per-entry (`base64`, `path`, `external_url`) so future
  large assets can stay out-of-band if needed.

See `assets.example.json` for the concrete shape.

## Asset path differences from the upstream source repo

`raw/` does not mirror the original `/home/projects/roguelike/` layout exactly.
Document each tweak here so design team knows where to drop files.

| Asset             | Upstream path                           | `raw/` path                     | Reason                                                  |
|-------------------|-----------------------------------------|---------------------------------|---------------------------------------------------------|
| Pixelify Sans Bold| `fonts/static/PixelifySans-Bold.ttf`    | `raw/fonts/PixelifySans-Bold.ttf` | `static/` was an upstream font-archive artifact, not meaningful here |

## Decisions

- **Build settings** (`BUILD`, `GAME_NAME`) live in a flat `config` file at repo root. Python scripts import them via `config.py`; the Makefile reads the same file via `include config`. Single source of truth.
- **Source-file order** lives in `build_files.py`. Tier 1 and tier 3 both import `FILES` from there — adding a new file means editing one list.
- **Title overlay** is rendered in tier 2 (asset transform); tier 3 is pure string substitution.
- **Raw assets** live in `rogue/raw/` but are **gitignored**. Design team copies the current `raw/` contents into their local clone manually (shared drive, Slack drop, whatever). Trade-off accepted: new devs don't get assets in `git clone` (must request a copy), but the repo stays small and there's no LFS server to maintain. Revisit if/when an LFS-capable git server (gitea) is stood up.
