// containers.test.js — verifies the 15 world-bound container ItemDefs
// added in Phase 3 of the loot/containers refactor.
//
// Loads state.js (real LEGACY_ITEM_DATA), items.js, items_registry.js
// in the harness and asserts each container is registered with the
// expected fields. Expected shape comes verbatim from the design notes:
// slot count, lockable/impassable flags. Containers cannot be picked
// up (that's what type:'bag' is for).

const test   = require('node:test');
const assert = require('node:assert/strict');
const { newContext, loadInto } = require('./_harness');

function loadCatalog() {
  const ctx = newContext();
  // state.js has top-level DOM/browser API calls. Stub the minimum
  // surface area to let it load without a real browser environment:
  //   - navigator: touch-detection probe
  //   - document.getElementById('gameCanvas'): canvas resize
  //   - document.documentElement: viewport sizing fallback
  ctx.navigator = { maxTouchPoints: 0 };
  const fakeCanvas = { width: 0, height: 0, getContext: () => ({}) };
  ctx.document = {
    getElementById: () => fakeCanvas,
    documentElement: { clientWidth: 800, clientHeight: 600 },
    addEventListener: () => {},
  };
  ctx.visualViewport = null;
  ctx.innerWidth = 800;
  ctx.innerHeight = 600;
  loadInto(ctx, 'items.js', 'state.js', 'items_registry.js');
  return ctx;
}

// Expected shape per container, keyed by camelCase name.
const EXPECTED = {
  box:             { slots: 2,  lockable: undefined, impassable: true     },
  barrel:          { slots: 2,  lockable: undefined, impassable: true     },
  endTable:        { slots: 2,  lockable: undefined, impassable: true     },
  strongbox:       { slots: 3,  lockable: true,     impassable: undefined },
  smallCrate:      { slots: 3,  lockable: undefined, impassable: undefined },
  smallChest:      { slots: 4,  lockable: true,     impassable: undefined },
  table:           { slots: 4,  lockable: undefined, impassable: true     },
  largeChest:      { slots: 7,  lockable: true,     impassable: true     },
  largeCrate:      { slots: 7,  lockable: undefined, impassable: undefined },
  ironChest:       { slots: 9,  lockable: true,     impassable: true     },
  longTable:       { slots: 9,  lockable: undefined, impassable: true     },
  safe:            { slots: 12, lockable: true,     impassable: true     },
  boxOfHolding:    { slots: 15, lockable: undefined, impassable: undefined },
  chestOfHolding:  { slots: 20, lockable: true,     impassable: undefined },
  safeOfHolding:   { slots: 30, lockable: true,     impassable: true     },
};

test('all 15 container defs register with type "container"', () => {
  const { ItemDefs } = loadCatalog();
  for (const name of Object.keys(EXPECTED)) {
    const def = ItemDefs[name];
    assert.ok(def, `missing container def: ${name}`);
    assert.equal(def.type, 'container', `${name}: wrong type`);
  }
});

test('container slot counts match design notes', () => {
  const { ItemDefs } = loadCatalog();
  for (const [name, exp] of Object.entries(EXPECTED)) {
    assert.equal(ItemDefs[name].bagSlots, exp.slots,
      `${name}: expected ${exp.slots} slots, got ${ItemDefs[name].bagSlots}`);
  }
});

test('container flags (lockable/impassable) match notes', () => {
  const { ItemDefs } = loadCatalog();
  for (const [name, exp] of Object.entries(EXPECTED)) {
    const def = ItemDefs[name];
    assert.equal(def.lockable,   exp.lockable,   `${name}: lockable mismatch`);
    assert.equal(def.impassable, exp.impassable, `${name}: impassable mismatch`);
  }
});

test('no container is pickupable (containers are world-bound only)', () => {
  const { ItemDefs } = loadCatalog();
  for (const name of Object.keys(EXPECTED)) {
    assert.equal(ItemDefs[name].pickupable, undefined,
      `${name}: containers must not carry a pickupable flag`);
  }
});

test('ItemDef.isContainer() returns true for all new containers', () => {
  const { ItemDefs } = loadCatalog();
  for (const name of Object.keys(EXPECTED)) {
    assert.equal(ItemDefs[name].isContainer(), true,
      `${name}: isContainer() should be true (bagSlots > 0)`);
  }
});

