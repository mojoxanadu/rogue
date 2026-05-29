// ============================================================
//  ITEMS MODEL  –  src/items.js
//
//  UX-AGNOSTIC class definitions for items. No rendering, no DOM,
//  no input. This file defines WHAT an item is; views/controllers
//  decide how to display or react to one.
//
//  Two classes:
//    ItemDef    — the catalog entry. "Healing Potion costs 25 GP,
//                 heals up to 30 HP, max stack 99." One per
//                 distinct kind of item in the game.
//    ItemStack  — what occupies an inventory slot. References an
//                 ItemDef by canonical camelCase name and carries
//                 a `qty` (always 1 for non-stackable, 1+ for
//                 stackable). For container items (bags), the
//                 constructor also initializes a `slots` array —
//                 there is no separate Container subclass, since
//                 "is this a container?" is fully derivable from
//                 def.isContainer().
//
//  Items are identified in code by camelCase strings (e.g.
//  'healingPotion'), NEVER by their emoji icon. The emoji is
//  display-only and lives on the def. This decouples gameplay
//  logic from rendering.
//
//  See items_registry.js for how the registry is populated from
//  the LEGACY_ITEM_DATA table in state.js.
// ============================================================

// ─── Constants (no magic numbers) ─────────────────────────────
//   STACKABLE_DEFAULT_MAX_QTY — fallback when a stackable item's
//   spec omits maxStack. The game uses 99 as the default cap for
//   most stackable items (food, ammo).
//   NON_STACKABLE_QTY — a stack of a non-stackable item is always
//   exactly one unit (maxStack=1).
const STACKABLE_DEFAULT_MAX_QTY = 99;
const NON_STACKABLE_QTY = 1;


// ─── ItemDef ─────────────────────────────────────────────────
/**
 * Catalog entry for an item. Constructed from a spec object that
 * carries everything that varies between items: name, icon, type,
 * stat bonuses, slot, stackability, container slot count, etc.
 *
 * All spec properties are copied onto the instance (Object.assign)
 * so existing code reading `def.baseDmg`, `def.evadePercent`, etc.
 * continues to work without per-property mapping.
 *
 * Two name forms:
 *   - `name`        – canonical camelCase identifier ('healingPotion').
 *                     This is the lookup key in the ItemDefs registry
 *                     and what ItemStack.itemName stores.
 *   - `displayName` – human-readable string ('Healing Potion').
 *                     For UI rendering only.
 */
class ItemDef {
  constructor(spec) {
    if (!spec || !spec.name)        throw new Error('ItemDef requires a name');
    if (!spec.icon)                 throw new Error(`ItemDef ${spec.name} requires an icon`);
    if (!spec.displayName)          throw new Error(`ItemDef ${spec.name} requires a displayName`);
    if (!spec.type)                 throw new Error(`ItemDef ${spec.name} requires a type`);
    Object.assign(this, spec);
    // maxStack is the single source of truth for stack capacity.
    // Legacy data may carry a `stackable` boolean — fold it into
    // maxStack and discard, so the def has no redundant fields.
    if (spec.maxStack === undefined) {
      this.maxStack = spec.stackable ? STACKABLE_DEFAULT_MAX_QTY : NON_STACKABLE_QTY;
    }
    delete this.stackable;
    // Register in the reverse icon-lookup map so byIcon(icon) works
    // for direct ItemDefs (not just LEGACY_ITEM_DATA entries).
    if (ItemDef._byIcon && !ItemDef._byIcon[this.icon]) {
      ItemDef._byIcon[this.icon] = this;
    }
  }

  /**
   * True if this def represents a carryable container (a bag).
   * Sole predicate is bagSlots > 0 — the legacy `type === 'bag'`
   * field is a category label, not the source of truth here.
   */
  isContainer() {
    return this.bagSlots > 0;
  }

  /**
   * Canonical user-facing label for log/UI text: "🏹 Bow".
   * Centralized so a design tweak (e.g. drop the icon, bold the
   * name) lands in one place instead of every logMsg site.
   * Never use `def.name` in user-facing strings — that field is
   * the camelCase id; `displayName` and `icon` are the renderables.
   */
  label() {
    return `${this.icon ?? ''} ${this.displayName ?? this.name}`.trim();
  }

  // ─── Static helpers ────────────────────────────────────────
  //  The class is the front door for catalog operations. Free
  //  functions like a global `iconOf` would pollute the global
  //  namespace and collide with future *_Def patterns.

  /**
   * Look up an item's display icon (emoji) by its camelCase name.
   * Returns '?' for unknown names rather than throwing — caller
   * gets a visible breadcrumb at the render site.
   *
   * Used to interpolate icons into UI/log strings, e.g.:
   *   logMsg(`Picked up ${ItemDef.iconOf('oldBoot')}!`)
   */
  static iconOf(name) {
    const def = (typeof ItemDefs !== 'undefined') ? ItemDefs[name] : null;
    return def ? def.icon : '?';
  }

  /**
   * Reverse lookup: emoji → ItemDef. Used during the migration
   * period when call sites still hold emoji literals. Returns null
   * for icons not in the catalog.
   *
   * Backed by ItemDef._byIcon (populated by items_registry.js).
   */
  static byIcon(icon) {
    return ItemDef._byIcon[icon] || null;
  }
}
ItemDef._byIcon = {};


// ─── ItemStack ───────────────────────────────────────────────
/**
 * A slot's contents: which item, how many. Slots in any inventory
 * (top-level or inside a container) hold an ItemStack or null.
 *
 * Stores the item's canonical name (camelCase), not the def itself,
 * so stacks survive a def-registry rebuild and serialize trivially.
 * Use the `def` getter to fetch the live ItemDef.
 *
 * For non-stackable items, qty is always 1.
 * For containers, this class is wrong — use Container instead.
 */
class ItemStack {
  constructor(itemName, qty = NON_STACKABLE_QTY) {
    if (typeof itemName !== 'string') throw new Error('ItemStack requires a string itemName');
    this.itemName = itemName;
    this.qty = qty;
    // If this stack's def is a container, initialize the inner slots
    // array. There is no Container subclass — the existence of `slots`
    // IS the "I am a container" signal at the instance level.
    const def = this.def;
    if (def && def.isContainer()) {
      this.slots = new Array(def.bagSlots).fill(null);
    }
  }

  /** The live ItemDef (looked up in the global ItemDefs registry). */
  get def() {
    return (typeof ItemDefs !== 'undefined') ? ItemDefs[this.itemName] : null;
  }

  /** Display icon (emoji). Convenience for code that used `.icon` on the old `{icon, qty}` shape. */
  get icon() {
    return this.def ? this.def.icon : '?';
  }

  /** Human-readable name. */
  get displayName() {
    return this.def ? this.def.displayName : this.itemName;
  }

  /**
   * True if this stack can absorb more of the same item.
   * Non-stackable items have maxStack=1 by construction, so they
   * are never "has room" once placed.
   */
  hasRoom() {
    return !!this.def && this.qty < this.def.maxStack;
  }

  /**
   * Try to merge `count` units of the same item into this stack.
   * Returns the number actually merged (may be less than count if
   * the stack fills up). Caller handles the remainder.
   */
  addQty(count) {
    if (!this.def || count <= 0) return 0;
    const room = this.def.maxStack - this.qty;
    if (room <= 0) return 0;
    const moved = Math.min(room, count);
    this.qty += moved;
    return moved;
  }

  /** True if this stack has its own inner slots (i.e., it's a bag). */
  isContainer() {
    return Array.isArray(this.slots);
  }

  /**
   * Find an existing stack of `itemName` with room for more units,
   * searching this container's slots and recursing into any nested
   * containers. Returns the stack or null.
   *
   * Breadth-first: this container's own slots are exhausted before
   * recursing — items consolidate at the top level before being
   * tucked into bags.
   *
   * No-op (returns null) if this stack isn't a container.
   */
  findRoom(itemName) {
    if (!this.isContainer()) return null;
    for (const s of this.slots) {
      if (s && !s.isContainer() && s.itemName === itemName && s.hasRoom()) return s;
    }
    for (const s of this.slots) {
      if (s && s.isContainer()) {
        const found = s.findRoom(itemName);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Find the first empty slot. Breadth-first: this container's own
   * slots first, then recurse into nested containers — so dropping
   * an item lands in the main inventory when there's room, with
   * bags acting as overflow.
   *
   * Returns `{ container, idx }` (where `container` is the ItemStack
   * holding the empty slot) or null. No-op if this stack isn't a
   * container.
   */
  findFreeSlot() {
    if (!this.isContainer()) return null;
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i] === null) return { container: this, idx: i };
    }
    for (const s of this.slots) {
      if (s && s.isContainer()) {
        const r = s.findFreeSlot();
        if (r) return r;
      }
    }
    return null;
  }

  // ─── Static factory (migration helper) ─────────────────────
  /**
   * Build an ItemStack from a legacy emoji + qty pair. Existing
   * call sites today write `{ icon: '🥾', qty: 1 }`; this factory
   * lets them migrate to ItemStack instances in one mechanical
   * step. Once all call sites are converted, code can construct
   * via `new ItemStack('oldBoot', 1)` and this factory falls out
   * of use.
   *
   * If the icon isn't in the catalog, returns a stack whose
   * itemName is the icon itself (so the data isn't lost) and
   * logs a warning. That lets migration proceed without halting
   * on icons that haven't been added to LEGACY_ITEM_DATA yet.
   */
  static fromIcon(icon, qty = NON_STACKABLE_QTY) {
    const def = ItemDef.byIcon(icon);
    if (def) return new ItemStack(def.name, qty);
    console.warn(`ItemStack.fromIcon: no def for icon '${icon}', using icon as itemName`);
    return new ItemStack(icon, qty);
  }
}


// Expose to the global concat scope.
window.ItemDef   = ItemDef;
window.ItemStack = ItemStack;
