// scheduler.test.js — unit tests for runScheduler.
//
// Tests load entities.js + scheduler.js into a sandboxed VM context.
// runScheduler is exposed as window.runScheduler in the source, so
// ctx.runScheduler is available after loadSrc.

const test   = require('node:test');
const assert = require('node:assert/strict');
const { loadSrc } = require('./_harness');

function setup() {
  return loadSrc('entities.js', 'scheduler.js');
}


// ─── Trivial: player ready → return immediately ──────────────

test('player can act → returns player-turn on iter 1', () => {
  const { Sentient, runScheduler } = setup();
  const player = new Sentient({ actionCooldown: 0 });
  const result = runScheduler([player], player, () => 'move');
  assert.equal(result.reason, 'player-turn');
  assert.equal(result.iters, 1);
});


// ─── Player + idle NPC: NPC doesn't act if not due ───────────

test('idle NPC stays idle while waiting for player to be ready', () => {
  const { Sentient, runScheduler } = setup();
  // Player just acted — cooldown 1.0. NPC also has cooldown 1.0
  // (already acted). Scheduler ticks both by 1.0 → both at 0 →
  // NPC acts first, then player returns.
  const player = new Sentient({ actionCooldown: 1.0 });
  const npc    = new Sentient({ actionCooldown: 1.0 });
  let npcActed = 0;
  const ai = (e) => { npcActed++; return 'move'; };
  const result = runScheduler([player, npc], player, ai);
  assert.equal(result.reason, 'player-turn');
  assert.equal(npcActed, 1, 'NPC should act once during player wait');
  // NPC's cooldown reset to 1.0 (cost of 'move').
  assert.equal(npc.actionCooldown, 1.0);
});


// ─── Faster NPC acts more times ───────────────────────────────

test('fast NPC (cost 0.5) acts twice while player waits 1.0', () => {
  const { Sentient, runScheduler } = setup();
  // Realistic initial state: bat just finished a turn so cd = its
  // move cost (0.5). If we started bat at 0 it would get a "free"
  // pre-existing turn before the first tick — that's a real edge
  // case (e.g., just spawned), tested separately.
  const player = new Sentient({ actionCooldown: 1.0 });
  const bat    = new Sentient({
    actionCooldown: 0.5,
    cooldowns: { move: 0.5, attack: 1.0 },
  });
  let batActed = 0;
  const ai = () => { batActed++; return 'move'; };
  const result = runScheduler([player, bat], player, ai);
  assert.equal(result.reason, 'player-turn');
  // Tick 0.5 → player 0.5, bat 0. bat acts → 0.5. Tick 0.5 →
  // player 0, bat 0. bat acts (NPC-priority on tie) → 0.5. No NPC
  // ready, player returns. bat acted 2x.
  assert.equal(batActed, 2);
  assert.equal(player.actionCooldown, 0);
});


// ─── Slow NPC (cost 2.0) acts every other player turn ─────────

test('slow NPC (cost 2.0) only acts once across two player waits', () => {
  const { Sentient, runScheduler } = setup();
  const player = new Sentient({ actionCooldown: 1.0 });
  const slow   = new Sentient({
    actionCooldown: 2.0,
    cooldowns: { move: 2.0, attack: 2.0 },
  });
  let slowActed = 0;
  const ai = () => { slowActed++; return 'move'; };
  // First wait
  runScheduler([player, slow], player, ai);
  // Player just acts — simulate by setting cooldown again.
  player.actionCooldown = 1.0;
  // Second wait
  runScheduler([player, slow], player, ai);
  assert.equal(slowActed, 1, 'slow NPC acts once across two player turns');
});


// ─── Condition fires during scheduler ticks ──────────────────

test('due condition fires before player gets turn back', () => {
  const { Sentient, Condition, runScheduler } = setup();
  const player = new Sentient({ hp: 10, maxHp: 10, actionCooldown: 1.0 });
  player.conditions.push(new Condition({
    name: 'poison', interval: 1.0, pointsRemaining: 1,
    onTick: (e) => { e.hp -= 3; },
  }));
  const ai = () => 'move';
  // Player cd 1.0, poison cd 1.0. Scheduler ticks by 1.0. Then
  // fires conditions. Then player can act → returns.
  const result = runScheduler([player], player, ai);
  assert.equal(result.reason, 'player-turn');
  assert.equal(player.hp, 7);
  // Exhausted poison was removed.
  assert.equal(player.conditions.length, 0);
});


// ─── Multiple due conditions: all fire ───────────────────────

test('stacked poison: both conditions tick once each per player turn', () => {
  const { Sentient, Condition, runScheduler } = setup();
  const player = new Sentient({ hp: 100, actionCooldown: 1.0 });
  for (let i = 0; i < 2; i++) {
    player.conditions.push(new Condition({
      name: 'poison', interval: 1.0, pointsRemaining: 3,
      onTick: (e) => { e.hp -= 1; },
    }));
  }
  runScheduler([player], player, () => 'move');
  // Each of two poisons fired once → hp -2.
  assert.equal(player.hp, 98);
  assert.equal(player.conditions.length, 2);
});


// ─── NPC condition fires during player wait ──────────────────

test('NPC poison ticks while player is in cooldown', () => {
  const { Sentient, Condition, runScheduler } = setup();
  const player = new Sentient({ actionCooldown: 1.0 });
  const orc    = new Sentient({ hp: 10, actionCooldown: 1.0 });
  orc.conditions.push(new Condition({
    name: 'poison', interval: 1.0, pointsRemaining: 1,
    onTick: (e) => { e.hp -= 4; },
  }));
  runScheduler([player, orc], player, () => 'move');
  assert.equal(orc.hp, 6);
});


// ─── Insertion order tie-break ────────────────────────────────

test('when two NPCs are due simultaneously, insertion order wins', () => {
  const { Sentient, runScheduler } = setup();
  const player = new Sentient({ actionCooldown: 1.0 });
  const a = new Sentient({ actionCooldown: 1.0 });
  const b = new Sentient({ actionCooldown: 1.0 });
  const order = [];
  const ai = (e) => {
    order.push(e === a ? 'a' : e === b ? 'b' : '?');
    return 'move';
  };
  runScheduler([player, a, b], player, ai);
  // Player cd 1.0, a cd 1.0, b cd 1.0. Tick 1.0. All at 0. Each
  // takes its turn in entity-array order before player returns.
  // Note: player is checked FIRST in phase 2 each iteration, but
  // their cd is set BACK to 1.0 by NPC action loop? No — NPC ai is
  // 'move' (cost 1.0), so a's cd → 1.0, b's cd → 1.0, then player
  // cd is 0 → return. So both a and b should act before player.
  assert.equal(order.length, 2);
  assert.equal(order[0], 'a');
  assert.equal(order[1], 'b');
});


// ─── Action cost: scheduler honors AI's choice of action ─────

test('scheduler charges actionCost based on AI return value', () => {
  const { Sentient, runScheduler } = setup();
  const player = new Sentient({ actionCooldown: 0.5 });
  const npc    = new Sentient({
    actionCooldown: 0,
    cooldowns: { move: 1.0, attack: 0.3 },
  });
  // AI returns 'attack' → cost 0.3, so npc fires three times before
  // player's 0.5 elapses.
  let actCount = 0;
  const ai = () => { actCount++; return 'attack'; };
  runScheduler([player, npc], player, ai);
  // npc acts at t=0 (cd → 0.3). Tick 0.3. npc at 0, player at 0.2.
  // npc acts (cd → 0.3). Tick 0.2. npc at 0.1, player at 0 → return.
  // So 2 acts.
  assert.equal(actCount, 2);
});


// ─── AI returning null/undefined defaults to 'move' ──────────

test('AI returning null defaults to move cost', () => {
  const { Sentient, runScheduler } = setup();
  // Player cd shorter than npc's move cost — npc acts once, then
  // the next tick brings player to ready before npc can refire.
  const player = new Sentient({ actionCooldown: 0.5 });
  const npc    = new Sentient({
    actionCooldown: 0,
    cooldowns: { move: 1.0, attack: 0.1 },
  });
  let actCount = 0;
  const ai = () => { actCount++; return null; };
  runScheduler([player, npc], player, ai);
  // null → 'move' cost 1.0. NPC acts at t=0, cd → 1.0. Tick by 0.5
  // (min of player 0.5 and npc 1.0). Player at 0, npc at 0.5 → no
  // npc ready, player returns.
  assert.equal(actCount, 1);
  assert.equal(npc.actionCooldown, 0.5);
});


// ─── Safety: idle when no positive cooldowns exist ───────────

test('idle return when all cooldowns are 0 and player can act', () => {
  const { Sentient, runScheduler } = setup();
  // Player at 0 — scheduler returns player-turn immediately.
  const player = new Sentient({ actionCooldown: 0 });
  const result = runScheduler([player], player, () => 'move');
  assert.equal(result.reason, 'player-turn');
});


// ─── Safety: MAX_ITERATIONS cap on zero-cost deadlock ────────

test('zero-cost AI action eventually trips timeout safety cap', () => {
  const { Sentient, runScheduler } = setup();
  const player = new Sentient({ actionCooldown: 1.0 });
  // NPC has cost 0 — pathological AI bug.
  const npc = new Sentient({
    actionCooldown: 0,
    cooldowns: { move: 0, attack: 0 },
  });
  const ai = () => 'move';
  const result = runScheduler([player, npc], player, ai);
  // Either timeout (zero-cost NPC keeps firing) or player-turn
  // (if implementation bails differently). We just want NOT a hang.
  assert.ok(['timeout', 'player-turn', 'idle'].includes(result.reason));
  // Loop is `while (iters++ < MAX_ITERATIONS)` so the post-increment
  // produces iters = MAX_ITERATIONS + 1 on the exit pass. Cap at 1025.
  assert.ok(result.iters <= 1025);
});


// ─── Negative overshoot: snapped to 0 before adding cost ─────

// ─── Engine brake (opt-in via brakeInterval) ─────────────────

test('brakeInterval=0 (default): no brake even on long player wait', () => {
  const { Sentient, runScheduler } = setup();
  const player = new Sentient({ actionCooldown: 10.0 });
  const result = runScheduler([player], player, () => 'move');
  // Without brake, scheduler ticks player from 10.0 → 0 in one big
  // tick (no other cooldowns to limit min) and returns player-turn.
  assert.equal(result.reason, 'player-turn');
  assert.equal(player.actionCooldown, 0);
});

test('brakeInterval=1.0 fires brake after 1.0 game-time elapses', () => {
  const { Sentient, runScheduler } = setup();
  const player = new Sentient({ actionCooldown: 10.0 });
  const result = runScheduler([player], player, () => 'move',
                              { brakeInterval: 1.0 });
  assert.equal(result.reason, 'brake');
  // Brake should fire exactly when 1.0 elapsed: player goes 10.0 → 9.0.
  assert.ok(Math.abs(player.actionCooldown - 9.0) < 1e-9,
    `expected 9.0 after brake, got ${player.actionCooldown}`);
});

test('brake doesn\'t fire if player returns before brakeInterval elapses', () => {
  const { Sentient, runScheduler } = setup();
  const player = new Sentient({ actionCooldown: 0.5 });
  const result = runScheduler([player], player, () => 'move',
                              { brakeInterval: 1.0 });
  assert.equal(result.reason, 'player-turn');
  assert.equal(player.actionCooldown, 0);
});

test('brake caps tick size so it fires precisely on the boundary', () => {
  const { Sentient, runScheduler } = setup();
  // Player cd 0.3 would cause a 0.3 tick. NPC cd 5.0 doesn't matter.
  // Brake at 1.0 should NOT prematurely fire — we want brake to
  // exactly limit the tick when crossing the threshold.
  const player = new Sentient({ actionCooldown: 5.0 });
  const npc    = new Sentient({ actionCooldown: 0.7,
                                cooldowns: { move: 5.0, attack: 5.0 } });
  let acted = 0;
  const ai = () => { acted++; return 'move'; };
  // Trace: tick 0.7 → player 4.3, npc 0. npc acts → 5.0. Tick 1.0 worth
  // remaining brake = 0.3 → tick 0.3 → player 4.0, npc 4.7. elapsed=1.0
  // → brake. Player cd = 4.0.
  const result = runScheduler([player, npc], player, ai,
                              { brakeInterval: 1.0 });
  assert.equal(result.reason, 'brake');
  assert.equal(acted, 1);
  assert.ok(Math.abs(player.actionCooldown - 4.0) < 1e-9,
    `expected player cd 4.0, got ${player.actionCooldown}`);
});

test('brake-resume cycle: 3 invocations to drain a 3.0-second wait', () => {
  const { Sentient, runScheduler } = setup();
  const player = new Sentient({ actionCooldown: 3.0 });
  const r1 = runScheduler([player], player, () => 'move',
                          { brakeInterval: 1.0 });
  assert.equal(r1.reason, 'brake');
  assert.ok(Math.abs(player.actionCooldown - 2.0) < 1e-9);
  const r2 = runScheduler([player], player, () => 'move',
                          { brakeInterval: 1.0 });
  assert.equal(r2.reason, 'brake');
  assert.ok(Math.abs(player.actionCooldown - 1.0) < 1e-9);
  const r3 = runScheduler([player], player, () => 'move',
                          { brakeInterval: 1.0 });
  assert.equal(r3.reason, 'player-turn');
  assert.equal(player.actionCooldown, 0);
});


// ─── Jitter (opt-in via jitter) ──────────────────────────────

test('jitter=0 (default): NPC cost is exactly the cooldowns hash value', () => {
  const { Sentient, runScheduler } = setup();
  const player = new Sentient({ actionCooldown: 1.0 });
  const npc    = new Sentient({ actionCooldown: 0 });
  runScheduler([player, npc], player, () => 'move');
  // Trace with NPC-priority tie-break:
  //   iter1: NPC acts (cd 0 → 1.0). iter2: tick 1.0, all 0. iter3:
  //   NPC acts (cd 0 → 1.0). iter4: player ready, return.
  // So npc cd = 1.0 exactly (no jitter).
  assert.equal(npc.actionCooldown, 1.0);
});

test('jitter=0.01 adds 0..0.01 to action cost', () => {
  const { Sentient, runScheduler } = setup();
  const player = new Sentient({ actionCooldown: 100.0 });  // long, so brake-less drain
  const npc    = new Sentient({ actionCooldown: 0,
                                cooldowns: { move: 1.0, attack: 1.0 } });
  // Single NPC act, no ticks consume it.
  let captured = null;
  const ai = (e) => {
    // First call: AI fires before scheduler sets cd; we want to
    // catch cd just after the set, so use a flag.
    return 'move';
  };
  runScheduler([player, npc], player, ai, { jitter: 0.01 });
  // After scheduler runs many iterations the NPC's cooldown after
  // its last set is some 1.0 + r ∈ [0, 0.01), then ticked down by
  // various amounts. Easier check: directly inspect after one act.
  // Re-run with a fresh setup where player cd is large enough that
  // NPC's first action's cooldown survives without further ticks.
  const player2 = new Sentient({ actionCooldown: 2.0 });
  const npc2    = new Sentient({ actionCooldown: 0,
                                 cooldowns: { move: 1.0, attack: 1.0 } });
  runScheduler([player2, npc2], player2, () => 'move',
               { jitter: 0.01, brakeInterval: 1.0 });
  // After: NPC acts (cd → 1.0 + j1), tick 1.0 → cd ∈ [j1, j1+0]...
  // Actually trace: NPC acts → cd = 1.0+j1 ∈ [1.0, 1.01). brakeInterval
  // 1.0 limits tick → tick 1.0. cd ∈ [0, 0.01). Brake fires.
  // So npc2.actionCooldown should be in [0, 0.01).
  assert.ok(npc2.actionCooldown >= 0 && npc2.actionCooldown < 0.01,
    `expected jittered cd in [0, 0.01), got ${npc2.actionCooldown}`);
});

test('jitter breaks ties between same-speed NPCs (probabilistic)', () => {
  const { Sentient, runScheduler } = setup();
  // 50 runs: with jitter, NPCs A and B alternate first/second
  // randomly. With jitter=0, A is always first (insertion order).
  // We just sanity-check that jitter changes the *cooldown values*
  // — i.e., they're not all 1.0.
  let varied = false;
  for (let trial = 0; trial < 20; trial++) {
    const player = new Sentient({ actionCooldown: 1.0 });
    const a      = new Sentient({ actionCooldown: 1.0 });
    const b      = new Sentient({ actionCooldown: 1.0 });
    runScheduler([player, a, b], player, () => 'move',
                 { jitter: 0.01 });
    // After: tick 1.0 (player drives) → all 0. NPCs act in turn.
    // Each gets cd ≈ 1.0 + jitter. Then player ready, return.
    // Two NPC cooldowns should both be slightly > 1.0.
    if (a.actionCooldown !== b.actionCooldown) { varied = true; break; }
  }
  assert.ok(varied, 'jitter should produce differing cooldowns across NPCs');
});


test('NPC with negative cooldown gets clamped to 0 before new cost', () => {
  const { Sentient, runScheduler } = setup();
  // Player short cd so it returns before any second NPC turn. NPC
  // starts overshot at -0.4 (residue from a previous oversized tick).
  // Clamped path:    cd = max(0, -0.4) + 1.0 = 1.0; tick 0.5 → 0.5
  // Unclamped path:  cd = -0.4 + 1.0 = 0.6;       tick 0.5 → 0.1
  // We assert the clamped result.
  const player = new Sentient({ actionCooldown: 0.5 });
  const npc    = new Sentient({ actionCooldown: -0.4 });
  let actCount = 0;
  const ai = () => { actCount++; return 'move'; };
  runScheduler([player, npc], player, ai);
  assert.equal(actCount, 1);
  assert.ok(Math.abs(npc.actionCooldown - 0.5) < 1e-9,
    `expected npc cd 0.5 (clamped path), got ${npc.actionCooldown}`);
});
