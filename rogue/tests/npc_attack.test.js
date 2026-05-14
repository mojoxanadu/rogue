// npc_attack.test.js — NPC.attack(target, ctx) combat resolution.
//
// The method owns hit/miss rolls, damage application, view-layer
// hooks (via ctx), type-specific flavor (T-Rex / shark / mimic /
// duck), the QuestEngine event emit, and Crown-of-Thorns reflection.
// Tests verify each branch fires with the right args under
// deterministic Math.random stubs.

const test   = require('node:test');
const assert = require('node:assert/strict');
const { newContext, loadInto } = require('./_harness');


function setup() {
  const ctx = newContext();
  ctx.MONSTER_DEF = {
    bat:    { icon: '🦇', hp: 10, dmg: 4, hit: 1.0, speed: 0.8 },
    duck:   { icon: '🦆', hp: 10, dmg: 2, hit: 1.0, speed: 1.0 },
    weakling: { icon: 'W', hp:  5, dmg: 1, hit: 0.0, speed: 1.0 },  // always misses
  };
  loadInto(ctx, 'entities.js', 'npc.js');
  return ctx;
}

// Build a stub ctx mimicking makeNpcCtx — captures all view-side
// callbacks so tests can assert what got fired.
function mockCtx(player) {
  const events = { log: [], sound: [], soundEvent: [], floatText: [],
                   spawnFx: [], damage: [], removed: [] };
  return {
    events,
    log:        (s) => events.log.push(s),
    sound:      (name, vol, fb) => events.sound.push({ name, vol }),
    soundEvent: (m) => events.soundEvent.push(m),
    voice:      () => {},
    floatText:  (x, y, t, c, sz) => events.floatText.push({ x, y, t, c, sz }),
    spawnFx:    (o) => events.spawnFx.push(o),
    damagePlayer(dmg, kind, size, suffix, color) {
      events.damage.push({ dmg, kind, size, suffix, color });
      player.hp -= dmg;
      return player.hp <= 0;
    },
    removeEnemy: (npc) => events.removed.push(npc),
  };
}


// ─── basic resolution ────────────────────────────────────────

test('miss roll fires "misses you" log and applies no damage', (t) => {
  const ctx = setup();
  const list = [];
  // weakling has hit: 0.0 → always misses
  const npc = ctx.spawnNpc(list, 0, 0, 'weakling');
  const player = { hp: 20, dodgeRate: 0, x: 5, y: 5, equipped: {} };
  const c = mockCtx(player);
  const hit = npc.attack(player, c);
  assert.equal(hit, false);
  assert.equal(c.events.log.length, 1);
  assert.match(c.events.log[0], /misses you/);
  assert.equal(c.events.damage.length, 0);
  assert.equal(player.hp, 20);
});

test('hit applies damage, logs, fires grunt event', (t) => {
  const ctx = setup();
  // Math.random sequence: hit-roll ALWAYS 0 (under hitChance=1.0); damage = floor(0 * 4) + 1 = 1
  const origRandom = Math.random;
  Math.random = () => 0;
  try {
    const list = [];
    const npc = ctx.spawnNpc(list, 5, 5, 'bat');
    const player = { hp: 20, dodgeRate: 0, x: 5, y: 5, equipped: {} };
    const c = mockCtx(player);
    npc.attack(player, c);
    assert.equal(c.events.damage.length, 1);
    assert.equal(c.events.damage[0].dmg, 1);
    assert.deepEqual(c.events.soundEvent, ['grunt']);
    assert.match(c.events.log.find(s => /hits you/.test(s)) ?? '', /1 damage/);
    assert.equal(player.hp, 19);
  } finally {
    Math.random = origRandom;
  }
});


// ─── type-specific flavor ────────────────────────────────────

test('duck attack fires quack + the duck-quote log line', () => {
  const ctx = setup();
  const origRandom = Math.random;
  Math.random = () => 0;
  try {
    const list = [];
    const npc = ctx.spawnNpc(list, 0, 0, 'duck');
    const player = { hp: 20, dodgeRate: 0, x: 5, y: 5, equipped: {} };
    const c = mockCtx(player);
    npc.attack(player, c);
    assert.ok(c.events.soundEvent.includes('grunt'));
    assert.ok(c.events.soundEvent.includes('quack'));
    assert.ok(c.events.log.some(s => /quacks aggressively/.test(s)));
  } finally {
    Math.random = origRandom;
  }
});


// ─── Crown of Thorns reflection ──────────────────────────────

test('thorns reflection reduces attacker HP and removes on kill', () => {
  const ctx = setup();
  // Stub ItemDef so target.equipped.head returns a thornsDmg item
  ctx.ItemDef = {
    byIcon: (icon) => icon === '👑' ? { thornsDmg: 100 } : null,
  };
  const origRandom = Math.random;
  Math.random = () => 0;
  try {
    const list = [];
    const npc = ctx.spawnNpc(list, 0, 0, 'bat');
    npc.stats.hp = 5;  // weak enough that thorns kills
    const player = { hp: 20, dodgeRate: 0, x: 5, y: 5, equipped: { head: '👑' }, xp: 0 };
    ctx.checkLevelUp = () => {};  // stub
    const c = mockCtx(player);
    npc.attack(player, c);
    // Bat hit player, then thorns reflected 100 damage → bat dies
    assert.equal(npc.stats.hp, -95);
    assert.equal(c.events.removed.length, 1);
    assert.equal(c.events.removed[0], npc);
    assert.equal(player.xp, 50);
    assert.ok(c.events.log.some(s => /destroyed by thorns/.test(s)));
  } finally {
    Math.random = origRandom;
  }
});
