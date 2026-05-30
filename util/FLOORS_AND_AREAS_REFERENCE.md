# Floors and Areas Reference

This document summarizes current floor/scene progression and notable content from `src/map.js`, `src/engine.js`, `src/state.js`, and quest packs.

## World Progression

- Floor 0: `town` (Tristram + expanded overworld)
- Floors 1-10: `dungeon`
- Floor 11: `mountain` (Highlands)
- Floor 12: `beach`
- Floor 13: `desert`
- Floor 14: `forest` (Hedge Country)
- Floor 15+: `castle`
- Special background scenes: `eagle_crag`, `nest`, `champion`

---

## Floor/Area Breakdown

## Floor 0 - Tristram (town)

- Shops/buildings:
  - `STORE` -> Apu (Kwik-E-Mart)
  - `BOOKSTORE` -> Wizard / Curiosity Shoppe
  - `FORGE` -> Blacksmith (Griswold)
  - `HALL` -> Hall of Champions entry (requires 20 achievements)
  - Far east `STORE` tile is repurposed as The Mended Drum
- Key NPCs:
  - Cain, Blacksmith, Dennis, Town Guard
  - Dennis's Wife + sheep
  - Muck Peasants (field patrols), Retired Soldier
  - Mended Drum cast: Nobby (barman), Cohen, Librarian, Vimes, Bearded Dwarf
- Key quests/themes:
  - Town guard monster-clear discount quest
  - Dennis/animal consequence arc
  - Mended Drum dialog/easter egg content
  - Hall of Champions unlock progression
- Monsters/hostiles:
  - Mostly non-hostile town fauna and vermin (mouse/cockroach)
- Mini-bosses/bosses:
  - None by default in town

## Floors 1-10 - Dungeon band

- Core monsters by pool:
  - Slime, skeleton, bat, ghost
  - Floors 1-3 add zombie
  - Floors 1-6 add lizard vermin
  - Water chambers can add duck/wet rat; shark can appear as a one-per-game boss encounter
- Shops/buildings:
  - Even floors: Apu store (`STORE`)
  - Even floors: moving bookstore (`BOOKSTORE`)
  - Floor 3: Lefty's (`LEFTYS`) + Fence NPC nearby
- Key systems/quests:
  - Dark chambers (Grue hazard mechanics)
  - Thief hideout on floors divisible by 5 (5/10 in this band)
  - Mimic chest chance on floor 3+
  - Floor 3 Eagle Crag door (key-gated)

### Floor-specific highlights

- Floor 1:
  - Hidden-wall Ifrit lair
  - Boss: Ifrit (drops Tome of Fireball)
- Floor 3:
  - Lefty's bar + Fence
  - Weapon Master courtyard NPC
  - Eagle Crag door trigger tile (`CASTLE_DOOR`)
- Floor 4:
  - Pirate packs
  - Pirate Chaplain NPC
- Floor 5:
  - Swordmaster dark maze sequence
  - Pirate guards + Swordmaster encounter
  - Thief hideout (also every 5 floors)
- Floor 6:
  - Pacifist Orc (Grok) dark room encounter
  - Cupcake interaction easter egg
  - Weapon Master can also appear (3/6/9 pattern)
- Floor 9:
  - Weapon Master courtyard NPC
- Floor 10:
  - Thief hideout again

- Mini-bosses/bosses in dungeon band:
  - Ifrit (floor 1 scripted boss)
  - Swordmaster (`master`) as insult-combat boss encounter
  - Shark (conditional aquatic boss encounter)
  - T-Rex world mini-boss can spawn on levels 8-12

## Floor 11 - Mountain (Highlands)

- Monsters:
  - Chipmunk, troll, eagle, plus random encounter wildlife
- Key features:
  - Open-gate traversal style (no standard stairs)
  - Nest entrance tile (`NEST`) can lead to `nest` scene
- Quests/themes:
  - King's Quest eagle/roc progression

## Floor 12 - Beach

- Monsters:
  - Snake, crab, lizard, pirates; random wildlife
- Shops/buildings:
  - SCUMM Bar (`SCUMM_BAR`)
  - Antique Shop (`ANTIQUE_SHOP`)
  - Beach village points of interest (boat/dock, fishing spot)
- Key NPCs:
  - Pirate Chaplain, pirates, Swordmaster (house)
- Key quests/themes:
  - Monkey Island insult-combat arc
  - Safe-combination/antique-shop arc
  - Red herring + caustic grog related progression

## Floor 13 - Desert

- Monsters/challenges:
  - Snake, scorpion, lizard from pool
  - Scripted: Bridge Keeper, Black Knight, Killer Rabbit, French Taunter
- Shops/buildings:
  - Atlantean machine tiles (`MACHINE`) for bead-powered puzzle
- Key quests/themes:
  - Monty Python trials
  - Fate of Atlantis bead/machine puzzle
  - Drawbridge unlock toward castle progression
- Mini-bosses/bosses:
  - Black Knight
  - Killer Rabbit (high lethality gimmick fight)

## Floor 14 - Forest (Hedge Country)

- Monsters:
  - Chipmunk, snake, troll, pixie, lizard
- Key traits:
  - Dim lighting scene (not full-bright like town/beach/desert)
  - Pixie buzz + taunt voice behavior
- Quests/themes:
  - Black Cauldron and related forest quest chain hooks

## Floor 15+ - Castle

- Monsters:
  - Skeleton, ghost, assassin (+ spawned mix)
- Key features:
  - Castle layout with moat/walled rooms
  - Black Knight boss spawn in castle map
- Quests/themes:
  - Endgame castle arcs, Black Cauldron climax hooks (including Horned King questline)
- Mini-bosses/bosses:
  - Black Knight (scripted spawn)
  - Horned King appears in quest progression (quest-engine controlled)

---

## Special Scenes (Background Maps)

## `eagle_crag`

- Accessed from floor 3 dungeon door event
- Contains eagle interaction path and return tile back to floor 3
- Key quest theme: feeding eagle / mountain progression

## `nest` (Roc's Nest)

- Accessed via mountain nest tile
- Eagle rescue/escape sequence hooks
- Return tile back to mountain

## `champion` (Hall of Champions)

- Accessed from town hall tile after achievement threshold
- Clerk NPC and champion hall flavor scene
- Return tile back to town

---

## Boss and Mini-Boss Index (Cross-Area)

- Bosses flagged or scripted:
  - Ifrit
  - Black Knight
  - Horned King (quest-driven)
  - Genie (quest-driven spawn)
  - T-Rex (rare high-level world boss/miniboss)
- Mini-boss/challenge encounters:
  - Swordmaster (insult duel boss-style encounter)
  - Killer Rabbit
  - Bridge Keeper challenge gate
  - Shark (rare aquatic boss-like threat)

---

## Debug Console Expansion Ideas (MUD + WoW Inspired)

## MUD-inspired improvements

- Command aliases and chaining:
  - Add semicolon command chaining: `n;n;look;use candle`
  - Add `/alias add grind "run e8;attack"`
- Room/area introspection:
  - Add `/look long` (verbose room parse)
  - Add `/where` showing area, floor, coords, nearby exits/POIs
- Targeting and socials:
  - Add `/target nearest <type>` and `/assist <npc>`
  - Add flavor socials (`/emote`, `/say`, `/yell`) with optional NPC reaction hooks
- Script/macros v2:
  - Add macro variables (`$hp`, `$enemy_count`, `$scene`) and simple conditionals
  - Add cooldown/anti-loop guard and per-macro enable/disable tags
- Logging and replay:
  - Add `/log start`, `/log stop`, `/log export` for playtest transcripts

## WoW-inspired improvements

- GM-style command namespace:
  - `/gm on`, `/gm fly`, `/gm ghost`, `/gm speed 2.0`
  - `/tele <scene|floor|poi>` with fuzzy matching (`/tele beach`, `/tele ifrit`)
- Spawn and encounter controls:
  - `/spawn <mob> [count] [elite|boss]`
  - `/despawn <radius|all_nonquest>`
  - `/encounter reset <name>` for scripted bosses
- Quest and reputation tooling:
  - `/quest list`, `/quest stage <id> <n>`, `/quest complete <id>`
  - `/faction add town_guard 500` (future-proof for reputation systems)
- Combat test harness:
  - `/dps start 60` and `/dps report`
  - `/sim 1000 "weaponA" vs "weaponB"`
- UI/profiler diagnostics:
  - `/prof fps`, `/prof ai`, `/prof render`, `/prof audio`
  - `/trace on` for command timing + event emission tracing

## Quality-of-life commands to add next (high ROI)

- `/goto <x> <y>` for deterministic reproduction of map bugs
- `/seed <number>` and `/regen` for repeatable map generation
- `/snapshot save <name>` and `/snapshot load <name>` for test scenarios
- `/loot add <icon> [qty]` and `/gear set <preset>` for fast balancing passes
- `/validate` command to run quick integrity checks (NaN stats, orphan enemies, bad tiles)
