# Bug/Enhancement List Status Report

## Build 760/761 Status — April 16, 2026

| Item | Status | Source files |
|---|---|---|
| E760.IFRIT_AGRO | ✅ Implemented (pickup in Ifrit chamber now provokes boss) | `src/mechanics.js` |
| E760.IFRIT_HIDDEN | ✅ Implemented (off-color hidden panel + long hall + remote chamber) | `src/map.js` |
| E760.TRISTRAM_WALLS | ✅ Implemented (gray brick wall style in Tristram) | `src/render.js` |
| E760.PEASANTS | ✅ Implemented (outside-grass peasant guarantee pass) | `src/map.js`, `src/engine.js` |
| B.760.FANFARE | ✅ Implemented (slot-load fanfare with direct audio fallback) | `src/ui_logic.js` |
| B.760.FLIES | ✅ Implemented (fly/mosquito render scale reduced) | `src/render.js` |
| B.760.FORGE | 🟨 Partial (blacksmith movie path normalized; needs in-game verify for both entry paths) | `src/shop.js` |
| B.760.MENDED_DRUM | ✅ Implemented (regular portraits added and wired) | `build_complete_assets.py`, `src/shop.js` |
| B.760.PIXIES_DROPS | ✅ Implemented (pixies now drop resurrection crystal) | `src/engine.js` |
| B.760.AUTO-STACK | ✅ Implemented (inventory/pouch/bag autostack for pickup/loot paths) | `src/mechanics.js`, `src/engine.js` |
| B760.MIMIC | ✅ Implemented (aggro on reveal/attack + ranged coin spit) | `src/engine.js` |
| B760.THIEF | ✅ Implemented (thief modal portrait wired) | `build_complete_assets.py`, `src/engine.js` |
| B760.WEAPONS_MASTER | ✅ Implemented (swordmaster portrait in insult modals) | `build_complete_assets.py`, `src/engine.js` |
| B760.ASTROCHICKEN | ✅ Implemented (WASM path substitution hardened) | `src/ui_logic.js` |
| B760.MYSTERY_LADY | ✅ Implemented (separate Mystery Lady voice keys + clips) | `src/shop.js`, `sounds/generated/voices/mystery_lady/*` |
| B760.MIDAS_TOUCH | ✅ Implemented (status chip shown while ring equipped) | `src/ui_logic.js` |
| B760.SCUMMBAR_PIRATE_MASTERS | ✅ Implemented (larger modal portraits) | `src/shop.js` |
| B760.ANTIQUE_SHOPPE_TALKING_HEAD | ✅ Implemented (Fence talking-head movie in antique dialog) | `src/shop.js` |
| B760.ASPCA | ✅ Implemented (town animals/vermin no longer protected) | `src/mechanics.js` |
| B.759.PIXIES | ✅ Implemented (pixie keep-out distance from Tristram walls) | `src/map.js`, `src/engine.js` |
| B760.BOOK_SHOP | 🟨 Partial (voice wiring expanded; Erasmus movie now used in grue/wand dialogs; needs UX verify) | `src/shop.js` |
| B760.RAT_BOOT | ✅ Implemented (rat thank-you text + new voice line) | `src/mechanics.js`, `sounds/generated/voices/rat/*` |
| B759.EAGLES_CRAG | ✅ Implemented (door transition now keyed by tile or saved door coords) | `src/engine.js` |
| B759.THE_FENCE | ✅ Implemented (anti-blocking reposition + patrol exclusions) | `src/engine.js`, `src/map.js` |
| B760.IFRIT | 🟨 Partial (patrol/substantiality improved; emoji overlay removed) | `src/map.js`, `src/render.js`, `src/engine.js` |
| B760.THIEF (hideout separation) | ✅ Implemented (separate hideout selection; not on floor-3 Eagle Crag room) | `src/map.js` |
| B760.SCUMMBAR (voice mismatch) | 🟨 Partial (dedicated matching clips + branch wiring; needs final transcript verify) | `src/shop.js`, `sounds/generated/voices/scummbar/*` |
| B760.ANTIQUE_SHOPPE (voice mismatch) | ✅ Implemented (re-recorded matching branch clips + corrected mapping) | `src/shop.js`, `sounds/generated/voices/antique/*` |
| B759.SUPERCENTER | ✅ Implemented (music leaves supercenter on area exit) | `src/engine.js`, `src/audio.js` |
| B760.INSULT_BATTLE | ✅ Implemented (player opener choices + portraits + player-side voice set) | `src/engine.js`, `build_complete_assets.py`, `sounds/generated/voices/player_insults/*` |
| B759.TOWN_PORTAL | 🟨 Partial (town portal tile now forced at destination; return logic updated; needs field verify) | `src/engine.js`, `src/map.js`, `src/mechanics.js` |
| B759.HP_AND_MANGA_GLOBES | ⏳ Open (still intermittently CSS fallback per user testing) | `src/ui_logic.js`, `src/input.js`, `src/webgl_fx.js` |

---

## Build 756/757 Status — April 14, 2026

### 756 Bug List

| Item | Status | Source files |
|---|---|---|
| B.756.SCREEN_SIZE | ✅ Implemented (viewport sizing hardened for Edge/Chrome) | `src/header.html`, `src/state.js`, `src/render.js`, `src/input.js` |
| B.756.LOADING_SCREEN | ✅ Implemented (start screen content moved up) | `src/header.html`, `src/ui_layout.html` |
| B.756.ASSET_SLOTS | ✅ Implemented (`Ambient<br>Movies`) | `src/ui_layout.html` |
| B.756.LOADING_MOVIES | ✅ Implemented (asset loader summaries include movies + updated bundle naming) | `src/ui_logic.js`, `src/ui_layout.html` |
| B.756.MACRO_MODALS | ✅ Implemented (draggable titlebars + close + ESC) | `src/ui_logic.js`, `src/input.js` |
| B756.AVATAR_OPACITY | ✅ Implemented (removed full-light blur haze + explicit alpha/filter reset before ambiance/avatar) | `src/render.js` |
| B756.VISUAL_TILE_SMOOTHING | ✅ Implemented (edge-gradient + rounded-corner blending pass replaces staircase transitions) | `src/render.js` |
| B756.STARTING_POSITION | ✅ Implemented (Tristram center near Cain) | `src/map.js`, `src/engine.js` |
| B756.TRISTRAM_TREES | 🟨 Partial (clump/copse generation improved) | `src/map.js` |
| B756.TRISTRAM_DIRTPATHS | ✅ Implemented (paths now use walkable floor tiles) | `src/map.js` |
| B756.WEBGL | 🟨 Partial (grass animation limited to visible tiles) | `src/render.js` |
| B756.WRONG_MUSIC | ✅ Implemented (`fields -> tristram`) | `src/audio.js` |
| B756.SCROLL_MANA | ✅ Implemented (error buzz + no scroll consume on insufficient mana) | `src/mechanics.js`, `src/audio.js` |
| B756.BEACH_PORTAL | ✅ Implemented (routes to beach map generation, walkable spawn) | `src/mechanics.js`, `src/map.js` |

### 756 Enhancements

| Item | Status | Source files |
|---|---|---|
| E756.CHORDS | ✅ Implemented (`^X M/S/N/Y/Q/C`, plus save on `^X Shift+S`, load on `^X L`) | `src/input.js`, `src/ui_layout.html` |
| E756.STACKABLE_SCROLLS | ✅ Implemented (scroll stacks up to 99, including beach/convention scrolls) | `src/state.js` |
| E756.STACKABLE_POTIONS | ✅ Implemented (already in source; verified) | `src/state.js` |
| E756.DECKARD_CAIN | ✅ Implemented (`Identify one item type for 1g` + kept bulk identify) | `src/shop.js` |

---

## Build 753 Status — April 13, 2026

### Completed ✅ (93+ items total)

**Bugs (34 of 47):**
B1 B2 B3 B4 B5 B6 B8 B9 B11 B12 B13 B15 B16 B17 B18 B19 B21 B22 B27 B28 B29 B30 B31 B32 B35 B36 B37 B39 B41 B43 B44 B45 B46 B47 B48

**Enhancements (22 of 23):**
E1 E2 E3 E4 E5 E6 E7 E8 E9 E10 E11 E12 E13 E14 E15 E16 E17 E18 E19 E20(partial) E21 E22 E23

**Kelch Developer Tasks (18 of 18):**
K1 K2 K3 K4 K5 K6 K7 K8 K9 K10 K11 K12 K13 K14 K-new-1 K-new-3 K-new-4 K-new-5

**Other:**
- webgl_effects_demo.html — 7 effects, 4 WebGL contexts, all working
- deploy.sh / deploy.ps1 / extract.ps1 / reassemble_deploy.py — base64 JSON multipart pipeline
- CHANGELOG.md updated through Build 750
- ARCHITECTURE.md updated for Build 750

---

### Still Open ⏳

| Item | Description | Effort | Notes |
|------|-------------|--------|-------|
| **B33** | Not in original list | — | ✅ Closed |
| **B38** | Area 11→12 door alignment | Medium | Coded, needs in-game spatial verification |
| **B48** | NPC dialog videos not playing (general MP4 playback issue) | Medium | ✅ Fixed in Build 753: Class videos added to asset bundle, manual loading required (CORS prevents auto-load) |
| **E20** (7 animals) | 🐃buffalo 🦨skunk 🦫beaver 🐢turtle 🐦‍⬛blackbird 🦉owl 🪰fly 🐞ladybug | Low-Medium | Same pattern as the 5 already done (hedgehog, bunny, turkey, goose, mosquito) |

### Asset Pipeline Pending

These are code-complete but need `python3 build_complete_assets.py` re-run after the underlying assets are generated:

| Item | What's needed |
|------|--------------|
| **B11** | Dennis voice volume +200% — ffmpeg run on existing files, then rebuild |
| **B20** | Weapon Master voice — ElevenLabs generation with ID `6sFKzaJr574YWVu4UuJF` |
| **E5** | Blacksmith (Griswold) voice — ElevenLabs ID `Q4oILuo4P8VeXtE6FMLI`, 5 dialog lines to record |
| **Dennis movie** | Awaiting video asset from team |

---

## Build 745 Bug/Enhancement List (Historical)

### IMPLEMENTED (Build 747) — ✅ COMPLETE

| # | Item | Status | Files |
|---|------|--------|-------|
| 1 | Fog of war feathering in lit areas | ✅ Complete | `src/render.js` |
| 2 | Kneeling emoji bug + standing/walking idle fix | ✅ Complete | `src/ui_logic.js`, `src/render.js` |
| 4 | Fix /launch astrochicken (dual definition bug) | ✅ Complete | `src/shop.js`, `src/ui_logic.js` |
| 5 | /assets console command | ✅ Complete | `src/input.js` |
| 6 | WoW-style macro system (console + save) | ✅ Complete | `src/input.js`, `src/mechanics.js`, `src/ui_logic.js` |
| 8 | Debug edit stats - add missing stats | ✅ Complete | `src/ui_logic.js` |
| 9 | Configurable keybindings (movement+action, ^x chords) | ✅ Complete | `src/input.js`, `src/ui_logic.js`, `src/ui_layout.html` |
| 10 | Globe slosh direction | ✅ Complete | `src/webgl_fx.js` |
| 11 | Remove CSS gold minimap border | ✅ Complete | `src/header.html` |
| 12 | Minimap zoom +/- buttons | ✅ Complete | `src/ui_layout.html`, `src/render.js` |
| 14 | Wind SFX in Eagle's Crag + cloud sync | ✅ Complete | `src/render.js` |
| 15/23/24 | Redirect asset/debug logs, remove console.log spam | ✅ Complete | `src/ui_logic.js` |
| 16 | NPC ranged/magic protection | ✅ Complete | `src/mechanics.js` |
| 17 | Hide CSS orb-fill when WebGL active | ✅ Complete | `src/render.js` |
| 19 | Enlarge globes 25% (60px → 75px) | ✅ Complete | `src/header.html`, `src/ui_layout.html` |
| 20 | HP globe blood red + color variation | ✅ Complete | `src/header.html`, `src/webgl_fx.js` |
| 21 | Save file pretty-print JSON | ✅ Complete | `src/ui_logic.js` |
| 22 | Save file MD5+ROT13 obfuscation | ✅ Complete | `src/ui_logic.js` |
| 24 | Area name on minimap bottom edge | ✅ Complete | `src/render.js` |
| 25 | Monty Python NPCs dialog + comment block | ✅ Complete | `src/quests_monty_python.js`, `src/shop.js` |
| 28 | Icebolt spell + WebGL effect, fireball WebGL, spell audit | ✅ Complete | `src/mechanics.js`, `src/webgl_fx.js` |
| 29 | Window focus brings modal to front | ✅ Complete | `src/ui_logic.js`, `src/header.html` |
| 31 | Pouch-to-equip drag | ✅ Complete | `src/ui_logic.js` |
| 34 | Unequip weapon to empty hand | ✅ Complete | `src/mechanics.js` |
| 35 | Double-click/right-click to use pouch items | ✅ Complete | `src/ui_logic.js` |
| 36 | Supercenter only in town (not floor 6) | ✅ Complete | `src/shop.js` |
| 38 | Blue +MP floating text on mana gain | ✅ Complete | `src/mechanics.js`, `src/ui_logic.js` |
| 39 | Scrolls single-use + magic residue | ✅ Complete | `src/mechanics.js` |
| 40 | Wire NPC/animal/monster sounds | ✅ Complete | `src/shop.js`, `src/mechanics.js` |

**Total Implemented: 29 items** ✅

---

### DEFERRED — Needs engine.js (Kelch's domain)

| # | Item | Needs | Status |
|---|------|-------|--------|
| 3 | MUD movement in debug console (north/south/east/west/attack/cast) | `movePlayer()`, `meleeAttack()` | ✅ Done in Build 749 |
| 7 | Insult battle mechanics (no-HP battle mode, pride system, pirate fleeing) | Combat loop | ✅ Done in Build 749 |
| 13 | Pickpocket modal (voice clips recorded) | Pickpocket event trigger | ⏳ Pending |
| 18 | Exhaustion sapping HP/MP (UI works, drain logic missing) | `advanceTurn` exhaustion handler | ⏳ Pending |
| 26 | Cat/rat spawn (log messages fire but entities don't appear) | Spawn logic | ✅ Done in Build 749 (B16) |
| 27 | Courtyard + fighting master NPC | New room type in map.js, NPC behavior | ✅ Done in Build 749 (E8, B21) |
| 30 | Eagle's Crag door (one-way + permanent unlock) | Door state handling | ✅ Done in Build 749 (B29) |
| 32 | Fence patrol movement near bar entrance | NPC patrol AI | ✅ Done in Build 749 (B35) |
| 33 | Fence click/collision opens store | NPC interaction on collision/click | ⏳ Pending |
| 37 | Mana regen during sleep | `restPlayer()` handler | ⏳ Pending |

**Remaining Deferred: 3 items** ⏳ (10 → 3 resolved in Builds 749–750)

---

## Sprite Integration Status

### ✅ Completed

1. **Sprite Selector Tool v6** (`asset_selector_v6_package.zip`)
   - 154 assets with LPC, Andor's Trail, and DCSS suggestions
   - All emoji icons displayed (duck 🦆, shark 🦈, etc.)
   - Dark theme UI with clear categories

2. **Asset Integration**
   - `selections.json` created with user's sprite choices
   - `roguelike_assets.dat` regenerated with selected sprites
   - Game modified to auto-load assets

3. **Applied Sprites**
   - Emoji: bat 🦇, snake 🐍, duck 🦆, chipmunk 🐿️, wet_rat 🐀, genie 🧞, king 🤴, bridge_keeper 🧙‍♂️
   - Andor's Trail: skeleton, ghost, assassin
   - DCSS: slime, floor, water, tree, rock, shark

4. **NPC Movies (Build 749+)**
   - Apu (917 KB), Deckard Cane (3.8 MB), Erasmus (1.7 MB), Pacifist Orc (4.0 MB), Cousin Dave (835 KB)
   - Stored in combined `roguelike_assets_ambient_movies.dat` bundle (ambient + movies)
   - Dennis movie pending

---

## Build 753 Updates

**Fixed:**
- **B45**: Music/sound effects not playing
- **B46**: HP display shows NaN/16 after mosquito ambush
- **B47/E14**: Class selection modal assets missing
- **B48**: NPC dialog videos not playing
- **K.750.1**: Keybind hints positioned above buttons
- **K.750.2**: Bunnies/mosquitos showing UNDEFINED
- **K.750.4**: WIS stat removed, spellcaster maxMp = 2
- **K.750.5**: HP regen while walking disabled (HUNGER_HEAL=0.0)
- **K.750.6**: Mosquito NaN attack damage
- **K.750.9**: All WIS references replaced with INT
- **K.750.10**: Town portal shows dirt when closed
- Passive animals fight back or flee when attacked

**Changes:**
- Title image replaces ASCII art (Pixelify Sans, build-time render)
- Class video portraits overlaid on backdrop (Fighter left, Rogue center, Spellcaster right)
- FM synth tracks removed, music plays from asset bundles only
- Blacksmith voice clips generated (5 lines, ID Q4oILuo4P8VeXtE6FMLI)
- Muck peasant voice clips (5 lines, ID EaX6rnyDKjJx35tchi80)
- Retired soldier voice clips (5 lines, ID KgUSWQPFmuiZ5ycRbnty)
- Supercenter moved to beach village (was Tristram)
- Portal spin at 30 RPM
- Dennis's Wife (🤰) + sheep follower in town
- Muck peasants patrol fields near gate
- Retired soldier stands north of town
- Avatar scaled up 50%

## Open Bugs

| # | Description | Priority | Status |
|---|-------------|----------|--------|
| B.GRASS | ✅ **CLOSED** — Grass animation fixed. Render loop condition corrected (`flex`/`block` check). Dense scattered blades across full tile. | High | ✅ Done |
| B.CHIPS | ✅ **CLOSED** — Debug stats chips visible and expanded: ❤️ HP/MP, 💰 Gold, 🎯 nearest enemy HP%, ⚗️ status effects, 🏃 speed, ⏱ quest timer, ⭐ god mode | Medium | ✅ Done |
| B.UNDEF | ✅ **CLOSED** — Render uses `e.icon \|\| e.stats.icon \|\| '?'` | Medium | ✅ Done |
| B.FANFARE | ✅ **CLOSED** — Fanfare plays on first asset load (slot 1), removed from class modal | Low | ✅ Done |
| B.SMOOTH | ✅ **CLOSED** — Replaced blurry gradients with crisp solid-color bezier corner patches | Medium | ✅ Done |
| B.SPRITE | ✅ **CLOSED** — Enemy sprites flip horizontally when `_lastDx > 0` | Medium | ✅ Done |

## Open Enhancements

| # | Description | Effort | Status |
|---|-------------|--------|--------|
| E.TRIST.3 | ✅ Procedural 120×90 overworld: forests, streams, crop fields, path, boundaries, ambiance | Large | ✅ Done |
| E.753.FARM | ✅ Dennis's flock expanded + store: meat/scarf/bread | Medium | ✅ Done |
| E.753.CUPCAKE | ✅ Grok's dark room: 2 🧁 floor items, voiced reactions on pickup (inventory + pouch pickup paths) | Small | ✅ Done |
| E.753.LIZARD | ✅ Lizard 🦎 vermin (1/4 size), flees, drops fly loot; now spawns in early dungeons + outdoors | Small | ✅ Done |
| E.753.ZOMBIE | ✅ Zombie 🧟‍♂️ on Floors 1-3 with aggro-on-proximity and shambling patrol when idle | Small | ✅ Done |
| E.753.PIXIE | ✅ Pixie 🧚🏻 in forests: buzz SFX, periodic voice taunts (z12gfZvqqjJ9oHFbB5i6), 💎 resurrection crystal (1%), 🎇 magic dust, 🔔 bell | Large | ✅ Done |
| E.753.WIFE | ✅ Dennis's Wife (🤰) patrol + sheep follower | Small | ✅ Done |
| E.753.TRASH | ✅ 🪀🧸🧩 as 5% dungeon floor scatter | Small | ✅ Done |
| E.753.POISON | ✅ Apu's: 🦪 Oyster (food poisoning), 🥜 Peanuts (allergic reaction) | Small | ✅ Done |
| E.753.MILK | ✅ 🥛 Milk → Diarrhea: -5 HP, slow, timed fart SFX (~10 min), whoopie sample support | Medium | ✅ Done |
| E.753.ILLUM | ✅ WebGL aura burst on Illuminate cast | Small | ✅ Done |
| E.753.MOVE | ✅ Debug console: ne/sw/nw/se directions, "n8" compound moves, kneel/sleep/run | Medium | ✅ Done |
| E.753.RESTART | ✅ /restart command with confirm dialog | Small | ✅ Done |
| E.753.USE | ✅ /use [item] from /inventory | Small | ✅ Done |
| E.753.LOADER | ✅ Redesign start screen: sparkling starfield loader animation + stacked START/LOAD buttons | Medium | ✅ Done |
| E.753.COMBINE | ✅ Combined Ambient + Movies into one bundle (`roguelike_assets_ambient_movies.dat`) → 3 loader slots | Medium | ✅ Done |
| E.753.FLIP | ✅ Enemy sprites flip horizontally when moving right | Small | ✅ Done |
| E.753.SIZE | ✅ Buildings at 4× tile size | Medium | ✅ Done |
| E.753.PORTALS | ✅ Town/Beach portal debug menu buttons | Small | ✅ Done |
| E.MENDED_DRUM | ✅ The Mended Drum: Nobby/Cohen/Librarian/Vimes/Dorimunde, voiced (24 clips), bar menu, Easter eggs | Large | ✅ Done |

## Summary

- **Total tracked items**: 65+
- **All bugs fixed**: B.GRASS ✅ B.CHIPS ✅ B.UNDEF ✅ B.FANFARE ✅ B.SMOOTH ✅ B.SPRITE ✅
- **Open enhancements**: None
- **Voice clips generated**: 24 Mended Drum + 10 muck/soldier + 5 blacksmith = 39 total
- **Deployment**: Base64 JSON multipart pipeline, `bash deploy.sh 754`
