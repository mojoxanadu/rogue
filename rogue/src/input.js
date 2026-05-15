  /*
  INPUT MODULE – KEYBOARD, MOUSE, AND GAME LOOP MANAGEMENT
  =========================================================
  This module handles all user input (keyboard, mouse clicks) and real‑time game loops.
  It binds event listeners for movement, UI toggles, special actions, and manages the
  start‑screen animation, quest timer ticker, and status‑based movement modifications.

  Key responsibilities:
  1. Keyboard input routing – WASD/arrow movement, inventory ('i'), equipment ('e'),
     spells ('f'), rest ('z'), attack (space), modal toggles, number‑key item clicks
  2. Mouse event handling – hamburger menu toggle, start button click
  3. Game loop timers – quest timer countdown, damage tint fade, level‑up flash decay
  4. Start‑screen animation – floating dots background with requestAnimationFrame
  5. Movement rate limiting – normal vs. sugar‑rush vs. running speeds, freeze/dizzy statuses
  6. Shift‑key running – temporary speed boost with exhaustion consequences (handled in engine)

  The functions here are called directly by browser events (keydown, keyup, click) and
  by the setInterval game loop. They invoke engine.js (movePlayer, restPlayer),
  mechanics.js (handleItemClick), and ui_logic.js (toggleModal) to drive game state.
*/
const hBtn = document.getElementById('hamburgerBtn');
  if(hBtn) {
    hBtn.addEventListener('click', () => {
      let menu = document.getElementById('hamburger-menu');
      if(menu) menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    });
  }

  // Console overlay (` key) — distinct from the game log
  // Pull tab: sibling element above the console
  const consolePullTab = document.createElement('div');
  consolePullTab.id = 'console-pull-tab';
  consolePullTab.style.cssText = 'position:fixed;bottom:0;left:50%;transform:translateX(-50%) translateY(0);width:120px;height:16px;background:rgba(0,0,0,0.8);color:#0f0;font-family:monospace;font-size:9px;z-index:10002;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid #0a0;border-bottom:none;border-radius:4px 4px 0 0;user-select:none;';
  consolePullTab.textContent = '▲ console';
  document.body.appendChild(consolePullTab);

  const debugOverlay = document.createElement('div');
  debugOverlay.id = 'console-overlay';
  debugOverlay.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:#0f0;font-family:monospace;font-size:11px;padding:0;z-index:10001;border-top:2px solid #0a0;box-shadow:0 -4px 12px rgba(0,0,0,0.5);transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);transform:translateY(100%);display:flex;flex-direction:column;';
  debugOverlay.innerHTML = `<div id="debug-stats-chips" style="display:flex; gap:6px; padding:4px 8px; flex-wrap:wrap; justify-content:flex-end; border-bottom:1px solid #0a3; font-size:10px;"></div>
    <div id="console-log" style="flex:1; padding:8px 12px; overflow-y:auto; max-height:120px; padding-right:80px;"></div>
    <div style="position:relative; display:flex; align-items:center; border-top:1px solid #0a0;">
      <input id="console-input" type="text" placeholder="> Type /help for commands" 
        style="flex:1; padding:6px 12px; background:rgba(0,0,0,0.5); color:#0f0; font-family:monospace; font-size:11px; border:none; outline:none;">
      <button id="console-copy-btn" style="background:#1a2a3a;border:1px solid #3a4a6a;color:#4af;border-radius:3px;padding:2px 8px;font-family:monospace;cursor:pointer;margin:0 2px;font-size:11px;" title="Copy Log to Clipboard">📋</button>
      <button id="console-clear-btn" style="background:#2a1a1a;border:1px solid #5a3a3a;color:#f44;border-radius:3px;padding:2px 8px;font-family:monospace;cursor:pointer;margin:0 2px;font-size:11px;" title="Clear Log">🗑</button>
      <button onclick="showMacroHelp()" style="background:#1a2a1a;border:1px solid #3a5a3a;color:#4f4;border-radius:3px;padding:2px 8px;font-family:monospace;cursor:pointer;margin:0 2px;font-size:11px;" title="Macro Help">?</button>
      <button onclick="toggleMacroBuilder()" style="background:#1a2a3a;border:1px solid #3a4a6a;color:#4af;border-radius:3px;padding:2px 8px;font-family:monospace;cursor:pointer;margin:0 4px 0 2px;font-size:11px;" title="Macro Builder">&#9881; Builder</button>
    </div>`;
  document.body.appendChild(debugOverlay);

  // Mobile: hide the dev console entirely. The pull-tab + console
  // overlay push the canvas around and aren't useful via touch input.
  // Elements stay in the DOM because macros, the debug log helper
  // (_debugLog), and a couple of view-side features reference them
  // directly — they just stay invisible and non-interactive. Re-
  // enable by removing the display:none assignment (or by editing
  // the URL to ?mobile=0 in a desktop browser session).
  if (window.IS_TOUCH) {
    consolePullTab.style.display = 'none';
    debugOverlay.style.display = 'none';
  }

  const consoleInput = document.getElementById('console-input');

  // Copy log button — copies all debug log entries to clipboard
  const copyBtn = document.getElementById('console-copy-btn');
  if(copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const text = (window._debugLog || []).join('\n');
      let copied = false;
      try {
        if(navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          copied = true;
        }
      } catch(e) {}
      if(!copied) {
        // Fallback: textarea + execCommand
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          copied = true;
        } catch(e) {}
      }
      const origBg = copyBtn.style.background;
      copyBtn.style.background = copied ? '#0a4a0a' : '#4a0a0a';
      copyBtn.textContent = copied ? '✓' : '✗';
      setTimeout(() => { copyBtn.style.background = origBg; copyBtn.textContent = '📋'; }, 1200);
    });
  }

  // Clear log button
  const clearBtn = document.getElementById('console-clear-btn');
  if(clearBtn) {
    clearBtn.addEventListener('click', () => {
      window._debugLog = [];
      const logArea = document.getElementById('console-log');
      if(logArea) logArea.innerHTML = '';
    });
  }
  
  window._debugLog = [];
  window._consoleActive = false; // Bug 2: Track console state
  window._consoleVisible = false;

  function debugLog(msg) {
    const time = new Date().toLocaleTimeString();
    const entry = `[${time}] ${msg}`;
    window._debugLog.push(entry);
    if(window._debugRecorder && window._debugRecorder.active) {
      window._debugRecorder.lines.push(entry);
    }
    // Bug 3: Add to log area above input, auto-scroll
    let logArea = document.getElementById('console-log');
    if(logArea) { logArea.innerHTML += entry + '<br>'; logArea.scrollTop = logArea.scrollHeight; }
    console.log(entry);
  }
  // Expose to window so other modules (webgl_fx, etc.) can log to in-game console
  window.debugLog = debugLog;

  window.updateDebugChips = function() {
    const el = document.getElementById('debug-stats-chips');
    if(!el) return;
    const chips = [];
    const p = typeof player !== 'undefined' ? player : null;
    const C = typeof CONSTANTS !== 'undefined' ? CONSTANTS : {};
    const scene = typeof currentScene !== 'undefined' ? currentScene : '?';
    const lvl = typeof currentLevel !== 'undefined' ? currentLevel : '?';

    function chip(bg, text) { return `<span style="background:${bg};padding:1px 5px;border-radius:3px;font-size:10px;">${text}</span>`; }

    // Alive/Dead
    chips.push(chip((typeof isDead !== 'undefined' && isDead) ? '#600' : '#060',
      (typeof isDead !== 'undefined' && isDead) ? '💀 Dead' : '❤️ Alive'));

    // Sleeping/Awake
    chips.push(chip('#224', p && p.isSleeping ? '😴 Sleep' : '👁 Awake'));

    // Coordinates + scene
    if(p) chips.push(chip('#220', `📍 ${p.x},${p.y} ${scene}:${lvl}`));

    // HP / MP
    if(p) {
      const hpPct = Math.round((p.hp / p.maxHp) * 100);
      const hpCol = hpPct > 50 ? '#060' : hpPct > 25 ? '#660' : '#600';
      chips.push(chip(hpCol, `❤️ ${Math.floor(p.hp)}/${p.maxHp}`));
      if(p.maxMp > 0) chips.push(chip('#026', `✨ ${Math.floor(p.mp)}/${p.maxMp}`));
    }

    // Gold
    if(p) chips.push(chip('#440', `💰 ${p.gp}g`));

    // Light level
    if(p && typeof theMap !== 'undefined' && theMap.length > 0) {
      const lightVal = typeof lightTurns !== 'undefined' ? lightTurns : 0;
      chips.push(chip('#330', `💡 ${lightVal}t`));
    }

    // Sight distance
    chips.push(chip('#033', `👁 ${C.SIGHT_RADIUS ?? 6}`));

    // FoW toggle
    const fowOn = typeof debugFlags !== 'undefined' && !debugFlags.revealMap;
    chips.push(chip(fowOn ? '#202' : '#420', `🗺 FoW ${fowOn ? 'ON' : 'OFF'}`));

    // Active status effects (legacy statusEffects hash + new Condition list)
    const fxNames = [];
    if(p && p.statusEffects) fxNames.push(...Object.keys(p.statusEffects));
    if(p && Array.isArray(p.conditions)) {
      for(const c of p.conditions) fxNames.push(c.name);
    }
    if(fxNames.length > 0) chips.push(chip('#303', `⚗️ ${fxNames.join(' ')}`));

    // Speed modifier
    if(p && p.speedMod && p.speedMod !== 1) {
      chips.push(chip('#234', `🏃 ×${p.speedMod.toFixed(1)}`));
    }

    // Nearest enemy type + HP%
    if(p && typeof enemies !== 'undefined' && enemies.length > 0) {
      const hostile = enemies.filter(e => e && !e.friendly && !e.farmAnimal && e.stats && e.stats.hp > 0);
      if(hostile.length > 0) {
        const nearest = hostile.reduce((best, e) => {
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          return (!best || d < best.d) ? {e, d} : best;
        }, null);
        if(nearest && nearest.d < 8) {
          const e = nearest.e;
          const pct = Math.round((e.stats.hp / (e.stats.maxHp || e.stats.hp)) * 100);
          const col = pct > 50 ? '#040' : pct > 25 ? '#440' : '#400';
          chips.push(chip(col, `🎯 ${e.type} ${pct}%`));
        }
      }
    }

    // Active quest timer
    if(typeof questTimer !== 'undefined' && questTimer.active && questTimer.time > 0) {
      chips.push(chip('#443', `⏱ ${questTimer.time.toFixed(0)}s`));
    }

    // God mode / debug flags
    if(typeof debugFlags !== 'undefined') {
      if(debugFlags.godMode) chips.push(chip('#640', '🌩️😶‍🌫️ GOD'));
      if(debugFlags.fullLight) chips.push(chip('#440', '☀️ FULL LIGHT'));
    }

    el.innerHTML = chips.join(' ');
  };

  const _debugDeepClone = (obj) => JSON.parse(JSON.stringify(obj));
  const _runWithSeededRandom = (seed, fn) => {
    let s = (seed >>> 0);
    const prevRandom = Math.random;
    Math.random = () => {
      s = (1664525 * s + 1013904223) >>> 0;
      return s / 4294967296;
    };
    try {
      fn();
    } finally {
      Math.random = prevRandom;
    }
    return s;
  };

  const _saveDebugSnapshot = (name) => {
    if(!name) return { ok: false, msg: 'Usage: /snapshot save <name>' };
    window._debugSnapshots = window._debugSnapshots || {};
    window._debugSnapshots[name] = {
      currentLevel,
      currentScene,
      player: _debugDeepClone(player),
      inventory: _debugDeepClone(inventory),
      theMap: _debugDeepClone(theMap),
      darkMap: _debugDeepClone(darkMap),
      explored: _debugDeepClone(explored),
      visible: _debugDeepClone(visible),
      enemies: _debugDeepClone(enemies),
      itemsOnGround: _debugDeepClone(itemsOnGround),
      corpses: (typeof corpses !== 'undefined') ? _debugDeepClone(corpses) : [],
      mapW,
      mapH
    };
    return { ok: true, msg: `Snapshot '${name}' saved.` };
  };

  const _loadDebugSnapshot = (name) => {
    const snaps = window._debugSnapshots || {};
    const snap = snaps[name];
    if(!snap) return { ok: false, msg: `Snapshot '${name}' not found.` };

    currentLevel = snap.currentLevel;
    currentScene = snap.currentScene;
    mapW = snap.mapW;
    mapH = snap.mapH;

    Object.assign(player, snap.player || {});
    inventory.length = 0;
    (snap.inventory || []).forEach(v => inventory.push(v));

    theMap = _debugDeepClone(snap.theMap || []);
    darkMap = _debugDeepClone(snap.darkMap || []);
    explored = _debugDeepClone(snap.explored || []);
    visible = _debugDeepClone(snap.visible || []);
    enemies = _debugDeepClone(snap.enemies || []);
    itemsOnGround = _debugDeepClone(snap.itemsOnGround || []);
    syncActiveZone();
    if(typeof corpses !== 'undefined') {
      corpses.length = 0;
      (snap.corpses || []).forEach(c => corpses.push(c));
    }

    if(typeof calculateFOV === 'function') calculateFOV();
    if(typeof drawMap === 'function') drawMap();
    if(typeof renderQuickslots === 'function') renderQuickslots();
    if(typeof renderInventory === 'function') renderInventory();
    if(typeof updateUI === 'function') updateUI();
    return { ok: true, msg: `Snapshot '${name}' loaded.` };
  };

  const _profEnsurePatched = () => {
    if(window._profPatched) return;
    window._profPatched = true;
    window._profData = window._profData || { drawMs: 0, drawCalls: 0, aiMs: 0, aiCalls: 0, audioCalls: 0, audioMs: 0, startedAt: Date.now() };

    if(typeof drawMap === 'function' && !window._profOrigDrawMap) {
      window._profOrigDrawMap = drawMap;
      drawMap = function(...args) {
        const t0 = performance.now();
        const out = window._profOrigDrawMap.apply(this, args);
        const dt = performance.now() - t0;
        window._profData.drawMs += dt;
        window._profData.drawCalls += 1;
        return out;
      };
    }
    if(typeof advanceTurn === 'function' && !window._profOrigAdvanceTurn) {
      window._profOrigAdvanceTurn = advanceTurn;
      advanceTurn = function(...args) {
        const t0 = performance.now();
        const out = window._profOrigAdvanceTurn.apply(this, args);
        const dt = performance.now() - t0;
        window._profData.aiMs += dt;
        window._profData.aiCalls += 1;
        return out;
      };
    }
    if(typeof Sound !== 'undefined' && Sound && !window._profOrigPlaySample) {
      const wrapAudioFn = (name) => {
        const orig = Sound[name];
        if(typeof orig !== 'function') return;
        Sound[`__orig_${name}`] = orig;
        Sound[name] = function(...args) {
          const t0 = performance.now();
          const out = Sound[`__orig_${name}`].apply(this, args);
          const dt = performance.now() - t0;
          window._profData.audioCalls += 1;
          window._profData.audioMs += dt;
          return out;
        };
      };
      wrapAudioFn('playSample');
      wrapAudioFn('playVoice');
      wrapAudioFn('playMusic');
      wrapAudioFn('playAmbient');
      window._profOrigPlaySample = true;
    }
  };

  const _dpsEnsurePatched = () => {
    if(window._dpsPatched) return;
    // Iter 5: applyDamageToEnemy → NPC.prototype.takeDamage. The DPS
    // tracker wraps the new prototype method so all NPC subclasses
    // (Ifrit, Mimic, Shark, Zombie, Pixie, Thief, Fence, FrenchTaunter,
    // plus the base NPC) get tracked through one hook.
    if(typeof NPC === 'undefined' || !NPC.prototype || typeof NPC.prototype.takeDamage !== 'function') return;
    window._dpsPatched = true;
    const orig = NPC.prototype.takeDamage;
    window._dpsOrigTakeDamage = orig;
    NPC.prototype.takeDamage = function(dmg, attacker) {
      const out = orig.call(this, dmg, attacker);
      if(window._dpsSession && window._dpsSession.active) {
        const dealt = Number.isFinite(out) ? out : dmg;
        window._dpsSession.total += Math.max(0, dealt ?? 0);
        window._dpsSession.hits += 1;
      }
      return out;
    };
  };

  const _nearestEnemyToPlayer = (nameLike) => {
    const list = (enemies || []).filter(en => en && en.stats && en.stats.hp > 0);
    if(list.length === 0) return null;
    const filtered = nameLike ? list.filter(en => en.type && en.type.toLowerCase().includes(nameLike.toLowerCase())) : list;
    if(filtered.length === 0) return null;
    return filtered.reduce((best, en) => {
      const d = Math.abs(en.x - player.x) + Math.abs(en.y - player.y);
      return (!best || d < best.d) ? { en, d } : best;
    }, null);
  };

  function handleConsoleInput(e) {
    if(e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const cmd = consoleInput ? consoleInput.value.trim() : '';
      if(consoleInput) consoleInput.value = '';
      if(cmd.length === 0) return;
      debugLog(`> ${cmd}`);
      if(cmd.includes(';')) {
        const segments = cmd.split(';').map(s => s.trim()).filter(Boolean);
        if(segments.length > 1) {
          const fakeEvent = {
            key: 'Enter',
            preventDefault: () => {},
            stopPropagation: () => {},
            stopImmediatePropagation: () => {}
          };
          segments.forEach(seg => {
            if(consoleInput) consoleInput.value = seg;
            handleConsoleInput(fakeEvent);
          });
          return;
        }
      }

      let expanded = cmd;
      const aliasMap = window._debugAliases || {};
      const cmdPartsRaw = cmd.split(/\s+/);
      const firstToken = (cmdPartsRaw[0] || '').toLowerCase();
      if(firstToken !== '/alias') {
        const bare = firstToken.startsWith('/') ? firstToken.slice(1) : firstToken;
        if(aliasMap[firstToken]) expanded = aliasMap[firstToken] + (cmdPartsRaw.length > 1 ? ' ' + cmdPartsRaw.slice(1).join(' ') : '');
        else if(aliasMap[bare]) expanded = aliasMap[bare] + (cmdPartsRaw.length > 1 ? ' ' + cmdPartsRaw.slice(1).join(' ') : '');
      }

      const parts = expanded.split(/\s+/);
      const command = parts[0].toLowerCase();
      const args = parts.slice(1);
      switch(command) {
        case '/help':
          debugLog('Available commands:');
          debugLog('--- Core ---');
          debugLog('  /help                     - Show this help');
          debugLog('  /save                     - Save game');
          debugLog('  /restart                  - Restart game (confirm)');
          debugLog('  /clear                    - Clear console');
          debugLog('  /stats                    - Show player stats');
          debugLog('  /inventory                - List inventory items');
          debugLog('  /use <item>               - Use inventory item');
          debugLog('  /quests                   - Quest count summary');
          debugLog('');
          debugLog('--- Movement / MUD ---');
          debugLog('  n/s/e/w/ne/nw/se/sw       - Move');
          debugLog('  n8 / e5                   - Move multiple steps');
          debugLog('  run <dir> [steps]         - Run (faster, causes exhaustion)');
          debugLog('  kneel / sleep             - Context actions');
          debugLog('  /where                    - Show area context');
          debugLog('  /look [long]              - Inspect surroundings');
          debugLog('  /target nearest [type]    - Target nearest enemy');
          debugLog('');
          debugLog('--- Teleport / World ---');
          debugLog('  /goto <x> <y>             - Teleport to coordinates');
          debugLog('  /tele <scene|poi|floor>   - Teleport by name');
          debugLog('  /seed <n>                 - Set deterministic map seed');
          debugLog('  /regen                    - Regenerate current map');
          debugLog('  /snapshot save|load|list  - Save/load test snapshot');
          debugLog('');
          debugLog('--- Audio / Assets ---');
          debugLog('  /music on|off             - Toggle music');
          debugLog('  /sfx on|off               - Toggle sound effects');
          debugLog('  /assets                   - Count loaded assets by type');
          debugLog('  /assets <type>            - List assets by type');
          debugLog('  /launch [name]            - Launch minigame');
          debugLog('');
          debugLog('--- Macros / Aliases ---');
          debugLog('  /alias add|del|list       - Manage command aliases');
          debugLog('  /macro list               - List all macros');
          debugLog('  /macro add IF X THEN Y    - Add a macro rule');
          debugLog('  /macro setcd I T          - Set macro cooldown turns');
          debugLog('  /macro clear N|all        - Remove macro(s)');
          debugLog('  /macro run                - Run all macros now');
          debugLog('');
          debugLog('--- GM / QA Tools ---');
          debugLog('  /gm on|off|speed <x>      - GM/debug movement presets');
          debugLog('  /loot add <icon> [qty]    - Add item(s) to inventory');
          debugLog('  /spawn <mob> [count]      - Spawn enemies near player');
          debugLog('  /despawn <all|radius N>   - Remove enemies');
          debugLog('  /quest list|stage|complete - Quest admin tools');
          debugLog('  /validate                 - Run integrity checks');
          debugLog('');
          debugLog('--- Profiling / Logs ---');
          debugLog('  /log start|stop|export    - Session logging controls');
          debugLog('  /dps start [sec]|report   - Damage test harness');
          debugLog('  /prof fps|ai|render|audio - Runtime profiler readouts');
          debugLog('Macro conditions: HP<N, MP<N, HUNGER>N, FLOOR>=N, STATUS=name');
          debugLog('Macro actions: USE \'item name\', CAST spellname, REST, FLEE');
          break;
        case '/stats':
          debugLog(`Level ${player.level} | HP ${Math.floor(player.hp)}/${Math.floor(player.maxHp)} | MP ${Math.floor(player.mp)}/${Math.floor(player.maxMp)}`);
          debugLog(`GP ${player.gp} | STR ${player.stats.str} | DEX ${player.stats.dex} | INT ${player.stats.int}`);
          break;
        case '/inventory':
          let nonEmpty = inventory.filter(i => i !== null);
          debugLog(`Inventory: ${nonEmpty.length} items`);
          nonEmpty.forEach((item) => {
            let name = item.def ? item.def.displayName : item.icon;
            debugLog(`  ${item.icon} ${name} x${item.qty ?? 1}`);
          });
          break;
        case '/clear': {
          window._debugLog = [];
          let logArea = document.getElementById('console-log');
          if(logArea) logArea.innerHTML = '';
          break;
        }
        case '/launch':
          if(args.length > 0) {
            let name = args[0].toLowerCase();
            // Astrochicken is always launchable — uses bar mini-game, no assets needed
            if(name === 'astrochicken' || name === 'astrochicken/index.html') {
              if(typeof window.astrochickenBarGame === 'function') {
                window.astrochickenBarGame();
                debugLog('Launching Astrochicken...');
              } else if(typeof window.astrochickenGame === 'function') {
                window.astrochickenGame();
                debugLog('Launching Astrochicken...');
              } else {
                debugLog('Astrochicken not found. Check shop.js is loaded.');
              }
              break; // early exit BEFORE the assets check
            }
            if(window.assets && window.assets.minigames) {
              let assetKeys = Object.keys(window.assets.minigames);
              let matchingKey = assetKeys.find(key => key.toLowerCase().includes(name));
              if(matchingKey) {
                debugLog(`Found ${matchingKey} but no launcher for this type.`);
              } else {
                debugLog(`No minigame matching "${name}". Available: ${assetKeys.join(', ')}`);
              }
            } else {
              debugLog('No assets loaded. Load the asset file first.');
            }
          } else {
            debugLog('Usage: /launch <name> (e.g. /launch astrochicken)');
          }
          break;
        case '/assets': {
          if(!window.assets) { debugLog('No assets loaded.'); break; }
           if(args.length === 0) {
            debugLog(`Sprites: ${Object.keys(window.assets.sprites||{}).length}`);
            debugLog(`Sounds:  ${Object.keys(window.assets.sounds||{}).length}`);
            debugLog(`Minigames: ${Object.keys(window.assets.minigames||{}).length}`);
            debugLog(`Movies:  ${Object.keys(window.assets.movies||{}).length}`);
          } else {
            const type = args[0].toLowerCase();
            const map = window.assets[type] || {};
            const keys = Object.keys(map);
            if(keys.length === 0) { debugLog(`No ${type} assets loaded.`); break; }
            debugLog(`${type} (${keys.length}):`);
            keys.forEach(k => debugLog(`  ${k}`));
          }
          break;
        }
        case '/music': {
          const mSub = args[0]?.toLowerCase();
          if(mSub === 'on') {
            const musicToggle = document.getElementById('music-toggle');
            if(musicToggle) musicToggle.checked = true;
            if(typeof toggleSetting === 'function') toggleSetting('music', true);
            else window.gameSettings.music = true;
            debugLog('Music ON');
          } else if(mSub === 'off') {
            const musicToggle = document.getElementById('music-toggle');
            if(musicToggle) musicToggle.checked = false;
            if(typeof toggleSetting === 'function') toggleSetting('music', false);
            else {
              window.gameSettings.music = false;
              if(typeof Sound !== 'undefined' && typeof Sound.stopMusic === 'function') Sound.stopMusic();
            }
            debugLog('Music OFF');
          } else {
            debugLog('Usage: /music on | /music off');
            debugLog('Current: ' + (window.gameSettings.music ? 'ON' : 'OFF'));
          }
          break;
        }
        case '/sfx': {
          const sSub = args[0]?.toLowerCase();
          if(sSub === 'on') {
            window.gameSettings.sfx = true;
            document.getElementById('sfx-toggle').checked = true;
            debugLog('SFX ON');
          } else if(sSub === 'off') {
            window.gameSettings.sfx = false;
            document.getElementById('sfx-toggle').checked = false;
            debugLog('SFX OFF');
          } else {
            debugLog('Usage: /sfx on | /sfx off');
            debugLog('Current: ' + (window.gameSettings.sfx ? 'ON' : 'OFF'));
          }
          break;
        }
        case '/where': {
          const p = player;
          const hostiles = (typeof enemies !== 'undefined' ? enemies : []).filter(e => e && e.stats && e.stats.hp > 0 && !e.friendly && !e.farmAnimal);
          const nearest = hostiles.reduce((best, e) => {
            const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
            return (!best || d < best.d) ? { e, d } : best;
          }, null);
          debugLog(`Scene: ${currentScene} | Floor: ${currentLevel} | Pos: ${p.x},${p.y}`);
          debugLog(`Map: ${mapW}x${mapH} | Enemies: ${(enemies || []).length} | Ground items: ${(itemsOnGround || []).length}`);
          if(nearest) debugLog(`Nearest hostile: ${nearest.e.type} (${nearest.d} tiles)`);
          else debugLog('Nearest hostile: none');
          break;
        }
        case '/look': {
          const longMode = (args[0] || '').toLowerCase() === 'long';
          const tile = theMap?.[player.y]?.[player.x];
          debugLog(`You are at ${player.x},${player.y} in ${currentScene}:${currentLevel}. Tile=${tile}`);
          const nearEnemies = (enemies || []).filter(en => Math.abs(en.x - player.x) <= 2 && Math.abs(en.y - player.y) <= 2 && en.stats && en.stats.hp > 0);
          const nearItems = (itemsOnGround || []).filter(it => Math.abs(it.x - player.x) <= 2 && Math.abs(it.y - player.y) <= 2);
          if(nearEnemies.length) debugLog(`Nearby enemies: ${nearEnemies.map(en => `${en.type}@${en.x},${en.y}`).join(', ')}`);
          else debugLog('Nearby enemies: none');
          if(nearItems.length) debugLog(`Nearby items: ${nearItems.map(it => `${it.icon}@${it.x},${it.y}`).join(', ')}`);
          else debugLog('Nearby items: none');
          if(longMode) {
            const exits = [];
            const dirs = [[0,-1,'N'],[1,0,'E'],[0,1,'S'],[-1,0,'W']];
            dirs.forEach(([dx,dy,name]) => {
              const tx = player.x + dx, ty = player.y + dy;
              if(tx >= 0 && tx < mapW && ty >= 0 && ty < mapH && isTileFloor(theMap?.[ty]?.[tx])) exits.push(name);
            });
            debugLog(`Exits: ${exits.length ? exits.join(', ') : 'none'}`);
          }
          break;
        }
        case '/target': {
          const sub = (args[0] || '').toLowerCase();
          if(sub !== 'nearest') { debugLog('Usage: /target nearest [type]'); break; }
          const q = args.slice(1).join(' ').trim();
          const best = _nearestEnemyToPlayer(q);
          if(!best) { debugLog('No matching enemy found.'); break; }
          window._debugTarget = { type: best.en.type, x: best.en.x, y: best.en.y };
          player.facing = { dx: Math.sign(best.en.x - player.x) || 0, dy: Math.sign(best.en.y - player.y) || 1 };
          debugLog(`Targeting ${best.en.type} at ${best.en.x},${best.en.y} (${best.d} tiles).`);
          break;
        }
        case '/gm': {
          const sub = (args[0] || '').toLowerCase();
          if(sub === 'on') {
            window.debugFlags = window.debugFlags || {};
            debugFlags.godMode = true;
            debugFlags.fullLight = true;
            player.speedMod = Math.max(player.speedMod ?? 1, 1.5);
            debugLog('GM mode enabled.');
          } else if(sub === 'off') {
            window.debugFlags = window.debugFlags || {};
            debugFlags.godMode = false;
            debugFlags.fullLight = false;
            player.speedMod = 1.0;
            debugLog('GM mode disabled.');
          } else if(sub === 'speed') {
            const mult = parseFloat(args[1]);
            if(!Number.isFinite(mult) || mult <= 0 || mult > 10) { debugLog('Usage: /gm speed <0.1..10>'); break; }
            player.speedMod = mult;
            debugLog(`GM speed multiplier set to ${mult.toFixed(2)}.`);
          } else {
            debugLog('Usage: /gm on | /gm off | /gm speed <mult>');
          }
          if(typeof updateUI === 'function') updateUI();
          break;
        }
        case '/log': {
          const sub = (args[0] || '').toLowerCase();
          window._debugRecorder = window._debugRecorder || { active: false, lines: [] };
          if(sub === 'start') {
            window._debugRecorder.active = true;
            window._debugRecorder.lines = [];
            debugLog('Session logging started.');
          } else if(sub === 'stop') {
            window._debugRecorder.active = false;
            debugLog(`Session logging stopped (${window._debugRecorder.lines.length} lines).`);
          } else if(sub === 'export') {
            const lines = (window._debugRecorder.lines || []).slice();
            if(lines.length === 0) { debugLog('No recorded lines to export.'); break; }
            const text = lines.join('\n');
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `debug-session-${Date.now()}.log`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            debugLog(`Exported ${lines.length} lines.`);
          } else {
            debugLog('Usage: /log start | /log stop | /log export');
          }
          break;
        }
        case '/goto': {
          const x = parseInt(args[0], 10);
          const y = parseInt(args[1], 10);
          if(isNaN(x) || isNaN(y)) { debugLog('Usage: /goto <x> <y>'); break; }
          if(x < 0 || x >= mapW || y < 0 || y >= mapH) { debugLog(`Out of bounds (0-${mapW-1}, 0-${mapH-1})`); break; }
          player.x = x;
          player.y = y;
          if(typeof calculateFOV === 'function') calculateFOV();
          if(typeof drawMap === 'function') drawMap();
          if(typeof updateUI === 'function') updateUI();
          debugLog(`Teleported to ${x},${y}.`);
          break;
        }
        case '/tele': {
          if(args.length === 0) { debugLog('Usage: /tele <scene|poi|floorN>'); break; }
          const raw = args.join(' ').toLowerCase();
          const floorMatch = raw.match(/^floor\s*(\d+)$/i) || raw.match(/^f(\d+)$/i) || raw.match(/^(\d+)$/);
          if(floorMatch) {
            const f = parseInt(floorMatch[1], 10);
            if(isNaN(f) || f < 0) { debugLog('Invalid floor.'); break; }
            currentLevel = f;
            if(typeof initMap === 'function') initMap(50);
            if(typeof calculateFOV === 'function') calculateFOV();
            if(typeof drawMap === 'function') drawMap();
            if(typeof updateUI === 'function') updateUI();
            debugLog(`Teleported to floor ${f}.`);
            break;
          }

          const sceneAliases = {
            town: 'town', tristram: 'town',
            dungeon: 'dungeon',
            mountain: 'mountain', highlands: 'mountain',
            beach: 'beach',
            desert: 'desert',
            forest: 'forest', hedge: 'forest',
            castle: 'castle',
            champion: 'champion', hall: 'champion',
            nest: 'nest', roc: 'nest',
            eagle: 'eagle_crag', crag: 'eagle_crag'
          };
          const sceneKey = sceneAliases[raw];
          if(sceneKey) {
            const lvlByScene = { town: 0, dungeon: 1, mountain: 11, beach: 12, desert: 13, forest: 14, castle: 15 };
            if(sceneKey === 'champion' || sceneKey === 'nest' || sceneKey === 'eagle_crag') {
              if(typeof enterBackgroundScene === 'function') {
                const entry = sceneKey === 'champion' ? {x:30,y:40} : sceneKey === 'nest' ? {x:30,y:17} : {x:30,y:40};
                enterBackgroundScene(sceneKey, entry);
                debugLog(`Teleported to scene ${sceneKey}.`);
              } else {
                debugLog('enterBackgroundScene not available');
              }
            } else {
              currentLevel = lvlByScene[sceneKey] || currentLevel;
              currentScene = sceneKey;
              if(typeof initMap === 'function') initMap(50);
              if(typeof calculateFOV === 'function') calculateFOV();
              if(typeof drawMap === 'function') drawMap();
              if(typeof updateUI === 'function') updateUI();
              debugLog(`Teleported to scene ${sceneKey} (floor ${currentLevel}).`);
            }
            break;
          }

          // POIs
          if(raw === 'ifrit') {
            currentLevel = 1;
            if(typeof initMap === 'function') initMap(50);
            const ifrit = (enemies || []).find(en => en.type === 'ifrit');
            if(ifrit) { player.x = Math.max(1, ifrit.x - 1); player.y = ifrit.y; }
            if(typeof calculateFOV === 'function') calculateFOV();
            if(typeof drawMap === 'function') drawMap();
            if(typeof updateUI === 'function') updateUI();
            debugLog('Teleported to Ifrit floor and moved near boss.');
            break;
          }
          debugLog(`Unknown tele target '${raw}'.`);
          break;
        }
        case '/seed': {
          const s = parseInt(args[0], 10);
          if(isNaN(s)) { debugLog('Usage: /seed <integer>'); break; }
          window._debugMapSeed = s >>> 0;
          debugLog(`Map seed set to ${window._debugMapSeed}. Use /regen to apply.`);
          break;
        }
        case '/regen': {
          if(typeof initMap !== 'function') { debugLog('initMap not available'); break; }
          const baseSize = 50;
          if(typeof window._debugMapSeed === 'number') {
            const nextSeed = _runWithSeededRandom(window._debugMapSeed, () => initMap(baseSize));
            window._debugMapSeed = nextSeed;
            debugLog(`Regenerated map with seeded RNG. Next seed: ${nextSeed}`);
          } else {
            initMap(baseSize);
            debugLog('Regenerated map with default RNG.');
          }
          if(typeof calculateFOV === 'function') calculateFOV();
          if(typeof drawMap === 'function') drawMap();
          if(typeof updateUI === 'function') updateUI();
          break;
        }
        case '/snapshot': {
          const sub = (args[0] || '').toLowerCase();
          if(sub === 'save') {
            const res = _saveDebugSnapshot(args[1]);
            debugLog(res.msg);
          } else if(sub === 'load') {
            const res = _loadDebugSnapshot(args[1]);
            debugLog(res.msg);
          } else if(sub === 'list') {
            const names = Object.keys(window._debugSnapshots || {});
            debugLog(names.length ? `Snapshots: ${names.join(', ')}` : 'No snapshots saved.');
          } else {
            debugLog('Usage: /snapshot save <name> | /snapshot load <name> | /snapshot list');
          }
          break;
        }
        case '/loot': {
          const sub = (args[0] || '').toLowerCase();
          if(sub !== 'add') { debugLog('Usage: /loot add <icon> [qty]'); break; }
          const icon = args[1];
          const qty = Math.max(1, parseInt(args[2] || '1', 10) || 1);
          if(!icon) { debugLog('Usage: /loot add <icon> [qty]'); break; }
          let added = 0;
          for(let i = 0; i < qty; i++) {
            const slot = inventory.findIndex(s => s === null);
            if(slot !== -1) { inventory[slot] = { icon, qty: 1 }; added++; continue; }
            if(typeof tryPlaceInInventory === 'function' && tryPlaceInInventory({ icon, qty: 1 })) { added++; continue; }
            break;
          }
          if(typeof renderQuickslots === 'function') renderQuickslots();
          if(typeof renderInventory === 'function') renderInventory();
          if(typeof updateUI === 'function') updateUI();
          debugLog(`Added ${added}/${qty} ${icon}.`);
          break;
        }
        case '/spawn': {
          if(args.length === 0) { debugLog('Usage: /spawn <mob> [count]'); break; }
          const mob = args[0].toLowerCase();
          const count = Math.max(1, Math.min(50, parseInt(args[1] || '1', 10) || 1));
          if(typeof MONSTER_DEF === 'undefined' || !MONSTER_DEF[mob]) {
            debugLog(`Unknown mob '${mob}'.`);
            break;
          }
          let spawned = 0;
          for(let i = 0; i < count; i++) {
            let pos = null;
            for(let tries = 0; tries < 20; tries++) {
              const x = player.x + Math.floor(Math.random() * 9) - 4;
              const y = player.y + Math.floor(Math.random() * 9) - 4;
              if(x < 1 || x >= mapW - 1 || y < 1 || y >= mapH - 1) continue;
              if(!theMap[y] || !isTileFloor(theMap[y][x])) continue;
              if(enemies.some(en => en.x === x && en.y === y)) continue;
              if(x === player.x && y === player.y) continue;
              pos = {x, y};
              break;
            }
            if(!pos) continue;
            spawnNpc(enemies, pos.x, pos.y, mob, { stats: {...MONSTER_DEF[mob]} });
            spawned++;
          }
          if(typeof drawMap === 'function') drawMap();
          if(typeof updateUI === 'function') updateUI();
          debugLog(`Spawned ${spawned}/${count} ${mob}.`);
          break;
        }
        case '/despawn': {
          if(args.length === 0 || args[0].toLowerCase() === 'all') {
            const before = enemies.length;
            enemies = enemies.filter(en => en.isQuestNPC || (en.stats && en.stats.quest));
            syncActiveZone();
            debugLog(`Despawned ${before - enemies.length} non-quest enemies.`);
          } else if(args[0].toLowerCase() === 'radius') {
            const r = Math.max(1, Math.min(99, parseInt(args[1] || '6', 10) || 6));
            const before = enemies.length;
            enemies = enemies.filter(en => {
              if(en.isQuestNPC || (en.stats && en.stats.quest)) return true;
              const d = Math.abs(en.x - player.x) + Math.abs(en.y - player.y);
              return d > r;
            });
            syncActiveZone();
            debugLog(`Despawned ${before - enemies.length} enemies within radius ${r}.`);
          } else {
            const mob = args[0].toLowerCase();
            const before = enemies.length;
            enemies = enemies.filter(en => en.type !== mob || en.isQuestNPC || (en.stats && en.stats.quest));
            syncActiveZone();
            debugLog(`Despawned ${before - enemies.length} '${mob}' enemies.`);
          }
          if(typeof drawMap === 'function') drawMap();
          if(typeof updateUI === 'function') updateUI();
          break;
        }
        case '/quest': {
          if(typeof QuestEngine === 'undefined') { debugLog('Quest engine not available'); break; }
          const sub = (args[0] || '').toLowerCase();
          if(sub === 'list') {
            const ids = Object.keys(QuestEngine._questDefs || {});
            debugLog(`Quests (${ids.length}): ${ids.join(', ')}`);
          } else if(sub === 'stage') {
            const qid = args[1];
            const stage = parseInt(args[2], 10);
            if(!qid || isNaN(stage)) { debugLog('Usage: /quest stage <questId> <stageNum>'); break; }
            if(typeof QuestEngine.advance !== 'function') { debugLog('QuestEngine.advance not available'); break; }
            const ok = QuestEngine.advance(qid, stage);
            debugLog(ok ? `Quest advanced: ${qid} -> ${stage}` : `Quest advance failed: ${qid} -> ${stage}`);
          } else if(sub === 'complete') {
            const qid = args[1];
            if(!qid) { debugLog('Usage: /quest complete <questId>'); break; }
            const def = (QuestEngine._questDefs || {})[qid];
            if(!def) { debugLog(`Unknown quest '${qid}'`); break; }
            if(!def.stages || def.stages.length === 0) { debugLog(`Quest '${qid}' has no stages.`); break; }
            const fin = (def.stages || []).filter(s => s.finishesQuest).sort((a,b)=>a.progress-b.progress);
            const target = fin.length > 0 ? fin[0].progress : Math.max(...(def.stages || []).map(s => s.progress));
            const ok = QuestEngine.advance(qid, target);
            debugLog(ok ? `Quest completed: ${qid} -> stage ${target}` : `Quest completion failed for ${qid}`);
          } else {
            debugLog('Usage: /quest list | /quest stage <questId> <stageNum> | /quest complete <questId>');
          }
          break;
        }
        case '/dps': {
          const sub = (args[0] || '').toLowerCase();
          _dpsEnsurePatched();
          if(sub === 'start') {
            const secs = Math.max(1, Math.min(600, parseInt(args[1] || '60', 10) || 60));
            const endAt = Date.now() + secs * 1000;
            window._dpsSession = { active: true, startedAt: Date.now(), endAt, total: 0, hits: 0, duration: secs };
            debugLog(`DPS session started for ${secs}s.`);
          } else if(sub === 'report') {
            const s = window._dpsSession;
            if(!s) { debugLog('No DPS session. Use /dps start [sec].'); break; }
            const now = Date.now();
            if(s.active && now >= s.endAt) s.active = false;
            const elapsed = Math.max(1, Math.floor((Math.min(now, s.endAt || now) - s.startedAt) / 1000));
            const dps = s.total / elapsed;
            debugLog(`DPS Report: total=${s.total.toFixed(1)} dmg, hits=${s.hits}, elapsed=${elapsed}s, dps=${dps.toFixed(2)}`);
          } else {
            debugLog('Usage: /dps start [seconds] | /dps report');
          }
          break;
        }
        case '/prof': {
          const sub = (args[0] || '').toLowerCase();
          _profEnsurePatched();
          window._profData = window._profData || { drawMs: 0, drawCalls: 0, aiMs: 0, aiCalls: 0, audioCalls: 0, audioMs: 0, startedAt: Date.now() };
          if(sub === 'fps') {
            const sampleMs = Math.max(500, Math.min(10000, parseInt(args[1] || '2000', 10) || 2000));
            let frames = 0;
            const t0 = performance.now();
            const tick = () => {
              frames++;
              if(performance.now() - t0 >= sampleMs) {
                const fps = frames * 1000 / (performance.now() - t0);
                debugLog(`FPS sample (${sampleMs}ms): ${fps.toFixed(1)}`);
              } else {
                requestAnimationFrame(tick);
              }
            };
            requestAnimationFrame(tick);
          } else if(sub === 'ai') {
            const d = window._profData;
            const avg = d.aiCalls > 0 ? d.aiMs / d.aiCalls : 0;
            debugLog(`AI timing: calls=${d.aiCalls}, total=${d.aiMs.toFixed(2)}ms, avg=${avg.toFixed(3)}ms`);
          } else if(sub === 'render') {
            const d = window._profData;
            const avg = d.drawCalls > 0 ? d.drawMs / d.drawCalls : 0;
            debugLog(`Render timing: calls=${d.drawCalls}, total=${d.drawMs.toFixed(2)}ms, avg=${avg.toFixed(3)}ms`);
          } else if(sub === 'audio') {
            const d = window._profData;
            const avg = d.audioCalls > 0 ? d.audioMs / d.audioCalls : 0;
            debugLog(`Audio calls: calls=${d.audioCalls}, total=${d.audioMs.toFixed(2)}ms, avg=${avg.toFixed(3)}ms`);
          } else {
            debugLog('Usage: /prof fps [ms] | /prof ai | /prof render | /prof audio');
          }
          break;
        }
        case '/validate': {
          let errs = 0;
          let warns = 0;
          if(!Number.isFinite(player.x) || !Number.isFinite(player.y)) { errs++; debugLog('ERR player coords are not finite'); }
          if(player.x < 0 || player.x >= mapW || player.y < 0 || player.y >= mapH) { errs++; debugLog('ERR player coords out of bounds'); }
          if(!Number.isFinite(player.hp) || !Number.isFinite(player.maxHp)) { errs++; debugLog('ERR HP invalid'); }
          if(player.hp > player.maxHp) { warns++; debugLog('WARN HP above max'); }
          let badEnemies = 0;
          (enemies || []).forEach((en, i) => {
            if(!en || !Number.isFinite(en.x) || !Number.isFinite(en.y) || !en.stats || !Number.isFinite(en.stats.hp)) badEnemies++;
          });
          if(badEnemies > 0) { errs++; debugLog(`ERR invalid enemies: ${badEnemies}`); }
          let badTiles = 0;
          if(Array.isArray(theMap)) {
            for(let y = 0; y < theMap.length; y++) {
              if(!Array.isArray(theMap[y])) { badTiles++; continue; }
              for(let x = 0; x < theMap[y].length; x++) {
                if(theMap[y][x] == null) badTiles++;
              }
            }
          }
          if(badTiles > 0) { warns++; debugLog(`WARN null/invalid map tiles: ${badTiles}`); }
          if(errs === 0 && warns === 0) debugLog('Validation OK: no issues found.');
          else debugLog(`Validation complete: ${errs} error(s), ${warns} warning(s).`);
          break;
        }
        case '/alias': {
          window._debugAliases = window._debugAliases || {};
          const sub = (args[0] || '').toLowerCase();
          if(sub === 'list') {
            const keys = Object.keys(window._debugAliases);
            if(keys.length === 0) debugLog('No aliases defined.');
            else keys.forEach(k => debugLog(`${k} => ${window._debugAliases[k]}`));
          } else if(sub === 'add') {
            const name = (args[1] || '').toLowerCase();
            const val = args.slice(2).join(' ');
            if(!name || !val) { debugLog('Usage: /alias add <name> <expansion>'); break; }
            window._debugAliases[name] = val;
            debugLog(`Alias added: ${name} => ${val}`);
          } else if(sub === 'del' || sub === 'remove') {
            const name = (args[1] || '').toLowerCase();
            if(!name) { debugLog('Usage: /alias del <name>'); break; }
            delete window._debugAliases[name];
            debugLog(`Alias removed: ${name}`);
          } else {
            debugLog('Usage: /alias list | /alias add <name> <expansion> | /alias del <name>');
          }
          break;
        }
        case '/macro': {
          if(!player.macros) player.macros = [];
          const subcmd = args[0]?.toLowerCase();
          if(subcmd === 'list') {
            if(player.macros.length === 0) { debugLog('No macros defined.'); break; }
            player.macros.forEach((m,i) => debugLog(`  [${i}] IF ${m.condition} THEN ${m.action}`));
          } else if(subcmd === 'add') {
            const raw = args.slice(1).join(' ');
            const match = raw.match(/^IF\s+(.+?)\s+THEN\s+(.+)$/i);
            if(!match) { debugLog('Usage: /macro add IF <condition> THEN <action>'); break; }
            player.macros.push({ condition: match[1].trim(), action: match[2].trim(), cooldownTurns: 0, _cdRemaining: 0 });
            debugLog(`Macro added: IF ${match[1].trim()} THEN ${match[2].trim()}`);
          } else if(subcmd === 'setcd') {
            const idx = parseInt(args[1], 10);
            const turns = Math.max(0, parseInt(args[2], 10) || 0);
            if(isNaN(idx) || !player.macros[idx]) { debugLog('Usage: /macro setcd <index> <turns>'); break; }
            player.macros[idx].cooldownTurns = turns;
            player.macros[idx]._cdRemaining = Math.min(player.macros[idx]._cdRemaining ?? 0, turns);
            debugLog(`Macro ${idx} cooldown set to ${turns} turn(s).`);
          } else if(subcmd === 'clear') {
            const which = args[1];
            if(which === 'all') { player.macros = []; debugLog('All macros cleared.'); }
            else { const n = parseInt(which); if(!isNaN(n) && player.macros[n]) { player.macros.splice(n,1); debugLog(`Macro ${n} removed.`); } else debugLog('Invalid macro index.'); }
          } else if(subcmd === 'run') {
            if(typeof runMacros === 'function') runMacros();
            debugLog('Macros executed.');
          } else {
            debugLog('Usage: /macro list|add|setcd|clear|run');
          }
          break;
        }
        case '/save':
          if(typeof saveGame === 'function') saveGame();
          else debugLog('saveGame not available');
          break;
        case '/quests':
          if(window.QuestEngine && typeof QuestEngine.getQuestLog === 'function') {
            let qlog = QuestEngine.getQuestLog();
            debugLog(`Active: ${qlog.active.length}, Completed: ${qlog.completed.length}`);
          } else {
            debugLog('Quest engine not available');
          }
          break;
        case '/restart':
          if(confirm('Are you sure you want to restart? Unsaved progress will be lost.')) {
            if(typeof restartGame === 'function') restartGame();
            else debugLog('restartGame not available');
          } else {
            debugLog('Restart cancelled.');
          }
          break;
        // #3: MUD-style movement and action commands
        case '/use':
          if(args.length === 0) {
            debugLog('Usage: /use <item>');
            break;
          }
          const query = args.join(' ').toLowerCase();
          // Find item in inventory
          let foundIdx = -1;
          for(let i = 0; i < inventory.length; i++) {
            const item = inventory[i];
            if(!item) continue;
            if(item.icon === query || item.itemName === query) { foundIdx = i; break; }
            const def = item.def;
            if(def && def.displayName.toLowerCase().includes(query)) { foundIdx = i; break; }
          }
          if(foundIdx === -1) {
            debugLog(`No item matching '${query}' in inventory.`);
            break;
          }
          if(typeof handleItemClick === 'function') {
            const usedIcon = inventory[foundIdx]?.icon || query;
            handleItemClick(foundIdx);
            debugLog(`Using ${usedIcon}`);
          } else {
            debugLog('handleItemClick not available');
          }
          break;
        case 'north': case 'n':
          if(typeof movePlayer === 'function') { movePlayer(0, -1); debugLog('Moving north...'); }
          break;
        case 'south': case 's':
          if(typeof movePlayer === 'function') { movePlayer(0, 1); debugLog('Moving south...'); }
          break;
        case 'east': case 'e':
          if(typeof movePlayer === 'function') { movePlayer(1, 0); debugLog('Moving east...'); }
          break;
        case 'west': case 'w':
          if(typeof movePlayer === 'function') { movePlayer(-1, 0); debugLog('Moving west...'); }
          break;
        case 'northeast': case 'ne':
          if(typeof movePlayer === 'function') { movePlayer(1, -1); debugLog('Moving northeast...'); }
          break;
        case 'northwest': case 'nw':
          if(typeof movePlayer === 'function') { movePlayer(-1, -1); debugLog('Moving northwest...'); }
          break;
        case 'southeast': case 'se':
          if(typeof movePlayer === 'function') { movePlayer(1, 1); debugLog('Moving southeast...'); }
          break;
        case 'southwest': case 'sw':
          if(typeof movePlayer === 'function') { movePlayer(-1, 1); debugLog('Moving southwest...'); }
          break;
        case 'sleep': case 'rest':
          if(typeof restPlayer === 'function') { restPlayer(); debugLog('Resting...'); }
          break;
        case 'kneel':
          if(typeof kneelAction === 'function') { kneelAction(); debugLog('Kneeling...'); }
          break;
        case 'run': {
          if(typeof movePlayer !== 'function') { debugLog('movePlayer not available'); break; }
          if(args.length === 0) { debugLog('Usage: run <n|s|e|w|ne|nw|se|sw> [steps]'); break; }

          let runDir = args[0].toLowerCase();
          let runSteps = parseInt(args[1] || '3', 10);

          const compact = runDir.match(/^([nsew]{1,2})(\d+)$/i);
          if(compact) {
            runDir = compact[1].toLowerCase();
            runSteps = parseInt(compact[2], 10);
          }

          if(isNaN(runSteps) || runSteps < 1 || runSteps > 20) {
            debugLog('Run steps must be 1-20');
            break;
          }

          const dirMap = {
            n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0],
            ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1]
          };
          const vec = dirMap[runDir];
          if(!vec) { debugLog('Usage: run <n|s|e|w|ne|nw|se|sw> [steps]'); break; }

          const prevRunState = !!player.isRunning;
          player.isRunning = true;
          for(let i = 0; i < runSteps; i++) movePlayer(vec[0], vec[1]);
          player.isRunning = prevRunState;
          debugLog(`Running ${runDir} ${runSteps} step${runSteps === 1 ? '' : 's'}...`);
          break;
        }
        case 'attack':
          if(args.length > 0) {
            let targetName = args.join(' ').toLowerCase();
            let targetIdx = enemies.findIndex(e => e.type.includes(targetName) && Math.abs(e.x - player.x) <= 1 && Math.abs(e.y - player.y) <= 1);
            if(targetIdx !== -1) {
              if(typeof meleeAttack === 'function') { meleeAttack(); debugLog(`Attacking ${enemies[targetIdx].type}...`); }
            } else {
              debugLog(`No nearby enemy matching "${args.join(' ')}".`);
            }
          } else {
            debugLog('Usage: attack <target name>');
          }
          break;
        case 'cast':
          if(args.length > 0) {
            // Handle "cast <spell>" or "cast <spell> at <target>"
            let castArgs = args.join(' ');
            let atMatch = castArgs.match(/^(.+?)\s+at\s+(.+)$/i);
            if(atMatch && typeof castSpell === 'function') {
              let spellName = atMatch[1].toLowerCase();
              let targetName = atMatch[2].toLowerCase();
              let targetIdx = enemies.findIndex(e => e.type.includes(targetName) && Math.abs(e.x - player.x) <= 10 && Math.abs(e.y - player.y) <= 10);
              if(targetIdx !== -1) {
                player.facing = { dx: Math.sign(enemies[targetIdx].x - player.x) || 0, dy: Math.sign(enemies[targetIdx].y - player.y) || 1 };
              }
              castSpell(spellName);
              debugLog(`Casting ${spellName} at ${targetName}...`);
            } else if(typeof castSpell === 'function') {
              castSpell(args[0].toLowerCase());
              debugLog(`Casting ${args[0]}...`);
            }
          } else {
            debugLog('Usage: cast <spell> or cast <spell> at <target>');
          }
          break;
        default:
          // Check for compound movement (e.g., "n8")
          const moveMatch = command.match(/^([nsew])(\d+)$/i);
          if(moveMatch) {
            const dir = moveMatch[1].toLowerCase();
            const steps = parseInt(moveMatch[2], 10);
            if(steps < 1 || steps > 20) { debugLog('Steps must be 1-20'); break; }
            let dx = 0, dy = 0;
            if(dir === 'n') dy = -1;
            else if(dir === 's') dy = 1;
            else if(dir === 'e') dx = 1;
            else if(dir === 'w') dx = -1;
            if(typeof movePlayer === 'function') {
              for(let i = 0; i < steps; i++) movePlayer(dx, dy);
              debugLog(`Moving ${dir} ${steps} steps...`);
            }
          } else {
            debugLog(`Unknown: ${command}. Type /help`);
          }
      }
      return;
    }
    if(e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      _hideConsole();
    }
  }
  if(consoleInput) consoleInput.addEventListener('keydown', handleConsoleInput);

  function _showConsole() {
    debugOverlay.style.transform = 'translateY(0)';
    consolePullTab.textContent = '▼ console';
    // Update pull tab position to sit above the console
    consolePullTab.style.bottom = debugOverlay.offsetHeight + 'px';
    window._consoleVisible = true;
    window._consoleActive = true;
    // Populate log area with existing entries
    let logArea = document.getElementById('console-log');
    if(logArea) { logArea.innerHTML = window._debugLog.map(e => e + '<br>').join(''); logArea.scrollTop = logArea.scrollHeight; }
    let input = document.getElementById('console-input');
    if(input) {
      input.focus();
    }
  }

  function _hideConsole() {
    debugOverlay.style.transform = 'translateY(100%)';
    consolePullTab.textContent = '▲ console';
    consolePullTab.style.bottom = '0';
    window._consoleVisible = false;
    window._consoleActive = false;
  }

  // Pull tab click toggles console
  consolePullTab.addEventListener('click', () => {
    if(window._consoleVisible) { _hideConsole(); } else { _showConsole(); }
  });

  // Drag support on pull tab
  let _tabDragging = false, _tabDragStartY = 0, _tabDragStartH = 0;
  consolePullTab.addEventListener('mousedown', (e) => {
    _tabDragging = true;
    _tabDragStartY = e.clientY;
    _tabDragStartH = debugOverlay.offsetHeight ?? 150;
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if(!_tabDragging) return;
    let dy = _tabDragStartY - e.clientY; // positive = dragging up
    let newH = Math.max(80, Math.min(400, _tabDragStartH + dy));
    debugOverlay.style.height = newH + 'px';
    consolePullTab.style.bottom = newH + 'px';
    if(newH > 80) {
      debugOverlay.style.transform = 'translateY(0)';
      consolePullTab.textContent = '▼ console';
      window._consoleVisible = true;
      window._consoleActive = true;
    }
  });
  document.addEventListener('mouseup', () => { _tabDragging = false; });

  // Press ` to toggle debug overlay visibility
  document.addEventListener('keydown', (e) => {
    if(e.key === '`') {
      e.preventDefault();
      if(!window._consoleVisible) {
        _showConsole();
      } else {
        _hideConsole();
      }
    }
  });

  document.getElementById('startBtn').addEventListener('click', function startGame() {
    debugLog("Start button clicked!");

    // ── E14: Class selection gate ──────────────────────────────
    // If the player hasn't chosen a class yet, show the modal and bail.
    if (!window._classChosen) {
      if (typeof showClassModal === 'function') showClassModal();
      return;
    }
    // Reset flag so future NEW GAME clicks re-open the modal
    window._classChosen = false;

    const startScreen = document.getElementById('start-screen');
    const logDiv = document.getElementById('log');
    
    try {
      if(!startScreen) throw new Error("start-screen element not found");
      debugLog("Hiding start screen...");
      startScreen.style.display = 'none';
      
      debugLog("Stopping battle anim...");
      if(typeof stopBattleAnim === 'function') stopBattleAnim();
      
      debugLog("Initializing sound...");
      Sound.init();
      // B31 FIX: Load footstep.mp3 into AudioBuffer for higher-quality step sounds
      Sound.loadFootstep();
      if(window.WebGLFX && WebGLFX.start) WebGLFX.start();

      // Set level 0 (Tristram) immediately so any drawMap during init uses correct palette
      currentLevel = 0;

      // Initialize the Quest Engine before anything else touches quest state.
      debugLog("Initializing quest engine...");
      if(typeof _initQuestEngine === 'function') _initQuestEngine();
      
      // Initialize PlayerSprites animation system (only if real sheets loaded)
      debugLog("Initializing player sprites...");
      // PlayerSprites creates placeholders that block warrior sheet rendering.
      // Warrior sheets are loaded via asset bundle into assets.sprites[].
      // drawAvatar() in render.js handles sprite selection directly.
      if(window.PlayerSprites) {
        // Skip placeholder init - let drawAvatar() use warrior sheets from assets
        window.PlayerSprites._skip = true;
        debugLog('PlayerSprites: deferred to drawAvatar()');
      }
      
      debugLog("Resizing canvas...");
      resizeCanvas();

      // ── E14: Apply class bonuses (after setPlayerDefaults via initMap) ──
      // initMap calls setPlayerDefaults() which resets player state.
      // We apply bonuses AFTER initMap so they layer on top of defaults.
      debugLog("Initializing map...");
      currentLevel = 0; // Bug 7: always start in Tristram
      initMap(50);

      // Apply selected class bonuses
      const selClass = window._selectedClass;
      debugLog("Applying class bonus for: " + selClass);
      if (selClass === 'fighter') {
        player.startingClass = 'fighter';
        player.maxHp += 5;
        player.hp += 5;
        player.equipped.leftHand = 'sword';
        player.equipped.feet     = 'fightersBoots';   // +4 defense, +5 evade (class kit)
        if (!player.inventory) player.inventory = [];
        player.talents.fighterClass = { level: 1 };
        player.talents.wieldSwords  = { level: 1 };
        const swordName = ItemDefs.sword?.displayName ?? 'Sword';
        const bootsName = ItemDefs.fightersBoots?.displayName ?? "Fighter's Boots";
        logMsg && logMsg(`You are a Fighter! +5 HP, ${swordName} equipped, ${bootsName} worn.`);
      } else if (selClass === 'spellcaster') {
        player.startingClass = 'spellcaster';
        player.maxMp = 2;
        player.mp = 2;
        if (!player.spells) player.spells = {};
        if (!player.spells.illuminate) player.spells.illuminate = { level: 1 };
        player.equipped.chest = 'robe';
        if (!player.inventory) player.inventory = [];
        player.inventory.push(new ItemStack('robe', 1));
        player.talents.spellcasterClass = { level: 1 };
        player.talents.wieldStaffs      = { level: 1 };
        // Grant 2 ranks of Level 1 Spell — that's 2 slots; Illuminate
        // fills one, leaving room to learn one more from a tome.
        player.talents.level1Spell      = { level: 2 };
        logMsg && logMsg("You are a Spellcaster! 2 MP, Illumination known, Robe equipped.");
      } else if (selClass === 'rogue') {
        player.startingClass = 'rogue';
        player.talents.rogueClass   = { level: 1 };
        player.talents.wieldDaggers = { level: 1 };
        if (!player.inventory) player.inventory = [];
        // Place lockpicking tools in first empty inventory slot
        const inventorySlot = player.inventory.findIndex(s => !s || !s.icon);
        if (inventorySlot >= 0) {
          player.inventory[inventorySlot] = new ItemStack('lockpickingTools', 1);
        } else {
          player.inventory.push(new ItemStack('lockpickingTools', 1));
        }
        logMsg && logMsg("You are a Rogue! Lockpicking Tools in inventory.");
      }
      
      debugLog("Calculating FOV...");
      calculateFOV();
      
      debugLog("Rendering inventory...");
      renderQuickslots();
      
      debugLog("Rendering inventory...");
      renderInventory();
      
      debugLog("Drawing map...");
      drawMap();
      
      debugLog("Updating UI...");
      updateUI();

      // B5 FIX: Resume AudioContext and start background music now that the
      // user has interacted (button click). AudioContext is suspended until a
      // user gesture fires, so we must call resume() here before playMusic().
      Sound.currentTrack = null; // clear any stale guard so playMusic actually starts
      if (Sound.ctx && Sound.ctx.state === 'suspended') {
        Sound.ctx.resume().catch(() => {});
      }
      Sound.playMusic('tristram');
      
      debugLog("Game started successfully! Press ` to hide this log.");

      // Real-time Quest Ticker (v7.0.0)
      setInterval(() => {
        if(questTimer.active) {
          questTimer.time -= 0.1;
          if(questTimer.time <= 0) {
            questTimer.active = false;
            if(questTimer.callback) questTimer.callback();
          }
          drawMap(); // redraw for timer overlay
        }

        if(damageTint > 0) {
          damageTint = Math.max(0, damageTint - 5);
          drawMap();
        }
        if (window.levelUpFlash > 0) {
          window.levelUpFlash = Math.max(0, window.levelUpFlash - 0.05);
          drawMap();
        }
      }, 100);

      // Scene NPCs patrol on wall-clock time, not player turn activity.
      if(window._sceneNpcClockTicker) clearInterval(window._sceneNpcClockTicker);
      window._sceneNpcClockTicker = setInterval(() => {
        try {
          if(isDead) return;
          if(startScreen && startScreen.style.display !== 'none') return;
          if(typeof advanceSceneNPCs !== 'function') return;
          if(advanceSceneNPCs(Date.now())) drawMap();
        } catch(e) {
          if(!window._sceneNpcTickerErrorLogged) {
            window._sceneNpcTickerErrorLogged = true;
            console.error('[sceneNpcClockTicker] error:', e);
          }
        }
      }, 250);

      // B17 FIX: Continuous orb animation loop — runs at ~60fps so the WebGL
      // fluid effect animates smoothly independent of player turn events.
      // Only redraws the two small orb canvases, not the full game canvas.
      (function orbAnimLoop() {
        try {
          let orbWebGLActive = false;
          const hpFillEl = document.querySelector('#hp-orb .orb-fill');
          const mpFillEl = document.querySelector('#mp-orb .orb-fill');
          if (window.WebGLFX && WebGLFX.drawOrb) {
            const now = performance.now() / 1000;
            const hpPct = player && player.maxHp > 0 ? Math.max(0, Math.min(1, player.hp / player.maxHp)) : 0;
            const mpPct = player && player.maxMp > 0 ? Math.max(0, Math.min(1, player.mp / player.maxMp)) : 0;
            const hpOk = !!WebGLFX.drawOrb('hp-wave-canvas', hpPct, '#8b0000', now * 0.8, 'hp');
            const mpOk = !!WebGLFX.drawOrb('mp-wave-canvas', mpPct, '#1155cc', now * 0.6, 'mp');
            orbWebGLActive = hpOk || mpOk;
          }
          if(hpFillEl) hpFillEl.style.display = orbWebGLActive ? 'none' : '';
          if(mpFillEl) mpFillEl.style.display = orbWebGLActive ? 'none' : '';
        } catch(err) {
          if(!window._orbLoopErrorLogged) {
            window._orbLoopErrorLogged = true;
            console.error('[orbAnimLoop] error:', err);
          }
        }
        requestAnimationFrame(orbAnimLoop);
      })();

    } catch (err) {
      console.error("Start error:", err);
      // Show error in multiple places for visibility
      if(logDiv) logDiv.innerHTML = `<span style="color:var(--error)">Fatal Boot Error: ${err.message}</span>`;
      if(startScreen) {
        startScreen.style.display = 'flex';
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'color: red; background: black; padding: 20px; font-size: 16px; max-width: 80%; text-align: center;';
        errDiv.textContent = 'Error: ' + err.message;
        startScreen.appendChild(errDiv);
      }
    }
  });
  window.startQuestTimer = (seconds, label, callback) => {
    questTimer = { active: true, time: seconds, label: label, callback: callback };
  };

  window.stopQuestTimer = () => { questTimer.active = false; };

  // Start Screen Animation
  // === Start Screen: Sparkling Stars Animation ===
  const startScreen = document.getElementById('start-screen');
  const startCanvas = document.createElement('canvas');
  let battleAnimId = null;

  // Rotating loading quips
  const BATTLE_JOKES = [
    "Starlight glints off suspiciously sharp loot.",
    "The night sky promises treasure and probable regret.",
    "A distant owl judges your life choices.",
    "Somewhere out there, a Grue is waiting politely.",
    "A wandering merchant prepares expensive small talk.",
    "You feel lucky. This is usually a bad sign.",
    "The stars align. Your inventory does not.",
    "A faint breeze carries the smell of dungeon mold.",
    "Your next heroic plan is 80% confidence, 20% panic.",
    "The moon rises. So do your chances of bad decisions.",
  ];

  const STAR_GLYPHS = ['✦', '✧', '⋆', '·'];

  // Entities for the star animation
  let entities = [];
  let particles = [];
  let currentJoke = '';
  let jokeTimer = 0;
  let frameCount = 0;

  function initBattleScene(w, h) {
    entities = [];
    particles = [];
    for(let i = 0; i < 140; i++) {
      particles.push({
        x: Math.random() * w, y: Math.random() * h,
        vy: 0.05 + Math.random() * 0.25, vx: (Math.random() - 0.5) * 0.08,
        size: 1 + Math.random() * 1.8,
        life: 0.5 + Math.random() * 0.5,
        twinkle: Math.random() * Math.PI * 2,
        type: 'star',
        glyph: STAR_GLYPHS[Math.floor(Math.random() * STAR_GLYPHS.length)],
      });
    }
  }

  if(startScreen) {
    startCanvas.style.position = 'absolute';
    startCanvas.style.top = '0';
    startCanvas.style.left = '0';
    startCanvas.style.zIndex = '-1';
    startCanvas.style.pointerEvents = 'none'; // Don't block clicks on button
    startScreen.appendChild(startCanvas);
    const sCtx = startCanvas.getContext('2d');

    const resizeStart = () => {
      const root = document.documentElement;
      startCanvas.width = Math.max(1, Math.floor((window.visualViewport && window.visualViewport.width) || root.clientWidth || window.innerWidth || 1));
      startCanvas.height = Math.max(1, Math.floor((window.visualViewport && window.visualViewport.height) || root.clientHeight || window.innerHeight || 1));
      initBattleScene(startCanvas.width, startCanvas.height);
    };
    window.addEventListener('resize', resizeStart);
    resizeStart();

    const battleAnim = () => {
      if(startScreen.style.display === 'none') return;
      const w = startCanvas.width, h = startCanvas.height;
      frameCount++;

      // Background fade trail
      sCtx.fillStyle = 'rgba(0, 0, 0, 0.06)';
      sCtx.fillRect(0, 0, w, h);

      // Update and draw stars
      particles = particles.filter(p => {
        p.x += (p.vx ?? 0);
        p.y += (p.vy ?? 0);
        p.twinkle += 0.03 + (p.size * 0.005);
        p.life = 0.35 + (Math.sin(p.twinkle) + 1) * 0.3;
        if(p.y > h + 8) { p.y = -8; p.x = Math.random() * w; }
        if(p.x < -8) p.x = w + 8;
        if(p.x > w + 8) p.x = -8;
        sCtx.globalAlpha = p.life;
        sCtx.fillStyle = p.size > 2.2 ? '#f6e7aa' : '#d8e6ff';
        sCtx.font = `${Math.max(8, Math.floor(p.size * 5))}px monospace`;
        sCtx.textAlign = 'center';
        sCtx.textBaseline = 'middle';
        sCtx.fillText(p.glyph || '✦', p.x, p.y);
        sCtx.globalAlpha = 1;
        return true;
      });

      // Joke banner
      jokeTimer++;
      if(jokeTimer > 180 || currentJoke === '') {
        currentJoke = BATTLE_JOKES[Math.floor(Math.random() * BATTLE_JOKES.length)];
        jokeTimer = 0;
      }
      // Draw joke at bottom
      sCtx.save();
      const jokeAlpha = Math.min(1, jokeTimer / 30) * Math.min(1, (180 - jokeTimer) / 30);
      sCtx.globalAlpha = jokeAlpha;
      sCtx.font = '14px monospace';
      sCtx.fillStyle = '#d8e6ff';
      sCtx.textAlign = 'center';
      sCtx.fillText(`✨ ${currentJoke} ✨`, w / 2, h * 0.88);
      sCtx.restore();

      // Scroll text at very bottom
      sCtx.save();
      sCtx.font = '11px monospace';
      sCtx.fillStyle = '#7a8aa6';
      sCtx.textAlign = 'center';
      const scrollOffset = (frameCount * 0.5) % w;
      sCtx.fillText('LOADING STARS... PREPARING DUNGEON... ALIGNING CONSTELLATIONS... ✦ ✧ ⋆', w - scrollOffset, h * 0.95);
      sCtx.restore();

      // Slow celestial glyphs
      sCtx.save();
      sCtx.globalAlpha = 0.15 + 0.1 * Math.sin(frameCount * 0.05);
      sCtx.font = '60px sans-serif';
      sCtx.textAlign = 'center';
      sCtx.fillText('✦', w * 0.15, h * 0.3);
      sCtx.fillText('✧', w * 0.85, h * 0.4);
      sCtx.fillText('⋆', w * 0.5, h * 0.2);
      sCtx.restore();

      battleAnimId = requestAnimationFrame(battleAnim);
    };
    battleAnim();
  }

  // Clean up animation when game starts
  window.stopBattleAnim = () => {
    if(battleAnimId) { cancelAnimationFrame(battleAnimId); battleAnimId = null; }
    // Destroy dragon iframe
    const dragonFrame = document.getElementById('dragon-frame');
    if(dragonFrame) { dragonFrame.src = ''; dragonFrame.remove(); }
  };

  // Fireball targeting click handler
  const gameCanvas = document.getElementById('gameCanvas');
  if(gameCanvas) {
    function withinInteractionReach(targetX, targetY) {
      return Math.abs(targetX - player.x) <= 2 && Math.abs(targetY - player.y) <= 2;
    }

    function flashInteractionFailure(kind, idx) {
      if(kind === 'corpse' && typeof corpses !== 'undefined' && corpses[idx]) corpses[idx]._flashRed = Date.now();
      if(kind === 'item' && itemsOnGround[idx]) itemsOnGround[idx]._flashRed = Date.now();
      drawMap();
    }

    gameCanvas.addEventListener('click', (e) => {
      if(isDead) return;
      if(!window._fireballTargeting && !window._rangedTargeting) return;
      // Convert click to tile coordinates
      let rect = gameCanvas.getBoundingClientRect();
      let cx = Math.floor(VIEW_COLS / 2), cy = Math.floor(VIEW_ROWS / 2);
      let tileX = player.x + Math.floor((e.clientX - rect.left) / TILE_SIZE) - cx;
      let tileY = player.y + Math.floor((e.clientY - rect.top) / TILE_SIZE) - cy;
      if(tileX >= 0 && tileX < mapW && tileY >= 0 && tileY < mapH) {
        if(window._fireballTargeting) fireballTarget(tileX, tileY);
        else if(window._rangedTargeting) rangedWeaponTarget(tileX, tileY);
      }
    });

    // ─── Tap-to-move (mobile) ────────────────────────────────────
    //
    //  Tap a map tile → take ONE step toward it along the shortest
    //  8-way path. The user re-taps to keep moving (same input
    //  granularity as a WASD press in this turn-based game). This
    //  avoids the "auto-walk until disturbed" footgun and keeps the
    //  user steering frame-by-frame.
    //
    //  Pathfinding rules:
    //    - 8-way BFS over walkable tiles (isTileFloor and no enemy).
    //    - The TARGET tile is a goal regardless of walkability — so
    //      tapping a wall / closed door / NPC / enemy still pathfinds
    //      adjacent and the final step bumps. movePlayer() handles
    //      bump logic (combat, dialog, doors) as it does for WASD.
    //    - If no path exists, do nothing.

    // Compute the dx/dy for the first step of the shortest 8-way
    // path from (sx,sy) to (tx,ty). Returns {dx,dy} or null.
    // Tap-to-move: invisible 8-way dpad centered on the player. The
    // canvas is divided into eight 45° wedges around player center;
    // a tap in any wedge moves one step in that direction. Bump logic
    // (NPC dialog, combat, locked doors) is handled by movePlayer().
    // A tap that lands on the player tile itself is treated as no-op.
    //
    // The 8 wedge indices follow atan2 quadrants — 0=E, increases
    // clockwise (because canvas y goes down) through SE, S, SW, W,
    // NW, N, NE.
    const DPAD_DIRS = [
      { dx:  1, dy:  0 },  // 0  E
      { dx:  1, dy:  1 },  // 1  SE
      { dx:  0, dy:  1 },  // 2  S
      { dx: -1, dy:  1 },  // 3  SW
      { dx: -1, dy:  0 },  // 4  W
      { dx: -1, dy: -1 },  // 5  NW
      { dx:  0, dy: -1 },  // 6  N
      { dx:  1, dy: -1 },  // 7  NE
    ];

    gameCanvas.addEventListener('click', (e) => {
      if(isDead) return;
      // Yield to targeting handlers above — they consume the click.
      if(window._fireballTargeting || window._rangedTargeting) return;
      // Tap-to-move is a TOUCH-ONLY input affordance. On desktop,
      // clicks on the map are usually misfires while reading; the
      // keyboard owns movement. Gate the dpad behind IS_TOUCH so
      // desktop clicks do nothing here. URL ?mobile=1 enables it
      // in a desktop browser for testing.
      if(!window.IS_TOUCH) return;
      const rect = gameCanvas.getBoundingClientRect();
      const cx = Math.floor(VIEW_COLS / 2), cy = Math.floor(VIEW_ROWS / 2);
      // Player is rendered at the center tile; compute pixel offset
      // from the player's center pixel to the tap point.
      const px = (cx + 0.5) * TILE_SIZE;
      const py = (cy + 0.5) * TILE_SIZE;
      const dxPx = (e.clientX - rect.left) - px;
      const dyPx = (e.clientY - rect.top)  - py;
      // Dead-zone radius — taps within ~40% of a tile are treated as
      // "on the player" and ignored. Prevents accidental moves when
      // tapping the player to inspect / open context UI later.
      if (Math.hypot(dxPx, dyPx) < TILE_SIZE * 0.4) return;
      const angle = Math.atan2(dyPx, dxPx);     // 0 = east, +PI/2 = south
      const wedge = ((Math.round(angle * 4 / Math.PI) + 8) % 8);
      const d = DPAD_DIRS[wedge];
      movePlayer(d.dx, d.dy);
    });
    // Bug 26: Handle drag-drop of inventory items onto the map
    gameCanvas.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    gameCanvas.addEventListener('drop', (e) => {
      e.preventDefault();
      // K6: Drop equipped item onto the game canvas — place it on the ground
      {
        let raw = null;
        try { raw = e.dataTransfer.getData('text/plain'); } catch(_) {}
        if (raw) {
          let dragData = null;
          try { dragData = JSON.parse(raw); } catch(_) {}
          if (dragData && dragData.source === 'equip') {
            const icon = player.equipped[dragData.slot];
            if (icon) {
              itemsOnGround.push({ x: player.x, y: player.y, icon });
              player.equipped[dragData.slot] = null;
              logMsg(`You drop the ${ItemDef.byIcon(icon)?.displayName ?? icon} on the ground.`);
              swapEquip(-1, dragData.slot);
              updateUI();
              if (typeof renderEquipModal === 'function') renderEquipModal();
              drawMap();
            }
            return;
          }
        }
      }
      if(window.draggedItemIdx !== null && window.draggedSource === 'inv') {
        let item = inventory[window.draggedItemIdx];
        if(item) {
          itemsOnGround.push({ x: player.x, y: player.y, icon: item.icon });
          inventory[window.draggedItemIdx] = null;
          logMsg(`Dropped ${item.icon} on the ground.`);
          renderQuickslots(); updateUI();
        }
        window.draggedItemIdx = null; window.draggedSource = null;
      }
      // Loot drag: item from corpse to canvas (drop on ground)
      if(window._lootDrag) {
        let c = corpses[window._lootDrag.corpseIdx];
        if(c && c.loot && c.loot[window._lootDrag.itemIdx]) {
          let item = c.loot[window._lootDrag.itemIdx];
          itemsOnGround.push({x: player.x, y: player.y, icon: item.icon});
          c.loot.splice(window._lootDrag.itemIdx, 1);
          logMsg(`Dropped ${item.icon} on the ground.`);
          window._lootDrag = null;
          drawMap();
        }
      }
    });

    // Mouse hover detection — white outline on corpses and floor items
    gameCanvas.addEventListener('mousemove', (e) => {
      if(isDead) return;
      let rect = gameCanvas.getBoundingClientRect();
      let cx = Math.floor(VIEW_COLS / 2), cy = Math.floor(VIEW_ROWS / 2);
      let tileX = player.x + Math.floor((e.clientX - rect.left) / TILE_SIZE) - cx;
      let tileY = player.y + Math.floor((e.clientY - rect.top) / TILE_SIZE) - cy;
      let prevCorpse = window._hoverCorpseIdx;
      let prevItem = window._hoverFloorItemIdx;
      let prevCorpseReachable = window._hoverCorpseReachable;
      let prevItemReachable = window._hoverFloorItemReachable;
      window._hoverCorpseIdx = null;
      window._hoverFloorItemIdx = null;
      window._hoverCorpseReachable = false;
      window._hoverFloorItemReachable = false;
      // Check corpses
      if(typeof corpses !== 'undefined') {
        for(let i = 0; i < corpses.length; i++) {
          if(corpses[i].x === tileX && corpses[i].y === tileY) {
            window._hoverCorpseIdx = i;
            window._hoverCorpseReachable = withinInteractionReach(corpses[i].x, corpses[i].y);
            break;
          }
        }
      }
      // Check floor items
      for(let i = 0; i < itemsOnGround.length; i++) {
        if(itemsOnGround[i].x === tileX && itemsOnGround[i].y === tileY) {
          window._hoverFloorItemIdx = i;
          window._hoverFloorItemReachable = withinInteractionReach(itemsOnGround[i].x, itemsOnGround[i].y);
          break;
        }
      }
      // Only redraw if hover state changed
      if(prevCorpse !== window._hoverCorpseIdx || prevItem !== window._hoverFloorItemIdx || prevCorpseReachable !== window._hoverCorpseReachable || prevItemReachable !== window._hoverFloorItemReachable) drawMap();
    });

    gameCanvas.addEventListener('mouseleave', () => {
      window._hoverCorpseIdx = null;
      window._hoverFloorItemIdx = null;
      window._hoverCorpseReachable = false;
      window._hoverFloorItemReachable = false;
      drawMap();
    });

    // Right-click context menu on canvas — corpses, floor items, chests
    gameCanvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if(isDead) return;
      let rect = gameCanvas.getBoundingClientRect();
      let cx = Math.floor(VIEW_COLS / 2), cy = Math.floor(VIEW_ROWS / 2);
      let tileX = player.x + Math.floor((e.clientX - rect.left) / TILE_SIZE) - cx;
      let tileY = player.y + Math.floor((e.clientY - rect.top) / TILE_SIZE) - cy;
      if(tileX < 0 || tileX >= mapW || tileY < 0 || tileY >= mapH) return;

      // Ctrl+click = loot all from corpse
      let ctrlLoot = e.ctrlKey;

      // Check corpses within 2 tiles (and visible)
      if(typeof corpses !== 'undefined') {
        for(let i = 0; i < corpses.length; i++) {
          if(corpses[i].x === tileX && corpses[i].y === tileY && visible[corpses[i].y] && visible[corpses[i].y][corpses[i].x]) {
            if(!withinInteractionReach(corpses[i].x, corpses[i].y)) {
              logMsg('Too far away.');
              flashInteractionFailure('corpse', i);
              return;
            }
            if(ctrlLoot) { lootAll(i); return; }
            openLootWindow(i); return;
          }
        }
      }

      // Check chests at this tile (must be adjacent — 1 tile)
      if(theMap[tileY] && theMap[tileY][tileX] === TILES.CHEST) {
        let chestKey = `${tileX},${tileY}`;
        let state = chestStates[chestKey];
        if(state === -1) {
            // Mimic! Transform into monster
            chestStates[chestKey] = 0; // reset state
            theMap[tileY][tileX] = TILES.FLOOR;
            spawnNpc(enemies, tileX, tileY, 'mimic', { stats: {...MONSTER_DEF['mimic']}, isMimic: true });
            logMsg("<span style='color:var(--error)'>📦 The chest SNAPS its lid open and reveals jagged teeth! It's a MIMIC!</span>");
            Sound.playSample('mimic_reveal', 0.8);
            Sound.playSample('mimic_laugh', 0.6);
            addFloatingText(tileX, tileY, '📦', '#f00', 22);
            drawMap(); updateUI();
            // Start combat immediately
            let mIdx = enemies.length - 1;
            if(typeof meleeAttack === 'function') {
              // Player is adjacent, auto-attack
              setTimeout(() => {
                if(enemies[mIdx] && enemies[mIdx].stats.hp > 0) {
                  // Mimic attacks first as surprise
                  if(typeof monsterAttack === 'function') monsterAttack(mIdx);
                }
              }, 500);
            }
            return;
        }
        if((state ?? 0) === 0) {
          // Check if player has a key
          let hasKey = inventory.some(i => i && i.itemName === 'key') || (player.inventory && player.inventory.some(i => i && i.itemName === 'key'));
          if(hasKey) {
            // Use key from inventory first, then inventory
            let keyIdx = inventory.findIndex(i => i && i.itemName === 'key');
            if(keyIdx !== -1) {
              inventory[keyIdx].qty--;
              if(inventory[keyIdx].qty <= 0) inventory[keyIdx] = null;
            } else {
              let inventoryIdx = player.inventory.findIndex(i => i && i.itemName === 'key');
              if(inventoryIdx !== -1) {
                player.inventory[inventoryIdx].qty--;
                if(player.inventory[inventoryIdx].qty <= 0) player.inventory[inventoryIdx] = null;
              }
            }
            chestStates[chestKey] = 2; // opened
            theMap[tileY][tileX] = TILES.FLOOR; // replace with floor
            logMsg("<span style='color:var(--success)'>🗝️ You unlock the chest!</span>");
            Sound.chestOpen();
            let loot = generateLoot('chest', null);
            if(loot.length > 0) {
              createCorpse(tileX, tileY, 'chest', {icon:'📦'}, loot);
            } else {
              logMsg("<span style='color:#888'>The chest is empty.</span>");
            }
            renderQuickslots(); drawMap(); updateUI();
          } else {
            logMsg("The chest is locked. You need a key. (Right-click to open)");
          }
          return;
        }
      }

      // Check floor items within 2 tiles
      for(let i = 0; i < itemsOnGround.length; i++) {
        if(itemsOnGround[i].x === tileX && itemsOnGround[i].y === tileY) {
          if(!withinInteractionReach(itemsOnGround[i].x, itemsOnGround[i].y)) {
            logMsg('Too far away.');
            flashInteractionFailure('item', i);
            return;
          }
          showFloorItemMenu(i, e.clientX, e.clientY);
          return;
        }
      }
    });

    // Floor item context menu
    window.showFloorItemMenu = (itemIdx, screenX, screenY) => {
      let item = itemsOnGround[itemIdx];
      if(!item) return;
      let existing = document.getElementById('floor-ctx-menu');
      if(existing) existing.remove();
      let def = item.def;
      let name = def ? def.name : item.icon;
      let menu = document.createElement('div');
      menu.id = 'floor-ctx-menu';
      menu.style.cssText = `position:fixed; z-index:9999; background:rgba(29,27,32,0.95); border:2px solid var(--secondary);
        border-radius:6px; padding:4px 0; min-width:120px; box-shadow:0 4px 12px rgba(0,0,0,0.5);`;
      menu.innerHTML = `<div style="padding:4px 12px; color:var(--primary); font-size:11px; border-bottom:1px solid #444; margin-bottom:2px;">${item.icon} ${name}</div>
        <div style="padding:6px 12px; cursor:pointer; font-size:12px;" onmouseover="this.style.background='#4A4458'" onmouseout="this.style.background=''"
          onclick="pickupFloorItem(${itemIdx}); document.getElementById('floor-ctx-menu').remove();">Pick Up</div>`;
      menu.style.left = Math.min(screenX, window.innerWidth - 130) + 'px';
      menu.style.top = Math.min(screenY, window.innerHeight - 80) + 'px';
      document.body.appendChild(menu);
      setTimeout(() => {
        document.addEventListener('click', function close() { menu.remove(); document.removeEventListener('click', close); });
      }, 50);
    };

    window.pickupFloorItem = (itemIdx) => {
      let item = itemsOnGround[itemIdx];
      if(!item) return;
      const handleCupcakePickup = (icon) => {
        if(icon !== '🧁') return;
        if(!window._grokCupcakePickups) window._grokCupcakePickups = 0;
        window._grokCupcakePickups++;
        if(window._grokCupcakePickups === 1) {
          logMsg("<span style='color:#f88'>🧌 Grok: 'Hey!!! I made those cupcakes for Bruce, not for you!!!'</span>");
          if(typeof playVoiceClip === 'function') playVoiceClip('voice_orc_cupcake_1');
        } else {
          logMsg("<span style='color:#f88'>🧌 Grok: 'Hey! Aren't you fat enough already? Leave some for the Grues!'</span>");
          if(typeof playVoiceClip === 'function') playVoiceClip('voice_orc_cupcake_2');
        }
      };
      if(!withinInteractionReach(item.x, item.y)) {
        logMsg('Too far away.');
        flashInteractionFailure('item', itemIdx);
        return;
      }
      let slot = inventory.findIndex(s => s === null);
      if(slot !== -1) {
        inventory[slot] = ItemStack.fromIcon(item.icon, 1);
        itemsOnGround.splice(itemIdx, 1);
        logMsg(`Picked up ${item.icon}`);
        Sound.clink();
        handleCupcakePickup(item.icon);
      } else {
        let placed = tryPlaceInInventory(item);
        if(placed) {
          itemsOnGround.splice(itemIdx, 1);
          logMsg(`Picked up ${item.icon} (to inventory)`);
          Sound.clink();
          handleCupcakePickup(item.icon);
        } else {
          logMsg("No room!");
          flashInteractionFailure('item', itemIdx);
        }
      }
      renderQuickslots(); renderInventory(); updateUI(); drawMap();
    };
  }

  // === #9: Configurable Keybindings ===
  // Default keybindings for movement and action keys.
  // Keys are stored in window._keybindings and saved/loaded with the save file.
  // Settings chords use ^x then a letter (2-second window after Ctrl+X).
  window._keybindings = window._keybindings || {
    moveNorth:  ['w', 'arrowup'],
    moveSouth:  ['s', 'arrowdown'],
    moveWest:   ['a', 'arrowleft'],
    moveEast:   ['d', 'arrowright'],
    attack:     [' '],
    rest:       ['z'],
    inventory:      ['i'],
    equip:      ['e'],
    stats:      ['c'],
    magic:      ['m'],
    quests:     ['q'],
    achieve:    ['y'],
    spellPri:   ['f'],
    spellSec:   ['g'],
    shadowstep: ['b'],
    listen:     ['l'],
    kneel:      ['k'],
  };

  // Check if a key matches a binding
  function keyMatches(bindingName, key) {
    const kb = window._keybindings[bindingName];
    return kb && kb.some(k => k === key.toLowerCase());
  }

  // Update a keybinding (from settings UI)
  window.setKeybinding = (bindingName, newKey) => {
    if(!window._keybindings[bindingName]) return;
    window._keybindings[bindingName] = [newKey.toLowerCase()];
    logMsg(`Keybinding ${bindingName} set to ${newKey}`);
  };

  window.addEventListener('keydown', (e) => {
    if(e.key === 'Shift') player.isRunning = true;
    if(e.key === 'CapsLock') { player.isRunning = !player.isRunning; player._capsLockRun = player.isRunning; }

    // Ctrl+X chord system
    // Lowercase: menu/navigation chords
    // Uppercase S: save (keeps save chord without conflicting with settings)
    if(e.ctrlKey && e.key === 'x') {
      e.preventDefault();
      window._ctrlXMode = true;
      if(window._ctrlXTimer) clearTimeout(window._ctrlXTimer);
      window._ctrlXTimer = setTimeout(() => { window._ctrlXMode = false; }, 2000);
      window._ctrlXConsumedUntil = Date.now() + 2000;
      return;
    }
    if(window._ctrlXMode) {
      window._ctrlXMode = false;
      if(window._ctrlXTimer) { clearTimeout(window._ctrlXTimer); window._ctrlXTimer = null; }
      window._ctrlXConsumedUntil = Date.now() + 250;
      if(e.key === 'S') {
        e.preventDefault();
        if(typeof saveGame === 'function') saveGame();
        return;
      }
      if(e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        if(typeof loadGame === 'function') loadGame();
        return;
      }
      if(e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        if(typeof toggleModal === 'function') toggleModal('debug-modal');
        return;
      }
      if(e.key === 's') {
        e.preventDefault();
        if(typeof toggleModal === 'function') toggleModal('settings-modal');
        if(typeof initSettingsUI === 'function') initSettingsUI();
        return;
      }
      if(e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if(typeof startNewGame === 'function') startNewGame();
        return;
      }
      if(e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        if(typeof toggleModal === 'function') toggleModal('achieve-modal');
        return;
      }
      if(e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        if(typeof toggleModal === 'function') toggleModal('quest-modal');
        return;
      }
      if(e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        if(typeof toggleModal === 'function') toggleModal('stats-modal');
        return;
      }
    }

    if(e.key === 'Escape') {
       // Close store/shop overlay first
       const overlay = document.getElementById('overlay');
       if(overlay && overlay.style.display === 'flex') {
         // B3: Use hideOverlay() so voice audio is stopped
         if(typeof hideOverlay === 'function') { hideOverlay(); } else { overlay.style.display = 'none'; }
         return;
       }
       // Close Astrochicken modal
       if(document.getElementById('astrochicken-modal')) {
         closeAstrochicken();
         return;
       }
       // Close any open draggable modals
       document.querySelectorAll('.draggable-modal').forEach(m => m.style.display = 'none');
    }
  });
  window.addEventListener('keyup', (e) => {
    if(e.key === 'Shift' && !player._capsLockRun) player.isRunning = false;
    // #6: Diagonal movement — track held keys
    window._heldKeys = window._heldKeys || new Set();
    window._heldKeys.delete(e.key.toLowerCase());
  });

  // #6: Diagonal movement key tracking
  window._heldKeys = new Set();
  window._diagLastMove = 0;

  document.addEventListener('keydown', function(event) {
    if(window._ctrlXConsumedUntil && Date.now() <= window._ctrlXConsumedUntil) return;
    if(document.getElementById('start-screen').style.display !== 'none') { console.log('Key blocked: start screen visible'); return; }
    // Bug 11: Don't intercept keys when console input is focused
    if(document.activeElement && (document.activeElement.id === 'console-input' || document.activeElement.id === 'debug-item-search')) return;
    // Close modals with Enter
    if(event.key === 'Enter' && document.getElementById('overlay').style.display === 'flex') {
      hideOverlay();
      return;
    }

    // Bug 2: Suppress game keys while console is active
    if(window._consoleActive) return;
    
    if(document.getElementById('overlay').style.display === 'flex') { console.log('Key blocked: overlay visible'); return; }
    
    // Console ` key handling is now done in the toggle handler above
    // (no longer creates a new input each time)
    
    // Toggle keybind hints with "?"
    if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        console.log('? key pressed, toggling show-keybinds');
        event.preventDefault();
        document.body.classList.toggle('show-keybinds');
        return;
    }

    Sound.init();

    let key = event.key.toLowerCase();

    // #6: Track held keys for diagonal movement
    window._heldKeys = window._heldKeys || new Set();
    window._heldKeys.add(key);

    // Movement Rate Limiting
    const now = Date.now();
    let moveDelay = player.statusType === 'sugar' ? CONSTANTS.SUGAR_RUSH_SPEED : CONSTANTS.NORMAL_SPEED;
    const speedFactor = (typeof player.speedMod === 'number' && player.speedMod > 0) ? player.speedMod : 1;
    moveDelay = Math.round(moveDelay / speedFactor);
    if(player.isRunning) moveDelay = Math.max(50, moveDelay - 100);

    const isMovementKey = keyMatches('moveNorth', key) || keyMatches('moveSouth', key) ||
                          keyMatches('moveWest', key) || keyMatches('moveEast', key);
    if(isMovementKey) {
      if(now - lastMoveTime < moveDelay) return;

      // #6: Diagonal movement — check if two adjacent direction keys held simultaneously
      const held = window._heldKeys;
      const heldN = [...held].some(k => keyMatches('moveNorth', k));
      const heldS = [...held].some(k => keyMatches('moveSouth', k));
      const heldW = [...held].some(k => keyMatches('moveWest', k));
      const heldE = [...held].some(k => keyMatches('moveEast', k));
      if(heldN && heldW) { lastMoveTime = now; movePlayer(-1, -1); return; }
      if(heldN && heldE) { lastMoveTime = now; movePlayer(1, -1); return; }
      if(heldS && heldW) { lastMoveTime = now; movePlayer(-1, 1); return; }
      if(heldS && heldE) { lastMoveTime = now; movePlayer(1, 1); return; }

      lastMoveTime = now;
      if(player.statusType === 'freeze') { logMsg("You are frozen and cannot move!"); return; }
      if(player.statusType === 'dizzy') {
        const dirs = ['movenorth','movesouth','movewest','moveeast'];
        const rdir = dirs[Math.floor(Math.random() * dirs.length)];
        if(rdir === 'movenorth') { movePlayer(0, -1); return; }
        if(rdir === 'movesouth') { movePlayer(0, 1); return; }
        if(rdir === 'movewest')  { movePlayer(-1, 0); return; }
        if(rdir === 'moveeast')  { movePlayer(1, 0); return; }
      }
    }

    if(keyMatches('moveNorth', key)) movePlayer(0, -1);
    else if(keyMatches('moveSouth', key)) movePlayer(0, 1);
    else if(keyMatches('moveWest', key)) movePlayer(-1, 0);
    else if(keyMatches('moveEast', key)) movePlayer(1, 0);
    else if(key === 'escape') toggleMenu();
    else if(keyMatches('inventory', key)) toggleModal('inventory-modal');
    else if(keyMatches('equip', key)) toggleModal('equip-modal');
    else if(keyMatches('stats', key)) toggleModal('stats-modal');
    else if(keyMatches('magic', key)) toggleModal('magic-modal');
    else if(keyMatches('achieve', key)) toggleModal('achieve-modal');
    else if(keyMatches('quests', key)) toggleModal('quest-modal');
    else if(keyMatches('rest', key)) restPlayer();
    else if(keyMatches('attack', key)) meleeAttack();
    else if(keyMatches('spellPri', key)) castEquippedSpell();
    else if(keyMatches('spellSec', key)) castSecondarySpell();
    else if(keyMatches('shadowstep', key)) shadowstep();
    else if(keyMatches('listen', key)) listenAction();
    else if(keyMatches('kneel', key)) kneelAction();

    let num = parseInt(key);
    if(!isNaN(num)) { let idx = num === 0 ? 9 : num - 1; handleItemClick(idx); }
  });

  // === Boot Sequence ===
  // Initialization now happens via Enter the Dungeon button
