// ============================================================
//  ITEMS MODEL  –  src/items.js
//
//  UX-AGNOSTIC class definitions for items. No rendering, no DOM,
//  no input. This file defines WHAT an item is; views/controllers
//  decide how to display or react to one.
//
//  Three classes:
//    ItemDef    — the catalog entry. "Healing Potion costs 25 GP,
//                 heals up to 30 HP, stackable to 99." One per
//                 distinct kind of item in the game.
//    ItemStack  — what occupies an inventory slot. References an
//                 ItemDef by canonical camelCase name and carries
//                 a `qty` for stackable items.
//    Container  — an ItemStack subclass for items that have their
//                 own internal slots (bags, pouches, chests).
//                 Stack qty is always 1; slots can hold any
//                 ItemStack including nested Containers.
//
//  Items are identified in code by camelCase strings (e.g.
//  'healingPotion'), NEVER by their emoji icon. The emoji is
//  display-only and lives on the def. This decouples gameplay
//  logic from rendering.
//
//  See items_registry.js for how the registry is populated from
//  the legacy emoji-keyed ITEM_DEF in state.js.
// ============================================================

// ─── Constants (no magic numbers) ─────────────────────────────
//   STACKABLE_DEFAULT_MAX_QTY — if an ItemDef has stackable=true
//   but does not specify maxStack, this is the cap. The game uses
//   99 as the default for most stackable items (food, ammo).
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
    this.stackable = !!spec.stackable;
    if (this.stackable && !spec.maxStack) this.maxStack = STACKABLE_DEFAULT_MAX_QTY;
    if (!this.stackable)                  this.maxStack = NON_STACKABLE_QTY;
  }

  /** True if this def represents a carryable container (a bag). */
  isContainer() {
    return this.type === 'bag' || this.bagSlots > 0;
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

  /** True if this stack can absorb more of the same item. */
  hasRoom() {
    if (!this.def || !this.def.stackable) return false;
    return this.qty < this.def.maxStack;
  }

  /**
   * Try to merge `count` units of the same item into this stack.
   * Returns the number actually merged (may be less than count if
   * the stack fills up). Caller handles the remainder.
   */
  addQty(count) {
    if (!this.def || !this.def.stackable || count <= 0) return 0;
    const room = this.def.maxStack - this.qty;
    const moved = Math.min(room, count);
    this.qty += moved;
    return moved;
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
   * on icons that haven't been added to ITEM_DEF yet.
   */
  static fromIcon(icon, qty = NON_STACKABLE_QTY) {
    const def = ItemDef.byIcon(icon);
    if (def) return new ItemStack(def.name, qty);
    console.warn(`ItemStack.fromIcon: no def for icon '${icon}', using icon as itemName`);
    return new ItemStack(icon, qty);
  }
}


// ─── Container ───────────────────────────────────────────────
/**
 * An ItemStack subclass for carryable containers (bags, pouches).
 * The stack itself takes up one slot in a parent inventory; its
 * `slots` array holds nested ItemStacks (or nulls). Stacks of
 * containers are always qty=1 — containers are never stackable.
 *
 * Auto-placement logic (e.g., picking up an item) recurses through
 * a player's inventory and into every Container's slots looking for
 * an existing stack with room or a free slot. See findRoom() and
 * findFreeSlot() — both return descriptors that identify where the
 * space is (which container, which slot index).
 */
class Container extends ItemStack {
  constructor(itemName) {
    super(itemName, NON_STACKABLE_QTY);
    const def = this.def;
    if (!def) throw new Error(`Container: no def for '${itemName}'`);
    if (!def.isContainer()) throw new Error(`Container: def '${itemName}' is not a container type`);
    if (!def.bagSlots || def.bagSlots < 1) {
      throw new Error(`Container: def '${itemName}' has no positive bagSlots`);
    }
    this.slots = new Array(def.bagSlots).fill(null);
  }

  /**
   * Find an existing ItemStack of `itemName` with room for more units.
   * Returns the stack, or null. Breadth-first: this container's own
   * slots are searched in full before recursing into any nested
   * containers, so items consolidate at the top level before being
   * tucked into bags.
   */
  findRoom(itemName) {
    // Same level first.
    for (const s of this.slots) {
      if (s && !(s instanceof Container) && s.itemName === itemName && s.hasRoom()) return s;
    }
    // Then recurse, in slot order.
    for (const s of this.slots) {
      if (s instanceof Container) {
        const found = s.findRoom(itemName);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Find the first empty slot. Breadth-first across containers (this
   * container's own slots are exhausted before recursing into nested
   * ones) — so dropping an item lands in the player's main inventory
   * if there's room, only tucking into bags as overflow.
   *
   * Returns `{ container, idx }` or null.
   */
  findFreeSlot() {
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i] === null) return { container: this, idx: i };
    }
    for (const s of this.slots) {
      if (s instanceof Container) {
        const r = s.findFreeSlot();
        if (r) return r;
      }
    }
    return null;
  }
}


// Expose to the global concat scope.
window.ItemDef   = ItemDef;
window.ItemStack = ItemStack;
window.Container = Container;
