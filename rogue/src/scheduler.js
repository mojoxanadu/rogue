// ============================================================
//  SCHEDULER  –  src/scheduler.js
//
//  Cooldown-based turn loop driver. UX-agnostic — operates on any
//  object with the Sentient interface (actionCooldown, conditions,
//  canAct, actionCost, tick, fireDueConditions).
//
//  Called by the game loop after a player command runs (which has
//  set localPlayer.actionCooldown > 0). Scheduler advances time
//  until the player can act again, firing due conditions and
//  letting NPCs take their turns in the meantime.
//
//  Per-iteration phases:
//    1. Fire any due conditions on every entity (poison ticks, etc).
//    2. Find the first NPC ready to act and call takeAITurn.
//       NPCs go BEFORE the player on ties — otherwise an adjacent
//       monster that became due in the same moment as the player
//       would lose its turn until the round after.
//    3. Else: if the localPlayer can act → return control to game.
//    4. Else: nobody ready — advance the global clock by the
//       smallest positive cooldown (entity action OR condition).
// ============================================================

/**
 * Drive the scheduler until the localPlayer needs input or no
 * progress can be made. Mutates entities' actionCooldown / condition
 * state. Does NOT add/remove entities — caller manages the list
 * (e.g., remove dead NPCs before re-invoking, or filter inside
 * takeAITurn).
 *
 * @param {Sentient[]} entities    All schedulable entities (e.g.,
 *                                  world.visibleEntities()). Must
 *                                  include localPlayer.
 * @param {Sentient}  localPlayer  The player; when canAct() the
 *                                  function returns.
 * @param {function}  takeAITurn   (entity) => actionName. AI decides
 *                                  what the entity does AND mutates
 *                                  world state. Returns the action
 *                                  name so the scheduler can charge
 *                                  the correct cooldown via
 *                                  entity.actionCost(name). Falsy
 *                                  return → 'move'.
 * @param {object}    [opts]
 * @param {number}    [opts.brakeInterval=0]  Engine brake: max game-
 *           time (sum of phase-4 ticks) this invocation runs before
 *           returning 'brake'. 0 disables (default, for tests). The
 *           caller is expected to set this to 1.0 in production and
 *           wall-clock-sleep ~250ms on a 'brake' return so the
 *           renderer can paint and long player actions stay watchable
 *           (sleep, paralysis, multi-turn rest). The brake is reset
 *           to 1.0 implicitly each invocation: caller resets to 1.0
 *           after player input or after the sleep, then re-enters.
 * @param {number}    [opts.jitter=0]  Maximum random fraction (0..1)
 *           added to every NPC action cooldown set. Used in production
 *           (0.01) to break ties between same-speed entities so order
 *           shifts unpredictably round-to-round. 0 disables (default,
 *           for deterministic tests).
 *
 * @returns {{reason: string, iters: number}}
 *   reason: 'player-turn' — localPlayer ready, hand control back.
 *           'brake'       — engine brake elapsed; caller should
 *                            sleep ~250ms then re-invoke with the
 *                            brake interval reset.
 *           'idle'        — no positive cooldown anywhere (caller's
 *                            invariant violation; shouldn't happen).
 *           'timeout'     — safety cap tripped (likely zero-cost
 *                            AI action; bug in AI).
 */
function runScheduler(entities, localPlayer, takeAITurn, opts = {}) {
  const MAX_ITERATIONS = 1024;
  const brakeInterval  = opts.brakeInterval ?? 0;
  const jitterMax      = opts.jitter        ?? 0;
  let elapsed = 0;
  let iters = 0;
  while (iters++ < MAX_ITERATIONS) {
    // Phase 1: fire any due conditions on every entity. Poison
    // damage, regen ticks, burning, etc. Exhausted conditions are
    // auto-removed by Sentient.fireDueConditions().
    for (const e of entities) e.fireDueConditions();

    // Phase 2: first NPC ready to act takes its turn. NPCs are
    // checked BEFORE the player so a monster that became due in
    // the same tick as the player still gets its turn (otherwise
    // it would lose to the player-priority check).
    let acted = false;
    for (const e of entities) {
      if (e === localPlayer) continue;
      if (!e.canAct()) continue;
      const action = takeAITurn(e);
      const name   = action == null ? 'move' : action;
      let cost     = e.actionCost(name);
      // Tiny jitter (≤ jitterMax) on every cooldown set so same-speed
      // entities don't permanently lock into the same firing order.
      if (jitterMax > 0 && cost > 0) cost += Math.random() * jitterMax;
      // Snap any negative residue to 0 before adding the new cost so
      // overshoots don't pile up across turns.
      e.actionCooldown = Math.max(0, e.actionCooldown) + cost;
      acted = true;
      break;
    }
    if (acted) continue;

    // Phase 3: player ready? Return control.
    if (localPlayer.canAct()) {
      return { reason: 'player-turn', iters };
    }

    // Phase 4: nobody ready. Tick by the smallest POSITIVE cooldown
    // — either an entity action cooldown or a condition cooldown.
    let min = Infinity;
    for (const e of entities) {
      if (e.actionCooldown > 0 && e.actionCooldown < min) min = e.actionCooldown;
      for (const c of e.conditions) {
        if (c.cooldown > 0 && c.cooldown < min) min = c.cooldown;
      }
    }
    if (!Number.isFinite(min)) {
      // Nothing has a positive cooldown — caller's invariant was
      // that localPlayer.actionCooldown > 0 on entry. Bail.
      return { reason: 'idle', iters };
    }

    // Engine brake: if a previous tick already consumed the brake
    // interval, yield to the caller now. Checked AT THE TOP of phase
    // 4 — so if the player happens to be ready on the same iteration
    // we already returned 'player-turn' above (phase 3), and brake
    // doesn't pre-empt them.
    if (brakeInterval > 0 && elapsed >= brakeInterval) {
      return { reason: 'brake', iters };
    }

    // Cap this tick so we yield precisely on the brake boundary.
    if (brakeInterval > 0) {
      const brakeRemaining = brakeInterval - elapsed;
      if (brakeRemaining > 0 && brakeRemaining < min) min = brakeRemaining;
    }

    for (const e of entities) e.tick(min);
    elapsed += min;
  }
  return { reason: 'timeout', iters };
}

window.runScheduler = runScheduler;
