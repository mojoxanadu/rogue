'use strict';

// loot.js — Lootable model class.
//
// A Lootable is a world-bound bundle of loot stacks, optionally lockable.
// It is the single abstraction the popup UI (Phase 4) reads from, and the
// single thing the lock/unlock mechanics (Phase 5) operate on. Today the
// game has three parallel concepts:
//
//   itemsOnGround[]   — { x, y, icon }, no quantities, no locking
//   corpse.loot[]     — ItemStacks owned by a visual corpse
//   chest tiles (now retired) — locked container with chestLoot baked at gen time
//
// Phases 2-6 fold all three into Lootable. Phase 1 (this file) just
// defines the class and leaves the existing structures alone, so the
// game continues to play while later phases migrate call sites.
//
// Design notes:
//
//   * Owner kind is an enum, not a class hierarchy. The class is the same;
//     callers tag what produced it so the popup can render appropriate
//     headings ("Ghost:", "Floor:", "[🔒] Chest:"). A subclass per owner
//     would force visual concerns down into the model.
//
//   * Position (x, y) is optional. An NPC's pickpocket-loot Lootable is
//     conceptually carried, not placed. The popup will read position from
//     the owner when needed.
//
//   * Slots hold ItemStack instances directly. No qty-1 unrolling. This
//     matches the in-inventory representation so transfers don't need
//     translation. (itemsOnGround's qty-less {icon} shape is a legacy of
//     Phase 0 and goes away in Phase 6.)
//
//   * Lock state is intentionally simple now: isLocked + lockKind. The
//     actual unlock methods (key, master key, cast unlock, pick lock,
//     kick) and per-kind difficulty land in Phase 5; this class just
//     carries the data fields they will read.

class Lootable extends Entity {
  /**
   * @param {object} opts
   * @param {string} opts.ownerKind - one of Lootable.OWNER_KINDS
   * @param {number|null} [opts.x=null]
   * @param {number|null} [opts.y=null]
   * @param {ItemStack[]} [opts.slots=[]]
   * @param {boolean} [opts.isLocked=false]
   * @param {string|null} [opts.lockKind=null]  - 'wood' | 'iron' | 'magic' | null
   * @param {string|null} [opts.icon=null]      - explicit icon (containers/doors);
   *                                              floor piles derive from slot[0]
   * @param {number|null} [opts.id=null]        - auto-assigned if null
   */
  constructor({
    ownerKind,
    x = null,
    y = null,
    slots = [],
    isLocked = false,
    lockKind = null,
    icon = null,
    id = null,
    def = null,
  } = {}) {
    super({ x, y, icon: icon ?? '?', def });
    // Entity's constructor folds null x/y down to 0 via `?? 0`. Lootables
    // OWNED by another entity (corpse / npc) have NO position of their
    // own — they live inside the owner. Reset to null when caller didn't
    // pass an explicit position, so the debug dump and any other code
    // can distinguish "placed at (0,0)" from "contained, no position".
    if (x == null) this.x = null;
    if (y == null) this.y = null;
    if (!Lootable.OWNER_KINDS.has(ownerKind)) {
      throw new Error(`Lootable: invalid ownerKind '${ownerKind}'. Must be one of: ${[...Lootable.OWNER_KINDS].join(', ')}`);
    }
    if (!Array.isArray(slots)) {
      throw new Error('Lootable: slots must be an array');
    }
    if (isLocked && lockKind == null) {
      throw new Error('Lootable: isLocked=true requires a lockKind');
    }
    this.id        = id ?? Lootable._nextId();
    this.ownerKind = ownerKind;
    this.slots     = slots;
    this.isLocked  = isLocked;
    this.lockKind  = lockKind;
  }

  /**
   * Visible icon for a Lootable that's drawn on the map:
   *   - floor pile: first stack's icon (auto-updates as items add/remove)
   *   - container / door: the explicit icon passed at construction
   *   - corpse / npc: null — these lootables live inside their owner and
   *     never render separately; the owner (Corpse / NPC) draws its own
   *     icon. Returning null instead of '?' avoids polluting debug
   *     dumps with meaningless placeholders.
   */
  get icon() {
    if (this.ownerKind === 'floor') {
      const top = this.slots[0];
      return (top && top.icon) ? top.icon : '?';
    }
    if (this.ownerKind === 'corpse' || this.ownerKind === 'npc') return null;
    return this._icon;
  }
  set icon(v) { this._icon = v; }

  /** Append a stack to the loot. */
  add(stack) {
    this.slots.push(stack);
  }

  /** Remove and return the stack at `idx`, or null if out-of-range. */
  remove(idx) {
    if (idx < 0 || idx >= this.slots.length) return null;
    return this.slots.splice(idx, 1)[0];
  }

  isEmpty() { return this.slots.length === 0; }
  size()    { return this.slots.length; }
}

Lootable.OWNER_KINDS = new Set(['floor', 'corpse', 'container', 'npc', 'door']);
Lootable._idCounter  = 0;
Lootable._nextId     = function() { return ++Lootable._idCounter; };

if (typeof window !== 'undefined') window.Lootable = Lootable;
