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
class Sentient extends Entity {
  constructor(spec = {}) {
    super(spec);
    this.hp    = spec.hp    ?? 0;
    this.maxHp = spec.maxHp ?? this.hp;
    this.mp    = spec.mp    ?? 0;
    this.maxMp = spec.maxMp ?? this.mp;
    this.stats         = spec.stats         ?? {};
    this.statusEffects = spec.statusEffects ?? {};
  }

  isAlive()    { return this.hp > 0; }
  isHostile()  { return false; }       // default; subclasses override
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
    super(spec);
    this.inventory = spec.inventory ?? new Array(Player.DEFAULT_INVENTORY_SIZE).fill(null);
    this.equipped  = spec.equipped  ?? {
      head: null, chest: null, legs: null, feet: null,
      leftHand: null, rightHand: null,
    };
    this.xp    = spec.xp    ?? 0;
    this.level = spec.level ?? 1;
    this.gp    = spec.gp    ?? 0;
  }
}
Player.DEFAULT_INVENTORY_SIZE = 30;


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


// Expose to the global concat scope.
window.Entity      = Entity;
window.Sentient    = Sentient;
window.Player      = Player;
window.LocalPlayer = LocalPlayer;
