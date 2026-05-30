# Build 750 — Deployment Notes
**Date:** April 12–13, 2026  
**Status:** READY FOR DEPLOYMENT  
**Deployment format:** Base64 JSON multipart (3 × ~50 MB)  
**Files:** `roguelike_deploy_750_part1.json` through `roguelike_deploy_750_part3.json`

---

## What Changed Since Build 748

Build 748 was the last stable deployment. Builds 749 and 750 represent approximately
2.5–3 weeks of equivalent development work completed in a single session.

---

## Major Architectural Changes

### 1. `src/player.js` — New Module (K5 refactor)

**Before:** Player state (`inventory`, `pouch`, `const player`, `setPlayerDefaults`,
`changeGold`, `PlayerSprites`) was scattered across `state.js`. Player combat functions
(`getPlayerDmg`, `getPlayerHits`, etc.) were inlined ad-hoc in `engine.js`.

**After:** All player state and behaviour is consolidated into `src/player.js`.
- `inventory` and `pouch` arrays
- `const player = {}` — initialised by `setPlayerDefaults()` (single source of truth)
- `changeGold(amount)` — safe gold adjustment
- `PlayerSprites` — sprite animation state machine
- `getPlayerPrimaryHand()`, `getPlayerHitRate()`, `getPlayerHits(enemy)`,
  `getPlayerDmg()`, `getPlayerDmgVersus(enemy)`, `getPlayerCritRate()` — combat helpers
- `applyDamageToEnemy(dmg, enemy)` in `engine.js` — centralised crit + HP application

**Rule:** All new player logic and state MUST go in `player.js`. No other module
should declare player properties directly.

**Build order impact:** `player.js` loads after `state.js` and before `engine.js` /
`mechanics.js` (position 4 in the 28-file build sequence).

---

### 2. WebGL2 NS Fluid Orbs — `src/webgl_fx.js`

**Before:** `drawOrb()` used a Canvas 2D sine-wave waterline + old FBM `renderTexture`
shader (WebGL1, mode 0). Visible as a flat gradient.

**After:** Full Navier-Stokes fluid simulation on a shared WebGL2 offscreen canvas
(`state.nsOrbs`).
- RGBA16F half-float FBOs (no `EXT_color_buffer_float` extension needed)
- Advect velocity → divergence → 15 Jacobi pressure iters → gradient subtract → advect dye
- Energy system: `orb.energy` decays `×0.994/frame` (~2s half-life); bumped by player
  movement, combat hits, mouse interaction
- HP orb: blood red `[0.25, 0.01, 0.02]`, red-only hue; MP: royal blue, full rainbow
- Falls back to sine-wave renderer if WebGL2 unavailable
- `energizeOrb()` now bumps both old and NS fluid energy

---

### 3. `GAME_NAME` Template Variable — `build.py`

**Before:** "ROGUELIKE", "ROGUE JS", "Dungeon Delver" used inconsistently across files.

**After:** `GAME_NAME = "NotAName"` in `build.py`. All user-visible name references use
`{{GAME_NAME}}` in source files; `build.py` substitutes at build time. Runtime JS
exposes `window.GAME_NAME`. Currently set to `"NotAName"` pending final name decision.

---

### 4. Build Number Auto-Injection — `build.py`

**Before:** `<title>Rogue JS - Build 745</title>` hardcoded in `src/header.html`.

**After:** `{{BUILD_NUMBER}}` template in `src/header.html`, `src/ui_layout.html`,
and `src/state.js`. `build.py` replaces on each build. Also patches `asset_viewer.html`
and `boundary_editor.html` via regex.

---

### 5. NPC Dialog Movies — `src/shop.js` + new `roguelike_assets_movies.dat`

**Before:** NPC dialogs showed GIF sprite or emoji face.

**After:** `NPC_MOVIES` map in `shop.js` wires MP4 video files to NPC dialog modals.
A shared `<video>` element is reused across all dialogs. Source resolution order:
1. `window.assets.movies['movie_<type>']` — base64 data URL from `roguelike_assets_movies.dat`
2. `movies/<filename>.mp4` — relative path fallback (works alongside the HTML on disk)

**New bundle:** `roguelike_assets_movies.dat` (15 MB) — split from core bundle to keep
`JSON.parse` memory usage manageable.

NPCs with movies: Apu, Deckard Cain, Erasmus, Grok (Pacifist Orc), Cousin Dave.
Dennis (Monty Python peasant) awaiting movie asset.

---

### 6. Grass Height Map — `src/render.js`

**Before:** Each grass blade had a hardcoded `bh = 4 + ((mapX*3 + mapY*7 + b*13) % 6)`
height — fine-grained random salt-and-pepper with no spatial coherence.

**After:** `window._grassHeightMap` — 2D Float32Array generated once per map using
dual-frequency sine-wave noise (`low` at 8-tile wavelength + `mid` at 4-tile). Produces
smooth rolling patches of tall and short grass. Height range: `GRASS_MIN_H=3px` to
`GRASS_MAX_H=13px`. Avatar size scales by up to 12% in tallest grass. Map regenerates
on `initMap()` via `window.regenerateGrassHeightMap()`.

---

### 7. Combat Centralisation — `src/engine.js` + `src/player.js`

**Before:** `e.stats.hp -= dmg` inline in 3 places in `doCombat()`, with no crit system.

**After:**
- `applyDamageToEnemy(dmg, enemy)` in `engine.js` — rolls crit, logs it, deducts HP, returns final dmg
- `getPlayerCritRate()` in `player.js` — equipment-aware (TODO hook)
- All 3 `e.stats.hp -= dmg` in `doCombat` replaced with `dmg = applyDamageToEnemy(dmg, e)`
- Log message order fixed: crit announcement appears before hit message

---

### 8. ITEM_DEF Weapon `baseDmg` Rename (K12)

**Before:** `maxDamage` property on weapon entries.  
**After:** `baseDmg` everywhere. Values set per design spec:
Accordion=0, Bow=1, Excalibur=12, Proper Staff=5, Staff=4, Sword=8, Wizard's Wand=1.

`swapEquip()` in `mechanics.js` now uses `CONSTANTS.PLAYER_UNARMED_BASE_DMG` (=3)
and `CONSTANTS.PLAYER_INITIAL_DODGE_RATE` instead of magic numbers.

---

## New Asset Bundle

| Bundle | Size | Description |
|--------|------|-------------|
| `roguelike_assets.dat` | 41 MB | Core sprites, sounds, voice clips, music |
| `roguelike_assets_ambient.dat` | 5.3 MB | Ambient audio per scene |
| `roguelike_assets_arcade.dat` | 35 MB | Astrochicken WASM + Centipede |
| **`roguelike_assets_movies.dat`** | **15 MB** | **NPC dialog MP4 movies (new)** |

---

## Complete Bug / Enhancement List Since Build 748

### Bugs Fixed (B-series)
B1 B2 B3 B4 B5 B6 B8 B9 B11 B12 B13 B15 B16 B17 B18 B19 B21 B22 B27 B28 B29 B30
B31 B32 B35 B36 B37 B39 B41 B43 B44  
*(31 of the 44 original bugs resolved)*

### Enhancements (E-series)
E1 E2 E3 E4 E5 E6 E7 E8 E9 E10 E11 E12 E13 E14 E15 E16 E17 E18 E19 E20(partial)
E21 E22 E23  
*(22 of 23 enhancements implemented; E20 has 5 of 12 animals)*

### Kelch Developer Tasks (K-series)
K1 K2 K3 K4 K5 K6 K7 K8 K9 K10 K11 K12 K13 K14  
K-new-1 K-new-3 K-new-4 K-new-5  
*(18 total)*

---

## Still Open for Build 751+

### Bugs
- **B20** Weapon Master voice — ElevenLabs ID `6sFKzaJr574YWVu4UuJF` not yet generated
- **B33** Not in original list
- **B38** Area 11→12 door alignment — spatial coordinates need in-game testing

### Enhancements
- **E20** Remaining 7 animals: 🐃buffalo 🦨skunk 🦫beaver 🐢turtle 🐦‍⬛blackbird 🦉owl 🪰fly 🐞ladybug

### Asset Pipeline Needed
- B11: Dennis voice volume boost — `python3 build_complete_assets.py` after ffmpeg run
- B20: Weapon Master voice — `tools/generate_sound_assets.py --npc weapon_master`
- E5:  Blacksmith voice — verify lines generated for `LRpNiUBlcqgIsKUzcrlN`
- Dennis dialog movie — awaiting asset from team

### WebGL Demo
- `webgl_effects_demo.html` — 7 effects, all functional in Chrome
- Grass effect: Canvas 2D (WebGL1 version retired after persistent rendering issues)
- Ifrit: SDF humanoid fire + 8-direction walk/sit/fireball state machine

---

## Deployment Instructions

### Install (new machine)
```
Receive roguelike_deploy_750_part1.json through _part3.json
Run: python3 reassemble_deploy.py 750     # or use browser reassemble tool
Outputs: roguelike_build750.html + roguelike_assets*.dat + movies/
Open roguelike_build750.html in Chrome
Load roguelike_assets.dat when prompted
```

### Load order in browser
1. Open `roguelike_build750.html`
2. Load `roguelike_assets.dat` (core)
3. Optionally load `roguelike_assets_ambient.dat`
4. Optionally load `roguelike_assets_movies.dat` (for NPC videos)
5. Optionally load `roguelike_assets_arcade.dat` (for Astrochicken/Centipede)

### Run build from source
```bash
cd /home/projects/roguelike
python3 build_complete_assets.py   # rebuild .dat files (only needed if assets changed)
python3 build.py                   # always run — produces roguelike_build750.html
```
