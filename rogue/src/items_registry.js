// ============================================================
//  ITEMS REGISTRY  –  src/items_registry.js
//
//  Builds the global ItemDefs map (camelCase name → ItemDef) from
//  the legacy emoji-keyed ITEM_DEF dictionary in state.js. Both
//  registries coexist during the migration; new code reads
//  ItemDefs[name], old code keeps reading ITEM_DEF[emoji] until
//  call sites are migrated one at a time.
//
//  Must be concatenated AFTER state.js (which declares ITEM_DEF)
//  and items.js (which defines the ItemDef class).
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
  if (typeof ITEM_DEF === 'undefined') {
    console.warn('items_registry.js: ITEM_DEF not defined yet — registry empty');
    return;
  }
  const collisions = {};
  for (const [icon, spec] of Object.entries(ITEM_DEF)) {
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
    // Reverse map: emoji → def. Used by ItemDef.byIcon() and
    // ItemStack.fromIcon() during the migration period.
    ItemDef._byIcon[icon] = def;
  }
  const colCount = Object.keys(collisions).length;
  if (colCount > 0) {
    console.warn(`items_registry.js: ${colCount} camelCase name collisions (first wins):`, collisions);
  }
  console.log(`items_registry.js: built ${Object.keys(ItemDefs).length} ItemDefs from ${Object.keys(ITEM_DEF).length} ITEM_DEF entries`);
})();

window.ItemDefs = ItemDefs;
