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
    // Talents owned: dict keyed by TALENT_DEFS id, value { level: N }.
    // Default empty; class selection grants the class talent + the
    // matching wield talent. Engine code may consult this directly,
    // but equip-time gating should go through canEquip().
    this.talents = filled.talents ?? {};
    // Talent Points — spend to acquire/improve talents. Granted on
    // level-up (3/level by spec; 4 once Growth Spurt is purchased).
    // Convertible from ability points at the rate 3 AP → 1 TP.
    this.talentPoints = filled.talentPoints ?? 0;
  }

  /**
   * Player.actionCost overrides Sentient's lookup to fold in
   * talent-driven cooldown modifiers. Today only 'move' is affected
   * (Speed talent: −10% × N). Floored at 10% of base so future
   * stacked sources can't drive cost to zero / negative.
   */
  actionCost(name) {
    let cost = super.actionCost(name);
    if (name === 'move') {
      const speedLvl = (this.talents.speed && this.talents.speed.level) || 0;
      if (speedLvl > 0) cost *= Math.max(0.1, 1 - 0.10 * speedLvl);
    }
    return cost;
  }

  /**
   * Apply incoming damage, reduced by talent-driven mitigations.
   * Returns the actual damage dealt (after reduction). Does not
   * trigger death — the engine checks hp afterwards.
   *
   *   Toughness: -10% × N for "corporal" damage. A `kind` string
   *   present in Player.NON_CORPORAL_KINDS is exempted; everything
   *   else (and a null/missing kind) is treated as corporal. The
   *   exempted set is small on purpose — it's the central list of
   *   non-physical damage tags as we wire more elemental sources.
   */
  takeDamage(dmg, kind = null) {
    if (!(dmg > 0)) return 0;
    const corporal = !Player.NON_CORPORAL_KINDS.has(kind);
    let mult = 1.0;
    if (corporal) {
      const toughLvl = (this.talents.toughness && this.talents.toughness.level) || 0;
      if (toughLvl > 0) mult *= Math.max(0, 1 - 0.10 * toughLvl);
    }
    const actual = Math.max(0, Math.floor(dmg * mult));
    this.hp -= actual;
    return actual;
  }

  // ── Talent gating (model layer) ────────────────────────────
  /**
   * Strict prereq check — does the player actually own the required
   * talent at the required rank? JoaT does NOT factor in here; this
   * is the underlying truth. Public so the view can ask "was prereq
   * bypassed?" when deciding whether to show the JoaT 2× annotation.
   */
  meetsRealPrereq(def) {
    if (!def || !def.requires) return true;
    for (const [reqId, reqRank] of Object.entries(def.requires)) {
      const owned = this.talents && this.talents[reqId];
      if (!owned || (owned.level || 0) < reqRank) return false;
    }
    return true;
  }

  /**
   * True iff the player owns Jack of All Trades (level >= 1). JoaT
   * universally satisfies every prereq for the *purpose of buying*
   * (not improving) — paying 2× initial cost for talents the player
   * wouldn't otherwise be able to acquire.
   */
  hasJoaT() {
    const t = this.talents && this.talents.jackOfAllTrades;
    return !!(t && (t.level || 0) > 0);
  }

  /**
   * Single source of truth for buy/improve eligibility. Used by both
   * the classifier and the buy action — they cannot drift.
   *
   * Returns:
   *   { allowed: true,  cost: N }                — normal purchase
   *   { allowed: true,  cost: 2N, viaJoaT: true } — JoaT bypass
   *   { allowed: false, reason: 'maxed' | 'prereq' | 'unknown' }
   */
  buyVerdict(talentId) {
    const defs = (typeof TALENT_DEFS !== 'undefined') ? TALENT_DEFS : null;
    const def  = defs ? defs[talentId] : null;
    if (!def) return { allowed: false, reason: 'unknown' };
    const ownedLvl = (this.talents[talentId] && this.talents[talentId].level) || 0;
    // Maxed check (single-rank owned, or rank >= max for capped).
    if (ownedLvl > 0) {
      if (def.cost.improve == null && def.cost.max !== -1) {
        return { allowed: false, reason: 'maxed' };
      }
      if (def.cost.max !== -1 && ownedLvl >= def.cost.max) {
        return { allowed: false, reason: 'maxed' };
      }
    }
    const cost = (ownedLvl === 0) ? def.cost.initial : def.cost.improve;
    if (cost == null) return { allowed: false, reason: 'maxed' };
    const meetsReal = this.meetsRealPrereq(def);
    if (ownedLvl === 0) {
      if (meetsReal)        return { allowed: true,  cost };
      if (this.hasJoaT())   return { allowed: true,  cost: cost * 2, viaJoaT: true };
      return { allowed: false, reason: 'prereq' };
    }
    // Improving — JoaT does NOT bypass; spec: "gain but not improve".
    if (!meetsReal) return { allowed: false, reason: 'prereq' };
    return { allowed: true, cost };
  }

  /**
   * Bucket a talent into one of the four UI categories:
   *   'maxed' | 'improvable' | 'needTP' | 'unavailable'
   * Returns null for unknown / malformed talents.
   */
  classifyTalent(talentId) {
    const defs = (typeof TALENT_DEFS !== 'undefined') ? TALENT_DEFS : null;
    const def  = defs ? defs[talentId] : null;
    if (!def) return null;
    const v = this.buyVerdict(talentId);
    if (!v.allowed) {
      if (v.reason === 'maxed')  return 'maxed';
      if (v.reason === 'prereq') return 'unavailable';
      return null;
    }
    return ((this.talentPoints || 0) >= v.cost) ? 'improvable' : 'needTP';
  }

  /**
   * Equip-gate predicate. Pure function of (itemName, this.talents,
   * ItemDefs[itemName].wieldTalent). Returns { ok: true } when the
   * item has no wield gate, or the gate is satisfied. On failure
   * returns { ok: false, reason: 'lack-talent', talent: '<id>' } so
   * the caller can build a user-facing message without re-deriving
   * the missing talent.
   *
   * Unknown item / no-def / non-weapon → ok (no gate to enforce).
   * This is a model-layer rule: no logMsg, no rendering, no mutation.
   */
  canEquip(itemName) {
    if (!itemName) return { ok: true };
    const defs = (typeof ItemDefs !== 'undefined') ? ItemDefs : null;
    const def  = defs ? defs[itemName] : null;
    const need = def && def.wieldTalent;
    if (!need) return { ok: true };
    if (this.talents && this.talents[need]) return { ok: true };
    return { ok: false, reason: 'lack-talent', talent: need };
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
 * Damage-kind tags that bypass Toughness (corporal-only).
 * Add elemental tags here as new spell/effect damage sources land.
 * Anything not in the set is treated as corporal.
 */
Player.NON_CORPORAL_KINDS = new Set([
  'ifrit_fireball',  // heat
  'ifrit_aura',      // heat
]);

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

  // Count learned spells of a given tier. Used by the Level N Spell
  // talents to compute used-vs-available slots. Reads SPELL_DEFS to
  // resolve each learned spell's level; spells with no SPELL_DEFS
  // entry are skipped (unknown tier).
  countSpells({ level } = {}) {
    if (!this.spells) return 0;
    const defs = (typeof SPELL_DEFS !== 'undefined') ? SPELL_DEFS : {};
    let n = 0;
    for (const id of Object.keys(this.spells)) {
      const def = defs[id];
      if (def && def.level === level) n++;
    }
    return n;
  }
}
LocalPlayer.DEFAULT_QUICKSLOT_COUNT = 6;


Sentient.DEFAULT_COOLDOWNS = { move: 1.0, attack: 1.0, rest: 4.0 };


// ─── Corpse ────────────────────────────────────────────────
/**
 * A monster that died. Visual + schedulable; not playable. Decays in
 * two stages on game-time scheduler ticks (NOT wall clock, so a player
 * who walks away and comes back doesn't find rotted bones unless time
 * actually passed in-game):
 *
 *   stage 1: flesh corpse → bones at Corpse.LIFETIME turns (~50).
 *            Any remaining loot scatters to a floor pile at this tile
 *            via zone.dropAt(); the corpse's lootable is emptied.
 *   stage 2: bones removed entirely at +Corpse.BONES_DURATION (~100
 *            more turns) — total ~150 turns from spawn.
 *
 * Extends Sentient (not Entity) for the cooldown/scheduler machinery
 * (canAct, tick, fireDueConditions). hp/maxHp default to 0 — corpses
 * aren't alive, but the scheduler doesn't check isAlive.
 */
class Corpse extends Sentient {
  constructor(spec = {}) {
    super(spec);
    this.name     = spec.name     ?? 'corpse';
    this.isBones  = !!spec.isBones;
    this.lootable = spec.lootable ?? null;
    // Single-keyed cooldown table for the two-stage decay. actionCooldown
    // is initialized to the first stage's cost (saved as Date.now()
    // pre-Phase-4a-2.5; preserved across migration if spec.actionCooldown
    // is provided).
    const decayCost = this.isBones ? Corpse.BONES_DURATION : Corpse.LIFETIME;
    this.cooldowns      = spec.cooldowns      ?? { decay: decayCost };
    this.actionCooldown = spec.actionCooldown ?? decayCost;
  }

  /**
   * Scheduler tick. Called once when actionCooldown elapses.
   * ctx (built by engine.makeNpcCtx) carries the active Zone reference.
   *
   * Two stages of decay:
   *   stage 1 (flesh → bones): flip icon/name only. Loot stays on the
   *     corpse's lootable; the popup keeps showing it under a single
   *     section (icon becomes 🦴 visually but the loot is still there
   *     to grab).
   *   stage 2 (bones → vanish): scatter any remaining loot to the floor
   *     at this tile, then remove the corpse from the zone.
   */
  takeTurn(ctx) {
    if (!this.isBones) {
      // Stage 1: flesh → bones. Loot intact; just visual.
      this.isBones = true;
      this.icon    = Corpse.BONES_ICON;
      this.name    = 'pile of bones';
      this.cooldowns.decay = Corpse.BONES_DURATION;
      return 'decay';
    }
    // Stage 2: scatter remaining loot to the floor before removal so
    // the player can still pick it up if they come back here.
    if (this.lootable && this.lootable.size() > 0 && ctx && ctx.zone && ctx.zone.dropAt) {
      for (const stack of this.lootable.slots) {
        ctx.zone.dropAt(this.x, this.y, stack);
      }
      this.lootable.slots.length = 0;
    }
    if (ctx && ctx.zone && ctx.zone.removeCorpse) ctx.zone.removeCorpse(this);
    return 'decay';
  }
}
Corpse.LIFETIME       = 50;   // flesh → bones
Corpse.BONES_DURATION = 100;  // bones → removed (total 150 turns)
Corpse.BONES_ICON     = 'BONES_PILE';  // sentinel; render.js draws this specially

// Expose to the global concat scope.
window.Entity      = Entity;
window.Sentient    = Sentient;
window.Player      = Player;
window.LocalPlayer = LocalPlayer;
window.Condition   = Condition;
window.Corpse      = Corpse;
