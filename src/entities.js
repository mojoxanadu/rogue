// ============================================================
//  ENTITIES MODEL  –  src/entities.js
//
//  UX-AGNOSTIC class hierarchy for everything that can exist on
//  a map tile. Tiles are just integers; entities render OVER them.
//
//    Entity         x, y, icon — base class for anything placed
//      Sentient     + hp/mp/stats — has agency (NPCs, monsters, players)
//        Player     + inventory/equipped/xp — playable characters
//          LocalPlayer  + quickslotCount — the one this client controls
//
//  Skeleton only: fields list captures structure, not every per-game
//  property the legacy global `player` carries today. Migration of
//  per-game state onto these instances happens in follow-up commits.
//
//  See world.js for Zone (tile area + entity list) and World
//  (camera + multi-zone composition).
// ============================================================

// ─── Entity ─────────────────────────────────────────────────
/**
 * Anything that can exist on a map tile. Pure positional + visual
 * data. Subclasses add behavior layers.
 *
 * `def` is an optional reference to a definition (MonsterDef,
 * ItemDef when an item is rendered on the floor, etc.). Like
 * ItemStack.def, it lets instance code consult the catalog
 * without copying every property onto the instance.
 */
class Entity {
  constructor(spec = {}) {
    this.x    = spec.x ?? 0;
    this.y    = spec.y ?? 0;
    this.icon = spec.icon ?? '?';
    this.zone = spec.zone ?? null;   // Zone reference (set when added)
    this.def  = spec.def  ?? null;   // optional catalog ref
  }

  /** Manhattan distance to (x, y). Used for AI range checks, etc. */
  distanceTo(x, y) {
    return Math.abs(this.x - x) + Math.abs(this.y - y);
  }

  /**
   * Canonical motion method. Use this instead of writing to x/y/zone
   * directly — it keeps the entity's zone back-reference and the
   * containing zone's entities list in sync.
   *
   * Same-zone move: just updates x/y.
   * Cross-zone move: removes from old zone's entities list, adds to
   * the new zone's list, updates the back-reference.
   * Move to null zone: removes from current zone; entity becomes
   * "in no zone" (legal — useful for inventory swallowing, scratch
   * entities, etc.).
   *
   * Direct property writes (entity.x = 5; entity.zone = z) are
   * bypass-at-your-own-risk. moveTo is the source of truth.
   */
  moveTo(x, y, zone = this.zone) {
    if (zone !== this.zone) {
      if (this.zone) this.zone.remove(this);   // sets this.zone = null
      if (zone)      zone.add(this);           // sets this.zone = zone
    }
    this.x = x;
    this.y = y;
    return this;
  }
}


// ─── Sentient ───────────────────────────────────────────────
/**
 * An entity with agency: takes turns, has hp/mp/stats, can be
 * affected by status effects. NPCs, monsters, and players all
 * extend this.
 *
 * Stats live in `stats` (an object), not separate fields, so the
 * shape can grow without breaking constructors. Status effects
 * are a name→state object (e.g., { poison: {turns: 5, tick: 2} }).
 */
/**
 * A timed background effect attached to a Sentient (poison, regeneration,
 * burning, etc). Conditions DO NOT prevent the host from acting — they
 * just fire their `onTick` callback every `interval` time-units for
 * `pointsRemaining` applications, then auto-remove.
 *
 * Lifecycle managed by Sentient.tick() (decrements cooldown) and
 * Sentient.fireDueConditions() (calls onTick, decrements pointsRemaining,
 * removes when exhausted).
 *
 * Stackable: a Sentient can hold multiple Conditions with the same name
 * (e.g., two poison applications), each ticking independently.
 */
class Condition {
  constructor(spec = {}) {
    this.name            = spec.name            ?? 'unnamed';
    this.interval        = spec.interval        ?? 1.0;
    this.pointsRemaining = spec.pointsRemaining ?? 1;
    this.cooldown        = spec.cooldown        ?? this.interval;
    this.onTick          = spec.onTick          ?? (() => {});
    // onRemove fires once when fireDueConditions auto-removes an
    // exhausted Condition (pointsRemaining ≤ 0). Symmetric to onTick;
    // intended for cleanup side-effects (restoring speedMod, logging
    // an "effect ended" message, etc).
    this.onRemove        = spec.onRemove        ?? (() => {});
  }
  isDue()       { return this.cooldown        <= 0; }
  isExhausted() { return this.pointsRemaining <= 0; }
}


class Sentient extends Entity {
  constructor(spec = {}) {
    super(spec);
    this.hp    = spec.hp    ?? 0;
    this.maxHp = spec.maxHp ?? this.hp;
    this.mp    = spec.mp    ?? 0;
    this.maxMp = spec.maxMp ?? this.mp;
    // Combat-roll fields. Apply to every Sentient (player AND monster).
    // Subclasses (Player) layer equipment bonuses on top by overriding the
    // effective*() / rollDmg() methods; the raw fields below are the BASE
    // value before any modifiers.
    this.hitRate        = spec.hitRate        ?? 0;
    this.critRate       = spec.critRate       ?? 0;
    this.dodgeRate      = spec.dodgeRate      ?? 0;
    this.baseDmg        = spec.baseDmg        ?? 0;
    this.meleeDmgBonus  = spec.meleeDmgBonus  ?? 0;
    this.rangedDmgBonus = spec.rangedDmgBonus ?? 0;
    this.spellDmgBonus  = spec.spellDmgBonus  ?? 0;
    this.stats         = spec.stats         ?? {};
    this.statusEffects = spec.statusEffects ?? {};
    // ── Cooldown turn-loop fields ──────────────────────────────
    // actionCooldown: time-units until this Sentient may take its
    //   next action. > 0 → canAct() === false. Decremented by tick().
    // cooldowns: per-action-name cost hash. Reset by *acting*: when
    //   a Sentient performs an action, its actionCooldown gets set
    //   to the value at cooldowns[actionName] (5c will own that wiring).
    //   Defaults are { move: 1.0, attack: 1.0 }; monsters typically
    //   derive from speed (move: 1/speed; attack: max(1.0, 1/speed)).
    // conditions: array of Condition instances (stackable — two
    //   independent poisons are two entries).
    this.actionCooldown = spec.actionCooldown ?? 0;
    this.cooldowns      = spec.cooldowns      ?? { ...Sentient.DEFAULT_COOLDOWNS };
    this.conditions     = spec.conditions     ?? [];
  }

  isAlive()    { return this.hp > 0; }
  isHostile()  { return false; }       // default; subclasses override

  // ── Cooldown / condition helpers ───────────────────────────
  /** True if this Sentient's action cooldown has elapsed. */
  canAct() { return this.actionCooldown <= 0; }

  /**
   * Cost (in time-units) of performing the named action. Falls back to
   * 1.0 if the action isn't listed — keeps unknown actions consistent
   * with the global default round length.
   */
  actionCost(name) {
    return this.cooldowns?.[name] ?? 1.0;
  }

  /**
   * Advance time by `delta` for this Sentient: decrement its own
   * actionCooldown (floored at 0) and tick every attached Condition's
   * cooldown. Does NOT fire condition effects — call
   * fireDueConditions() separately so the scheduler can decide ordering.
   */
  tick(delta) {
    if (this.actionCooldown > 0) {
      this.actionCooldown = Math.max(0, this.actionCooldown - delta);
    }
    for (const c of this.conditions) c.cooldown -= delta;
  }

  /**
   * Fire any conditions whose cooldown has elapsed and that still have
   * points remaining. A single condition can fire multiple times in
   * one call if its cooldown went very negative (large delta). After
   * firing, exhausted conditions (pointsRemaining ≤ 0) are removed.
   * Returns the names of the fired condition applications, in order.
   */
  fireDueConditions() {
    const fired = [];
    for (const c of this.conditions) {
      while (c.isDue() && !c.isExhausted()) {
        c.onTick(this);
        c.pointsRemaining -= 1;
        c.cooldown        += c.interval;
        fired.push(c.name);
      }
    }
    for (let i = this.conditions.length - 1; i >= 0; i--) {
      if (this.conditions[i].isExhausted()) {
        const removed = this.conditions[i];
        this.conditions.splice(i, 1);
        removed.onRemove(this);
      }
    }
    return fired;
  }

  /**
   * True if this Sentient has at least one active Condition with the
   * given name. Cheap O(n) scan — conditions[] is short in practice.
   * Useful for guards in legacy/wall-clock code that needs to ask
   * "is the effect still on?" without iterating the array itself.
   */
  hasCondition(name) {
    for (const c of this.conditions) if (c.name === name) return true;
    return false;
  }

  // ── Combat helpers ──────────────────────────────────────────
  // The effective*() methods exist as override points for subclasses
  // that need to fold equipment / buffs into the raw stat. Default
  // implementation is a passthrough — fine for monsters that don't
  // wear gear.

  effectiveHitRate()  { return this.hitRate  ?? 0; }
  effectiveCritRate() { return this.critRate ?? 0; }

  /**
   * Dodge rate this Sentient presents to an attacker. Reads `dodgeRate`
   * first; falls back to legacy `stats.dodge` so a pre-class enemy plain
   * object passed as a `target` to `hits()` still resolves correctly
   * during the migration window.
   */
  effectiveDodgeRate() {
    if (this.dodgeRate)            return this.dodgeRate;
    if (this.stats?.dodge != null) return this.stats.dodge;
    return 0;
  }

  /**
   * Did this Sentient land a hit on `target`? `target` may be a Sentient
   * instance or a legacy enemy plain object (with .stats.dodge or none).
   * Mirrors the long-standing formula: hit_rate * (1 - target_dodge).
   */
  hits(target) {
    const dodge = (target && typeof target.effectiveDodgeRate === 'function')
      ? target.effectiveDodgeRate()
      : ((target?.dodgeRate ?? target?.stats?.dodge) ?? 0);
    return Math.random() < this.effectiveHitRate() * (1 - dodge);
  }

  /**
   * Roll a melee damage value: uniform 1..baseDmg, then meleeDmgBonus added.
   * Subclasses that have equipment (Player) override to fold weapon damage
   * + bonus gear into the calculation.
   */
  rollDmg() {
    const base  = this.baseDmg ?? 0;
    const bonus = this.meleeDmgBonus ?? 0;
    return Math.floor(Math.random() * base + 1 + bonus);
  }
}


// ─── Player ─────────────────────────────────────────────────
/**
 * A playable character. Carries an inventory and equipment.
 *
 * Inventory is an array of ItemStack | null. Equipped is a slot
 * map (head/chest/legs/feet/leftHand/rightHand) of camelCase
 * item names, matching the existing player.equipped shape.
 *
 * Player does NOT include game-progress fields like xp/level —
 * those are commonly per-instance and live here. But "the local
 * player" specific concerns (quickslot view, camera) sit on
 * LocalPlayer below.
 */
class Player extends Sentient {
  constructor(spec = {}) {
    // Player.DEFAULTS provides starting combat stats (hp/mp/gp/baseDmg/
    // hit-crit-dodge/per-school bonus). The merge layers spec on top, so
    // a caller can still override any field. This is the SINGLE SOURCE OF
    // TRUTH for the legacy CONSTANTS.PLAYER_INITIAL_* values; state.js's
    // CONSTANTS now exposes them as getters that delegate to here.
    const filled = { ...Player.DEFAULTS, ...spec };
    super(filled);
    this.inventory = filled.inventory ?? new Array(Player.DEFAULT_INVENTORY_SIZE).fill(null);
    this.equipped  = filled.equipped  ?? {
      head: null, chest: null, legs: null, feet: null,
      leftHand: null, rightHand: null,
    };
    this.xp    = filled.xp    ?? 0;
    this.level = filled.level ?? 1;
    this.gp    = filled.gp    ?? 0;
    // E8 Weapon-Master training bonus: consumed (zeroed) on next attack.
    this.trainingBonus = filled.trainingBonus ?? 0;
  }

  // ── Equipment helpers ──────────────────────────────────────
  /** camelCase item name in the primary (left) hand, or null. */
  primaryHand() {
    return this.equipped ? this.equipped.leftHand : null;
  }

  /**
   * Sum a numeric per-equip-slot bonus across every equipped item via
   * the global ItemDefs registry. Falls back to 0 if ItemDefs hasn't
   * been built yet (early init, isolated tests).
   */
  _sumEquipBonus(field) {
    if (typeof ItemDefs === 'undefined' || !this.equipped) return 0;
    let total = 0;
    for (const name of Object.values(this.equipped)) {
      if (!name) continue;
      const def = ItemDefs[name];
      if (def && def[field]) total += def[field];
    }
    return total;
  }

  // ── Combat overrides ───────────────────────────────────────
  effectiveHitRate() {
    return (this.hitRate ?? 0) + this._sumEquipBonus('hitRateBonus');
  }

  /**
   * Player melee damage: equipment first sets the base (weapon overrides
   * unarmed baseDmg), then per-slot meleeDmgBonus accumulates, then the
   * one-shot trainingBonus is consumed.
   */
  rollDmg() {
    let base  = this.baseDmg  ?? 0;
    let bonus = this.meleeDmgBonus ?? 0;
    if (typeof ItemDefs !== 'undefined' && this.equipped) {
      for (const name of Object.values(this.equipped)) {
        if (!name) continue;
        const def = ItemDefs[name];
        if (!def) continue;
        if (def.type === 'weapon') base = def.baseDmg ?? 0;
        if (def.meleeDmgBonus)     bonus += def.meleeDmgBonus;
      }
    }
    if (this.trainingBonus && this.trainingBonus > 0) {
      bonus += this.trainingBonus;
      this.trainingBonus = 0;
    }
    return Math.floor(Math.random() * base + 1 + bonus);
  }

  /**
   * Damage roll versus a specific target. Boss scaling: under level 10,
   * a player deals 30% damage to Ifrit. Otherwise just rollDmg().
   */
  rollDmgVersus(target) {
    if (target && target.isIfrit) {
      return Math.max(1, Math.floor(this.rollDmg() * (this.level >= 10 ? 1.0 : 0.3)));
    }
    return this.rollDmg();
  }
}
Player.DEFAULT_INVENTORY_SIZE = 30;

/**
 * Starting combat values for a fresh Player. The legacy
 * CONSTANTS.PLAYER_INITIAL_* getters in state.js now delegate here, so
 * this object is the single source of truth for those defaults. To
 * rebalance, change these numbers — `setPlayerDefaults()` (in player.js)
 * still reads CONSTANTS.PLAYER_*, but those resolve back to this object.
 */
Player.DEFAULTS = {
  hp: 16, maxHp: 16,
  mp: 0,  maxMp: 0,
  gp: 100,
  baseDmg: 3,
  meleeDmgBonus:  0,
  rangedDmgBonus: 0,
  spellDmgBonus:  0,
  hitRate:   0.6,
  critRate:  0.0,
  dodgeRate: 0.0,
};


// ─── LocalPlayer ────────────────────────────────────────────
/**
 * The one Player this client controls. Adds view-layer concerns
 * (quickslot count for the HUD, an `isLocal` flag) that other
 * Player instances (future remote players, party members) wouldn't
 * need.
 *
 * Camera state itself lives on World, not LocalPlayer — World
 * orchestrates the view using LocalPlayer's position as the
 * focal point.
 */
class LocalPlayer extends Player {
  constructor(spec = {}) {
    super(spec);
    this.quickslotCount = spec.quickslotCount ?? LocalPlayer.DEFAULT_QUICKSLOT_COUNT;
    this.isLocal = true;
  }
}
LocalPlayer.DEFAULT_QUICKSLOT_COUNT = 10;


Sentient.DEFAULT_COOLDOWNS = { move: 1.0, attack: 1.0 };

// Expose to the global concat scope.
window.Entity      = Entity;
window.Sentient    = Sentient;
window.Player      = Player;
window.LocalPlayer = LocalPlayer;
window.Condition   = Condition;
