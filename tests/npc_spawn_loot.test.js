// npc_spawn_loot.test.js — verifies spawnNpc attaches a Lootable at
// spawn time (Phase 2 of the loot/containers refactor).

const test   = require('node:test');
const assert = require('node:assert/strict');
const { newContext, loadInto } = require('./_harness');

function setup() {
  const ctx = newContext();
  ctx.MONSTER_DEF = {
    mouse: { icon: 'm', hp: 1, dmg: 0, speed: 1.0 },
  };
  // Lootable available but no engine-side _rollMonsterLoot registered —
  // spawnNpc should attach an empty Lootable in that case.
  loadInto(ctx, 'entities.js', 'npc.js', 'loot.js');
  return ctx;
}

test('spawnNpc attaches an empty Lootable when no roller is registered', () => {
  const ctx = setup();
  const list = [];
  const npc = ctx.spawnNpc(list, 0, 0, 'mouse');
  assert.ok(npc.lootable, 'npc should have a lootable');
  assert.equal(npc.lootable.ownerKind, 'npc');
  assert.equal(npc.lootable.size(), 0);
  // Legacy alias points at the same array.
  assert.equal(npc.loot, npc.lootable.slots);
});

test('spawnNpc honors explicit spec.loot over the roller', () => {
  const ctx = setup();
  // Even with a roller in place, an explicit loot list wins.
  ctx._rollMonsterLoot = () => [{ itemName: 'shouldNotAppear' }];
  const list = [];
  const stack = { itemName: 'meat', qty: 1 };
  const npc = ctx.spawnNpc(list, 0, 0, 'mouse', { loot: [stack] });
  assert.equal(npc.lootable.size(), 1);
  assert.equal(npc.lootable.slots[0].itemName, 'meat');
});

test('spawnNpc calls _rollMonsterLoot when no explicit loot given', () => {
  const ctx = setup();
  let calledWith = null;
  ctx._rollMonsterLoot = (npc) => {
    calledWith = npc;
    return [{ itemName: 'rolled', qty: 7 }];
  };
  const list = [];
  const npc = ctx.spawnNpc(list, 5, 7, 'mouse');
  assert.ok(calledWith === npc, 'roller invoked with the new npc');
  assert.equal(npc.lootable.size(), 1);
  assert.equal(npc.lootable.slots[0].itemName, 'rolled');
  assert.equal(npc.lootable.slots[0].qty, 7);
});

test('spawnNpc still works when Lootable is not loaded (back-compat)', () => {
  // Fresh context: no loot.js loaded.
  const ctx = newContext();
  ctx.MONSTER_DEF = { mouse: { icon: 'm', hp: 1, dmg: 0, speed: 1.0 } };
  loadInto(ctx, 'entities.js', 'npc.js');
  const list = [];
  const npc = ctx.spawnNpc(list, 0, 0, 'mouse');
  // No lootable, but the NPC itself should still be valid.
  assert.equal(npc.lootable, undefined);
  assert.equal(npc.x, 0);
  assert.equal(npc.type, 'mouse');
});
