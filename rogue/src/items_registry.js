// ============================================================
//  ITEMS REGISTRY  –  src/items_registry.js
//
//  Builds the global ItemDefs map (camelCase name → ItemDef) from
//  the LEGACY_ITEM_DATA table in state.js. ItemDefs is the only
//  runtime registry game code should read — LEGACY_ITEM_DATA is
//  source-data, not a registry, and exists only to feed this
//  builder. Eventual goal: hand-port each LEGACY_ITEM_DATA entry
//  into a `new ItemDef({...})` here directly, after which the
//  legacy table can be deleted.
//
//  Must be concatenated AFTER state.js (which declares
//  LEGACY_ITEM_DATA) and items.js (which defines the ItemDef class).
// ============================================================

const ItemDefs = {};

// Normalize an item spec's equip-slot rules into a canonical `equipGroups`:
// an array of slot-groups where the item, once equipped, fills every slot
// in exactly one chosen group. Inputs (priority order):
//   spec.equipTo:     ['leftHand','rightHand']  → one AND-group, fill both.
//   spec.equipChoice: ['leftHand','rightHand']  → two OR-groups, pick one.
//   spec.slot:        'chest'                   → one single-slot group.
//   spec.type='weapon' with none of the above   → defaults to ['leftHand'].
// Returns null when no equip semantics apply (consumables, ammo, etc.).
function _normalizeEquipGroups(spec) {
  const groups = [];
  if (Array.isArray(spec.equipTo) && spec.equipTo.length > 0) {
    groups.push(spec.equipTo.slice());
  }
  if (Array.isArray(spec.equipChoice) && spec.equipChoice.length > 0) {
    for (const s of spec.equipChoice) groups.push([s]);
  }
  if (groups.length === 0 && typeof spec.slot === 'string' && spec.slot) {
    groups.push([spec.slot]);
  }
  if (groups.length === 0 && spec.type === 'weapon') {
    groups.push(['leftHand']);
  }
  return groups.length > 0 ? groups : null;
}

// Turn a displayName like "Bag of Holding" into a camelCase identifier
// like "bagOfHolding". Punctuation and apostrophes are stripped.
function _toCamelCase(displayName) {
  const words = String(displayName)
    .replace(/['']/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  const head = words[0].toLowerCase();
  const tail = words.slice(1).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
  return head + tail;
}

(function buildItemDefsRegistry() {
  if (typeof LEGACY_ITEM_DATA === 'undefined') {
    console.warn('items_registry.js: LEGACY_ITEM_DATA not defined yet — registry empty');
    return;
  }
  const collisions = {};
  for (const [key, spec] of Object.entries(LEGACY_ITEM_DATA)) {
    const name = _toCamelCase(spec.name);
    if (!name) {
      console.warn(`items_registry.js: skipping ${key} (no derivable name from "${spec.name}")`);
      continue;
    }
    if (ItemDefs[name]) {
      // Two entries share a displayName → camelCase collision.
      // Keep the first; record the rest for inspection.
      (collisions[name] = collisions[name] || []).push({ key, existing: ItemDefs[name].icon });
      continue;
    }
    // Icon resolution: prefer explicit spec.icon if present (lets two
    // entries share a glyph by keying on camelCase name instead of
    // icon). Falls back to the dict key — the legacy shape uses the
    // icon as the key, so existing entries keep working unchanged.
    const icon = (typeof spec.icon === 'string' && spec.icon) ? spec.icon : key;
    const def = new ItemDef({
      ...spec,
      name,
      displayName: spec.name,
      icon,
      equipGroups: _normalizeEquipGroups(spec),
    });
    ItemDefs[name] = def;
    // Reverse map: emoji → def. First-wins, since icons need not be unique
    // across defs (e.g., 'gold' and 'uniqueCoin' both use 🪙). Keeping the
    // first registration gives byIcon() stable behavior — used by the
    // ItemStack.fromIcon migration helper that should eventually have
    // zero callers.
    if (!ItemDef._byIcon[icon]) ItemDef._byIcon[icon] = def;
  }
  const colCount = Object.keys(collisions).length;
  if (colCount > 0) {
    console.warn(`items_registry.js: ${colCount} camelCase name collisions (first wins):`, collisions);
  }
  console.log(`items_registry.js: built ${Object.keys(ItemDefs).length} ItemDefs from ${Object.keys(LEGACY_ITEM_DATA).length} LEGACY_ITEM_DATA entries`);
})();

window.ItemDefs = ItemDefs;

// ─── Direct (non-legacy) ItemDefs ──────────────────────────
// Items registered here bypass LEGACY_ITEM_DATA entirely.
// They can share icons with legacy items — the registry's
// camelCase key and _byIcon first-wins rule keep things clean.
ItemDefs.dagger = new ItemDef({
  name: 'dagger',
  displayName: 'Dagger',
  icon: '🔪',
  type: 'weapon',
  baseDmg: 5,
  maxGP: 50,
  wieldTalent: 'wieldDaggers',
});

ItemDefs.scumbleMainlyApples = new ItemDef({
  name: 'scumbleMainlyApples',
  displayName: 'Scumble (mainly apples)',
  icon: '🍺',
  type: 'food',
  maxGP: 2,
  maxHeal: 2,
  foodValue: 6,
  maxStack: 99,
});
