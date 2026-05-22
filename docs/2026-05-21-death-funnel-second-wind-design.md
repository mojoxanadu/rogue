# Death Funnel + Second Wind — Design

Date: 2026-05-21
Status: Approved (design); implementation pending.

## Problem

Player HP loss and death are handled in scattered, inconsistent ways:

- **10 sites call `die()`** with no shared funnel and no record of *why*
  the player died (`engine.js:555,665,726,964,1868,2495,2504,2516`;
  `mechanics.js:257,266,568`).
- **6 sites reduce `player.hp` but never check death at all** —
  including two bugs: exhaustion drain (`engine.js:680`) and hunger
  damage at 100% (`engine.js:743`) tick HP down but never call `die()`,
  so hunger and exhaustion cannot actually kill the player.
- Only combat damage routes through `Player.takeDamage`, so talent
  mitigation (Toughness) is inconsistent.
- The **Second Wind** talent cannot be implemented cleanly: it must
  intercept death "at the end of a creature's turn," which requires the
  death path to know the *cause* of death. No cause is tracked today.

This refactor is a prerequisite for Second Wind, not optional polish.

## Goals

1. Funnel all player HP loss through one function.
2. Funnel all player death through `die(cause)`, with a cause tag.
3. Fix the missing-death-check bugs (exhaustion, hunger become lethal).
4. Implement the Second Wind talent.
5. Show contextual hints in the death modal, keyed off the cause.
6. Show a modal when Second Wind saves the player.
7. Add spacing between the death modal's restart buttons.

## Non-goals

- No change to monster/NPC damage handling — this is player-side only.
- No new damage *types* (Holy, etc.) — tracked separately in TODO.md.

## Design

### 1. Damage funnel — `damagePlayer(amount, cause, opts)`

One module-level function in `engine.js`, exposed on `window` so
`mechanics.js` and other files can call it.

```
damagePlayer(amount, cause, opts):
  actual = opts.mitigate ? player.takeDamage(amount) : raw subtract
  if actual <= 0: show "absorb"; return false
  damageTint, floating text, WebGL impact
  if player.hp <= 0: die(cause); return true
  return false
```

- `cause` — string tag (`'combat'`, `'hunger'`, `'bomb'`, ...).
- `opts.mitigate` — `true` only for combat (Toughness etc. apply);
  `false` for environmental damage (hunger, traps, bad food are not
  softened by armor talents).
- `opts` also carries presentation fields already used by the existing
  combat helper: `size`, `suffix`, `color`.
- The existing combat-helper `damagePlayer` method (`engine.js:545`)
  becomes a thin wrapper that calls this with `cause:'combat',
  mitigate:true`, preserving its current signature for combat callers.

Graduated-damage sites stop open-coding `player.hp -= x` and call
`damagePlayer(...)`:

| Site | cause | mitigate |
|---|---|---|
| `engine.js:680` exhaustion drain | `exhaustion` | false |
| `engine.js:743` hunger damage | `hunger` | false |
| `engine.js:868` blade tile | `trap` | false |
| `engine.js:958` bomb explosion | `bomb` | false |
| `mechanics.js:253/262/271` bad food | `poison` | false |
| `quests_kq5.js:290` temple collapse | `collapse` | false |
| `ui_logic.js:1163` kick-open recoil | `kickback` | true (corporal) |

### 2. Death funnel — `die(cause)`

`die()` gains a `cause` parameter, defaulting to `'unknown'` for
back-compat. New order of operations inside it:

1. **Resurrection crystal** — existing behaviour, unchanged.
2. **Second Wind** — new (see §3). Fires only for `cause === 'combat'`.
3. **Commit death** — `isDead = true`, normalize `player.hp = 0`,
   resolve the hint (see §5), show the death modal.

Instakill sites stop open-coding `isDead = true; die()` and simply call
`die(cause)` — `die()` sets `isDead` itself:

| Site | New call |
|---|---|
| `engine.js:665` Roc, eagle not fed | `die('roc')` |
| `engine.js:726` Grue | `die('grue')` |
| `engine.js:1868` IEHOVA bridge | `die('jehovah')` |
| `engine.js:2495/2504/2516` Bridge of Death | `die('bridgekeeper')` |
| `mechanics.js:568` Holy Hand Grenade | `die('grenade')` |

`die` is already callable from `mechanics.js`, so it remains
window/global-scoped.

### 3. Second Wind logic

Talent: `secondWind` in `talents_def.js` (currently `tbi: true` — remove
that flag once implemented).

Talent text: "If you have zero HP at the end of a creature's turn and
your hunger is below 50%, gain a percent of your max HP equal to 50% -
current hunger, instead of dying, and increase your hunger by 50%."

When `die('combat')` runs, and the player has the `secondWind` talent,
and `player.hunger < 50`:

- `healPct = 50 - player.hunger`
- `healHP  = max(1, round(player.maxHp * healPct / 100))`
- `player.hp = healHP` — HP was <= 0; set directly, never below 1.
- `player.hunger = min(100, player.hunger + 50)`
- Show the Second Wind modal (§4), then `return` — death never commits.

`hunger` is the existing 0–100 scale (higher = hungrier). No separate
cooldown: the +50 hunger naturally locks the talent out until the player
eats enough to drop back under 50%.

Second Wind fires only for `cause === 'combat'` — this honours "at the
end of a creature's turn." Grue, bridge keeper, hunger, etc. bypass it.

### 4. Modals

**Second Wind modal** — reuses the `overlay` + `modal-content` elements.
Titled `🌬️ SECOND WIND`. Body states HP regained and the hunger cost.
Single **Continue** button calling `hideOverlay()` to resume play.

**Death modal** — unchanged in content except:
- The three buttons (Load Game / Restart (keep assets) / Full Reload)
  get real spacing between them instead of being crammed together.
- A `cause`-driven hint line is shown (see §5).

### 5. Death-cause hint table

The hint is keyed off the `cause` tag, with one situational override:
if **>= 2 hostiles are adjacent** to the player at the moment of death,
that hint wins regardless of cause.

| Cause | Trigger | Hint |
|---|---|---|
| *(situational)* | >= 2 enemies adjacent at death | "Fight one monster at a time — don't let them surround you." |
| `combat` | monster damage, 0–1 adjacent | "Retreat and heal when your HP runs low." |
| `hunger` | starvation at 100% hunger | "Consider learning the Foraging talent — and eat before you starve." |
| `exhaustion` | running drain | "Running drains HP when you're exhausted. Walk it off." |
| `grue` | darkness instakill | "Never cross dark tiles without a light source." |
| `bomb` | explosion | "Get clear of explosions before they go off." |
| `poison` | bad food (oyster/peanuts/milk) | "Be wary of dubious food found in dungeons." |
| `trap` | blade tile | "Kneel to pass blade traps unharmed." |
| `collapse` | temple collapse, KQ5 quest | "Don't dawdle when the dungeon starts coming down." |
| `kickback` | self-damage kicking a locked container | "Kicking locked containers hurts — mind your HP first." |
| `roc` | Roc nest, eagle not fed | "Befriend the Eagle to escape the Roc's nest." |
| `jehovah` | IEHOVA letter bridge | "The name of God begins with an 'I' in the Latin alphabet." |
| `bridgekeeper` | Bridge of Death wrong answer | "Go watch Monty Python and the Holy Grail." |
| `grenade` | Holy Hand Grenade miscount | "Three shall be the number thou shalt count." |
| `unknown` | fallback | (no hint — current behaviour) |

The situational adjacency check runs inside `die()` against `zone.npcs`
filtered to hostiles within Chebyshev distance 1 of the player.

## Behaviour changes (intentional)

- Hunger at 100% and exhaustion drain can now kill the player. This is
  the point of the `hunger` hint and matches the "Hangry Adventurer"
  achievement's premise.
- Instakill sites no longer set `isDead` directly; `die()` owns it.

## Testing

Single-HTML-file game, no automated test harness. Verification is manual
in-browser after `python3 build_html.py`:

- Combat death with 0–1 vs >= 2 adjacent enemies → correct hint.
- Starve to 100% hunger with no other threat → `hunger` death + hint.
- Run until exhausted with low HP → `exhaustion` death + hint.
- Bridge of Death wrong answer → `bridgekeeper` hint.
- IEHOVA wrong letter → `jehovah` hint.
- Grue, bomb, bad food, blade tile → respective hints.
- Second Wind: take lethal combat hit with talent + hunger < 50 →
  survive, modal shown, HP/hunger correct; with hunger >= 50 → die
  normally.
- Resurrection crystal still pre-empts both death and Second Wind.
- Death modal: three buttons visibly spaced.

## Files touched

- `src/engine.js` — `damagePlayer`, `die`, instakill sites, modals.
- `src/mechanics.js` — bad-food + grenade sites route through funnel.
- `src/talents_def.js` — drop `tbi` from `secondWind`.
- `src/ui_layout.html` / modal CSS — button spacing, SW modal.
- `quests_kq5.js`, `ui_logic.js` — HP-loss sites routed through funnel.
- `TODO.md` — mark `second wind` row done; note light-levels / loot
  rows unaffected.
