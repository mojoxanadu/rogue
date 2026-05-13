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

// ─── Inventory & Pouch ───────────────────────────────────────
//  These parallel arrays hold item stacks or null for empty slots.
//  inventory: 10 slots accessible from the main panel.
//  pouch:     30 slots accessible from the pouch/bag panel.
const inventory = new Array(10).fill(null);
const pouch     = new Array(30).fill(null);

// ─── Player Object ──────────────────────────────────────────
//  Single source of truth for all runtime player properties.
//  Populated immediately by setPlayerDefaults() below.
//  Never access player state from anywhere except through this
//  object — never create a parallel "playerState" or "pData".
//
//  K9 — "Initialize Once" pattern (O'Reilly):
//  The object is intentionally declared empty here.
//  setPlayerDefaults() is the ONLY place defaults are written,
//  preventing the "parallel initialization" antipattern where
//  initial values are duplicated in both the declaration and the
//  reset function.  Calling setPlayerDefaults() right after its
//  definition seeds `player` on first load AND resets it cleanly
//  on new-game / death — with zero duplication.
const player = {};

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
  player.statPoints = 0; player.talentPoints = 0; player.respecs = 0;
  player.stats = { str: 10, dex: 10, int: 10, con: 10, wis: 10 };
  player.talents = {};
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
  player.spells = {};
  player.equipped = { head: null, chest: '🎽', legs: '🩲', feet: '🩴', leftHand: null, rightHand: null };
  player.learnedInsults = []; player.learnedRetorts = []; player.startingClass = null;
}

// ─── K9: Initialize player at declaration time ───────────────
//  Calling setPlayerDefaults() here means `const player` above
//  only needs its property names declared once.
setPlayerDefaults();

// ─── changeGold ─────────────────────────────────────────────
window.changeGold = (amount, opts = {}) => {
  if(!amount) return 0;
  const oldGold = player.gp || 0;
  const nextGold = Math.max(0, oldGold + amount);
  const actual = nextGold - oldGold;
  if(!actual) return 0;
  player.gp = nextGold;
  if(actual > 0 && opts.floatText) {
    addFloatingText(opts.x ?? player.x, opts.y ?? player.y, `+${actual}g`, '#fc0', opts.size || 14);
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
//  O'Reilly best practice – "Tell, Don't Ask":
//  These functions encapsulate all knowledge of how the player
//  interacts with enemies.  Call them from doCombat() and
//  anywhere else that needs combat math — never inline the
//  formulas in multiple places.

/** Returns the item icon in the player's primary (left) hand, or null. */
function getPlayerPrimaryHand() {
  return player.equipped ? player.equipped.leftHand : null;
}

/**
 * Calculate effective hit rate including equipment bonuses.
 * Weapons with a hitRateBonus property (e.g. enchanted items)
 * add to the base player.hitRate.
 */
function getPlayerHitRate() {
  let hitRate = player.hitRate;
  Object.values(player.equipped).forEach(ic => {
    if(ic) {
      let def = (typeof ITEM_DEF !== 'undefined') ? ITEM_DEF[ic] : null;
      if(def) hitRate += (def.hitRateBonus || 0);
    }
  });
  return hitRate;
}

/**
 * Determine whether the player successfully hits `enemy`.
 * Enemy dodge chance is subtracted from the player's hit rate.
 * @param {object|null} enemy
 * @returns {boolean}
 */
function getPlayerHits(enemy) {
  return Math.random() < getPlayerHitRate() * (1 - (enemy && enemy.stats ? (enemy.stats.dodge || 0) : 0));
}

/**
 * Roll random melee damage based on player stats + equipment.
 * Damage is uniformly distributed between 1 and baseDmg,
 * then meleeDmgBonus is added.
 * @returns {number}
 */
function getPlayerDmg() {
  let baseDmg  = player.baseDmg  || CONSTANTS.PLAYER_UNARMED_BASE_DMG;
  let dmgBonus = player.meleeDmgBonus || 0;
  Object.values(player.equipped).forEach(ic => {
    if(ic) {
      let def = (typeof ITEM_DEF !== 'undefined') ? ITEM_DEF[ic] : null;
      if(!def) return;
      if(def.type === "weapon") baseDmg  = (def.baseDmg || 0);
      if(def.meleeDmgBonus)    dmgBonus += def.meleeDmgBonus;
    }
  });
  // E8: Weapon Master training bonus — consumed on next attack
  if(player.trainingBonus && player.trainingBonus > 0) {
    dmgBonus += player.trainingBonus;
    player.trainingBonus = 0;
  }
  return Math.floor(Math.random() * baseDmg + 1 + dmgBonus);
}

/**
 * Roll damage versus a specific enemy, applying boss scaling.
 * Ifrit is scaled to be a level-10+ challenge — players below
 * that level deal only 30% of normal damage.
 * @param {object|null} enemy
 * @returns {number}
 */
function getPlayerDmgVersus(enemy) {
  if (enemy && enemy.isIfrit)
    return Math.max(1, Math.floor(getPlayerDmg() * (player.level >= 10 ? 1.0 : 0.3)));
  return getPlayerDmg();
}

/**
 * Calculate player critical hit rate from their base crit
 * rate adjusted for any equipment that might change it.
 *
 * O'Reilly best practice – "Open/Closed":
 *   Add equipment bonuses here; callers never need to change.
 */
function getPlayerCritRate() {
  // TODO: Add equipment that changes crit rate.
  return player.critRate;
}

// Expose to global scope so engine.js and mechanics.js can call them
window.getPlayerPrimaryHand = getPlayerPrimaryHand;
window.getPlayerHitRate      = getPlayerHitRate;
window.getPlayerHits         = getPlayerHits;
window.getPlayerDmg          = getPlayerDmg;
window.getPlayerDmgVersus    = getPlayerDmgVersus;
window.getPlayerCritRate     = getPlayerCritRate;
