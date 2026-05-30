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
// ── New tomes (from raw/spells.txt) ────────────────────────
ItemDefs.tomeOfBurningHands = new ItemDef({
  name: 'tomeOfBurningHands',
  displayName: 'Tome of Burning Hands',
  icon: '\uD83D\uDCD6\uD83D\uDD25',
  type: 'spell',
  spell: 'burningHands',
  maxGP: 600,
});
ItemDefs.tomeOfCureCondition = new ItemDef({
  name: 'tomeOfCureCondition',
  displayName: 'Tome of Cure Condition',
  icon: '\uD83D\uDCD6\uD83D\uDC8A',
  type: 'spell',
  spell: 'cureCondition',
  maxGP: 800,
});
ItemDefs.tomeOfHealWounds = new ItemDef({
  name: 'tomeOfHealWounds',
  displayName: 'Tome of Heal Wounds',
  icon: '\uD83D\uDCD6\uD83D\uDC9A',
  type: 'spell',
  spell: 'healWounds',
  maxGP: 1200,
});
ItemDefs.tomeOfHinder = new ItemDef({
  name: 'tomeOfHinder',
  displayName: 'Tome of Hinder',
  icon: '\uD83D\uDCD6\uD83D\uDCA8',
  type: 'spell',
  spell: 'hinder',
  maxGP: 700,
});
ItemDefs.tomeOfNecroticShroud = new ItemDef({
  name: 'tomeOfNecroticShroud',
  displayName: 'Tome of Necrotic Shroud',
  icon: '\uD83D\uDCD6\uD83D\uDC80',
  type: 'spell',
  spell: 'necroticShroud',
  maxGP: 1500,
});
ItemDefs.tomeOfNourish = new ItemDef({
  name: 'tomeOfNourish',
  displayName: 'Tome of Nourish',
  icon: '\uD83D\uDCD6\uD83C\uDF4E',
  type: 'spell',
  spell: 'nourish',
  maxGP: 500,
});

// ── New items from raw/spells.txt ─────────────────────────
ItemDefs.burningGloves = new ItemDef({
  name: 'burningGloves',
  displayName: 'Burning Gloves',
  icon: '\uD83E\uDDE4\uD83D\uDD25',
  type: 'equip',
  equipChoice: ['leftHand', 'rightHand'],
  equipGroups: [['leftHand'], ['rightHand']],
  maxGP: 250,
});
ItemDefs.antitoxin = new ItemDef({
  name: 'antitoxin',
  displayName: 'Antitoxin',
  icon: '\uD83D\uDC8A\uD83E\uDDA0',
  type: 'potion',
  maxHeal: 0,
  maxGP: 20,
  stackable: true,
  maxStack: 99,
});
ItemDefs.antibiotic = new ItemDef({
  name: 'antibiotic',
  displayName: 'Antibiotic',
  icon: '\uD83D\uDC8A\uD83E\uDDEC',
  type: 'potion',
  maxHeal: 0,
  maxGP: 30,
  stackable: true,
  maxStack: 99,
});
ItemDefs.smokeBomb = new ItemDef({
  name: 'smokeBomb',
  displayName: 'Smoke Bomb',
  icon: '\uD83D\uDCA8',
  type: 'scroll',
  spell: 'hinder',
  maxGP: 35,
  stackable: true,
  maxStack: 20,
});
ItemDefs.necroticSkin = new ItemDef({
  name: 'necroticSkin',
  displayName: 'Necrotic Skin',
  icon: '\uD83D\uDC7B',
  type: 'equip',
  slot: 'chest',
  equipGroups: [['chest']],
  maxGP: 2000,
});

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

ItemDefs.bread = new ItemDef({
  name: 'bread',
  displayName: 'Bread',
  icon: '🍞',
  type: 'food',
  maxGP: 1,
  maxHeal: 3,
  foodValue: 5,
  maxStack: 99,
});

ItemDefs.dwarfBread = new ItemDef({
  name: 'dwarfBread',
  displayName: 'Dwarf Bread (also a weapon)',
  icon: '🍖',
  type: 'food',
  maxGP: 3,
  maxHeal: 6,
  foodValue: 10,
  maxStack: 10,
  baseDmg: 3,
});

ItemDefs.lancreCheese = new ItemDef({
  name: 'lancreCheese',
  displayName: 'Lancre Cheese (legally a weapon)',
  icon: '🧀',
  type: 'food',
  maxGP: 2,
  maxHeal: 4,
  foodValue: 8,
  maxStack: 10,
  baseDmg: 2,
});

ItemDefs.innSewerAntsPolicy = new ItemDef({
  name: 'innSewerAntsPolicy',
  displayName: 'Inn-Sewer-Ants Policy',
  icon: '📜',
  type: 'scroll',
  maxGP: 25,
  stackable: true,
  maxStack: 99,
});

ItemDefs.perfectlyOrdinarySword = new ItemDef({
  name: 'perfectlyOrdinarySword',
  displayName: 'Perfectly Ordinary Sword',
  icon: '🗡️',
  type: 'weapon',
  maxGP: 60,
  baseDmg: 8,
  wieldTalent: 'wieldSwords',
});

ItemDefs.mysteriousDagger = new ItemDef({
  name: 'mysteriousDagger',
  displayName: 'Mysterious Dagger',
  icon: '🗡️',
  type: 'weapon',
  maxGP: 25,
  baseDmg: 7,
  wieldTalent: 'wieldDaggers',
});

ItemDefs.leatherGloves = new ItemDef({
  name: 'leatherGloves',
  displayName: 'Leather Gloves',
  icon: '🧤',
  type: 'equip',
  maxGP: 15,
  slot: 'gloves',
});

ItemDefs.tarnishedRing = new ItemDef({
  name: 'tarnishedRing',
  displayName: 'Tarnished Ring',
  icon: '💍',
  type: 'equip',
  maxGP: 50,
  slot: 'finger',
});

// ─── Unified shop item catalogs ──────────────────────────────
// Single source of truth for all NPC shop inventories. Each entry is
// { id: camelCaseItemDefsId, cost: buyPrice/stealValue, qty?: quantity }.
// Icon, displayName, and other properties are resolved from ItemDefs[id]
// at render time.
window.SHOP_ITEM_CATALOGS = {
  'apu': [
    { id: 'identifyScroll', cost: 30 },
    { id: 'townPortalScroll', cost: 5 },
    { id: 'healthPotion', cost: 40 },
    { id: 'antitoxin', cost: 20 },
    { id: 'antibiotic', cost: 30 },
    { id: 'smokeBomb', cost: 35 },
    { id: 'candle', cost: 15 },
    { id: 'pizza', cost: 10 },
    { id: 'curry', cost: 5 },
    { id: 'slurpee', cost: 5 },
    { id: 'milk', cost: 3 },
    { id: 'oyster', cost: 2 },
    { id: 'peanuts', cost: 1 },
    { id: 'goldBag', cost: 50 },
    { id: 'smallClothBag', cost: 10 },
    { id: 'leatherPurse', cost: 12 },
    { id: 'canvasTote', cost: 8 },
  ],
  'leftys': [
    { id: 'curry', cost: 5 },
    { id: 'slurpee', cost: 5 },
    { id: 'whiskey', cost: 15 },
    { id: 'wateredDownBeer', cost: 5 },
  ],
  'wizard': [
    { id: 'identifyScroll', cost: 25 },
    { id: 'townPortalScroll', cost: 5 },
    { id: 'tomeOfFireball', cost: 800 },
    { id: 'tomeOfIlluminate', cost: 400 },
    { id: 'tomeOfHealWounds', cost: 1200 },
    { id: 'tomeOfBurningHands', cost: 600 },
    { id: 'tomeOfCureCondition', cost: 800 },
    { id: 'tomeOfHinder', cost: 700 },
    { id: 'tomeOfNecroticShroud', cost: 1500 },
    { id: 'tomeOfNourish', cost: 500 },
    { id: 'wizardsWand', cost: 25000 },
    { id: 'properStaff', cost: 25000 },
  ],
  'bookstore': [
    { id: 'identifyScroll', cost: 25 },
    { id: 'townPortalScroll', cost: 5 },
    { id: 'tomeOfFireball', cost: 800 },
    { id: 'tomeOfIlluminate', cost: 400 },
    { id: 'tomeOfHealWounds', cost: 1200 },
    { id: 'tomeOfBurningHands', cost: 600 },
    { id: 'tomeOfCureCondition', cost: 800 },
    { id: 'tomeOfHinder', cost: 700 },
    { id: 'tomeOfNecroticShroud', cost: 1500 },
    { id: 'tomeOfNourish', cost: 500 },
    { id: 'wizardsWand', cost: 25000 },
    { id: 'properStaff', cost: 25000 },
  ],
  'dennis': [
    { id: 'bow', cost: 25 },
    { id: 'arrows', cost: 5, qty: 12 },
    { id: 'rawMeat', cost: 8 },
    { id: 'scarf', cost: 15 },
    { id: 'bread', cost: 3 },
  ],
  'mended_drum_barman': [
    { id: 'scumbleMainlyApples', cost: 4 },
    { id: 'dwarfBread', cost: 6 },
    { id: 'lancreCheese', cost: 5 },
    { id: 'innSewerAntsPolicy', cost: 50 },
    { id: 'perfectlyOrdinarySword', cost: 120 },
  ],
  'blacksmith': [
    { id: 'sword', cost: 100 },
    { id: 'shield', cost: 150 },
    { id: 'staff', cost: 30 },
    { id: 'dagger', cost: 80 },
    { id: 'burningGloves', cost: 250 },
    { id: 'necroticSkin', cost: 2000 },
  ],
};
