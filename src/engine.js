  /*
  ENGINE MODULE – CORE GAME LOOPS, AI, AND COMBAT
  ================================================
  This module contains the central game engine that drives turn‑based progression,
  artificial intelligence, combat resolution, and Monty Python‑themed event sequences.
  It is the heartbeat of the roguelike, orchestrating player actions, enemy behaviors,
  and world simulation.

  Key responsibilities:
  1. Turn advancement (advanceTurn) – handles hunger, exhaustion, healing, monster AI, spawns
  2. Combat system (doCombat, monsterAttack) – damage calculation, floating text, sound cues
  3. Special enemy logic – French Taunter cow‑throwing, Thief pickpocketing, Black Knight limb loss
  4. Death & resurrection – crystal shatter mechanic, death screen
  5. Level‑up mechanics – experience thresholds, fireworks visual effects
  6. Monty Python sequences – Bridge of Death trial, Roc capture/escape, Witch Trial
  7. Player movement (movePlayer) – collision, tile effects, bridge keeper encounter

  The functions here are called from input.js (movePlayer, restPlayer), from the UI
  (combat clicks), and from the game's own turn‑based clock (advanceTurn). They update
  the global player, enemies, itemsOnGround, and activeEffects arrays.
*/
// === Core Loops & AI ===
  let chestStates = {};
  let snoreLoop = null;
  let sleepHealLoop = null;
  window.corpses = [];
  window.autoLootEnabled = false;
  window.floorInteractItems = [];

  // === Corpse & Loot System ===
  let CORPSE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes wall-clock

    let CORPSE_WALK_MESSAGES = [
    "You step on the corpse. Something squelches. Best not to think about it.",
    "An ear falls off the corpse as you pass. You pretend not to notice.",
    "You accidentally kick the corpse. It makes a sound like a wet accordion.",
    "The corpse doesn't appreciate being stepped on. Not that it can complain.",
    "You walk over the corpse with the grace of someone who has seen too much.",
    "Something crunches underfoot. You hope it was just a rib.",
    "The corpse's hand twitches. Just settling. Probably.",
    "You step over the corpse and try to maintain your dignity.",
    "A small bone pops out and rolls away. Charming.",
    "You walk on the corpse. It's... squishy. Very squishy.",
  ];

  function generateLoot(enemyType, enemyStats) {
    let loot = [];
    // B4 FIX: Farm birds (chicken, duck) never drop gold
    const FARM_BIRD_TYPES = new Set(['chicken', 'duck']);
    // Gold: 50% chance, always drops alongside other items (skipped for farm birds)
    if(!FARM_BIRD_TYPES.has(enemyType) && Math.random() < 0.5) {
      let goldAmt = 5 + Math.floor(Math.random() * 10 * Math.max(1, currentLevel));
      loot.push({ icon: '🪙', qty: goldAmt });
    }
    // 1-3 item drops per corpse
    let itemCount = 1 + Math.floor(Math.random() * 3);
    let itemPool = [
      {icon:'🧪', weight:15}, {icon:'🍕', weight:10}, {icon:'🍖', weight:8},
      {icon:'🧀', weight:7}, {icon:'🗝️', weight:5}, {icon:'🗡️', weight:5},
      {icon:'🛡️', weight:4}, {icon:'🕯️', weight:8}, {icon:'📃', weight:5},
      {icon:'🎒', weight:3}, {icon:'🥤', weight:5}, {icon:'💍', weight:2},
    ];
    let junkPool = ['💇','🪨','🧿','🧵','🦷💀','🧲','🟠','🫧','🪶','🔘','🪡','🫘','🦴','📎','🧶','🪱'];
    let totalWeight = itemPool.reduce((s,i) => s + i.weight, 0);
    for(let i = 0; i < itemCount; i++) {
      let roll = Math.random();
      if(roll < 0.3) {
        // Junk
        loot.push({icon: junkPool[Math.floor(Math.random() * junkPool.length)], qty: 1});
      } else if(roll < 0.5) {
        // Nothing extra
      } else {
        // Weighted item from pool
        let r = Math.random() * totalWeight;
        for(let entry of itemPool) {
          r -= entry.weight;
          if(r <= 0) {
            let def = ITEM_DEF[entry.icon];
            if(def && def.minLevel && player.level < def.minLevel) {
              loot.push({icon:'🧪', qty:1}); // fallback
            } else {
              loot.push({icon: entry.icon, qty: 1});
            }
            break;
          }
        }
      }
    }
    // Bag drop: 8% chance, level-appropriate
    if(Math.random() < 0.08) {
      loot.push({icon: randomBag(player.level), qty: 1});
    }
    // E10: Beach Portal Scroll drops on level 7+
    if(currentLevel >= 7 && Math.random() < 0.03) {
      const portalIdx = loot.findIndex(l => l.icon === '🌀');
      if(portalIdx !== -1 && Math.random() < 0.5) {
        loot[portalIdx] = {icon:'📜🏖️', qty:1};
      } else if(Math.random() < 0.02) {
        loot.push({icon:'📜🏖️', qty:1});
      }
    }
    return loot;
  }

  function createCorpse(x, y, enemyType, enemyStats, loot) {
    let name = (MONSTER_DEF[enemyType] && MONSTER_DEF[enemyType].name) || enemyType;
    let icon = enemyStats.icon || '💀';
    corpses.push({
      x, y,
      name: name,
      icon: icon,
      loot: loot,
      createdAt: Date.now(),
      isBones: false
    });
  }

  function expireCorpses() {
    let now = Date.now();
    for(let i = corpses.length - 1; i >= 0; i--) {
      let c = corpses[i];
      if(!c.isBones && now - c.createdAt > CORPSE_EXPIRY_MS) {
        c.isBones = true;
        c.icon = 'BONES_PILE';
        c.name = 'pile of bones';
        // Loot drops to floor
        if(c.loot && c.loot.length > 0) {
          c.loot.forEach(item => {
            if(item.icon === '🪙') {
              changeGold(item.qty);
            } else {
              itemsOnGround.push({ x: c.x, y: c.y, icon: item.icon });
            }
          });
          c.loot = [];
        }
      }
    }
  }

  // Auto-loot: immediately dump corpse loot into inventory
  function autoLootCorpse(corpseIdx) {
    let c = corpses[corpseIdx];
    if(!c || !c.loot || c.loot.length === 0) return;
    let remaining = [];
    c.loot.forEach(item => {
      if(item.icon === '🪙') {
        changeGold(item.qty, { x: c.x, y: c.y, floatText: true });
      } else {
        let placed = false;
        let def = ITEM_DEF[item.icon];
        if(def && def.stackable) {
          let maxStack = def.maxStack || 10;
          let stackSlot = inventory.find(s => s && s.icon === item.icon && (s.qty || 1) < maxStack);
          if(stackSlot) {
            let can = maxStack - (stackSlot.qty || 1);
            let add = Math.min(can, item.qty || 1);
            stackSlot.qty = (stackSlot.qty || 1) + add;
            item.qty = (item.qty || 1) - add;
            placed = (item.qty || 0) <= 0;
          }
        }
        // Try inventory
        let slot = inventory.findIndex(s => s === null);
        if(!placed && slot !== -1) {
          inventory[slot] = { icon: item.icon, qty: item.qty || 1 };
          placed = true;
        }
        // Try pouch and bags
        if(!placed) placed = tryPlaceInPouch(item);
        if(!placed) remaining.push(item);
      }
    });
    c.loot = remaining;
    if(remaining.length > 0) {
      logMsg(`Auto-loot: some items couldn't fit, left on corpse.`);
    }
    renderInventory(); renderPouch(); updateUI();
  }

  // Try to place an item in pouch or inside a bag
  function tryPlaceInPouch(item) {
    const def = ITEM_DEF[item.icon] || { stackable:false };
    const qty = item.qty || 1;

    // Stack in existing pouch slots first
    if(def.stackable) {
      const maxStack = def.maxStack || 10;
      for(let i = 0; i < pouch.length; i++) {
        const s = pouch[i];
        if(s && s.icon === item.icon && (s.qty || 1) < maxStack) {
          const can = maxStack - (s.qty || 1);
          const add = Math.min(can, qty);
          s.qty = (s.qty || 1) + add;
          item.qty = qty - add;
          if(item.qty <= 0) return true;
          break;
        }
      }
    }

    // Direct pouch slot
    let pSlot = pouch.findIndex(s => s === null);
    if(pSlot !== -1) {
      pouch[pSlot] = { icon: item.icon, qty: item.qty || 1 };
      return true;
    }
    // Inside a bag
    for(let i = 0; i < pouch.length; i++) {
      let bag = pouch[i];
      if(bag && ITEM_DEF[bag.icon] && ITEM_DEF[bag.icon].type === 'bag') {
        if(!bag.contents) bag.contents = new Array(ITEM_DEF[bag.icon].bagSlots || 3).fill(null);
        if(def.stackable) {
          const maxStack = def.maxStack || 10;
          for(let bi = 0; bi < bag.contents.length; bi++) {
            const bs = bag.contents[bi];
            if(bs && bs.icon === item.icon && (bs.qty || 1) < maxStack) {
              const can = maxStack - (bs.qty || 1);
              const add = Math.min(can, item.qty || 1);
              bs.qty = (bs.qty || 1) + add;
              item.qty = (item.qty || 1) - add;
              if((item.qty || 0) <= 0) return true;
            }
          }
        }
        let emptySlot = bag.contents.findIndex(s => s === null);
        if(emptySlot !== -1) {
          bag.contents[emptySlot] = { icon: item.icon, qty: item.qty || 1 };
          return true;
        }
      }
    }
    return false;
  }

  // Open loot window for a corpse
  window.openLootWindow = function(corpseIdx) {
    let c = corpses[corpseIdx];
    if(!c) return;
    if(!c.loot || c.loot.length === 0) {
      logMsg(`The ${c.name} has nothing on it.`);
      return;
    }

    let html = `<h2>${c.icon} ${c.name}</h2>`;
    if(c.buskerJoke) {
      html += `<p style="color:var(--warning)">There is an accordion here, which would have been more useful before its owner became a dungeon floor ornament.</p>`;
      html += `<p style="color:#888; font-size:11px;">A dead busker is, to be fair, the ideal customer for a dungeon music career: no complaints, no income, and no encores.</p>`;
    }
    // INT > 20 warning
    if(player.stats.int > 20) {
      let nearEnemy = enemies.find(e => Math.abs(e.x - c.x) <= 3 && Math.abs(e.y - c.y) <= 3);
      if(nearEnemy) {
        html += `<p style="color:var(--warning); font-size:11px;">⚠️ Your keen senses warn you: a ${nearEnemy.type} lurks nearby. Loot carefully!</p>`;
      }
    }
    html += `<p style="color:#888; font-size:11px;">Drag items to inventory or click Loot All (Ctrl+Click for quick loot)</p>`;
    html += `<div id="loot-grid" style="display:grid; grid-template-columns: repeat(${Math.min(c.loot.length, 6)}, 1fr); gap:4px; margin:10px 0;">`;

    c.loot.forEach((item, idx) => {
      let def = ITEM_DEF[item.icon];
      let name = def ? def.name : item.icon;
      let displayQty = (item.icon === '🪙') ? `${item.qty}g` : (item.qty > 1 ? `x${item.qty}` : '');
      html += `<div draggable="true" id="loot-item-${idx}"
        ondragstart="window._lootDrag={corpseIdx:${corpseIdx},itemIdx:${idx}}; window.draggedSource='loot'; window.draggedItemIdx=${idx};"
        ondragend="window._lootDrag=null; window.draggedSource=null; window.draggedItemIdx=null;"
        style="background:var(--surface-container); border-radius:6px; padding:8px; text-align:center; cursor:grab; min-width:44px;"
        title="${name}">
        <div style="font-size:22px;">${item.icon}</div>
        <div style="font-size:10px; color:#aaa;">${displayQty}</div>
        <button onclick="lootItem(${corpseIdx},${idx})" style="font-size:9px; padding:1px 4px; margin-top:2px; width:100%;">Take</button>
      </div>`;
    });

    html += `</div>`;
    html += `<div style="display:flex; gap:8px; margin-top:8px;">
      <button onclick="lootAll(${corpseIdx})" style="flex:1; background:var(--success); color:#000; font-weight:bold;">Loot All</button>
      <button onclick="hideOverlay()" style="flex:1;">Leave</button>
    </div>`;

    document.getElementById('modal-content').innerHTML = html;
    showOverlay();
  };

  // Loot all from corpse
  window.lootAll = function(corpseIdx) {
    let c = corpses[corpseIdx];
    if(!c || !c.loot) return;
    let remaining = [];
    let didLoot = false;
    c.loot.forEach(item => {
      if(item.icon === '🪙') {
        changeGold(item.qty, { x: c.x, y: c.y, floatText: true });
        didLoot = true;
      } else {
        let slot = inventory.findIndex(s => s === null);
        if(slot !== -1) {
          inventory[slot] = { icon: item.icon, qty: item.qty || 1 };
          didLoot = true;
        } else {
          let placed = tryPlaceInPouch(item);
          if(placed) { didLoot = true; }
          else remaining.push(item);
        }
      }
    });
    c.loot = remaining;
    if(didLoot && (!c.loot || !c.loot.some(item => item.icon === '🪙'))) Sound.clink();
    if(remaining.length > 0) {
      logMsg("Inventory full! Some items remain on the corpse.");
      // Red flash on corpse
      c._flashRed = Date.now();
    } else {
      logMsg(`Looted everything from the ${c.name}.`);
    }
    hideOverlay();
    renderInventory(); renderPouch(); updateUI(); drawMap();
  };

  // Take single item from corpse
  window.lootItem = function(corpseIdx, itemIdx) {
    let c = corpses[corpseIdx];
    if(!c || !c.loot || !c.loot[itemIdx]) return;
    let item = c.loot[itemIdx];
    if(item.icon === '🪙') {
      changeGold(item.qty, { x: c.x, y: c.y, floatText: true });
      c.loot.splice(itemIdx, 1);
    } else {
      let slot = inventory.findIndex(s => s === null);
      if(slot !== -1) {
        inventory[slot] = { icon: item.icon, qty: item.qty || 1 };
        c.loot.splice(itemIdx, 1);
        Sound.clink();
      } else {
        let placed = tryPlaceInPouch(item);
        if(placed) {
          c.loot.splice(itemIdx, 1);
          Sound.clink();
        } else {
          logMsg("No room!");
          c._flashRed = Date.now();
          return;
        }
      }
    }
    renderInventory(); renderPouch(); updateUI();
    if(c.loot.length > 0) openLootWindow(corpseIdx);
    else { hideOverlay(); drawMap(); }
  };

  // === Level Cache System ===
  // Saves/restores map state so stairs connect properly when backtracking.
  function _saveLevelToCache(level) {
    levelCache[level] = {
      theMap: theMap.map(row => row.slice()),
      explored: explored.map(row => row.slice()),
      darkMap: darkMap.map(row => row.slice()),
      enemies: JSON.parse(JSON.stringify(enemies)),
      itemsOnGround: JSON.parse(JSON.stringify(itemsOnGround)),
      corpses: JSON.parse(JSON.stringify(corpses)),
      mapW: mapW,
      mapH: mapH,
      chestStates: JSON.parse(JSON.stringify(chestStates)),
      scene: currentScene,
      customState: {
        swordmasterMazeActive: !!window._swordmasterMazeActive,
        swordmasterMazeBounds: window._swordmasterMazeBounds ? JSON.parse(JSON.stringify(window._swordmasterMazeBounds)) : null,
        eagleDoor: window._eagleDoor ? JSON.parse(JSON.stringify(window._eagleDoor)) : null,
        eagleCragBounds: window._eagleCragBounds ? JSON.parse(JSON.stringify(window._eagleCragBounds)) : null,
        eagleSkyTiles: window._eagleSkyTiles ? JSON.parse(JSON.stringify(window._eagleSkyTiles)) : null,
        eagleCragEntered: !!window._eagleCragEntered,
        eagleRevealShown: !!window._eagleRevealShown
      }
    };
  }

  function _restoreLevelFromCache(level) {
    const cached = levelCache[level];
    if(!cached) return false;
    
    mapW = cached.mapW;
    mapH = cached.mapH;
    theMap = cached.theMap.map(row => row.slice());
    explored = cached.explored.map(row => row.slice());
    darkMap = cached.darkMap.map(row => row.slice());
    visible = Array(mapH).fill().map(() => Array(mapW).fill(false));
    enemies.length = 0;
    cached.enemies.forEach(e => enemies.push(e));
    itemsOnGround.length = 0;
    cached.itemsOnGround.forEach(i => itemsOnGround.push(i));
    corpses.length = 0;
    if(cached.corpses) cached.corpses.forEach(c => corpses.push(c));
    chestStates = JSON.parse(JSON.stringify(cached.chestStates));
    currentScene = cached.scene;
    let custom = cached.customState || {};
    window._swordmasterMazeActive = !!custom.swordmasterMazeActive;
    window._swordmasterMazeBounds = custom.swordmasterMazeBounds || null;
    window._eagleDoor = custom.eagleDoor || null;
    window._eagleCragBounds = custom.eagleCragBounds || null;
    window._eagleSkyTiles = custom.eagleSkyTiles || null;
    window._eagleCragEntered = !!custom.eagleCragEntered;
    window._eagleRevealShown = !!custom.eagleRevealShown;
    return true;
  }

  function isEagleSkyTile(x, y) {
    return !!(window._eagleSkyTiles && window._eagleSkyTiles[`${x},${y}`]);
  }

  function showWorldModal(title, bodyHtml) {
    let m = document.getElementById('modal-content');
    m.innerHTML = `<h2>${title}</h2>${bodyHtml}<button onclick="hideOverlay()" style="margin-top:12px;">Continue</button>`;
    showOverlay();
  }

  function modalPortraitHTML(spriteKey, fallbackEmoji) {
    const raw = window.assets && window.assets.sprites && window.assets.sprites[spriteKey];
    const src = (typeof raw === 'string') ? raw : (raw && raw.src ? raw.src : null);
    if(src) {
      return `<img src="${src}" style="width:200px;height:200px;object-fit:cover;border-radius:12px;border:2px solid var(--border,#444);display:block;margin:0 auto 8px;" alt="">`;
    }
    return `<p style="font-size:60px; margin:5px 0;">${fallbackEmoji || ''}</p>`;
  }

  function lowlyPirateModalSprite(enemy) {
    if(!enemy._piratePortraitIdx) enemy._piratePortraitIdx = 1 + Math.floor(Math.random() * 5);
    return `npc_lowly_pirate_${enemy._piratePortraitIdx}`;
  }

  function playRandomVoice(prefix, count) {
    if(!(typeof Sound !== 'undefined' && Sound.playVoice)) return;
    const idx = Math.floor(Math.random() * Math.max(1, count || 1));
    Sound.playVoice(`${prefix}${idx}`);
  }

  function enterBackgroundScene(sceneName, spawn) {
    _saveLevelToCache(currentLevel);
    currentScene = sceneName;
    initMap(50);
    if(spawn) {
      player.x = spawn.x;
      player.y = spawn.y;
    }
    calculateFOV();
    drawMap();
    updateUI();
  }

  function _placePlayerAtStair(stairTile) {
    // Find the matching stair tile on the current map
    for(let y = 0; y < mapH; y++) {
      for(let x = 0; x < mapW; x++) {
        if(theMap[y][x] === stairTile) {
          player.x = x;
          player.y = y;
          return;
        }
      }
    }
    // Fallback: if no matching stair found, stay where initMap placed us
  }

  // Restart game without reloading page (preserves loaded assets)
  window.restartGame = function() {
    setPlayerDefaults();
    
    // Reset global state
    isDead = false;
    currentLevel = 0;
    currentScene = 'town'; // Bug 7: start in Tristram
    levelCache = {};
    enemies.length = 0;
    itemsOnGround.length = 0;
    corpses.length = 0;
    chestStates = {};
    lightTurns = 0;
    floatingTexts.length = 0;
    activeEffects.length = 0;
    damageTint = 0;
    window._sharkBossSpawned = false;
    window._cainHealedThisVisit = false; // E6: reset Cain heal on new game
    window._activeBombs = []; // E16: reset active bombs on new game
    
    // Reset inventory and pouch
    for(let i = 0; i < inventory.length; i++) inventory[i] = null;
    for(let i = 0; i < pouch.length; i++) pouch[i] = null;
    
    // Close overlay
    hideOverlay();
    
    // Re-init quest engine
    if(typeof _initQuestEngine === 'function') _initQuestEngine();
    
    // Generate fresh map
    initMap(50);
    calculateFOV();
    renderInventory();
    renderPouch();
    drawMap();
    updateUI();
    
    logMsg("<span style='color:var(--success)'>Welcome back, adventurer. A new journey begins...</span>");
  };

  function advanceSceneNPCs(nowMs = Date.now()) {
    let moved = false;
    // Sheep following logic — move toward _followTarget
    enemies.forEach(e => {
      if(!e || !e._followTarget) return;
      const target = enemies.find(t => t && t.type === e._followTarget);
      if(!target) return;
      const dist = Math.hypot(e.x - target.x, e.y - target.y);
      if(dist < 1.5) return; // close enough
      const dx = Math.sign(target.x - e.x);
      const dy = Math.sign(target.y - e.y);
      // Try to move toward target
      const dirs = [{dx,dy},{dx,dy:0},{dx:0,dy}].sort(() => Math.random() - 0.5);
      for(const d of dirs) {
        const nx = e.x + d.dx, ny = e.y + d.dy;
        if(theMap[ny] && theMap[ny][nx] !== TILES.WALL &&
           !enemies.some(o => o !== e && o !== target && o.x === nx && o.y === ny) &&
           !(player.x === nx && player.y === ny)) {
          e.x = nx; e.y = ny; moved = true; break;
        }
      }
    });
    // Patrol NPCs
    enemies.forEach(e => {
      if(!e || !e.isSceneNPC || !e.patrolPath || e.patrolPath.length === 0) return;
      const moveInterval = Math.max(250, e.sceneMoveIntervalMs || 800);
      if(typeof e._sceneNextMoveAt !== 'number') e._sceneNextMoveAt = nowMs;
      if(nowMs < e._sceneNextMoveAt) return;
      e._sceneNextMoveAt = nowMs + moveInterval;
      let nextIndex = ((e.patrolIndex || 0) + 1) % e.patrolPath.length;
      let nextStep = e.patrolPath[nextIndex];
      if(!nextStep) return;
      if(player.x === nextStep.x && player.y === nextStep.y) return;
      const pdx = nextStep.x - e.x;
      if(pdx !== 0) e._lastDx = pdx;
      e.x = nextStep.x;
      e.y = nextStep.y;
      e.patrolIndex = nextIndex;
      moved = true;
    });
    return moved;
  }
  window.advanceSceneNPCs = advanceSceneNPCs;

  function advanceTurn(steps = 1) {
    if(isDead) return;
    advanceSceneNPCs();
    window._turnCount = (window._turnCount || 0) + steps;
    
    // Atronach & Regen Suppression (v7.2.0)
    if (!player.atronach) {
       // natural regen
    }

    // Roc Capture
    if(currentLevel === 11 && !player.rocCaptured) {
      player.mountainSteps = (player.mountainSteps || 0) + steps;
      if(player.mountainSteps >= 5) {
        player.rocCaptured = true;
        logMsg("<span style='color:var(--error)'>⚠️ A GIANT ROC SWOOPS DOWN AND GRABS YOU!</span>");
        logMsg("You are carried high above the mountains and dropped into a massive nest...");
        // Initialize a proper nest map (open grass area, walkable)
        mapW = 25; mapH = 25;
        theMap = Array(mapH).fill().map(() => Array(mapW).fill(TILES.GRASS));
        // Ring of walls/rock around the outside
        for(let i=0; i<mapW; i++) { theMap[0][i] = TILES.ROCK; theMap[mapH-1][i] = TILES.ROCK; theMap[i][0] = TILES.ROCK; theMap[i][mapW-1] = TILES.ROCK; }
        darkMap = Array(mapH).fill().map(() => Array(mapW).fill(false));
        explored = Array(mapH).fill().map(() => Array(mapW).fill(false));
        visible = Array(mapH).fill().map(() => Array(mapW).fill(false));
         enemies = []; itemsOnGround = [];
         currentScene = 'nest';
         // #13: Wire background art scene
         player.x = 30; player.y = 17;
         // Place eggs and loot in the nest
         itemsOnGround.push({x: 29, y: 23, icon: '🥚'});
         itemsOnGround.push({x: 30, y: 23, icon: '🥚'});
         itemsOnGround.push({x: 31, y: 23, icon: '🥚'});
         itemsOnGround.push({x: 30, y: 24, icon: '🏅'});
         // Eagle is here if player fed it
         if(player.fedEagle) {
           enemies.push({ x: 30, y: 23, type: "eagle", stats: {...MONSTER_DEF["eagle"]} });
           logMsg("<span style='color:var(--success)'>The Eagle you fed is here! Talk to it to escape.</span>");
         }
        startQuestTimer(30, "Roc Nest Escape", () => {
          if(player.fedEagle) {
            logMsg("<span style='color:var(--success)'>The giant Eagle rescues you!</span>");
            currentLevel = 12; initMap(50); calculateFOV(); drawMap(); updateUI();
          } else {
            logMsg("<span style='color:var(--error)'>The Roc returns... and you are eaten.</span>");
            isDead = true; die();
          }
        });
        calculateFOV(); drawMap(); updateUI();
        return;
      }
    }

    // #18 FIX: Exhaustion drains HP and MP when running.
    // Was: exhaustion > 20 → 0.2 HP/steps + 0.1 MP/steps.
    // Now: exhaustion > 10 → drains scale with exhaustion level.
    if (player.isRunning) {
      player.exhaustion += steps;
      if (player.exhaustion > 10) {
        let drainRate = Math.min(2, (player.exhaustion - 10) * 0.15);
        player.hp -= (drainRate * steps);
        player.mp = Math.max(0, player.mp - (drainRate * 0.5 * steps));
      }
    } else { player.exhaustion = Math.max(0, player.exhaustion - steps); }

    player.hunger = Math.min(100, player.hunger + (CONSTANTS.HUNGER_RATE * steps));

    // ── GRUE DANGER SYSTEM ──
    // Dark tiles (darkMap) with no light source = Grue territory.
    // Danger accumulates each turn; clears instantly when light is active.
      let GRUE_MESSAGES = [
      "It is pitch black. You are likely to be eaten by a Grue.",
      "You hear a faint shuffling in the dark. Something is here.",
      "The darkness is almost tangible. You feel hot breath on your neck.",
      "Something brushes against you. You cannot see what it is.",
      "A low growl reverberates from the walls. The darkness grows heavier.",
      "You can hear it breathing. Very close now.",
      "You feel cold claws trace a line down your spine.",
      "⚠️ A pair of pale eyes opens in the darkness directly in front of you.",
    ];
    if(currentScene === 'dungeon' && darkMap[player.y] && darkMap[player.y][player.x]) {
      if(lightTurns > 0 || (window.debugFlags && debugFlags.fullLight)) {
        // Light is active — Grue retreats, danger resets
        if(player.grueDanger > 0) {
          logMsg("<span style='color:#888; font-style:italic;'>You hear a retreating hiss as the light chases back the darkness.</span>");
        }
        player.grueDanger = 0;
      } else {
        // In the dark — accumulate danger
        player.grueDanger = (player.grueDanger || 0) + steps;
        let danger = player.grueDanger;
        // Messages at thresholds
        let msgIdx = null;
        if(danger === 1) msgIdx = 0;
        else if(danger === 3) msgIdx = 1;
        else if(danger === 5) msgIdx = 2;
        else if(danger === 7) msgIdx = 3;
        else if(danger === 9) msgIdx = 4;
        else if(danger === 11) msgIdx = 5;
        else if(danger === 13) msgIdx = 6;
        else if(danger >= 15) {
          // Each step past 15 has escalating chance of instant death
          let deathChance = Math.min(0.9, (danger - 14) * 0.15);
          if(Math.random() < deathChance) {
            logMsg("<span style='color:var(--error); font-size:14px; font-weight:bold;'>🌑 The Grue strikes from the darkness! You never even saw it coming.</span>");
            player.hp = 0;
            die();
            return;
          }
          if(danger === 15) msgIdx = 7;
        }
        if(msgIdx !== null) {
          let urgency = danger >= 13 ? 'var(--error)' : danger >= 7 ? 'var(--warning)' : '#aaa';
          logMsg(`<span style='color:${urgency}; font-style:italic;'>${GRUE_MESSAGES[msgIdx]}</span>`);
          if(danger >= 5) Sound.playTone(80 + danger * 5, 'sawtooth', 0.05, 0.3, 200);
        }
      }
    } else {
      // Not on a dark tile — reset danger
      player.grueDanger = 0;
    }
    // Hunger damage when starving
    if (player.hunger >= 100) {
      player.hp -= CONSTANTS.HUNGER_DAMAGE * steps;
      addFloatingText(player.x, player.y, "🍖 -" + CONSTANTS.HUNGER_DAMAGE.toFixed(1), "#f00");
    }
    // Hunger heal when well-fed (optional)
    if (player.hunger <= 20) {
      player.hp = Math.min(player.maxHp, player.hp + CONSTANTS.HUNGER_HEAL * steps);
    }

    // E.753.MILK: diarrhea status ticking, periodic fart SFX, timed expiry
    if(player.statusEffects && player.statusEffects.diarrhea) {
      const fx = player.statusEffects.diarrhea;
      fx.turnsRemaining = Math.max(0, (fx.turnsRemaining || 0) - steps);

      const nowMs = Date.now();
      if(!fx.nextFartMs) fx.nextFartMs = nowMs + 6000;
      if(nowMs >= fx.nextFartMs) {
        if(typeof Sound !== 'undefined') {
          if(!Sound.playSample || !Sound.playSample('whoopie', 0.3)) {
            Sound.playTone(90 + Math.random() * 30, 'sawtooth', 0.18, 0.08, 25);
          }
        }
        if(Array.isArray(itemsOnGround)) {
          itemsOnGround.push({ x: player.x, y: player.y, icon: '💩' });
        }
        fx.nextFartMs = nowMs + 8000 + Math.floor(Math.random() * 12000);
      }

      const timedOut = !!fx.untilMs && nowMs >= fx.untilMs;
      if(fx.turnsRemaining <= 0 || timedOut) {
        delete player.statusEffects.diarrhea;
        player.speedMod = 1.0;
        logMsg("<span style='color:#8f8'>Your stomach finally settles down.</span>");
      }
    }

    if(player.totalHealPending > 0) {
      let tick = Math.min(player.totalHealPending, 1 * steps);
      let oldHp = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + tick);
      player.totalHealPending -= tick;
      // Bug 12: Show floating +hp text for regen healing
      let actualHeal = Math.floor(player.hp - oldHp);
      if(actualHeal > 0) addFloatingText(player.x, player.y, '+' + actualHeal, '#81c784', 14);
    }

    // Monster healing over time — monsters heal 5% max HP per turn when not in combat
    enemies.forEach(e => {
      if(e.stats && e.stats.hp > 0 && e.stats.hp < e.stats.maxHp) {
        let dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
        // Only heal if not adjacent to player (not in combat)
        if(dist > 1) {
          let heal = Math.max(1, Math.floor(e.stats.maxHp * 0.05 * steps));
          e.stats.hp = Math.min(e.stats.maxHp, e.stats.hp + heal);
        }
      }
    });

    // AI and NPC Logic
    enemies.forEach((e, eIdx) => {
      if(!e.stats) return;

      // B.759: ensure pixies/peasants stay outside Tristram walls.
      if(currentScene === 'town' && window._tristramBounds && (e.type === 'pixie' || e.type === 'muck_peasant')) {
        const b = window._tristramBounds;
        const wallDx = e.x < b.x1 ? (b.x1 - e.x) : (e.x > b.x2 ? e.x - b.x2 : 0);
        const wallDy = e.y < b.y1 ? (b.y1 - e.y) : (e.y > b.y2 ? e.y - b.y2 : 0);
        const tooClosePixie = (e.type === 'pixie' && Math.hypot(wallDx, wallDy) < 30);
        if((e.x >= b.x1 && e.x <= b.x2 && e.y >= b.y1 && e.y <= b.y2) || tooClosePixie) {
          const gx = (typeof window._townGateX === 'number') ? window._townGateX : Math.floor((b.x1 + b.x2) / 2);
          const gy = (typeof window._townGateY === 'number') ? window._townGateY : b.y2 - 1;
          e.x = Math.max(2, Math.min(mapW - 3, gx + (e.type === 'pixie' ? 34 : -9)));
          e.y = Math.max(2, Math.min(mapH - 3, gy + 8));
        }
      }

      // B.757: keep Mended Drum regulars in the chat UI, not roaming outdoors.
      if(e._stayInShop || ['cohen','librarian','vimes','bearded_dwarf'].includes(e.type)) return;

      // Bug 25: Wandering NPC AI — random walk every 5 turns, no player chasing
      if(e.stats.wandering) {
        e.stats.wanderTimer = (e.stats.wanderTimer || 0) + steps;
        if(e.stats.wanderTimer >= 5) {
          e.stats.wanderTimer = 0;
          const wDirs = [[0,-1],[1,0],[0,1],[-1,0]];
          const shuffled = wDirs.sort(() => Math.random() - 0.5);
          for(const [wdx, wdy] of shuffled) {
            let wx = e.x + wdx, wy = e.y + wdy;
            if(wx >= 0 && wx < mapW && wy >= 0 && wy < mapH &&
               isTileFloor(theMap[wy][wx]) &&
               !enemies.some(o => o !== e && o.x === wx && o.y === wy) &&
               !(wx === player.x && wy === player.y)) {
              e.x = wx; e.y = wy;
              break;
            }
          }
        }
        return;
      }

      // Ifrit Boss AI — non-aggressive by default. Only insults player.
      // If player attacks first (e.provoked), Ifrit retaliates with full force.
       if(e.type === 'ifrit' && e.isIfrit) {
        let dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
        if(!e.provoked) {
          if(dist <= 5 && Math.random() < 0.3) {
            const IDLE_TAUNTS = [
              { text: "🔥 Ifrit: 'You're still here? I admire your... stupidity.'",              voice: 'voice_ifrit_greet_0' },
              { text: "🔥 Ifrit: 'I'm not guarding anything. I just LIKE standing in dark rooms.'", voice: 'voice_ifrit_greet_1' },
              { text: "🔥 Ifrit: 'Go away. I'm trying to meditate. It's hard when you're literally on fire.'", voice: 'voice_ifrit_greet_2' },
              { text: "🔥 Ifrit: 'Is it hot in here or is it just me? ...it's me. Obviously.'",    voice: 'voice_ifrit_greet_3' },
            ];
            const t = IDLE_TAUNTS[Math.floor(Math.random() * IDLE_TAUNTS.length)];
            logMsg(t.text);
            if(typeof Sound !== 'undefined' && Sound.playVoice) Sound.playVoice(t.voice);
          }
          // Patrol AI: cycle between patrol/sit/stand every few turns
          e._patrolTurnCount = (e._patrolTurnCount || 0) + steps;
          if (e._patrolTurnCount >= 8) {
            e._patrolTurnCount = 0;
            const roll = Math.random();
            if (roll < 0.7) {
              e._ifritAction = 'patrol';
              // Pick a new random patrol target around chamber center.
              const mapW2 = theMap[0] ? theMap[0].length : 30;
              const mapH2 = theMap.length || 30;
              const c = e.patrolCenter || { x: e.x, y: e.y };
              const pr = e.patrolRadius || 4;
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
          // Execute patrol movement
          if (e._ifritAction === 'patrol' && e._patrolTarget) {
            const pdx = Math.sign(e._patrolTarget.x - e.x);
            const pdy = Math.sign(e._patrolTarget.y - e.y);
            if (pdx !== 0 || pdy !== 0) {
              const nx = e.x + pdx, ny = e.y + pdy;
              const mapW2 = theMap[0] ? theMap[0].length : 30;
              const mapH2 = theMap.length || 30;
              if (nx >= 0 && nx < mapW2 && ny >= 0 && ny < mapH2 &&
                  theMap[ny] && isTileFloor(theMap[ny][nx]) &&
                  !enemies.some(o => o !== e && o.x === nx && o.y === ny) &&
                  !(nx === player.x && ny === player.y)) {
                e.x = nx; e.y = ny;
              }
              // Reached target
              if (e.x === e._patrolTarget.x && e.y === e._patrolTarget.y) {
                e._patrolTarget = null;
                e._ifritAction = 'stand';
              }
            }
          }
          return;
        }
        if(!e.taunted && player.level < 5) {
          e.taunted = true;
          const FIRE_PUNS = [
            { text: "🔥 Ifrit: 'You look a little... burned out. Maybe level up first?'", voice: 'voice_ifrit_low_level' },
            { text: "🔥 Ifrit: 'I'm on FIRE today! Get it? Because... fire.'",             voice: 'voice_ifrit_combat_0' },
            { text: "🔥 Ifrit: 'I hope you brought marshmallows. Because you're TOAST.'",   voice: 'voice_ifrit_combat_1' },
          ];
          const p = FIRE_PUNS[Math.floor(Math.random() * FIRE_PUNS.length)];
          logMsg(p.text);
          if(typeof Sound !== 'undefined' && Sound.playVoice) Sound.playVoice(p.voice);
        }
        // Flame On: 5% chance to self-heal each combat turn
        if(e.stats.hp < e.stats.maxHp && Math.random() < 0.05) {
          const healAmt = 20 + Math.floor(Math.random() * 15);
          e.stats.hp = Math.min(e.stats.maxHp, e.stats.hp + healAmt);
          addFloatingText(e.x, e.y, `+${healAmt}🔥`, '#f80', 22);
          logMsg("<span style='color:#f80'>🔥 Ifrit blazes: 'FLAME ON!' and heals " + healAmt + " HP!</span>");
          if(window.WebGLFX && WebGLFX.onCombatImpact) WebGLFX.onCombatImpact(0, e.x, e.y);
        }
        if(dist >= 3 && dist <= 8 && Math.random() < 0.4) {
          logMsg("<span style='color:var(--error)'>🔥 Ifrit hurls a fireball at you!</span>");
          if(typeof Sound !== 'undefined' && Sound.playVoice) Sound.playVoice('voice_ifrit_attack');
          let dx = Math.sign(player.x - e.x), dy = Math.sign(player.y - e.y);
          for(let t = 1; t <= dist; t++) {
            let fx = e.x + dx * t, fy = e.y + dy * t;
            if(theMap[fy] && theMap[fy][fx] === TILES.WALL) break;
            addFloatingText(fx, fy, '🔥', '#f60', 20);
          }
          let dmg = 15 + Math.floor(Math.random() * 10);
          player.hp -= dmg;
          addFloatingText(player.x, player.y, `-${dmg}`, '#f00', 22);
          if(window.WebGLFX && WebGLFX.onPlayerDamage) WebGLFX.onPlayerDamage(dmg, 'ifrit_fireball');
          logMsg(`You take ${dmg} fire damage!`);
          if(player.hp <= 0) { die(); return; }
        }
        else if(dist <= 1) {
          logMsg("<span style='color:var(--error)'>🔥 Ifrit engulfs you in flames!</span>");
          let dmg = 20 + Math.floor(Math.random() * 10);
          player.hp -= dmg;
          addFloatingText(player.x, player.y, `-${dmg}🔥`, '#f00', 24);
          if(window.WebGLFX && WebGLFX.onPlayerDamage) WebGLFX.onPlayerDamage(dmg, 'ifrit_aura');
          if(player.hp <= 0) { die(); return; }
        }
        return;
      }

      // French Taunter Cow-Throwing (v7.2.0)
      if (e.type === 'french_taunter') {
        if (Math.abs(e.x - player.x) + Math.abs(e.y - player.y) <= 5 && Math.random() < 0.1) {
           logMsg("<span style='color:var(--error)'>The French Taunter flings a COW at you!</span>");
           player.hp -= 10; addFloatingText(player.x, player.y, "🐄 -10", "#f00", 24);
        }
        return;
      }

      if (e.type === 'thief') {
        let dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
        // Patrol AI: move toward stationary player if within 4 tiles
        if(e.stats.patrolling) {
          if(dist <= 4 && (player.stationaryTurns || 0) >= 2) {
            // Move toward player
            let pdx = Math.sign(player.x - e.x), pdy = Math.sign(player.y - e.y);
            let nx2 = e.x + pdx, ny2 = e.y + pdy;
            if(nx2 >= 0 && nx2 < mapW && ny2 >= 0 && ny2 < mapH &&
               (isTileFloor(theMap[ny2][nx2])) &&
               !enemies.some(o => o !== e && o.x === nx2 && o.y === ny2)) {
              e.x = nx2; e.y = ny2;
            }
            // If now adjacent to stationary player, pickpocket
            let newDist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
            if(newDist === 1 && Math.random() < CONSTANTS.STEAL_CHANCE) thiefSteal(eIdx);
          } else if(dist === 1 && Math.random() < CONSTANTS.STEAL_CHANCE) {
            thiefSteal(eIdx);
          }
        } else {
          if (dist === 1 && Math.random() < CONSTANTS.STEAL_CHANCE) thiefSteal(eIdx);
          let item = itemsOnGround.find(i => Math.abs(i.x-e.x)+Math.abs(i.y-e.y) <= 5);
          if(item) { e.x += Math.sign(item.x-e.x); e.y += Math.sign(item.y-e.y); }
          else { e.x += (Math.random()>0.5?1:-1); e.y += (Math.random()>0.5?1:-1); }
        }
        return;
      }

      // E20: Friendly outdoor animals — flee from player when nearby
      if(e.fleePlayer) {
        e.actionTimer = (e.actionTimer || 0) + ((e.stats.speed || 1) * steps);
        while(e.actionTimer >= 1) {
          e.actionTimer -= 1;
          const distToPlayer = Math.hypot(e.x - player.x, e.y - player.y);
          if(distToPlayer <= 3) {
            const fdx = e.x - player.x;
            const fdy = e.y - player.y;
            const steps2 = [
              {dx: Math.sign(fdx) || 1,  dy: 0},
              {dx: 0,                     dy: Math.sign(fdy) || 1},
              {dx: -(Math.sign(fdx) || 1), dy: 0},
              {dx: 0,                     dy: -(Math.sign(fdy) || 1)}
            ];
            for(const s of steps2) {
              const nx = e.x + s.dx, ny = e.y + s.dy;
              if(nx >= 0 && nx < mapW && ny >= 0 && ny < mapH &&
                 theMap[ny] && theMap[ny][nx] !== TILES.WALL &&
                 !enemies.some(o => o !== e && o.x === nx && o.y === ny)) {
                e.x = nx; e.y = ny; break;
              }
            }
          } else if(distToPlayer > 8 && e.preferPlants) {
            // Wander randomly when far from player
            const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
            const d = dirs[Math.floor(Math.random() * dirs.length)];
            const nx = e.x + d.dx, ny = e.y + d.dy;
            if(nx >= 1 && nx < mapW-1 && ny >= 1 && ny < mapH-1 &&
               theMap[ny] && theMap[ny][nx] !== TILES.WALL &&
               !enemies.some(o => o !== e && o.x === nx && o.y === ny)) {
              e.x = nx; e.y = ny;
            }
          }
        }
        return; // skip normal attack AI
      }

      // Passive vermin (mice, cockroaches) - flee from player, stay at light edge
      if(e.stats.passive) {
        e.actionTimer += (e.stats.speed * steps);
        while(e.actionTimer >= 1) {
          e.actionTimer -= 1;
          let dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
          if(dist < 3) {
            // Flee away from player
            let fleeDx = -Math.sign(player.x - e.x);
            let fleeDy = -Math.sign(player.y - e.y);
            // Prefer moving along the light edge (perpendicular to player direction)
            if(dist === 2 && Math.random() < 0.6) {
              // Sidestep along the light cone edge
              if(Math.abs(player.x - e.x) > Math.abs(player.y - e.y)) {
                fleeDx = 0; fleeDy = Math.random() > 0.5 ? 1 : -1;
              } else {
                fleeDy = 0; fleeDx = Math.random() > 0.5 ? 1 : -1;
              }
            }
            let nx = e.x + fleeDx, ny = e.y + fleeDy;
            if(theMap[ny] && isTileFloor(theMap[ny][nx]) && !enemies.some(o => o.x === nx && o.y === ny)) {
              e.x = nx; e.y = ny;
            }
          } else if(dist > 4) {
            // If too far, move slightly toward player to stay near light edge
            let dx = Math.sign(player.x - e.x), dy = Math.sign(player.y - e.y);
            let nx = e.x + dx, ny = e.y + dy;
            if(theMap[ny] && isTileFloor(theMap[ny][nx]) && !enemies.some(o => o.x === nx && o.y === ny)) {
              e.x = nx; e.y = ny;
            }
          }
          // At distance 3-4: stay put (at light edge)
        }
        return;
      }

      // #32 FIX: Fence patrols near the bar entrance instead of standing still
      if(e.type === 'fence') {
        e.actionTimer = (e.actionTimer || 0) + (e.stats.speed * steps);
        let barX = window._fenceBarX || player.x;
        let barY = window._fenceBarY || player.y;
        const onEntrance = (e.x === barX && e.y === barY) || (e.x === barX && e.y === barY + 1) || (e.x === barX - 1 && e.y === barY + 1) || (e.x === barX + 1 && e.y === barY + 1);
        if(onEntrance) {
          const nx = barX + 3, ny = barY + 2;
          if(theMap[ny] && isTileFloor(theMap[ny][nx])) { e.x = nx; e.y = ny; }
        }
        while(e.actionTimer >= 1) {
          e.actionTimer -= 1;
          if(Math.random() < 0.4) {
            // Fence wanders 1 tile randomly (prefers N/S/E/W, never diagonal)
            let dirs = [[0,1],[0,-1],[1,0],[-1,0]];
            let [fdx, fdy] = dirs[Math.floor(Math.random() * dirs.length)];
            let nx2 = e.x + fdx, ny2 = e.y + fdy;
            // Patrol zone: stay within 6 tiles of bar area (keep near LEFTYS tile)
            const blocksEntrance =
              (nx2 === barX && ny2 === barY) ||
              (nx2 === barX && ny2 === barY + 1) ||
              (nx2 === barX - 1 && ny2 === barY + 1) ||
              (nx2 === barX + 1 && ny2 === barY + 1);
            if(theMap[ny2] && isTileFloor(theMap[ny2][nx2]) &&
               Math.abs(nx2 - barX) <= 6 && Math.abs(ny2 - barY) <= 6 &&
               !blocksEntrance &&
               !enemies.some(o => o !== e && o.x === nx2 && o.y === ny2)) {
              e.x = nx2; e.y = ny2;
            }
          }
        }
        return;
      }

      // B760.MIMIC: awakened mimic can spit coin projectiles at range.
      if(e.type === 'mimic' && e.isMimic) {
        e.actionTimer = (e.actionTimer || 0) + (e.stats.speed * steps);
        while(e.actionTimer >= 1) {
          e.actionTimer -= 1;
          const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
          if((e.provoked || e._mimicAwake) && dist >= 2 && dist <= 6 && Math.random() < 0.45) {
            if(typeof Sound !== 'undefined') {
              if(Sound.playSample) Sound.playSample('mimic_attack', 0.75);
              if(Sound.playSample) Sound.playSample('ka_ching', 0.55);
            }
            activeEffects.push({ kind:'goldCoins', x1:e.x, y1:e.y, x2:player.x, y2:player.y, color:'#FFD700', life:1.0, power:0.9 });
            const pdmg = Math.max(2, Math.floor((e.stats.dmg || 8) * 0.6));
            player.hp -= pdmg;
            addFloatingText(player.x, player.y, `-${pdmg}🪙`, '#FFD700', 16);
            logMsg("<span style='color:var(--error)'>🪙 The Mimic spits a volley of gold coins!</span>");
            if(player.hp <= 0) { die(); return; }
            continue;
          }
          if(dist <= 1) { monsterAttack(eIdx); continue; }
          const dx = Math.sign(player.x - e.x), dy = Math.sign(player.y - e.y);
          const nx = e.x + dx, ny = e.y + dy;
          if(theMap[ny] && isTileFloor(theMap[ny][nx]) && !enemies.some(o => o !== e && o.x === nx && o.y === ny)) {
            e.x = nx; e.y = ny;
          }
        }
        return;
      }

      if(e.stats.quest) return;

      // Bug 42-43: Shark stalking AI — moves toward player on water within aggro range
      if(e.type === 'shark' && e.stats.stalks) {
        let playerOnWater = theMap[player.y] && (theMap[player.y][player.x] === TILES.WATER || theMap[player.y][player.x] === TILES.DEEP_WATER);
        let dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
        let aggroRange = e.stats.aggro || 6;
        if(playerOnWater && dist <= aggroRange) {
          // Provoke shark — it will always chase now
          e.provoked = true;
        }
        if(e.provoked || dist <= aggroRange) {
          e.actionTimer += (e.stats.speed * steps);
          while(e.actionTimer >= 1) {
            e.actionTimer -= 1;
            let isAdj = Math.abs(e.x - player.x) <= 1 && Math.abs(e.y - player.y) <= 1;
            if(isAdj) { monsterAttack(eIdx); }
            else {
              let dx = Math.sign(player.x - e.x), dy = Math.sign(player.y - e.y);
              let targetTile = theMap[e.y+dy] && theMap[e.y+dy][e.x+dx];
              if(targetTile === TILES.WATER || targetTile === TILES.DEEP_WATER) { e.x += dx; e.y += dy; }
            }
          }
        }
        return;
      }

      // E.753.ZOMBIE: Slow shambling patrol until aggro range, then pursue
      if(e.type === 'zombie') {
        e.actionTimer += (e.stats.speed * steps);
        const aggroRange = e.stats.aggro || 5;
        while(e.actionTimer >= 1) {
          e.actionTimer -= 1;
          const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
          const isAdj = dist <= 1;
          if(dist <= aggroRange) e.provoked = true;

          if(isAdj && e.provoked) {
            monsterAttack(eIdx);
            continue;
          }

          if(e.provoked) {
            let dx = Math.sign(player.x - e.x), dy = Math.sign(player.y - e.y);
            if(dx !== 0 && dy !== 0) {
              if(Math.random() < 0.5) dx = 0;
              else dy = 0;
            }
            let tile = theMap[e.y+dy] && theMap[e.y+dy][e.x+dx];
            if(!enemies.some(e2 => e !== e2 && e.x+dx === e2.x && e.y+dy === e2.y)
                && isTileFloor(tile)) {
              e.x += dx; e.y += dy;
              if(dx !== 0) e._lastDx = dx;
            }
          } else if(Math.random() < 0.45) {
            const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
            const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
            const tile = theMap[e.y+dy] && theMap[e.y+dy][e.x+dx];
            if(!enemies.some(e2 => e !== e2 && e.x+dx === e2.x && e.y+dy === e2.y)
                && isTileFloor(tile)) {
              e.x += dx; e.y += dy;
              if(dx !== 0) e._lastDx = dx;
            }
          }
        }
        return;
      }

      // E.753.PIXIE: Nearby pixies buzz/taunt while chasing the player
      if(e.type === 'pixie') {
        const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
        const nowMs = Date.now();
        if(dist <= 6 && Math.random() < 0.06 * steps) {
          if(typeof Sound !== 'undefined') {
            if(!Sound.playSample || !Sound.playSample('squeak', 0.16)) {
              Sound.playTone(900 + Math.random() * 400, 'sawtooth', 0.08, 0.06, 1800);
            }
          }
        }
        if(dist <= 4 && (!e._nextPixieVoiceMs || nowMs >= e._nextPixieVoiceMs)) {
          if(typeof Sound !== 'undefined' && Sound.playVoice) {
            const v = Math.floor(Math.random() * 3);
            Sound.playVoice(`voice_pixie_${v}`);
          }
          e._nextPixieVoiceMs = nowMs + 12000 + Math.floor(Math.random() * 10000);
        }
      }
      
      e.actionTimer += (e.stats.speed * steps);
      while(e.actionTimer >= 1) {
        e.actionTimer -= 1;
        let isAdj = Math.abs(e.x - player.x) <= 1 && Math.abs(e.y - player.y) <= 1;
        if(isAdj) { monsterAttack(eIdx); }
        else {
          let dx = Math.sign(player.x - e.x), dy = Math.sign(player.y - e.y);
          // Random diagonal or straight when enemy has a choice.
          if (dx != 0 && dy != 0) {
            switch (Math.floor(Math.random() * 3)) {
              case 0: // move N/S
                dx = 0;
                break;
              case 1: // move E/W
                dy = 0;
                break;
              case 2: // move diagonally
                break;
            }
          }
          let tile = theMap[e.y+dy] && theMap[e.y+dy][e.x+dx];
          if (!enemies.some(e2 => e != e2 && e.x+dx === e2.x && e.y+dy === e2.y)
                && (isTileFloor(tile) || (e.stats.throughWalls && tile === TILES.WALL))) {
            e.x += dx; e.y += dy;
            if(dx !== 0) e._lastDx = dx;
          }
        }
      }
    });

    // Spawn new monsters over time
    if (currentScene === 'dungeon' && Math.random() < CONSTANTS.SPAWN_RATE * steps) {
        let pos = getRandomFloor();
        if (pos && !(darkMap[pos.y] && darkMap[pos.y][pos.x]) && !enemies.some(e => e.x === pos.x && e.y === pos.y) && (pos.x !== player.x || pos.y !== player.y)) {
            enemies.push({ x: pos.x, y: pos.y, type: "slime", stats: {...MONSTER_DEF["slime"]}, actionTimer: 0 });
        }
    }

    let curTile = theMap[player.y][player.x];
    if (curTile === TILES.BLADE && !player.isKneeling) { player.hp -= 10; damageTint = 30; }

    // Track player stationaryTurns for thief patrol AI
    if(player._lastX === player.x && player._lastY === player.y) {
      player.stationaryTurns = (player.stationaryTurns || 0) + steps;
    } else {
      player.stationaryTurns = 0;
    }
    player._lastX = player.x;
    player._lastY = player.y;

    // #26 FIX: Cat/rat/old boot spawn event — appeared in logs but entities never spawned.
    // Triggers once per floor when player has been stationary for 5+ turns.
    if(player.stationaryTurns >= 5 && !player._catRatSpawned && currentLevel >= 2 &&
       currentScene === 'dungeon') {
      player._catRatSpawned = true;
      // Find a visible but not-occupied tile near the player
      let spawnTile = null;
      for(let attempt = 0; attempt < 20; attempt++) {
        let sx = player.x + Math.floor(Math.random() * 7) - 3;
        let sy = player.y + Math.floor(Math.random() * 7) - 3;
        if(sx > 0 && sx < mapW && sy > 0 && sy < mapH &&
           theMap[sy] && isTileFloor(theMap[sy][sx]) &&
           visible[sy] && visible[sy][sx] &&
           (sx !== player.x || sy !== player.y) &&
           !enemies.some(e => e.x === sx && e.y === sy)) {
          spawnTile = {x: sx, y: sy};
          break;
        }
      }
      if(spawnTile) {
        // Spawn the rat — passive, runs away
        enemies.push({
          x: spawnTile.x, y: spawnTile.y,
          type: 'wet_rat',
          stats: {...MONSTER_DEF['wet_rat'], hp: 6, maxHp: 6, dmg: 0, hit: 0.0, crit: 0.0, passive: true, speed: 1.2},
          actionTimer: 0
        });
        logMsg("<span style='color:var(--warning)'>🐀 You notice a rat scurrying across the floor, followed by a cat in hot pursuit!</span>");
        // Cat spawns a bit further away, chases the rat
        enemies.push({
          x: spawnTile.x + 1, y: spawnTile.y,
          type: 'cat',
          stats: {...MONSTER_DEF['cat']},
          actionTimer: 0
        });
        // Old boot appears at feet (harmless flavor item)
        itemsOnGround.push({ x: player.x + 1, y: player.y, icon: '👢' });
        addFloatingText(spawnTile.x, spawnTile.y, '🐀', '#aaa', 14);
      }
    }

    // E16: Tick active bombs
    if(window._activeBombs && window._activeBombs.length > 0) {
      for(let i = window._activeBombs.length - 1; i >= 0; i--) {
        const bomb = window._activeBombs[i];
        bomb.timer -= steps;
        if(bomb.timer <= 0) {
          window._activeBombs.splice(i, 1);
          explodeBomb(bomb);
        }
      }
    }

    calculateFOV(); drawMap(); updateUI();
  }

  // E16: Bomb explosion
  function explodeBomb(bomb) {
    logMsg(`<span style='color:#f80'>💥 BOOM! The bomb explodes!</span>`);
    Sound.playTone(80, 'sawtooth', 0.8, 0.2, 600);
    Sound.playTone(120, 'square', 0.5, 0.1, 400);

    activeEffects.push({ kind: 'fireballBurst', x: bomb.x, y: bomb.y, power: 3, life: 1.5 });

    // Smoke particles
    for(let s=0;s<4;s++) {
      setTimeout(()=> addFloatingText(
        bomb.x+(Math.random()-0.5)*2, bomb.y+(Math.random()-0.5)*2, '💨', '#888', 20
      ), s*150);
    }
    // Shrapnel visual
    for(let s=0;s<6;s++) {
      addFloatingText(
        bomb.x+(Math.random()-0.5)*3, bomb.y+(Math.random()-0.5)*3,
        s%2===0?'🔺':'🔻', s%3===0?'#666':'#333', 14+Math.random()*8
      );
    }

    const maxR = bomb.radius;
    const baseDmg = bomb.baseDmg;
    const dmgPerTile = bomb.dmgPerTile;

    // Damage player if in range
    const playerDist = Math.hypot(player.x - bomb.x, player.y - bomb.y);
    if(playerDist <= maxR) {
      const dmg = Math.max(0, baseDmg - Math.floor(playerDist) * dmgPerTile);
      if(dmg > 0) {
        player.hp = Math.max(0, player.hp - dmg);
        logMsg(`<span style='color:#f44'>💥 The explosion catches you for ${dmg} damage!</span>`);
        addFloatingText(player.x, player.y, `-${dmg}`, '#f00', 20);
        damageTint = 30;
        if(window.WebGLFX && WebGLFX.onPlayerDamage) WebGLFX.onPlayerDamage(dmg);
        updateUI();
        if(player.hp <= 0) { die(); return; }
      }
    }

    // Damage enemies in blast radius
    for(let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if(!e) continue;
      const eDist = Math.hypot(e.x - bomb.x, e.y - bomb.y);
      if(eDist <= maxR) {
        const dmg = Math.max(0, baseDmg - Math.floor(eDist) * dmgPerTile);
        if(dmg > 0) {
          e.stats.hp -= dmg;
          addFloatingText(e.x, e.y, `-${dmg}`, '#f80', 18);
          logMsg(`💥 Explosion hits ${e.type} for ${dmg}!`);
          if(e.stats.hp <= 0) {
            logMsg(`The ${e.type} is blasted away!`);
            window.resolveEnemyDefeat(i);
          }
        }
      }
    }

    drawMap();
  }

  function thiefSteal(thiefIdx) {
    let items = inventory.filter(i => i !== null);
    if (items.length > 0) {
      let idx = inventory.indexOf(items[Math.floor(Math.random()*items.length)]);
      let stolen = inventory[idx];
      stolenItems.push(stolen);
      inventory[idx] = null;
      logMsg(`<span style='color:var(--error)'>The Thief pickpocketed your ${ITEM_DEF[stolen.icon].name}!</span>`);
      // #13: Play internal dialog voice line on pickpocket
      let stolenVoices = ['voice_internal_stolen_0', 'voice_internal_stolen_1', 'voice_internal_stolen_2'];
      if(typeof Sound !== 'undefined' && Sound.playVoice) {
        Sound.playVoice(stolenVoices[Math.floor(Math.random() * stolenVoices.length)]);
      }
      // Also play the yoink SFX
      if(typeof Sound !== 'undefined' && Sound.playSample) {
        Sound.playSample('yoink', 0.7);
      }
      document.getElementById('modal-content').innerHTML = `<h2>🧤 PICKPOCKETED</h2>${modalPortraitHTML('npc_thief_modal', '🧤')}<p>The Thief stole your <strong>${ITEM_DEF[stolen.icon].name}</strong>!</p><button onclick="hideOverlay()">Drat!</button>`;
      showOverlay();
      renderInventory(); updateUI();
    }
  }

  function restPlayer() {
    showOverlay();
    document.getElementById('modal-content').innerHTML = `<h2>💤 Sleeping...</h2><button onclick="wakeUp()">Wake Up</button>`;
    player.isSleeping = true;
    Sound.gurgle();
    if (snoreLoop) clearInterval(snoreLoop);
    if (sleepHealLoop) clearInterval(sleepHealLoop);
    snoreLoop = setInterval(() => Sound.snore(), 2000);

    // Bug 11+13: Heal ticks during sleep, scaled by CON, with visible +HP text
    // #37 FIX: Also regenerate MP during sleep
    let conBonus = (player.stats.con || 10) - 10;
    let tickHeal = Math.max(1, Math.floor((5 + conBonus) / 2));
    let tickMana = Math.max(1, Math.floor(3 + conBonus / 2));
    let sleepHealTotal = 0;
    let sleepManaTotal = 0;
    sleepHealLoop = setInterval(() => {
      if(!player.isSleeping || player.atronach || isDead) { clearInterval(sleepHealLoop); return; }
      // Bug 13: Wake player if a hostile enemy is within 2 tiles
      let hostileNear = enemies.find(e => e.stats && !e.stats.quest && !e.stats.passive &&
        Math.abs(e.x - player.x) <= 2 && Math.abs(e.y - player.y) <= 2);
      if(hostileNear) {
        if(snoreLoop) clearInterval(snoreLoop);
        logMsg(`<span style='color:var(--error)'>⚠️ You are woken by a nearby ${hostileNear.type}!</span>`);
        damageTint = 20;
        wakeUp();
        return;
      }
      let gainedHp = false, gainedMp = false;
      if(player.hp < player.maxHp) {
        let oldHp = player.hp;
        player.hp = Math.min(player.maxHp, player.hp + tickHeal);
        let healed = Math.floor(player.hp - oldHp);
        if(healed > 0) { sleepHealTotal += healed; gainedHp = true; }
      }
      if(player.mp < player.maxMp) {
        let oldMp = player.mp;
        player.mp = Math.min(player.maxMp, player.mp + tickMana);
        let restored = Math.floor(player.mp - oldMp);
        if(restored > 0) { sleepManaTotal += restored; gainedMp = true; }
      }
      if(gainedHp || gainedMp) {
        // Update the sleep modal with heal/mana feedback
        let modal = document.getElementById('modal-content');
        if(modal) modal.innerHTML = `<h2>💤 Sleeping...</h2>
          ${gainedHp ? `<div style="color:#81c784; font-size:16px; margin:8px 0;">+${Math.floor(player.hp - (player.hp - tickHeal))} HP</div>` : ''}
          ${gainedMp ? `<div style="color:#81c7f4; font-size:16px; margin:8px 0;">+${Math.floor(player.mp - (player.mp - tickMana))} MP</div>` : ''}
          <div style="color:#aaa; font-size:12px;">Total: +${sleepHealTotal} HP, +${sleepManaTotal} MP</div>
          <div style="color:#888; font-size:11px;">HP: ${Math.floor(player.hp)}/${player.maxHp} | MP: ${Math.floor(player.mp)}/${player.maxMp}</div>
          <button onclick="wakeUp()" style="margin-top:10px;">Wake Up</button>`;
        updateUI();
      }
    }, 800);

    // Assassin Ambush (v7.2.0)
    if (player.killedPassive && !player.assassinMet) {
       player.assassinMet = true;
       setTimeout(() => {
         if (snoreLoop) clearInterval(snoreLoop);
         logMsg("<span style='color:var(--error)'>You wake to a cold blade at your throat! 'The Dark Brotherhood sends its regards!'</span>");
         // Bug 13: Show ambush visual feedback before waking
         damageTint = 30;
         addFloatingText(player.x, player.y, '⚔️ AMBUSH!', '#f00', 20);
         enemies.push({ x: player.x+1, y: player.y, type: "assassin", stats: {...MONSTER_DEF["assassin"]}, actionTimer: 0 });
         // Bug 13: Short delay then wake so player sees the ambush notification
         setTimeout(() => { wakeUp(); }, 300);
       }, 1500);
       return;
    }

    let thief = enemies.find(e => e.type === 'thief' && Math.abs(e.x-player.x)+Math.abs(e.y-player.y) <= 2);
    if (thief && Math.random() < 0.75) {
       setTimeout(() => {
         if (snoreLoop) clearInterval(snoreLoop);
         logMsg("<span style='color:var(--warning)'>A Thief was rooting through your pack!</span>");
         wakeUp();
       }, 1000);
    }
  }

  window.wakeUp = () => {
    hideOverlay();
    player.isSleeping = false; advanceTurn(10);
    if (snoreLoop) clearInterval(snoreLoop);
    if (sleepHealLoop) clearInterval(sleepHealLoop);
    updateUI();
  };

  // ── CASTLE RAT CELL ESCAPE ──
  // Player is thrown into a dungeon cell. Must use food to lure mice,
  // who gnaw through bonds and show a way out.
  window.spawnCell = function() {
    // Build a small cell: 5x5 walled room
    let cellX = Math.floor(mapW / 2), cellY = Math.floor(mapH / 2);
    let cw = 5, ch = 5;
    // Carve cell into map
    for(let y = cellY - 2; y <= cellY + 2; y++) {
      for(let x = cellX - 2; x <= cellX + 2; x++) {
        if(y < 0 || y >= mapH || x < 0 || x >= mapW) continue;
        if(y === cellY - 2 || y === cellY + 2 || x === cellX - 2 || x === cellX + 2) {
          theMap[y][x] = TILES.WALL;
        } else {
          theMap[y][x] = TILES.FLOOR;
        }
      }
    }
    player.x = cellX; player.y = cellY;
    player.inCell = true;
    calculateFOV(); drawMap();
    logMsg("<span style='color:var(--error)'>You are locked in a cell. The iron door is solid.</span>");
    logMsg("<span style='color:#888; font-style:italic;'>You can hear tiny scratching sounds from the walls...</span>");
    if(player.stats.int >= 10) {
      logMsg("<span style='color:#aaa; font-style:italic;'>If you had food, you might be able to lure something through that crack in the wall.</span>");
    }
    if(typeof QuestEngine !== 'undefined') QuestEngine.emit('cell_entered', {});
    updateUI();
  };

  window.mouseRescueScene = function() {
    player.inCell = false;
    player.caughtByRat = false;
    // Move player to a hidden passage — a few tiles away from the cell
    let escapeX = Math.min(mapW - 3, Math.floor(mapW / 2) + 3);
    let escapeY = Math.floor(mapH / 2);
    // Carve a small escape tunnel
    for(let x = Math.floor(mapW / 2) + 2; x <= escapeX + 2; x++) {
      if(x >= 0 && x < mapW) theMap[escapeY][x] = TILES.FLOOR;
    }
    player.x = escapeX; player.y = escapeY;
    logMsg("<span style='color:var(--success)'>🐭 The mice gnaw through your bonds and show you a passage in the wall!</span>");
    logMsg("<span style='color:#aaa; font-style:italic;'>The mouse-sized tunnel leads behind the castle walls...</span>");
    if(typeof QuestEngine !== 'undefined') QuestEngine.emit('cell_escaped', {});
    calculateFOV(); drawMap(); updateUI();
  };

  function die() {
    let crystalIdx = inventory.findIndex(i => i && i.icon === '💎💠');
    if (crystalIdx !== -1) {
      logMsg("Crystal Shatters!");
      inventory[crystalIdx] = null;
      player.hp = player.maxHp; updateUI(); return;
    }
    // B41: Capture the last relevant game log message to display in the death modal
    (function() {
      try {
        const entries = document.querySelectorAll('#log .log-entry .log-new');
        if(entries.length > 0) {
          // Strip HTML tags to get plain text
          const lastEntry = entries[entries.length - 1];
          window._lastDeathMessage = lastEntry.textContent || lastEntry.innerText || '';
        } else {
          window._lastDeathMessage = '';
        }
      } catch(e) {
        window._lastDeathMessage = '';
      }
    })();
    isDead = true; Sound.scream(); drawMap();
    setTimeout(() => {
      const deathMsg = window._lastDeathMessage || '';
      showOverlay();
      document.getElementById('modal-content').innerHTML = `<h2>YOU DIED</h2>
        <p style="color:#888;">Floor ${currentLevel} | Level ${player.level} | ${player.gp}g</p>
        ${deathMsg ? `<p id="death-msg" style="color:#f88; font-style:italic; margin:8px 0; font-size:13px; max-width:300px;">${deathMsg}</p>` : ''}
        <button onclick="loadGame()">Load Game</button>
        <button onclick="restartGame()">Restart (keep assets)</button>
        <button onclick="location.reload()" style="margin-left:8px; opacity:0.6;">Full Reload</button>`;
    }, 600);
  }

  function checkLevelUp() {
    let req = CONSTANTS.XP_BASE * Math.pow(CONSTANTS.XP_MULT, player.level - 1);
    if (player.xp >= req) {
      player.xp -= req; player.level++; player.statPoints += 1; player.talentPoints += 1;
      player.hp = player.maxHp; player.mp = player.maxMp; logMsg("LEVEL UP!"); triggerLevelUpVisuals();
      // ── QUEST ENGINE EVENT: level_up ──
      if (typeof QuestEngine !== 'undefined') QuestEngine.emit('level_up', { level: player.level });
    }
  }

  function triggerLevelUpVisuals() {
    window.levelUpFlash = 1.0;
    Sound.playTone(800, 'sine', 0.5, 0.1, 1200);
    // Fireworks effect: radiating colored lines
    for(let i = 0; i < 12; i++) {
      let angle = Math.PI * 2 * i / 12;
      let dx = Math.cos(angle) * 3;
      let dy = Math.sin(angle) * 3;
      activeEffects.push({
        x1: player.x, y1: player.y,
        x2: player.x + dx, y2: player.y + dy,
        color: `hsl(${i * 30}, 100%, 60%)`,
        life: 1.0
      });
    }
  }

  window.resolveEnemyDefeat = function(enemyIndex, options = {}) {
    let e = enemies[enemyIndex];
    if(!e) return;

    if(e.type === 'ifrit' && e.isIfrit) {
      let ifritLoot = [{icon:'🔥📘', qty:1}];
      if(Math.random() < 0.5 && player.level >= 20) {
        ifritLoot.push({icon:'🧳✨', qty:1});
        logMsg("<span style='color:#FFD700'>An Enchanted Valise falls from the ashes!</span>");
      }
      // B37: Scavenger talent auto-loots on kill (no manual toggle required)
      if(player.talents && player.talents['autoLoot']) {
        logMsg(`<span style='color:var(--success)'>Your Scavenger instincts kick in! You automatically loot the Ifrit.</span>`);
        ifritLoot.forEach(item => {
          let slot = inventory.findIndex(s => s === null);
          if(slot !== -1) inventory[slot] = {icon: item.icon, qty: item.qty};
          else tryPlaceInPouch(item);
        });
        renderInventory(); renderPouch(); updateUI();
      } else {
        createCorpse(e.x, e.y, e.type, e.stats, ifritLoot);
      }
      player.xp += 500;
      checkLevelUp();
      enemies.splice(enemyIndex, 1);
      return;
    }

    if (typeof QuestEngine !== 'undefined') {
      QuestEngine.emit('kill', { type: e.type });
      QuestEngine._counters['kill_total'] = (QuestEngine._counters['kill_total'] || 0) + 1;
      if (e.type === 'mouse' || e.type === 'cockroach') {
        QuestEngine._counters['kill_vermin'] = (QuestEngine._counters['kill_vermin'] || 0) + 1;
      }
      // B2: Only count kills toward the guard dungeon quest when actually in the dungeon
      // (not in town, beach, fields, or other non-dungeon scenes, and not farm animals/vermin)
      const FARM_ANIMAL_TYPES_KILL = new Set(['cow', 'chicken', 'duck', 'pig']);
      const VERMIN_TYPES = new Set(['mouse', 'cockroach']);
      const isDungeonKill = currentLevel >= 1 &&
        currentScene !== 'town' && currentScene !== 'beach' &&
        currentScene !== 'fields' && currentScene !== 'nest' &&
        !FARM_ANIMAL_TYPES_KILL.has(e.type) && !VERMIN_TYPES.has(e.type);
      if (isDungeonKill) {
        QuestEngine._counters['kill_dungeon'] = (QuestEngine._counters['kill_dungeon'] || 0) + 1;
      }
    }
    if (e.type === 'cow' || e.type === 'chicken') player.killedPassive = true;
    if(typeof Sound !== 'undefined') {
      if(e.type === 'goose' && Sound.honk) Sound.honk();
      else if((e.type === 'ram' || e.type === 'ewe' || e.type === 'sheep') && Sound.baa) Sound.baa();
      else if(e.type === 'mule' && Sound.bray) Sound.bray();
    }

    // #1: Farm animal kill in town — Dennis warning/debt escalation
    if(currentScene === 'town' && (e.type === 'cow' || e.type === 'chicken' || e.type === 'duck')) {
      player.townAnimalKills = (player.townAnimalKills || 0) + 1;
      if(!player.dennisWarned && player.townAnimalKills >= 2) {
        player.dennisWarned = true;
        logMsg("<span style='color:#aaa; font-style:italic;'>You hear Dennis muttering in the distance: \"Something strange is happening to the animals...\"</span>");
      } else if(player.dennisWarned) {
        player.dennisAnimalDebt = (player.dennisAnimalDebt || 0) + 100;
        player.dennisAnimalFurious = true;
        const cost = player.dennisAnimalDebt;
        logMsg(`<span style='color:var(--error)'>Dennis storms over, face red: "MY ANIMALS! You MONSTER! Get away from me until you pay ${cost}g!"</span>`);
        if(typeof Sound !== 'undefined' && Sound.playVoice) Sound.playVoice('voice_dennis_animals_furious');
        QuestEngine && QuestEngine.emit('dennis_animal_fury', { kills: player.townAnimalKills, debt: cost });
      }
    }

    let corpseLoot = [];

    if(e.outdoorCritter === 'chipmunk') {
      corpseLoot.push({icon:'🫘', qty:1});
      if(Math.random() < 0.35) corpseLoot.push({icon:'🪶', qty:1});
      player.xp += 12;
      logMsg(`<span style='color:#888'>The chipmunk vanishes into the grass, leaving behind a tiny stash of seeds.</span>`);
    } else if(e.outdoorCritter === 'bird') {
      corpseLoot.push({icon:'🪶', qty:1});
      if(Math.random() < 0.5) corpseLoot.push({icon:'🫘', qty:1});
      player.xp += 12;
      logMsg(`<span style='color:#888'>A startled burst of feathers and seed husks is all that remains.</span>`);
    } else if(e.type === 'mouse') {
      let roll = Math.random();
      if(roll < 0.05) corpseLoot.push({icon:'📋', qty:1});
      else if(roll < 0.25) corpseLoot.push({icon:'🧀', qty:1});
      corpseLoot.push({icon:'🪙', qty: 1 + Math.floor(Math.random() * 3)});
      player.xp += 10; player.verminKills = (player.verminKills || 0) + 1;
      if(player.verminKills >= 10) awardAchievement('vermin_slayer');
    } else if(e.type === 'cockroach') {
      corpseLoot.push({icon:'🦗', qty:1});
      if(Math.random() < 0.3) corpseLoot.push({icon:'🪙', qty:1});
      player.xp += 5; player.verminKills = (player.verminKills || 0) + 1;
      if(player.verminKills >= 10) awardAchievement('vermin_slayer');
    } else if(e.type === 'chicken') {
      if(typeof Sound !== 'undefined' && Sound.cluck) Sound.cluck();
      // B4 FIX: Chickens only drop meat or feather — no gold
      let chickenRoll = Math.random();
      if(chickenRoll < 0.60) corpseLoot.push({icon:'🍗', qty:1});       // 60% meat
      else if(chickenRoll < 0.90) corpseLoot.push({icon:'🪶', qty:1});  // 30% feather
      // 10% nothing
      // E17: 15% poop drop from chickens
      if(Math.random() < 0.15) corpseLoot.push({icon:'💩', qty:1});
      player.xp += 8;
      logMsg(`<span style='color:#888'>The chicken flaps once and goes still.</span>`);
    } else if(e.type === 'duck') {
      Sound.quack();
      // B4 FIX: Ducks are farm birds — no gold, only meat/feather
      let duckRoll = Math.random();
      if(duckRoll < 0.60) corpseLoot.push({icon:'🍗', qty:1});       // 60% meat
      else if(duckRoll < 0.90) corpseLoot.push({icon:'🪶', qty:1});  // 30% feather
      // 10% nothing
      // E17: 15% poop drop from ducks
      if(Math.random() < 0.15) corpseLoot.push({icon:'💩', qty:1});
      player.xp += 15;
      player.duckKills = (player.duckKills || 0) + 1;
      if(player.duckKills >= 5 && !achievements['duck_hunter']) {
        showDuckHuntDogLaugh();
        awardAchievement('duck_hunter');
      }
      logMsg(`<span style='color:#888'>The duck lets out a final quack before falling silent.</span>`);
    } else if(e.type === 'wet_rat') {
      let roll = Math.random();
      if(roll < 0.3) corpseLoot.push({icon:'🐀💦', qty:1});
      else corpseLoot.push({icon:'🧀', qty:1});
      player.xp += 20;
      logMsg(`<span style='color:#888'>The wet rat squeaks one last time.</span>`);
    } else if(e.type === 'pixie') {
      corpseLoot.push({icon:'💎✨', qty:1});
      if(Math.random() < 0.35) corpseLoot.push({icon:'🌿', qty:1});
      player.xp += 30;
      logMsg(`<span style='color:#88f'>Pixie dust and a Resurrection Crystal scatter across the ground.</span>`);
    } else if(e.type === 'shark') {
      let roll = Math.random();
      if(roll < 0.15) {
        corpseLoot.push({icon:'👔🦈', qty:1});
        logMsg(`<span style='color:#FFD700'>🦈 The mighty shark drops a pristine Sharkskin Suit!</span>`);
      } else if(roll < 0.5) {
        corpseLoot.push({icon:'🦷', qty:1});
        logMsg(`<span style='color:#88FF88'>🦷 You claim a shark tooth as a trophy!</span>`);
      }
      corpseLoot.push({icon:'🪙', qty: 25 + Math.floor(Math.random() * 50)});
      if(Math.random() < 0.4) corpseLoot.push({icon:'🧪', qty:2});
      if(Math.random() < 0.3 && player.level >= 20) {
        corpseLoot.push({icon:'💼🌟', qty:1});
        logMsg(`<span style='color:#FFD700'>🦈 A Bag of Holding surfaces from the depths!</span>`);
      }
      player.xp += 100;
      logMsg(`<span style='color:#FFD700'>🦈 The mighty shark is slain!</span>`);
    } else if(e.type === 'castle_rat') {
      if(!player.caughtByRat) {
        player.caughtByRat = true;
        logMsg(`<span style='color:var(--error)'>🐀 The Castle Rat sounds an alarm! Guards drag you to a cell!</span>`);
        if(typeof QuestEngine !== 'undefined') QuestEngine.emit('castle_rat_caught', {});
        setTimeout(() => spawnCell(), 800);
      }
      player.xp += 50;
    } else if(e.type === 'thief') {
      player.xp += 75;
      player.thief_killed = true;
      addFloatingText(e.x, e.y, "+75xp", "#8cf", 14);
      if(stolenItems.length > 0) {
        logMsg(`<span style='color:var(--success)'>The thief drops your stolen belongings!</span>`);
        stolenItems.forEach(item => corpseLoot.push({icon: item.icon, qty: 1}));
        stolenItems.length = 0;
      }
      changeGold(15 + Math.floor(Math.random() * 30));
    } else if(e.type === 'mimic') {
      corpseLoot.push({icon:'🗝️', qty:1});
      corpseLoot.push({icon:'🪙', qty: 30 + Math.floor(Math.random() * 40)});
      if(Math.random() < 0.35) corpseLoot.push({icon:'💍', qty:1});
      player.xp += 90;
      addFloatingText(e.x, e.y, "+90xp", "#8cf", 14);
      if(typeof Sound !== 'undefined' && Sound.playSample) Sound.playSample('mimic_laugh', 0.5);
      logMsg("<span style='color:#FFD700'>The Mimic collapses into splintered boards, keys, and a spray of stolen gold.</span>");
    } else if(e.type === 'genie') {
      // E9: Genie boss — guaranteed Tome of Town Portal drop (100%)
      let xpReward = 20 + currentLevel * 10;
      player.xp += xpReward;
      addFloatingText(e.x, e.y, `+${xpReward}xp`, "#8cf", 14);
      corpseLoot = generateLoot(e.type, e.stats);
      // Always add Tome of Town Portal
      corpseLoot.push({icon: '📖🌀', qty: 1});
      logMsg("<span style='color:#FFD700'>✨ The Genie's power dissipates! A shimmering tome falls from the swirling smoke...</span>");
      logMsg("<span style='color:#88CCFF'>📖🌀 You find the Tome of Town Portal!</span>");
    } else if(e.type === 'cow') {
      if(typeof Sound !== 'undefined' && Sound.moo) Sound.moo();
      // E17: Cow loot — meat plus 15% poop, no gold
      corpseLoot.push({icon:'🍖', qty:1});
      if(Math.random() < 0.4) corpseLoot.push({icon:'🧀', qty:1});
      if(Math.random() < 0.15) corpseLoot.push({icon:'💩', qty:1}); // E17
      player.xp += 20;
      logMsg(`<span style='color:#888'>The cow moos one last time.</span>`);
    } else if(e.type === 'pig') {
      if(typeof Sound !== 'undefined' && Sound.oink) Sound.oink();
      // E17: Pig loot — meat plus 15% poop, no gold
      corpseLoot.push({icon:'🍖', qty:1});
      if(Math.random() < 0.15) corpseLoot.push({icon:'💩', qty:1}); // E17
      player.xp += 15;
      logMsg(`<span style='color:#888'>The pig oinks feebly and goes still.</span>`);
    } else if(e.type === 'trex') {
      // E15: T-Rex defeat — earth-shaking collapse with blood splatter
      logMsg("<span style='color:#FFD700'>🦖 THE T-REX COLLAPSES! The ground shakes!</span>");
      Sound.trexRoar();
      for(let i=0;i<6;i++) {
        const angle = (i/6)*Math.PI*2;
        addFloatingText(e.x + Math.cos(angle), e.y + Math.sin(angle), '🩸', '#f00', 18);
      }
      corpseLoot.push({icon:'🦴', qty: 1+Math.floor(Math.random()*2)});
      if(Math.random() < 0.3) corpseLoot.push({icon:'🍖', qty:1});
      player.xp += 800;
      addFloatingText(e.x, e.y, '+800xp', '#FFD700', 18);
      checkLevelUp();
    } else {
      let xpReward = 20 + currentLevel * 10;
      player.xp += xpReward;
      addFloatingText(e.x, e.y, `+${xpReward}xp`, "#8cf", 14);
      corpseLoot = generateLoot(e.type, e.stats);
    }

    if(corpseLoot.length > 0) {
      // B37: Scavenger talent — auto-loot immediately on kill (no manual toggle required)
      if(player.talents && player.talents['autoLoot']) {
        let enemyName = (MONSTER_DEF[e.type] && MONSTER_DEF[e.type].name) || e.type;
        logMsg(`<span style='color:var(--success)'>Your Scavenger instincts kick in! You automatically loot the ${enemyName}.</span>`);
        corpseLoot.forEach(item => {
          if(item.icon === '🪙') {
            changeGold(item.qty, { x: e.x, y: e.y, floatText: true });
          } else {
            let slot = inventory.findIndex(s => s === null);
            if(slot !== -1) { inventory[slot] = {icon: item.icon, qty: item.qty || 1}; }
            else tryPlaceInPouch(item);
          }
        });
        renderInventory(); renderPouch(); updateUI();
      } else {
        createCorpse(e.x, e.y, e.type, e.stats, corpseLoot);
      }
    }

    checkLevelUp();
    enemies.splice(enemyIndex, 1);
  };

  // Stubs — replaced by player.js functions when loaded
  if(typeof getPlayerDmgVersus === 'undefined') {
    window.getPlayerDmgVersus = function(e) { return Math.floor(Math.random() * (player.baseDmg||3) + 1 + (player.meleeDmgBonus||0)); };
    window.getPlayerHits = function(e) { return Math.random() < (player.hitRate||0.85); };
    window.getPlayerPrimaryHand = function() { return player.equipped && player.equipped.leftHand; };
    window.getPlayerCritRate = function() { return player.critRate || 0; };
  }

  // Damages enemy (if dmg passed is > 0).
  // Gives player a chance for a critical hit, and logs a message if that happens.
  function applyDamageToEnemy(dmg, enemy) {
    if(dmg > 0 && Math.random() < getPlayerCritRate()) {
      const dmgPlus = Math.max(1, Math.round(dmg * 0.5));
      dmg += dmgPlus;
      logMsg(`<span style='color:#6fd'>Extra ${dmgPlus} damage to enemy from crit!</span>`);
    }
    enemy.stats.hp -= dmg;
    return dmg;
  }

  function doCombat(enemyIndex) {
    let e = enemies[enemyIndex]; if(!e) return;
    if(e.type === 'master' || e.type === 'pirate') { insultBattle(enemyIndex); return; }
    let dmg = getPlayerDmgVersus(e);

    // B760.MIMIC: opening/attacking a mimic wakes and aggros it.
    if(e.type === 'mimic' && e.isMimic) {
      if(!e.provoked) {
        e.provoked = true;
        e.stats.passive = false;
        e.stats.speed = Math.max(0.9, e.stats.speed || 0.9);
        logMsg("<span style='color:var(--error)'>📦 The chest splits open — it's a mimic!</span>");
        if(typeof Sound !== 'undefined' && Sound.playSample) Sound.playSample('mimic_reveal', 0.75);
      }
    }

    // Ifrit Boss combat — level 10 equivalent, drops Tome of Fireball on death
    // Attacking Ifrit provokes him into retaliation
    if(e.type === 'ifrit' && e.isIfrit) {
      if(!e.provoked) {
        e.provoked = true;
        logMsg("<span style='color:var(--error)'>🔥 Ifrit: 'You DARE strike me?! Now you burn!'</span>");
        if(typeof Sound !== 'undefined' && Sound.playVoice) Sound.playVoice('voice_ifrit_provoked');
      }
      if (!getPlayerHits(e)) {
        logMsg(`You miss the ${e.type}.`);
        advanceTurn(1);
        return;
      }
      let ifritDmg = dmg;
      ifritDmg = applyDamageToEnemy(ifritDmg, e);
      Sound.sword();
      Sound.playTone(200, 'sawtooth', 0.3, 0.1, 400);
      addFloatingText(e.x, e.y, `-${ifritDmg}`, "#f00", 16 + ifritDmg);
      if(window.WebGLFX && WebGLFX.onCombatImpact) WebGLFX.onCombatImpact(ifritDmg, e.x, e.y);
      if(player.level < 10) {
        logMsg("<span style='color:#f60'>Ifrit barely flinches! You need to be level 10+ to deal full damage.</span>");
      }
      if(e.stats.hp <= 0) {
        logMsg("<span style='color:#FFD700'>🔥 IFRIT DEFEATED! The fire elemental crumbles to ash!</span>");
        let ifritLoot = [{icon:'🔥📘', qty:1}];
        if(Math.random() < 0.5 && player.level >= 20) {
          ifritLoot.push({icon:'🧳✨', qty:1});
          logMsg("<span style='color:#FFD700'>An Enchanted Valise falls from the ashes!</span>");
        }
        // B37: Scavenger talent auto-loots on kill (no manual toggle required)
        if(player.talents && player.talents['autoLoot']) {
          logMsg(`<span style='color:var(--success)'>Your Scavenger instincts kick in! You automatically loot the Ifrit.</span>`);
          ifritLoot.forEach(item => {
            let slot = inventory.findIndex(s => s === null);
            if(slot !== -1) inventory[slot] = {icon: item.icon, qty: item.qty};
            else tryPlaceInPouch(item);
          });
          renderInventory(); renderPouch(); updateUI();
        } else {
          createCorpse(e.x, e.y, e.type, e.stats, ifritLoot);
        }
        player.xp += 500;
        checkLevelUp();
        enemies.splice(enemyIndex, 1);
      } else {
        let hpPct = Math.floor((e.stats.hp / 300) * 100);
        logMsg(`Ifrit crackles with flame! (${hpPct}% HP remaining)`);
      }
      advanceTurn(1);
      return;
    }

    // Black Knight Limb-Loss (v7.2.0)
    if (e.type === 'black_knight') {
      Sound.sword();
      if (!getPlayerHits(e)) {
        logMsg(`You miss the ${e.type}.`);
      }
      else {
        dmg = applyDamageToEnemy(dmg, e);
        addFloatingText(e.x, e.y, `-${dmg}`, "#f00", 16 + dmg);
        let pct = e.stats.hp / 200;
        if (pct <= 0.75 && player.knightLimb === 0) { player.knightLimb = 1; logMsg("'Tis but a scratch!' (Damage Reduced)"); e.stats.dmg -= 5; }
        if (pct <= 0.50 && player.knightLimb === 1) { player.knightLimb = 2; logMsg("'Just a flesh wound!'"); e.stats.dmg -= 5; }
        if (pct <= 0.25 && player.knightLimb === 2) { player.knightLimb = 3; logMsg("'I'll bite your legs off!' (Speed Reduced)"); e.stats.speed = 0.1; e.stats.icon = '🦵'; }
        if (e.stats.hp <= 0) {
          logMsg("'Alright, we'll call it a draw!'");
          createCorpse(e.x, e.y, e.type, e.stats, [{icon:'🦵', qty:1}]);
          enemies.splice(enemyIndex, 1); player.xp += 500; checkLevelUp();
        }
      }
      advanceTurn(1);
      return;
    }

    if(getPlayerPrimaryHand() === '🪗') {
      // Using Accordion in battle.
      Sound.polka();
      logMsg(`<span style='color:var(--warning)'>You strike up a catastrophic little polka at the ${e.type}. It hurts nobody and improves nothing.</span>`);
      awardAchievement('neros_polka');
    }
    else {
      Sound.sword();

      // Check to see if player misses.
      if (getPlayerHits(e)) {
        dmg = applyDamageToEnemy(dmg, e);
        logMsg(`You hit the ${e.type} for ${dmg} damage.`);
        // Provoke passive/friendly animals when attacked
        if(e.stats.passive || e.friendly || e.farmAnimal) {
          e.provoked = true;
          // 50% chance to fight back, 50% chance to panic-flee
          e.stats.passive = false;
          if(Math.random() < 0.5) {
            e.fleePlayer = true;
            e.stats.speed = (e.stats.speed || 1) * 2;
          }
        }

        // Quack sound when hitting ducks
        if(e.type === 'duck') {
          Sound.quack();
        }

        addFloatingText(e.x, e.y, `-${dmg}`, "#f00", 16 + dmg);
        if(window.WebGLFX && WebGLFX.onCombatImpact) WebGLFX.onCombatImpact(dmg, e.x, e.y);
        if (e.stats.hp <= 0) {
          logMsg(`The ${e.type} is slain.`);
          window.resolveEnemyDefeat(enemyIndex);
        }
      }
      else {
        logMsg(`You miss the ${e.type}.`);
      }
    }

    advanceTurn(1);
  }

  // === Battle of Wits / Insult Sword Fighting (Monkey Island style) ===
  // The pirate or swordmaster challenges you to a duel of insults.
  // You must pick the correct retort to each insult. Get it right, you land a hit.
  // Get it wrong, the enemy hits you. First to land 3 hits wins.
  // INSULT LEARNING SYSTEM: Learn insults from pirates, then use them against the swordmaster.
  const INSULT_BATTLES = {
    pirateWrongChoices: ["How does that make you feel?", "Your mother was a hamster.", "I'm rubber, you're glue.", "Nice weather we're having."],
    pirate: [
      { insult: "You fight like a dairy farmer!",       retort: "How appropriate. You fight like a cow!",              correct: true },
      { insult: "I've spoken with apes more polite than you!", retort: "Strange. I've always thought apes had better manners.", correct: true },
      { insult: "Soon you'll be wearing my sword like a shish kebab!", retort: "First you'd better stop waving it around like a feather duster!", correct: true },
      { insult: "I'm not going to take your insolence sitting down!", retort: "Your hemorrhoids are flaring up again, eh?", correct: true },
      { insult: "I once owned a dog that was smarter than you.", retort: "He must have taught you everything you know.", correct: true },
      { insult: "Nobody's ever drawn blood from me and nobody ever will.", retort: "You run THAT fast?", correct: true },
      { insult: "I've heard you were a contemptible sneak.",  retort: "Too bad no one's ever heard of YOU at all.", correct: true },
      { insult: "If your brother's like you, better to marry a pig.", retort: "You make me feel like a married man... with no wife.", correct: false },
      { insult: "You're as repulsive as a monkey in a negligee.", retort: "I'm glad you noticed. I was aiming for 'irresistible'.", correct: true },
      { insult: "I've got a nasty cough, but it's nothing compared to your face.", retort: "At least my face won't be coughing on you for much longer.", correct: true },
      { insult: "You make me want to puke.", retort: "Funny. You make me want to eat a whole wheel of cheese.", correct: true },
      { insult: "You're no match for my skills!", retort: "You're right. I'm not a match for your lack of skills.", correct: true },
      { insult: "I've beaten better men than you!", retort: "And I've beaten worse. We all have our standards.", correct: true },
      { insult: "Your mother was a hamster and your father smelt of elderberries!", retort: "Now is the time for all good men to come to the aid of their party!", correct: true },
      { insult: "You fight like a troglodyte!", retort: "And you fight like a... wait, what's a troglodyte?", correct: true },
      { insult: "You're as weak as a kitten!", retort: "And you're as strong as a... slightly stronger kitten.", correct: true },
    ],
    master: [
      { insult: "My swordplay is unmatched in all the land!", retort: "Then why do you still fight like a beginner?", correct: true },
      { insult: "I've defeated a thousand warriors before you!", retort: "And I've eaten a thousand chickens. We all have hobbies.", correct: true },
      { insult: "Your blade is as dull as your wit!",          retort: "At least I HAVE a wit. You're still looking for yours.", correct: true },
      { insult: "You're no match for my years of training!",   retort: "Training? Is that what you call falling down stairs?", correct: true },
      { insult: "I shall make short work of you!",             retort: "Short work? Is that a height joke?", correct: true },
      { insult: "Your technique is sloppy and pathetic!",      retort: "Sloppy? I'm just giving you false hope.", correct: true },
      { insult: "Prepare to meet your doom!",                  retort: "Doom? I thought we were playing chess.", correct: false },
      { insult: "I am the greatest swordsman in the land!", retort: "And I'm the greatest swordsman in the land. Wait, we can't both be right.", correct: true },
      { insult: "You fight like a dairy farmer!", retort: "How appropriate. You fight like a cow!", correct: true },
      { insult: "Soon you'll be wearing my sword like a shish kebab!", retort: "First you'd better stop waving it around like a feather duster!", correct: true },
      { insult: "I once owned a dog that was smarter than you.", retort: "He must have taught you everything you know.", correct: true },
      { insult: "Nobody's ever drawn blood from me and nobody ever will.", retort: "You run THAT fast?", correct: true },
      { insult: "I've heard you were a contemptible sneak.",  retort: "Too bad no one's ever heard of YOU at all.", correct: true },
      { insult: "You're as repulsive as a monkey in a negligee.", retort: "I'm glad you noticed. I was aiming for 'irresistible'.", correct: true },
      { insult: "You fight like a troglodyte!", retort: "And you fight like a... wait, what's a troglodyte?", correct: true },
      { insult: "You're as weak as a kitten!", retort: "And you're as strong as a... slightly stronger kitten.", correct: true },
    ]
  };

  // #7 FIX: Insult battle mechanics — pride system, no-HP battles.
  // On collision: regular battle with all misses for first 3 swings.
  // Then pirate insults. Player starts with only bad retorts, learns progressively.
  // Pride system: winning pirate flees, losing pirate stands ground.
  // No HP loss for either side — just pride.
  window.insultBattle = (enemyIndex) => {
    let e = enemies[enemyIndex];
    if(!e) return;
    let type = e.type;
    let pool = INSULT_BATTLES[type] || INSULT_BATTLES.pirate;

    // If this is the first insult battle for this enemy, show the "missed swings" intro
    if(!e._insultRoundCount) {
      e._insultRoundCount = 0;

      // Show the "missed swings" intro — 3 failed attacks
      let m = document.getElementById('modal-content');
      const introPortrait = type === 'master'
        ? modalPortraitHTML('npc_swordmaster_modal', '🤺')
        : modalPortraitHTML(lowlyPirateModalSprite(e), '🏴‍☠️');
      m.innerHTML = `<h2>⚔️ Battle of Wits!</h2>
        ${introPortrait}
        <p>You and the ${type} circle each other, swords clashing!</p>
        <p><em>You swing... miss. ${type} swings... miss. You swing... miss.</em></p>
        <p style="font-size:11px; color:#888;">Three unremarkable passes. Now the ${type} draws breath for an insult...</p>
        <button onclick="beginInsultRound(${enemyIndex})" style="margin-top:8px;">Ready Yourself</button>`;
      showOverlay();
      return;
    }

    // Subsequent round — already learned some retorts
    beginInsultRound(enemyIndex);
  };

  window.beginInsultRound = (enemyIndex) => {
    let e = enemies[enemyIndex];
    if(!e) return;
    hideOverlay();
    let type = e.type;
    let pool = INSULT_BATTLES[type] || INSULT_BATTLES.pirate;

    // B760.INSULT_BATTLE: randomize who insults first.
    // If player opens, they can learn a missing retort from pirate's comeback.
    if((type === 'pirate' || type === 'master') && !e._insultPlayerOpened && player.learnedInsults && player.learnedInsults.length > 0 && Math.random() < 0.45) {
      let m = document.getElementById('modal-content');
      if(m) {
        const choices = [];
        // Learned/opening insults
        const learned = player.learnedInsults.slice(0);
        while(choices.length < 2 && learned.length > 0) {
          const li = learned.splice(Math.floor(Math.random() * learned.length), 1)[0];
          const l = INSULT_BATTLES.pirate[li];
          if(l) choices.push({ text: l.insult, idx: li, known: true });
        }
        // Add one deliberately bad opener
        const bad = [
          'Your hat smells like old soup.',
          'Prepare yourself for mediocre banter!',
          'I object to your entire pirate vibe.'
        ];
        choices.push({ text: bad[Math.floor(Math.random() * bad.length)], idx: -1, known: false });
        m.innerHTML = `<h2>⚔️ Battle of Wits!</h2>
          ${type === 'master' ? modalPortraitHTML('npc_swordmaster_modal', '🤺') : modalPortraitHTML(lowlyPirateModalSprite(e), '🏴‍☠️')}
          <p><em>You get the first insult. Pick your opener:</em></p>
          ${choices.map(c => `<button onclick="playerOpenInsultChoice(${enemyIndex}, ${c.idx}, ${c.known})" style="display:block; margin:4px 0; width:100%;">"${c.text}"</button>`).join('')}`;
        showOverlay();
      }
      if(type === 'master') playRandomVoice('voice_player_master_insult_', 3);
      else playRandomVoice('voice_player_lowly_insult_', 3);
      return;
    }
    e._insultPlayerOpened = false;

    e._insultRoundCount = (e._insultRoundCount || 0) + 1;

    // INSULT LEARNING SYSTEM:
    let round;
    if(type === 'master') {
      // Swordmaster only uses insults you've learned from pirates
      let learnedPirateInsults = INSULT_BATTLES.pirate.filter((insult, index) =>
        player.learnedInsults.includes(index)
      );

      if(learnedPirateInsults.length === 0) {
        let m = document.getElementById('modal-content');
        m.innerHTML = `<h2>⚔️ Battle of Wits!</h2>
          ${modalPortraitHTML('npc_swordmaster_modal', '🤺')}
          <p><em>"You dare challenge me? You haven't even learned the basics of insult sword fighting!"</em></p>
          <p style="font-size:11px; color:#888;">You need to learn insults from pirates first.</p>
          <button onclick="hideOverlay()" style="margin-top:12px; background:var(--surface-container);">Flee!</button>`;
        showOverlay();
        playRandomVoice('voice_player_wrong_insult_', 2);
        return;
      }

      round = learnedPirateInsults[Math.floor(Math.random() * learnedPirateInsults.length)];
    } else {
      round = pool[Math.floor(Math.random() * pool.length)];
    }

    e.currentInsult = round.insult;

    // Voice the pirate's insult
    if(type === 'pirate' && typeof Sound !== 'undefined' && Sound.playVoice) {
      if(!e._pirateVoiceIdx) e._pirateVoiceIdx = 1 + Math.floor(Math.random() * 5);
      const vNum = e._pirateVoiceIdx;
      const insultIdx = INSULT_BATTLES.pirate.findIndex(r => r.insult === round.insult);
      const clipKey = `voice_pirate${vNum}_insult_${(insultIdx >= 0 && insultIdx < 2) ? insultIdx : 0}`;
      Sound.playVoice(clipKey);
    }
    if(type === 'master' && typeof Sound !== 'undefined' && Sound.playVoice) {
      const masterTauntIdx = Math.min(3, Math.floor(Math.random() * 4));
      Sound.playVoice(`voice_swordmaster_taunts_${masterTauntIdx}`);
    }

    let m = document.getElementById('modal-content');
    Sound.insultClash();

    // Build retort choices
    // #7: If player hasn't learned this retort, the "correct" answer is unknown
    let playerKnowsRetort = false;
    let correctRetort = round.retort;
    if(type === 'pirate') {
      let insultIdx = INSULT_BATTLES.pirate.findIndex(r => r.insult === round.insult);
      if(insultIdx !== -1 && player.learnedRetorts.includes(insultIdx)) {
        playerKnowsRetort = true;
      }
    } else {
      playerKnowsRetort = true; // vs swordmaster, use the pool normally
    }

    let wrongAnswers;
    if(type === 'pirate') {
      wrongAnswers = [...INSULT_BATTLES.pirateWrongChoices];
    } else {
      wrongAnswers = pool.filter(r => !r.correct).map(r => r.retort);
    }
    if(wrongAnswers.length < 2) wrongAnswers = ["I yield!", "You win this round!", "Is that all you've got?"];

    let choices;
    if(playerKnowsRetort) {
      choices = [correctRetort, wrongAnswers[0], wrongAnswers[1]];
    } else {
      // Player doesn't know the retort — show only bad answers
      choices = [wrongAnswers[0], wrongAnswers[1], wrongAnswers[2] || "Oh yeah?!"];
    }
    // Shuffle
    for(let i = choices.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }

    const roundPortrait = type === 'master'
      ? modalPortraitHTML('npc_swordmaster_modal', '🤺')
      : modalPortraitHTML(lowlyPirateModalSprite(e), '🏴‍☠️');
    m.innerHTML = `<h2>⚔️ Battle of Wits!</h2>
      ${roundPortrait}
      <p><em>"${round.insult}"</em></p>
      ${!playerKnowsRetort ? '<p style="font-size:11px; color:#c33;">You don\'t know the right retort yet!</p>' : '<p style="font-size:11px; color:#888;">Choose your retort wisely...</p>'}
      ${choices.map((c, i) => `<button onclick="resolveInsultBattle(${enemyIndex}, ${c === correctRetort}, '${type}')" style="display:block; margin:4px 0; width:100%;">"${c}"</button>`).join('')}
      <button onclick="hideOverlay()" style="margin-top:12px; background:var(--surface-container);">Flee!</button>`;
    showOverlay();
  };

  window.continueInsultRound = (enemyIndex) => {
    let e = enemies[enemyIndex];
    if(e) e._insultPlayerOpened = true;
    beginInsultRound(enemyIndex);
  };

  window.playerOpenInsultChoice = (enemyIndex, idx, known) => {
    const e = enemies[enemyIndex];
    if(!e) return;
    const type = e.type;
    const line = (idx >= 0 && INSULT_BATTLES.pirate[idx]) ? INSULT_BATTLES.pirate[idx] : null;
    let m = document.getElementById('modal-content');
    if(!m) return;
    const opener = line ? line.insult : 'Your hat smells like old soup.';
    const retort = line ? line.retort : 'That was so bad it physically hurt to hear.';
    m.innerHTML = `<h2>⚔️ Battle of Wits!</h2>
      ${type === 'master' ? modalPortraitHTML('npc_swordmaster_modal', '🤺') : modalPortraitHTML(lowlyPirateModalSprite(e), '🏴‍☠️')}
      <p><em>You strike first: "${opener}"</em></p>
      <p><em>The ${type} snaps back: "${retort}"</em></p>
      <button onclick="continueInsultRound(${enemyIndex})" style="margin-top:8px;">Continue</button>`;
    if(known && idx >= 0 && !player.learnedRetorts.includes(idx)) {
      player.learnedRetorts.push(idx);
      logMsg(`<span style='color:#88FF88'>You memorize the ${type}'s retort: "${retort}"</span>`);
    }
  };

  // #7: Pride system — no HP damage. Pirate flees on loss, stands ground on win.
  window.resolveInsultBattle = (enemyIndex, isCorrect, type) => {
    hideOverlay();
    let e = enemies[enemyIndex];
    if(!e) return;

    if(isCorrect) {
      if(type === 'master') playRandomVoice('voice_player_master_retort_', 3);
      else playRandomVoice('voice_player_lowly_retort_', 3);
      logMsg(`<span style='color:var(--success)'>You land a devastating insult! The ${type} is humiliated!</span>`);
      Sound.sword();

      // INSULT LEARNING: Always learn the insult/retort pair
      if(type === 'pirate') {
        let piratePool = INSULT_BATTLES.pirate;
        let insultIndex = piratePool.findIndex(insult => insult.insult === e.currentInsult);
        if(insultIndex !== -1) {
          if(!player.learnedInsults.includes(insultIndex)) {
            player.learnedInsults.push(insultIndex);
            logMsg(`<span style='color:#FFD700'>📚 You've learned a new insult! "${piratePool[insultIndex].insult}"</span>`);
          }
          if(!player.learnedRetorts.includes(insultIndex)) {
            player.learnedRetorts.push(insultIndex);
            logMsg(`<span style='color:#88FF88'>Correct retort learned: "${piratePool[insultIndex].retort}"</span>`);
          }
        }
      }

      // Pirate loses pride — flees to another part of the area
      e._prideLosses = (e._prideLosses || 0) + 1;
      if(e._prideLosses >= 1 || type === 'master') {
        // Pirate flees — teleport to random location
        let fleeX, fleeY, attempts = 0;
        do {
          fleeX = Math.floor(Math.random() * (mapW - 4)) + 2;
          fleeY = Math.floor(Math.random() * (mapH - 4)) + 2;
          attempts++;
        } while((theMap[fleeY] && !isTileFloor(theMap[fleeY][fleeX]) ||
                (Math.abs(fleeX - player.x) + Math.abs(fleeY - player.y) < 8)) && attempts < 50);
        e.x = fleeX; e.y = fleeY;
        logMsg(`<span style='color:var(--warning)'>The ${type} sneaks away to another part of the area, nursing wounded pride.</span>`);
      }
      player.xp += 20;
      addFloatingText(player.x, player.y, '📚', '#ffd', 16);
      drawMap(); updateUI();
    } else {
      playRandomVoice('voice_player_wrong_retort_', 3);
      // Wrong retort — pirate wins, player loses some pride but no HP
      logMsg(`<span style='color:var(--error)'>Wrong retort! The ${type} smirks at your embarrassment.</span>`);
      // #7: Player learns the insult they just saw (and its correct retort)
      // even though they answered wrong — they've now HEARD it
      if(type === 'pirate') {
        let piratePool = INSULT_BATTLES.pirate;
        let insultIndex = piratePool.findIndex(insult => insult.insult === e.currentInsult);
        if(insultIndex !== -1 && !player.learnedInsults.includes(insultIndex)) {
          player.learnedInsults.push(insultIndex);
          logMsg(`<span style='color:#aaa'>📚 You've seen this insult before. Maybe next time...</span>`);
        }
      }
      // Pirate stands ground on victory
      Sound.oof();
    }
    advanceTurn(1);
  };

   function monsterAttack(enemyIndex) {
    let e = enemies[enemyIndex];

    // Monsters can miss.
    let hitChance = e.stats.hit * (1 - player.dodgeRate);
    if (Math.random() >= hitChance) {
      logMsg(`The ${e.type} misses you.`);
      return;
    }

    // Monster damage is from 1 to their max, not always their max.
    let dmg = Math.floor(Math.random() * (e.stats.dmg || 1)) + 1;
    player.hp -= dmg;

    // Bug 13: Always show damage tint and floating text regardless of sleep state
    damageTint = 30;
    logMsg(`The ${e.type} hits you for ${dmg} damage.`);
    Sound.grunt();
    // Quack sound when duck attacks
    if(e.type === 'duck') {
      Sound.quack();
      logMsg(`<span style='color:#FFD700'>The duck quacks aggressively!</span>`);
    }
    addFloatingText(player.x, player.y, `-${dmg}`, "#f00", 16 + dmg);
    if(window.WebGLFX && WebGLFX.onPlayerDamage) WebGLFX.onPlayerDamage(dmg, e.type);

    // E15: T-Rex special attack — roar + stomp + stun chance
    if(e.type === 'trex') {
      Sound.trexRoar();
      Sound.trexStomp();
      if(Math.random() < 0.3) {
        player._stunned = 1;
        logMsg("<span style='color:#f44'>🦖 The T-Rex STOMPS! You're stunned!</span>");
      }
      addFloatingText(player.x, player.y, '💥', '#f00', 22);
    }

    // ── QUEST ENGINE EVENT: combat_hurt ──
    // LESSON: By emitting a generic event here, any quest can react to
    // the player taking damage from any monster type. The old shark-
    // specific code is now handled by the auto-trigger in quests_base.js.
    if (typeof QuestEngine !== 'undefined') {
      QuestEngine.emit('combat_hurt', { attacker: e.type, damage: dmg });
    }
    // Shark has a distinctive bite sound and blood spray
    if(e.type === 'shark') {
      Sound.sharkBite();
      addFloatingText(e.x, e.y, '🩸', '#cc0000', 24);
      addFloatingText(player.x, player.y, '🩸', '#cc0000', 24);
    }
    
    // #14: Mimic attacks with tumbling gold coins (ranged)
    if(e.isMimic && e.type === 'mimic') {
      Sound.playSample('mimic_attack', 0.7);
      Sound.playSample('ka_ching', 0.5);
      // Add tumbling gold coin visual effect
      activeEffects.push({
        kind: 'goldCoins',
        x1: e.x, y1: e.y,
        x2: player.x, y2: player.y,
        color: '#FFD700',
        life: 1.0,
        power: 0.8
      });
      addFloatingText(player.x, player.y, '🪙', '#FFD700', 18);
    }
    
    // Crown of Thorns — thorns damage to attacker
    let headSlot = player.equipped.head;
    if(headSlot && ITEM_DEF[headSlot] && ITEM_DEF[headSlot].thornsDmg) {
      let thorns = ITEM_DEF[headSlot].thornsDmg;
      e.stats.hp -= thorns;
      addFloatingText(e.x, e.y, `-${thorns}🌿`, "#8f8", 14);
      logMsg(`Crown of Thorns reflects ${thorns} damage!`);
      if(e.stats.hp <= 0) {
        logMsg(`The ${e.type} is destroyed by thorns!`);
        player.xp += 50; checkLevelUp();
        enemies.splice(enemyIndex, 1);
      }
    }
    if(player.hp <= 0) die();
  }

  function movePlayer(dx, dy) {
    if(isDead || player.isSleeping) return;
    // E15: T-Rex stomp stun check
    if(player._stunned && player._stunned > 0) {
      player._stunned--;
      logMsg("<span style='color:#f88'>You're stunned!</span>");
      advanceTurn(1); return;
    }
    player.facing = {dx, dy};
    let nx = player.x + dx, ny = player.y + dy;
    if(nx < 0 || nx >= mapW || ny < 0 || ny >= mapH) { Sound.oof(); return; }
    let tile = theMap[ny][nx];

    // #13: Background scene boundary collision check
    if(tile === TILES.BG_SCENE && window.BOUNDARY_DATA) {
      const bd = window.BOUNDARY_DATA[currentScene];
      if(bd) {
        const isWalkable = bd.walkable && bd.walkable.some(p => p.x === nx && p.y === ny);
        const isBlocked = bd.blocked && bd.blocked.some(p => p.x === nx && p.y === ny);
        if(!isWalkable || isBlocked) { Sound.oof(); return; }
      }
    }
    
    // Bridge Keeper (v7.2.0)
    let keeperIdx = enemies.findIndex(e => e.type === 'bridge_keeper' && e.x === nx && e.y === ny);
    if (keeperIdx !== -1 && !player.bridgeQuestions) { bridgeTrial(keeperIdx); return; }

    if (tile === TILES.LETTER) {
       let letter = window.letterMap ? window.letterMap[`${nx},${ny}`] : 'A';
       if ("IEHOVA".indexOf(letter) === -1) { logMsg("Wrong letter!"); isDead = true; die(); return; }
    }

    let eIdx = enemies.findIndex(e => e.x === nx && e.y === ny);
    if (eIdx !== -1) {
      // Non-hostile NPC interactions
      let npc = enemies[eIdx];
      if(npc.type === 'chaplain') {
        openShop('chaplain');
        return;
      }
      if(npc.type === 'blacksmith') {
        // B760.FORGE: always use the blacksmith shop modal with talking-head video.
        openShop('blacksmith');
        return;
      }
      if(npc.type === 'cain') {
        // E6: Deckard Cain heals player to full on first visit per town entry
        if(!window._cainHealedThisVisit) {
          window._cainHealedThisVisit = true;
          player.hp = player.maxHp;
          player.mp = player.maxMp;
          logMsg("<span style='color:#88ff88'>He places a hand on your shoulder...</span>");
          logMsg("<span style='color:#88ff88'>✨ Deckard Cain lays his hands upon you. You feel completely restored.</span>");
          addFloatingText(npc.x, npc.y, '+HEALED', '#88ff88', 18);
          Sound.playTone(440, 'sine', 0.3, 0.1, 600);
          setTimeout(() => Sound.playTone(660, 'sine', 0.2, 0.05, 400), 200);
          updateUI();
        }
        openShop('cain');
        return;
      }
      if(npc.type === 'dennis') {
        openShop('dennis');
        return;
      }
      // #33 FIX: Fence collision opens the stolen goods store
      if(npc.type === 'fence') {
        openShop('fence');
        return;
      }
      // #12: Town guard — discount quest (Bethesda-style civic duty reward)
      if(npc.type === 'town_guard') {
        openShop('town_guard');
        return;
      }
      // E.TRIST.MENDED_DRUM: Discworld bar NPCs
      if(['mended_drum_barman','cohen','librarian','vimes','bearded_dwarf'].includes(npc.type)) {
        openShop('mended_drum_barman');
        if(npc.type !== 'mended_drum_barman' && typeof storeTab === 'function') {
          setTimeout(() => storeTab('chat', 'mended_drum_barman'), 10);
        }
        return;
      }
      if(npc.type === 'dennis_wife') {
        openShop('dennis_wife');
        return;
      }
      // E.TRIST.5: Muck peasant
      if(npc.type === 'muck_peasant') {
        openShop('muck_peasant');
        return;
      }
      // E.TRIST.6: Retired soldier
      if(npc.type === 'retired_soldier') {
        openShop('retired_soldier');
        return;
      }
      // E.HAMLET: Rosencrantz & Guildenstern
      if(npc.type === 'rosencrantz_guildenstern') {
        openShop('rosencrantz_guildenstern');
        return;
      }
      // E.TRIST.4: Sheep — attackable
      if(npc.type === 'sheep') {
        doCombat(eIdx); return;
      }
      // #27 FIX / E8: FightingMaster — checks player level, advances QFG quest + interactive dialog
      if(npc.type === 'fighting_master') {
        if(player.level >= 5) {
          if(typeof QuestEngine !== 'undefined') QuestEngine.emit('fighter_trained', {});
          awardAchievement('warrior');
        } else if(typeof QuestEngine !== 'undefined') {
          QuestEngine.emit('fighting_master_met', {});
        }
        openShop('fighting_master');
        return;
      }
      if(npc.type === 'pacifist_orc') {
        if(lightTurns > 0 || (window.debugFlags && debugFlags.fullLight)) {
          if(!player._grokMetBefore) {
            grokFirstMeet(); // Was sleeping — wakes up grumpy
          } else {
            openPacifistOrc('intro');
          }
        } else {
          // Various dark-encounter hints, escalating with danger
          let grueDanger = player.grueDanger || 0;
          if(grueDanger > 8) {
            logMsg("<span style='color:#444; font-style:italic;'>Something enormous breathes very close to your face. Two things, actually. One of them sounds like it is trying not to laugh.</span>");
          } else {
            logMsg("<span style='color:#555; font-style:italic;'>Something large is breathing in the darkness. You should bring a light source before trying to talk to it.</span>");
          }
        }
        return;
      }
      if(npc.type === 'eagle' && currentScene === 'nest' && player.fedEagle) {
        logMsg("<span style='color:var(--success)'>The Great Eagle launches from the nest and bears you back to the mountain path.</span>");
        currentScene = 'mountain';
        if(!_restoreLevelFromCache(currentLevel)) initMap(50);
        calculateFOV(); drawMap(); updateUI();
        return;
      }
      if(npc.type === 'eagle' && currentScene === 'eagle_crag' && player.fedEagle) {
        logMsg("<span style='color:var(--success)'>The Eagle spreads its wings and carries you back down the mountain.</span>");
        currentLevel = 3;
        currentScene = 'dungeon';
        if(!_restoreLevelFromCache(currentLevel)) initMap(50);
        if(window._eagleCragDoor) {
          player.x = window._eagleCragDoor.x + 1;
          player.y = window._eagleCragDoor.y;
        }
        calculateFOV(); drawMap(); updateUI();
        return;
      }
      if(npc.type === 'eagle' && player.fedEagle) {
        logMsg("<span style='color:var(--success)'>The Eagle carries you to the next floor!</span>");
        currentLevel = 12; initMap(50); calculateFOV(); drawMap(); updateUI();
        return;
      }
      if(npc.type === 'eagle' && !player.fedEagle) {
        if(currentScene === 'eagle_crag') {
          logMsg("<span style='color:var(--warning)'>🦅 The Hungry Eagle eyes you hungrily from the crag.</span>");
          logMsg("<span style='color:#888'>It seems ravenous. Perhaps you could feed it something? (Use meat or food near the eagle)</span>");
        } else {
          logMsg("<span style='color:var(--warning)'>🦅 A hungry eagle perches on a crumbling crag. It looks at you plaintively.</span>");
          logMsg("<span style='color:#888'>It seems hungry. Perhaps you could feed it something? (Use food near the eagle)</span>");
        }
        return;
      }
      if(npc.type === 'eagle' && currentScene === 'eagle_crag' && player.fedEagle) {
        logMsg("<span style='color:var(--success)'>The Eagle spreads its wings and carries you back down the mountain.</span>");
        currentLevel = 3;
        currentScene = 'dungeon';
        if(!_restoreLevelFromCache(currentLevel)) initMap(50);
        if(window._eagleCragDoor) {
          player.x = window._eagleCragDoor.x + 1;
          player.y = window._eagleCragDoor.y;
        }
        calculateFOV(); drawMap(); updateUI();
        return;
      }
      if(npc.type === 'eagle' && player.fedEagle) {
        logMsg("<span style='color:var(--success)'>The Eagle carries you to the next floor!</span>");
        currentLevel = 12; initMap(50); calculateFOV(); drawMap(); updateUI();
        return;
      }
      if(npc.type === 'eagle' && !player.fedEagle) {
        if(currentScene === 'eagle_crag') {
          logMsg("<span style='color:var(--warning)'>🦅 The Hungry Eagle eyes you hungrily from the crag.</span>");
          logMsg("<span style='color:#888'>It seems ravenous. Perhaps you could feed it something? (Use meat or food near the eagle)</span>");
        } else {
          logMsg("<span style='color:var(--warning)'>🦅 A hungry eagle perches on a crumbling crag. It looks at you plaintively.</span>");
          logMsg("<span style='color:#888'>It seems hungry. Perhaps you could feed it something? (Use food near the eagle)</span>");
        }
        return;
      }
      // KQ5: Floor 10 Genie boss — 4x size guardian of the dungeon exit.
      // If player has the Brass Bottle (from safe cracking quest), genie offers a wish.
      // Otherwise, it attacks as a boss fight.
      if(npc.type === 'genie' && npc.isGenieGuardian) {
        const hasBottle = inventory.some(i => i && i.icon === '🏺') || pouch.some(i => i && i.icon === '🏺');
        if(hasBottle) {
          // Genie offers a wish instead of fighting
          let m = document.getElementById('modal-content');
          m.innerHTML = `<h2>🧞 The Genie of the Dungeon</h2>
            <p style="font-size:60px; margin:5px 0;">🧞</p>
            <p><em>"You carry the Brass Bottle! I am bound to its master. Speak your wish, mortal."</em></p>
            <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
              <button onclick="genieWish('heal')">💚 'I wish for full health and mana.'</button>
              <button onclick="genieWish('gold')">💰 'I wish for wealth beyond measure.'</button>
              <button onclick="genieWish('pass')">🚪 'I wish to pass to the next level.'</button>
              <button onclick="genieWish('fight')">⚔️ 'I wish to fight you!'</button>
            </div>`;
          showOverlay();
          if(typeof Sound !== 'undefined' && Sound.playVoice) Sound.playVoice('voice_genie_greeting');
          return;
        } else {
          // No bottle — genie attacks
          logMsg("<span style='color:var(--error)'>🧞 The Genie thunders: 'You do not hold the Brass Bottle! You shall not pass!'</span>");
          if(typeof Sound !== 'undefined' && Sound.playVoice) Sound.playVoice('voice_genie_wish');
          doCombat(eIdx);
          return;
        }
      }
      // Pirates and master: always trigger insult battle on collision
      if(npc.type === 'pirate' || npc.type === 'master') {
        if(npc.stats && npc.stats.hp > 0) {
          let insultMsg = INSULT_BATTLES.pirate[Math.floor(Math.random() * INSULT_BATTLES.pirate.length)].insult;
          logMsg(`<span style='color:var(--warning)'>The pirate draws his sword with a theatrical flourish: '${insultMsg}'</span>`);
          insultBattle(eIdx);
          return;
        }
      }
      // Thief: attackable - allow doCombat to run
      if(npc.type === 'thief') {
        doCombat(eIdx); return;
      }
      // B1: Farm animals (cow, chicken, duck, pig) are always attackable — do NOT block
      const FARM_ANIMAL_TYPES = new Set(['cow', 'chicken', 'duck', 'pig']);
      if(!FARM_ANIMAL_TYPES.has(npc.type) && (npc.isQuestNPC || (npc.stats && npc.stats.quest))) {
        // Generic quest NPC interaction - don't attack
        if(npc.type !== 'eagle') {
          logMsg(`<span style='color:var(--primary)'>You can't attack ${npc.type}. They seem important.</span>`);
        }
        return;
      }
      doCombat(eIdx); return;
    }
    // Eagle's Crag door on floor 3 — opens the background scene
    if(currentLevel === 3 && (tile === TILES.CASTLE_DOOR || (window._eagleCragDoor && nx === window._eagleCragDoor.x && ny === window._eagleCragDoor.y))) {
      if(!window._eagleCragDoor) window._eagleCragDoor = { x: nx, y: ny, opened: true };
      window._eagleCragDoor.opened = true;
      logMsg("<span style='color:#FFD700'>🦅 You step through the door onto a windswept mountain ledge.</span>");
      enterBackgroundScene('eagle_crag', { x: 30, y: 40 });
      return;
    }
    if (tile === TILES.WALL || tile === TILES.TREE || tile === TILES.ROCK || tile === TILES.MOAT) { Sound.oof(); return; }
    if(tile === TILES.DEEP_WATER && isEagleSkyTile(nx, ny)) {
      Sound.oof();
      logMsg("<span style='color:#88CCFF'>A sheer cliff drops away into open sky. Best not to test whether you can fly.</span>");
      return;
    }
    if (tile === TILES.SECRET_WALL) {
      theMap[ny][nx] = TILES.FLOOR;
      logMsg("<span style='color:var(--success)'>You discover a hidden passage!</span>");
      addFloatingText(nx, ny, "SECRET!", "#D0BCFF", 18);
      Sound.stoneGrind();
      calculateFOV(); drawMap(); advanceTurn(1);
      return;
    }

    // Handle chests — passable, right-click to open with key
    if (tile === TILES.CHEST) {
      logMsg("<span style='color:#888'>You walk past the locked chest. (Right-click to open with a key)</span>");
    }

    if(currentScene === 'town' && (tile === TILES.WATER || tile === TILES.DEEP_WATER)) {
      Sound.splash();
      // #9: Splash emoji + brief swim avatar
      addFloatingText(nx, ny, '💦', '#88CCFF', 22);
      player._swimming = true;
      setTimeout(() => { player._swimming = false; drawMap(); }, 600);
      logMsg("<span style='color:#88CCFF'>You step into the brook, splash once, and instantly remember that you absolutely cannot swim.</span>");
      if(typeof Sound !== 'undefined' && Sound.playVoice) Sound.playVoice('voice_internal_brook');
      logMsg("<span style='color:#888'>You stumble back onto dry land, dripping and embarrassed.</span>");
      advanceTurn(1);
      return;
    }

    player.x = nx; player.y = ny;
    player.stationaryTurns = 0;
    window._lastPlayerMoveTime = performance.now();
    if(window.WebGLFX && WebGLFX.onPlayerMove) WebGLFX.onPlayerMove(dx, dy, !!player.isRunning);

    // Area music transitions
    if(typeof Sound !== 'undefined') {
      if(currentScene === 'town') {
        Sound.playMusic(player.x >= 24 ? 'fields' : 'tristram');
      } else if(currentScene === 'beach') {
        let nearStore = false;
        for(let yy = Math.max(0, player.y - 3); yy <= Math.min(mapH - 1, player.y + 3) && !nearStore; yy++) {
          for(let xx = Math.max(0, player.x - 3); xx <= Math.min(mapW - 1, player.x + 3); xx++) {
            if(theMap[yy] && theMap[yy][xx] === TILES.STORE) { nearStore = true; break; }
          }
        }
        Sound.playMusic(nearStore ? 'supercenter' : 'pirate');
      } else if(currentLevel === 1 && currentScene === 'dungeon') {
        const ifrit = enemies.find(e => e.type === 'ifrit' && e.isIfrit);
        if(ifrit) {
          const dist = Math.abs(ifrit.x - player.x) + Math.abs(ifrit.y - player.y);
          if(dist <= 8) Sound.playMusic('ifrit_lair');
        }
      }
    }

    // Eagle Crag entry detection (Floor 3) — legacy check, now handled by BOUNDARY_DATA scene path

    // Corpse walk-over: funny messages
    if(typeof corpses !== 'undefined') {
      let steppedCorpse = corpses.find(c => c.x === nx && c.y === ny && !c.isBones);
      if(steppedCorpse && Math.random() < 0.4) {
        let msg = CORPSE_WALK_MESSAGES[Math.floor(Math.random() * CORPSE_WALK_MESSAGES.length)];
        logMsg(`<span style='color:#888; font-style:italic;'>${msg}</span>`);
      }
    }

    // Expire old corpses (check every move)
    expireCorpses();

    if(tile === TILES.WATER || tile === TILES.DEEP_WATER) {
      Sound.splash();
      // Bug 42-43: Shark aggro — immediately provoke any nearby shark when player enters water
      enemies.forEach(e => {
        if(e.type === 'shark' && e.stats && e.stats.stalks) {
          let dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
          if(dist <= (e.stats.aggro || 6)) {
            if(!e.provoked) {
              e.provoked = true;
              logMsg("<span style='color:var(--error)'>🦈 Something large stirs in the water nearby...</span>");
            }
          }
        }
      });
      // Check for fishing spots (Red Herring quest)
      if(currentScene === 'beach' && window.fishingSpots) {
        let isFishingSpot = window.fishingSpots.some(sp => sp.x === nx && sp.y === ny);
        if(isFishingSpot && !player.hasRedHerring && Math.random() < 0.3) {
          logMsg("<span style='color:var(--success)'>🐟 Something tugs on your line...</span>");
          if(Math.random() < 0.5) {
            findRedHerring();
          } else {
            logMsg("<span style='color:#888'>It got away! Try again later.</span>");
          }
        }
      }
    } else Sound.step();
    
    // Handle stairs (dungeons only) or open gates (outworld)
    if(tile === TILES.OPEN_GATE && window._outworldGates) {
      // Determine direction from which gate the player stepped on
      const gates = window._outworldGates;
      const atNorth = ny <= gates.north.y + 1;
      const atSouth = ny >= gates.south.y - 1;
      const isDescend = atSouth;
      const isAscend = atNorth && currentLevel > 1;
      if(isDescend || isAscend) {
        _saveLevelToCache(currentLevel);
        const direction = isDescend ? 'south' : 'north';
        const prevLevel = currentLevel;
        if(isDescend) {
          currentLevel++;
          logMsg(`<span style="color:var(--primary)">Heading into ${currentScene === 'mountain' ? "the highlands" : "open country"}... (Level ${currentLevel})</span>`);
        } else {
          currentLevel--;
          logMsg(`<span style="color:var(--primary)">Returning to Level ${currentLevel}...</span>`);
        }
        if(typeof QuestEngine !== 'undefined') QuestEngine.emit('enter_level', { level: currentLevel, scene: currentScene });
        // B38: Preserve the player's x-offset relative to the gate center so
        //      they arrive at the matching tile in the destination gate (no 6-tile shift).
        const exitGate = isDescend ? window._outworldGates.south : window._outworldGates.north;
        const exitXOffset = exitGate ? (nx - exitGate.x) : 0; // -1, 0, or +1
        window.mapSweepTransition(direction, () => {
          if(!_restoreLevelFromCache(currentLevel)) initMap(50);
          // Place player just inside the arrival gate, preserving the relative x-offset
          if(isDescend && window._outworldGates) {
            player.x = window._outworldGates.north.x + exitXOffset;
            player.y = window._outworldGates.north.y + 2;
          } else if(window._outworldGates) {
            player.x = window._outworldGates.south.x + exitXOffset;
            player.y = window._outworldGates.south.y - 2;
          }
          calculateFOV(); updateUI();
        });
      }
      return;
    }
    // Handle stairs — save current level state and restore cached levels
    if(tile === TILES.STAIR_DOWN) {
      // Save current level state before leaving
      _saveLevelToCache(currentLevel);
      currentLevel++; 
      logMsg(`<span style="color:var(--primary)">Descending to Floor ${currentLevel}...</span>`);
      if (typeof QuestEngine !== 'undefined') QuestEngine.emit('enter_level', { level: currentLevel, scene: currentScene });
      // Try to restore cached level; if not cached, generate new
      if(!_restoreLevelFromCache(currentLevel)) {
        initMap(50);
      }
      // Place player at the UP stair on the new floor
      _placePlayerAtStair(TILES.STAIR_UP);
      calculateFOV(); drawMap(); updateUI();
      return;
    }
    if(tile === TILES.STAIR_UP) {
      if(currentLevel > 0) {
        _saveLevelToCache(currentLevel);
        currentLevel--;
        if(currentLevel === 0) window._cainHealedThisVisit = false; // E6: reset Cain heal on returning to town
        logMsg(`<span style="color:var(--primary)">Ascending to Floor ${currentLevel}...</span>`);
        if (typeof QuestEngine !== 'undefined') QuestEngine.emit('enter_level', { level: currentLevel, scene: currentScene });
        if(!_restoreLevelFromCache(currentLevel)) {
          initMap(50);
        }
        // Place player at the DOWN stair on the floor above
        _placePlayerAtStair(TILES.STAIR_DOWN);
        calculateFOV(); drawMap(); updateUI();
      } else {
        logMsg("You can't go up from here.");
      }
      return;
    }
    
    // B759.TOWN_PORTAL: two-way portal (return to cast location).
    if(tile === TILES.PORTAL && window._portalPos && window._portalPos.active) {
      // In-town return leg
      if(currentLevel === 0) {
        const back = window._portalPos;
        currentLevel = back.fromLevel;
        currentScene = back.fromScene || currentScene;
        if(!_restoreLevelFromCache(currentLevel)) initMap(50);
        player.x = back.fromX;
        player.y = back.fromY;
        if(theMap[player.y] && theMap[player.y][player.x] === TILES.PORTAL) theMap[player.y][player.x] = TILES.FLOOR;
        window._portalPos.active = false;
        logMsg("<span style='color:var(--success)'>🌀 You step back through the portal to where you cast it.</span>");
        calculateFOV(); drawMap(); updateUI();
        return;
      }

      // Outbound leg: dungeon/outworld -> town
      if(currentLevel !== 0) {
        _saveLevelToCache(currentLevel);
        const back = window._portalPos;
        back.fromLevel = currentLevel;
        back.fromScene = currentScene;
        back.fromX = nx;
        back.fromY = ny;

        currentLevel = 0;
        currentScene = 'town';
        window._cainHealedThisVisit = false;
        logMsg("<span style='color:var(--success)'>🌀 You step through the portal and arrive in Tristram!</span>");
        if(!_restoreLevelFromCache(0)) initMap(50);

        const townPortal = (window._townPortalTile && typeof window._townPortalTile.x === 'number')
          ? window._townPortalTile
          : { x: 17, y: 14 };
        back.townX = townPortal.x;
        back.townY = townPortal.y;
        if(theMap[townPortal.y]) theMap[townPortal.y][townPortal.x] = TILES.PORTAL;
        player.x = townPortal.x;
        player.y = townPortal.y;

        calculateFOV(); drawMap(); updateUI();
        return;
      }
    }

    // Handle stores and special buildings
    if(tile === TILES.STORE) {
      // Check if this is the Mended Drum location
      if(window._mendedDrumX && nx === window._mendedDrumX && ny === window._mendedDrumY) {
        openShop('mended_drum_barman');
      } else {
        openShop('apu');
      }
      return;
    }
    if(tile === TILES.BOOKSTORE) {
      openShop('wizard');
      return;
    }
    if(tile === TILES.LEFTYS) {
      openShop('leftys');
      return;
    }
    if(tile === TILES.FORGE) {
      openShop('blacksmith');
      return;
    }
    if(tile === TILES.HALL) {
      let count = Object.keys(achievements).length;
      if(count >= 20) {
        logMsg("<span style='color:#FFD700'>🏛️ You enter the Hall of Champions!</span>");
        if(!window.BOUNDARY_DATA || !window.BOUNDARY_DATA.champion) {
          // Fallback: just open shop if no boundary data
          openShop('champion');
          return;
        }
        enterBackgroundScene('champion', { x: 30, y: 40 });
      } else {
        logMsg(`<span style='color:var(--warning)'>🏛️ The Hall of Champions is closed to you. (Need 20 achievements, have ${count})</span>`);
      }
      return;
    }
    if(tile === TILES.NEST) {
      logMsg("<span style='color:#FFD700'>🪺 You climb into Roc's Nest.</span>");
      enterBackgroundScene('nest', { x: 30, y: 17 });
      return;
    }
    // Return from background scenes to the parent map
    if(window.BOUNDARY_DATA && window.BOUNDARY_DATA[currentScene] && window.BOUNDARY_DATA[currentScene].returnTile) {
      const rt = window.BOUNDARY_DATA[currentScene].returnTile;
      if(nx === rt.x && ny === rt.y) {
        if(currentScene === 'eagle_crag') {
          currentLevel = 3;
          currentScene = 'dungeon';
          if(!_restoreLevelFromCache(currentLevel)) initMap(50);
          if(window._eagleCragDoor) {
            player.x = window._eagleCragDoor.x + 1;
            player.y = window._eagleCragDoor.y;
          }
          logMsg("<span style='color:var(--primary)'>You descend the mountain path back into the dungeon.</span>");
        } else if(currentScene === 'champion') {
          currentScene = 'town';
          currentLevel = 0;
          if(!_restoreLevelFromCache(0)) initMap(50);
          player.x = 17;
          player.y = 14;
          logMsg("<span style='color:var(--primary)'>You leave the Hall of Champions and return to Tristram.</span>");
        } else if(currentScene === 'nest') {
          currentScene = 'mountain';
          if(!_restoreLevelFromCache(currentLevel)) initMap(50);
          logMsg("<span style='color:var(--primary)'>You climb down from the nest back to the highlands.</span>");
        }
        calculateFOV(); drawMap(); updateUI();
        return;
      }
    }
    if(tile === TILES.MACHINE) {
      activateAtlanteanMachine(nx, ny);
      return;
    }
    if(tile === TILES.ANTIQUE_SHOP) {
      openShop('antique');
      return;
    }
    if(tile === TILES.SCUMM_BAR) {
      openShop('scummbar');
      return;
    }

    // No auto-pickup — items require right-click interaction
    advanceTurn(1);
  }

  // E5: Blacksmith Repair service — costs 50g, restores all equipped items
  window.blacksmithRepair = function() {
    if(player.gp < 50) {
      logMsg("<span style='color:var(--error)'>🧑‍🔧 Griswold: \"Fifty gold is the going rate, friend. Come back when you've got it.\"</span>");
      return;
    }
    // Check if any equipped item has durability to repair
    let hasEquipped = Object.values(player.equipped || {}).some(ic => ic !== null);
    if(!hasEquipped) {
      logMsg("<span style='color:#aaa'>🧑‍🔧 Griswold: \"Your equipment is in fine shape already! Come back when something needs fixing.\"</span>");
      return;
    }
    changeGold(-50);
    // Restore durability on all equipped items (if durability system exists)
    Object.values(player.equipped || {}).forEach(ic => {
      if(ic && ITEM_DEF[ic]) {
        let def = ITEM_DEF[ic];
        if(def.durability !== undefined) def.durability = def.maxDurability || 100;
      }
    });
    addFloatingText(player.x, player.y, '🔨 REPAIRED', '#fc0', 16);
    logMsg("<span style='color:var(--success)'>🧑‍🔧 Griswold hammers away for a moment. \"There! Good as new. Well, good as it's going to get.\"</span>");
    Sound.playTone(300, 'triangle', 0.3, 0.05, 400);
    setTimeout(() => Sound.playTone(450, 'triangle', 0.2, 0.05, 300), 150);
    hideOverlay();
    updateUI();
  };

  window.bridgeTrial = (idx) => {
    let m = document.getElementById('modal-content');
    m.innerHTML = `<h2>🧙‍♂️ Bridge of Death</h2>${modalPortraitHTML('npc_bridgekeeper_modal', '🧙‍♂️')}<p>Keeper: "What... is your name?"</p>
      <button onclick="bridgeAns(1)">"Sir Lancelot of Camelot."</button>
      <button onclick="bridgeAns(0)">"Galahad the... wait!"</button>`;
    showOverlay();
    if(typeof Sound !== 'undefined' && Sound.playVoice) setTimeout(() => Sound.playVoice('voice_bridgekeeper_q1'), 30);
  };

  window.bridgeAns = (correct) => {
    if(!correct) { logMsg("AHHHHHHH!"); isDead = true; die(); return; }
    let m = document.getElementById('modal-content');
    m.innerHTML = `<h2>🧙‍♂️ Bridge of Death</h2>${modalPortraitHTML('npc_bridgekeeper_modal', '🧙‍♂️')}<p>Keeper: "What... is your quest?"</p>
      <button onclick="bridgeAns2(1)">"To seek the Holy Grail."</button>
      <button onclick="bridgeAns2(0)">"To find a nice shrubbery."</button>`;
    if(typeof Sound !== 'undefined' && Sound.playVoice) setTimeout(() => Sound.playVoice('voice_bridgekeeper_q2'), 30);
  };

  window.bridgeAns2 = (correct) => {
    if(!correct) { logMsg("AHHHHHHH!"); isDead = true; die(); return; }
    let m = document.getElementById('modal-content');
    let highInt = player.stats.int >= 15;
    m.innerHTML = `<h2>🧙‍♂️ Bridge of Death</h2>${modalPortraitHTML('npc_bridgekeeper_modal', '🧙‍♂️')}<p>Keeper: "What... is the airspeed velocity of an unladen swallow?"</p>
      <button onclick="bridgeAns3(0)">"24 miles per hour?"</button>
      ${highInt ? `<button onclick="bridgeAns3(1)">"What do you mean? African or European swallow?"</button>` : ''}`;
    if(typeof Sound !== 'undefined' && Sound.playVoice) setTimeout(() => Sound.playVoice('voice_bridgekeeper_q3'), 30);
  };

  window.bridgeAns3 = (win) => {
    hideOverlay();
    if(win) { logMsg("Keeper: 'What? I don't know that! AHHHHHHH!'"); enemies = enemies.filter(e => e.type !== 'bridge_keeper'); player.bridgeQuestions = true; }
    else { logMsg("AHHHHHHH!"); isDead = true; die(); }
  };

  // ============================================================================
  // ATLANTEAN BEAD MACHINE INTERACTION (Indiana Jones: Fate of Atlantis)
  // ============================================================================
  //
  // GAME DESIGN LESSON: The Rube Goldberg Puzzle
  //
  // The fun of this puzzle is that 4 machines do something IMPRESSIVE but
  // USELESS. Players who rush will waste beads. Players who observe carefully
  // (or have high INT) will identify the real machine by its description.
  //
  // The real machine is distinguished by:
  //   - "its gears run down into the desert floor" (load-bearing clue)
  //   - Costs 3 beads (more expensive = more significant?)
  //   - INT 11+ reveals an explicit hint about it
  //
  // We show the machine description BEFORE asking for beads, so smart players
  // can decline after reading the description. This is fair design — the
  // information is available, but you have to read carefully.
  // ============================================================================

  window.activateAtlanteanMachine = (mx, my) => {
    let machines = window.atlanteanMachines || [];
    let machine = machines.find(m => m.x === mx && m.y === my);
    if(!machine) return;

    let beadCount = inventory.reduce((sum, i) => sum + (i && i.icon === '📿' ? (i.qty || 1) : 0), 0);

    let m = document.getElementById('modal-content');
    Sound.machine();

    // Build the INT-gated hint
    let intHintHtml = '';
    if(machine.real && player.stats.int >= 11) {
      intHintHtml = `<p style="color:#88CCFF; font-size:11px; border:1px solid #88CCFF;
        padding:6px; border-radius:4px; margin:6px 0;">
        💡 [Insight] The gears run <em>down</em> into the floor, not up. This machine
        bears weight. It is not decorative.
      </p>`;
    } else if(!machine.real && player.stats.int >= 14) {
      intHintHtml = `<p style="color:#888; font-size:11px; font-style:italic; margin:4px 0;">
        💡 [Insight] Impressive engineering, but it doesn't connect to anything structural.
        This machine serves no load-bearing function.
      </p>`;
    }

    m.innerHTML = `<h2>⚙️ ${machine.name}</h2>
      <p style="font-size:40px; margin:4px 0;">⚙️📿</p>
      <p style="font-style:italic; color:#aaa;">${machine.desc}</p>
      ${intHintHtml}
      <p style="font-size:12px;">Cost: <strong>${machine.beadCost} Orichalcum Bead${machine.beadCost>1?'s':''}</strong>
        &nbsp;|&nbsp; You have: <strong>${beadCount} bead${beadCount!==1?'s':''}</strong></p>
      ${beadCount >= machine.beadCost
        ? `<button onclick="useBeadMachine(${mx}, ${my})" style="margin-top:8px; width:100%;">
            📿 Insert ${machine.beadCost} bead${machine.beadCost>1?'s':''}</button>`
        : `<p style="color:var(--error); font-size:12px;">Not enough beads!</p>`
      }
      <button onclick="hideOverlay(); advanceTurn(1)"
        style="margin-top:4px; background:var(--surface-container); width:100%;">Leave it alone</button>`;
    showOverlay();
  };

  window.useBeadMachine = (mx, my) => {
    hideOverlay();
    let machines = window.atlanteanMachines || [];
    let machine = machines.find(m => m.x === mx && m.y === my);
    if(!machine) return;

    // Consume beads
    let toConsume = machine.beadCost;
    for(let i = 0; i < inventory.length && toConsume > 0; i++) {
      if(inventory[i] && inventory[i].icon === '📿') {
        let take = Math.min(inventory[i].qty || 1, toConsume);
        inventory[i].qty = (inventory[i].qty || 1) - take;
        toConsume -= take;
        if(inventory[i].qty <= 0) inventory[i] = null;
      }
    }
    renderInventory();
    Sound.machine();

    logMsg(`<span style='color:#74B9FF'>⚙️ You insert ${machine.beadCost} bead${machine.beadCost>1?'s':''} into the ${machine.name}...</span>`);

    setTimeout(() => {
      logMsg(`<span style='color:#74B9FF'>⚙️ ${machine.effect}</span>`);

      if(machine.real) {
        // The REAL machine — open the drawbridge!
        logMsg(`<span style='color:#FFD700'>🌉 The drawbridge to the castle OPENS! The way is clear!</span>`);
        Sound.stoneGrind();
        // Remove the wall blocking the castle entrance
        for(let x = mapW-8; x < mapW-2; x++) {
          if(theMap[mapH-3]?.[x] === TILES.WALL) theMap[mapH-3][x] = TILES.FLOOR;
        }
        // Emit quest event
        if(typeof QuestEngine !== 'undefined') {
          QuestEngine.emit('custom', { id: 'drawbridge_machine_found' });
          QuestEngine.emit('custom', { id: 'drawbridge_opened' });
        }
        calculateFOV();
      } else {
        // A decoy machine — looks spectacular, does nothing useful
        logMsg(`<span style='color:#888; font-style:italic;'>...The desert is silent. Nothing opened.</span>`);
        // Emit quest event for "wasted bead" achievement
        if(typeof QuestEngine !== 'undefined') {
          QuestEngine.emit('custom', { id: 'bead_wasted' });
          QuestEngine.advance('q_atlantis_beads', 30);
        }
        // Add a visual flourish — fireworks-style effect for the decoy
        addFloatingText(mx, my, '✨', '#FFD700', 24);
        addFloatingText(mx-1, my-1, '💫', '#74B9FF', 20);
        addFloatingText(mx+1, my-1, '⭐', '#FFD700', 18);
      }

      drawMap(); updateUI();
    }, 600);

    advanceTurn(1);
  };

  // === Duck Hunt Dog Easter Egg ===
  // Shows the laughing dog from Duck Hunt NES when you get 5 duck kills
  window.showDuckHuntDogLaugh = () => {
    // Create overlay div for the dog animation
    let dogOverlay = document.createElement('div');
    dogOverlay.id = 'duck-hunt-dog-overlay';
    dogOverlay.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      animation: dogPopUp 0.5s ease-out forwards;
    `;
    
    // Dog SVG inline (based on NES Duck Hunt dog)
    dogOverlay.innerHTML = `
      <div style="text-align: center; position: relative;">
        <svg width="200" height="180" viewBox="0 0 32 32" style="image-rendering: pixelated;">
          <!-- Green grass base -->
          <rect x="0" y="20" width="32" height="12" fill="#4CAF50"/>
          <rect x="0" y="22" width="32" height="10" fill="#388E3C"/>
          <!-- Grass tufts -->
          <path d="M2,20 L4,16 L6,20" fill="#66BB6A"/>
          <path d="M10,20 L12,14 L14,20" fill="#66BB6A"/>
          <path d="M18,20 L20,15 L22,20" fill="#66BB6A"/>
          <path d="M26,20 L28,16 L30,20" fill="#66BB6A"/>
          
          <!-- Dog body (popping up from grass) -->
          <rect x="8" y="14" width="16" height="12" fill="#D2691E" stroke="#8B4513" stroke-width="1"/>
          <!-- White chest/belly -->
          <rect x="12" y="18" width="8" height="8" fill="#FFFFFF"/>
          
          <!-- Dog head -->
          <rect x="10" y="4" width="12" height="10" fill="#D2691E" stroke="#8B4513" stroke-width="1"/>
          <!-- Ears (pointed up) -->
          <polygon points="10,4 8,0 12,4" fill="#8B4513"/>
          <polygon points="22,4 24,0 20,4" fill="#8B4513"/>
          <!-- White muzzle -->
          <rect x="12" y="8" width="8" height="6" fill="#FFFFFF"/>
          <!-- Nose -->
          <ellipse cx="16" cy="8" rx="2" ry="1.5" fill="#2C2C2C"/>
          <!-- Eyes (squinted/laughing) -->
          <path d="M11,5 Q13,4 15,5" stroke="#2C2C2C" stroke-width="1.5" fill="none"/>
          <path d="M17,5 Q19,4 21,5" stroke="#2C2C2C" stroke-width="1.5" fill="none"/>
          <!-- Mouth (open laughing) -->
          <path d="M13,11 Q16,14 19,11" stroke="#2C2C2C" stroke-width="1" fill="#FF6B6B"/>
          
          <!-- Duck in dog's mouth -->
          <ellipse cx="4" cy="16" rx="4" ry="3" fill="#FFD700"/>
          <circle cx="2" cy="14" r="2" fill="#FFD700"/>
          <!-- Duck beak -->
          <polygon points="0,14 2,16 0,16" fill="#FF8C00"/>
          <!-- Duck eye -->
          <circle cx="1" cy="14" r="0.5" fill="#000"/>
          <!-- Duck wing -->
          <ellipse cx="5" cy="16" rx="2" ry="1.5" fill="#DAA520"/>
        </svg>
        <div style="position: absolute; top: -30px; left: 50%; transform: translateX(-50%);
                    font-size: 24px; font-weight: bold; color: #FF0000; text-shadow: 2px 2px #000;
                    animation: laughBounce 0.3s infinite alternate;">
          HA HA HA!
        </div>
        <div style="color: #FFD700; font-size: 14px; margin-top: -20px; text-shadow: 1px 1px #000;">
          🦆 Duck Hunter Achievement! 🦆
        </div>
      </div>
    `;
    
    // Add CSS animation
    let style = document.createElement('style');
    style.textContent = `
      @keyframes dogPopUp {
        0% { transform: translateX(-50%) translateY(200px); opacity: 0; }
        50% { transform: translateX(-50%) translateY(-20px); opacity: 1; }
        100% { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
      @keyframes laughBounce {
        0% { transform: translateX(-50%) scale(1); }
        100% { transform: translateX(-50%) scale(1.1); }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(dogOverlay);
    
    // Play laughing sound effect
    Sound.laugh();
    
    // Log the achievement message
    logMsg(`<span style='color:#FFD700;font-size:16px;'>🦆🐕 DUCK HUNTER! The dog laughs at your duck-slaying skills!</span>`);
    
    // Remove after 4 seconds
    setTimeout(() => {
      if(dogOverlay.parentNode) {
        dogOverlay.style.animation = 'dogPopUp 0.5s ease-in reverse forwards';
        setTimeout(() => {
          if(dogOverlay.parentNode) dogOverlay.parentNode.removeChild(dogOverlay);
          if(style.parentNode) style.parentNode.removeChild(style);
        }, 500);
      }
    }, 4000);
  };

  
