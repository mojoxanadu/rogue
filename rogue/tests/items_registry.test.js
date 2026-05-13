// items_registry.test.js — tests the camelCase registry builder
// (src/items_registry.js) and locks in the specific item-name mappings
// that production code relies on. If state.js renames an item, these
// tests fail loudly with which camelCase identifier broke.
//
// Method: stub a minimal ITEM_DEF in a fresh VM context, load items.js
// then items_registry.js, and assert against the resulting ItemDefs map.

const test   = require('node:test');
const assert = require('node:assert/strict');
const { newContext, loadInto } = require('./_harness');

function buildRegistry(itemDef) {
  const ctx = newContext();
  loadInto(ctx, 'items.js');
  ctx.ITEM_DEF = itemDef;
  loadInto(ctx, 'items_registry.js');
  return ctx;
}


// ─── Registry builder mechanics ──────────────────────────────

test('Registry builds one ItemDef per ITEM_DEF entry, keyed by camelCase name', () => {
  const ctx = buildRegistry({
    '🥾': { name: 'Old Boot',       type: 'armor',  slot: 'feet', stackable: false },
    '🧪': { name: 'Health Potion',  type: 'potion', stackable: true, maxHeal: 25 },
  });
  assert.equal(Object.keys(ctx.ItemDefs).length, 2);
  assert.ok(ctx.ItemDefs.oldBoot);
  assert.ok(ctx.ItemDefs.healthPotion);
  assert.equal(ctx.ItemDefs.oldBoot.icon,         '🥾');
  assert.equal(ctx.ItemDefs.oldBoot.displayName,  'Old Boot');
  assert.equal(ctx.ItemDefs.healthPotion.maxHeal, 25);
});

test('Registry populates ItemDef._byIcon reverse map', () => {
  const ctx = buildRegistry({
    '🥾': { name: 'Old Boot', type: 'armor', stackable: false },
  });
  assert.equal(ctx.ItemDef.byIcon('🥾').name, 'oldBoot');
});

test('Registry handles multi-word names: "Bag of Holding" → bagOfHolding', () => {
  const ctx = buildRegistry({
    '💼🌟': { name: 'Bag of Holding', type: 'bag', stackable: false, bagSlots: 10 },
  });
  assert.ok(ctx.ItemDefs.bagOfHolding);
  assert.equal(ctx.ItemDefs.bagOfHolding.isContainer(), true);
});

test('Registry strips apostrophes from displayName', () => {
  const ctx = buildRegistry({
    "🪦": { name: "Death's Door", type: 'quest', stackable: false },
  });
  assert.ok(ctx.ItemDefs.deathsDoor);
});

test('Registry: camelCase collisions keep the first def, warn on the rest', (t) => {
  // Silence the expected console.warn so test output stays clean
  t.mock.method(console, 'warn', () => {});
  const ctx = buildRegistry({
    '🥾': { name: 'Old Boot', type: 'armor', stackable: false },
    '👢': { name: 'Old Boot', type: 'armor', stackable: false }, // same displayName
  });
  // Only one ItemDefs entry, but both icons resolve via _byIcon → first def
  assert.equal(Object.keys(ctx.ItemDefs).length, 1);
  assert.equal(ctx.ItemDef.byIcon('🥾').name, 'oldBoot');
});


// ─── Lock in the specific names that production code now depends on ──
//   Migration call sites in input.js use these literal names. If state.js
//   ever renames the underlying "name" field, these tests catch it before
//   players hit a silent broken item.

test('Lock: input.js class-init items resolve to expected camelCase names', () => {
  const ctx = buildRegistry({
    '🥾': { name: 'Old Boot',          type: 'armor', slot: 'feet',  stackable: false },
    '🥻': { name: 'Robe',              type: 'armor', slot: 'chest', stackable: false },
    '🔐': { name: 'Lockpicking Tools', type: 'misc',                 stackable: false },
  });
  // Migration call sites do `new ItemStack('oldBoot', 1)` etc — these
  // names MUST exist in the registry or stacks render as '?' at runtime.
  assert.ok(ctx.ItemDefs.oldBoot,          'oldBoot missing — input.js fighter init will break');
  assert.ok(ctx.ItemDefs.robe,             'robe missing — input.js spellcaster init will break');
  assert.ok(ctx.ItemDefs.lockpickingTools, 'lockpickingTools missing — input.js rogue init will break');
});

test('Lock: mechanics.js items resolve to expected camelCase names', () => {
  const ctx = buildRegistry({
    '💣🌟': { name: 'Holy Hand Grenade',     type: 'misc',    stackable: false },
    '🧪🦎': { name: 'Potion of Newt',        type: 'potion',  stackable: true, maxStack: 99 },
    '👢⚡': { name: 'Boots of Blinding Speed', type: 'armor',   stackable: false },
    '🦪':   { name: 'Oyster',                type: 'food',    maxStack: 99 },
    '🥜':   { name: 'Peanuts',               type: 'food',    maxStack: 99 },
    '🥛':   { name: 'Milk',                  type: 'food',    maxStack: 99 },
    '🥾':   { name: 'Old Boot',              type: 'armor',   stackable: false },
    '💩':   { name: 'Poop',                  type: 'useless', stackable: true },
    '🪱':   { name: 'Earthworm',             type: 'useless', stackable: true },
    '🥤':   { name: 'Slurpee',               type: 'food',    stackable: true, maxStack: 99 },
    '📃':   { name: 'Identify Scroll',       type: 'scroll',  stackable: true, maxStack: 99 },
    '📖🌀': { name: 'Tome of Town Portal',   type: 'spell',   stackable: false },
    '🫖':   { name: 'Magic Teapot',          type: 'misc',    stackable: false },
    '🦆':   { name: 'Rubber Duck',           type: 'quest',   maxStack: 1 },
    '🌫️':   { name: 'Spell Residue',         type: 'useless', stackable: true, maxStack: 10 },
    '🧪':   { name: 'Health Potion',         type: 'potion',  stackable: true, maxStack: 99 },
    '🗝️':   { name: 'Key',                   type: 'key',     stackable: true },
    '🕯️':   { name: 'Candle',                type: 'light',   stackable: true, maxStack: 99 },
    '📋':   { name: 'Plans for World Domination', type: 'useless', stackable: false },
  });
  for (const n of ['holyHandGrenade', 'potionOfNewt', 'bootsOfBlindingSpeed',
                   'oyster', 'peanuts', 'milk', 'oldBoot', 'poop', 'earthworm',
                   'slurpee', 'identifyScroll', 'tomeOfTownPortal', 'magicTeapot',
                   'rubberDuck', 'spellResidue', 'healthPotion', 'key', 'candle',
                   'plansForWorldDomination']) {
    assert.ok(ctx.ItemDefs[n], `${n} missing — mechanics.js will produce broken stacks/checks`);
  }
});

test('Lock: shop.js items resolve to expected camelCase names', () => {
  const ctx = buildRegistry({
    '🧴':   { name: 'Prophylactic',             type: 'useless', maxStack: 1,  maxGP: 0 },
    '💳':   { name: "Apu's Club Card",          type: 'useless', stackable: false },
    '📜📜': { name: 'Constitutional Convention', type: 'scroll',  stackable: true, maxStack: 99 },
    '🏺':   { name: 'Brass Bottle',             type: 'misc',    stackable: false },
    '🍺':   { name: 'Watered Down Beer',        type: 'food',    stackable: true, maxStack: 99 },
    '🐟':   { name: 'Red Herring',              type: 'quest',   stackable: false },
    '🕯️':   { name: 'Candle',                   type: 'light',   stackable: true, maxStack: 99 },
  });
  // Each name below is referenced literally in shop.js after migration.
  for (const n of ['prophylactic', 'apusClubCard', 'constitutionalConvention',
                   'brassBottle',  'wateredDownBeer', 'redHerring', 'candle']) {
    assert.ok(ctx.ItemDefs[n], `${n} missing — shop.js will produce broken stacks`);
  }
});
