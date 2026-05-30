# Dungeon Descent Changelog

## [7.6.1] — Build 761 — 2026-04-16 — IN PROGRESS

### New Tools
- Added `static_map_editor.html` for static-map authoring (large-button UI, hover help, JSON import/export).

### 760/761 Fix Pass
- E760.IFRIT_AGRO: Ifrit now provokes when guarded floor loot is picked up in his chamber.
- E760.IFRIT_HIDDEN: Floor 1 now uses a hidden off-color panel leading to a long hall and remote Ifrit chamber.
- E760.TRISTRAM_WALLS: Tristram walls now render as gray brick-styled walls.
- E760.PEASANTS: Added hard guarantee pass so muck peasants exist in grass fields outside town walls.
- B760.FANFARE: Asset-slot fanfare trigger hardened (direct sample playback fallback after slot load).
- B760.FLIES: Fly/mosquito emoji render scale reduced in map renderer.
- B760.PIXIES_DROPS: Pixies now drop Resurrection Crystals reliably.
- B760.AUTO-STACK: Auto-stack behavior expanded for inventory/pouch/bag paths during pickup/loot.
- B760.MIMIC: Mimics now aggro when revealed/attacked and can perform ranged coin spit attacks.
- B760.THIEF: Pickpocket modal now uses dedicated static thief portrait.
- B760.WEAPONS_MASTER: Swordmaster insult modals now use dedicated static portrait.
- B760.ASTROCHICKEN: WASM path replacement in minigame loader made robust to relative path variants.
- B760.MYSTERY_LADY: Mystery Lady now uses separate voice clip keys from barkeep flow.
- B760.MIDAS_TOUCH: Status chip now shows while Ring of Midas is equipped.
- B760.SCUMMBAR_PIRATE_MASTERS: SCUMMbar portrait scale increased in modal UI.
- B760.ANTIQUE_SHOPPE_TALKING_HEAD: Antique shop dialog now uses Fence movie path in branches.
- B760.ASPCA: Town protection gate loosened so animals/vermin are attackable in Tristram.
- B759.PIXIES: Added keep-out logic around Tristram walls (target >=30 tile separation from walls).
- B760.RAT_BOOT: Added rat thank-you line + recorded voice clip.
- B759.EAGLES_CRAG: Door transition now also honors stored Eagle Crag door coordinate.
- B759.THE_FENCE: Added anti-blocking reposition and wider entrance exclusion zone.
- B759.SUPERCENTER: Music now transitions back when leaving the Supercenter area.
- B760.INSULT_BATTLE: Player opener is now a dialog choice (not autopilot), with player-side voice lines.

### New Assets (Build 761)
- Added modal portrait backfill sprites from `asset_backfill.zip`:
  - thief, bridgekeeper, swordmaster, lowly pirate 1–5, scummbar leaders.
- Added Mended Drum regular static portraits from `regulard.zip`.
- Added player insult/retort internal voice set and rat-thanks voice clip.

### Known Remaining
- B759.HP_AND_MANGA_GLOBES: orb WebGL still intermittently falls back to CSS in user testing.

---

## [7.5.0] — Build 750 — IN PROGRESS

### NPC Dialog Movies
- movies.zip extracted to movies/: apu.mp4, deckard cane.mp4, erasmus.mp4, pacifist orc.mp4, cousin dave.mp4
- NPC_MOVIES map in shop.js wires video to dialog modals for Apu, Deckard Cain, Erasmus, Grok
- Shared <video> element reused across all NPC dialogs (no per-NPC DOM creation)
- Dennis (Monty Python peasant) awaiting movie asset — currently uses 👨‍🌾 emoji fallback
- All other speaking NPCs will receive movies as assets are provided

### Grass System
- Grass height map: per-tile smooth height multiplier using dual-frequency sine wave noise
- Smooth rolling variation (tall/short grass clusters) instead of per-blade random
- Blade height: GRASS_MIN_H=3px to GRASS_MAX_H=13px based on height map value
- Avatar size scales with local grass height (up to 12% smaller in tallest grass)
- Height map regenerates on each new map load via initMap() hook

### Kelch Tasks (late session)
- K-new-1: decrementItem now removes items with no qty attribute set
- K-new-3: Debug stat editor now includes Current HP and Current MP fields
- K-new-4: getPlayerCritRate() added to player.js; applyDamageToEnemy() in engine.js
- K-new-5: doCombat uses applyDamageToEnemy in all 3 damage application points
- K-new-5: crit log message appears before hit log (correct order)
- BEGIN ADVENTURE button label applied to start screen

### WebGL Orbs in Game
- drawOrb() replaced with full Navier-Stokes fluid simulation (WebGL2 RGBA16F)
- Energy system: calms over ~2s idle, bumped by movement/combat/mouse interaction
- HP orb: blood red base, red-only hue cycling; MP orb: royal blue, full rainbow
- Falls back to sine-wave waterline if WebGL2 unavailable

---

## [7.4.0] — Build 749 — 2026-04-12 — COMPLETE

### Bugs Fixed
- B1: All farm animals attackable — removed incorrect quest-protection flag
- B2: Town Guard kill quest now counts dungeon kills only (not town vermin/animals)
- B3: Dialog modal close stops voice audio playback
- B4: Chickens/ducks only drop meat or feather — no gold
- B5: Background music plays on game start (playMusic called after initMap)
- B6: Bag panel drag-and-drop between bag and pouch slots fixed
- B8: /launch astrochicken works without external assets loaded
- B9: WebGL effects replaced with quality implementations:
  - Grass: denser (60×60 blades), taller, avatar parting, energy-based
  - Chain lightning: fractal midpoint displacement depth-4 with branches
  - Fireball: GPU GL_POINTS heat-gradient particle system
  - Ice bolt: deterministic jagged polyline with frost burst
  - Ifrit: SDF humanoid GPU particle system with patrol AI (sit/walk/idle states)
  - Portal: Navier-Stokes fluid with rainbow hue cycling (WebGL2)
- B11: Dennis voice line volume +200% via ffmpeg
- B12: HP globe blood red (#580000); CSS fallback hidden when WebGL active
- B13: Candle expiry properly restores pitch-black
- B15: Staircase STAIR_UP placed at Floor 1 dungeon spawn point
- B16: Cat chases rat AI on Floor 2
- B17: WebGL orb fluid rendering wired into updateUI + 60fps animation loop
- B18: Debug console stat chips restored
- B19: Ring of Midas activates midasTouch status effect on equip
- B20: Weapon Master voice generated (ElevenLabs ID: 6sFKzaJr574YWVu4UuJF)
- B21: Weapon Master courtyard floor renders as cobblestone (🪨 overlapping)
- B22: Minimap area label has parchment scroll background
- B27: Eagle's Crag door plays wind SFX on collision
- B28: "You hear nothing but your own breath" uses internal narrator voice
- B29: Eagle's Crag door now loads eagle_crag scene (not champion)
- B30: Grok orc collision dialog — flirt/annoy escalation cycle
- B31: Step sound replaced with footstep.mp3 if available; FM volume boosted
- B32: Unknown items audited — earthworm (🪱) added to ITEM_DEF
- B35: Fence patrols near Lefty's Bar instead of blocking entrance
- B36: Fence offers 25–35% market value with flavor text
- B37: Scavenger Talent auto-loots corpses
- B39: Death modal allows Game Log and Menu hamburger access
- B41: Death modal displays last game log message as death description
- B43: Build number auto-injected into HTML title via {{BUILD_NUMBER}} template
- B44: Greek temple tiles only show Hall of Champions messages in champion scene

### Enhancements
- E1: Music toggle 3-position: Off / FM Synthesis / MP3 (fallback logged)
- E2: SFX toggle 3-position: Off / FM Synthesis / MP3 (fallback logged)
- E3: "Wasting candles" message when using candle in lit area
- E4: Minimap 👁 show/hide toggle button
- E5: Blacksmith NPC at The Forge (voice ID: LRpNiUBlcqgIsKUzcrlN)
- E6: Deckard Cain heals player to 100% HP/MP free on first visit
- E7: Apu dialog tree — 5 cycling lines about running dungeon shop
- E8: Weapon Master activities: Training (10g +1 next attack), Appraise (5g), War Stories
- E9: Genie Boss 400% size; drops Tome of Town Portal (100% chance)
- E10: Scroll of Beach Portal random drops on floors 7+ (3% chance)
- E11: Macro help page modal on Debug Console (? button)
- E12: Macro builder drag-and-drop tool on Debug Console
- E13: Green outline on items with status effects; hide details until Identify used
- E14: Class selection screen — Fighter / Rogue / Spellcaster with portrait videos
- E15: T-Rex mini-boss (🦖 6× size, 999 HP, stun attack, spawns floors 8–12)
- E16: Bomb item (💣 10-turn fuse, 5-tile blast radius, pulsing countdown render)
- E17: Poop (💩) random 15% drop from farm animals; funny use messages
- E18: Cat enemy emoji updated to 🐈
- E19: Mouse/rat enemy emoji updated to 🐁
- E20: Random encounter animals in outdoor maps (hedgehog, bunny, turkey, goose, mosquito)
- E21: Underwear emoji updated to 🩲
- E22: Cow and pig renderScale 2.0× confirmed
- E23: Tile edge smoothing — gradient feathering at terrain transitions

### Kelch Developer Tasks (K-series)
- K1: Melee button icon syncs to equipped left-hand item (👊 when unarmed)
- K2: ASCII art castle wall alignment fixed
- K3: GAME_NAME = "NotAName" — unified via {{GAME_NAME}} template in build
- K4: showStats hitRate/critRate/dodgeRate shown as %; verbose melee damage paragraph
- K5: player.js module — inventory, pouch, player, setPlayerDefaults, changeGold, PlayerSprites
- K6: Equipment paper doll drag-to-unequip/swap fully implemented
- K7: PLAYER_INITIAL_BASE_DMG renamed PLAYER_UNARMED_BASE_DMG, value 2→3
- K8: swapEquip uses CONSTANTS.PLAYER_UNARMED_BASE_DMG and CONSTANTS.PLAYER_INITIAL_DODGE_RATE
- K9: setPlayerDefaults() initialises player object at declaration (no duplication)
- K10: getPlayerPrimaryHand, getPlayerHitRate, getPlayerHits, getPlayerDmg, getPlayerDmgVersus in player.js
- K11: ITEM_DEF sorted by type then name alphabetically with O'Reilly comments
- K12: weapon.maxDamage renamed baseDmg; values corrected per spec
- K13: damageOverride removed from Accordion
- K14: doCombat replaced with Kelch's version using player.js helpers

### WebGL Effects Demo (webgl_effects_demo.html)
- Rebuilt from scratch: 4 WebGL contexts (was 7 — Chrome context limit fix)
- Fluid orbs: WebGL2 RGBA16F, correct fill orientation, energy-based turbulence
- Orb energy system: calms over ~2s of inactivity; bumped by movement/combat/mouse
- Grass: 60×60 blades, 🧍 avatar walking figure-8 path, mouse parting
- Lightning: fractal midpoint displacement with bloom FBO
- Fire/Ifrit: SDF humanoid particle system, 8-direction walk/sit/fireball state machine
- Portal: 400×400 square canvas, circular clip, rainbow NS fluid, seeded immediately

---

## v7.2.5 — Quest Engine, Monkey Island, Flooded Dungeons

### Major: Quest & Achievement Engine
- **New `quest_engine.js`**: Data-driven quest and achievement system
  - Event bus pattern: game emits events, quests react via JSON triggers
  - Composable requirements (questProgress, inventoryHas, killedMonster, playerLevel, playerStat, achievementEarned, gold, location, npcInteracted)
  - Composable rewards (questProgress, giveItem, giveGold, giveXP, achievement, setFlag, callback)
  - Hybrid dialogue system: JSON for text/branching, callbacks for minigames
  - Full save/load support via `QuestEngine.getState()` / `loadState()`
  - Quest log API for UI display
  - Legacy bridge: `awardAchievement()` still works
- **Quest pack files**: One file per content theme, contributors don't touch engine code
  - `quests_base.js` — kill milestones, floor milestones, level-ups, duck hunt, shark, thief hideout, vermin, dragon, grue
  - `quests_monkey_island.js` — insult sword fighting chain, safe cracking, caustic grog, pirate grog
  - `quests_monty_python.js` — Bridge of Death, Black Knight, Killer Rabbit, Dennis, French Taunter
  - `quests_black_cauldron.js` — Gurgi (feeding + sacrifice), Castle Rat, Morva Witches, Horned King
- **INT-gated hint system**: 3 tiers of intelligence-based content
  - `intHint` — log message for smart characters (soft gate)
  - `intHintModal` — popup for important insights (soft gate)
  - `intRequired` on dialogue replies — options only visible at high INT (hard gate)

### Bugfix: Achievement Persistence
- **Fixed**: Achievements and achievement points were never included in save data
- `questState` (including all achievements) now serialized in `saveGame()` and restored in `loadGame()`

### Bugfix: 35 Orphaned Achievements
- **Fixed**: 35 of 52 defined achievements had no trigger code
- Now wired to auto-triggers via quest engine (first_blood, level_5/10/15, floor_3/5/10/15, kill_10/50/100, dragon_slayer, grue_slayer, etc.)

### New: Monkey Island Content
- **Insult learning system**: Fight pirates to learn insults, then challenge the Swordmaster
  - Pirates teach you insults on correct retort (logged with `[Insight]` message)
  - Swordmaster only uses insults you've already learned — go unprepared and he tells you to leave
  - Expanded insult pool to 16 pirate insults + 16 master insults
- **Beach village (level 12)**: SCUMMbar, Antique Shop, Swordmaster's Hut, fishing spot, boat dock
  - Multiple pirates near SCUMMbar for insult practice
  - Red Herring fishing spot for Caustic Grog quest
- **SCUMM Bar**: Buy grog (10g), learn about insult fighting, pirate grog achievement at 3 drinks
- **Antique Shop**: Hard-of-hearing shopkeeper, safe cracking quest leading to Swordmaster
- **Caustic Grog quest**: Catch Red Herring, distract cook, steal ingredients, brew grog (+50% damage buff)
- **Astrochicken minigame**: Timing-bar minigame at Lefty's Bar (5g per play, 50g prize at 5 wins)
- **New achievements**: Pirate Insulter, Insult Master, Swordmaster Slayer, Pirate Grog, Safe Cracker, Caustic Brewer, Astrochicken Champion

### New: Discworld Content
- **The Curiosity Shoppe**: Wizard's bookstore now randomly relocates each visit
  - Tristram: 8 possible positions, different every town visit
  - Dungeon: Appears on even floors (2, 4, 6, 8...) in random dead-end walls
  - Flavor text acknowledges the movement ("We were on the other side of town last time")
- **Granny Weatherwax**: 20% chance to appear in the bookshop with a cutting remark
  - 9 unique quotes about headology, sin, and the nature of witchcraft
  - Awards "Headology Expert" achievement

### New: Flooded Dungeon Creatures (restored from v7.0.x)
- **Duck** (60% spawn in water tiles): 8 HP, quacks in combat, drops Duck Leg food
- **Wet Rat** (30% spawn): 15 HP, disease chance, drops Wet Rat Tail
- **Shark** (10% spawn): 80 HP, 25 damage, drops Sharkskin Suit (15%) or Shark Tooth (35%)
- **Sharkskin Suit**: Chest armor, +15% evade, 2500g value (shark-exclusive drop)
- **Duck Hunt dog**: NES-style SVG animation pops up from grass and laughs when 5th duck killed
- **Quack sound**: Ducks now quack on hit and death via `Sound.quack()`

### New: Thief Hideout
- Secret rooms on floors 5, 10, 15 behind SECRET_WALL entrances
- Contains thief NPC, gold, keys, and chance of weapon
- Awards "Thief's Bane" achievement on discovery

### New: Black Cauldron Monster Definitions
- `castle_rat`, `horned_king`, `cauldron_born`, `morva_witch` added to MONSTER_DEF
- 7 new achievements for Black Cauldron quest chain

### Improved: Monster Spawning
- `spawnMonsters()` now uses scene-specific monster tables instead of all-slime
- Dungeon: slime, skeleton, bat, ghost
- Mountain: chipmunk, troll, eagle
- Forest: chipmunk, snake, troll
- Castle: skeleton, ghost, assassin

### Existing: Leisure Suit Larry Content (present since v7.0.x)
- **Prophylactic quest at Apu's**: Multi-step Larry Easter Egg (Plain/Ribbed, Colored/Clear, Lubricated/Dry, Magnums) culminating in loudspeaker announcement
- **Mystery Woman at Lefty's Bar**: Safe encounter requires prophylactic from Apu; unsafe = fatal social disease (game over)
- **Achievements**: "Pervert!" (complete prophylactic quest), "Safe Casanova" (survive Mystery Lady)

### Existing: Final Fantasy Content (present since v7.2.4)
- **Ifrit boss**: Floor 1 secret room behind SECRET_WALL, fire puns, fire attack AI
- **Tome of Fireball**: Ifrit chest drop, unlocks click-to-target Fireball spell
- **Fireball system**: Range, cooldown, AoE damage

### Existing: Zork Content (present since v7.0.x)
- **Grue**: Full lore conversation tree with the Wizard (6 topics), darkness flavor text
- **Thief / Pickpocket**: Thief NPC steals inventory items, moves stolen goods to `stolenItems` array
- **Fence**: Buy back stolen items at 2x price, sell loot at 10%
- **Thief Hideout**: Secret rooms on every 5th floor (new in v7.2.5)

### Existing: Indiana Jones Content (present since v7.1.0)
- **Breath of God trial** (Last Crusade): BLADE tile in desert, must kneel to survive
- **Name of God trial** (Last Crusade): LETTER tiles spelling IEHOVA, wrong step = death
- **Orichalcum Bead** (Fate of Atlantis): Item defined (`📿`) but gameplay NOT implemented
- Both Last Crusade trials placed in desert scene (level 13)
- Missing from Fate of Atlantis: bead-powered drawbridge machine to Horned King's castle, decoy Atlantean machines (Rube Goldberg bead-wasters)

### Known Regressions from v7.1.0 (to be restored)
- **King's Quest V quest chain**: Rat rescue (throw boot at cat), bandit camp (rat chews ropes), temple cavern (INT greed trap, Staff unlocks wall), genie boss encounter
- **Harpy encounter**: Harp music mechanic to entrance harpies
- **Weeping Willow**: TILES.WILLOW defined but no gameplay/rendering
- **Genie gameplay**: Defined in MONSTER_DEF but never spawned
- **Arcade tile**: TILES.ARCADE defined but no gameplay/rendering
- **Grue death mechanic**: Darkness death from v5.x-v6.x not present in v7.x

## v7.2.4 — Hall of Champions, Fireball, Secret Passages

- Hall of Champions: Achievement-gated shop in Tristram (20+ achievements)
- Champion store: Tiered items at 20/25/30/35/40 achievement thresholds
- Fireball spell: Click-to-target, range check, cooldown system
- Secret passages: SECRET_WALL tile (slightly off-color wall)
- Crown of Thorns: Thorns damage reflects to attackers
- Magic Teapot: 60min cooldown potion brewing
- Apu franchise dialog: 6-step quest about KwikeeMart headquarters
- Ifrit boss: Fire puns, floor 1 secret room, drops Tome of Fireball

## v7.2.0 — Monty Python & Holy Grail

- Black Knight: Limb-loss combat system (4 stages)
- Bridge of Death: INT-gated trivia trial
- Killer Rabbit: 999 damage, requires Holy Hand Grenade
- French Taunter: Invincible, throws cows
- Dennis the Peasant: Constitutional Convention quest
- Pirate Chaplain: Pastafarianism / FSM dialogue tree
- Battle of Wits: Insult sword fighting (pirate + master)
