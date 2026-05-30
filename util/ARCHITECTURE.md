# Rogue JS — Developer Architecture Guide

**Build 750** | Single-file HTML roguelike | No frameworks, no bundler, no dependencies

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Build System](#2-build-system)
3. [Source File Structure & Load Order](#3-source-file-structure--load-order)
4. [Global Scope & Coding Conventions](#4-global-scope--coding-conventions)
5. [Key Data Structures](#5-key-data-structures)
6. [Module Reference](#6-module-reference)
7. [The Quest Engine API](#7-the-quest-engine-api)
8. [Writing a New Quest Pack](#8-writing-a-new-quest-pack)
9. [Core Game Loops](#9-core-game-loops)
10. [Rendering Pipeline](#10-rendering-pipeline)
11. [Map Generation](#11-map-generation)
12. [Shop & NPC System](#12-shop--npc-system)
13. [Audio System](#13-audio-system)
14. [Asset Bundle](#14-asset-bundle)
15. [Save / Load System](#15-save--load-system)
16. [UI Conventions](#16-ui-conventions)
17. [Known Patterns & Gotchas](#17-known-patterns--gotchas)

---

## 1. Project Overview

Rogue JS is a browser-based, single-file roguelike that runs entirely in one HTML file (~590KB). It has no runtime dependencies, no npm, no module bundler, and no framework. The entire game is a concatenated collection of JS source files wrapped in a `<script>` tag inside a single `.html` file.

**Technology stack:**
- Vanilla JavaScript (ES2020, no modules)
- HTML5 Canvas (2D context)
- Web Audio API (FM synthesis + sample playback)
- CSS custom properties for theming

**Distribution model:** Players open one `.html` file. Optionally load a companion `roguelike_assets.dat` JSON file (sprites, sounds, GIFs) via the start screen file picker. The game is fully playable without assets — it falls back to emoji everywhere.

---

## 2. Build System

**`build.py`** is the entire build system. It concatenates source files in a hardcoded order into one HTML file.

```bash
cd /home/projects/roguelike
python3 build.py
# Outputs: roguelike_build743.html
```

The script:
1. Opens `src/header.html` (writes `<head>` + CSS)
2. Opens `src/ui_layout.html` (writes HTML structure + opens `<script>`)
3. Appends each JS source file with a `// SOURCE: filename` comment header
4. Closes `</script></body></html>`
5. Replaces all `{{BUILD_NUMBER}}` and `{{GAME_NAME}}` template placeholders
6. Patches `asset_viewer.html` and `boundary_editor.html` with the current build number

**No minification, no transpilation, no tree-shaking.** What you write is what runs.

To add a new source file, edit `build.py`:
```python
source_files = [
    'src/header.html',
    'src/ui_layout.html',
    'src/audio.js',
    # ... existing files ...
    'src/webgl_fx.js',       # optional FX layer, must load before render.js
    'src/my_new_module.js',   # ← add here, order matters
    'src/input.js',           # input.js must remain last
]
```

Build 743 adds `src/webgl_fx.js` immediately before `src/render.js`. That placement is intentional:
the effect layer exposes `window.WebGLFX`, and the renderer treats it as an optional service.

---

## 3. Source File Structure & Load Order

The load order is a hard dependency chain. Every file relies on globals defined by files loaded before it.

```
src/
├── header.html          CSS + <head> — defines CSS variables and all styles
├── ui_layout.html       HTML structure — all DOM elements must exist before JS runs
├── audio.js             Sound system (Sound object) — no dependencies
├── music_data.js        FM track arrays consumed by audio.js
├── state.js             ALL globals: CONSTANTS, TILES, assets, MONSTER_DEF, ITEM_DEF, etc.
├── player.js            Player module: inventory, pouch, player, setPlayerDefaults,
│                        changeGold, PlayerSprites, combat helpers (K5 refactor, Build 749)
├── ui_logic.js          DOM updates, save/load, drag-drop, asset loading — needs state.js
├── quests_base.js       ┐
├── quests_monkey_island.js │  Quest pack files — push into window._questPacks[]
├── quests_monty_python.js  │  Must load BEFORE quest_engine.js
├── quests_black_cauldron.js│
├── quests_indiana_jones.js │
├── quests_kq5.js           │
├── quests_zork.js          │
├── quests_elder_scrolls.js │
├── quests_space_quest.js   │
├── quests_larry.js         │
├── quests_qfg.js           ┘
├── quest_engine.js      Collects _questPacks[], wires triggers — needs all packs loaded
├── map.js               Procedural map generation — needs state, TILES
├── mechanics.js         Item use, spells, bags — needs state, engine helpers
├── engine.js            advanceTurn, combat, movePlayer — needs everything above
├── shop.js              NPC shop UIs + movie system — needs engine helpers and state
├── webgl_fx.js          Optional WebGL-backed FX manager — exposes window.WebGLFX
├── render.js            Canvas drawing — reads state, asks WebGLFX for optional overlays
└── input.js             Keyboard/mouse/game-start — MUST be last (triggers everything)
```

**28 source files** in the build chain (Build 750).

**Rule of thumb:** If module B calls a function defined in module A, A must come first. `input.js` is always last because the start-button click handler kicks off the entire game.

`WebGLFX` is deliberately fail-soft. If WebGL context creation fails, its public calls no-op and the
existing 2D renderer continues to handle gameplay visuals.

The repository root also includes `dragon.html`, a self-contained offline canvas demo used for loading-
screen evaluation. It is an approximation only, not `dragon-rs`.

---

## 4. Global Scope & Coding Conventions

### Everything is global

All variables, functions, and constants live on the `window` object or as module-scope `let`/`const` within the IIFE-like structure. There are **no ES modules**, **no `import`/`export`**, and **no closures for privacy** except within a single file.

**Accessing from another file:** Reference the name directly. If defined in `state.js`, use it in `engine.js` as `player.hp`, not `window.player.hp` (both work, but the bare name is conventional).

**Exposing from a file:** Use `window.myFunction = function() {...}` to make a function callable from HTML `onclick=""` attributes or from other modules.

```js
// state.js — defines a global
let currentLevel = 1;

// engine.js — uses it directly
currentLevel++;

// ui_layout.html — calls via onclick
<button onclick="debugWarpNextFloor()">Warp</button>

// ui_logic.js — exposed as window.*
window.debugWarpNextFloor = () => { currentLevel++; initMap(50); ... };
```

### Naming conventions

| Pattern | Example | Where |
|---------|---------|-------|
| `SCREAMING_SNAKE` | `TILE_SIZE`, `MONSTER_DEF` | Constants and definition objects |
| `camelCase` | `currentLevel`, `mapW`, `isDead` | Mutable globals and functions |
| `window.camelCase` | `window.castSpell` | Public API (callable from HTML/other modules) |
| `_underscorePrefix` | `_saveLevelToCache`, `_questPacks` | Internal/private by convention (not enforced) |
| `player.flagName` | `player.fedEagle`, `player.caughtByRat` | Quest state flags on the player object |

### No `const` at module scope in engine.js

The game wraps source files without an IIFE, so `const` at the top level of `engine.js` can cause `Unexpected token` errors in some contexts. Use `let` for module-scope variables in `engine.js`. `const` is fine inside functions.

### HTML string templates everywhere

UI is built by setting `.innerHTML` with template literals. This is intentional — no virtual DOM, no React, just string concatenation.

```js
m.innerHTML = `<h2>Store</h2><button onclick="buy('🗡️', 100, 'apu')">Buy Sword</button>`;
```

`onclick` handlers in injected HTML call `window.*` functions by name. They work because everything is global.

---

## 5. Key Data Structures

### `player` Object

The player is a single mutable object on the global scope. All modules read and write it directly.

```js
{
  // Position & facing
  x: Number, y: Number,
  facing: { dx: Number, dy: Number },

  // Resources
  hp: Number, maxHp: Number,
  mp: Number, maxMp: Number,
  gp: Number, xp: Number,

  // Progression
  level: Number, statPoints: Number, talentPoints: Number,
  stats: { str, dex, int, con, wis },   // each starts at 10
  talents: {},                           // { talentId: rankNumber }

  // Status
  hunger: Number,          // 0–100
  exhaustion: Number,
  statusType: String,      // 'sugar'|'freeze'|'dizzy'|'disease'|null
  statusTurns: Number,
  isRunning: Boolean,
  isKneeling: Boolean,
  isSleeping: Boolean,
  blind: Boolean,
  atronach: Boolean,       // Morrowind birthstone: no regen, huge MP

  // Healing
  totalHealPending: Number, // food heal-over-time queue

  // Combat stats (derived, recalculated on equip)
  baseDmg: Number,
  hitRate: Number,
  critRate: Number,
  dodgeRate: Number,

  // Equipment
  equipped: {
    head: String|null,      // icon emoji or null
    chest: String|null,
    legs: String|null,
    feet: String|null,
    leftHand: String|null,
    rightHand: String|null,
  },

  // Class selection (E14, Build 749)
  startingClass: 'fighter'|'rogue'|'spellcaster'|null,
  trainingBonus: Number,    // +1 to next attack (Weapon Master training)
  knightLimb: Number,       // 0–3 (Black Knight limb state)

  // Class selection (E14, Build 749)
  startingClass: 'fighter'|'rogue'|'spellcaster'|null,
  trainingBonus: Number,    // +1 to next attack (Weapon Master training)
  knightLimb: Number,       // 0–3 (Black Knight limb state)

  // Spells
  spells: { spellName: { level: Number } },
  equippedSpell: String|null,
  secondarySpell: String|null,

  // Quest flags (partial list)
  savedRat: Boolean,
  hasBottle: Boolean,
  fedEagle: Boolean,
  killedPassive: Boolean,
  assassinMet: Boolean,
  caughtByRat: Boolean,
  inCell: Boolean,
  bridgeQuestions: Boolean,
  grenadeCount: Number,
  knightLimb: Number,        // 0–3 (Black Knight limb state)
  grueDanger: Number,        // Grue danger accumulator
  storesVisited: Number,

  // Insult sword-fighting
  learnedInsults: Number[],  // indices into INSULT_BATTLES.pirate
  learnedRetorts: Number[],
}
```

### `TILES` Constants

Numeric tile IDs used in the `theMap[y][x]` 2D array. Always use the constant, never the raw number.

```js
WALL:1, FLOOR:2, STAIR_DOWN:3, STAIR_UP:4, CHEST:5, STORE:6, WATER:7,
LEFTYS:8, BOOKSTORE:9, TREE:10, ROCK:12, SAND:13, DEEP_WATER:14, GRASS:15,
MOAT:16, CASTLE_DOOR:29, PORTAL:30, BLADE:31, LETTER:32, FORGE:33,
CHASM:36, BRIDGE_TILE:37, SECRET_WALL:38, HALL:39, MACHINE:40
```

### `MONSTER_DEF` Entry Shape

```js
"skeleton": {
  icon: '💀',
  hp: 20,
  dmg: 8,
  hit: 0.5,        // hit chance 0–1
  crit: 0.1,       // crit chance 0–1
  dodge: 0.2,
  speed: 0.4,      // action accumulation per turn (1.0 = attacks every turn)
  throughWalls: false,
  // Optional:
  effect: 'freeze', effectChance: 0.1,
  quest: true,     // non-attackable NPC; handled by engine specially
  passive: true,   // flees player
  isBoss: true,
  isBig: true,     // renders at 2× tile size
}
```

### `ITEM_DEF` Entry Shape

```js
"🧪": {
  name: "Health Potion",
  type: "potion",         // 'potion'|'food'|'weapon'|'armor'|'scroll'|'spell'|
                          // 'light'|'key'|'bag'|'misc'|'quest'|'useless'|'wealth'
  stackable: true,
  maxGP: 40,              // sell value (0 = unsellable)
  maxHeal: 25,            // HP restored on use
}
```

Type-specific fields:
- **food/potion**: `maxHeal`, `foodValue` (hunger reduction)
- **weapon**: `baseDmg` (base damage, replaces old `maxDamage`), `meleeDmgBonus`, `hitRateBonus`
- **armor**: `evadePercent`, `slot`, `wisBonus`
- **scroll/spell**: `spell` (spell name string)
- **light**: `lightRange` (turns of light)
- **bag**: `bagSlots`, `minLevel`
- **explosive**: `fuseTime`, `blastRadius`, `baseDamage`, `damagePerTile` (E16 Bomb)
- **explosive**: `fuseTime`, `blastRadius`, `baseDamage`, `damagePerTile` (E16 Bomb)

### `enemies[]` Entry Shape

```js
{
  x: Number, y: Number,
  type: String,           // key into MONSTER_DEF
  stats: { ...MONSTER_DEF[type] },  // mutable per-instance copy
  actionTimer: Number,    // accumulates; triggers attack when >= 1
  // Quest-specific:
  isQuestNPC: Boolean,
  provoked: Boolean,
  currentInsult: String,
}
```

### `corpses[]` Entry Shape (post-kill loot system)

```js
{
  x: Number, y: Number,
  name: String,
  icon: String,           // emoji from enemy stats
  loot: [{ icon: String, qty: Number }],
  createdAt: Number,      // Date.now() — expires after 5 min
  isBones: Boolean,       // true after expiry; loot has dropped to floor
  _flashRed: Number,      // timestamp of red-flash animation (inventory full)
}
```

### Inventory / Pouch Item Slot

```js
null                      // empty slot
{ icon: String, qty: Number }   // occupied slot

// Bags also have:
{ icon: String, qty: 1, contents: Array(bagSlots).fill(null) }
```

---

## 6. Module Reference

### `state.js` — Globals & Definitions
Defines all constants, tile IDs, monster/item definitions, and initial game state variables. Loaded first after the HTML. If you need to add a new monster, item, talent, or achievement definition, this is where they go.

### `player.js` — Player Module

Introduced in Build 749 (K5 refactor).

**Contains:**
- `inventory` and `pouch` arrays
- `player` object (single source of truth for all player state)
- `setPlayerDefaults()` — resets player to initial state (called at init and on new game)
- `window.changeGold(amount)` — safely adjusts gold with bounds checking
- `PlayerSprites` — sprite animation state machine
- `getPlayerPrimaryHand()`, `getPlayerHitRate()`, `getPlayerHits(enemy)`,
  `getPlayerDmg()`, `getPlayerDmgVersus(enemy)` — combat helpers

**Design rule:** All new player logic and state MUST go in this file.
No other module should declare player properties directly.

**Add a monster:**
```js
// In MONSTER_DEF:
"my_monster": { icon: '👾', hp: 30, dmg: 8, hit: 0.5, crit: 0.1, dodge: 0.2, speed: 0.4, throughWalls: false }
```

**Add an item:**
```js
// In ITEM_DEF:
"🗺️": { name: "Treasure Map", type: "quest", stackable: false, maxGP: 0 }
```

### `engine.js` — Core Game Tick
Central hub. `advanceTurn(steps)` is the main tick function — called after every player action. It handles hunger, exhaustion, grue danger, monster AI, status effect decay, and random spawns. `movePlayer(dx, dy)` handles tile interactions, NPC collisions, and combat initiation. `doCombat(enemyIndex)` resolves player-attacks-enemy; `monsterAttack(enemyIndex)` resolves enemy-attacks-player.

### `mechanics.js` — Item & Spell Logic
`handleItemClick(idx)` is the central item-use dispatcher — it routes based on `ITEM_DEF[icon].type`. Spell logic lives in `castSpell(spellName)`. Bag contents management lives here too (`openBag`, `takeItemFromBag`).

### `render.js` — Drawing
Pure read-only view of game state. Never mutates globals. Called after every `advanceTurn()`. `calculateFOV()` updates `visible[][]` and `explored[][]`. `drawMap()` is the master render function.

### `input.js` — Entry Point
The start button handler in `input.js` bootstraps the entire game: initializes Sound, QuestEngine, PlayerSprites, then calls `initMap()`, `calculateFOV()`, `drawMap()`, `updateUI()`. All keyboard and mouse handlers are registered here.

### `map.js` — Procedural Generation
`initMap(baseSize)` is called to generate a new floor or scene. It determines `currentScene` from `currentLevel`, generates tiles, places shops/stairs/special features, spawns monsters and items. Dark chambers (Grue zones) are assigned here.

### `shop.js` — NPC Interactions
`openShop(type)` is the public entry point; it calls `openStore(type)`. Shop HTML is injected into `#modal-content`. All NPC dialogue trees live here. The `npcFaceHTML(gifKey, fallbackEmoji)` helper returns either an animated GIF `<img>` or an emoji fallback.

### `ui_logic.js` — UI Layer
`logMsg(html)` is the logging function — takes HTML, appends timestamped entry to `#log`. `updateUI()` syncs all HUD elements (orbs, XP bar, chips). `saveGame()` / `loadGame()` serialize/restore all game state.

### `audio.js` — Sound
The `Sound` object is the entire audio API. Call `Sound.init()` once (done in `input.js`). Use `Sound.playTone(freq, type, duration, vol)` for one-off sounds. Use `Sound.playMusic(name)` for background tracks.

### `quest_engine.js` — Quest Logic
See full section below. The only entry point from game code is `QuestEngine.emit(event, data)`.

---

## 7. The Quest Engine API

### Core Concept

The quest engine is an **event bus** with data-driven triggers. Game code fires events; the engine checks if any quest stages are waiting for those events; if requirements are met, the stage advances and rewards are applied.

```
Game event fired → QuestEngine.emit('kill', { type: 'dragon' })
                         ↓
          Engine checks all registered triggers
                         ↓
          Finds stage with trigger: { event: 'kill', filter: { type: 'dragon' } }
                         ↓
          Evaluates requirements (player level, inventory, flags, etc.)
                         ↓
          QuestEngine.advance(questId, stageNum)
                         ↓
          Applies rewards (XP, items, achievements, callbacks)
                         ↓
          Logs to quest journal, emits 'quest_stage' event
```

### Emitting Events from Game Code

```js
// After killing an enemy
QuestEngine.emit('kill', { type: e.type });

// After taking damage
QuestEngine.emit('combat_hurt', { attacker: e.type, damage: dmg });

// After leveling up
QuestEngine.emit('level_up', { level: player.level });

// After entering a new floor
QuestEngine.emit('enter_level', { level: currentLevel, scene: currentScene });

// After talking to an NPC
QuestEngine.emit('npc_talk', { type: 'cain' });

// Custom events
QuestEngine.emit('custom', { id: 'pickpocketed' });
QuestEngine.emit('cell_entered', {});
```

**Auto-counters:** The engine automatically increments named counters on each event:
- `kill_<type>` — e.g., `kill_duck`, `kill_skeleton`
- `kill_total` — all kills
- `shop_visit_<type>`, `npc_talk_<type>`, `item_use_<icon>`

### Checking Quest State

```js
QuestEngine.check('q_dragon_slayer')      // → current stage number (0 if not started)
QuestEngine.isActive('q_dragon_slayer')   // → boolean
QuestEngine.isComplete('q_dragon_slayer') // → boolean
QuestEngine.hasAchievement('dragon_slayer') // → boolean
QuestEngine.getCounter('kill_total')      // → number
```

### Listening for Events

```js
const unsub = QuestEngine.on('achievement', (data) => {
  showAchievementNotification(data.id);
});
// Later: unsub() to unregister
```

---

## 8. Writing a New Quest Pack

Quest packs are objects pushed into `window._questPacks`. Create a new file `src/quests_mypack.js` and add it to `build.py` before `quest_engine.js`.

```js
// src/quests_mypack.js

window._questPacks = window._questPacks || [];
window._questPacks.push({

  quests: [
    {
      id: "q_my_quest",
      name: "My Quest",
      category: "Quests",      // shown in quest log grouping
      showInLog: true,
      stages: [

        // Stage 0: Quest introduction — fires on a trigger
        {
          progress: 10,        // arbitrary stage identifier
          logText: "I found the dragon's lair. First-person journal entry.",
          trigger: {
            event: "enter_level",
            filter: { scene: "castle" },
          },
          requirements: [
            { type: "playerLevel", min: 5 }
          ],
          rewards: [
            { type: "giveItem", icon: "🗡️" }
          ],
          // INT-gated hint (shown if INT >= intHintThreshold)
          intHint: "High-intelligence observation about the situation.",
          intHintThreshold: 12
        },

        // Stage 1: Kill a specific monster
        {
          progress: 20,
          logText: "I defeated the dragon!",
          trigger: {
            event: "kill",
            filter: { type: "dragon" }
          },
          requirements: [
            { type: "questProgress", questId: "q_my_quest", minProgress: 10 }
          ],
          rewards: [
            { type: "giveXP", amount: 500 },
            { type: "giveGold", amount: 200 },
            { type: "achievement", id: "dragon_slayer" }
          ],
          finishesQuest: true
        }
      ]
    }
  ],

  achievements: [
    {
      id: "dragon_slayer",
      name: "Dragon Slayer",
      cat: "Combat",
      desc: "Defeat the ancient dragon",
      icon: "🐉",
      points: 30
    }
  ]

});
```

### Trigger Reference

```js
// Event-based
trigger: { event: "kill", filter: { type: "dragon" } }
trigger: { event: "enter_level", filter: { level: 5 } }
trigger: { event: "enter_level", filter: { scene: "castle" } }
trigger: { event: "npc_talk", filter: { type: "cain" } }
trigger: { event: "shop_visit", filter: { type: "apu" } }
trigger: { event: "item_use", filter: { icon: "🧪" } }
trigger: { event: "level_up", filter: { level: 10 } }
trigger: { event: "custom", filter: { id: "my_custom_event" } }

// Counter-based (checked on every relevant event)
trigger: { counter: "kill_duck", min: 5 }
trigger: { counter: "kill_total", min: 100 }
```

### Requirement Reference

```js
{ type: "questProgress", questId: "q_my_quest", minProgress: 10 }
{ type: "questComplete", questId: "q_other_quest" }
{ type: "questActive", questId: "q_other_quest" }
{ type: "inventoryHas", icon: "🦆" }
{ type: "inventoryRemove", icon: "🦆" }    // side-effect: removes item
{ type: "playerLevel", min: 10 }
{ type: "playerStat", stat: "int", min: 15 }
{ type: "achievementEarned", id: "some_achievement" }
{ type: "achievementCount", min: 20 }
{ type: "gold", min: 500 }
{ type: "flag", key: "castle_bridge_open", value: true }
{ type: "counter", name: "kill_duck", min: 3 }
{ type: "npcInteracted", type: "chaplain" }

// Negate any requirement:
{ type: "questComplete", questId: "q_other", negate: true }
```

### Reward Reference

```js
{ type: "giveXP", amount: 500 }
{ type: "giveGold", amount: 200 }
{ type: "giveItem", icon: "🗡️" }
{ type: "achievement", id: "my_achievement" }
{ type: "setFlag", key: "my_flag", value: true }
{ type: "setCounter", name: "my_counter", value: 0 }
{ type: "incrementCounter", name: "my_counter", amount: 1 }
{ type: "questProgress", questId: "q_linked_quest", progress: 10 }

// Escape hatch: call a window.* function
{ type: "callback", fn: "myCustomFunction", args: { param: "value" } }
// Calls: window.myCustomFunction({ param: "value" })
```

---

## 9. Core Game Loops

### Turn-Based Tick (`advanceTurn`)

Called after every player action (move, attack, spell, rest, item use). The `steps` parameter allows multi-turn events (sleep advances 10 turns).

```
advanceTurn(steps) →
  window._turnCount += steps          (Shadowstep cooldown)
  if(currentLevel === 11) → Roc capture check
  running exhaustion drain
  hunger accumulation → starvation damage
  grue danger check (dark tile + no light)
  heal-over-time tick
  monster AI: enemies.forEach → actionTimer += speed * steps → attack if >= 1
  random slime spawn (SPAWN_RATE)
  status effect tick (disease damage, freeze/dizzy/sugar countdown)
  calculateFOV()
  drawMap()
  updateUI()
```

### Real-Time Loop (`setInterval`, 100ms, started on game boot)

Runs alongside the turn engine for animations:
- Quest timer countdown → fires callback at 0
- `damageTint` decay
- `levelUpFlash` decay
- Calls `drawMap()` if any timer active

### Animation Frame Loop (`requestAnimationFrame`)

Runs continuously via `renderLoop()` in `render.js`:
- Calls `drawMap()` only when `floatingTexts.length > 0`
- Keeps floating text animations smooth between turns

### Grue Danger System

Every turn on a dark tile (`darkMap[y][x] === true`) without active light:
- `player.grueDanger` increments
- Messages fire at turns 1, 3, 5, 7, 9, 11, 13, 15+
- At danger ≥ 15: `deathChance = min(0.9, (danger - 14) * 0.15)` per turn
- Light source active: danger resets immediately, log notes retreat

---

## 10. Rendering Pipeline

`drawMap()` runs in this order every frame:

```
1. ctx.clearRect (full canvas)
2. Calculate per-level color palette (wall/floor colors, 10 variants)
3. For each tile in viewport:
   - Draw tile color fill
   - If explored but not visible: darken overlay (0.55 opacity)
   - If GRASS tile: draw grass blades scaled by grassHeight() height map
4. Draw floor items (emoji or sprite, with hover outline if _hoverFloorItemIdx matches)
5. Draw corpses (emoji with loot count badge, red flash if inventory full, white hover outline)
6. Draw enemies (sprite or emoji, HP bar, 2× size for isBig)
   - Ifrit: WebGLFX.drawIfritAura() SDF humanoid fire particle overlay
7. Draw player (drawAvatar: emoji based on state + facing, size scaled by local grass height)
8. Draw active effects (lightning lines, level-up fireworks, portal fluid, fireball burst)
9. Draw floating texts (fade over 250ms, rise upward)
10. Fog-of-war overlay (offscreen canvas, destination-out hole)
11. Level-up flash (hsl color fill if levelUpFlash > 0)
12. drawMinimap() on #minimap canvas
13. WebGLFX orb fluid overlay (HP/MP globes via Navier-Stokes, drawn on separate canvases)
```

### Sprite vs. Emoji Fallback

```js
// Always check both conditions:
if(sprite && sprite.complete && sprite.naturalWidth > 32) {
  ctx.drawImage(sprite, ...);
} else {
  ctx.font = '20px sans-serif';
  ctx.fillText(item.icon, ...);
}
```

`naturalWidth > 32` rejects the tiny SVG placeholder sprites. When `loadAssetData()` loads
SVG placeholders, it sets `{ src: v, complete: true, naturalWidth: 33 }` — so they pass
the `> 32` check. GIFs from the asset bundle have real dimensions from `new Image()`. The
avatar uses emoji directly and never hits this path.

### FOV Algorithm

Ray casting at 2° increments from the player. Each ray walks up to `sightLimit` tiles (5 normal, 15 with light). Stops at `TILES.WALL` or `darkMap[y][x]` tiles (grue dark zones with no active light). Updates `visible[][]` and `explored[][]`.

---

## 11. Map Generation

### Scene Routing

| `currentLevel` | `currentScene` | Generator |
|---|---|---|
| 0 | `town` | Hand-placed Tristram |
| 1–10 | `dungeon` | BSP dungeon |
| 11 | `mountain` | BSP outdoor (grass base) |
| 12 | `beach` | BSP outdoor (sand base) |
| 13 | `desert` | Hand-placed + Letter trial |
| 14 | `forest` | BSP outdoor (forest) |
| ≥ 15 | `castle` | Full-floor + moat ring |

### BSP Dungeon Algorithm

```
splitArea(x, y, w, h, iterations=4)
  → if too small: push room center to rooms[]
  → else: split along shorter axis, recurse both halves

For each room in rooms[]:
  → 15% chance: single-cell (point room)
  → 40% chance: tight rectangle (70% of BSP cell)
  → 45% chance: drunkard's walk (organic cave shape)

Connect rooms[i] to rooms[i+1] via L-shaped corridor

Special placements (after rooms carved):
  → Dark chambers: 10% per room (exclude stairs/stores)
  → Flooded chamber: 40% chance on floor ≥ 4
  → STORE on even floors, LEFTYS on floor 3, BOOKSTORE on even floors ≥ 2
  → Thief hideout (SECRET_WALL) every 5th floor
  → 2 chests in random room centers
  → STAIR_UP + player spawn, STAIR_DOWN
  → spawnMonsters(3 + currentLevel)
  → 2 floor loot scatters
```

### Map Size Scaling

```js
scaledSize = Math.floor(baseSize * Math.pow(1.1, Math.max(0, currentLevel - 1)))
// Must be odd number (BSP works better with odd dimensions)
```

### `spawnLoot(x, y, isChest)`

Since build 734, chest loot creates a `corpse` object (loot pile) rather than dropping items directly. The loot pile is right-clicked to open. Floor scatter loot still drops as `itemsOnGround` entries (right-clicked via canvas context menu).

---

## 12. Shop & NPC System

### Opening a Shop

From game code (e.g., when player bumps a STORE tile in `engine.js`):

```js
openShop('apu');      // Apu's Mart
openShop('leftys');   // Lefty's Bar
openShop('wizard');   // The Curiosity Shoppe
openShop('cain');     // Deckard Cain
openShop('champion'); // Hall of Champions
```

### Shop Modal Structure

Every shop renders into `#modal-content` inside `#overlay`. The standard shop gets:
- NPC heading with `npcFaceHTML()` GIF or emoji
- Three tab buttons (Buy / Sell / Chat)
- `#store-tab-content` div populated by `storeTab(tab, type)`
- Exit button

### Adding a New Shop Type

1. Add a branch in `openStore(type)` in `shop.js` for the NPC greeting HTML
2. Add a branch in `storeTab(tab, type)` under `if(tab === 'buy')` with the items array
3. Handle tile interaction in `engine.js → movePlayer()` or map spawn

### NPC Talking Head GIFs

```js
function npcFaceHTML(gifKey, fallbackEmoji, npcType) {
  // If npcType has a movie, returns a container div for video injection
  if(npcType && NPC_MOVIES[npcType]) {
    return `<div id="npc-face-container" ...></div>`;
  }
  // Otherwise falls back to GIF <img> or emoji
  let gif = assets.sprites[gifKey];
  if(gif && gif.startsWith('data:image/gif')) {
    return `<img src="${gif}" style="width:80px;height:80px;...">`;
  }
  return `<span id="npc-face" style="font-size:60px;">${fallbackEmoji}</span>`;
}
```

GIF keys in the asset bundle: `npc_apu`, `npc_wizard`, `npc_chaplain`. When GIFs are not loaded, `startNPCAnimation()` cycles emoji expressions via `setInterval`.

### NPC Dialog Movies (Build 749+)

When an NPC has a movie assigned in `NPC_MOVIES`, the dialog system plays an MP4 video instead of showing a static face. The movie system:

```js
// shop.js — NPC_MOVIES map
const NPC_MOVIES = {
  'apu':          'movies/apu.mp4',
  'cain':         'movies/deckard cane.mp4',
  'erasmus':      'movies/erasmus.mp4',
  'pacifist_orc': 'movies/pacifist orc.mp4',
  // 'dennis': no movie assigned yet
};

// startNPCVideo() is called from openStore() — injects a shared <video> element
// Source priority: assets.movies['movie_<type>'] (embedded base64) → file path fallback
```

The video element is reused across all NPC dialogs to avoid DOM bloat. It's muted, loops, and autoplays. `stopNPCVideo()` pauses it when the dialog closes.

### NPC Dialog Movies (Build 749+)

When an NPC has a movie assigned in `NPC_MOVIES`, the dialog system plays an MP4 video instead of showing a static face. The movie system:

```js
// shop.js — NPC_MOVIES map
const NPC_MOVIES = {
  'apu':          'movies/apu.mp4',
  'cain':         'movies/deckard cane.mp4',
  'erasmus':      'movies/erasmus.mp4',
  'pacifist_orc': 'movies/pacifist orc.mp4',
  // 'dennis': no movie assigned yet
};

// startNPCVideo() is called from openStore() — injects a shared <video> element
// Source priority: assets.movies['movie_<type>'] (embedded base64) → file path fallback
```

The video element is reused across all NPC dialogs to avoid DOM bloat. It's muted, loops, and autoplays. `stopNPCVideo()` pauses it when the dialog closes.

---

## 13. Audio System

The `Sound` object (defined in `audio.js`) is the sole audio API. It now supports **two layers**:

1. **Bundled sample playback** from `assets.sounds` (data-URI MP3s for SFX, voice, and music loops)
2. **Web Audio FM fallback** when a sample is missing

This keeps the game fully playable offline even without generated audio.

### Basic Usage

```js
Sound.init();                          // Call once at game start
Sound.playTone(440, 'sine', 0.5, 0.1); // freq, type, duration, vol
Sound.clink();                         // Convenience methods
Sound.sword();
Sound.playMusic('monkey');             // Named FM tracks
Sound.stopMusic();
Sound.playVoice('voice_apu_store_line_thank_you');
```

### Adding a Sound Effect

Add a new method to the `Sound` object in `audio.js`:

```js
myNewSound() {
  if(!this.ctx || !window.gameSettings.sfx) return;
  this.playFM(440, 0.3, 0.4, 2.5, 3);  // freq, duration, vol, ratio, modIdx
}
```

If you want to prefer a generated/bundled sample first:

```js
myNewSound() {
  if(this.playSample('my_new_sound', 0.35)) return;
  this.playTone(440, 'square', 0.2, 0.1);
}
```

### Music Tracks

Tracks are arrays of note objects in `music_data.js`:

```js
Sound.tracks['mytrack'] = [
  { f: 440, d: 0.5, r: 2, i: 3 },   // frequency, duration, ratio, modIndex
  { f: 0,   d: 0.2 },                // rest (f: 0)
  ...
];
```

Play with `Sound.playMusic('mytrack')`.

`Sound.playMusic(name)` now checks for a bundled loop sample first:

```js
// If assets.sounds['music_tristram'] exists, this loops the MP3 sample.
// Otherwise it falls back to the FM track with the same name.
Sound.playMusic('tristram');
```

### Voice Playback

Voice clips are stored in `assets.sounds` under stable keys like:

- `voice_apu_store_line_thank_you`
- `voice_apu_supercenter_intro`
- `voice_apu_franchise_0`

Use:

```js
Sound.playVoice('voice_apu_store_line_thank_you');
Sound.stopVoice();
```

The shop system auto-plays Apu clips when relevant dialog views are rendered.

---

## 14. Asset Bundle

The asset bundle is split into **three JSON files** to avoid browser `JSON.parse` memory limits:

| File | Size | Contents | Required |
|------|------|----------|----------|
| `roguelike_assets.dat` | ~41 MB | Sprites (GIFs + SVG), SFX, voice clips, music loops | Optional but recommended |
| `roguelike_assets_ambient_movies.dat` | ~96 MB | Ambient audio loops + NPC dialog MP4 movies | Optional |
| `roguelike_assets_arcade.dat` | ~35 MB | Astrochicken WASM bundle + Centipede cabinet page | Optional |

### Core File Structure (`roguelike_assets.dat`)

```json
{
  "sprites": {
    "slime": "data:image/svg+xml;base64,...",      // SVG placeholders (< 1KB each)
    "npc_apu": "data:image/gif;base64,...",         // Animated GIF (983KB)
    "npc_wizard": "data:image/gif;base64,...",       // Animated GIF (529KB)
    "npc_chaplain": "data:image/gif;base64,...",     // Animated GIF (110KB)
    "duck_hunt_dog": "data:image/svg+xml;base64,...", // SVG placeholder
    ...
  },
  "sounds": {
    "step": "data:audio/mpeg;base64,...",
    "voice_apu_store_line_thank_you": "data:audio/mpeg;base64,...",
    "music_tristram": "data:audio/mpeg;base64,...",
    ...
  },
  "minigames": {},
  "movies": {}
}
```

**Why the split?** The original monolithic asset file crashed `JSON.parse()` in browsers. The arcade/WASM content was by far the largest contributor. The split keeps the core fast and lets users opt into ambience and arcade payloads separately.

### Start Screen Loader

The start screen has **three** file slots:
1. **Assets** (`#asset-loader`) — loads `roguelike_assets.dat`
2. **Ambient+Movies** (`#asset-loader-audio`) — loads `roguelike_assets_ambient_movies.dat`
3. **Arcade** (`#asset-loader-extra`) — loads `roguelike_assets_arcade.dat`

### `loadAssetData(data, filename)` Helper

A shared function that merges any loaded bundle into the global `assets` object:

```js
function loadAssetData(data, filename) {
  // Sprites: load GIF/PNG as <img>, SVG as stub objects with fake dimensions
  // Sounds: copy data URI strings directly (SFX, voices, music loops)
  // Minigames: Object.assign to merge (doesn't clobber previous entries)
  // Movies: Object.assign to merge base64 video/mp4 data URLs
  // Sets window.useSprites = true after loading
}
```

This means bundles can be loaded in any order and multiple times — later loads merge without clobbering.

### Asset Loader Code Flow

```
User selects roguelike_assets.dat
    → FileReader.readAsText(file)
    → JSON.parse(result)
    → loadAssetData(data, filename)
        → For each sprite:
            if starts with "data:image/gif" or "data:image/png":
                new Image() → assets.sprites[k] = img
            else (SVG placeholder):
                assets.sprites[k] = { src: v, complete: true, naturalWidth: 33 }
        → For each sound: assets.sounds[k] = data.sounds[k]
        → For each minigame: Object.assign(assets.minigames, data.minigames)
        → window.useSprites = true
    → Start button text changes to "ENTER THE DUNGEON"
```

### NPC Dialog Movies (Build 749+)

NPC dialogs can display MP4 video animations instead of GIF sprites. The system:

1. `NPC_MOVIES` map in `shop.js` maps shop types to movie file paths
2. `startNPCVideo(type)` injects a shared `<video>` element into the dialog's `#npc-face-container`
3. Source resolution: `assets.movies['movie_<type>']` (embedded base64) → fallback to `movies/<file>.mp4` (relative path)
4. The video is muted, loops, and autoplays when the dialog opens

Movies are embedded in `roguelike_assets_ambient_movies.dat` as base64 `data:video/mp4` data URLs. The asset loader's `loadAssetData()` merges `data.movies` into `assets.movies`.

### NPC Dialog Movies (Build 749+)

NPC dialogs can display MP4 video animations instead of GIF sprites. The system:

1. `NPC_MOVIES` map in `shop.js` maps shop types to movie file paths
2. `startNPCVideo(type)` injects a shared `<video>` element into the dialog's `#npc-face-container`
3. Source resolution: `assets.movies['movie_<type>']` (embedded base64) → fallback to `movies/<file>.mp4` (relative path)
4. The video is muted, loops, and autoplays when the dialog opens

Movies are embedded in `roguelike_assets_ambient_movies.dat` as base64 `data:video/mp4` data URLs. The asset loader's `loadAssetData()` merges `data.movies` into `assets.movies`.

### Rebuilding the Asset Bundle

```bash
python3 build_complete_assets.py
# Outputs:
#   roguelike_assets.dat
#   roguelike_assets_ambient_movies.dat
#   roguelike_assets_arcade.dat
```

The build script (`build_complete_assets.py`) handles all encoding:
- Sprite SVGs: created programmatically, base64-encoded
- Talking head GIFs: read from `gifs/` directory, base64-encoded
- Generated SFX: loaded from `sounds/generated/sfx/*.mp3` and override placeholders
- Generated voices: loaded from `sounds/generated/voices/**/*.mp3`
- Music loops: loaded from `music/*.mp3`
- Arcade pages: loaded into the arcade bundle (`astrochicken/*`, `centipede/index.html`)
- Warrior sprite sheets: excluded from core (avatar uses emoji now)

### Offline Sound Generation Pipeline

Wave 6 adds an offline Python pipeline using ElevenLabs.

Files:

- `tools/generate_sound_assets.py`
- `sound_generation.md`

The generator:
- reads the API key from `secrets.env` or environment
- generates Apu dialogue clips into `sounds/generated/voices/`
- generates common SFX into `sounds/generated/sfx/`
- uses a fallback API voice automatically if the requested library voice is unavailable on free tier

Run it before rebuilding bundles:

```bash
cd /home/projects/roguelike
.venv-eleven/bin/python tools/generate_sound_assets.py
python3 build_complete_assets.py
python3 build.py
```

To add a new GIF:

```python
# In build_complete_assets.py:
gif_heads = {
    'npc_apu':      'gifs/apu.gif',
    'npc_mynewnpc': 'gifs/mynewnpc.gif',  # ← add here
}
```

Then reference in game code as `assets.sprites['npc_mynewnpc']`.

---

## 14b. Deployment System (Build 749+)

Binary archives (.zip, .tar, .gz) are blocked by packet-inspecting routers. The deployment
system produces **plain JSON/ASCII multipart files** that pass through any proxy unscathed.

### Creating a Deployment

```bash
./deploy.sh 750          # bash (Linux/macOS)
.\deploy.ps1 750         # PowerShell (Windows)
```

Both produce `roguelike_deploy_750_part1.json` through `partN.json` — each ~50 MB of pure
ASCII text. No external dependencies; uses system `tar` for packaging and Python/PowerShell
for base64 encoding.

### Reassembling

```bash
python3 reassemble_deploy.py 750          # any platform
.\extract.ps1                             # Windows PowerShell
```

The reassembler auto-detects format version:
- **v1** (`roguelike_deploy`, method: `deflate`/`rle`) — Build ≤748
- **v2** (`roguelike_deploy_b64`, method: `base64`) — Build 749+

### JSON Part Structure

```json
{
  "format": "roguelike_deploy_b64",
  "version": 2,
  "build": "750",
  "original": "roguelike_deploy_750.tar",
  "original_size": 140509184,
  "method": "base64",
  "part": 1,
  "total_parts": 4,
  "data": "<base64 chunk...>"
}
```

---

## 15. Save / Load System

### What Gets Saved

```js
{
  player,              // entire player object including quest flags
  currentLevel,
  currentScene,
  mapW, mapH,
  theMap,              // 2D array of tile IDs
  explored,            // 2D array of booleans
  itemsOnGround,       // { x, y, icon }[]
  enemies,             // enemy objects[]
  corpses,             // corpse objects[] with loot
  levelCache,          // all previously-visited floors
  stolenItems,
  autoLootEnabled,
  questState: QuestEngine.getState()  // all quest/achievement progress
}
```

**Not saved:** `darkMap` (regenerated from `theMap`... actually `darkMap` is now saved too as of build 737), `visible` (recalculated on load via `calculateFOV()`), `assets` (too large — user must re-load the `.dat` file).

### Encryption

Save files are XOR-obfuscated (not truly encrypted) with the key `"DungeonDescentSecret"` then base64-encoded. Toggle off with the Debug Menu → `debugToggleEncryption()`.

### QuestEngine State

`QuestEngine.getState()` returns:
```js
{
  quests: { questId: { current, visited[], completed, ... } },
  achievements: { id: true },
  achievePoints: Number,
  counters: { kill_total: 42, ... },
  flags: { castle_bridge_open: true, ... },
  npcInteractions: { cain: true, ... },
  questLog: [...]
}
```

`QuestEngine.loadState(saved)` restores it completely.

---

## 16. UI Conventions

### The Two Modal Systems

**1. Blocking overlay** (`#overlay` / `#modal-content`):
- Used for shops, death screen, quest events, sleep, cell escape
- Full-screen dimmed backdrop
- Set `innerHTML` of `#modal-content`, then `overlay.style.display = 'flex'`
- Closed by ESC key or "Close/Exit" button

**2. Draggable modals** (`.draggable-modal`):
- Used for Inventory, Equipment, Stats, Quest Log, etc.
- Float over the game, don't dim it
- Opened/closed by `toggleModal(id)`
- Draggable by their `.modal-header`

### Pointer Events Architecture

```
#hud { pointer-events: none }        ← HUD doesn't block canvas clicks
.interactive { pointer-events: auto } ← Re-enable for interactive elements
```

All UI controls in the HUD must have the `.interactive` class or be inside an `.interactive` container.

### `logMsg(html)`

The game log accepts HTML. Use the CSS color variables for consistent styling:

```js
logMsg("<span style='color:var(--success)'>You found gold!</span>");
logMsg("<span style='color:var(--error)'>You were hit!</span>");
logMsg("<span style='color:var(--warning)'>You are hungry.</span>");
logMsg("<span style='color:var(--primary)'>Quest updated.</span>");
logMsg("<span style='color:#888; font-style:italic;'>Ambient flavor text.</span>");
```

---

## 17. Known Patterns & Gotchas

### The "Everything is Global" Problem

Because all variables are global, it's easy to accidentally shadow or overwrite something. If a variable seems to be the wrong value, search all source files for assignments to that name.

### Quest Flag Creep on `player`

Quest progress flags (`player.fedEagle`, `player.caughtByRat`, etc.) are set directly on the player object. This is a legacy pattern from before the Quest Engine existed. New quests should use `QuestEngine` flags (`setFlag`, `setCounter`) instead of player properties where possible. However, some systems (combat, NPC interaction) still check player flags directly.

### `window.useSprites` Toggle

Sprites are only used when `window.useSprites === true`. This is set to `true` by the asset loader after the `.dat` file is loaded. Without the asset file, everything renders as emoji.

### The FOV / `calculateFOV()` Call

Many state changes must call `calculateFOV()` after they finish to update visibility. If something isn't visible that should be (e.g., after a warp), check if `calculateFOV()` was called. The pattern is always:
```js
calculateFOV();
drawMap();
updateUI();
```

### `advanceTurn()` vs `drawMap()` Direct Calls

`advanceTurn()` always calls `calculateFOV()`, `drawMap()`, and `updateUI()` at its end. If you call `advanceTurn()`, you don't need to call them separately. If you modify game state without advancing a turn (e.g., debug functions), call `drawMap()` and `updateUI()` explicitly.

### Level Cache System

When a player descends stairs, the current level is saved to `levelCache[currentLevel]` before generating the new floor. When ascending, the cached level is restored. This means floor state (enemies, items, chests) persists across stair usage. Debug warp functions intentionally clear `levelCache[targetLevel] = null` to force fresh generation.

### `TILES.PORTAL` vs `TILES.STAIR_UP`

Town Portal scrolls create a `TILES.PORTAL` tile (rendered as 🌀). Stepping on it calls `_saveLevelToCache` then teleports to level 0 (Tristram). It does **not** use the stair system.

### Insult Sword-Fighting

The insult system requires player to first fight pirates (floor 4) to learn insults via `player.learnedInsults[]`, then use those against the Swordmaster (floor 5). The `INSULT_BATTLES` constant in `engine.js` defines the correct insult/retort pairs for both encounters.

### Dark Chamber / Grue System

Dark tiles are set in `map.js` after room generation. The `darkMap[y][x] = true` flag is separate from the tile type (still `TILES.FLOOR` or whatever). FOV treats dark tiles as vision-blocking when `lightTurns <= 0`. The danger accumulator lives on `player.grueDanger` and is checked in `advanceTurn()`.

---

## Quick Reference: Adding Common Features

### New monster type
→ Add to `MONSTER_DEF` in `state.js`
→ Add spawn logic in `map.js → spawnMonsters()`
→ Add combat handling in `engine.js → doCombat()` if special behavior needed
→ Add death/loot handling in the corpse generation block in `doCombat()`

### New item type
→ Add to `ITEM_DEF` in `state.js`
→ Add `handleItemClick` branch in `mechanics.js` if `type` is new
→ Add to shop inventory in `shop.js → storeTab()` if sold
→ Add to loot tables in `engine.js → generateLoot()` or `map.js → spawnLoot()`

### New spell
→ Add `castSpell` branch in `mechanics.js`
→ Add to `ITEM_DEF` as a scroll or spell tome
→ Add to wizard shop in `shop.js`

### New NPC dialogue
→ Add `window.openMyNPC = function(step)` in `shop.js`
→ Add NPC type to `MONSTER_DEF` in `state.js`
→ Add spawn to `map.js`
→ Add `npc.type === 'mytype'` branch in `engine.js → movePlayer()`

### New quest
→ Create `src/quests_myquest.js` using the quest pack format
→ Add to load order in `build.py` (before `quest_engine.js`)
→ Emit relevant events from game code using `QuestEngine.emit()`
→ Add achievement definition if needed

### New floor/scene
→ Add level range in `map.js → initMap()` scene routing
→ Add map generation in the appropriate section
→ Add music in `Sound.playAmbient()` / `Sound.playMusic()` call
→ Add fog-of-war treatment in `render.js` (`fullLightScenes` or `partialLightScenes`)
