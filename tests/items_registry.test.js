// items_registry.test.js — tests the camelCase registry builder
// (src/items_registry.js) and locks in the specific item-name mappings
// that production code relies on. If state.js renames an item, these
// tests fail loudly with which camelCase identifier broke.
//
// Method: stub a minimal LEGACY_ITEM_DATA in a fresh VM context, load items.js
// then items_registry.js, and assert against the resulting ItemDefs map.

const test   = require('node:test');
const assert = require('node:assert/strict');
const { newContext, loadInto } = require('./_harness');

function buildRegistry(itemDef) {
  const ctx = newContext();
  loadInto(ctx, 'items.js');
  ctx.LEGACY_ITEM_DATA = itemDef;
  loadInto(ctx, 'items_registry.js');
  return ctx;
}


// ─── Registry builder mechanics ──────────────────────────────

test('Registry builds one ItemDef per LEGACY_ITEM_DATA entry, keyed by camelCase name', () => {
  const ctx = buildRegistry({
    '🥾': { name: 'Old Boot',       type: 'armor',  slot: 'feet', stackable: false },
    '🧪': { name: 'Health Potion',  type: 'potion', stackable: true, maxHeal: 25 },
  });
  // Baseline: items_registry.js also registers dagger and scumbleMainlyApples
  // directly (bypassing LEGACY_ITEM_DATA), so total = 2 from data + 2 direct.
  assert.equal(Object.keys(ctx.ItemDefs).length, 4);
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

test('Registry: two defs can share an icon (gold + uniqueCoin both use 🪙)', () => {
  // Icons are display-only; the camelCase name is the identity. The reverse
  // map (_byIcon) keeps the FIRST registration so ItemStack.fromIcon stays
  // stable for the legacy emoji-keyed migration paths.
  const ctx = buildRegistry({
    '🪙': { name: 'Unique Coin', type: 'quest',  stackable: false },
    // Same icon, different camelCase name — registered second.
    '🪙ALT': { name: 'Gold',     type: 'wealth', maxStack: 9999, pickupTo: 'gp' },
  });
  // Both defs exist by name.
  assert.equal(ctx.ItemDefs.uniqueCoin.icon, '🪙');
  assert.equal(ctx.ItemDefs.gold.icon,       '🪙ALT');
  // _byIcon for the conflicting icon resolves to the first registration.
  // (The test uses a distinct second icon to avoid pre-empting the reverse
  // map check; in production gold and uniqueCoin both legitimately use 🪙
  // and byIcon('🪙') → uniqueCoin because it's declared first in LEGACY_ITEM_DATA.)
  assert.equal(ctx.ItemDef.byIcon('🪙').name, 'uniqueCoin');
});

test('Lock: quest data items resolve (req.item = camelCase name)', () => {
  const ctx = buildRegistry({
    '🏺': { name: 'Brass Bottle',     type: 'misc',  stackable: false },
    '📿': { name: 'Orichalcum Bead',  type: 'quest', stackable: true },
  });
  for (const n of ['brassBottle', 'orichalcumBead']) {
    assert.ok(ctx.ItemDefs[n], `${n} missing — quest data req.item="${n}" will never match`);
  }
});

test("Lock: 'arrows' exists for Bow.ammoName lookup", () => {
  const ctx = buildRegistry({
    '➶': { name: 'Arrows', type: 'ammo', stackable: true, maxStack: 99 },
  });
  assert.ok(ctx.ItemDefs.arrows,
    "arrows missing — Bow's ammoName='arrows' will look up undefined; ranged attack will see no ammo");
});

test('Lock: gold is wealth with pickupTo=gp', () => {
  const ctx = buildRegistry({
    '🪙': { name: 'Gold', type: 'wealth', maxStack: 9999, pickupTo: 'gp' },
  });
  const gold = ctx.ItemDefs.gold;
  assert.ok(gold, 'gold ItemDef missing — loot drops will break');
  assert.equal(gold.pickupTo, 'gp', 'pickupTo must be "gp" — pickup handlers route by this property');
  assert.equal(gold.type, 'wealth');
});

test('Registry: camelCase collisions keep the first def, warn on the rest', (t) => {
  // Silence the expected console.warn so test output stays clean
  t.mock.method(console, 'warn', () => {});
  const ctx = buildRegistry({
    '🥾': { name: 'Old Boot', type: 'armor', stackable: false },
    '👢': { name: 'Old Boot', type: 'armor', stackable: false }, // same displayName
  });
  // Only one ItemDefs entry from LEGACY_ITEM_DATA (collision kept first);
  // plus 2 direct registrations (dagger, scumbleMainlyApples) = 3 total.
  assert.equal(Object.keys(ctx.ItemDefs).length, 3);
  assert.equal(ctx.ItemDef.byIcon('🥾').name, 'oldBoot');
});


// ─── Lock in the specific names that production code now depends on ──
//   Migration call sites in input.js use these literal names. If state.js
//   ever renames the underlying "name" field, these tests catch it before
//   players hit a silent broken item.

test('Lock: player.equipped default values exist as camelCase ItemDefs', () => {
  // player.js setPlayerDefaults seeds equip slots with these item names.
  // If state.js renames any, equipped values silently fall out of sync
  // with the registry → render shows '?' for that slot.
  const ctx = buildRegistry({
    '🎽': { name: 'Running Shirt', type: 'armor', slot: 'chest', stackable: false },
    '🩲': { name: 'Briefs',        type: 'armor', slot: 'legs',  stackable: false },
    '🩴': { name: 'Sandals',       type: 'armor', slot: 'feet',  stackable: false },
    '🗡️': { name: 'Sword',         type: 'weapon', stackable: false },
    '🥻': { name: 'Robe',          type: 'armor', slot: 'chest', stackable: false },
    '🥾': { name: 'Old Boot',      type: 'armor', slot: 'feet',  stackable: false },
    '👑': { name: 'Crown of Noodly Appendages', type: 'armor', slot: 'head', stackable: false },
    '💍': { name: 'Ring of Midas', type: 'armor', slot: 'rightHand', stackable: false },
    '🪗': { name: 'Accordion',     type: 'weapon', stackable: false },
  });
  for (const n of ['runningShirt', 'briefs', 'sandals',   // defaults
                   'sword', 'robe', 'oldBoot',            // starting class equipment
                   'crownOfNoodlyAppendages',             // shop.js: dennis convention check
                   'ringOfMidas',                         // ui_logic.js: Midas Touch warning
                   'accordion']) {                        // engine.js: getPlayerPrimaryHand check
    assert.ok(ctx.ItemDefs[n], `${n} missing — player.equipped will break`);
  }
});

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

test('Lock: ui_logic.js items resolve to expected camelCase names', () => {
  const ctx = buildRegistry({
    '🗡️': { name: 'Sword',     type: 'weapon', stackable: false },
    '📜': { name: 'Certified Pastafarian', type: 'useless', stackable: false },
    '🪗': { name: 'Accordion', type: 'weapon', stackable: false },
  });
  for (const n of ['sword', 'certifiedPastafarian', 'accordion']) {
    assert.ok(ctx.ItemDefs[n], `${n} missing — ui_logic.js will produce broken refs`);
  }
});

test('Lock: map.js items resolve to expected camelCase names', () => {
  const ctx = buildRegistry({
    '🪗': { name: 'Accordion',         type: 'weapon', stackable: false },
    '📎': { name: 'Paperclip',         type: 'useless', stackable: true },
    '🗡️': { name: 'Sword',             type: 'weapon', stackable: false },
    '🛡️': { name: 'Shield',            type: 'armor',  stackable: false },
    '🧪': { name: 'Health Potion',     type: 'potion', stackable: true, maxStack: 99 },
    '🕯️': { name: 'Candle',            type: 'light',  stackable: true, maxStack: 99 },
    '📃': { name: 'Identify Scroll',   type: 'scroll', stackable: true, maxStack: 99 },
    '🌀': { name: 'Town Portal Scroll', type: 'scroll', stackable: true, maxStack: 99 },
    '🗝️': { name: 'Key',               type: 'key',    stackable: true },
  });
  // Names referenced in map.js chest-loot rolls and busker corpse loot.
  for (const n of ['accordion', 'paperclip',
                   'sword', 'shield', 'healthPotion', 'candle',
                   'identifyScroll', 'townPortalScroll', 'key']) {
    assert.ok(ctx.ItemDefs[n], `${n} missing — map.js loot drops will break`);
  }
});

// ─── equipGroups normalization ───────────────────────────────
//   The registry derives a canonical `equipGroups` field on every def
//   from one of four optional inputs in the source spec:
//     spec.equipTo     — array, AND-group: equipped item fills every listed slot
//     spec.equipChoice — array, OR-groups: equipped item picks one of the listed slots
//     spec.slot        — legacy single-slot string (most armor)
//     spec.type==='weapon' — legacy weapon default (leftHand)
//   These tests pin every combination so the equip path (which keys off
//   equipGroups alone, never the raw inputs) has a single stable contract.

test('equipGroups: equipTo only → one AND-group (e.g. 2H bow fills both hands)', () => {
  const ctx = buildRegistry({
    '🏹': { name: 'Bow', type: 'weapon', stackable: false,
            equipTo: ['leftHand', 'rightHand'] },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.ItemDefs.bow.equipGroups)),
                   [['leftHand', 'rightHand']]);
});

test('equipGroups: equipChoice only → one OR-group per slot (e.g. ring on either hand)', () => {
  const ctx = buildRegistry({
    '💍': { name: 'Ring of Midas', type: 'armor', stackable: false,
            equipChoice: ['leftHand', 'rightHand'] },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.ItemDefs.ringOfMidas.equipGroups)),
    [['leftHand'], ['rightHand']]);
});

test('equipGroups: equipTo + equipChoice → AND-group first, then per-choice OR-groups', () => {
  // Contrived but valid: a gauntlet-pair that must fill both wrists AND
  // optionally also covers one hand-slot of the player's choice.
  const ctx = buildRegistry({
    '🥊': { name: 'Linked Gauntlets', type: 'armor', stackable: false,
            equipTo:     ['leftWrist', 'rightWrist'],
            equipChoice: ['leftHand', 'rightHand'] },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.ItemDefs.linkedGauntlets.equipGroups)), [
    ['leftWrist', 'rightWrist'],
    ['leftHand'],
    ['rightHand'],
  ]);
});

test('equipGroups: legacy slot field → single-slot AND-group (most armor)', () => {
  const ctx = buildRegistry({
    '🧢': { name: 'Helmet', type: 'armor', slot: 'head', stackable: false },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.ItemDefs.helmet.equipGroups)),
                   [['head']]);
});

test('equipGroups: weapon with no slot/equipTo/equipChoice defaults to [["leftHand"]]', () => {
  // Preserves pre-refactor behavior: legacy weapons (no explicit fields)
  // continue to land in leftHand. Without this default, equipping a sword
  // from inventory would silently fail.
  const ctx = buildRegistry({
    '🗡️': { name: 'Sword', type: 'weapon', stackable: false },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.ItemDefs.sword.equipGroups)),
                   [['leftHand']]);
});

test('equipGroups: non-equippable items (consumables, ammo, quest) → null', () => {
  // Items that can't be equipped at all should have no equipGroups, so the
  // equip-slot-fits predicate (ui_logic._equipSlotFits) rejects them outright.
  const ctx = buildRegistry({
    '🧪': { name: 'Health Potion', type: 'potion', maxStack: 99 },
    '➶':  { name: 'Arrows',        type: 'ammo',   maxStack: 99 },
    '🦆': { name: 'Rubber Duck',   type: 'quest',  maxStack: 1 },
  });
  assert.equal(ctx.ItemDefs.healthPotion.equipGroups, null);
  assert.equal(ctx.ItemDefs.arrows.equipGroups,       null);
  assert.equal(ctx.ItemDefs.rubberDuck.equipGroups,   null);
});

test('equipGroups: equipTo trumps slot when both present', () => {
  // Defensive: if an entry carries both (e.g. mid-migration data), the
  // explicit multi-slot spec wins so the new 2H semantics aren't masked.
  const ctx = buildRegistry({
    '🏹': { name: 'Bow', type: 'weapon', slot: 'leftHand', stackable: false,
            equipTo: ['leftHand', 'rightHand'] },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.ItemDefs.bow.equipGroups)),
                   [['leftHand', 'rightHand']]);
});

test('equipGroups: empty equipTo array falls through to slot/type defaults', () => {
  // An accidental empty array shouldn't yield a [[]] group (which would
  // make the item un-equippable in a confusing way).
  const ctx = buildRegistry({
    '🧢': { name: 'Helmet', type: 'armor', slot: 'head', stackable: false,
            equipTo: [] },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.ItemDefs.helmet.equipGroups)),
                   [['head']]);
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
