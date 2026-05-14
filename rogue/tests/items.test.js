// items.test.js — unit tests for ItemDef, ItemStack, Container (src/items.js).
//
// Each test loads items.js fresh into a sandboxed VM context (see _harness.js),
// then stubs the global ItemDefs registry that the classes consult via getters.
// No reliance on items_registry.js or LEGACY_ITEM_DATA — pure unit tests
// of the class behavior.

const test   = require('node:test');
const assert = require('node:assert/strict');
const { loadSrc } = require('./_harness');

// Helper: build a fresh ctx with items.js loaded plus a small stub registry.
function setup(extraDefs = {}) {
  const ctx = loadSrc('items.js');
  const { ItemDef } = ctx;
  // Default catalog entries used across tests.
  const defs = {
    oldBoot:       new ItemDef({ name:'oldBoot',       displayName:'Old Boot',       icon:'🥾', type:'armor',  slot:'feet' }),
    healingPotion: new ItemDef({ name:'healingPotion', displayName:'Healing Potion', icon:'🧪', type:'potion', stackable:true, maxHeal:10 }),
    arrow:         new ItemDef({ name:'arrow',         displayName:'Arrow',          icon:'➶',  type:'ammo',   stackable:true, maxStack:50 }),
    smallBag:      new ItemDef({ name:'smallBag',      displayName:'Small Bag',      icon:'🎒', type:'bag',    bagSlots:3 }),
    bigBag:        new ItemDef({ name:'bigBag',        displayName:'Big Bag',        icon:'🧳', type:'bag',    bagSlots:5 }),
    ...extraDefs,
  };
  ctx.ItemDefs = defs;
  for (const d of Object.values(defs)) ItemDef._byIcon[d.icon] = d;
  return ctx;
}


// ─── ItemDef: construction ────────────────────────────────────

test('ItemDef requires name, icon, displayName, type', () => {
  const { ItemDef } = loadSrc('items.js');
  assert.throws(() => new ItemDef({}),                                       /requires a name/);
  assert.throws(() => new ItemDef({ name:'x' }),                             /requires an icon/);
  assert.throws(() => new ItemDef({ name:'x', icon:'X' }),                   /requires a displayName/);
  assert.throws(() => new ItemDef({ name:'x', icon:'X', displayName:'X' }),  /requires a type/);
});

test('ItemDef copies arbitrary spec properties for back-compat', () => {
  const { ItemDef } = loadSrc('items.js');
  const def = new ItemDef({ name:'sword', icon:'🗡️', displayName:'Sword', type:'weapon', baseDmg:5, customField:'whatever' });
  assert.equal(def.baseDmg, 5);
  assert.equal(def.customField, 'whatever');
});

test('ItemDef: maxStack is the single source for stack capacity', () => {
  const { ItemDef } = loadSrc('items.js');
  // Explicit maxStack wins
  const explicit = new ItemDef({ name:'e', icon:'E', displayName:'E', type:'food', maxStack:25 });
  assert.equal(explicit.maxStack, 25);

  // Legacy stackable:true → folded into maxStack=99 default, stackable discarded
  const legacy = new ItemDef({ name:'a', icon:'A', displayName:'A', type:'food', stackable:true });
  assert.equal(legacy.maxStack, 99);
  assert.equal(legacy.stackable, undefined, 'stackable should not be exposed on instance');

  // Legacy stackable:false (or omitted) → maxStack=1
  const nonStackable = new ItemDef({ name:'c', icon:'C', displayName:'C', type:'weapon' });
  assert.equal(nonStackable.maxStack, 1);
  assert.equal(nonStackable.stackable, undefined);
});

test('ItemDef.isContainer true for bag type or bagSlots>0', () => {
  const { ItemDef } = loadSrc('items.js');
  const bag    = new ItemDef({ name:'bag', icon:'B', displayName:'Bag', type:'bag', bagSlots:5 });
  const sword  = new ItemDef({ name:'sword', icon:'S', displayName:'Sword', type:'weapon' });
  assert.equal(bag.isContainer(), true);
  assert.equal(sword.isContainer(), false);
});


// ─── ItemDef: static helpers ──────────────────────────────────

test('ItemDef.iconOf returns def.icon for known name', () => {
  const { ItemDef } = setup();
  assert.equal(ItemDef.iconOf('oldBoot'),       '🥾');
  assert.equal(ItemDef.iconOf('healingPotion'), '🧪');
});

test('ItemDef.iconOf returns "?" for unknown name', () => {
  const { ItemDef } = setup();
  assert.equal(ItemDef.iconOf('garbage'), '?');
});

test('ItemDef.byIcon resolves emoji to def', () => {
  const { ItemDef } = setup();
  assert.equal(ItemDef.byIcon('🥾').name, 'oldBoot');
  assert.equal(ItemDef.byIcon('🧪').name, 'healingPotion');
});

test('ItemDef.byIcon returns null for unknown emoji', () => {
  const { ItemDef } = setup();
  assert.equal(ItemDef.byIcon('❓'), null);
});


// ─── ItemStack ────────────────────────────────────────────────

test('ItemStack requires a string itemName', () => {
  const { ItemStack } = loadSrc('items.js');
  assert.throws(() => new ItemStack(), /requires a string itemName/);
  assert.throws(() => new ItemStack(42), /requires a string itemName/);
});

test('ItemStack getters: def, icon, displayName via registry', () => {
  const { ItemStack } = setup();
  const stack = new ItemStack('healingPotion', 3);
  assert.equal(stack.def.name,     'healingPotion');
  assert.equal(stack.icon,         '🧪');
  assert.equal(stack.displayName,  'Healing Potion');
});

test('ItemStack getters return "?" / itemName for unknown name', () => {
  const { ItemStack } = setup();
  const stack = new ItemStack('phantom');
  assert.equal(stack.def,         undefined);
  assert.equal(stack.icon,        '?');
  assert.equal(stack.displayName, 'phantom');
});

test('ItemStack.hasRoom: true for stackable below max, false otherwise', () => {
  const { ItemStack } = setup();
  const arrowStack = new ItemStack('arrow', 49);  // arrow maxStack=50
  assert.equal(arrowStack.hasRoom(), true);
  arrowStack.qty = 50;
  assert.equal(arrowStack.hasRoom(), false);
  const bootStack = new ItemStack('oldBoot');     // non-stackable
  assert.equal(bootStack.hasRoom(), false);
});

test('ItemStack.addQty: merges up to maxStack, returns count moved', () => {
  const { ItemStack } = setup();
  const stack = new ItemStack('healingPotion', 95);  // max 99
  assert.equal(stack.addQty(2),  2);   // fits
  assert.equal(stack.qty,        97);
  assert.equal(stack.addQty(10), 2);   // only 2 more room
  assert.equal(stack.qty,        99);
  assert.equal(stack.addQty(5),  0);   // full
});

test('ItemStack.addQty: zero for non-stackable', () => {
  const { ItemStack } = setup();
  const stack = new ItemStack('oldBoot');
  assert.equal(stack.addQty(5), 0);
  assert.equal(stack.qty,        1);
});


// ─── ItemStack.fromIcon factory ───────────────────────────────

test('ItemStack.fromIcon: resolves emoji to itemName via _byIcon', () => {
  const { ItemStack } = setup();
  const stack = ItemStack.fromIcon('🧪', 5);
  assert.equal(stack.itemName,    'healingPotion');
  assert.equal(stack.qty,         5);
  assert.equal(stack.displayName, 'Healing Potion');
});

test('ItemStack.fromIcon: unknown icon falls back to icon-as-name', (t) => {
  const { ItemStack } = setup();
  // Silence the expected console.warn
  t.mock.method(console, 'warn', () => {});
  const stack = ItemStack.fromIcon('❓', 1);
  assert.equal(stack.itemName, '❓');
  assert.equal(stack.icon,     '?');   // because def is missing
});


// ─── ItemStack as container ───────────────────────────────────
//   No separate Container subclass. An ItemStack whose def is a
//   container auto-initializes a `slots` array; its absence on
//   non-container stacks is the "I'm not a bag" signal.

test('ItemStack of a container def has slots; of a non-container def does not', () => {
  const { ItemStack } = setup();
  const bag      = new ItemStack('smallBag');     // bagSlots: 3
  const potion   = new ItemStack('healingPotion'); // not a container
  assert.equal(bag.isContainer(),    true);
  assert.equal(bag.slots.length,     3);
  assert.deepEqual(bag.slots,        [null, null, null]);
  assert.equal(potion.isContainer(), false);
  assert.equal(potion.slots,         undefined);
});

test('ItemStack.findFreeSlot / findRoom are no-ops on non-container stacks', () => {
  const { ItemStack } = setup();
  const potion = new ItemStack('healingPotion');
  assert.equal(potion.findFreeSlot(),  null);
  assert.equal(potion.findRoom('any'), null);
});

test('findFreeSlot returns first empty top-level slot (breadth-first)', () => {
  const { ItemStack } = setup();
  const outer = new ItemStack('bigBag');     // 5 slots
  const inner = new ItemStack('smallBag');   // 3 slots
  outer.slots[0] = new ItemStack('oldBoot');
  outer.slots[1] = inner;
  inner.slots[0] = new ItemStack('arrow', 1);
  // outer.slots[2] is null — first free at top level
  const r = outer.findFreeSlot();
  assert.equal(r.container, outer);
  assert.equal(r.idx, 2);
});

test('findFreeSlot recurses into nested only when outer is full', () => {
  const { ItemStack } = setup();
  const outer = new ItemStack('smallBag');   // 3 slots
  const inner = new ItemStack('smallBag');
  outer.slots[0] = new ItemStack('oldBoot');
  outer.slots[1] = inner;
  outer.slots[2] = new ItemStack('oldBoot');
  inner.slots[0] = new ItemStack('arrow', 1);
  inner.slots[1] = null;   // first free is inside inner
  inner.slots[2] = null;
  const r = outer.findFreeSlot();
  assert.equal(r.container, inner);
  assert.equal(r.idx, 1);
});

test('findRoom locates an existing stack with room, recursively', () => {
  const { ItemStack } = setup();
  const outer = new ItemStack('bigBag');
  const inner = new ItemStack('smallBag');
  outer.slots[0] = inner;
  inner.slots[0] = new ItemStack('arrow', 5);   // max 50, has room

  const found = outer.findRoom('arrow');
  assert.notEqual(found, null);
  assert.equal(found.itemName, 'arrow');
  assert.equal(found.qty, 5);
});

test('findRoom returns null when no matching stack has room', () => {
  const { ItemStack } = setup();
  const outer = new ItemStack('smallBag');
  outer.slots[0] = new ItemStack('arrow', 50);  // full
  assert.equal(outer.findRoom('arrow'),         null);
  assert.equal(outer.findRoom('healingPotion'), null);
});
