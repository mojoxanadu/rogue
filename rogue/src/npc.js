// ============================================================
//  NPC  –  src/npc.js
//
//  Non-Player Creatures. Subclass of Sentient. Carries attitude
//  (hostile / indifferent / friendly), behavior (chase / patrol /
//  flee / vermin / wander / follow / stationary), and per-monster
//  bookkeeping. Each takes turns via takeTurn(ctx).
//
//  The model never references Sound.* / logMsg / addFloatingText /
//  WebGLFX directly — those are passed in through ctx so the view
//  layer wires whatever it wants. Engine builds the ctx and supplies
//  passthrough callbacks today; a later iteration will swap those
//  for an event stream without touching NPC classes.
//
//  Grue is environmental, not an NPC — it stays in engine.js.
//  Combat is split across two NPC methods:
//    - NPC.attack(target, ctx)     — NPC attacks player (with miss
//      roll, type-specific flavor, thorns reflection).
//    - NPC.takeDamage(dmg, attacker) — NPC receives damage with the
//      attacker's crit chance folded in.
//  Corpse generation / XP awards / level-up triggers stay in engine's
//  doCombat — they cross into game-state territory the NPC shouldn't
//  own.
// ============================================================

const NPC_ATTITUDE = {
  HOSTILE:     'hostile',
  INDIFFERENT: 'indifferent',
  FRIENDLY:    'friendly',
};

const NPC_BEHAVIOR = {
  CHASE:      'chase',       // hostile chaser — adj attack, else step toward player
  PATROL:     'patrol',      // patrolPath waypoint loop (scene-clock)
  FOLLOW:     'follow',      // follow a target NPC by type (scene-clock)
  FLEE:       'flee',        // outdoor animals — flee when player nearby
  VERMIN:     'vermin',      // passive mice/cockroaches — stay at light edge
  WANDER:     'wander',      // random N/E/S/W every 5 turns, no chase
  STATIONARY: 'stationary',  // shopkeepers, quest NPCs — skip turn
};


// ──────────────────────────────────────────────────────────────
//  NPC base class
// ──────────────────────────────────────────────────────────────
class NPC extends Sentient {
  constructor(spec = {}) {
    super(spec);
    // Legacy spawn specs carry the visible glyph at spec.stats.icon
    // (it came from MONSTER_DEF[type].icon). Entity's default ?? '?'
    // wins otherwise, which is why every fresh NPC renders as '?'.
    // Lift stats.icon onto the instance when no explicit spec.icon
    // was given. Per-spawn overrides (e.g., cain's '🧙🏽‍♂️') ride in
    // spec.stats.icon too, so this also handles them.
    if (spec.icon == null && spec.stats && spec.stats.icon != null) {
      this.icon = spec.stats.icon;
    }
    this.type     = spec.type     ?? 'unknown';
    this.attitude = spec.attitude ?? NPC_ATTITUDE.HOSTILE;
    this.behavior = spec.behavior ?? NPC_BEHAVIOR.CHASE;
    // actionTimer retained on the instance for any not-yet-migrated
    // callers but is no longer ticked here — Sentient.actionCooldown
    // is the canonical clock and the scheduler drives it.
    this.actionTimer = spec.actionTimer ?? 0;

    // Derive per-NPC cooldown costs from stats.speed. The legacy
    // pattern `actionTimer += speed * steps; while (>=1) act();` made
    // a NPC with speed=2 act twice per player turn. We translate to
    // cooldown form: cost-per-action = 1/speed (so the scheduler
    // calls a speed=2 entity every 0.5 ticks → twice per player turn).
    // Edge cases:
    //   speed === 0 (or missing): defaults to 1.0 — guards divide-by-
    //     zero AND keeps stationary NPCs schedulable; their actual
    //     behavior tag is usually STATIONARY which no-ops takeTurn,
    //     so the cooldown value is mostly cosmetic for them.
    //   speed > 0: move = 1/speed, attack = max(1.0, 1/speed). The
    //     attack floor prevents melee from feeling absurdly fast on
    //     hyper-speed monsters (matches Brogue convention).
    const sp = (this.stats && typeof this.stats.speed === 'number') ? this.stats.speed : 0;
    const moveCost   = sp > 0 ? (1.0 / sp) : 1.0;
    const attackCost = sp > 0 ? Math.max(1.0, 1.0 / sp) : 1.0;
    this.cooldowns = { move: moveCost, attack: attackCost };
    // Preserve every legacy spawn-spec field that downstream code
    // reads — keep names so the moved logic still compiles.
    for (const k of [
      'stats','provoked','taunted','isMimic','isIfrit','fleePlayer',
      'preferPlants','isFarmAnimal','isVermin','isQuestNPC','isSceneNPC',
      'patrolPath','patrolIndex','patrolCenter','patrolRadius',
      '_followTarget','_stayInShop','_blacksmithDialogIdx',
      '_sceneNextMoveAt','_sceneMoveCooldown','sceneMoveIntervalMs',
      '_patrolTurnCount','_patrolTarget','_ifritAction','_mimicAwake',
      '_nextPixieVoiceMs','_lastDx','_mimicSpotted',
    ]) {
      if (spec[k] !== undefined) this[k] = spec[k];
    }
  }

  isHostile()  { return this.attitude === NPC_ATTITUDE.HOSTILE; }
  isHostileTo(_target) { return this.isHostile(); }  // future: per-target

  /**
   * Default NPC turn. Routes by this.behavior. Subclasses override
   * for type-specific behavior (Ifrit, Mimic, Thief, ...).
   *
   * ctx fields (engine.js builds the object — see makeNpcCtx):
   *   isScene, nowMs, steps, player, theMap, mapW, mapH, enemies,
   *   isTileFloor, currentScene, sound, voice, tone, log, floatText,
   *   damagePlayer, monsterAttack, spawnFx, webglImpact, indexOf.
   */
  takeTurn(ctx) {
    if (ctx.isScene) {
      if (this.behavior === NPC_BEHAVIOR.FOLLOW)  return this._takeFollowTurn(ctx);
      if (this.behavior === NPC_BEHAVIOR.PATROL)  return this._takePatrolTurn(ctx);
      return;
    }
    // Turn-clock dispatch
    if (this.behavior === NPC_BEHAVIOR.STATIONARY) return;
    if (this.behavior === NPC_BEHAVIOR.WANDER)     return this._takeWanderTurn(ctx);
    if (this.behavior === NPC_BEHAVIOR.FLEE)       return this._takeFleeTurn(ctx);
    if (this.behavior === NPC_BEHAVIOR.VERMIN)     return this._takeVerminTurn(ctx);
    return this._takeChaseTurn(ctx);
  }

  // ─── Combat ─────────────────────────────────────────────────
  /**
   * Receive incoming damage from `attacker`. Rolls the attacker's
   * crit chance, applies damage to `this.stats.hp`, returns the
   * final damage dealt (≥ the input dmg when a crit fires).
   *
   * Does NOT handle death — callers own corpse generation, XP
   * awards, level-up triggers, splice-from-enemies. takeDamage just
   * mutates HP and reports back.
   *
   * `attacker` is typically the Player (uses Player.effectiveCritRate
   * to fold in equipment bonuses). Any Sentient with effectiveCritRate
   * works. Pass null/undefined if no attacker context (e.g. environmental
   * damage) — then no crit roll fires.
   */
  takeDamage(dmg, attacker) {
    if (dmg > 0 && attacker &&
        typeof attacker.effectiveCritRate === 'function' &&
        Math.random() < attacker.effectiveCritRate()) {
      const bonus = Math.max(1, Math.round(dmg * 0.5));
      dmg += bonus;
      if (typeof logMsg === 'function') {
        logMsg(`<span style='color:#6fd'>Extra ${bonus} damage to enemy from crit!</span>`);
      }
    }
    this.stats.hp -= dmg;
    return dmg;
  }

  /**
   * Resolve this NPC's melee attack against `target` (typically
   * ctx.player). One call = one attack attempt: roll to hit, then
   * roll damage, apply, fire view-layer hooks, run reflection
   * (Crown of Thorns), and check for the target's death. Type-
   * specific flavor (T-Rex stomp, shark bite SFX, mimic coin spit,
   * duck quack) lives in the flat switch below — small, self-
   * contained, and matches the legacy structure 1:1.
   *
   * Returns true if the attack connected (hit), false on a miss.
   * Caller doesn't usually care about the return — the cost is
   * 'attack' in either case.
   */
  attack(target, ctx) {
    const e = this;
    // Hit roll. target.dodgeRate is the player's effectiveDodgeRate
    // when it's a Player instance; falls back to 0 otherwise.
    const hitChance = (e.stats.hit ?? 0) * (1 - (target.dodgeRate ?? 0));
    if (Math.random() >= hitChance) {
      ctx.log(`The ${e.type} misses you.`);
      return false;
    }
    // Damage roll: 1..stats.dmg inclusive. Floored at 1.
    const dmg = Math.floor(Math.random() * (e.stats.dmg ?? 1)) + 1;
    ctx.log(`The ${e.type} hits you for ${dmg} damage.`);
    ctx.soundEvent('grunt');
    // Apply HP/tint/float/webgl + die check. Returns true if died.
    const died = ctx.damagePlayer(dmg, e.type, 16 + dmg);
    // ── Type-specific flavor ──────────────────────────────────
    // These were a flat type-switch in legacy engine.monsterAttack.
    // Kept here as a switch (not subclass overrides) because they're
    // small and the legacy author chose a flat shape; subclassing
    // adds 5 declarations for ~3 lines of payload each. Revisit if
    // any one of them grows past a few lines.
    if (e.type === 'duck') {
      ctx.soundEvent('quack');
      ctx.log(`<span style='color:#FFD700'>The duck quacks aggressively!</span>`);
    }
    if (e.type === 'trex') {
      ctx.soundEvent('trexRoar');
      ctx.soundEvent('trexStomp');
      if (Math.random() < 0.3) {
        target._stunned = 1;
        ctx.log("<span style='color:#f44'>🦖 The T-Rex STOMPS! You're stunned!</span>");
      }
      ctx.floatText(target.x, target.y, '💥', '#f00', 22);
    }
    if (e.type === 'shark') {
      ctx.soundEvent('sharkBite');
      ctx.floatText(e.x,      e.y,      '🩸', '#cc0000', 24);
      ctx.floatText(target.x, target.y, '🩸', '#cc0000', 24);
    }
    if (e.isMimic && e.type === 'mimic') {
      ctx.sound('mimic_attack', 0.7);
      ctx.sound('ka_ching',     0.5);
      ctx.spawnFx({
        kind: 'goldCoins', x1: e.x, y1: e.y, x2: target.x, y2: target.y,
        color: '#FFD700', life: 1.0, power: 0.8,
      });
      ctx.floatText(target.x, target.y, '🪙', '#FFD700', 18);
    }
    // ── Quest event ───────────────────────────────────────────
    if (typeof QuestEngine !== 'undefined' && QuestEngine.emit) {
      QuestEngine.emit('combat_hurt', { attacker: e.type, damage: dmg });
    }
    // ── Crown of Thorns reflection ────────────────────────────
    // Target gear can damage the attacker (this NPC) on a hit.
    // If the reflection kills this NPC, remove it from the live list.
    const headSlot = target.equipped && target.equipped.head;
    if (headSlot && typeof ItemDef !== 'undefined' && ItemDef.byIcon) {
      const def = ItemDef.byIcon(headSlot);
      if (def && def.thornsDmg) {
        const thorns = def.thornsDmg;
        e.stats.hp -= thorns;
        ctx.floatText(e.x, e.y, `-${thorns}🌿`, '#8f8', 14);
        ctx.log(`Crown of Thorns reflects ${thorns} damage!`);
        if (e.stats.hp <= 0) {
          ctx.log(`The ${e.type} is destroyed by thorns!`);
          if (typeof target.xp === 'number') target.xp += 50;
          if (typeof checkLevelUp === 'function') checkLevelUp();
          ctx.removeEnemy(e);
        }
      }
    }
    return !died;  // unused by callers today; future-proofs the contract
  }

  // ─── Default behavior implementations ───────────────────────
  // These were inlined into the 440-line enemies.forEach block in
  // engine.js. Ported here ~1:1; renames are e → this, player →
  // ctx.player, theMap → ctx.theMap, Sound.X → ctx.sound/voice/tone,
  // logMsg → ctx.log, addFloatingText → ctx.floatText, etc.

  _takeChaseTurn(ctx) {
    const e = this;
    const { player, theMap, enemies, isTileFloor } = ctx;
    if (!e.stats) return 'move';
    const isAdj = Math.abs(e.x - player.x) <= 1 && Math.abs(e.y - player.y) <= 1;
    if (isAdj) { e.attack(player, ctx); return 'attack'; }
    let dx = Math.sign(player.x - e.x), dy = Math.sign(player.y - e.y);
    if (dx !== 0 && dy !== 0) {
      switch (Math.floor(Math.random() * 3)) {
        case 0: dx = 0; break;
        case 1: dy = 0; break;
        case 2: break;
      }
    }
    const tile = theMap[e.y+dy] && theMap[e.y+dy][e.x+dx];
    if (!enemies.some(e2 => e !== e2 && e.x+dx === e2.x && e.y+dy === e2.y)
        && (isTileFloor(tile) || (e.stats.throughWalls && tile === ctx.TILES.WALL))) {
      e.x += dx; e.y += dy;
      if (dx !== 0) e._lastDx = dx;
    }
    return 'move';
  }

  _takeWanderTurn(ctx) {
    const e = this;
    const { player, theMap, mapW, mapH, enemies, isTileFloor } = ctx;
    if (!e.stats) return 'move';
    // Legacy wandered every 5 player-turns. With the scheduler, this
    // NPC's takeTurn is called every 1/speed of a player-turn — so we
    // count own-ticks (5 == "wait 5 of MY turns before moving").
    e.stats.wanderTimer = (e.stats.wanderTimer ?? 0) + 1;
    if (e.stats.wanderTimer < 5) return 'move';
    e.stats.wanderTimer = 0;
    const wDirs = [[0,-1],[1,0],[0,1],[-1,0]].sort(() => Math.random() - 0.5);
    for (const [wdx, wdy] of wDirs) {
      const wx = e.x + wdx, wy = e.y + wdy;
      if (wx >= 0 && wx < mapW && wy >= 0 && wy < mapH &&
          isTileFloor(theMap[wy][wx]) &&
          !enemies.some(o => o !== e && o.x === wx && o.y === wy) &&
          !(wx === player.x && wy === player.y)) {
        e.x = wx; e.y = wy;
        break;
      }
    }
    return 'move';
  }

  _takeFleeTurn(ctx) {
    const e = this;
    const { player, theMap, mapW, mapH, enemies } = ctx;
    if (!e.stats) return 'move';
    const TILES = ctx.TILES;
    const distToPlayer = Math.hypot(e.x - player.x, e.y - player.y);
    if (distToPlayer <= 3) {
      const fdx = e.x - player.x;
      const fdy = e.y - player.y;
      const steps2 = [
        {dx: Math.sign(fdx) || 1,  dy: 0},
        {dx: 0,                     dy: Math.sign(fdy) || 1},
        {dx: -(Math.sign(fdx) || 1), dy: 0},
        {dx: 0,                     dy: -(Math.sign(fdy) || 1)},
      ];
      for (const s of steps2) {
        const nx = e.x + s.dx, ny = e.y + s.dy;
        if (nx >= 0 && nx < mapW && ny >= 0 && ny < mapH &&
            theMap[ny] && theMap[ny][nx] !== TILES.WALL &&
            !enemies.some(o => o !== e && o.x === nx && o.y === ny)) {
          e.x = nx; e.y = ny; break;
        }
      }
    } else if (distToPlayer > 8 && e.preferPlants) {
      const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
      const d = dirs[Math.floor(Math.random() * dirs.length)];
      const nx = e.x + d.dx, ny = e.y + d.dy;
      if (nx >= 1 && nx < mapW-1 && ny >= 1 && ny < mapH-1 &&
          theMap[ny] && theMap[ny][nx] !== TILES.WALL &&
          !enemies.some(o => o !== e && o.x === nx && o.y === ny)) {
        e.x = nx; e.y = ny;
      }
    }
    return 'move';
  }

  _takeVerminTurn(ctx) {
    const e = this;
    const { player, theMap, enemies, isTileFloor } = ctx;
    if (!e.stats) return 'move';
    const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
    if (dist < 3) {
      let fleeDx = -Math.sign(player.x - e.x);
      let fleeDy = -Math.sign(player.y - e.y);
      if (dist === 2 && Math.random() < 0.6) {
        if (Math.abs(player.x - e.x) > Math.abs(player.y - e.y)) {
          fleeDx = 0; fleeDy = Math.random() > 0.5 ? 1 : -1;
        } else {
          fleeDy = 0; fleeDx = Math.random() > 0.5 ? 1 : -1;
        }
      }
      const nx = e.x + fleeDx, ny = e.y + fleeDy;
      if (theMap[ny] && isTileFloor(theMap[ny][nx]) &&
          !enemies.some(o => o.x === nx && o.y === ny)) {
        e.x = nx; e.y = ny;
      }
    } else if (dist > 4) {
      const dx = Math.sign(player.x - e.x), dy = Math.sign(player.y - e.y);
      const nx = e.x + dx, ny = e.y + dy;
      if (theMap[ny] && isTileFloor(theMap[ny][nx]) &&
          !enemies.some(o => o.x === nx && o.y === ny)) {
        e.x = nx; e.y = ny;
      }
    }
    return 'move';
  }

  _takePatrolTurn(ctx) {
    // Scene-clock: walk patrolPath at sceneMoveIntervalMs cadence.
    const e = this;
    const { nowMs, player } = ctx;
    if (!e.isSceneNPC || !e.patrolPath || e.patrolPath.length === 0) return;
    const moveInterval = Math.max(250, e.sceneMoveIntervalMs ?? 800);
    if (typeof e._sceneNextMoveAt !== 'number') e._sceneNextMoveAt = nowMs;
    if (nowMs < e._sceneNextMoveAt) return;
    e._sceneNextMoveAt = nowMs + moveInterval;
    const nextIndex = ((e.patrolIndex ?? 0) + 1) % e.patrolPath.length;
    const nextStep = e.patrolPath[nextIndex];
    if (!nextStep) return;
    if (player.x === nextStep.x && player.y === nextStep.y) return;
    const pdx = nextStep.x - e.x;
    if (pdx !== 0) e._lastDx = pdx;
    e.x = nextStep.x;
    e.y = nextStep.y;
    e.patrolIndex = nextIndex;
    ctx.markMoved();
  }

  _takeFollowTurn(ctx) {
    // Scene-clock: step toward an NPC identified by _followTarget type.
    const e = this;
    const { theMap, enemies, player } = ctx;
    if (!e._followTarget) return;
    const target = enemies.find(t => t && t.type === e._followTarget);
    if (!target) return;
    const dist = Math.hypot(e.x - target.x, e.y - target.y);
    if (dist < 1.5) return;
    const dx = Math.sign(target.x - e.x);
    const dy = Math.sign(target.y - e.y);
    const dirs = [{dx,dy},{dx,dy:0},{dx:0,dy}].sort(() => Math.random() - 0.5);
    for (const d of dirs) {
      const nx = e.x + d.dx, ny = e.y + d.dy;
      if (theMap[ny] && theMap[ny][nx] !== ctx.TILES.WALL &&
          !enemies.some(o => o !== e && o !== target && o.x === nx && o.y === ny) &&
          !(player.x === nx && player.y === ny)) {
        e.x = nx; e.y = ny;
        ctx.markMoved();
        break;
      }
    }
  }
}


// ──────────────────────────────────────────────────────────────
//  Typed subclasses — type-specific behavior overrides takeTurn.
//  All ported 1:1 from the legacy enemies.forEach branches.
// ──────────────────────────────────────────────────────────────

class Ifrit extends NPC {
  constructor(spec = {}) {
    super({ ...spec, behavior: NPC_BEHAVIOR.PATROL });  // semantic; takeTurn fully overrides
  }
  takeTurn(ctx) {
    if (ctx.isScene) return 'move';
    const e = this;
    const { player, theMap, enemies, isTileFloor } = ctx;
    if (!e.isIfrit) return 'move';  // legacy gate
    const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
    if (!e.provoked) {
      if (dist <= 5 && Math.random() < 0.3) {
        const IDLE_TAUNTS = [
          { text: "🔥 Ifrit: 'You're still here? I admire your... stupidity.'",              voice: 'voice_ifrit_greet_0' },
          { text: "🔥 Ifrit: 'I'm not guarding anything. I just LIKE standing in dark rooms.'", voice: 'voice_ifrit_greet_1' },
          { text: "🔥 Ifrit: 'Go away. I'm trying to meditate. It's hard when you're literally on fire.'", voice: 'voice_ifrit_greet_2' },
          { text: "🔥 Ifrit: 'Is it hot in here or is it just me? ...it's me. Obviously.'",    voice: 'voice_ifrit_greet_3' },
        ];
        const t = IDLE_TAUNTS[Math.floor(Math.random() * IDLE_TAUNTS.length)];
        ctx.log(t.text);
        ctx.voice(t.voice);
      }
      // Count own-ticks now (was player-steps); 8 own-ticks ≈ same
      // cadence at speed 1.0 as the legacy version.
      e._patrolTurnCount = (e._patrolTurnCount ?? 0) + 1;
      if (e._patrolTurnCount >= 8) {
        e._patrolTurnCount = 0;
        const roll = Math.random();
        if (roll < 0.7) {
          e._ifritAction = 'patrol';
          const mapW2 = theMap[0] ? theMap[0].length : 30;
          const mapH2 = theMap.length ?? 30;
          const c = e.patrolCenter || { x: e.x, y: e.y };
          const pr = e.patrolRadius ?? 4;
          for (let attempt = 0; attempt < 10; attempt++) {
            const tx = c.x + Math.floor((Math.random() - 0.5) * (pr * 2 + 1));
            const ty = c.y + Math.floor((Math.random() - 0.5) * (pr * 2 + 1));
            if (tx >= 0 && tx < mapW2 && ty >= 0 && ty < mapH2 &&
                theMap[ty] && isTileFloor(theMap[ty][tx])) {
              e._patrolTarget = { x: tx, y: ty };
              break;
            }
          }
        } else if (roll < 0.75) {
          e._ifritAction = 'sit';
        } else {
          e._ifritAction = 'stand';
        }
      }
      if (e._ifritAction === 'patrol' && e._patrolTarget) {
        const pdx = Math.sign(e._patrolTarget.x - e.x);
        const pdy = Math.sign(e._patrolTarget.y - e.y);
        if (pdx !== 0 || pdy !== 0) {
          const nx = e.x + pdx, ny = e.y + pdy;
          const mapW2 = theMap[0] ? theMap[0].length : 30;
          const mapH2 = theMap.length ?? 30;
          if (nx >= 0 && nx < mapW2 && ny >= 0 && ny < mapH2 &&
              theMap[ny] && isTileFloor(theMap[ny][nx]) &&
              !enemies.some(o => o !== e && o.x === nx && o.y === ny) &&
              !(nx === player.x && ny === player.y)) {
            e.x = nx; e.y = ny;
          }
          if (e.x === e._patrolTarget.x && e.y === e._patrolTarget.y) {
            e._patrolTarget = null;
            e._ifritAction = 'stand';
          }
        }
      }
      return 'move';
    }
    // Provoked branch
    if (!e.taunted && player.level < 5) {
      e.taunted = true;
      const FIRE_PUNS = [
        { text: "🔥 Ifrit: 'You look a little... burned out. Maybe level up first?'", voice: 'voice_ifrit_low_level' },
        { text: "🔥 Ifrit: 'I'm on FIRE today! Get it? Because... fire.'",             voice: 'voice_ifrit_combat_0' },
        { text: "🔥 Ifrit: 'I hope you brought marshmallows. Because you're TOAST.'",   voice: 'voice_ifrit_combat_1' },
      ];
      const p = FIRE_PUNS[Math.floor(Math.random() * FIRE_PUNS.length)];
      ctx.log(p.text);
      ctx.voice(p.voice);
    }
    if (e.stats.hp < e.stats.maxHp && Math.random() < 0.05) {
      const healAmt = 20 + Math.floor(Math.random() * 15);
      e.stats.hp = Math.min(e.stats.maxHp, e.stats.hp + healAmt);
      ctx.floatText(e.x, e.y, `+${healAmt}🔥`, '#f80', 22);
      ctx.log("<span style='color:#f80'>🔥 Ifrit blazes: 'FLAME ON!' and heals " + healAmt + " HP!</span>");
      ctx.webglImpact(0, e.x, e.y);
    }
    if (dist >= 3 && dist <= 8 && Math.random() < 0.4) {
      ctx.log("<span style='color:var(--error)'>🔥 Ifrit hurls a fireball at you!</span>");
      ctx.voice('voice_ifrit_attack');
      const dx = Math.sign(player.x - e.x), dy = Math.sign(player.y - e.y);
      for (let t = 1; t <= dist; t++) {
        const fx = e.x + dx * t, fy = e.y + dy * t;
        if (theMap[fy] && theMap[fy][fx] === ctx.TILES.WALL) break;
        ctx.floatText(fx, fy, '🔥', '#f60', 20);
      }
      const dmg = 15 + Math.floor(Math.random() * 10);
      if (ctx.damagePlayer(dmg, 'ifrit_fireball', 22)) return 'attack';
      ctx.log(`You take ${dmg} fire damage!`);
      return 'attack';
    } else if (dist <= 1) {
      ctx.log("<span style='color:var(--error)'>🔥 Ifrit engulfs you in flames!</span>");
      const dmg = 20 + Math.floor(Math.random() * 10);
      if (ctx.damagePlayer(dmg, 'ifrit_aura', 24, '🔥')) return 'attack';
      return 'attack';
    }
    return 'move';
  }
}


class FrenchTaunter extends NPC {
  constructor(spec = {}) {
    super({ ...spec, behavior: NPC_BEHAVIOR.STATIONARY });
  }
  takeTurn(ctx) {
    if (ctx.isScene) return 'move';
    const e = this;
    const { player } = ctx;
    if (Math.abs(e.x - player.x) + Math.abs(e.y - player.y) <= 5 && Math.random() < 0.1) {
      ctx.log("<span style='color:var(--error)'>The French Taunter flings a COW at you!</span>");
      if (ctx.damagePlayer(10, 'cow_toss', 24, '🐄')) return 'attack';
      return 'attack';
    }
    return 'move';
  }
}


class Thief extends NPC {
  takeTurn(ctx) {
    if (ctx.isScene) return 'move';
    const e = this;
    const { player, theMap, mapW, mapH, enemies, zone, isTileFloor, CONSTANTS } = ctx;
    const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
    if (e.stats.patrolling) {
      if (dist <= 4 && (player.stationaryTurns ?? 0) >= 2) {
        const pdx = Math.sign(player.x - e.x), pdy = Math.sign(player.y - e.y);
        const nx2 = e.x + pdx, ny2 = e.y + pdy;
        if (nx2 >= 0 && nx2 < mapW && ny2 >= 0 && ny2 < mapH &&
            isTileFloor(theMap[ny2][nx2]) &&
            !enemies.some(o => o !== e && o.x === nx2 && o.y === ny2)) {
          e.x = nx2; e.y = ny2;
        }
        const newDist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
        if (newDist === 1 && Math.random() < CONSTANTS.STEAL_CHANCE) { ctx.thiefSteal(e); return 'attack'; }
      } else if (dist === 1 && Math.random() < CONSTANTS.STEAL_CHANCE) {
        ctx.thiefSteal(e); return 'attack';
      }
    } else {
      if (dist === 1 && Math.random() < CONSTANTS.STEAL_CHANCE) { ctx.thiefSteal(e); return 'attack'; }
      // Thieves walk toward the nearest floor pile (within 5 tiles).
      const pile = zone.lootables.find(l => l && l.ownerKind === 'floor' && Math.abs(l.x-e.x)+Math.abs(l.y-e.y) <= 5);
      if (pile) { e.x += Math.sign(pile.x-e.x); e.y += Math.sign(pile.y-e.y); }
      else      { e.x += (Math.random()>0.5?1:-1); e.y += (Math.random()>0.5?1:-1); }
    }
    return 'move';
  }
}


class Fence extends NPC {
  takeTurn(ctx) {
    if (ctx.isScene) return 'move';
    const e = this;
    const { player, theMap, enemies, isTileFloor } = ctx;
    const barX = (typeof window !== 'undefined' && window._fenceBarX) || player.x;
    const barY = (typeof window !== 'undefined' && window._fenceBarY) || player.y;
    const onEntrance = (e.x === barX && e.y === barY) ||
                       (e.x === barX && e.y === barY + 1) ||
                       (e.x === barX - 1 && e.y === barY + 1) ||
                       (e.x === barX + 1 && e.y === barY + 1);
    if (onEntrance) {
      const nx = barX + 3, ny = barY + 2;
      if (theMap[ny] && isTileFloor(theMap[ny][nx])) { e.x = nx; e.y = ny; return 'move'; }
    }
    // Legacy gated the wander on speed (actionTimer never accumulated
    // for speed=0). Preserved here so MONSTER_DEF['fence'].speed = 0
    // keeps Fence anchored unless a future def bumps it.
    if (e.stats.speed > 0 && Math.random() < 0.4) {
      const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
      const [fdx, fdy] = dirs[Math.floor(Math.random() * dirs.length)];
      const nx2 = e.x + fdx, ny2 = e.y + fdy;
      const blocksEntrance =
        (nx2 === barX && ny2 === barY) ||
        (nx2 === barX && ny2 === barY + 1) ||
        (nx2 === barX - 1 && ny2 === barY + 1) ||
        (nx2 === barX + 1 && ny2 === barY + 1);
      if (theMap[ny2] && isTileFloor(theMap[ny2][nx2]) &&
          Math.abs(nx2 - barX) <= 6 && Math.abs(ny2 - barY) <= 6 &&
          !blocksEntrance &&
          !enemies.some(o => o !== e && o.x === nx2 && o.y === ny2)) {
        e.x = nx2; e.y = ny2;
      }
    }
    return 'move';
  }
}


class Mimic extends NPC {
  takeTurn(ctx) {
    if (ctx.isScene) return 'move';
    const e = this;
    const { player, theMap, enemies, isTileFloor } = ctx;
    if (!e.isMimic) return 'move';  // legacy gate: only awakened mimics act
    const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
    if ((e.provoked || e._mimicAwake) && dist >= 2 && dist <= 6 && Math.random() < 0.45) {
      ctx.sound('mimic_attack', 0.75);
      ctx.sound('ka_ching', 0.55);
      ctx.spawnFx({ kind:'goldCoins', x1:e.x, y1:e.y, x2:player.x, y2:player.y, color:'#FFD700', life:1.0, power:0.9 });
      const pdmg = Math.max(2, Math.floor((e.stats.dmg ?? 8) * 0.6));
      ctx.log("<span style='color:var(--error)'>🪙 The Mimic spits a volley of gold coins!</span>");
      if (ctx.damagePlayer(pdmg, 'mimic_coin', 16, '🪙', '#FFD700')) return 'attack';
      return 'attack';
    }
    if (dist <= 1) { e.attack(player, ctx); return 'attack'; }
    const dx = Math.sign(player.x - e.x), dy = Math.sign(player.y - e.y);
    const nx = e.x + dx, ny = e.y + dy;
    if (theMap[ny] && isTileFloor(theMap[ny][nx]) &&
        !enemies.some(o => o !== e && o.x === nx && o.y === ny)) {
      e.x = nx; e.y = ny;
    }
    return 'move';
  }
}


class Shark extends NPC {
  takeTurn(ctx) {
    if (ctx.isScene) return 'move';
    const e = this;
    const { player, theMap } = ctx;
    const TILES = ctx.TILES;
    if (!e.stats.stalks) return 'move';
    const playerOnWater = theMap[player.y] && (theMap[player.y][player.x] === TILES.WATER || theMap[player.y][player.x] === TILES.DEEP_WATER);
    const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
    const aggroRange = e.stats.aggro ?? 6;
    if (playerOnWater && dist <= aggroRange) e.provoked = true;
    if (e.provoked || dist <= aggroRange) {
      const isAdj = Math.abs(e.x - player.x) <= 1 && Math.abs(e.y - player.y) <= 1;
      if (isAdj) { e.attack(player, ctx); return 'attack'; }
      const dx = Math.sign(player.x - e.x), dy = Math.sign(player.y - e.y);
      const targetTile = theMap[e.y+dy] && theMap[e.y+dy][e.x+dx];
      if (targetTile === TILES.WATER || targetTile === TILES.DEEP_WATER) {
        e.x += dx; e.y += dy;
      }
    }
    return 'move';
  }
}


class Zombie extends NPC {
  takeTurn(ctx) {
    if (ctx.isScene) return 'move';
    const e = this;
    const { player, theMap, enemies, isTileFloor } = ctx;
    const aggroRange = e.stats.aggro ?? 5;
    const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
    const isAdj = dist <= 1;
    if (dist <= aggroRange) e.provoked = true;
    if (isAdj && e.provoked) { e.attack(player, ctx); return 'attack'; }
    if (e.provoked) {
      let dx = Math.sign(player.x - e.x), dy = Math.sign(player.y - e.y);
      if (dx !== 0 && dy !== 0) {
        if (Math.random() < 0.5) dx = 0; else dy = 0;
      }
      const tile = theMap[e.y+dy] && theMap[e.y+dy][e.x+dx];
      if (!enemies.some(e2 => e !== e2 && e.x+dx === e2.x && e.y+dy === e2.y)
          && isTileFloor(tile)) {
        e.x += dx; e.y += dy;
        if (dx !== 0) e._lastDx = dx;
      }
    } else if (Math.random() < 0.45) {
      const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
      const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
      const tile = theMap[e.y+dy] && theMap[e.y+dy][e.x+dx];
      if (!enemies.some(e2 => e !== e2 && e.x+dx === e2.x && e.y+dy === e2.y)
          && isTileFloor(tile)) {
        e.x += dx; e.y += dy;
        if (dx !== 0) e._lastDx = dx;
      }
    }
    return 'move';
  }
}


class Pixie extends NPC {
  // Pixie is a chaser with extra voice/sfx flavor when near the player.
  // Delegates motion to the default chase behavior after the flavor pass.
  takeTurn(ctx) {
    if (ctx.isScene) return 'move';
    const e = this;
    const { player, nowMs } = ctx;
    const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
    // Per own-tick (was 0.06 * player-steps); now triggers per Pixie
    // call which the scheduler paces by speed.
    if (dist <= 6 && Math.random() < 0.06) {
      ctx.sound('squeak', 0.16, { freq: 900, freqJitter: 400, kind: 'sawtooth', vol: 0.08, dur: 0.06, decay: 1800 });
    }
    if (dist <= 4 && (!e._nextPixieVoiceMs || nowMs >= e._nextPixieVoiceMs)) {
      ctx.voice(`voice_pixie_${Math.floor(Math.random() * 3)}`);
      e._nextPixieVoiceMs = nowMs + 12000 + Math.floor(Math.random() * 10000);
    }
    return this._takeChaseTurn(ctx);
  }
}


// ──────────────────────────────────────────────────────────────
//  Factory — converts a legacy spawn spec into the right subclass.
//
//  Routing priority:
//    1. spec.type matches a typed subclass → instantiate that
//    2. _stayInShop / known-shopkeeper types → STATIONARY
//    3. stats.wandering → WANDER
//    4. fleePlayer flag → FLEE
//    5. stats.passive → VERMIN
//    6. patrolPath + isSceneNPC → PATROL (scene clock)
//    7. _followTarget → FOLLOW (scene clock)
//    8. stats.quest → STATIONARY
//    9. default → CHASE
// ──────────────────────────────────────────────────────────────
const NPC_TYPED = {
  ifrit:          Ifrit,
  french_taunter: FrenchTaunter,
  thief:          Thief,
  fence:          Fence,
  mimic:          Mimic,
  shark:          Shark,
  zombie:         Zombie,
  pixie:          Pixie,
};

const STATIONARY_TYPES = new Set(['cohen','librarian','vimes','bearded_dwarf']);

NPC.fromSpec = function (spec = {}) {
  const Cls = NPC_TYPED[spec.type];
  if (Cls) return new Cls(spec);
  let behavior = NPC_BEHAVIOR.CHASE;
  const stats = spec.stats || {};
  // Priority order matters: many quest NPCs are also flagged
  // `passive: true` (Blacksmith, Rosencrantz, town guard) — those
  // should NOT be routed to VERMIN (which makes them flee the
  // player). Resolve "what kind of NPC is this?" by the strongest
  // signal first:
  //   1. Hard-coded stationary names (specific shopkeepers).
  //   2. patrolPath + isSceneNPC (scene-clock waypoint walkers).
  //   3. _followTarget (scene-clock follower).
  //   4. stats.quest (talk-to NPCs: Griswold, Cain, Dennis, town
  //      guard, retired soldier, etc — they sit and chat).
  //   5. stats.wandering (explicit opt-in to random walk).
  //   6. fleePlayer (outdoor animals fleeing when scared).
  //   7. stats.passive (only true vermin — mice/cockroaches — reach
  //      here because they have no quest flag).
  //   8. default → CHASE.
  if (spec._stayInShop || STATIONARY_TYPES.has(spec.type)) behavior = NPC_BEHAVIOR.STATIONARY;
  else if (spec.patrolPath && spec.isSceneNPC) behavior = NPC_BEHAVIOR.PATROL;
  else if (spec._followTarget)      behavior = NPC_BEHAVIOR.FOLLOW;
  else if (stats.quest)             behavior = NPC_BEHAVIOR.STATIONARY;
  else if (stats.wandering)         behavior = NPC_BEHAVIOR.WANDER;
  else if (spec.fleePlayer)         behavior = NPC_BEHAVIOR.FLEE;
  else if (stats.passive)           behavior = NPC_BEHAVIOR.VERMIN;
  return new NPC({ ...spec, behavior });
};


// ──────────────────────────────────────────────────────────────
//  spawnNpc — single construction helper for ALL spawn sites.
//
//  Replaces the copy-pasted idiom
//      list.push({ x, y, type, stats: {...MONSTER_DEF[type]},
//                  actionTimer: 0, ...flags })
//  that appeared ~70 times across map.js / engine.js / input.js /
//  player.js / quests_*.js. Centralises the construction protocol
//  (MONSTER_DEF lookup, actionTimer default, NPC.fromSpec) in one
//  place so spawn-call surface area shrinks dramatically.
//
//  Usage:
//      spawnNpc(enemies, x, y, 'slime');
//      spawnNpc(enemies, x, y, 'blacksmith', { isQuestNPC: true });
//      spawnNpc(enemies, x, y, 'chicken', { stats: farmStats(...) });
//      const peasant = spawnNpc(town.enemies, x, y, 'muck_peasant', {
//        patrolPath: [...], isQuestNPC: true, isSceneNPC: true,
//      });
//
//  opts.stats — if present, fully REPLACES MONSTER_DEF[type] (used
//  by farm animals with custom farmStats(), or any caller that
//  wants a bespoke stat block). Without opts.stats, MONSTER_DEF[type]
//  is shallow-cloned. To extend MONSTER_DEF[type] with a couple of
//  field overrides, callers can still write
//  `{ stats: { ...MONSTER_DEF[t], icon: '🧙‍♂️' } }`.
//
//  Returns the constructed NPC instance so callers can post-mutate
//  (e.g., assign patrolPath after computing positions).
// ──────────────────────────────────────────────────────────────
// Normalize a single loot spec into an ItemStack or null.
//
// Accepts both modern and legacy shapes so callers like
// spawnRandomAnimals can keep passing MONSTER_DEF.loot verbatim:
//
//   modern:  ItemStack instance (already has .itemName) — kept as-is
//   modern:  { itemName: 'gold', qty: 5 }                — wrapped in ItemStack
//   legacy:  { icon: '🩸', chance: 0.9, qty?: 1 }       — chance rolled at
//                                                          spawn; on hit
//                                                          resolved via
//                                                          ItemStack.fromIcon
//
// Returns null for misses (legacy entry whose chance roll failed) or
// for malformed entries — the caller drops nulls from the slots list.
function _normalizeLootEntry(entry) {
  if (!entry) return null;
  if (typeof ItemStack !== 'undefined' && entry instanceof ItemStack) return entry;
  if (typeof entry.itemName === 'string') {
    return (typeof ItemStack !== 'undefined') ? new ItemStack(entry.itemName, entry.qty ?? 1) : entry;
  }
  if (typeof entry.icon === 'string') {
    const chance = (typeof entry.chance === 'number') ? entry.chance : 1.0;
    if (Math.random() >= chance) return null;
    return (typeof ItemStack !== 'undefined' && ItemStack.fromIcon)
      ? ItemStack.fromIcon(entry.icon, entry.qty ?? 1)
      : null;
  }
  return null;
}

function spawnNpc(list, x, y, type, opts = {}) {
  const { stats: explicitStats, loot: preRolledLoot, ...rest } = opts;
  const def = (typeof MONSTER_DEF !== 'undefined' && MONSTER_DEF[type]) || {};
  const stats = explicitStats ? explicitStats : { ...def };
  const spec = { x, y, type, stats, actionTimer: 0, ...rest };
  const npc = NPC.fromSpec(spec);
  // Phase 2: every NPC carries a Lootable at spawn time so pickpocket
  // (and later steal mechanics) can mutate the same list before death.
  // Loot precedence: explicit spec.loot > engine-side roller > empty.
  // Both paths run through _normalizeLootEntry which handles legacy
  // {icon,chance} entries — outdoor-animal MONSTER_DEFs use that shape.
  if (typeof Lootable !== 'undefined') {
    let raw;
    if (Array.isArray(preRolledLoot)) {
      raw = preRolledLoot;
    } else if (typeof window !== 'undefined' && typeof window._rollMonsterLoot === 'function') {
      raw = window._rollMonsterLoot(npc);
    } else {
      raw = [];
    }
    const slots = raw.map(_normalizeLootEntry).filter(s => s !== null);
    npc.lootable = new Lootable({ ownerKind: 'npc', slots });
  }
  list.push(npc);
  return npc;
}


if (typeof window !== 'undefined') {
  window.NPC           = NPC;
  window.spawnNpc      = spawnNpc;
  window.NPC_ATTITUDE  = NPC_ATTITUDE;
  window.NPC_BEHAVIOR  = NPC_BEHAVIOR;
  window.Ifrit         = Ifrit;
  window.FrenchTaunter = FrenchTaunter;
  window.Thief         = Thief;
  window.Fence         = Fence;
  window.Mimic         = Mimic;
  window.Shark         = Shark;
  window.Zombie        = Zombie;
  window.Pixie         = Pixie;
}
