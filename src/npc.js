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
//  monsterAttack / applyDamageToEnemy also stay in engine for now;
//  NPCs invoke them via ctx.monsterAttack(npc). Full combat migration
//  to NPC methods is a later iteration.
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
    this.type     = spec.type     ?? 'unknown';
    this.attitude = spec.attitude ?? NPC_ATTITUDE.HOSTILE;
    this.behavior = spec.behavior ?? NPC_BEHAVIOR.CHASE;
    // Legacy speed accumulator. Each per-NPC block today does
    // `actionTimer += speed * steps` then drains via `while(>=1)`.
    // Step 5d retires this in favor of Sentient.actionCooldown.
    this.actionTimer = spec.actionTimer ?? 0;
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

  // ─── Default behavior implementations ───────────────────────
  // These were inlined into the 440-line enemies.forEach block in
  // engine.js. Ported here ~1:1; renames are e → this, player →
  // ctx.player, theMap → ctx.theMap, Sound.X → ctx.sound/voice/tone,
  // logMsg → ctx.log, addFloatingText → ctx.floatText, etc.

  _takeChaseTurn(ctx) {
    const e = this;
    const { player, theMap, enemies, isTileFloor, steps } = ctx;
    if (!e.stats) return;
    e.actionTimer = (e.actionTimer ?? 0) + (e.stats.speed * steps);
    while (e.actionTimer >= 1) {
      e.actionTimer -= 1;
      const isAdj = Math.abs(e.x - player.x) <= 1 && Math.abs(e.y - player.y) <= 1;
      if (isAdj) { ctx.monsterAttack(e); }
      else {
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
      }
    }
  }

  _takeWanderTurn(ctx) {
    const e = this;
    const { player, theMap, mapW, mapH, enemies, isTileFloor, steps } = ctx;
    if (!e.stats) return;
    e.stats.wanderTimer = (e.stats.wanderTimer ?? 0) + steps;
    if (e.stats.wanderTimer < 5) return;
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
  }

  _takeFleeTurn(ctx) {
    const e = this;
    const { player, theMap, mapW, mapH, enemies, steps } = ctx;
    if (!e.stats) return;
    const TILES = ctx.TILES;
    e.actionTimer = (e.actionTimer ?? 0) + ((e.stats.speed ?? 1) * steps);
    while (e.actionTimer >= 1) {
      e.actionTimer -= 1;
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
    }
  }

  _takeVerminTurn(ctx) {
    const e = this;
    const { player, theMap, enemies, isTileFloor, steps } = ctx;
    if (!e.stats) return;
    e.actionTimer += (e.stats.speed * steps);
    while (e.actionTimer >= 1) {
      e.actionTimer -= 1;
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
    }
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
    if (ctx.isScene) return;
    const e = this;
    const { player, theMap, enemies, isTileFloor, steps } = ctx;
    if (!e.isIfrit) return;  // ifrit branch is gated on isIfrit flag in legacy
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
      e._patrolTurnCount = (e._patrolTurnCount ?? 0) + steps;
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
      return;
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
      if (ctx.damagePlayer(dmg, 'ifrit_fireball', 22)) return;
      ctx.log(`You take ${dmg} fire damage!`);
    } else if (dist <= 1) {
      ctx.log("<span style='color:var(--error)'>🔥 Ifrit engulfs you in flames!</span>");
      const dmg = 20 + Math.floor(Math.random() * 10);
      if (ctx.damagePlayer(dmg, 'ifrit_aura', 24, '🔥')) return;
    }
  }
}


class FrenchTaunter extends NPC {
  constructor(spec = {}) {
    super({ ...spec, behavior: NPC_BEHAVIOR.STATIONARY });
  }
  takeTurn(ctx) {
    if (ctx.isScene) return;
    const e = this;
    const { player } = ctx;
    if (Math.abs(e.x - player.x) + Math.abs(e.y - player.y) <= 5 && Math.random() < 0.1) {
      ctx.log("<span style='color:var(--error)'>The French Taunter flings a COW at you!</span>");
      if (ctx.damagePlayer(10, 'cow_toss', 24, '🐄')) return;
    }
  }
}


class Thief extends NPC {
  takeTurn(ctx) {
    if (ctx.isScene) return;
    const e = this;
    const { player, theMap, mapW, mapH, enemies, itemsOnGround, isTileFloor, CONSTANTS } = ctx;
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
        if (newDist === 1 && Math.random() < CONSTANTS.STEAL_CHANCE) ctx.thiefSteal(e);
      } else if (dist === 1 && Math.random() < CONSTANTS.STEAL_CHANCE) {
        ctx.thiefSteal(e);
      }
    } else {
      if (dist === 1 && Math.random() < CONSTANTS.STEAL_CHANCE) ctx.thiefSteal(e);
      const item = itemsOnGround.find(i => Math.abs(i.x-e.x)+Math.abs(i.y-e.y) <= 5);
      if (item) { e.x += Math.sign(item.x-e.x); e.y += Math.sign(item.y-e.y); }
      else      { e.x += (Math.random()>0.5?1:-1); e.y += (Math.random()>0.5?1:-1); }
    }
  }
}


class Fence extends NPC {
  takeTurn(ctx) {
    if (ctx.isScene) return;
    const e = this;
    const { player, theMap, enemies, isTileFloor, steps } = ctx;
    e.actionTimer = (e.actionTimer ?? 0) + (e.stats.speed * steps);
    const barX = (typeof window !== 'undefined' && window._fenceBarX) || player.x;
    const barY = (typeof window !== 'undefined' && window._fenceBarY) || player.y;
    const onEntrance = (e.x === barX && e.y === barY) ||
                       (e.x === barX && e.y === barY + 1) ||
                       (e.x === barX - 1 && e.y === barY + 1) ||
                       (e.x === barX + 1 && e.y === barY + 1);
    if (onEntrance) {
      const nx = barX + 3, ny = barY + 2;
      if (theMap[ny] && isTileFloor(theMap[ny][nx])) { e.x = nx; e.y = ny; }
    }
    while (e.actionTimer >= 1) {
      e.actionTimer -= 1;
      if (Math.random() < 0.4) {
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
    }
  }
}


class Mimic extends NPC {
  takeTurn(ctx) {
    if (ctx.isScene) return;
    const e = this;
    const { player, theMap, enemies, isTileFloor, steps } = ctx;
    if (!e.isMimic) return;  // legacy gate: only awakened mimics act
    e.actionTimer = (e.actionTimer ?? 0) + (e.stats.speed * steps);
    while (e.actionTimer >= 1) {
      e.actionTimer -= 1;
      const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
      if ((e.provoked || e._mimicAwake) && dist >= 2 && dist <= 6 && Math.random() < 0.45) {
        ctx.sound('mimic_attack', 0.75);
        ctx.sound('ka_ching', 0.55);
        ctx.spawnFx({ kind:'goldCoins', x1:e.x, y1:e.y, x2:player.x, y2:player.y, color:'#FFD700', life:1.0, power:0.9 });
        const pdmg = Math.max(2, Math.floor((e.stats.dmg ?? 8) * 0.6));
        ctx.log("<span style='color:var(--error)'>🪙 The Mimic spits a volley of gold coins!</span>");
        if (ctx.damagePlayer(pdmg, 'mimic_coin', 16, '🪙', '#FFD700')) return;
        continue;
      }
      if (dist <= 1) { ctx.monsterAttack(e); continue; }
      const dx = Math.sign(player.x - e.x), dy = Math.sign(player.y - e.y);
      const nx = e.x + dx, ny = e.y + dy;
      if (theMap[ny] && isTileFloor(theMap[ny][nx]) &&
          !enemies.some(o => o !== e && o.x === nx && o.y === ny)) {
        e.x = nx; e.y = ny;
      }
    }
  }
}


class Shark extends NPC {
  takeTurn(ctx) {
    if (ctx.isScene) return;
    const e = this;
    const { player, theMap, steps } = ctx;
    const TILES = ctx.TILES;
    if (!e.stats.stalks) return;
    const playerOnWater = theMap[player.y] && (theMap[player.y][player.x] === TILES.WATER || theMap[player.y][player.x] === TILES.DEEP_WATER);
    const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
    const aggroRange = e.stats.aggro ?? 6;
    if (playerOnWater && dist <= aggroRange) e.provoked = true;
    if (e.provoked || dist <= aggroRange) {
      e.actionTimer += (e.stats.speed * steps);
      while (e.actionTimer >= 1) {
        e.actionTimer -= 1;
        const isAdj = Math.abs(e.x - player.x) <= 1 && Math.abs(e.y - player.y) <= 1;
        if (isAdj) { ctx.monsterAttack(e); }
        else {
          const dx = Math.sign(player.x - e.x), dy = Math.sign(player.y - e.y);
          const targetTile = theMap[e.y+dy] && theMap[e.y+dy][e.x+dx];
          if (targetTile === TILES.WATER || targetTile === TILES.DEEP_WATER) {
            e.x += dx; e.y += dy;
          }
        }
      }
    }
  }
}


class Zombie extends NPC {
  takeTurn(ctx) {
    if (ctx.isScene) return;
    const e = this;
    const { player, theMap, enemies, isTileFloor, steps } = ctx;
    e.actionTimer += (e.stats.speed * steps);
    const aggroRange = e.stats.aggro ?? 5;
    while (e.actionTimer >= 1) {
      e.actionTimer -= 1;
      const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
      const isAdj = dist <= 1;
      if (dist <= aggroRange) e.provoked = true;
      if (isAdj && e.provoked) { ctx.monsterAttack(e); continue; }
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
    }
  }
}


class Pixie extends NPC {
  // Pixie is a chaser with extra voice/sfx flavor when near the player.
  // Delegates motion to the default chase behavior after the flavor pass.
  takeTurn(ctx) {
    if (ctx.isScene) return;
    const e = this;
    const { player, steps, nowMs } = ctx;
    const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
    if (dist <= 6 && Math.random() < 0.06 * steps) {
      ctx.sound('squeak', 0.16, { freq: 900, freqJitter: 400, kind: 'sawtooth', vol: 0.08, dur: 0.06, decay: 1800 });
    }
    if (dist <= 4 && (!e._nextPixieVoiceMs || nowMs >= e._nextPixieVoiceMs)) {
      ctx.voice(`voice_pixie_${Math.floor(Math.random() * 3)}`);
      e._nextPixieVoiceMs = nowMs + 12000 + Math.floor(Math.random() * 10000);
    }
    this._takeChaseTurn(ctx);
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
  if (spec._stayInShop || STATIONARY_TYPES.has(spec.type)) behavior = NPC_BEHAVIOR.STATIONARY;
  else if (stats.wandering)         behavior = NPC_BEHAVIOR.WANDER;
  else if (spec.fleePlayer)         behavior = NPC_BEHAVIOR.FLEE;
  else if (stats.passive)           behavior = NPC_BEHAVIOR.VERMIN;
  else if (spec.patrolPath && spec.isSceneNPC) behavior = NPC_BEHAVIOR.PATROL;
  else if (spec._followTarget)      behavior = NPC_BEHAVIOR.FOLLOW;
  else if (stats.quest)             behavior = NPC_BEHAVIOR.STATIONARY;
  return new NPC({ ...spec, behavior });
};


if (typeof window !== 'undefined') {
  window.NPC           = NPC;
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
