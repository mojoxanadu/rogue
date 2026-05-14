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
  for (const [icon, spec] of Object.entries(LEGACY_ITEM_DATA)) {
    const name = _toCamelCase(spec.name);
    if (!name) {
      console.warn(`items_registry.js: skipping ${icon} (no derivable name from "${spec.name}")`);
      continue;
    }
    if (ItemDefs[name]) {
      // Two emoji entries share a displayName → camelCase collision.
      // Keep the first; record the rest for inspection.
      (collisions[name] = collisions[name] || []).push({ icon, existing: ItemDefs[name].icon });
      continue;
    }
    const def = new ItemDef({
      ...spec,
      name,
      displayName: spec.name,
      icon,
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
