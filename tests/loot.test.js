// loot.test.js — unit tests for the Lootable class.
//
// Pure model-layer tests; no DOM, no game state, no ItemStack required
// (slots are validated as Array but their contents aren't inspected).

const test   = require('node:test');
const assert = require('node:assert/strict');
const { loadSrc } = require('./_harness');

function setup() {
  // Lootable extends Entity (Phase 4a-2.5), so entities.js must load first.
  return loadSrc('entities.js', 'loot.js');
}

// ─── Construction ─────────────────────────────────────────────

test('Lootable: minimal construction sets defaults', () => {
  const { Lootable } = setup();
  const l = new Lootable({ ownerKind: 'floor' });
  assert.equal(l.ownerKind, 'floor');
  // Lootables OWNED by another entity (corpse/npc) have no position of
  // their own — Lootable resets x/y back to null when caller didn't
  // pass an explicit position. (Entity would have folded null → 0.)
  assert.equal(l.x, null);
  assert.equal(l.y, null);
  assert.equal(l.slots.length, 0);
  assert.equal(l.isLocked, false);
  assert.equal(l.lockKind, null);
  assert.equal(typeof l.id, 'number');
});

test('Lootable: carries position when given', () => {
  const { Lootable } = setup();
  const l = new Lootable({ ownerKind: 'corpse', x: 5, y: 7 });
  assert.equal(l.x, 5);
  assert.equal(l.y, 7);
});

test('Lootable: carries slots array by reference', () => {
  const { Lootable } = setup();
  const stacks = [{ itemName: 'gold', qty: 5 }, { itemName: 'key' }];
  const l = new Lootable({ ownerKind: 'corpse', slots: stacks });
  assert.equal(l.slots, stacks);
  assert.equal(l.size(), 2);
});

test('Lootable: locked container needs a lockKind', () => {
  const { Lootable } = setup();
  assert.throws(() => new Lootable({ ownerKind: 'container', isLocked: true }),
    /requires a lockKind/);
});

test('Lootable: locked construction stores lockKind', () => {
  const { Lootable } = setup();
  const l = new Lootable({ ownerKind: 'container', isLocked: true, lockKind: 'iron', slots: [] });
  assert.equal(l.isLocked, true);
  assert.equal(l.lockKind, 'iron');
});

// ─── Validation ───────────────────────────────────────────────

test('Lootable: rejects invalid ownerKind', () => {
  const { Lootable } = setup();
  assert.throws(() => new Lootable({ ownerKind: 'bogus' }),
    /invalid ownerKind/);
});

test('Lootable: rejects non-array slots', () => {
  const { Lootable } = setup();
  assert.throws(() => new Lootable({ ownerKind: 'floor', slots: 'not-array' }),
    /slots must be an array/);
});

test('Lootable: all enum values accepted', () => {
  const { Lootable } = setup();
  for (const kind of ['floor', 'corpse', 'container', 'npc', 'door']) {
    const l = new Lootable({ ownerKind: kind });
    assert.equal(l.ownerKind, kind);
  }
});

// ─── add / remove / isEmpty / size ────────────────────────────

test('Lootable: add appends to slots', () => {
  const { Lootable } = setup();
  const l = new Lootable({ ownerKind: 'floor' });
  assert.equal(l.isEmpty(), true);
  l.add({ itemName: 'gold', qty: 3 });
  l.add({ itemName: 'key' });
  assert.equal(l.size(), 2);
  assert.equal(l.isEmpty(), false);
  assert.equal(l.slots[0].itemName, 'gold');
  assert.equal(l.slots[1].itemName, 'key');
});

test('Lootable: remove pops the indexed stack and returns it', () => {
  const { Lootable } = setup();
  const l = new Lootable({
    ownerKind: 'corpse',
    slots: [{ itemName: 'a' }, { itemName: 'b' }, { itemName: 'c' }],
  });
  const removed = l.remove(1);
  assert.equal(removed.itemName, 'b');
  assert.equal(l.size(), 2);
  assert.equal(l.slots[0].itemName, 'a');
  assert.equal(l.slots[1].itemName, 'c');
});

test('Lootable: remove returns null for out-of-range index', () => {
  const { Lootable } = setup();
  const l = new Lootable({ ownerKind: 'floor', slots: [{ itemName: 'a' }] });
  assert.equal(l.remove(-1), null);
  assert.equal(l.remove(99), null);
  assert.equal(l.size(), 1);
});

// ─── id assignment ────────────────────────────────────────────

test('Lootable: auto-assigned ids are unique within a context', () => {
  const { Lootable } = setup();
  const a = new Lootable({ ownerKind: 'floor' });
  const b = new Lootable({ ownerKind: 'floor' });
  const c = new Lootable({ ownerKind: 'floor' });
  assert.notEqual(a.id, b.id);
  assert.notEqual(b.id, c.id);
  assert.notEqual(a.id, c.id);
});

test('Lootable: explicit id overrides auto-assignment', () => {
  const { Lootable } = setup();
  const l = new Lootable({ ownerKind: 'floor', id: 999 });
  assert.equal(l.id, 999);
});

// ─── OWNER_KINDS set ──────────────────────────────────────────

test('Lootable.OWNER_KINDS is the canonical enum', () => {
  const { Lootable } = setup();
  assert.ok(Lootable.OWNER_KINDS instanceof Set);
  assert.equal(Lootable.OWNER_KINDS.size, 5);
  for (const k of ['floor', 'corpse', 'container', 'npc', 'door']) {
    assert.ok(Lootable.OWNER_KINDS.has(k), `missing kind ${k}`);
  }
});
