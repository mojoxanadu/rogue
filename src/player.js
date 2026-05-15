// ============================================================
//  PLAYER MODULE  –  src/player.js
//  Centralizes all player state, defaults, and core functions.
//
//  Design principle (O'Reilly best practice):
//  Keep player data and behaviour in one place.  All other
//  modules read/write the exported `player` object; they never
//  re-declare it.  This makes save/load, testing, and future
//  multiplayer trivially achievable.
// ============================================================

// ─── LocalPlayer instance + back-compat aliases ─────────────
//
//  `localPlayer` is the canonical LocalPlayer instance (entities.js).
//  The historical top-level identifiers `player` and `inventory` are
//  preserved as aliases — the rest of the codebase still reads them
//  as bare globals, and both point at the same object/array as
//  `localPlayer` and `localPlayer.inventory`.
//
//  Reassignment risk: nothing in the codebase reassigns `player` or
//  `inventory`; all mutation is property/index writes which propagate
//  through the alias. Verified by grep before this commit.
//
//  setPlayerDefaults() (below) continues to populate the 50+ legacy
//  fields onto the instance. The LocalPlayer constructor already sets
//  hp/maxHp/gp/combat stats from Player.DEFAULTS; setPlayerDefaults
//  rewrites those (idempotently — same source numbers) and then layers
//  on the remaining quest-flag/hunger/etc fields. A future
//  commit lifts those into Player.prototype.reset() once the questFlags
//  map collapses.
const localPlayer = new LocalPlayer();
const player    = localPlayer;
const inventory = localPlayer.inventory;

// ─── World + active Zone (Option B1) ────────────────────────
//
//  The model layer holds ONE Zone (id 'active') whose tile-grid /
//  visibility-layer / entity-list fields mirror the legacy bare
//  globals (theMap, darkMap, explored, visible, enemies + mapW/H).
//  Nothing currently reads zone.* — game code still reads the bare
//  globals — but the alias is kept in sync so future commits can
//  start migrating call sites without staleness bugs.
//
//  syncActiveZone() must be called after every reassignment of the
//  bare globals (level transitions, debug snapshot restore). The
//  in-place mutations (enemies.length = 0; enemies.push(...)) preserve
//  the alias without a sync call, but calling sync there is harmless
//  and keeps the invariant "after any level-state change, call sync."
//
//  Minimal least-destructive shape: one Zone reused across levels,
//  width/height/tiles/etc rebinding per transition. The real "one
//  Zone per level, retire bare globals" design awaits a future
//  direction discussion.
const world = new World({ localPlayer });
const zone  = new Zone({ id: 'active', width: 1, height: 1 });
world.addZone(zone);
world.setActiveZone('active');
localPlayer.zone = zone;

function syncActiveZone() {
  if (typeof mapW !== 'undefined' && mapW) zone.width  = mapW;
  if (typeof mapH !== 'undefined' && mapH) zone.height = mapH;
  zone.tiles    = theMap;
  zone.darkMap  = darkMap;
  zone.explored = explored;
  zone.visible  = visible;
  zone.entities = enemies;
}
syncActiveZone();
window.world           = world;
window.zone            = zone;
window.syncActiveZone  = syncActiveZone;

// ─── setPlayerDefaults ──────────────────────────────────────
/**
 * Reset all player properties to their initial values.
 *
 * DESIGN NOTE (O'Reilly pattern – "Initialize Once"):
 *   Call this function both at declaration time (to seed `player`)
 *   AND whenever you need a full reset (new game, death).
 *   Never duplicate default values in two places.
 */
function setPlayerDefaults() {
  player.x = 0; player.y = 0; player.facing = {dx: 0, dy: 1};
  player.hp = CONSTANTS.PLAYER_INITIAL_MAX_HP; player.maxHp = CONSTANTS.PLAYER_INITIAL_MAX_HP;
  player.mp = CONSTANTS.PLAYER_INITIAL_MAX_MP; player.maxMp = CONSTANTS.PLAYER_INITIAL_MAX_MP;
  player.gp = CONSTANTS.PLAYER_INITIAL_GP;
  player.baseDmg = CONSTANTS.PLAYER_UNARMED_BASE_DMG;
  player.meleeDmgBonus = CONSTANTS.PLAYER_INITIAL_MELEE_BONUS;
  player.rangedDmgBonus = CONSTANTS.PLAYER_INITIAL_RANGED_BONUS;
  player.spellDmgBonus = CONSTANTS.PLAYER_INITIAL_SPELL_BONUS;
  player.hitRate = CONSTANTS.PLAYER_INITIAL_HIT_RATE;
  player.critRate = CONSTANTS.PLAYER_INITIAL_CRIT_RATE;
  player.dodgeRate = CONSTANTS.PLAYER_INITIAL_DODGE_RATE;
  player.xp = 0; player.level = 1;
  player.statPoints = 0;
  player.stats = { str: 10, dex: 10, int: 10, con: 10, wis: 10 };
  player.hunger = 0; player.darkSteps = 0;
  player.exhaustion = 0; player.isRunning = false; player.isKneeling = false;
  player.healOverTime = 0; player.totalHealPending = 0;
  player.storesVisited = 0; player.lastStoreFloor = -1;
  player.savedRat = false; player.hasBottle = false; player.masterDefeated = false;
  player.fedEagle = false; player.boatRepaired = false; player.playingAstro = false;
  player.grogTurns = 0; player.killedPassive = false; player.assassinMet = false;
  player.guardTalked = false; player.clavicusDeal = false;
  player.atronach = false; player.blind = false;
  player.grueDanger = 0; player._grokMetBefore = false; player._grokWasSleeping = false; player._grokWhyHereIdx = 0;
  player.bridgeQuestions = false; player.grenadeCount = 0; player.knightLimb = 0;
  player.astroScore = 0; player.skillChecks = { boulder: false, rope: false };
  player.equippedSpell = null; player.rocCaptured = false;
  player.secondarySpell = null;
  player.statusTurns = 0; player.statusType = null;
  player.speedMod = 1.0;
  player.statusEffects = {};
  // Reset Sentient condition list and any wall-clock trackers the
  // legacy effects piggy-back on the player object.
  if (Array.isArray(player.conditions)) player.conditions.length = 0;
  player._diarrheaUntilMs    = 0;
  player._diarrheaNextFartMs = 0;
  player.spells = {};
  // player.talents is initialized by the Player constructor (entities.js).
  // Re-reset on each setPlayerDefaults call (game restart) to drop any
  // talents granted in the previous run.
  player.talents = {};
  player.talentPoints = 0;
  // Equipped item slots. VALUES are camelCase item names (matching keys in
  // the ItemDefs registry), NOT emoji icons. Each slot holds at most one
  // item — equip slots are item instances, not stacks. Drags between
  // inventory stacks and equip slots take/place one unit at a time.
  player.equipped = { head: null, chest: 'runningShirt', legs: 'briefs', feet: 'sandals', leftHand: null, rightHand: null };
  player.learnedInsults = []; player.learnedRetorts = []; player.startingClass = null;
  // Number of inventory slots mirrored in the HUD quickslot row. Future
  // boons will raise this from a starting value up to the full inventory
  // size. All quickslot rendering and key bindings must read this —
  // never hardcode the count.
  player.quickslotCount = 6;
}

// Apply legacy default fields to the LocalPlayer instance (quest flags,
// hunger/exhaustion, equipped outfit, etc). The combat fields
// it touches duplicate the LocalPlayer constructor's writes — same
// values, so idempotent.
setPlayerDefaults();
window.localPlayer = localPlayer;

// ─── changeGold ─────────────────────────────────────────────
window.changeGold = (amount, opts = {}) => {
  if(!amount) return 0;
  const oldGold = player.gp ?? 0;
  const nextGold = Math.max(0, oldGold + amount);
  const actual = nextGold - oldGold;
  if(!actual) return 0;
  player.gp = nextGold;
  if(actual > 0 && opts.floatText) {
    addFloatingText(opts.x ?? player.x, opts.y ?? player.y, `+${actual}g`, '#fc0', opts.size ?? 14);
  }
  if(opts.sound !== false && typeof Sound !== 'undefined' && Sound.clink) Sound.clink();
  if(opts.updateUI !== false && typeof updateUI === 'function') updateUI();
  return actual;
};

// ─── Player Sprite Animation System ─────────────────────────
// Warrior spritesheets: 1200x896 pixels each
// Frame extraction for walking, running, fighting, sleeping animations
const PlayerSprites = {
  sheets: {},
  frames: {},
  currentAnim: 'walk',
  frameIndex: 0,
  frameTimer: 0,
  frameDelay: 150, // ms per frame
  frameSize: 64,   // each frame is 64x64 pixels
  framesPerRow: 18, // 1200 / 64 ≈ 18.75, using 18
  totalRows: 14,    // 896 / 64 = 14

  // Animation definitions
  animations: {
    walk: { sheet: 'walk', frames: [0,1,2,3,4,5,6,7], loop: true },
    run: { sheet: 'run', frames: [0,1,2,3,4,5], loop: true },
    fight: { sheet: 'fight', frames: [0,1,2,3,4,5,6,7], loop: false },
    sleep: { sheet: 'sleep', frames: [0,1,2,3], loop: true }
  },

  // Load a spritesheet
  loadSheet: function(name, src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.sheets[name] = img;
        this.extractFrames(name, img);
        resolve(img);
      };
      img.onerror = reject;
      img.src = src;
    });
  },

  // Extract frames from a spritesheet
  extractFrames: function(sheetName, img) {
    this.frames[sheetName] = [];
    const cols = Math.floor(img.width / this.frameSize);
    const rows = Math.floor(img.height / this.frameSize);

    for(let row = 0; row < rows; row++) {
      for(let col = 0; col < cols; col++) {
        const canvas = document.createElement('canvas');
        canvas.width = this.frameSize;
        canvas.height = this.frameSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(
          img,
          col * this.frameSize, row * this.frameSize,
          this.frameSize, this.frameSize,
          0, 0,
          this.frameSize, this.frameSize
        );
        this.frames[sheetName].push(canvas);
      }
    }
    console.log(`PlayerSprites: Extracted ${this.frames[sheetName].length} frames from ${sheetName}`);
  },

  // Set current animation
  setAnimation: function(animName) {
    if(this.animations[animName] && this.currentAnim !== animName) {
      this.currentAnim = animName;
      this.frameIndex = 0;
      this.frameTimer = 0;
    }
  },

  // Update animation frame
  update: function(dt) {
    const anim = this.animations[this.currentAnim];
    if(!anim || !this.frames[anim.sheet]) return;

    this.frameTimer += dt;
    if(this.frameTimer >= this.frameDelay) {
      this.frameTimer = 0;
      this.frameIndex++;

      if(this.frameIndex >= anim.frames.length) {
        if(anim.loop) {
          this.frameIndex = 0;
        } else {
          this.frameIndex = anim.frames.length - 1;
        }
      }
    }
  },

  // Get current frame canvas
  getCurrentFrame: function() {
    const anim = this.animations[this.currentAnim];
    if(!anim || !this.frames[anim.sheet]) return null;

    const frameNum = anim.frames[this.frameIndex];
    return this.frames[anim.sheet][frameNum] || null;
  },

  // Draw current frame
  draw: function(ctx, x, y, size) {
    const frame = this.getCurrentFrame();
    if(frame) {
      ctx.drawImage(frame, x, y, size, size);
      return true;
    }
    return false;
  },

  // Initialize - load all warrior spritesheets
  init: async function() {
    try {
      // Load from base64 data URLs (will be set by build system)
      // For now, create placeholder sprites
      console.log('PlayerSprites: Initializing with placeholder sprites');
      this.createPlaceholderSprites();
      return true;
    } catch(e) {
      console.error('PlayerSprites: Failed to initialize', e);
      return false;
    }
  },

  // Create placeholder sprites for testing
  createPlaceholderSprites: function() {
    const colors = {
      walk: '#4CAF50',
      run: '#2196F3',
      fight: '#F44336',
      sleep: '#9C27B0'
    };

    for(const [animName, anim] of Object.entries(this.animations)) {
      this.frames[anim.sheet] = [];
      for(let i = 0; i < anim.frames.length; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = this.frameSize;
        canvas.height = this.frameSize;
        const ctx = canvas.getContext('2d');

        // Draw placeholder warrior
        ctx.fillStyle = colors[animName];
        ctx.fillRect(0, 0, this.frameSize, this.frameSize);

        // Body
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(20, 20, 24, 24);

        // Head
        ctx.fillStyle = '#FFE4C4';
        ctx.beginPath();
        ctx.arc(32, 16, 10, 0, Math.PI * 2);
        ctx.fill();

        // Animation indicator
        ctx.fillStyle = '#000';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(animName[0].toUpperCase(), 32, 55);
        ctx.fillText(i.toString(), 32, 65);

        this.frames[anim.sheet].push(canvas);
      }
    }
  }
};

// Make globally accessible
window.PlayerSprites = PlayerSprites;

// ─── K10: Player ability functions ──────────────────────────
//
// ─── Combat Helper Functions ─────────────────────────────────
//
//  Thin delegates to methods on the LocalPlayer instance. The actual
//  math lives on Sentient/Player in entities.js; these wrappers exist
//  only so the historical bare-global names (`getPlayerHits(e)` etc.)
//  keep resolving while engine.js / mechanics.js / ui_logic.js still
//  call them. A future commit (4c) sweeps callers to call
//  `player.hits(e)` directly and deletes these.

const getPlayerPrimaryHand = ()  => player.primaryHand();
const getPlayerHitRate     = ()  => player.effectiveHitRate();
const getPlayerCritRate    = ()  => player.effectiveCritRate();
const getPlayerHits        = (e) => player.hits(e);
const getPlayerDmg         = ()  => player.rollDmg();
const getPlayerDmgVersus   = (e) => player.rollDmgVersus(e);

window.getPlayerPrimaryHand  = getPlayerPrimaryHand;
window.getPlayerHitRate      = getPlayerHitRate;
window.getPlayerHits         = getPlayerHits;
window.getPlayerDmg          = getPlayerDmg;
window.getPlayerDmgVersus    = getPlayerDmgVersus;
window.getPlayerCritRate     = getPlayerCritRate;
