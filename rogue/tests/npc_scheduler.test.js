// npc_scheduler.test.js — integration tests for NPC + scheduler wiring.
//
// Verifies that NPC.cooldowns derivation (from stats.speed) makes the
// scheduler call fast NPCs more often than slow ones, that takeTurn
// returns 'move'/'attack' for proper cost charging, and that the
// divide-by-zero defaults don't blow up.

const test   = require('node:test');
const assert = require('node:assert/strict');
const { newContext, loadInto } = require('./_harness');


function setup() {
  // npc.js references MONSTER_DEF; provide a tiny one. ItemDef etc are
  // not needed because we test cooldown/action plumbing, not combat.
  const ctx = newContext();
  ctx.MONSTER_DEF = {
    swift:  { icon: 'S', hp: 10, dmg: 1, speed: 2.0 },     // 1/2 = 0.5
    even:   { icon: 'E', hp: 10, dmg: 1, speed: 1.0 },     // 1/1 = 1.0
    slow:   { icon: 's', hp: 10, dmg: 1, speed: 0.5 },     // 1/0.5 = 2.0
    rooted: { icon: 'R', hp: 10, dmg: 0, speed: 0.0 },     // → 1.0 fallback
  };
  loadInto(ctx, 'entities.js', 'npc.js', 'scheduler.js');
  return ctx;
}


// ─── cooldown derivation ─────────────────────────────────────

test('NPC cooldowns derived from stats.speed via spawnNpc', () => {
  const ctx = setup();
  const list = [];
  const swift = ctx.spawnNpc(list, 0, 0, 'swift');
  const even  = ctx.spawnNpc(list, 0, 0, 'even');
  const slow  = ctx.spawnNpc(list, 0, 0, 'slow');
  assert.ok(Math.abs(swift.cooldowns.move - 0.5) < 1e-9);
  assert.equal(even.cooldowns.move, 1.0);
  assert.equal(slow.cooldowns.move, 2.0);
  // Attack floored at 1.0 so hyper-speed melee doesn't dominate.
  assert.equal(swift.cooldowns.attack, 1.0);
  assert.equal(even.cooldowns.attack,  1.0);
  assert.equal(slow.cooldowns.attack,  2.0);
});

test('NPC with speed=0 falls back to 1.0 cooldowns (no divide-by-zero)', () => {
  const ctx = setup();
  const list = [];
  const r = ctx.spawnNpc(list, 0, 0, 'rooted');
  assert.equal(r.cooldowns.move,   1.0);
  assert.equal(r.cooldowns.attack, 1.0);
  assert.ok(Number.isFinite(r.cooldowns.move));
});

test('NPC with missing stats.speed falls back to 1.0', () => {
  const ctx = setup();
  // Construct directly with no stats.speed
  const n = new ctx.NPC({ x: 0, y: 0, type: 'swift', stats: { icon: '?' } });
  assert.equal(n.cooldowns.move,   1.0);
  assert.equal(n.cooldowns.attack, 1.0);
});


// ─── scheduler integration ───────────────────────────────────

test('fast NPC takes multiple turns per player turn via scheduler', () => {
  const ctx = setup();
  // Player at cooldown 1.0 (just finished a turn). Swift NPC has
  // cooldown 0.5 (just acted) and cost 0.5 → over the 1.0 drain it
  // gets two more ticks: one mid-drain, one on the tie-with-player
  // (NPC priority).
  const list = [];
  const player = new ctx.Sentient({ hp: 10 });
  player.actionCooldown = 1.0;
  const swift = ctx.spawnNpc(list, 0, 0, 'swift');
  swift.actionCooldown = 0.5;
  let actCount = 0;
  const ai = () => { actCount++; return 'move'; };
  const result = ctx.runScheduler([player, swift], player, ai);
  assert.equal(result.reason, 'player-turn');
  assert.equal(actCount, 2, 'swift NPC acts twice during the 1.0 drain');
});

test('slow NPC may not act every player turn', () => {
  const ctx = setup();
  const list = [];
  const player = new ctx.Sentient({ hp: 10 });
  player.actionCooldown = 1.0;
  const slow = ctx.spawnNpc(list, 0, 0, 'slow');
  slow.actionCooldown = 1.5;  // mid-drain
  let actCount = 0;
  const ai = () => { actCount++; return 'move'; };
  ctx.runScheduler([player, slow], player, ai);
  // Player drains 1.0 first. Slow drains from 1.5 → 0.5, not ready.
  // Acts 0 times this player turn.
  assert.equal(actCount, 0);
});

test('attack on hyper-speed NPC pays the 1.0 floor cost', () => {
  const ctx = setup();
  const list = [];
  const player = new ctx.Sentient({ hp: 10 });
  player.actionCooldown = 2.0;
  const swift = ctx.spawnNpc(list, 0, 0, 'swift');
  swift.actionCooldown = 0;
  // Always-attack AI. attack cost = max(1, 1/2) = 1.0. Across the 2.0
  // player drain with NPC-priority tie-break, swift gets 3 attacks
  // total (acts at cd=0, then twice more during/after the drain).
  let attackCount = 0;
  const ai = () => { attackCount++; return 'attack'; };
  ctx.runScheduler([player, swift], player, ai);
  assert.equal(attackCount, 3);
});
