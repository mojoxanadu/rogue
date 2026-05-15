  // K3: Game name — set via build process template substitution
  window.GAME_NAME = '{{GAME_NAME}}';

  // ── Touch-device detection (single source of truth) ────────────
  // Sets at module-load so any consumer (input handlers, render
  // adaptations, layout defaults) can branch on a stable boolean.
  // Detection layers, in order of precedence:
  //   1. URL override (?mobile=1 forces ON, ?mobile=0 forces OFF) —
  //      lets you exercise the touch UI in a desktop browser without
  //      DevTools device emulation.
  //   2. Capability probe: 'ontouchstart' in window OR maxTouchPoints
  //      > 0. Both cover modern browsers; the union handles edge
  //      cases (older Safari needs ontouchstart, hybrid Surface
  //      laptops report maxTouchPoints).
  // Hybrid devices (touchscreen laptop) report touch=true even
  // though they have a mouse — that's correct; keyboard and mouse
  // input handlers stay live alongside touch handlers, so nothing
  // is taken away.
  window.IS_TOUCH = (() => {
    try {
      const q = (typeof window !== 'undefined' && window.location && window.location.search) || '';
      if (/[?&]mobile=1\b/.test(q)) return true;
      if (/[?&]mobile=0\b/.test(q)) return false;
    } catch (_) { /* ignore */ }
    if (typeof window === 'undefined') return false;
    return ('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0);
  })();

  // === Game Constants & State ===
  /*
    GAME STATE & CONFIGURATION
    ===========================
    This file contains all global variables, constants, and data definitions
    that shape the game's mechanics and world.

    It is divided into sections:
    1. CONSTANTS – tunable numeric parameters (hunger, speed, XP, etc.)
    2. Canvas & Tile definitions
    3. (TALENT_TREES removed — talents are being redesigned; new system arrives later)
    4. Game‑state variables (currentLevel, theMap, inventory, etc.)
    5. Player object – the player's persistent stats and flags
    6. MONSTER_DEF – definitions of all enemy types
    7. LEGACY_ITEM_DATA – raw item definitions (consumed by items_registry.js)
    8. Utility functions (e.g., addFloatingText)

    This file is loaded early and referenced by virtually every other module.
  */
  // Core game‑balance constants. Adjust these to change the feel of the game.
  const CONSTANTS = {
    HUNGER_RATE: 0.01,
    HUNGER_DAMAGE: 0.5,
    HUNGER_HEAL: 0.0,
    SPAWN_RATE: 0.02,
    DISEASE_DAMAGE: 1,
    SUGAR_RUSH_SPEED: 100,
    NORMAL_SPEED: 166,
    RUN_SPEED: 80,
    XP_BASE: 100,
    XP_MULT: 1.5,
    // ── Player initial stats — delegated to Player.DEFAULTS ───────────
    // These keys are accessed all over the codebase
    // (mechanics.js, ui_logic.js, player.js). The actual numbers live
    // on Player.DEFAULTS (entities.js). The getters resolve `Player`
    // lazily at access time — safe because the first read happens in
    // player.js's setPlayerDefaults(), well after entities.js has run.
    // Call sites get migrated to read Player.DEFAULTS directly in a
    // future commit; this is the no-behavior-change bridge.
    get PLAYER_INITIAL_MAX_MP()       { return Player.DEFAULTS.maxMp; },
    get PLAYER_INITIAL_MAX_HP()       { return Player.DEFAULTS.maxHp; },
    get PLAYER_INITIAL_GP()           { return Player.DEFAULTS.gp; },
    get PLAYER_UNARMED_BASE_DMG()     { return Player.DEFAULTS.baseDmg; },
    get PLAYER_INITIAL_MELEE_BONUS()  { return Player.DEFAULTS.meleeDmgBonus; },
    get PLAYER_INITIAL_RANGED_BONUS() { return Player.DEFAULTS.rangedDmgBonus; },
    get PLAYER_INITIAL_SPELL_BONUS()  { return Player.DEFAULTS.spellDmgBonus; },
    get PLAYER_INITIAL_HIT_RATE()     { return Player.DEFAULTS.hitRate; },
    get PLAYER_INITIAL_CRIT_RATE()    { return Player.DEFAULTS.critRate; },
    get PLAYER_INITIAL_DODGE_RATE()   { return Player.DEFAULTS.dodgeRate; },
    DIZZY_TURNS: 15,
    FREEZE_TURNS: 40,
    RESPEC_BASE_COST: 100,
    STEAL_CHANCE: 0.2
  };

  // Canvas references and tile‑size configuration.
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const TILE_SIZE = 32;
  // Set canvas dimensions to match viewport size immediately
  const _root = document.documentElement;
  canvas.width = Math.max(1, Math.floor((window.visualViewport && window.visualViewport.width) || _root.clientWidth || window.innerWidth || 1));
  canvas.height = Math.max(1, Math.floor((window.visualViewport && window.visualViewport.height) || _root.clientHeight || window.innerHeight || 1));
  let VIEW_COLS = Math.ceil(canvas.width / TILE_SIZE);
  let VIEW_ROWS = Math.ceil(canvas.height / TILE_SIZE);
  console.log(`state.js init: canvas=${canvas.width}x${canvas.height}, VIEW_COLS=${VIEW_COLS}, VIEW_ROWS=${VIEW_ROWS}`); 
  
  // Tile ID mapping. Each numeric ID corresponds to a specific terrain or object type.
  const TILES = { 
    WALL: 1, FLOOR: 2, STAIR_DOWN: 3, STAIR_UP: 4, CHEST: 5, STORE: 6, WATER: 7, LEFTYS: 8, BOOKSTORE: 9,
    TREE: 10, BUSH: 11, ROCK: 12, SAND: 13, DEEP_WATER: 14, GRASS: 15, MOAT: 16, BRIDGE: 17, 
    ANTIQUE_SHOP: 18, STANS_SHOP: 19, SCUMM_BAR: 20, WILLOW: 21, NEST: 22, PIT: 23, BOULDER: 24, TIGHTROPE: 25,
    ARCADE: 26, BOAT: 27, HUT: 28, CASTLE_DOOR: 29, 
    PORTAL: 30, BLADE: 31, LETTER: 32, FORGE: 33, COW: 34, CHICKEN: 35,
    CHASM: 36, BRIDGE_TILE: 37, // v7.2.0 Monty Python
    SECRET_WALL: 38, // v7.2.4 — hidden passage (slightly offcolor wall)
    HALL: 39,        // v7.2.4 — Hall of Champions
    MACHINE: 40,     // v7.2.6 — Atlantean bead machine (Fate of Atlantis)
    OPEN_GATE: 41,   // v7.2.7 — Open gate on outdoor map edge (outworld transitions)
    BG_SCENE: 42     // v7.2.7 — Background-art scene tile (walkable, no tile sprite drawn)
  };

  // #4 FIX: Update isTileFloor to include OPEN_GATE
  function isTileFloor(tile) {
    return tile === TILES.FLOOR || tile === TILES.GRASS || tile === TILES.SAND ||
           tile === TILES.BRIDGE || tile === TILES.BUSH || tile === TILES.OPEN_GATE;
  }

  // (TALENT_TREES removed — the previous placeholder list is gone in
  //  preparation for a new talents model. Code that read player.talents
  //  has been stripped across engine.js / shop.js / map.js / input.js /
  //  ui_logic.js. The Talents tab in the Stats modal exists as an empty
  //  placeholder until the new model lands.)

  // Global game‑state variables. These are updated as the game progresses.
  let currentLevel = 1, mapW = 0, mapH = 0;
  let currentScene = 'dungeon'; 
  let theMap = [], explored = [], visible = [], enemies = [], darkMap = [];
  let isDead = false, dropMode = false, isIdentifying = false, damageTint = 0;
  let lightTurns = 0, lastMoveTime = 0;
  let floatingTexts = []; 
  let questTimer = { active: false, time: 0, label: "", callback: null }; 
  let levelCache = {}; 
  const logInfo = { count: 0 };
  // inventory, inventory, player, setPlayerDefaults, changeGold, PlayerSprites
  // → moved to src/player.js (K5 refactor)
  const assets = { sprites: {}, sounds: {}, minigames: {}, movies: {} };
  window.assets = assets; // Make assets globally accessible for video/image loading
  let activeEffects = []; 
  let useSprites = false; 
  let debugFlags = { revealMap: false, fullLight: false, godMode: false, noRegen: false, noEncryption: false };
  window.debugFlags = debugFlags;
  let stolenItems = [];
  
  // === Achievements System ===
  // === Achievements System (Classic WoW inspired) ===
  // Categories: General, Exploration, Combat, Quests, Social, Easter Eggs
  const ACHIEVEMENT_DEFS = [
    // --- General ---
    { id: 'first_blood',    name: 'First Blood',          cat: 'General', desc: 'Kill your first monster',          icon: '🩸', points: 10 },
    { id: 'level_5',        name: 'Apprentice',            cat: 'General', desc: 'Reach character level 5',         icon: '⭐', points: 10 },
    { id: 'level_10',       name: 'Journeyman',            cat: 'General', desc: 'Reach character level 10',        icon: '🌟', points: 20 },
    { id: 'level_15',       name: 'Master Adventurer',     cat: 'General', desc: 'Reach character level 15',        icon: '👑', points: 30 },
    { id: 'starving',       name: 'Hangry Adventurer',     cat: 'General', desc: 'Reach 100% hunger',               icon: '🍖', points: 10 },
    { id: 'resurrected',    name: 'Woke Up in the Morning',cat: 'General', desc: 'Use a Resurrection Crystal',      icon: '💎', points: 20 },
    // --- Exploration ---
    { id: 'floor_3',        name: 'Getting Started',       cat: 'Exploration', desc: 'Reach Dungeon Floor 3',     icon: '⬇️', points: 10 },
    { id: 'floor_5',        name: 'Deep Explorer',         cat: 'Exploration', desc: 'Reach Dungeon Floor 5',     icon: '🏚️', points: 10 },
    { id: 'floor_10',       name: 'Cave Dweller',          cat: 'Exploration', desc: 'Reach Dungeon Floor 10',    icon: '🏚️', points: 20 },
    { id: 'floor_15',       name: 'Castle Conqueror',      cat: 'Exploration', desc: 'Reach the Castle Floor',    icon: '🏰', points: 30 },
    { id: 'town_portal',    name: 'There and Back Again',  cat: 'Exploration', desc: 'Use a Town Portal Scroll',  icon: '🌀', points: 10 },
    { id: 'listen',         name: 'Eavesdropper',          cat: 'Exploration', desc: 'Use the Listen command 5 times', icon: '👂', points: 10 },
    // --- Combat ---
    { id: 'kill_10',        name: 'Slaughterer',           cat: 'Combat', desc: 'Kill 10 monsters',                icon: '💀', points: 10 },
    { id: 'kill_50',        name: 'Exterminator',          cat: 'Combat', desc: 'Kill 50 monsters',                icon: '☠️', points: 20 },
    { id: 'kill_100',       name: 'Dungeon Cleaner',       cat: 'Combat', desc: 'Kill 100 monsters',               icon: '☠️', points: 30 },
    { id: 'dragon_slayer',  name: 'Dragon Slayer',         cat: 'Combat', desc: 'Slay a dragon',                   icon: '🐉', points: 30 },
    { id: 'grue_slayer',    name: 'Not Afraid of the Dark',cat: 'Combat', desc: 'Defeat a Grue',                   icon: '🔦', points: 50 },
    { id: 'rabbit_killer',  name: 'Run Away!',             cat: 'Combat', desc: 'Kill the Killer Rabbit',          icon: '🐰', points: 30 },
    // --- Quests ---
    { id: 'bridge_of_death',name: 'Bridge Keeper Bypass',  cat: 'Quests', desc: 'Survive the Bridge of Death',     icon: '🧙', points: 30 },
    { id: 'convention',     name: 'Peasants Unite',        cat: 'Quests', desc: 'Get the Constitutional Convention', icon: '📜', points: 20 },
    { id: 'eagle_eye',      name: 'Eagle Eye',             cat: 'Quests', desc: 'Feed the starving eagle',         icon: '🦅', points: 20 },
    { id: 'holy_hand',      name: 'Holy Hand Grenade',     cat: 'Quests', desc: 'Find the Holy Hand Grenade',      icon: '💣', points: 30 },
    { id: 'clavicus',       name: 'Devil\'s Bargain',      cat: 'Quests', desc: 'Deal with Clavicus Vile',         icon: '👺', points: 20 },
    // --- Social ---
    { id: 'shopper',        name: 'Shopaholic',            cat: 'Social', desc: 'Visit Apu more than 3 times',     icon: '🛒', points: 10 },
    { id: 'prophet',        name: 'Stay Awhile and Listen', cat: 'Social', desc: 'Get items identified by Cain', icon: '🧔', points: 10 },
    { id: 'safe_casanova',  name: 'Safe Casanova',         cat: 'Social', desc: 'Survive the Mystery Lady encounter', icon: '💃', points: 20 },
    { id: 'dave_encounter', name: 'Who\'s Dave?',          cat: 'Social', desc: 'Meet Cousin Dave',                icon: '👨', points: 20 },
    { id: 'grue_wisdom',    name: 'Well Informed',         cat: 'Social', desc: 'Learn everything about Grues',    icon: '📖', points: 15 },
    // --- Easter Eggs ---
    { id: 'pervert',        name: 'Pervert!',              cat: 'Easter Eggs', desc: 'Complete the prophylactic quest', icon: '🧴', points: 30 },
    { id: 'world_domination',name: 'Pinky and the Brain', cat: 'Easter Eggs', desc: 'Find the Plans for World Domination', icon: '📋', points: 50 },
    { id: 'vermin_slayer',  name: 'Dungeon Pest Control',  cat: 'Easter Eggs', desc: 'Kill 10 vermin',            icon: '🐭', points: 15 },
    { id: 'bookworm',       name: 'Bookworm',              cat: 'Easter Eggs', desc: 'Buy a spellbook from the Wizard', icon: '📖', points: 10 },
    { id: 'pirate_insult',  name: 'Pirate Insulter',       cat: 'Quests', desc: 'Win a Battle of Wits against a pirate', icon: '🏴‍☠️', points: 20 },
    { id: 'insult_master',  name: 'Insult Master',         cat: 'Quests', desc: 'Learn all pirate insults', icon: '📚', points: 30 },
    { id: 'swordmaster_defeated', name: 'Swordmaster Slayer', cat: 'Quests', desc: 'Defeat the Swordmaster in insult combat', icon: '🤺', points: 40 },
    { id: 'pirate_grog',    name: 'Pirate Grog',           cat: 'Quests', desc: 'Drink 3 grogs at the SCUMM Bar', icon: '🍺', points: 15 },
    { id: 'safe_cranked',   name: 'Safe Cracker',          cat: 'Quests', desc: 'Complete the safe cracking quest', icon: '🏺', points: 25 },
    { id: 'astrochicken',   name: 'Astrochicken Champion', cat: 'Easter Eggs', desc: 'Launch Astrochicken into orbit', icon: '🐔', points: 30 },
    { id: 'caustic_grog',   name: 'Caustic Brewer',        cat: 'Quests', desc: 'Create the legendary Caustic Grog', icon: '🍺', points: 30 },
    { id: 'naked_public',   name: 'Au Naturel',            cat: 'Easter Eggs', desc: 'Unequip all clothing in public', icon: '🫣', points: 20 },
    { id: 'granny_weatherwax', name: 'Headology Expert',   cat: 'Easter Eggs', desc: 'Receive wisdom from Granny Weatherwax', icon: '👵', points: 25 },
    { id: 'gurgi_fed',      name: 'Munchings & Crunchings', cat: 'Quests', desc: 'Feed Gurgi to befriend him', icon: '🐵', points: 20 },
    { id: 'gurgi_sacrifice', name: 'Gurgi\'s Sacrifice',   cat: 'Quests', desc: 'Witness Gurgi\'s noble sacrifice', icon: '💔', points: 40 },
    { id: 'castle_rat_captured', name: 'Prisoner of the Horned King', cat: 'Quests', desc: 'Captured by the Castle Rat', icon: '🐀', points: 15 },
    { id: 'mouse_rescue',   name: 'Rescued by Mice',       cat: 'Quests', desc: 'Rescued by mice from the dungeon cell', icon: '🐭', points: 25 },
    { id: 'morva_trill',    name: 'Witch\'s Trill',        cat: 'Easter Eggs', desc: 'Endure the Morva witches\' trilling', icon: '🧙‍♀️', points: 20 },
    { id: 'horned_king_defeated', name: 'Defeater of the Horned King', cat: 'Quests', desc: 'Defeat the Horned King', icon: '💀', points: 50 },
    { id: 'duck_hunter',    name: 'Duck Hunter',           cat: 'Combat', desc: 'Kill 5 ducks in flooded chambers', icon: '🦆', points: 15 },
    { id: 'shark_survivor', name: 'Shark Survivor',        cat: 'Combat', desc: 'Survive an encounter with a dungeon shark', icon: '🦈', points: 25 },
    { id: 'thief_hideout',  name: 'Thief\'s Bane',         cat: 'Quests', desc: 'Discover and loot the thief hideout', icon: '👤', points: 30 },
    { id: 'neros_polka',    name: "Nero's Polka",         cat: 'Easter Eggs', desc: 'Survive playing an accordion in combat', icon: '🪗', points: 20 },
    // Milestone achievements (auto-awarded)
    { id: 'champion',       name: 'Champion',              cat: 'Milestones', desc: 'Earn 20 achievements — Hall of Champions opens!', icon: '👑', points: 50 },
    { id: 'legend',         name: 'Living Legend',         cat: 'Milestones', desc: 'Earn 25 achievements',             icon: '⭐', points: 100 },
    { id: 'mythic',         name: 'Mythic Champion',       cat: 'Milestones', desc: 'Earn 30 achievements',             icon: '💫', points: 200 },
  ];

  // Achievement categories (for display)
  const ACHIEVEMENT_CATS = ['General', 'Exploration', 'Combat', 'Quests', 'Social', 'Easter Eggs', 'Milestones'];

  let achievements = {}; // id -> true when earned
  let achievementPoints = 0;

  window.awardAchievement = (id) => {
    if(achievements[id]) return;
    achievements[id] = true;
    // Bug 39: Also award via QuestEngine so QuestEngine._achievements stays in sync
    if(typeof QuestEngine !== 'undefined' && QuestEngine.award) {
      try { QuestEngine.award(id); } catch(e) { /* ignore if not supported */ }
    }
    let def = ACHIEVEMENT_DEFS.find(a => a.id === id);
    if(def) {
      achievementPoints += (def.points ?? 10);
      logMsg(`<span style="color:#FFD700">🏆 ACHIEVEMENT UNLOCKED: ${def.icon} ${def.name}! (+${def.points ?? 10}pts)</span>`);
    }
    // Milestone checks — invite to Hall of Champions
    let count = Object.keys(achievements).length;
    if(count >= 20 && !achievements['champion']) {
      achievements['champion'] = true;
      achievementPoints += 50;
      logMsg(`<span style="color:#FFD700">🏆👑 ACHIEVEMENT UNLOCKED: 👑 Champion! (${count} achievements earned!)</span>`);
      logMsg(`<span style="color:var(--primary)">The Hall of Champions in Tristram is now open to you!</span>`);
    }
    if(count >= 25 && !achievements['legend']) {
      achievements['legend'] = true;
      achievementPoints += 100;
      logMsg(`<span style="color:#FFD700">🏆⭐ ACHIEVEMENT UNLOCKED: ⭐ Living Legend! (${count} achievements!)</span>`);
    }
    if(count >= 30 && !achievements['mythic']) {
      achievements['mythic'] = true;
      achievementPoints += 200;
      logMsg(`<span style="color:#FFD700">🏆💫 ACHIEVEMENT UNLOCKED: 💫 Mythic Champion! (${count} achievements!)</span>`);
    }
  }; 

  // Monster definitions – stats and abilities for every enemy type.
  const MONSTER_DEF = {
    "chipmunk": { icon: '🐿️', hp: 10, dmg: 3, hit: 0.5, crit: 0.05, dodge: 0.0, speed: 0.34, throughWalls: false },
    "slime":    { icon: '🫧', hp: 8, dmg: 2, hit: 0.4, crit: 0.0, dodge: 0.0, speed: 0.2, throughWalls: false },
    "bat":      { icon: '🦇', hp: 6, dmg: 2, hit: 0.4, crit: 0.05, dodge: 0.05, speed: 0.8, throughWalls: false },
    "skeleton": { icon: '💀', hp: 20, dmg: 8, hit: 0.5, crit: 0.1, dodge: 0.05, speed: 0.4, throughWalls: false },
    "ghost":    { icon: '👻', hp: 15, dmg: 8, hit: 0.4, crit: 0.20, dodge: 0.1, speed: 0.50, throughWalls: true },
    "robot":    { icon: '🤖', hp: 40, dmg: 12, hit: 0.6, crit: 0.15, dodge: 0.0, speed: 1.00, throughWalls: false },
    "thief":    { icon: '👤', hp: 40, dmg: 2, hit: 0.9, crit: 0.0, dodge: 0.2, speed: 1.2, throughWalls: false, quest: true },
    "fence":    { icon: '🧥', hp: 100, dmg: 5, hit: 0.5, crit: 0.0, dodge: 0.1, speed: 0.0, throughWalls: false, quest: true },
    "cain":     { icon: '🧔', hp: 999, dmg: 0, hit: 0.0, crit: 0.0, dodge: 0.0, speed: 0.0, throughWalls: false, quest: true },
    "dragon":   { icon: '🐉', hp: 150, dmg: 30, hit: 0.6, crit: 0.2, dodge: 0.2, speed: 0.5, throughWalls: false, renderScale: 1.8 },
    "snake":    { icon: '🐍', hp: 15, dmg: 4, hit: 0.5, crit: 0.10, dodge: 0.0, speed: 0.50, throughWalls: false, effect: 'dizzy', effectChance: 0.05 },
    "troll":    { icon: '🧌', hp: 60, dmg: 15, hit: 0.4, crit: 0.05, dodge: 0.0, speed: 0.25, throughWalls: false, effect: 'dizzy', effectChance: 0.05, renderScale: 1.55 },
    "medusa":   { icon: '🐍👩', hp: 45, dmg: 8, hit: 0.5, crit: 0.10, dodge: 0.2, speed: 0.40, throughWalls: false, effect: 'freeze', effectChance: 0.10 },
    "pirate":   { icon: '🏴‍☠️', hp: 30, dmg: 10, hit: 0.5, crit: 0.10, dodge: 0.25, speed: 0.50, throughWalls: false, quest: true },
    "master":   { icon: '🤺', hp: 120, dmg: 20, hit: 0.7, crit: 0.20, dodge: 0.3, speed: 0.80, throughWalls: false, isBoss: true, quest: true, renderScale: 1.8 },
    "cat":      { icon: '🐈', hp: 20, dmg: 5, hit: 0.5, crit: 0.1, dodge: 0.1, speed: 0.6, throughWalls: false, quest: true },
    "genie":    { icon: '🧞', hp: 999, dmg: 50, hit: 0.8, crit: 0.5, dodge: 0.35, speed: 1.0, throughWalls: true, isBoss: true, quest: true, renderScale: 4.0 },
    "king":     { icon: '🤴', hp: 60, dmg: 5, hit: 0.5, crit: 0.05, dodge: 0.2, speed: 0.4, rare: true },
    "eagle":    { icon: '🦅', hp: 50, dmg: 10, hit: 0.8, crit: 0.1, dodge: 0.1, speed: 1.0, throughWalls: false, quest: true },
    "gurgi":    { icon: '🐵', hp: 30, dmg: 2, hit: 0.4, crit: 0.0, dodge: 0.15, speed: 0.5, throughWalls: false, quest: true },
    "erasmus":  { icon: '🧙‍♂️', hp: 999, dmg: 0, hit: 1.0, crit: 0.0, dodge: 1.0, speed: 1.0, throughWalls: false, quest: true },
    "cow":      { icon: '🐄', hp: 50, dmg: 0, hit: 0.0, crit: 0.0, dodge: 0.0, speed: 0.0, throughWalls: false, quest: true, renderScale: 2.0 },
    // Black Cauldron characters
    "castle_rat": { icon: '🐀', hp: 25, dmg: 8, hit: 0.6, crit: 0.1, dodge: 0.0, speed: 0.8, throughWalls: false, quest: true },
    "horned_king": { icon: '💀', hp: 300, dmg: 30, hit: 0.7, crit: 0.2, dodge: 0.1, speed: 0.4, throughWalls: false, isBoss: true, quest: true, renderScale: 1.85 },
    "cauldron_born": { icon: '🧟', hp: 80, dmg: 15, hit: 0.6, crit: 0.1, dodge: 0.0, speed: 0.3, throughWalls: false, quest: true },
    "morva_witch": { icon: '🧙‍♀️', hp: 100, dmg: 10, hit: 0.8, crit: 0.3, dodge: 0.2, speed: 0.5, throughWalls: false, quest: true },
    "assassin": { icon: '🥷', hp: 80, dmg: 20, hit: 0.9, crit: 0.3, dodge: 0.25, speed: 1.2, throughWalls: false },
    "rosencrantz_guildenstern": { icon: '👬', hp: 999, dmg: 0, hit: 0.0, crit: 0.0, dodge: 0.0, speed: 0.5, throughWalls: false, quest: true, passive: true },
    "black_knight": { icon: '🤺', hp: 200, dmg: 15, hit: 0.6, crit: 0.1, dodge: 0.0, speed: 0.5, isBoss: true, quest: true, renderScale: 1.8 },
    "killer_rabbit": { icon: '🐰', hp: 10, dmg: 999, hit: 1.0, crit: 1.0, dodge: 0.9, speed: 1.5, throughWalls: true },
    "french_taunter": { icon: '🏰🇫🇷', hp: 999, dmg: 0, hit: 0.0, crit: 0.0, dodge: 1.0, speed: 0.0, quest: true },
    "dennis": { icon: '👨‍🌾', hp: 30, dmg: 2, hit: 0.5, crit: 0.0, dodge: 0.1, speed: 0.0, quest: true },
    "bridge_keeper": { icon: '🧙‍♂️', hp: 999, dmg: 0, hit: 1.0, crit: 0.0, dodge: 1.0, speed: 0.0, quest: true },
    // Vermin - found near Apu stores
    "mouse": { icon: '🐁', hp: 3, dmg: 0, hit: 0.0, crit: 0.0, dodge: 0.05, speed: 1.5, throughWalls: false, passive: true, renderScale: 0.62 },
    "pig":   { icon: '🐷', hp: 30, dmg: 0, hit: 0.0, crit: 0.0, dodge: 0.0, speed: 0.0, throughWalls: false, quest: true, renderScale: 2.0 },
    "cockroach": { icon: '🪳', hp: 1, dmg: 0, hit: 0.0, crit: 0.0, dodge: 0.1, speed: 0.8, throughWalls: false, passive: true, effect: 'disease', effectChance: 0.3, renderScale: 0.54 },
    // #14: Mimic — looks like a chest until opened, then attacks with gold coins
    "mimic":    { icon: '📦', hp: 40, dmg: 8, hit: 0.6, crit: 0.1, dodge: 0.3, speed: 0.4, throughWalls: false, passive: false, isMimic: true, renderScale: 1.0 },
    // Aquatic creatures - spawn in flooded dungeon chambers
    "duck": { icon: '🦆', hp: 8, dmg: 2, hit: 0.4, crit: 0.05, dodge: 0.0, speed: 0.40, throughWalls: false },
    "wet_rat": { icon: '🐀', hp: 15, dmg: 4, hit: 0.5, crit: 0.1, dodge: 0.05, speed: 0.6, throughWalls: false, effect: 'disease', effectChance: 0.2 },
    "shark": { icon: '🦈', hp: 80, dmg: 25, hit: 0.6, crit: 0.20, dodge: 0.1, speed: 0.80, throughWalls: false, stalks: true, aggro: 6 },
    // Outdoor random-encounter animals (E20)
    "hedgehog": { icon:'🦔', name:'Hedgehog', type:'animal', farmAnimal:true, friendly:true,
      hp:3, maxHp:3, dmg:1, hit:0.3, crit:0.0, dodge:0.05, speed:0.8, throughWalls:false,
      renderScale:0.5, loot:[{icon:'🔱',chance:0.4},{icon:'💩',chance:0.2}], noGold:true },
    "bunny": { icon:'🐇', name:'Bunny', type:'animal', farmAnimal:true, friendly:true,
      hp:2, maxHp:2, dmg:0, hit:0.0, crit:0.0, dodge:0.15, speed:1.8, throughWalls:false,
      renderScale:0.5, loot:[{icon:'🧤',chance:0.3},{icon:'🥕',chance:0.4},{icon:'💩',chance:0.15}], noGold:true },
    "turkey": { icon:'🦃', name:'Turkey', type:'animal', farmAnimal:true, friendly:true,
      hp:5, maxHp:5, dmg:2, hit:0.4, crit:0.0, dodge:0.0, speed:0.7, throughWalls:false,
      renderScale:0.5, loot:[{icon:'🍗',chance:0.6},{icon:'💩',chance:0.2},{icon:'🪶',chance:0.3}], noGold:true },
    "goose": { icon:'🪿', name:'Goose', type:'animal', farmAnimal:true, friendly:true,
      hp:6, maxHp:6, dmg:3, hit:0.5, crit:0.0, dodge:0.0, speed:0.9, throughWalls:false,
      renderScale:0.5, loot:[{icon:'🍗',chance:0.5},{icon:'💩',chance:0.2},{icon:'🪶',chance:0.3},{icon:'🥚',chance:0.05}], noGold:true },
     "mosquito": { icon:'🦟', name:'Mosquito', type:'vermin', farmAnimal:false, friendly:false,
       hp:1, maxHp:1, dmg:1, hit:0.7, crit:0.0, dodge:0.3, speed:2.0, throughWalls:false,
       renderScale:0.25, loot:[{icon:'🩸',chance:0.9}], noGold:true },
     // E20: Additional random encounter animals
     "buffalo": { icon:'🐃', name:'Buffalo', type:'animal', farmAnimal:true, friendly:true,
       hp:15, maxHp:15, dmg:4, hit:0.4, crit:0.0, dodge:0.0, speed:0.5, throughWalls:false,
       renderScale:2.0, loot:[{icon:'🧤',chance:0.4},{icon:'🥩',chance:0.5},{icon:'💩',chance:0.15}], noGold:true },
     "skunk": { icon:'🦨', name:'Skunk', type:'animal', farmAnimal:true, friendly:true,
       hp:3, maxHp:3, dmg:1, hit:0.3, crit:0.0, dodge:0.1, speed:1.0, throughWalls:false,
       renderScale:0.5, loot:[{icon:'💩',chance:0.5},{icon:'🌿',chance:0.3}], noGold:true },
     "beaver": { icon:'🦫', name:'Beaver', type:'animal', farmAnimal:true, friendly:true,
       hp:6, maxHp:6, dmg:2, hit:0.4, crit:0.0, dodge:0.05, speed:0.7, throughWalls:false,
       renderScale:0.75, loot:[{icon:'🧤',chance:0.3},{icon:'🪵',chance:0.4},{icon:'💩',chance:0.15}], noGold:true },
     "turtle": { icon:'🐢', name:'Turtle', type:'animal', farmAnimal:true, friendly:true,
       hp:8, maxHp:8, dmg:1, hit:0.3, crit:0.0, dodge:0.2, speed:0.3, throughWalls:false,
       renderScale:0.75, loot:[{icon:'🐚',chance:0.3},{icon:'💩',chance:0.3},{icon:'🧾',chance:0.02}], noGold:true },
     "blackbird": { icon:'🐦‍⬛', name:'Blackbird', type:'animal', farmAnimal:true, friendly:true,
       hp:2, maxHp:2, dmg:0, hit:0.2, crit:0.0, dodge:0.2, speed:1.5, throughWalls:false,
       renderScale:0.5, loot:[{icon:'🪶',chance:0.4},{icon:'💩',chance:0.3},{icon:'💰',chance:0.05,qty:1}], noGold:false },
     "owl": { icon:'🦉', name:'Owl', type:'animal', farmAnimal:true, friendly:true,
       hp:3, maxHp:3, dmg:1, hit:0.5, crit:0.1, dodge:0.15, speed:1.2, throughWalls:false,
       renderScale:0.5, loot:[{icon:'🪶',chance:0.4},{icon:'👓',chance:0.05},{icon:'💰',chance:0.05,qty:1}], noGold:false },
     "fly": { icon:'🪰', name:'Fly', type:'vermin', farmAnimal:false, friendly:false,
       hp:1, maxHp:1, dmg:0, hit:0.1, crit:0.0, dodge:0.5, speed:2.5, throughWalls:false,
       renderScale:0.25, loot:[], noGold:true },
     "ladybug": { icon:'🐞', name:'Ladybug', type:'vermin', farmAnimal:false, friendly:true,
       hp:1, maxHp:1, dmg:0, hit:0.1, crit:0.0, dodge:0.4, speed:1.0, throughWalls:false,
       renderScale:0.25, loot:[{icon:'👙',chance:0.01}], noGold:true },
     // E20: Additional random encounter animals
     "buffalo": { icon:'🐃', name:'Buffalo', type:'animal', farmAnimal:true, friendly:true,
       hp:15, maxHp:15, dmg:4, hit:0.4, crit:0.0, dodge:0.0, speed:0.5, throughWalls:false,
       renderScale:2.0, loot:[{icon:'🧤',chance:0.4},{icon:'🥩',chance:0.5},{icon:'💩',chance:0.15}], noGold:true },
     "skunk": { icon:'🦨', name:'Skunk', type:'animal', farmAnimal:true, friendly:true,
       hp:3, maxHp:3, dmg:1, hit:0.3, crit:0.0, dodge:0.1, speed:1.0, throughWalls:false,
       renderScale:0.5, loot:[{icon:'💩',chance:0.5},{icon:'🌿',chance:0.3}], noGold:true },
     "beaver": { icon:'🦫', name:'Beaver', type:'animal', farmAnimal:true, friendly:true,
       hp:6, maxHp:6, dmg:2, hit:0.4, crit:0.0, dodge:0.05, speed:0.7, throughWalls:false,
       renderScale:0.75, loot:[{icon:'🧤',chance:0.3},{icon:'🪵',chance:0.4},{icon:'💩',chance:0.15}], noGold:true },
     "turtle": { icon:'🐢', name:'Turtle', type:'animal', farmAnimal:true, friendly:true,
       hp:8, maxHp:8, dmg:1, hit:0.3, crit:0.0, dodge:0.2, speed:0.3, throughWalls:false,
       renderScale:0.75, loot:[{icon:'🐚',chance:0.3},{icon:'💩',chance:0.3},{icon:'🧾',chance:0.02}], noGold:true },
     "blackbird": { icon:'🐦‍⬛', name:'Blackbird', type:'animal', farmAnimal:true, friendly:true,
       hp:2, maxHp:2, dmg:0, hit:0.2, crit:0.0, dodge:0.2, speed:1.5, throughWalls:false,
       renderScale:0.5, loot:[{icon:'🪶',chance:0.4},{icon:'💩',chance:0.3},{icon:'💰',chance:0.05,qty:1}], noGold:false },
     "owl": { icon:'🦉', name:'Owl', type:'animal', farmAnimal:true, friendly:true,
       hp:3, maxHp:3, dmg:1, hit:0.5, crit:0.1, dodge:0.15, speed:1.2, throughWalls:false,
       renderScale:0.5, loot:[{icon:'🪶',chance:0.4},{icon:'👓',chance:0.05},{icon:'💰',chance:0.05,qty:1}], noGold:false },
     "fly": { icon:'🪰', name:'Fly', type:'vermin', farmAnimal:false, friendly:false,
       hp:1, maxHp:1, dmg:0, hit:0.1, crit:0.0, dodge:0.5, speed:2.5, throughWalls:false,
       renderScale:0.25, loot:[], noGold:true },
     "ladybug": { icon:'🐞', name:'Ladybug', type:'vermin', farmAnimal:false, friendly:true,
       hp:1, maxHp:1, dmg:0, hit:0.1, crit:0.0, dodge:0.4, speed:1.0, throughWalls:false,
       renderScale:0.25, loot:[{icon:'👙',chance:0.01}], noGold:true },
    // Bosses
    "ifrit": { icon: '🔥', hp: 300, dmg: 25, hit: 0.8, crit: 0.2, dodge: 0.1, speed: 0.6, throughWalls: false, isBoss: true, isBig: true, renderScale: 2 },
    // NPCs
    "chaplain": { icon: '⛪', hp: 999, dmg: 0, hit: 0.0, crit: 0.0, dodge: 0.0, speed: 0.0, quest: true, passive: true },
    // Dark chamber creatures
    "grue": { icon: '👁️', hp: 50, dmg: 20, hit: 0.7, crit: 0.3, dodge: 0.5, speed: 0.6, throughWalls: false, effect: 'freeze', effectChance: 0.15 },
    "orc": { icon: '🧌', hp: 40, dmg: 10, hit: 0.5, crit: 0.1, dodge: 0.1, speed: 0.4, throughWalls: false, renderScale: 1.45 },
    "pacifist_orc": { icon: '🧌', hp: 999, dmg: 0, hit: 0.0, crit: 0.0, dodge: 0.0, speed: 0.0, throughWalls: false, quest: true, passive: true, renderScale: 1.45 },
    "blacksmith": {
      emoji: '🧑‍🔧', icon: '🧑‍🔧', name: 'Griswold the Blacksmith', type: 'npc', friendly: true,
      hp: 999, maxHp: 999, dmg: 0, hit: 0.0, crit: 0.0, dodge: 0.0, speed: 0.0, throughWalls: false,
      quest: true, passive: true,
      dialog: [
        "Ah, an adventurer! What can I craft for you today?",
        "These dungeons keep me busy — lots of broken equipment coming back up.",
        "I've been smithing for thirty years. Never seen monsters THIS bad.",
        "Need anything repaired? I charge fair rates... for a blacksmith.",
        "That sword's looking a bit worn. Bring me the materials and I'll fix it right up."
      ],
      voice: 'voice_blacksmith',
      voiceId: 'Q4oILuo4P8VeXtE6FMLI',
      blocking: false
    },
    // E.TRIST.MENDED_DRUM: Discworld bar characters
    "mended_drum_barman": {
      emoji: '🧔', icon: '🧔', name: 'Nobby Nobbs (Barman)', type: 'npc', friendly: true,
      hp: 999, maxHp: 999, dmg: 0, hit: 0, crit: 0, dodge: 0, speed: 0, throughWalls: false,
      quest: true, passive: true, blocking: false,
      dialog: [
        "What'll it be? Scumble? Made from apples. Well. Mainly apples.",
        "No fighting in the Drum. Unless you pay the breakage deposit.",
        "We had a wizard in here once. He turned into a toad. Nobody noticed for three days.",
        "Sign says 'No Assassins'. Asterisk says 'By appointment only'.",
        "The rats pay rent. Better tenants than some I could name."
      ]
    },
    "cohen": {
      emoji: '👴', icon: '👴', name: 'Cohen the Barbarian', type: 'npc', friendly: true,
      hp: 999, maxHp: 999, dmg: 50, hit: 0.99, crit: 0.5, dodge: 0.8, speed: 0.3, throughWalls: false,
      quest: true, passive: true, blocking: false,
      dialog: [
        "I've been pillaging since before your grandfather was a twinkle. Still going.",
        "The secret to longevity? Kill everything that tries to kill you first.",
        "I've sacked Ankh-Morpork seven times. Nice place. Comes up lovely after a good sacking.",
        "My teeth are in a jar. But my sword arm's fine.",
        "Young people today. Always complaining. In my day we complained WHILE being stabbed."
      ]
    },
    "librarian": {
      emoji: '🦧', icon: '🦧', name: 'The Librarian', type: 'npc', friendly: true,
      hp: 999, maxHp: 999, dmg: 10, hit: 0.5, crit: 0.1, dodge: 0.1, speed: 0, throughWalls: false,
      quest: true, passive: true, blocking: false,
      dialog: ["Ook.", "Ook.", "Eek.", "Ook ook.", "Ook?"]
    },
    "vimes": {
      emoji: '👮', icon: '👮', name: 'Commander Vimes', type: 'npc', friendly: true,
      hp: 999, maxHp: 999, dmg: 0, hit: 0, crit: 0, dodge: 0, speed: 0, throughWalls: false,
      quest: true, passive: true, blocking: false,
      dialog: [
        "I have seventeen forms to fill out when someone gets stabbed in this city. Seventeen.",
        "The thing about being a copper is everyone lies to you. Especially the honest ones.",
        "I'm off duty. Which means I'm still on duty. I'm always on duty.",
        "Ankh-Morpork has a motto: Quanti Canicula Ille In Fenestra. Don't ask.",
        "I used to drink to forget. Now I drink because I can't forget. Subtle difference."
      ]
    },
    "bearded_dwarf": {
      emoji: '🧔‍♀️', icon: '🧔‍♀️', name: 'Dorimunde Ironchin', type: 'npc', friendly: true,
      hp: 999, maxHp: 999, dmg: 0, hit: 0, crit: 0, dodge: 0, speed: 0.5, throughWalls: false,
      quest: true, passive: true, blocking: false,
      dialog: [
        "Excuse me, do you know where The Dirty Rat is? I was told it was near the canal.",
        "I've been looking for The Dirty Rat for three days. Very important dwarf business.",
        "The Dirty Rat has the best gravel pasties outside of Überwald, apparently.",
        "I am NOT lost. I am directionally flexible. Completely different thing."
      ]
    },
    // E.TRIST.4: Dennis's Wife — patrols in front of Dennis's Hut
    "dennis_wife": {
      emoji: '🤰', icon: '🤰', name: "Dennis's Wife", type: 'npc', friendly: true,
      hp: 999, maxHp: 999, dmg: 0, hit: 0.0, crit: 0.0, dodge: 0.0, speed: 0.6, throughWalls: false,
      quest: true, passive: true,
      dialog: ["..."],
      blocking: false
    },
    // E.TRIST.4: Sheep that follows Dennis's Wife
    "sheep": {
      emoji: '🐑', icon: '🐑', name: 'Sheep', type: 'animal', friendly: false, farmAnimal: true,
      hp: 5, maxHp: 5, dmg: 0, hit: 0.0, crit: 0.0, dodge: 0.0, speed: 0.5, throughWalls: false,
      passive: false, fleePlayer: true, noGold: true,
      loot: [{icon: '🥩', qty: 1, chance: 0.5}]
    },
    // E.TRIST.5: Muck peasant — wanders fields collecting muck
    "muck_peasant": {
      emoji: '🧑‍🌾', icon: '🧑‍🌾', name: 'Muck Peasant', type: 'npc', friendly: true,
      hp: 999, maxHp: 999, dmg: 0, hit: 0.0, crit: 0.0, dodge: 0.0, speed: 0.3, throughWalls: false,
      quest: true, passive: true,
      dialog: [
        "Ooo! There's lovely muck over here!",
        "Can't beat a good bit of muck, I always say.",
        "This muck's proper ripe, this is.",
        "Muck, muck, glorious muck!",
        "Nothing quite like the smell of fresh muck in the morning."
      ],
      voice: 'voice_muck_peasant',
      voiceId: 'EaX6rnyDKjJx35tchi80',
      blocking: false
    },
    // E.TRIST.6: Retired soldier — complains about ailments, tells war stories
    "retired_soldier": {
      emoji: '💂', icon: '💂', name: 'Retired Soldier', type: 'npc', friendly: true,
      hp: 999, maxHp: 999, dmg: 0, hit: 0.0, crit: 0.0, dodge: 0.0, speed: 0.0, throughWalls: false,
      quest: true, passive: true,
      dialog: [
        "My sciatica's acting up something fierce today.",
        "The flubitus is back. Can barely feel me left foot.",
        "I remember the dungeon under the old cathedral ruins... there was this one time... actually, I forget how it ends.",
        "Fought a beast once in the dark. Or was it a very large rat. Anyway, it was terrifying.",
        "Aches and pains, that's all I've got now. Well, that and stories nobody wants to hear."
      ],
      voice: 'voice_retired_soldier',
      voiceId: 'KgUSWQPFmuiZ5ycRbnty',
      blocking: false
    },
    // E.753.LIZARD: Tiny vermin, flees player
    "lizard": {
      emoji: '🦎', icon: '🦎', name: 'Lizard', type: 'vermin',
      hp: 1, maxHp: 1, dmg: 0, hit: 0.0, crit: 0.0, dodge: 0.7, speed: 1.5, throughWalls: false,
      passive: true, friendly: true, noGold: true, renderScale: 0.25,
      loot: [{icon: '🪰', qty: 1, chance: 0.3}]
    },
    // E.753.ZOMBIE: Aggressive undead on floors 1-3
    "zombie": {
      emoji: '🧟‍♂️', icon: '🧟‍♂️', name: 'Zombie', type: 'undead',
      hp: 12, maxHp: 12, dmg: 4, hit: 0.5, crit: 0.0, dodge: 0.0, speed: 0.4, throughWalls: false,
      renderScale: 1.2, aggro: 5,
      loot: [{icon: '💰', qty: 2, chance: 0.3}, {icon: '🥩', qty: 1, chance: 0.1}]
    },
    // E.753.PIXIE: Aggressive forest pest, bee buzzing sound
    "pixie": {
      emoji: '🧚🏻', icon: '🧚🏻', name: 'Pixie', type: 'monster',
      hp: 8, maxHp: 8, dmg: 3, hit: 0.7, crit: 0.1, dodge: 0.5, speed: 1.8, throughWalls: false,
      renderScale: 0.5, aggro: 4,
      voice: 'voice_pixie',
      voiceId: 'z12gfZvqqjJ9oHFbB5i6',
      loot: [
        {icon: '🎇', qty: 1, chance: 0.3}, // magic dust
        {icon: '🔔', qty: 1, chance: 0.2}, // tiny bell
        {icon: '💎', qty: 1, chance: 0.01}  // resurrection crystal (1%)
      ]
    },
    // E15: T-Rex mini-boss
    "trex": {
      icon: '🦖', name: 'T-Rex', type: 'monster',
      hp: 999, maxHp: 999, dmg: 35, hit: 0.85, crit: 0.15, dodge: 0.0,
      speed: 1.4, throughWalls: false, isBoss: true,
      renderScale: 6.0,
      loot: [{icon:'🦴',chance:0.8},{icon:'🍖',chance:0.6},{icon:'💰',chance:0.4}],
      aggroRange: 12,
      bloodSplatter: true,
      minLevel: 8,
      xp: 800,
      desc: "A prehistoric horror. Fast, relentless, and absolutely no dodge whatsoever."
    }
  };

// ─── ITEM DEFINITIONS ─────────────────────────────────────────
  /**
   * LEGACY_ITEM_DATA — Raw item-definition table.
   *
   * Read ONCE at startup by items_registry.js, which constructs the
   * authoritative `ItemDefs` (camelCase-keyed) registry from these
   * entries. All game code reads ItemDefs / ItemDef.byIcon — never
   * touches this table directly. The "LEGACY_" prefix is the visible
   * marker that this is source-data only; entries should eventually
   * migrate into items_registry.js as `new ItemDef({...})` literals,
   * after which this table can be deleted.
   *
   * Entries are grouped alphabetically by `type`, then sorted by `name`
   * within each group. Required fields: name, type, stackable, maxGP.
   * Optional fields vary by type — see examples in each group.
   */
  const LEGACY_ITEM_DATA = {
    // ── AMMO ─────────────────────────────────────────
    "➶": { name: "Arrows", type: "ammo", stackable: true, maxStack: 99, maxGP: 1 },

    // ── ARMOR ────────────────────────────────────────
    "🛡️🌟": { name: "Aegis of Champions", type: "armor", slot: "chest", stackable: false, evadePercent: 30, maxGP: 15000 },
    "👢⚡": { name: "Boots of Blinding Speed", type: "armor", slot: "feet", stackable: false, evadePercent: 50, maxGP: 1000 },
    "🩲": { name: "Briefs", type: "armor", slot: "legs", stackable: false, evadePercent: 0, maxGP: 2 },
    "🧢": { name: "Colander of the Faithful", type: "armor", slot: "head", stackable: false, evadePercent: 0, maxGP: 1 },
    "👑": { name: "Crown of Noodly Appendages", type: "armor", slot: "head", stackable: false, evadePercent: 5, maxGP: 500 },
    "👑🌿": { name: "Crown of Thorns", type: "armor", slot: "head", stackable: false, evadePercent: 5, thornsDmg: 5, maxGP: 10000 },
    "👺": { name: "Masque of Clavicus Vile", type: "armor", slot: "head", stackable: false, evadePercent: 5, maxGP: 50000 },
    "🥾": { name: "Old Boot", type: "armor", slot: "feet", stackable: false, evadePercent: 0, defenseBonus: 2, maxGP: 2 },
    "🥾⚔️": { name: "Fighter's Boots", type: "armor", slot: "feet", stackable: false, evadePercent: 5, defenseBonus: 4, maxGP: 75 },
    "👢": { name: "Old Boot", type: "armor", slot: "feet", stackable: false, evadePercent: 0, defenseBonus: 2, maxGP: 2 },
    "💍⚡": { name: "Ring of Evasion", type: "armor", slot: "rightHand", stackable: false, evadePercent: 20, maxGP: 5000 },
    "💍": { name: "Ring of Midas", type: "armor", slot: "rightHand", stackable: false, evadePercent: -20, maxGP: 500 },
    "🥻": { name: "Robe", type: "armor", slot: "chest", stackable: false, evadePercent: 0, intBonus: 1, maxGP: 30 },
    "🧣": { name: "Scarf", type: "armor", slot: "chest", stackable: false, evadePercent: 2, defenseBonus: 1, maxGP: 15 },
    "🎽": { name: "Running Shirt", type: "armor", slot: "chest", stackable: false, evadePercent: 0, maxGP: 2 },
    "🩴": { name: "Sandals", type: "armor", slot: "feet", stackable: false, evadePercent: 0, maxGP: 2 },
    "👔🦈": { name: "Sharkskin Suit", type: "armor", slot: "chest", stackable: false, evadePercent: 15, maxGP: 2500 },
    "🛡️": { name: "Shield", type: "armor", slot: "rightHand", stackable: false, evadePercent: 15, maxGP: 150 },

    // ── BAG ──────────────────────────────────────────
    "💼🌟": { name: "Bag of Holding", type: "bag", stackable: false, bagSlots: 10, minLevel: 20, maxGP: 600 },
    "🛍️": { name: "Canvas Tote", type: "bag", stackable: false, bagSlots: 3, maxGP: 8 },
    "👝": { name: "Embroidered Clutch", type: "bag", stackable: false, bagSlots: 5, minLevel: 10, maxGP: 55 },
    "🧳✨": { name: "Enchanted Valise", type: "bag", stackable: false, bagSlots: 10, minLevel: 20, maxGP: 500 },
    "💼": { name: "Executive Briefcase", type: "bag", stackable: false, bagSlots: 5, minLevel: 10, maxGP: 60 },
    "🎒🔥": { name: "Fireproof Rucksack", type: "bag", stackable: false, bagSlots: 5, minLevel: 10, maxGP: 75 },
    "🎒💫": { name: "Interdimensional Carryall", type: "bag", stackable: false, bagSlots: 10, minLevel: 20, maxGP: 550 },
    "🧰": { name: "Iron Toolbox", type: "bag", stackable: false, bagSlots: 5, minLevel: 10, maxGP: 45 },
    "👜": { name: "Leather Purse", type: "bag", stackable: false, bagSlots: 3, maxGP: 12 },
    "🧳": { name: "Leather Suitcase", type: "bag", stackable: false, bagSlots: 5, minLevel: 10, maxGP: 50 },
    "🎒": { name: "Small Cloth Bag", type: "bag", stackable: false, bagSlots: 3, maxGP: 10 },
    "🎒🌈": { name: "The Luggage", type: "bag", stackable: false, bagSlots: 100, minLevel: 1, maxGP: 10000 },
    "🫙": { name: "Tupperware of Holding", type: "bag", stackable: false, bagSlots: 3, maxGP: 15 },
    "📦": { name: "Wooden Crate", type: "bag", stackable: false, bagSlots: 3, maxGP: 6 },

    // ── CONTAINER (world-bound) ──────────────────────
    // Placed on dungeon floors; player walks up to loot in place.
    // Cannot be picked up — distinct from type:'bag' which is the
    // carry-only family. Flags:
    //   bagSlots   — capacity (also drives lock-spawn chance: slots * 10%)
    //   lockable   — may spawn locked; once unlocked, stays unlocked
    //   impassable — blocks tile-walk (must bump to loot)
    "🟫":    { name: "Box",              type: "container", stackable: false, bagSlots: 2,                   impassable: true, maxGP: 8 },
    "🛢️":   { name: "Barrel",           type: "container", stackable: false, bagSlots: 2,                   impassable: true, maxGP: 10 },
    "🪑📦":  { name: "End Table",        type: "container", stackable: false, bagSlots: 2,                   impassable: true, maxGP: 12 },
    "💰📦":  { name: "Strongbox",        type: "container", stackable: false, bagSlots: 3,  lockable: true,                    maxGP: 60 },
    "🪵📦":  { name: "Small Crate",      type: "container", stackable: false, bagSlots: 3,                                     maxGP: 15 },
    "🗃️":   { name: "Small Chest",      type: "container", stackable: false, bagSlots: 4,  lockable: true,                    maxGP: 80 },
    "🪑":    { name: "Table",            type: "container", stackable: false, bagSlots: 4,                   impassable: true, maxGP: 25 },
    "🗃️🪨": { name: "Large Chest",      type: "container", stackable: false, bagSlots: 7,  lockable: true,  impassable: true, maxGP: 150 },
    "🪨📦":  { name: "Large Crate",      type: "container", stackable: false, bagSlots: 7,                                     maxGP: 40 },
    "⚙️🗃️": { name: "Iron Chest",       type: "container", stackable: false, bagSlots: 9,  lockable: true,  impassable: true, maxGP: 300 },
    "🪑↔️":  { name: "Long Table",       type: "container", stackable: false, bagSlots: 9,                   impassable: true, maxGP: 60 },
    "🗄️":   { name: "Safe",             type: "container", stackable: false, bagSlots: 12, lockable: true,  impassable: true, maxGP: 500 },
    "✨📦":  { name: "Box of Holding",   type: "container", stackable: false, bagSlots: 15,                                    maxGP: 800 },
    "✨🗃️": { name: "Chest of Holding", type: "container", stackable: false, bagSlots: 20, lockable: true,                    maxGP: 1500 },
    "🗄️✨": { name: "Safe of Holding",  type: "container", stackable: false, bagSlots: 30, lockable: true,  impassable: true, maxGP: 3000 },

    // ── FOOD ─────────────────────────────────────────
    "🥕": { name: "Carrot", type: "food", stackable: true, maxStack: 99, maxHeal: 3, foodValue: 8, maxGP: 2 },
    "🧀": { name: "Cheese", type: "food", stackable: true, maxStack: 99, maxHeal: 5, foodValue: 5, maxGP: 3 },
    "🍛": { name: "Curry", type: "food", stackable: true, maxStack: 99, maxHeal: 15, foodValue: 40, maxGP: 20 },
    "🍗": { name: "Duck Leg", type: "food", stackable: true, maxStack: 99, maxHeal: 8, foodValue: 15, maxGP: 5 },
    "🍝": { name: "Holy Noodle", type: "food", stackable: true, maxStack: 99, maxHeal: 5, foodValue: 10, maxGP: 5 },
    "🍖": { name: "Meat", type: "food", stackable: true, maxStack: 99, maxHeal: 12, foodValue: 25, maxGP: 10 },
    "🍕": { name: "Pizza", type: "food", stackable: true, maxStack: 99, maxHeal: 10, foodValue: 30, maxGP: 15 },
    "🌊": { name: "Ramen of the Deep", type: "food", stackable: true, maxStack: 99, maxHeal: 15, foodValue: 20, maxGP: 10 },
    "🥛": { name: "Milk",    type: "food", maxStack: 99, maxHeal: 2, foodValue: 5,  maxGP: 3 },
    "🥜": { name: "Peanuts", type: "food", maxStack: 99, maxHeal: 1, foodValue: 4,  maxGP: 1 },
    "🦪": { name: "Oyster",  type: "food", maxStack: 99, maxHeal: 4, foodValue: 6,  maxGP: 2 },
    "🥤": { name: "Slurpee", type: "food", stackable: true, maxStack: 99, maxHeal: 5, foodValue: 10, maxGP: 8 },
    "🍜": { name: "Soup of Transcendence", type: "food", stackable: true, maxStack: 99, maxHeal: 25, foodValue: 30, maxGP: 15 },
    "🍺": { name: "Watered Down Beer", type: "food", stackable: true, maxStack: 99, maxHeal: 0, foodValue: 3, maxGP: 5 },
    "🥃": { name: "Whiskey", type: "food", stackable: true, maxStack: 99, maxHeal: -5, foodValue: 5, maxGP: 15 },

    // ── KEY ──────────────────────────────────────────
    "🗝️": { name: "Key", type: "key", stackable: true, maxGP: 25 },

    // ── LIGHT ────────────────────────────────────────
    "🕯️": { name: "Candle", type: "light", stackable: true, maxStack: 99, lightRange: 15, maxGP: 15 },

    // ── EXPLOSIVE ────────────────────────────────────
    // E16: Bomb item — place at player position, explodes after fuseTime turns
    "💣": { name: "Bomb", type: "explosive", stackable: true, maxStack: 5, maxGP: 50,
             fuseTime: 10, blastRadius: 5, baseDamage: 50, damagePerTile: 10 },

    // ── MISC ─────────────────────────────────────────
    "🏺": { name: "Brass Bottle", type: "misc", stackable: false, maxGP: 100 },
    "🥥": { name: "Half-Coconut", type: "misc", stackable: false, maxGP: 5 },
    "💣🌟": { name: "Holy Hand Grenade", type: "misc", stackable: false, maxGP: 1000 },
    "🔐": { name: "Lockpicking Tools", type: "misc", stackable: false, maxGP: 50 },
    "🫖": { name: "Magic Teapot", type: "misc", stackable: false, maxGP: 7500 },
    "💎💠": { name: "Resurrection Crystal", type: "misc", stackable: false, maxGP: 5000 },

    // ── POTION ───────────────────────────────────────
    "🧪💎": { name: "Elixir of Life", type: "potion", stackable: true, maxStack: 99, maxHeal: 9999, maxGP: 3000 },
    "🧪": { name: "Health Potion", type: "potion", stackable: true, maxStack: 99, maxHeal: 25, maxGP: 50 },
    "🧪🦎": { name: "Potion of Newt", type: "potion", stackable: true, maxStack: 99, maxHeal: 0, maxGP: 50 },

    // ── QUEST ────────────────────────────────────────
    "🍲": { name: "Black Cauldron", type: "quest", stackable: false, maxGP: 0 },
    "🏅": { name: "Gold Locket", type: "quest", stackable: false, maxGP: 0 },
    "🪕": { name: "Harp", type: "quest", stackable: false, maxGP: 0 },
    "🛡️🏛️": { name: "Heirloom Shield", type: "quest", stackable: false, maxGP: 0 },
    "📿": { name: "Orichalcum Bead", type: "quest", stackable: true, maxGP: 0 },
    "⚙️": { name: "Pulley", type: "quest", stackable: false, maxGP: 0 },
    "🐟": { name: "Red Herring", type: "quest", stackable: false, maxGP: 10 },
    "🐔": { name: "Rubber Chicken", type: "quest", stackable: false, maxGP: 0 },
    "🦷": { name: "Shark Tooth", type: "quest", stackable: true, maxGP: 50 },
    "🪙": { name: "Unique Coin", type: "quest", stackable: false, maxGP: 0 },
    "🐀💦": { name: "Wet Rat Tail", type: "quest", stackable: true, maxGP: 0 },
    "🦆":   { name: "Rubber Duck",  type: "quest", maxStack: 1, maxGP: 0 },
    "🦵":   { name: "Severed Leg",  type: "quest", maxStack: 1, maxGP: 0 },

    // ── SCROLL ───────────────────────────────────────
    "📜📜": { name: "Constitutional Convention", type: "scroll", stackable: true, maxStack: 99, maxGP: 0 },
    "📃": { name: "Identify Scroll", type: "scroll", stackable: true, maxStack: 99, maxGP: 15 },
    "📜🏖️": { name: "Scroll of Beach Portal", type: "scroll", spell: "beach_portal", stackable: true, maxStack: 99, maxGP: 200, minLevel: 7 },
    "⛏️": { name: "Scroll of Tunnel", type: "scroll", spell: "tunnel", stackable: true, maxStack: 99, maxGP: 75 },
    "🌀": { name: "Town Portal Scroll", type: "scroll", spell: "portal", stackable: true, maxStack: 99, maxGP: 100 },

    // ── SPELL ────────────────────────────────────────
    "📚🔥": { name: "Tome of Chain Lightning", type: "spell", spell: "lightning", stackable: false, maxGP: 6000 },
    "🔥📘": { name: "Tome of Fireball", type: "spell", spell: "fireball", stackable: false, maxGP: 800 },
    "👟📘": { name: "Tome of Haste", type: "spell", spell: "haste", stackable: false, maxGP: 1500 },
    "💖📘": { name: "Tome of Heal", type: "spell", spell: "heal", stackable: false, maxGP: 1200 },
    "❄️📘": { name: "Tome of Ice Bolt", type: "spell", spell: "icebolt", stackable: false, maxGP: 600 },
    "⚡📘": { name: "Tome of Lightning", type: "spell", spell: "lightning", stackable: false, maxGP: 800 },
    "🛡️📘": { name: "Tome of Shield", type: "spell", spell: "shield", stackable: false, maxGP: 1000 },
    "💪📘": { name: "Tome of Strength", type: "spell", spell: "strength", stackable: false, maxGP: 1000 },
    "🌀📘": { name: "Tome of Illuminate", type: "spell", spell: "illuminate", stackable: false, maxGP: 400 },
    "📖🌀": { name: "Tome of Town Portal", type: "spell", spell: "portal", stackable: false,
              unique: true, shopForbidden: true, maxGP: 0,
              desc: "A powerful tome containing the Town Portal spell. Not available in any store." },

    // ── USELESS ──────────────────────────────────────
    "🟠": { name: "1 Cheeto (stale)", type: "useless", stackable: true, maxGP: 0 },
    "🧿": { name: "A Marble", type: "useless", stackable: true, maxGP: 1 },
    "⚓": { name: "Anchor of Enlightenment", type: "useless", stackable: false, maxGP: 0 },
    "💳": { name: "Apu's Club Card", type: "useless", stackable: false, maxGP: 0 },
    "🔘": { name: "Belly Button Lint", type: "useless", stackable: true, maxGP: 0 },
    "🪡": { name: "Bent Needle", type: "useless", stackable: true, maxGP: 0 },
    "🧲": { name: "Bit of Asbestos", type: "useless", stackable: false, maxGP: 0 },
    "⛵": { name: "Blessed Coconut Canoe", type: "useless", stackable: false, maxGP: 0 },
    "🦜": { name: "Blessed Parrot Feather", type: "useless", stackable: false, maxGP: 1 },
    "🩸": { name: "Blood Drop", type: "useless", stackable: true, maxGP: 0 },
    "🦴": { name: "Bone", type: "useless", stackable: true, maxGP: 1 },
    "🧱": { name: "Brick", type: "useless", stackable: true, maxGP: 1 },
    "🕯️💨": { name: "Burnt-Out Candle", type: "useless", stackable: true, maxGP: 0 },
    "📜": { name: "Certified Pastafarian", type: "useless", stackable: false, maxGP: 0 },
    "🦗": { name: "Cockroach Leg (stale)", type: "useless", stackable: true, maxGP: 0 },
    "🫧": { name: "Dandruff Flake", type: "useless", stackable: true, maxGP: 0 },
    "🪶": { name: "Feather", type: "useless", stackable: true, maxGP: 1 },
    "🥚": { name: "Golden Egg", type: "useless", stackable: false, maxGP: 50 },
    "🦷💀": { name: "Hen's Teeth", type: "useless", stackable: true, maxGP: 2 },
    "📰": { name: "Old News", type: "useless", stackable: true, maxGP: 1 },
    "📎": { name: "Paperclip", type: "useless", stackable: true, maxGP: 1 },
    "🧵": { name: "Piece of String", type: "useless", stackable: true, maxGP: 0 },
    "🏴‍☠️": { name: "Pirate Flag of the FSM", type: "useless", stackable: false, maxGP: 0 },
    "📋": { name: "Plans for World Domination", type: "useless", stackable: false, maxGP: 0 },
    "🫘": { name: "Pocket Sand", type: "useless", stackable: true, maxGP: 0 },
    "💩": { name: "Poop", type: "useless", stackable: true, maxPoison: 4, maxGP: 0 },
    "🔱": { name: "Quill", type: "useless", stackable: true, maxGP: 1 },
    "🧤": { name: "Single Glove", type: "useless", stackable: false, maxGP: 3 },
    "🪨": { name: "Small Rock", type: "useless", stackable: true, maxGP: 0 },
    "🧼": { name: "Soap", type: "useless", stackable: true, maxGP: 5 },
    "🌫️": { name: "Spell Residue", type: "useless", stackable: true, maxStack: 10, maxGP: 0 },
    "🧵": { name: "Thread", type: "useless", stackable: true, maxGP: 1 },
    "💇": { name: "Tuft of Hair", type: "useless", stackable: true, maxGP: 0 },
    // E20: Additional animal drop items
    "🪵": { name: "Stick", type: "useless", stackable: true, maxGP: 1 },
    "🐚": { name: "Shell", type: "useless", stackable: true, maxGP: 2 },
    "👓": { name: "Glasses", type: "useless", stackable: false, maxGP: 10 },
    "🌿": { name: "Dirt", type: "useless", stackable: true, maxGP: 0 },
    "🥩": { name: "Raw Meat", type: "food", stackable: true, maxStack: 10, maxHeal: 8, foodValue: 15, maxGP: 3 },
    "🧾": { name: "Communist Manifesto", type: "useless", stackable: false, maxGP: 0 },
    "👙": { name: "Bikini", type: "armor", slot: "legs", stackable: false, evadePercent: 5, maxGP: 15 },
    // E20: Additional animal drop items
    "🪵": { name: "Stick", type: "useless", stackable: true, maxGP: 1 },
    "🐚": { name: "Shell", type: "useless", stackable: true, maxGP: 2 },
    "👓": { name: "Glasses", type: "useless", stackable: false, maxGP: 10 },
    "🌿": { name: "Dirt", type: "useless", stackable: true, maxGP: 0 },
    "🥩": { name: "Raw Meat", type: "food", stackable: true, maxStack: 10, maxHeal: 8, foodValue: 15, maxGP: 3 },
    "🧾": { name: "Communist Manifesto", type: "useless", stackable: false, maxGP: 0 },
    "👙": { name: "Bikini", type: "armor", slot: "legs", stackable: false, evadePercent: 5, maxGP: 15 },
    "🐀💦": { name: "Wet Rat Tail", type: "useless", stackable: true, maxGP: 0 },
    "🧶": { name: "Yarn", type: "useless", stackable: true, maxGP: 2 },
    "🪱": { name: "Earthworm", type: "useless", stackable: true, maxGP: 0 },
    "🧴": { name: "Prophylactic", type: "useless", maxStack: 1, maxGP: 0 },

    // ── WEALTH ───────────────────────────────────────
    "💰": { name: "Gold Bag", type: "wealth", stackable: false, maxGP: 50 },
    // Loose gold pieces. Shares the 🪙 icon with the Unique Coin quest item —
    // icons are display-only and need not be unique. Code distinguishes by
    // itemName ('gold' vs 'uniqueCoin').
    //
    // pickupTo='gp' routes the stack's qty into player.gp on pickup instead
    // of placing the stack in inventory — this is the "custom wealth
    // behavior" hook. Future platinum pieces would set pickupTo='pp', etc.
    // Property-on-the-def rather than a WealthStack subclass: no parallel
    // hierarchy, no "forgot to use the subclass" trap; new wealth types
    // are pure data additions.
    "🪙": { name: "Gold", type: "wealth", maxStack: 9999, maxGP: 0, pickupTo: 'gp' },

    // ── WEAPON ───────────────────────────────────────
    // wieldTalent: TALENT_DEFS id required to equip. Omit/null = no
    // gate (e.g. Accordion is a "weapon" only by typing — has 0 dmg
    // and a special-case effect, so anyone may equip it). New weapons
    // should declare a wieldTalent unless they're similarly atypical.
    "🪗": { name: "Accordion", type: "weapon", stackable: false, baseDmg: 0, maxGP: 0, special: 'accordion' },
    "🏹": { name: "Bow", type: "weapon", stackable: false, baseDmg: 1, maxGP: 25, ranged: true, range: 9, ammoName: 'arrows', rangedDamage: 8, wieldTalent: 'wieldBows' },
    "🗡️✨": { name: "Excalibur", type: "weapon", stackable: false, baseDmg: 12, maxGP: 12000, wieldTalent: 'wieldSwords' },
    "🦯✨": { name: "Proper Staff", type: "weapon", stackable: false, baseDmg: 5, maxGP: 25000, ranged: true, range: 9, manaCost: 5, rangedDamage: 20, magicScaling: 'int', wieldTalent: 'wieldStaffs' },
    "🦯": { name: "Staff", type: "weapon", stackable: false, baseDmg: 4, maxGP: 5, wieldTalent: 'wieldStaffs' },
    "🗡️": { name: "Sword", type: "weapon", stackable: false, baseDmg: 8, maxGP: 100, wieldTalent: 'wieldSwords' },
    "🪄": { name: "Wizard's Wand", type: "weapon", stackable: false, baseDmg: 1, maxGP: 25000, ranged: true, range: 8, manaCost: 3, rangedDamage: 15, magicScaling: 'int', wieldTalent: 'wieldStaffs' },
  };

  // NPC dialogue lines – used for shopkeeper flavor text.
  const APU_LINES = ["Thank you, come again!", "I have eight brothers and a cousin named Dave."];

  // Utility function to create floating combat text (damage numbers, heals, etc.).
  window.addFloatingText = (x, y, text, color, size = 16) => {
    floatingTexts.push({ x, y, text, color, life: 1.0, maxLife: 1.0, size, spawnTime: performance.now() });
  };

  // changeGold, PlayerSprites → moved to src/player.js (K5 refactor)

  // === Player Sprite Animation System ===
  // PlayerSprites → moved to src/player.js (K5 refactor)
