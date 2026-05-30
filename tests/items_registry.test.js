// items_registry.test.js — locks in the item names that production code
// depends on, and verifies the registry is consistent.

const test   = require('node:test');
const assert = require('node:assert/strict');
const { newContext, loadInto } = require('./_harness');

function buildRegistry() {
  const ctx = newContext();
  loadInto(ctx, 'items.js', 'items_registry.js');
  return ctx;
}


// ─── Sanity ──────────────────────────────────────────────────

test('Registry is non-empty', () => {
  const ctx = buildRegistry();
  assert.ok(Object.keys(ctx.ItemDefs).length > 0, 'ItemDefs should contain items');
});

test('ItemDef._byIcon reverse map works', () => {
  const ctx = buildRegistry();
  const gold = ctx.ItemDef.byIcon('🪙');
  assert.ok(gold);
  assert.equal(gold.name, 'gold');
});


// ─── Locks: names referenced in production code ─────────────
//   These match @rogue/src/*.js call sites. If an item is ever
//   renamed, the right test fails and the fix is a single-line
//   change here.

test('Lock: player.equipped default values', () => {
  const ctx = buildRegistry();
  for (const n of ['runningShirt', 'briefs', 'sandals',
                   'sword', 'robe', 'oldBoot',
                   'crownOfNoodlyAppendages',
                   'ringOfMidas',
                   'accordion']) {
    assert.ok(ctx.ItemDefs[n], `${n} missing — player.equipped / shop / engine will break`);
  }
});

test('Lock: input.js class-init items', () => {
  const ctx = buildRegistry();
  for (const n of ['oldBoot', 'robe', 'lockpickingTools']) {
    assert.ok(ctx.ItemDefs[n], `${n} missing — input.js class init will break`);
  }
});

test('Lock: mechanics.js items', () => {
  const ctx = buildRegistry();
  for (const n of ['holyHandGrenade', 'potionOfNewt', 'bootsOfBlindingSpeed',
                   'oyster', 'peanuts', 'milk', 'oldBoot', 'poop', 'earthworm',
                   'slurpee', 'identifyScroll', 'tomeOfTownPortal', 'magicTeapot',
                   'rubberDuck', 'spellResidue', 'healthPotion', 'key', 'candle',
                   'plansForWorldDomination']) {
    assert.ok(ctx.ItemDefs[n], `${n} missing — mechanics.js will break`);
  }
});

test('Lock: ui_logic.js items', () => {
  const ctx = buildRegistry();
  for (const n of ['sword', 'certifiedPastafarian', 'accordion']) {
    assert.ok(ctx.ItemDefs[n], `${n} missing — ui_logic.js will break`);
  }
});

test('Lock: map.js items (loot drops)', () => {
  const ctx = buildRegistry();
  for (const n of ['accordion', 'paperclip',
                   'sword', 'shield', 'healthPotion', 'candle',
                   'identifyScroll', 'townPortalScroll', 'key']) {
    assert.ok(ctx.ItemDefs[n], `${n} missing — map.js loot drops will break`);
  }
});

test('Lock: shop.js items', () => {
  const ctx = buildRegistry();
  for (const n of ['prophylactic', 'apusClubCard', 'constitutionalConvention',
                   'brassBottle', 'wateredDownBeer', 'redHerring', 'candle']) {
    assert.ok(ctx.ItemDefs[n], `${n} missing — shop.js will break`);
  }
});

test('Lock: Bow ammoName points to arrows', () => {
  const ctx = buildRegistry();
  assert.ok(ctx.ItemDefs.arrows, 'arrows missing — Bow.ammoName lookup will break');
});

test('Lock: gold is wealth with pickupTo=gp', () => {
  const ctx = buildRegistry();
  const gold = ctx.ItemDefs.gold;
  assert.ok(gold, 'gold ItemDef missing');
  assert.equal(gold.pickupTo, 'gp');
  assert.equal(gold.type, 'wealth');
});

test('Lock: quest data items resolve', () => {
  const ctx = buildRegistry();
  for (const n of ['brassBottle', 'orichalcumBead']) {
    assert.ok(ctx.ItemDefs[n], `${n} missing — quest data req.item lookup will break`);
  }
});

test('Staff is either-hand weapon', () => {
  const ctx = buildRegistry();
  const staff = ctx.ItemDefs.staff;
  assert.ok(staff);
  assert.deepEqual(
    JSON.parse(JSON.stringify(staff.equipGroups)),
    [['leftHand'], ['rightHand']]
  );
});

test('Sword defaults to leftHand only', () => {
  const ctx = buildRegistry();
  const sword = ctx.ItemDefs.sword;
  assert.ok(sword);
  assert.deepEqual(
    JSON.parse(JSON.stringify(sword.equipGroups)),
    [['leftHand']]
  );
});

test('Non-equippable items have no equipGroups', () => {
  const ctx = buildRegistry();
  for (const n of ['healthPotion', 'arrows', 'rubberDuck']) {
    assert.equal(ctx.ItemDefs[n].equipGroups, undefined,
      `${n} should have equipGroups=undefined (non-equippable)`);
  }
});

test('Bow is two-handed (AND-group)', () => {
  const ctx = buildRegistry();
  assert.deepEqual(
    JSON.parse(JSON.stringify(ctx.ItemDefs.bow.equipGroups)),
    [['leftHand', 'rightHand']]
  );
});
