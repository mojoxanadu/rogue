# Death Funnel + Second Wind Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize all player HP loss and death into `applyPlayerDamage(amount, cause)` + `die(cause)`, add cause-keyed death hints, and implement the Second Wind talent.

**Architecture:** A single module-level `applyPlayerDamage` in `engine.js` (exposed on `window`) handles every HP-loss site. `die(cause)` becomes the single death funnel — it resolves a contextual hint, and intercepts combat death for the Second Wind talent. Instakill sites call `die(cause)` directly.

**Tech Stack:** Vanilla JS, single-HTML-file game. Build: `python3 build_html.py` concatenates `src/*.js` + `src/ui_layout.html` into `dev_build.html`.

**Security note:** The death modal is built by assigning a template string to `modal-content`'s markup property. This follows the existing pattern in `die()`. The only interpolated values are: `currentLevel`/`player.*` numerics, `window._lastDeathMessage` (already plain text — captured via `textContent` in `die()`), and hint strings from the static `DEATH_HINTS` table. No untrusted input reaches the markup, so no new XSS surface is introduced.

**Testing note:** This game has **no automated test harness**. Every task's verification step is: (a) run `python3 build_html.py` and confirm it completes with no error, then (b) the manual in-browser checks listed. The build step alone catches syntax/concatenation errors.

**Spec:** `docs/2026-05-21-death-funnel-second-wind-design.md`

---

### Task 1: `die(cause)` parameter, hint resolver, death-modal hint + button spacing

**Files:**
- Modify: `src/engine.js` — `die()` function (~line 1148-1181); add two helpers just above it.

- [ ] **Step 1: Add the hint helpers above `die()`**

Insert this block immediately *before* the `function die(` line in `src/engine.js`:

```js
  // Death-cause hint table. die(cause) shows one of these in the
  // death modal. A situational override (>=2 adjacent hostiles)
  // takes precedence — see resolveDeathHint.
  const DEATH_HINTS = {
    combat:       "Retreat and heal when your HP runs low.",
    hunger:       "Consider learning the Foraging talent — and eat before you starve.",
    exhaustion:   "Running drains HP when you're exhausted. Walk it off.",
    grue:         "Never cross dark tiles without a light source.",
    bomb:         "Get clear of explosions before they go off.",
    poison:       "Be wary of dubious food found in dungeons.",
    trap:         "Kneel to pass blade traps unharmed.",
    collapse:     "Don't dawdle when the dungeon starts coming down.",
    kickback:     "Kicking locked containers hurts — mind your HP first.",
    roc:          "Befriend the Eagle to escape the Roc's nest.",
    jehovah:      "The name of God begins with an 'I' in the Latin alphabet.",
    bridgekeeper: "Go watch Monty Python and the Holy Grail.",
    grenade:      "Three shall be the number thou shalt count.",
  };

  function countAdjacentHostiles() {
    if (typeof zone === 'undefined' || !zone.npcs) return 0;
    return zone.npcs.filter(e => {
      if (!e || typeof e.x !== 'number') return false;
      const dx = Math.abs(e.x - player.x), dy = Math.abs(e.y - player.y);
      if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) return false;
      return (typeof e.isHostile === 'function')
        ? e.isHostile()
        : !(e.stats && (e.stats.passive || e.stats.quest)) && !e.friendly && !e.farmAnimal;
    }).length;
  }

  function resolveDeathHint(cause) {
    if (countAdjacentHostiles() >= 2)
      return "Fight one monster at a time — don't let them surround you.";
    return DEATH_HINTS[cause] || '';
  }
```

- [ ] **Step 2: Add the `cause` parameter to `die()`**

Change the function signature line in `src/engine.js`:

```js
  function die(cause = 'unknown') {
```

- [ ] **Step 3: Use the hint and space the buttons in the death modal**

In `die()`, replace the `setTimeout(() => { ... }, 600);` block (which builds the `modal-content` markup) with:

```js
    setTimeout(() => {
      const deathMsg = window._lastDeathMessage || '';
      const hint = resolveDeathHint(cause);
      showOverlay();
      document.getElementById('modal-content').innerHTML = `<h2>YOU DIED</h2>
        <p style="color:#888;">Floor ${currentLevel} | Level ${player.level} | ${player.gp}g</p>
        ${deathMsg ? `<p id="death-msg" style="color:#f88; font-style:italic; margin:8px 0; font-size:13px; max-width:300px;">${deathMsg}</p>` : ''}
        ${hint ? `<p id="death-hint" style="color:#9cf; margin:8px 0; font-size:13px; max-width:300px;">💡 ${hint}</p>` : ''}
        <button onclick="loadGame()" style="display:block; margin:12px auto;">Load Game</button>
        <button onclick="restartGame()" style="display:block; margin:12px auto;">Restart (keep assets)</button>
        <button onclick="location.reload()" style="display:block; margin:12px auto; opacity:0.6;">Full Reload</button>`;
    }, 600);
```

- [ ] **Step 4: Build**

Run: `python3 build_html.py`
Expected: completes, no error; `dev_build.html` regenerated.

- [ ] **Step 5: Verify in browser**

Open `dev_build.html`. Die to any monster. Expected: death modal shows three buttons with clear vertical spacing between them; no hint yet for most deaths (cause still defaults to `'unknown'` everywhere). If you die surrounded by 2+ adjacent monsters, the "Fight one monster at a time" hint appears.

- [ ] **Step 6: Commit**

```bash
git add src/engine.js
git commit -m "$(printf 'rogue: die(cause) param + death-cause hint resolver + modal button spacing\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')"
```

---

### Task 2: Tag the instakill death sites with causes

**Files:**
- Modify: `src/engine.js` lines ~665, ~726, ~1868, ~2495, ~2504, ~2516
- Modify: `src/mechanics.js` line ~568

- [ ] **Step 1: Roc nest (engine.js ~665)**

Replace `isDead = true; die();` with:

```js
            die('roc');
```

- [ ] **Step 2: Grue (engine.js ~726)**

Replace `die();` (the line after `player.hp = 0;`) with:

```js
            die('grue');
```

- [ ] **Step 3: IEHOVA bridge (engine.js ~1868)**

Replace the whole line `if ("IEHOVA".indexOf(letter) === -1) { logMsg("Wrong letter!"); isDead = true; die(); return; }` with:

```js
       if ("IEHOVA".indexOf(letter) === -1) { logMsg("Wrong letter!"); die('jehovah'); return; }
```

- [ ] **Step 4: Bridge of Death — three sites (engine.js ~2495, ~2504, ~2516)**

At ~2495: replace `if(!correct) { logMsg("AHHHHHHH!"); isDead = true; die(); return; }` with:

```js
    if(!correct) { logMsg("AHHHHHHH!"); die('bridgekeeper'); return; }
```

At ~2504: replace `if(!correct) { logMsg("AHHHHHHH!"); isDead = true; die(); return; }` with:

```js
    if(!correct) { logMsg("AHHHHHHH!"); die('bridgekeeper'); return; }
```

At ~2516: replace `else { logMsg("AHHHHHHH!"); isDead = true; die(); }` with:

```js
    else { logMsg("AHHHHHHH!"); die('bridgekeeper'); }
```

- [ ] **Step 5: Holy Hand Grenade (mechanics.js ~568)**

Replace `player.hp = 0; die(); clearInterval(ticker);` with:

```js
        die('grenade'); clearInterval(ticker);
```

- [ ] **Step 6: Build**

Run: `python3 build_html.py`
Expected: completes, no error.

- [ ] **Step 7: Verify in browser**

Open `dev_build.html`. Trigger the Bridge of Death and answer wrong → death modal shows "Go watch Monty Python and the Holy Grail." Trigger the IEHOVA bridge wrong → shows the Jehovah hint.

- [ ] **Step 8: Commit**

```bash
git add src/engine.js src/mechanics.js
git commit -m "$(printf 'rogue: route instakill death sites through die(cause)\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')"
```

---

### Task 3: Central `applyPlayerDamage` function

**Files:**
- Modify: `src/engine.js` — add `applyPlayerDamage` above `die()`; rewrite the combat-helper `damagePlayer` method (~line 545) to delegate.

- [ ] **Step 1: Add `applyPlayerDamage` above `die()`**

Insert this immediately *before* the `DEATH_HINTS` block added in Task 1 (module scope in `src/engine.js`):

```js
  // Single funnel for ALL player HP loss. `cause` is a death-cause
  // tag (see DEATH_HINTS). opts.mitigate=true routes through
  // player.takeDamage so talents (Toughness) apply — use only for
  // combat. Returns true if the hit was lethal (die() fired).
  function applyPlayerDamage(amount, cause = 'unknown', opts = {}) {
    let actual;
    if (opts.mitigate && typeof player.takeDamage === 'function') {
      actual = player.takeDamage(amount, opts.kind || 'corporal');
    } else {
      actual = Math.max(0, amount);
      player.hp -= actual;
    }
    if (actual <= 0) {
      addFloatingText(player.x, player.y, 'absorb', '#9c9', 14);
      return false;
    }
    damageTint = 30;
    const shown = Number.isInteger(actual) ? actual : Number(actual.toFixed(1));
    const label = opts.suffix ? `-${shown}${opts.suffix}` : `-${shown}`;
    addFloatingText(player.x, player.y, label, opts.color || '#f00', opts.size ?? 22);
    if (window.WebGLFX && WebGLFX.onPlayerDamage) WebGLFX.onPlayerDamage(actual, opts.kind);
    if (player.hp <= 0) { die(cause); return true; }
    return false;
  }
  window.applyPlayerDamage = applyPlayerDamage;
```

- [ ] **Step 2: Rewrite the combat-helper `damagePlayer` method to delegate**

In `src/engine.js`, replace the entire `damagePlayer(dmg, kind, size, suffix, color) { ... }` method (~lines 540-557, inside the combat-helper object literal — including its leading comment lines) with:

```js
      // Combat/effect damage — delegates to the central funnel with
      // cause 'combat' so the Second Wind talent can intercept.
      damagePlayer(dmg, kind, size, suffix, color) {
        return applyPlayerDamage(dmg, 'combat', { mitigate: true, kind, size, suffix, color });
      },
```

- [ ] **Step 3: Build**

Run: `python3 build_html.py`
Expected: completes, no error.

- [ ] **Step 4: Verify in browser**

Open `dev_build.html`. Take monster hits — damage numbers, red tint, and "absorb" on fully-mitigated hits all behave as before. Die to a single monster — death modal shows the `combat` hint "Retreat and heal when your HP runs low."

- [ ] **Step 5: Commit**

```bash
git add src/engine.js
git commit -m "$(printf 'rogue: add central applyPlayerDamage funnel; combat damage delegates to it\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')"
```

---

### Task 4: Route graduated-damage sites through the funnel

**Files:**
- Modify: `src/engine.js` lines ~680 (exhaustion), ~743 (hunger), ~868 (blade), ~958 (bomb)
- Modify: `src/mechanics.js` lines ~253 (oyster), ~262 (peanuts), ~271 (milk)
- Modify: `src/quests_kq5.js` line ~290 (temple collapse)
- Modify: `src/ui_logic.js` line ~1163 (kick recoil)

- [ ] **Step 1: Exhaustion drain (engine.js ~680)**

Replace `player.hp -= (drainRate * steps);` with:

```js
        applyPlayerDamage(drainRate * steps, 'exhaustion', { mitigate: false });
```

- [ ] **Step 2: Hunger damage (engine.js ~742-744)**

Replace the two lines inside `if (player.hunger >= 100) { ... }` (`player.hp -= CONSTANTS.HUNGER_DAMAGE * steps;` and the `addFloatingText(... "🍖 -" ...)` line) with the single line:

```js
      applyPlayerDamage(CONSTANTS.HUNGER_DAMAGE * steps, 'hunger', { mitigate: false, suffix: '🍖' });
```

- [ ] **Step 3: Blade tile (engine.js ~868)**

Replace `if (curTile === TILES.BLADE && !player.isKneeling) { player.hp -= 10; damageTint = 30; }` with:

```js
    if (curTile === TILES.BLADE && !player.isKneeling) { applyPlayerDamage(10, 'trap', { mitigate: false }); }
```

- [ ] **Step 4: Bomb explosion (engine.js ~957-964)**

Replace the `if(dmg > 0) { ... }` block body — currently a `player.hp = Math.max(0, player.hp - dmg);` assignment, the `logMsg`, `addFloatingText`, `damageTint = 30;`, the `WebGLFX` line, `updateUI();`, and `if(player.hp <= 0) { die(); return; }` — with:

```js
      if(dmg > 0) {
        logMsg(`<span style='color:#f44'>💥 The explosion catches you for ${dmg} damage!</span>`);
        applyPlayerDamage(dmg, 'bomb', { mitigate: false, size: 20 });
        updateUI();
      }
```

- [ ] **Step 5: Bad food (mechanics.js ~251-271)**

For the oyster block, remove the inline `player.hp -= 10; addFloatingText(...)` and the later `if(player.hp <= 0) { die(); return; }` so the block reads exactly:

```js
    if(itemObj.itemName === 'oyster') {
      logMsg("<span style='color:#f44'>Maybe I shouldn't have eaten an oyster from a convenience store in a dungeon...</span>");
      if(typeof Sound !== 'undefined') Sound.playTone(80, 'sawtooth', 0.3, 0.1, 40);
      logMsg("<span style='color:#f44'>You feel nauseous! (-10 HP)</span>");
      decrementItem(idx);
      if(applyPlayerDamage(10, 'poison', { mitigate: false, size: 18 })) return;
      updateUI(); return;
    }
```

For the peanuts block, the same shape:

```js
    if(itemObj.itemName === 'peanuts') {
      logMsg("<span style='color:#f44'>I'm allergic to peanuts!</span>");
      if(typeof Sound !== 'undefined') Sound.playTone(100, 'sawtooth', 0.4, 0.1, 30);
      logMsg("<span style='color:#f44'>Your throat swells! (-15 HP)</span>");
      decrementItem(idx);
      if(applyPlayerDamage(15, 'poison', { mitigate: false, size: 18 })) return;
      updateUI(); return;
    }
```

For the milk block, replace only `player.hp -= 5; addFloatingText(player.x, player.y, '-5', '#f00', 16);` with:

```js
      applyPlayerDamage(5, 'poison', { mitigate: false, size: 16 });
```

(The milk block has no existing `die()` check; the funnel adds one for free.)

- [ ] **Step 6: Temple collapse (quests_kq5.js ~290)**

Replace `player.hp -= 20;` with:

```js
            applyPlayerDamage(20, 'collapse', { mitigate: false });
```

(Leave the following `updateUI();` and `if(player.hp > 0) { ... }` lines unchanged — they remain correct.)

- [ ] **Step 7: Kick recoil (ui_logic.js ~1162-1163)**

Replace the two lines `if (typeof player.takeDamage === 'function') player.takeDamage(dmg, 'corporal');` and `else player.hp = Math.max(0, player.hp - dmg);` with:

```js
      applyPlayerDamage(dmg, 'kickback', { mitigate: true, kind: 'corporal' });
```

- [ ] **Step 8: Build**

Run: `python3 build_html.py`
Expected: completes, no error.

- [ ] **Step 9: Verify in browser**

Open `dev_build.html`:
- Starve to 100% hunger with no monster nearby → you now actually die; modal shows the Foraging hint.
- Run with low HP until exhausted → you can die from exhaustion; modal shows the exhaustion hint.
- Eat a bad oyster/peanuts at low HP → death routes through, shows the poison hint.
- Step on a blade tile without kneeling → 10 damage as before.

- [ ] **Step 10: Commit**

```bash
git add src/engine.js src/mechanics.js src/quests_kq5.js src/ui_logic.js
git commit -m "$(printf 'rogue: route hunger/exhaustion/trap/bomb/food/kick damage through funnel\n\nFixes bugs where exhaustion and hunger damage never checked death.\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')"
```

---

### Task 5: Implement the Second Wind talent

**Files:**
- Modify: `src/engine.js` — `die()`, insert Second Wind block after the crystal check.
- Modify: `src/talents_def.js` — remove `tbi: true` from `secondWind` (~line 524).

- [ ] **Step 1: Insert the Second Wind interception in `die()`**

In `src/engine.js`, immediately *after* the resurrection-crystal `if` block (the one ending `player.hp = player.maxHp; updateUI(); return;`) and *before* the `// B41:` comment, insert:

```js
    // Second Wind talent — intercepts death "at the end of a
    // creature's turn" (cause 'combat') if hunger leaves room.
    const swLevel = (player.talents?.secondWind?.level) || 0;
    if (cause === 'combat' && swLevel > 0 && player.hunger < 50) {
      const healPct = 50 - player.hunger;
      const healHP = Math.max(1, Math.round(player.maxHp * healPct / 100));
      player.hp = healHP;
      player.hunger = Math.min(100, player.hunger + 50);
      logMsg("<span style='color:#9f9; font-weight:bold;'>🌬️ You draw a Second Wind!</span>");
      updateUI(); drawMap();
      showWorldModal('🌬️ SECOND WIND', `<p>You should be dead — but you draw a second wind.</p>
        <p style="color:#9f9;">Recovered <strong>${healHP} HP</strong>.</p>
        <p style="color:#fc8;">Hunger surges +50% — now ${Math.floor(player.hunger)}%.</p>`);
      return;
    }
```

- [ ] **Step 2: Remove the `tbi` flag from the talent definition**

In `src/talents_def.js`, in the `secondWind:` object, delete the line:

```js
    tbi:   true,
```

- [ ] **Step 3: Build**

Run: `python3 build_html.py`
Expected: completes, no error.

- [ ] **Step 4: Verify in browser**

Open `dev_build.html`. Use the dev/debug talent grant to obtain `secondWind` (it normally requires `endurance: 1`). Then:
- With hunger < 50%, take a lethal monster hit → you do NOT die; the "🌬️ SECOND WIND" modal appears with the correct HP recovered and hunger now +50%. Click Continue → play resumes.
- With hunger >= 50%, take a lethal monster hit → you die normally.
- Take a lethal Grue / bridge-keeper death → Second Wind does NOT trigger (cause is not `combat`).
- Resurrection crystal still pre-empts Second Wind when carried.

- [ ] **Step 5: Commit**

```bash
git add src/engine.js src/talents_def.js
git commit -m "$(printf 'rogue: implement Second Wind talent — combat death intercept\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')"
```

---

### Task 6: Update TODO.md

**Files:**
- Modify: `TODO.md` — remove the completed `second wind` row.

- [ ] **Step 1: Delete the `second wind` row**

In `TODO.md`, delete this table row entirely:

```
| new    | 2   | enh  | second wind         | Implement Second Wind talent — hp=0 can persist briefly without death, then heal back above 0.                |
```

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "$(printf 'rogue: TODO.md — drop completed Second Wind row\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')"
```

---

## Self-Review

**Spec coverage:**
- §1 damage funnel → Task 3 (`applyPlayerDamage`) + Task 4 (routes every graduated site).
- §2 death funnel → Task 1 (`die(cause)`) + Task 2 (instakill sites).
- §3 Second Wind → Task 5.
- §4 modals → Task 1 (death-modal button spacing), Task 5 (Second Wind modal via `showWorldModal`).
- §5 hint table → Task 1 (`DEATH_HINTS` + `resolveDeathHint` + adjacency override).
- Behaviour change "hunger/exhaustion now lethal" → Task 4, covered.
- TODO.md update → Task 6.
All spec sections map to a task. No gaps.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/vague steps — every code step shows complete code. Clear.

**Type consistency:** `applyPlayerDamage(amount, cause, opts)` — same signature in Task 3 definition and all Task 4 call sites. `die(cause)` — defined in Task 1, called with literal causes in Tasks 2/4 and intercepted in Task 5. `opts` fields used (`mitigate`, `kind`, `suffix`, `size`, `color`) all match the Task 3 definition. `resolveDeathHint`/`countAdjacentHostiles`/`DEATH_HINTS` defined in Task 1, used in Task 1. `showWorldModal` is an existing `engine.js` function (~line 396). Consistent.
