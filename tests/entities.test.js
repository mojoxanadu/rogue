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

// ─── Sentient combat surface ──────────────────────────────────
// Sentient owns the combat-roll fields and the four primitives every
// fighter uses: effectiveHitRate, effectiveCritRate, effectiveDodgeRate,
// hits(target), rollDmg().

test('Sentient combat fields default to 0', () => {
  const { Sentient } = setup();
  const s = new Sentient();
  assert.equal(s.hitRate, 0);
  assert.equal(s.critRate, 0);
  assert.equal(s.dodgeRate, 0);
  assert.equal(s.baseDmg, 0);
  assert.equal(s.meleeDmgBonus, 0);
  assert.equal(s.rangedDmgBonus, 0);
  assert.equal(s.spellDmgBonus, 0);
});

test('Sentient combat fields read from spec', () => {
  const { Sentient } = setup();
  const s = new Sentient({
    hitRate: 0.7, critRate: 0.1, dodgeRate: 0.2,
    baseDmg: 5, meleeDmgBonus: 2, rangedDmgBonus: 3, spellDmgBonus: 4,
  });
  assert.equal(s.effectiveHitRate(),   0.7);
  assert.equal(s.effectiveCritRate(),  0.1);
  assert.equal(s.effectiveDodgeRate(), 0.2);
  assert.equal(s.baseDmg,        5);
  assert.equal(s.meleeDmgBonus,  2);
  assert.equal(s.rangedDmgBonus, 3);
  assert.equal(s.spellDmgBonus,  4);
});

test('Sentient.effectiveDodgeRate falls back to legacy stats.dodge', () => {
  const { Sentient } = setup();
  // Sentient with no dodgeRate but legacy stats.dodge — supports treating
  // pre-class enemies as targets during the migration window.
  const s = new Sentient({ stats: { dodge: 0.25 } });
  assert.equal(s.effectiveDodgeRate(), 0.25);
});

test('Sentient.hits: 100% hit on undodgeable target', () => {
  const { Sentient } = setup();
  const s = new Sentient({ hitRate: 1.0 });
  // No target → no dodge → guaranteed hit
  for (let i = 0; i < 20; i++) assert.equal(s.hits(null), true);
});

test('Sentient.hits: 0% hit on fully-dodging target', () => {
  const { Sentient } = setup();
  const s = new Sentient({ hitRate: 1.0 });
  const target = new Sentient({ dodgeRate: 1.0 });
  for (let i = 0; i < 20; i++) assert.equal(s.hits(target), false);
});

test('Sentient.hits: works against a legacy enemy plain object', () => {
  const { Sentient } = setup();
  const s = new Sentient({ hitRate: 1.0 });
  const legacyEnemy = { stats: { dodge: 1.0 } };  // not a Sentient
  for (let i = 0; i < 20; i++) assert.equal(s.hits(legacyEnemy), false);
});

test('Sentient.rollDmg: bounded by baseDmg + meleeDmgBonus', () => {
  const { Sentient } = setup();
  const s = new Sentient({ baseDmg: 4, meleeDmgBonus: 2 });
  // Roll: floor(rand * 4 + 1) + 2  → integer in [1+2, 4+2] = [3, 6]
  for (let i = 0; i < 200; i++) {
    const d = s.rollDmg();
    assert.ok(Number.isInteger(d), `rollDmg ${d} not integer`);
    assert.ok(d >= 3 && d <= 6,    `rollDmg ${d} outside [3,6]`);
  }
});


// ─── Player equipment-aware overrides ────────────────────────
// Player.rollDmg + effectiveHitRate read from the global ItemDefs registry
// to layer equipment in. The harness lets us inject a stub registry.

function setupWithItemDefs(stubItemDefs) {
  const ctx = setup();
  // entities.js was already evaluated — Player methods reference ItemDefs
  // via dynamic global lookup, so installing it on the context now works.
  ctx.ItemDefs = stubItemDefs;
  return ctx;
}

test('Player.primaryHand returns equipped.leftHand', () => {
  const { Player } = setup();
  const p = new Player();
  assert.equal(p.primaryHand(), null);
  p.equipped.leftHand = 'rustySword';
  assert.equal(p.primaryHand(), 'rustySword');
});

test('Player.effectiveHitRate adds hitRateBonus across equipped items', () => {
  const { Player } = setupWithItemDefs({
    accurateRing:  { hitRateBonus: 0.10 },
    luckyAmulet:   { hitRateBonus: 0.05 },
    plainBoots:    {},  // no bonus → contributes 0
  });
  const p = new Player({ hitRate: 0.6 });
  p.equipped.leftHand  = 'accurateRing';
  p.equipped.rightHand = 'luckyAmulet';
  p.equipped.feet      = 'plainBoots';
  // 0.6 + 0.10 + 0.05 (within float tolerance)
  const h = p.effectiveHitRate();
  assert.ok(Math.abs(h - 0.75) < 1e-9, `effectiveHitRate=${h}, expected ~0.75`);
});

test('Player.effectiveHitRate with no ItemDefs equals base hitRate', () => {
  const { Player } = setup();  // ItemDefs is undefined in this ctx
  const p = new Player({ hitRate: 0.6 });
  p.equipped.leftHand = 'whatever';
  assert.equal(p.effectiveHitRate(), 0.6);
});

test('Player.rollDmg: weapon overrides baseDmg, gear adds meleeDmgBonus', () => {
  const { Player } = setupWithItemDefs({
    bigSword:    { type: 'weapon', baseDmg: 10 },
    powerRing:   { meleeDmgBonus: 3 },
  });
  const p = new Player({ baseDmg: 3, meleeDmgBonus: 1 });
  p.equipped.leftHand  = 'bigSword';
  p.equipped.rightHand = 'powerRing';
  // base=10 (weapon overrides), bonus=1+3=4 → roll ∈ [1+4, 10+4] = [5, 14]
  for (let i = 0; i < 200; i++) {
    const d = p.rollDmg();
    assert.ok(d >= 5 && d <= 14, `rollDmg ${d} outside [5,14]`);
  }
});

test('Player.rollDmg consumes trainingBonus exactly once', () => {
  const { Player } = setup();
  const p = new Player({ baseDmg: 1, trainingBonus: 100 });
  // First roll: 1..1 + 100 → exactly 101
  const d1 = p.rollDmg();
  assert.equal(d1, 101);
  assert.equal(p.trainingBonus, 0);
  // Subsequent rolls: bonus is gone
  for (let i = 0; i < 20; i++) {
    const d = p.rollDmg();
    assert.equal(d, 1);
  }
});

test('Player.rollDmgVersus: Ifrit at low level → 30% damage, min 1', () => {
  const { Player } = setup();
  const p = new Player({ baseDmg: 100, meleeDmgBonus: 0, level: 5 });
  for (let i = 0; i < 50; i++) {
    const d = p.rollDmgVersus({ isIfrit: true });
    // raw 1..100, scaled by 0.3, min 1 → integer in [1, 30]
    assert.ok(d >= 1 && d <= 30, `dmgVersus ${d} outside [1,30] at low lvl`);
  }
});

test('Player.rollDmgVersus: Ifrit at level 10 → full damage', () => {
  const { Player } = setup();
  const p = new Player({ baseDmg: 100, meleeDmgBonus: 0, level: 10 });
  for (let i = 0; i < 50; i++) {
    const d = p.rollDmgVersus({ isIfrit: true });
    assert.ok(d >= 1 && d <= 100, `dmgVersus ${d} outside [1,100] at lvl 10`);
  }
});

test('Player.rollDmgVersus: non-Ifrit target = rollDmg passthrough', () => {
  const { Player } = setup();
  const p = new Player({ baseDmg: 5, meleeDmgBonus: 0, level: 1 });
  for (let i = 0; i < 50; i++) {
    const d = p.rollDmgVersus({ type: 'rat' });
    assert.ok(d >= 1 && d <= 5);
  }
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
