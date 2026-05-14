// entities.test.js — unit tests for Entity/Sentient/Player/LocalPlayer.
//
// Pure model-layer tests; no DOM, no game state. The classes are
// pure data containers + helper methods; we exercise the construction
// shape and the few methods that compute things (distanceTo, isAlive).

const test   = require('node:test');
const assert = require('node:assert/strict');
const { loadSrc } = require('./_harness');

function setup() {
  return loadSrc('entities.js');
}

// ─── Entity ───────────────────────────────────────────────────

test('Entity defaults: position 0,0 and "?" icon', () => {
  const { Entity } = setup();
  const e = new Entity();
  assert.equal(e.x, 0);
  assert.equal(e.y, 0);
  assert.equal(e.icon, '?');
  assert.equal(e.zone, null);
  assert.equal(e.def,  null);
});

test('Entity.distanceTo: Manhattan distance', () => {
  const { Entity } = setup();
  const e = new Entity({ x: 3, y: 5 });
  assert.equal(e.distanceTo(3, 5), 0);
  assert.equal(e.distanceTo(0, 0), 8);
  assert.equal(e.distanceTo(5, 5), 2);
  assert.equal(e.distanceTo(3, -2), 7);
});

test('Entity carries its spec fields', () => {
  const { Entity } = setup();
  const e = new Entity({ x: 1, y: 2, icon: '🐀', def: { name: 'rat' } });
  assert.equal(e.x, 1);
  assert.equal(e.y, 2);
  assert.equal(e.icon, '🐀');
  assert.equal(e.def.name, 'rat');
});


// ─── Entity.moveTo (canonical motion) ─────────────────────────
// Needs Zone, so we load world.js too in these.
function setupWithZone() {
  return loadSrc('entities.js', 'world.js');
}

test('moveTo same zone: updates x/y, no list churn', () => {
  const { Entity, Zone } = setupWithZone();
  const z = new Zone({ width: 10, height: 10 });
  const e = new Entity({ x: 1, y: 1 });
  z.add(e);
  e.moveTo(5, 7);
  assert.equal(e.x, 5);
  assert.equal(e.y, 7);
  assert.equal(e.zone, z);
  assert.equal(z.entities.length, 1);
  assert.equal(z.entities[0], e);
});

test('moveTo cross-zone: removed from old, added to new, back-ref updated', () => {
  const { Entity, Zone } = setupWithZone();
  const zA = new Zone({ id: 'a', width: 10, height: 10 });
  const zB = new Zone({ id: 'b', width: 10, height: 10 });
  const e = new Entity({ x: 3, y: 3 });
  zA.add(e);
  assert.equal(zA.entities.length, 1);
  assert.equal(zB.entities.length, 0);

  e.moveTo(7, 2, zB);

  assert.equal(e.x, 7);
  assert.equal(e.y, 2);
  assert.equal(e.zone, zB,             'zone back-ref points to new zone');
  assert.equal(zA.entities.length, 0,  'removed from old zone');
  assert.equal(zB.entities.length, 1,  'added to new zone');
  assert.equal(zB.entities[0], e);
});

test('moveTo to null zone: removed from current, becomes zoneless', () => {
  const { Entity, Zone } = setupWithZone();
  const z = new Zone({ width: 10, height: 10 });
  const e = new Entity({ x: 1, y: 1 });
  z.add(e);
  e.moveTo(0, 0, null);
  assert.equal(e.zone, null);
  assert.equal(z.entities.length, 0);
});

test('moveTo from null zone: zoneless entity gets placed', () => {
  const { Entity, Zone } = setupWithZone();
  const z = new Zone({ width: 10, height: 10 });
  const e = new Entity({ x: 1, y: 1 });
  // e.zone is null here (never added)
  e.moveTo(3, 4, z);
  assert.equal(e.zone, z);
  assert.equal(z.entities.length, 1);
});

test('moveTo is chainable (returns this)', () => {
  const { Entity, Zone } = setupWithZone();
  const z = new Zone({ width: 10, height: 10 });
  const e = new Entity().moveTo(5, 5, z);
  assert.equal(e.zone, z);
  assert.equal(e.x, 5);
});


// ─── Sentient ─────────────────────────────────────────────────

test('Sentient defaults: alive with 0 hp', () => {
  const { Sentient } = setup();
  const s = new Sentient();
  assert.equal(s.hp, 0);
  assert.equal(s.maxHp, 0);
  assert.equal(s.isAlive(), false);
});

test('Sentient.isAlive: hp > 0', () => {
  const { Sentient } = setup();
  const dead     = new Sentient({ hp: 0, maxHp: 10 });
  const alive    = new Sentient({ hp: 1, maxHp: 10 });
  const negative = new Sentient({ hp: -5, maxHp: 10 });
  assert.equal(dead.isAlive(),     false);
  assert.equal(alive.isAlive(),    true);
  assert.equal(negative.isAlive(), false);
});

test('Sentient.isHostile default is false', () => {
  const { Sentient } = setup();
  const s = new Sentient({ hp: 10 });
  assert.equal(s.isHostile(), false);
});

test('Sentient: maxHp defaults to hp when not specified', () => {
  const { Sentient } = setup();
  const s = new Sentient({ hp: 25 });
  assert.equal(s.maxHp, 25);
});


// ─── Player ───────────────────────────────────────────────────

test('Player has DEFAULT_INVENTORY_SIZE slots, all null', () => {
  const { Player } = setup();
  const p = new Player();
  assert.equal(p.inventory.length, Player.DEFAULT_INVENTORY_SIZE);
  assert.ok(p.inventory.every(s => s === null));
});

test('Player has 6 named equip slots, all null', () => {
  const { Player } = setup();
  const p = new Player();
  for (const slot of ['head', 'chest', 'legs', 'feet', 'leftHand', 'rightHand']) {
    assert.ok(slot in p.equipped, `equip slot '${slot}' missing`);
    assert.equal(p.equipped[slot], null);
  }
});

test('Player XP/level/gp default to 0/1/0', () => {
  const { Player } = setup();
  const p = new Player();
  assert.equal(p.xp,    0);
  assert.equal(p.level, 1);
  assert.equal(p.gp,    0);
});

test('Player inherits Sentient.isAlive', () => {
  const { Player } = setup();
  const p = new Player({ hp: 10, maxHp: 10 });
  assert.equal(p.isAlive(), true);
});


// ─── LocalPlayer ──────────────────────────────────────────────

test('LocalPlayer has quickslotCount and isLocal=true', () => {
  const { LocalPlayer } = setup();
  const lp = new LocalPlayer();
  assert.equal(lp.quickslotCount, LocalPlayer.DEFAULT_QUICKSLOT_COUNT);
  assert.equal(lp.isLocal, true);
});

test('LocalPlayer is a Player, Sentient, and Entity', () => {
  const { LocalPlayer, Player, Sentient, Entity } = setup();
  const lp = new LocalPlayer();
  assert.ok(lp instanceof Player);
  assert.ok(lp instanceof Sentient);
  assert.ok(lp instanceof Entity);
});

test('LocalPlayer.quickslotCount honors spec override', () => {
  const { LocalPlayer } = setup();
  const lp = new LocalPlayer({ quickslotCount: 5 });
  assert.equal(lp.quickslotCount, 5);
});
