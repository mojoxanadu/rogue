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

  The functions here are called from input.js (movePlayer, sleepPlayer), from the UI
  (combat clicks), and from the game's own turn‑based clock (advanceTurn). They update
  the global player, zone.npcs, itemsOnGround, and activeEffects arrays.
*/
// === Core Loops & AI ===
  // Phase 6c: chestStates global retired. Per-chest state (locked,
  // mimic) lives on each container Lootable now.
  let snoreLoop = null;
  let sleepHealLoop = null;
  // window.corpses removed in Phase 4a-2; the canonical store is
  // zone.corpses (see player.js / world.js). Every reader/writer in
  // engine, map, input, render, and ui_logic was migrated to use the
  // Zone API directly.
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
    // Gold: 50% chance, always drops alongside other items (skipped for farm birds).
    // Gold loot is a plain { icon, qty } object — distinct from ItemStack;
    // qty is the gold amount, not a stack count.
    if(!FARM_BIRD_TYPES.has(enemyType) && Math.random() < 0.5) {
      let goldAmt = 5 + Math.floor(Math.random() * 10 * Math.max(1, currentLevel));
      loot.push(new ItemStack('gold', goldAmt));
    }
    // 1-3 item drops per corpse. Pools are camelCase names keyed into ItemDefs;
    // never emoji literals (per the no-icons-in-code rule).
    let itemCount = 1 + Math.floor(Math.random() * 3);
    let itemPool = [
      {name:'healthPotion', weight:15}, {name:'pizza',  weight:10}, {name:'meat',   weight:8},
      {name:'cheese',       weight:7},  {name:'key',    weight:5},  {name:'sword',  weight:5},
      {name:'shield',       weight:4},  {name:'candle', weight:8},  {name:'identifyScroll', weight:5},
      {name:'smallClothBag', weight:3}, {name:'slurpee', weight:5}, {name:'ringOfMidas', weight:2},
    ];
    let junkPool = [
      'tuftOfHair', 'smallRock', 'aMarble', 'pieceOfString', 'hensTeeth',
      'bitOfAsbestos', '1CheetoStale', 'dandruffFlake', 'feather', 'bellyButtonLint',
      'bentNeedle', 'pocketSand', 'bone', 'paperclip', 'yarn', 'earthworm',
    ];
    let totalWeight = itemPool.reduce((s,e) => s + e.weight, 0);
    for(let i = 0; i < itemCount; i++) {
      let roll = Math.random();
      if(roll < 0.3) {
        // Junk
        loot.push(new ItemStack(junkPool[Math.floor(Math.random() * junkPool.length)], 1));
      } else if(roll < 0.5) {
        // Nothing extra
      } else {
        // Weighted item from pool
        let r = Math.random() * totalWeight;
        for(let entry of itemPool) {
          r -= entry.weight;
          if(r <= 0) {
            const def = ItemDefs[entry.name];
            if(def && def.minLevel && player.level < def.minLevel) {
              loot.push(new ItemStack('healthPotion', 1)); // fallback
            } else {
              loot.push(new ItemStack(entry.name, 1));
            }
            break;
          }
        }
      }
    }
    // Bag drop: 8% chance, level-appropriate.
    if(Math.random() < 0.08) {
      loot.push(new ItemStack(randomBag(player.level), 1));
    }
    // E10: Beach Portal Scroll drops on level 7+
    if(currentLevel >= 7 && Math.random() < 0.03) {
      const portalIdx = loot.findIndex(l => l.itemName === 'townPortalScroll');
      if(portalIdx !== -1 && Math.random() < 0.5) {
        loot[portalIdx] = new ItemStack('scrollOfBeachPortal', 1);
      } else if(Math.random() < 0.02) {
        loot.push(new ItemStack('scrollOfBeachPortal', 1));
      }
    }
    return loot;
  }

  // Roll the loot a freshly-spawned monster will carry. Called at SPAWN
  // time (via the window._npcLootRoller hook) so pickpocket and steal
  // mechanics can mutate the same list before kill — what the player
  // gets on death is whatever's left. Returns an Array of ItemStacks.
  // Thief stolenItems and any other player-state-dependent drops are
  // appended at death time by the death handler; this function handles
  // only what's stable across the monster's lifetime.
  function _rollMonsterLoot(npc) {
    const type  = npc.type;
    const stats = npc.stats || {};
    let loot = [];
    if (type === 'mouse') {
      const r = Math.random();
      if      (r < 0.05) loot.push(new ItemStack('plansForWorldDomination', 1));
      else if (r < 0.25) loot.push(new ItemStack('cheese', 1));
      loot.push(new ItemStack('gold', 1 + Math.floor(Math.random() * 3)));
    } else if (type === 'cockroach') {
      loot.push(new ItemStack('cockroachLegStale', 1));
      if (Math.random() < 0.3) loot.push(new ItemStack('gold', 1));
    } else if (type === 'chicken' || type === 'duck') {
      const r = Math.random();
      if      (r < 0.60) loot.push(new ItemStack('duckLeg', 1));
      else if (r < 0.90) loot.push(new ItemStack('feather', 1));
      if (Math.random() < 0.15) loot.push(new ItemStack('poop', 1));
    } else if (type === 'wet_rat') {
      if (Math.random() < 0.3) loot.push(new ItemStack('wetRatTail', 1));
      else                     loot.push(new ItemStack('cheese', 1));
    } else if (type === 'pixie') {
      loot.push(new ItemStack('resurrectionCrystal', 1));
      if (Math.random() < 0.35) loot.push(new ItemStack('dirt', 1));
    } else if (type === 'shark') {
      const r = Math.random();
      if      (r < 0.15) loot.push(new ItemStack('sharkskinSuit', 1));
      else if (r < 0.50) loot.push(new ItemStack('sharkTooth', 1));
      loot.push(new ItemStack('gold', 25 + Math.floor(Math.random() * 50)));
      if (Math.random() < 0.4) loot.push(new ItemStack('healthPotion', 2));
      // Bag of Holding still gated on player level — read at spawn time,
      // which means leveling up after the shark spawns doesn't change
      // whether this drop is in the pool. Acceptable per the spawn-time
      // pre-roll trade-off.
      if (Math.random() < 0.3 && player.level >= 20) loot.push(new ItemStack('bagOfHolding', 1));
    } else if (type === 'mimic') {
      loot.push(new ItemStack('key', 1));
      loot.push(new ItemStack('gold', 30 + Math.floor(Math.random() * 40)));
      if (Math.random() < 0.35) loot.push(new ItemStack('ringOfMidas', 1));
    } else if (type === 'genie') {
      loot = generateLoot(type, stats);
      loot.push(new ItemStack('tomeOfTownPortal', 1));
    } else if (type === 'cow') {
      loot.push(new ItemStack('meat', 1));
      if (Math.random() < 0.4)  loot.push(new ItemStack('cheese', 1));
      if (Math.random() < 0.15) loot.push(new ItemStack('poop', 1));
    } else if (type === 'pig') {
      loot.push(new ItemStack('meat', 1));
      if (Math.random() < 0.15) loot.push(new ItemStack('poop', 1));
    } else if (type === 'trex') {
      loot.push(new ItemStack('bone', 1 + Math.floor(Math.random() * 2)));
      if (Math.random() < 0.3) loot.push(new ItemStack('meat', 1));
    } else if (type === 'castle_rat' || type === 'thief' || type === 'ifrit') {
      // No spawn-time loot. thief gets stolenItems at death; ifrit has
      // its own bespoke ifritLoot path; castle_rat drops nothing.
    } else {
      loot = generateLoot(type, stats);
    }
    // Money Grubber talent: bonus gold scaling with rank N. Adds a
    // separate gold stack so the popup shows it as a distinct entry.
    // Excludes castle_rat / thief / ifrit / farm birds (chicken/duck)
    // which intentionally drop no gold.
    const NO_GOLD = new Set(['castle_rat','ifrit','chicken','duck','cow','pig']);
    if (!NO_GOLD.has(type)) {
      const mg = (player.talents?.moneyGrubber?.level) || 0;
      if (mg > 0 && Math.random() < (0.15 * mg)) {
        loot.push(new ItemStack('gold', 5 + Math.floor(Math.random() * 5 * mg)));
      }
    }
    return loot;
  }
  window._rollMonsterLoot = _rollMonsterLoot;

  function createCorpse(x, y, enemyType, enemyStats, loot) {
    const name = (MONSTER_DEF[enemyType] && MONSTER_DEF[enemyType].name) || enemyType;
    const icon = enemyStats.icon || '💀';
    // Wrap the loot array in a corpse-owned Lootable. The Lootable
    // lives *inside* the corpse — no x/y of its own (inherits from
    // owner). Phase 4 popup reads this; pickpocket (Phase 6) will
    // mutate the same slots pre-death. Empty loot is fine — corpse
    // still spawns visually and decays on the normal schedule.
    const lootable = (typeof Lootable !== 'undefined')
      ? new Lootable({ ownerKind: 'corpse', slots: loot || [] })
      : null;
    const corpse = new Corpse({ x, y, name, icon, lootable });
    zone.addCorpse(corpse);
  }

  // Phase 6c: mimic chest transformation. When the player walks onto
  // or bumps into a tile holding a Lootable with _mimic:true, remove
  // the Lootable, spawn a real mimic NPC, fire the surprise animation
  // + sounds, and let the mimic attack first. Returns true if a mimic
  // was triggered (caller should NOT continue normal move/popup flow).
  function _checkMimicAt(x, y) {
    if (typeof zone === 'undefined') return false;
    const mimicLootable = zone.lootablesAt(x, y).find(l => l && l._mimic);
    if (!mimicLootable) return false;
    zone.removeLootable(mimicLootable);
    spawnNpc(zone.npcs, x, y, 'mimic', { stats: { ...MONSTER_DEF['mimic'] }, isMimic: true });
    logMsg("<span style='color:var(--error)'>📦 The chest SNAPS its lid open and reveals jagged teeth! It's a MIMIC!</span>");
    if (typeof Sound !== 'undefined' && Sound.playSample) {
      Sound.playSample('mimic_reveal', 0.8);
      Sound.playSample('mimic_laugh',  0.6);
    }
    if (typeof addFloatingText === 'function') addFloatingText(x, y, '📦', '#f00', 22);
    drawMap(); updateUI();
    // Mimic attacks first as a surprise (after a brief delay so the
    // reveal sound + animation get a beat).
    const mIdx = zone.npcs.length - 1;
    if (typeof monsterAttack === 'function') {
      setTimeout(() => {
        if (zone.npcs[mIdx] && zone.npcs[mIdx].stats?.hp > 0) monsterAttack(mIdx);
      }, 500);
    }
    return true;
  }

  // Phase 4a-2.5: corpse decay moved off the wall clock onto game-time
  // scheduler ticks. Each Corpse instance carries its own actionCooldown
  // (LIFETIME, then BONES_DURATION) and self-mutates via takeTurn. The
  // old expireCorpses() polling loop is gone.

  // (autoLootCorpse removed — used to be triggered by the Scavenger
  // talent, which is gone. A future loot redesign will reintroduce
  // a similar dump-to-inventory helper if needed.)

  // Try to place an item in inventory or inside a bag
  function tryPlaceInInventory(item) {
    const def = item.def || { stackable:false };
    const qty = item.qty ?? 1;
    // Defensive: world-bound containers (Box, Chest, Safe, ...) are
    // never pickup-able. If one somehow appears in a loot list (loot-
    // gen bug, corrupted save), refuse to absorb it rather than let
    // the player carry a Safe in their pocket.
    if (def.type === 'container') {
      logMsg(`<span style='color:var(--warning)'>You can't carry the ${def.label() || 'container'}.</span>`);
      return false;
    }

    // Stack in existing inventory slots first
    if(def.stackable) {
      const maxStack = def.maxStack ?? 10;
      for(let i = 0; i < inventory.length; i++) {
        const s = inventory[i];
        if(s && s.itemName === item.itemName && (s.qty ?? 1) < maxStack) {
          const can = maxStack - (s.qty ?? 1);
          const add = Math.min(can, qty);
          s.qty = (s.qty ?? 1) + add;
          item.qty = qty - add;
          if(item.qty <= 0) return true;
          break;
        }
      }
    }

    // Direct inventory slot
    let pSlot = inventory.findIndex(s => s === null);
    if(pSlot !== -1) {
      inventory[pSlot] = new ItemStack(item.itemName, item.qty ?? 1);
      return true;
    }
    // Inside a bag
    for(let i = 0; i < inventory.length; i++) {
      let bag = inventory[i];
      if(bag && bag.def && bag.def.type === 'bag') {
        if(!bag.slots) bag.slots = new Array(bag.def.bagSlots ?? 3).fill(null);
        if(def.stackable) {
          const maxStack = def.maxStack ?? 10;
          for(let bi = 0; bi < bag.slots.length; bi++) {
            const bs = bag.slots[bi];
            if(bs && bs.itemName === item.itemName && (bs.qty ?? 1) < maxStack) {
              const can = maxStack - (bs.qty ?? 1);
              const add = Math.min(can, item.qty ?? 1);
              bs.qty = (bs.qty ?? 1) + add;
              item.qty = (item.qty ?? 1) - add;
              if((item.qty ?? 0) <= 0) return true;
            }
          }
        }
        let emptySlot = bag.slots.findIndex(s => s === null);
        if(emptySlot !== -1) {
          bag.slots[emptySlot] = new ItemStack(item.itemName, item.qty ?? 1);
          return true;
        }
      }
    }
    return false;
  }

  // Phase 6a: openLootWindow / lootAll / lootItem retired. Phase 4b's
  // non-modal loot popup (showLootPopup, pickupLootSlot, pickupAllAtTile
  // in ui_logic.js) is the single corpse-loot entry point. The popup
  // auto-opens when the player steps onto a corpse tile and re-renders
  // as items are taken — including bones-stage corpses, the busker's
  // accordion (Floor 3), and the high-INT-near-enemy warning, which
  // moved into the popup's heading text in a follow-up.

  // === Level Cache System ===
  // Saves/restores map state so stairs connect properly when backtracking.
  function _saveLevelToCache(level) {
    levelCache[level] = {
      theMap: theMap.map(row => row.slice()),
      explored: explored.map(row => row.slice()),
      darkMap: darkMap.map(row => row.slice()),
      npcs: JSON.parse(JSON.stringify(zone.npcs)),
      lootables: JSON.parse(JSON.stringify(zone.lootables)),
      corpses: JSON.parse(JSON.stringify(zone.corpses)),
      mapW: mapW,
      mapH: mapH,
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
    zone.npcs.length = 0;
    // The cache stores JSON-cloned spawn specs (class identity is
    // stripped by JSON.parse(JSON.stringify(...)) in _saveLevelToCache).
    // Re-hydrate each one through NPC.fromSpec so the live array
    // contains real NPC instances with takeTurn / cooldowns / etc.
    // KNOWN LIMITATION: Condition.onTick/onRemove callbacks don't
    // survive JSON round-trip. No NPCs carry Conditions today; if
    // that changes, add a NPC.toSpec() / fromSpec() pair that
    // re-attaches the right onTick when reading a serialized name.
    cached.npcs.forEach(spec => {
      zone.addNpc(typeof NPC !== 'undefined' && NPC.fromSpec ? NPC.fromSpec(spec) : spec);
    });
    syncActiveZone();
    // Restore floor Lootables. Cache stores plain-object snapshots
    // (Lootable identity is stripped by JSON.stringify); re-hydrate
    // each into a Lootable instance so engine code can call its
    // methods.
    zone.clearLootables();
    (cached.lootables || []).forEach(spec => {
      const slots = (spec.slots || []).map(s => new ItemStack(s.itemName, s.qty ?? 1));
      zone.addLootable(new Lootable({
        ownerKind: spec.ownerKind, x: spec.x, y: spec.y, slots,
        isLocked: !!spec.isLocked, lockKind: spec.lockKind || null,
      }));
    });
    zone.clearCorpses();
    if(cached.corpses) cached.corpses.forEach(c => zone.addCorpse(c));
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
    const idx = Math.floor(Math.random() * Math.max(1, count ?? 1));
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
    // Wipe player state first — initMap does NOT call setPlayerDefaults,
    // so without this player.hp stays at 0 and every action trips the
    // "You are dead." guard in mechanics.js.
    setPlayerDefaults();

    // Reset shared state that survives a death overlay
    isDead = false;
    currentLevel = 0;
    currentScene = 'town';
    levelCache = {};
    zone.clearNpcs();
    zone.clearLootables();
    zone.clearCorpses();
    lightTurns = 0;
    floatingTexts.length = 0;
    activeEffects.length = 0;
    damageTint = 0;
    // Reset debug toggles — a fresh game is a clean slate. Mutate the
    // existing object in place (don't reassign) so state.js's debugFlags
    // binding and every window.debugFlags reader keep pointing at it.
    if (window.debugFlags) {
      for (const k of Object.keys(window.debugFlags)) window.debugFlags[k] = false;
    }
    window._sharkBossSpawned = false;
    window._cainHealedThisVisit = false;
    window._activeBombs = [];
    for(let i = 0; i < inventory.length; i++) inventory[i] = null;

    hideOverlay();

    // Re-route through the class-selection gate so the player picks
    // a class on each restart — _beginAdventure() clicks #startBtn,
    // which runs setPlayerDefaults via initMap and re-applies the
    // chosen class's bonuses.
    window._classChosen = false;
    window._selectedClass = null;
    if (typeof showClassModal === 'function') {
      showClassModal();
    } else {
      // Fallback: surface the start screen so the player can click
      // BEGIN ADVENTURE manually (modal lives on the start screen).
      const startScreen = document.getElementById('start-screen');
      if (startScreen) startScreen.style.display = '';
    }
  };

  // (hydrateEnemiesToNPCs retired Iter 3.5 — all entry points into
  // the live zone.npcs[] now produce NPC instances:
  //   - spawnNpc() helpers wrap NPC.fromSpec
  //   - _restoreLevelFromCache re-hydrates JSON-cloned specs via NPC.fromSpec
  //   - town.zone.npcs[] entries are already instances (built by spawnNpc)
  // No lazy promotion needed at dispatch entry anymore.)

  // Build the ctx object passed to NPC.takeTurn(). Wires view-layer
  // hooks (Sound, logMsg, addFloatingText, WebGLFX) as callbacks so
  // the model never names them directly. A future commit can swap
  // these for an event stream without touching NPC classes.
  function makeNpcCtx(opts = {}) {
    return {
      isScene:      !!opts.isScene,
      nowMs:        opts.nowMs ?? Date.now(),
      steps:        opts.steps ?? 1,
      player, theMap, mapW, mapH, zone,
      enemies: zone.npcs,
      TILES, CONSTANTS, currentScene,
      isTileFloor,
      _movedFlag:   false,
      markMoved()  { this._movedFlag = true; },
      sound(name, vol, fallback) {
        if (typeof Sound === 'undefined') return;
        if (Sound.playSample && Sound.playSample(name, vol ?? 0.5)) return;
        if (fallback) {
          Sound.playTone(
            (fallback.freq ?? 200) + (fallback.freqJitter ? Math.random() * fallback.freqJitter : 0),
            fallback.kind ?? 'sine',
            fallback.vol  ?? 0.1,
            fallback.dur  ?? 0.1,
            fallback.decay ?? 50,
          );
        }
      },
      voice(key) {
        if (typeof Sound !== 'undefined' && Sound.playVoice) Sound.playVoice(key);
      },
      tone(freq, kind, vol, dur, decay) {
        if (typeof Sound !== 'undefined' && Sound.playTone) Sound.playTone(freq, kind, vol, dur, decay);
      },
      log(html) { logMsg(html); },
      floatText(x, y, text, color, size) { addFloatingText(x, y, text, color, size); },
      spawnFx(specObj) {
        if (Array.isArray(activeEffects)) activeEffects.push(specObj);
      },
      webglImpact(dmg, x, y) {
        if (window.WebGLFX && WebGLFX.onCombatImpact) WebGLFX.onCombatImpact(dmg, x, y);
      },
      // Combat/effect damage — delegates to the central funnel with
      // cause 'combat' so the Second Wind talent can intercept.
      damagePlayer(dmg, kind, size, suffix, color) {
        return applyPlayerDamage(dmg, 'combat', { mitigate: true, kind, size, suffix, color });
      },
      // Generic named-event SFX dispatcher. Lets NPC.attack say
      // "play the grunt event" without naming Sound.grunt directly.
      // Unknown method names are silently dropped — keeps model code
      // resilient if the audio layer is unloaded.
      soundEvent(method) {
        if (typeof Sound !== 'undefined' && typeof Sound[method] === 'function') {
          Sound[method]();
        }
      },
      // Remove a dead NPC from the zone. Used by NPC.attack when the
      // attacker dies to a thorns-reflection (Crown of Thorns).
      removeEnemy(npc) {
        zone.removeNpc(npc);
      },
      // Bridge to legacy thiefSteal which still operates on a positional
      // index into the live NPC list.
      thiefSteal(npc) {
        const idx = zone.npcs.indexOf(npc);
        if (idx >= 0) thiefSteal(idx);
      },
    };
  }
  window.makeNpcCtx = makeNpcCtx;

  function advanceSceneNPCs(nowMs = Date.now()) {
    const ctx = makeNpcCtx({ isScene: true, nowMs });
    for (const e of zone.npcs) {
      if (e && typeof e.takeTurn === 'function') e.takeTurn(ctx);
    }
    return ctx._movedFlag;
  }
  window.advanceSceneNPCs = advanceSceneNPCs;

  function advanceTurn(stepsOrAction = 1) {
    if(isDead) return;
    // Either a numeric cost (legacy) or an action name string (new).
    // Action names are resolved through localPlayer.actionCost so
    // talents like Speed (which reduce 'move' cost) take effect at
    // the only place that matters: how much time the player's action
    // burns relative to NPCs in the scheduler.
    const steps = (typeof stepsOrAction === 'number')
      ? stepsOrAction
      : (typeof localPlayer !== 'undefined' && typeof localPlayer.actionCost === 'function'
          ? localPlayer.actionCost(stepsOrAction)
          : 1);
    advanceSceneNPCs();
    window._turnCount = (window._turnCount ?? 0) + steps;
    player._gameTime = (player._gameTime ?? 0) + steps;
    // Tick down spell/condition durations
    if (player._illumTurns && player._illumTurns > 0) {
      player._illumTurns = Math.max(0, player._illumTurns - steps);
    }

    // Foraging talent — small per-turn chance to spawn a food pile on
    // a visible floor tile. Scales with rank N (1%×N per turn). This
    // is the "more random spawns on old floors too" half of the talent
    // (the other half — guaranteed food on newly-generated floors —
    // lives in map.js initMap). Limited to dungeon scenes so outdoor
    // exploration doesn't carpet meadows in pizza.
    {
      const N = (player.talents?.foraging?.level) || 0;
      if (N > 0 && currentScene === 'dungeon' && Math.random() < 0.01 * N * steps) {
        const p = getRandomFloor && getRandomFloor();
        if (p && visible[p.y] && visible[p.y][p.x]) {
          const foodIcons = ['🍕','🍖','🧀','🥕','🍞','🥩'];
          const icon = foodIcons[Math.floor(Math.random() * foodIcons.length)];
          zone.dropAt(p.x, p.y, ItemStack.fromIcon(icon));
        }
      }
    }

    // Atronach & Regen Suppression (v7.2.0)
    if (!player.atronach) {
       // natural regen
    }

    // Roc Capture
    if(currentLevel === 11 && !player.rocCaptured) {
      player.mountainSteps = (player.mountainSteps ?? 0) + steps;
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
         zone.clearNpcs(); zone.clearLootables();
         syncActiveZone();
         currentScene = 'nest';
         // #13: Wire background art scene
         player.x = 30; player.y = 17;
         // Place eggs and loot in the nest
         zone.dropAt(29, 23, ItemStack.fromIcon('🥚'));
         zone.dropAt(30, 23, ItemStack.fromIcon('🥚'));
         zone.dropAt(31, 23, ItemStack.fromIcon('🥚'));
         zone.dropAt(30, 24, ItemStack.fromIcon('🏅'));
         // Eagle is here if player fed it
         if(player.fedEagle) {
           spawnNpc(zone.npcs, 30, 23, "eagle", { stats: {...MONSTER_DEF["eagle"]} });
           logMsg("<span style='color:var(--success)'>The Eagle you fed is here! Talk to it to escape.</span>");
         }
        startQuestTimer(30, "Roc Nest Escape", () => {
          if(player.fedEagle) {
            logMsg("<span style='color:var(--success)'>The giant Eagle rescues you!</span>");
            currentLevel = 12; initMap(50); calculateFOV(); drawMap(); updateUI();
          } else {
            logMsg("<span style='color:var(--error)'>The Roc returns... and you are eaten.</span>");
            die('roc');
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
        applyPlayerDamage(drainRate * steps, 'exhaustion', { mitigate: false });
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
    // Tutorial: first time light radius is <= 2
    if (!player._seenDarknessTutorial && window.gameSettings?.tutorial !== false) {
      const r = typeof window._playerFinalLightRadius === 'function' ? window._playerFinalLightRadius() : 5;
      if (r <= 2) {
        player._seenDarknessTutorial = true;
        if (!player._seenTutorials) player._seenTutorials = [];
        if (!player._seenTutorials.includes('tutorial_darkness')) {
          player._seenTutorials.push('tutorial_darkness');
          if (typeof Dialog !== 'undefined' && Dialog.startSelf) {
            setTimeout(() => Dialog.startSelf('tutorial_darkness'), 300);
          }
        }
      }
    }

    // Grue: pure sight-radius check (no scene/dark-tile gate)
    const hasLight = (typeof window._hasLight === 'function' && window._hasLight()) || (window.debugFlags && debugFlags.fullLight);
    if (hasLight) {
      if (player.grueDanger > 0) {
        logMsg("<span style='color:#888; font-style:italic;'>You hear a retreating hiss as the light chases back the darkness.</span>");
      }
      player.grueDanger = 0;
    } else {
      player.grueDanger = (player.grueDanger ?? 0) + steps;
      let danger = player.grueDanger;
      let msgIdx = null;
      if(danger === 1) msgIdx = 0;
      else if(danger === 3) msgIdx = 1;
      else if(danger === 5) msgIdx = 2;
      else if(danger === 7) msgIdx = 3;
      else if(danger === 9) msgIdx = 4;
      else if(danger === 11) msgIdx = 5;
      else if(danger === 13) msgIdx = 6;
      else if(danger >= 15) {
        let deathChance = Math.min(0.9, (danger - 14) * 0.15);
        if(Math.random() < deathChance) {
          logMsg("<span style='color:var(--error); font-size:14px; font-weight:bold;'>🌑 The Grue strikes from the darkness! You never even saw it coming.</span>");
          player.hp = 0;
          die('grue');
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
    // Hunger damage when starving
    if (player.hunger >= 100) {
      applyPlayerDamage(CONSTANTS.HUNGER_DAMAGE * steps, 'hunger', { mitigate: false, suffix: '🍖' });
    }
    // Hunger heal when well-fed (optional)
    if (player.hunger <= 20) {
      player.hp = Math.min(player.maxHp, player.hp + CONSTANTS.HUNGER_HEAL * steps);
    }

    // E.753.MILK: diarrhea — game-time expiry lives on the Condition
    // (auto-removed by fireDueConditions when pointsRemaining hits 0;
    // onRemove restores speedMod and logs). We just emit wall-clock
    // fart SFX while the condition is active, plus a real-time safety
    // purge in case the player idles past untilMs without taking turns.
    if (player.hasCondition && player.hasCondition('diarrhea')) {
      const nowMs = Date.now();
      if (!player._diarrheaNextFartMs) player._diarrheaNextFartMs = nowMs + 6000;
      if (nowMs >= player._diarrheaNextFartMs) {
        if (typeof Sound !== 'undefined') {
          if (!Sound.playSample || !Sound.playSample('whoopie', 0.3)) {
            Sound.playTone(90 + Math.random() * 30, 'sawtooth', 0.18, 0.08, 25);
          }
        }
        zone.dropAt(player.x, player.y, ItemStack.fromIcon('💩'));
        player._diarrheaNextFartMs = nowMs + 8000 + Math.floor(Math.random() * 12000);
      }
      // Wall-clock safety: if the player has been idle past untilMs,
      // exhaust the Condition immediately so onRemove cleanup runs.
      if (player._diarrheaUntilMs && nowMs >= player._diarrheaUntilMs) {
        for (const c of player.conditions) {
          if (c.name === 'diarrhea') c.pointsRemaining = 0;
        }
        player.fireDueConditions();
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
    zone.npcs.forEach(e => {
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
    // ── Per-NPC AI dispatch (moved out of engine into src/npc.js) ──
    //
    // The old 440-line zone.npcs.forEach switch lives in class methods
    // on NPC + 8 typed subclasses (Ifrit, FrenchTaunter, Thief, Fence,
    // Mimic, Shark, Zombie, Pixie). The engine now just builds a ctx
    // and dispatches via runScheduler. Tristram boundary push-back
    // stays here as ENVIRONMENTAL pre-pass (not per-NPC AI).

    // Tristram boundary pre-pass — keep wandering NPCs outside town walls.
    if(currentScene === 'town' && window._tristramBounds) {
      zone.npcs.forEach(e => {
        if(!e || !e.stats) return;
        if(e.type !== 'pixie' && e.type !== 'muck_peasant') return;
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
      });
    }

    // Per-NPC AI dispatch via runScheduler (step 5d/Iter 3).
    //
    // The scheduler drives cooldown-paced calls: fast NPCs (high
    // stats.speed → small cooldowns.move) take multiple turns per
    // player turn; slow NPCs take fewer; immobile NPCs (STATIONARY
    // behavior) no-op their takeTurn but still tick through the
    // scheduler so any attached Conditions fire.
    //
    // localPlayer.actionCooldown gets bumped by `steps` so the
    // scheduler drains time until the player is ready again,
    // letting NPCs act in the meantime. Returns 'player-turn' (or
    // 'brake'/'idle'/'timeout') and we hand control back.
    {
      const ctx = makeNpcCtx({ isScene: false, steps });
      // Phase 4a-2.5: schedulable list combines the legacy `zone.npcs`
      // NPC array with zone.entities (which holds Corpses + Lootables
      // and, in Phase 6, will absorb NPCs too). Filter to anything
      // with takeTurn — drops the `e.stats &&` gate so Corpses
      // (no combat stats) get ticked for decay.
      const live = [...zone.npcs, ...zone.entities].filter(e =>
        e && e !== localPlayer && typeof e.takeTurn === 'function'
      );
      if (typeof runScheduler === 'function' && typeof localPlayer !== 'undefined') {
        localPlayer.actionCooldown = Math.max(0, localPlayer.actionCooldown) + steps;
        runScheduler([localPlayer, ...live], localPlayer, (e) => e.takeTurn(ctx));
      } else {
        // Fallback: scheduler not loaded (shouldn't happen in normal
        // builds — defensive). Single dispatch pass, no cooldowns.
        for (const e of live) e.takeTurn(ctx);
      }
    }

    // Spawn new monsters over time
    if (currentScene === 'dungeon' && Math.random() < CONSTANTS.SPAWN_RATE * steps) {
        let pos = getRandomFloor();
        if (pos && !(darkMap[pos.y] && darkMap[pos.y][pos.x]) && !zone.npcs.some(e => e.x === pos.x && e.y === pos.y) && (pos.x !== player.x || pos.y !== player.y)) {
            spawnNpc(zone.npcs, pos.x, pos.y, "slime", { stats: {...MONSTER_DEF["slime"]} });
        }
    }

    let curTile = theMap[player.y][player.x];
    if (curTile === TILES.BLADE && !player.isKneeling) { applyPlayerDamage(10, 'trap', { mitigate: false }); }

    // Track player stationaryTurns for thief patrol AI
    if(player._lastX === player.x && player._lastY === player.y) {
      player.stationaryTurns = (player.stationaryTurns ?? 0) + steps;
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
           !zone.npcs.some(e => e.x === sx && e.y === sy)) {
          spawnTile = {x: sx, y: sy};
          break;
        }
      }
      if(spawnTile) {
        // Spawn the rat — passive, runs away
        spawnNpc(zone.npcs, spawnTile.x, spawnTile.y, 'wet_rat', { stats: {...MONSTER_DEF['wet_rat'], hp: 6, maxHp: 6, dmg: 0, hit: 0.0, crit: 0.0, passive: true, speed: 1.2} });
        logMsg("<span style='color:var(--warning)'>🐀 You notice a rat scurrying across the floor, followed by a cat in hot pursuit!</span>");
        // Cat spawns a bit further away, chases the rat
        spawnNpc(zone.npcs, spawnTile.x + 1, spawnTile.y, 'cat', { stats: {...MONSTER_DEF['cat']} });
        // Old boot appears at feet (harmless flavor item).
        // Construct by name, not icon: the 👢 glyph is an unregistered
        // duplicate of the oldBoot def (camelCase-collision-skipped in
        // items_registry.js), so fromIcon('👢') would produce a defless
        // stack that renders as a "?" named "👢".
        zone.dropAt(player.x + 1, player.y, new ItemStack('oldBoot', 1));
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
    // (Iter 3: runScheduler dispatch moved up to where the per-NPC
    // AI block lives — single call handles player + all zone.npcs.)
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
        logMsg(`<span style='color:#f44'>💥 The explosion catches you for ${dmg} damage!</span>`);
        applyPlayerDamage(dmg, 'bomb', { mitigate: false, size: 20 });
        updateUI();
      }
    }

    // Damage zone.npcs in blast radius
    for(let i = zone.npcs.length - 1; i >= 0; i--) {
      const e = zone.npcs[i];
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
      logMsg(`<span style='color:var(--error)'>The Thief pickpocketed your ${stolen.def.label()}!</span>`);
      // #13: Play internal dialog voice line on pickpocket
      let stolenVoices = ['voice_internal_stolen_0', 'voice_internal_stolen_1', 'voice_internal_stolen_2'];
      if(typeof Sound !== 'undefined' && Sound.playVoice) {
        Sound.playVoice(stolenVoices[Math.floor(Math.random() * stolenVoices.length)]);
      }
      // Also play the yoink SFX
      if(typeof Sound !== 'undefined' && Sound.playSample) {
        Sound.playSample('yoink', 0.7);
      }
      document.getElementById('modal-content').innerHTML = `<h2>🧤 PICKPOCKETED</h2>${modalPortraitHTML('npc_thief_modal', '🧤')}<p>The Thief stole your <strong>${stolen.def.label()}</strong>!</p><button onclick="hideOverlay()">Drat!</button>`;
      showOverlay();
      renderQuickslots(); updateUI();
    }
  }

  function sleepPlayer() {
    showOverlay();
    document.getElementById('modal-content').innerHTML = `<h2>💤 Sleeping...</h2><button onclick="wakeUp()">Wake Up</button>`;
    player.isSleeping = true;
    Sound.gurgle();
    if (snoreLoop) clearInterval(snoreLoop);
    if (sleepHealLoop) clearInterval(sleepHealLoop);
    snoreLoop = setInterval(() => Sound.snore(), 2000);

    // Bug 11+13: Heal ticks during sleep, scaled by CON, with visible +HP text
    // #37 FIX: Also regenerate MP during sleep
    let conBonus = (player.stats.con ?? 10) - 10;
    let tickHeal = Math.max(1, Math.floor((5 + conBonus) / 2));
    let tickMana = Math.max(1, Math.floor(3 + conBonus / 2));
    let sleepHealTotal = 0;
    let sleepManaTotal = 0;
    sleepHealLoop = setInterval(() => {
      if(!player.isSleeping || player.atronach || isDead) { clearInterval(sleepHealLoop); return; }
      // Bug 13: Wake player if a hostile enemy is within 2 tiles
      let hostileNear = zone.findNpc(e => e.stats && !e.stats.quest && !e.stats.passive &&
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
         spawnNpc(zone.npcs, player.x+1, player.y, "assassin", { stats: {...MONSTER_DEF["assassin"]} });
         // Bug 13: Short delay then wake so player sees the ambush notification
         setTimeout(() => { wakeUp(); }, 300);
       }, 1500);
       return;
    }

    let thief = zone.findNpc(e => e.type === 'thief' && Math.abs(e.x-player.x)+Math.abs(e.y-player.y) <= 2);
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

  function die(cause = 'unknown') {
    let crystalIdx = inventory.findIndex(i => i && i.itemName === 'resurrectionCrystal');
    if (crystalIdx !== -1) {
      logMsg("Crystal Shatters!");
      inventory[crystalIdx] = null;
      player.hp = player.maxHp; updateUI(); return;
    }
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
      const hint = resolveDeathHint(cause);
      showOverlay();
      document.getElementById('modal-content').innerHTML = `<h2>YOU DIED</h2>
        <p style="color:#888;">Floor ${currentLevel} | Level ${player.level} | ${player.gp}g</p>
        ${deathMsg ? `<p id="death-msg" style="color:#f88; font-style:italic; margin:8px 0; font-size:13px; max-width:300px;">${deathMsg}</p>` : ''}
        ${hint ? `<p id="death-hint" style="color:#9cf; margin:8px 0; font-size:13px; max-width:300px;">💡 ${hint}</p>` : ''}
        <button onclick="loadGame()" style="display:block; margin:12px auto;">Load Game</button>
        <button onclick="restartGame()" style="display:block; margin:12px auto;">Restart (keep assets)</button>
        <button onclick="location.reload()" style="display:block; margin:12px auto;">Full Reload</button>`;
    }, 600);
  }

  function checkLevelUp() {
    let req = CONSTANTS.XP_BASE * Math.pow(CONSTANTS.XP_MULT, player.level - 1);
    if (player.xp >= req) {
      player.xp -= req; player.level++; player.statPoints += 1; player.talentPoints += 3;
      player.hp = player.maxHp; player.mp = player.maxMp; logMsg("LEVEL UP!"); triggerLevelUpVisuals();
      // First level-up tutorial
      if (player.level === 2 && window.gameSettings?.tutorial !== false) {
        if (!player._seenTutorials) player._seenTutorials = [];
        if (!player._seenTutorials.includes('tutorial_first_level_up')) {
          player._seenTutorials.push('tutorial_first_level_up');
          setTimeout(function() {
            if (typeof Dialog !== 'undefined' && Dialog.startSelf) {
              Dialog.startSelf('tutorial_first_level_up');
            }
          }, 600);
        }
      }
      // ── QUEST ENGINE EVENT: level_up ──
      if (typeof QuestEngine !== 'undefined') QuestEngine.emit('level_up', { level: player.level });
      if (typeof awardAchievement === 'function') {
        if (player.level >= 5)  awardAchievement('level_5');
        if (player.level >= 10) awardAchievement('level_10');
        if (player.level >= 15) awardAchievement('level_15');
      }
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
    let e = zone.npcs[enemyIndex];
    if(!e) return;

    if(e.type === 'ifrit' && e.isIfrit) {
      let ifritLoot = [new ItemStack('tomeOfFireball', 1)];
      if(Math.random() < 0.5 && player.level >= 20) {
        ifritLoot.push(new ItemStack('enchantedValise', 1));
        logMsg("<span style='color:#FFD700'>An Enchanted Valise falls from the ashes!</span>");
      }
      createCorpse(e.x, e.y, e.type, e.stats, ifritLoot);
      player.xp += 500;
      checkLevelUp();
      zone.npcs.splice(enemyIndex, 1);
      return;
    }

    if (typeof QuestEngine !== 'undefined') {
      QuestEngine.emit('kill', { type: e.type });
      QuestEngine._counters['kill_total'] = (QuestEngine._counters['kill_total'] ?? 0) + 1;
      const kt = QuestEngine._counters['kill_total'];
      if (typeof awardAchievement === 'function') {
        if (kt >= 1)   awardAchievement('first_blood');
        if (kt >= 10)  awardAchievement('kill_10');
        if (kt >= 50)  awardAchievement('kill_50');
        if (kt >= 100) awardAchievement('kill_100');
      }
      if (e.type === 'mouse' || e.type === 'cockroach') {
        QuestEngine._counters['kill_vermin'] = (QuestEngine._counters['kill_vermin'] ?? 0) + 1;
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
        QuestEngine._counters['kill_dungeon'] = (QuestEngine._counters['kill_dungeon'] ?? 0) + 1;
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
      player.townAnimalKills = (player.townAnimalKills ?? 0) + 1;
      if(!player.dennisWarned && player.townAnimalKills >= 2) {
        player.dennisWarned = true;
        logMsg("<span style='color:#aaa; font-style:italic;'>You hear Dennis muttering in the distance: \"Something strange is happening to the animals...\"</span>");
      } else if(player.dennisWarned) {
        player.dennisAnimalDebt = (player.dennisAnimalDebt ?? 0) + 100;
        player.dennisAnimalFurious = true;
        const cost = player.dennisAnimalDebt;
        logMsg(`<span style='color:var(--error)'>Dennis storms over, face red: "MY ANIMALS! You MONSTER! Get away from me until you pay ${cost}g!"</span>`);
        if(typeof Sound !== 'undefined' && Sound.playVoice) Sound.playVoice('voice_dennis_animals_furious');
        QuestEngine && QuestEngine.emit('dennis_animal_fury', { kills: player.townAnimalKills, debt: cost });
      }
    }

    // Phase 2: loot is pre-rolled at spawn time and lives on e.lootable.
    // The branches below now only carry XP, log, sound, and other death
    // side-effects. Loot items are read out at the end. Thief is the
    // single exception: stolenItems depend on runtime player state and
    // are appended after the side-effect block.

    if(e.type === 'mouse') {
      player.xp += 10; player.verminKills = (player.verminKills ?? 0) + 1;
      if(player.verminKills >= 10) awardAchievement('vermin_slayer');
    } else if(e.type === 'cockroach') {
      player.xp += 5; player.verminKills = (player.verminKills ?? 0) + 1;
      if(player.verminKills >= 10) awardAchievement('vermin_slayer');
    } else if(e.type === 'chicken') {
      if(typeof Sound !== 'undefined' && Sound.cluck) Sound.cluck();
      player.xp += 8;
      logMsg(`<span style='color:#888'>The chicken flaps once and goes still.</span>`);
    } else if(e.type === 'duck') {
      Sound.quack();
      player.xp += 15;
      player.duckKills = (player.duckKills ?? 0) + 1;
      if(player.duckKills >= 5 && !achievements['duck_hunter']) {
        showDuckHuntDogLaugh();
        awardAchievement('duck_hunter');
      }
      logMsg(`<span style='color:#888'>The duck lets out a final quack before falling silent.</span>`);
    } else if(e.type === 'wet_rat') {
      player.xp += 20;
      logMsg(`<span style='color:#888'>The wet rat squeaks one last time.</span>`);
    } else if(e.type === 'pixie') {
      player.xp += 30;
      logMsg(`<span style='color:#88f'>Pixie dust and a Resurrection Crystal scatter across the ground.</span>`);
    } else if(e.type === 'shark') {
      // Variant log messages depend on what was pre-rolled. The roller
      // can't easily emit log lines, so we inspect the pre-rolled drops.
      const slots = e.lootable ? e.lootable.slots : [];
      if (slots.some(s => s.itemName === 'sharkskinSuit')) {
        logMsg(`<span style='color:#FFD700'>🦈 The mighty shark drops a pristine Sharkskin Suit!</span>`);
      } else if (slots.some(s => s.itemName === 'sharkTooth')) {
        logMsg(`<span style='color:#88FF88'>🦷 You claim a shark tooth as a trophy!</span>`);
      }
      if (slots.some(s => s.itemName === 'bagOfHolding')) {
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
      changeGold(15 + Math.floor(Math.random() * 30));
    } else if(e.type === 'mimic') {
      player.xp += 90;
      addFloatingText(e.x, e.y, "+90xp", "#8cf", 14);
      if(typeof Sound !== 'undefined' && Sound.playSample) Sound.playSample('mimic_laugh', 0.5);
      logMsg("<span style='color:#FFD700'>The Mimic collapses into splintered boards, keys, and a spray of stolen gold.</span>");
    } else if(e.type === 'genie') {
      // E9: Genie boss — guaranteed Tome of Town Portal drop (100%)
      let xpReward = 20 + currentLevel * 10;
      player.xp += xpReward;
      addFloatingText(e.x, e.y, `+${xpReward}xp`, "#8cf", 14);
      logMsg("<span style='color:#FFD700'>✨ The Genie's power dissipates! A shimmering tome falls from the swirling smoke...</span>");
      logMsg("<span style='color:#88CCFF'>📖🌀 You find the Tome of Town Portal!</span>");
    } else if(e.type === 'cow') {
      if(typeof Sound !== 'undefined' && Sound.moo) Sound.moo();
      player.xp += 20;
      logMsg(`<span style='color:#888'>The cow moos one last time.</span>`);
    } else if(e.type === 'pig') {
      if(typeof Sound !== 'undefined' && Sound.oink) Sound.oink();
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
      player.xp += 800;
      addFloatingText(e.x, e.y, '+800xp', '#FFD700', 18);
      checkLevelUp();
    } else {
      let xpReward = 20 + currentLevel * 10;
      player.xp += xpReward;
      addFloatingText(e.x, e.y, `+${xpReward}xp`, "#8cf", 14);
    }

    // Read pre-rolled loot off the npc.
    let corpseLoot = (e.lootable && Array.isArray(e.lootable.slots))
      ? e.lootable.slots.slice()
      : [];

    // Thief: stolen items only resolvable at death time. Append.
    if (e.type === 'thief' && stolenItems.length > 0) {
      logMsg(`<span style='color:var(--success)'>The thief drops your stolen belongings!</span>`);
      stolenItems.forEach(item => corpseLoot.push(new ItemStack(item.itemName, 1)));
      stolenItems.length = 0;
    }

    if(corpseLoot.length > 0) {
      createCorpse(e.x, e.y, e.type, e.stats, corpseLoot);
    }

    checkLevelUp();
    zone.npcs.splice(enemyIndex, 1);
  };

  // Stubs — replaced by player.js functions when loaded
  if(typeof getPlayerDmgVersus === 'undefined') {
    window.getPlayerDmgVersus = function(e) { return Math.floor(Math.random() * (player.baseDmg ?? 3) + 1 + (player.meleeDmgBonus ?? 0)); };
    window.getPlayerHits = function(e) { return Math.random() < (player.hitRate ?? 0.85); };
    window.getPlayerPrimaryHand = function() { return player.equipped && player.equipped.leftHand; };
    window.getPlayerCritRate = function() { return player.critRate ?? 0; };
  }

  // (function applyDamageToEnemy retired Iter 5 — damage application
  // now lives on NPC.takeDamage(dmg, attacker) in src/npc.js. Crit
  // rolls use attacker.effectiveCritRate(), generalizing past the
  // player-only assumption baked into the legacy global helper.)

  function doCombat(enemyIndex) {
    let e = zone.npcs[enemyIndex]; if(!e) return;
    // End stealth on melee attack (unless improved to level 2)
    if (player.talents?.stealth?.on && player.talents.stealth.level < 2) {
      player.talents.stealth.on = false;
      logMsg("Stealth broken by your attack.");
    }
    if(e.type === 'master' || e.type === 'pirate') { insultBattle(enemyIndex); return; }
    let dmg = getPlayerDmgVersus(e);

    // B760.MIMIC: opening/attacking a mimic wakes and aggros it.
    if(e.type === 'mimic' && e.isMimic) {
      if(!e.provoked) {
        e.provoked = true;
        e.stats.passive = false;
        e.stats.speed = Math.max(0.9, e.stats.speed ?? 0.9);
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
      ifritDmg = e.takeDamage(ifritDmg, player);
      Sound.sword();
      Sound.playTone(200, 'sawtooth', 0.3, 0.1, 400);
      addFloatingText(e.x, e.y, `-${ifritDmg}`, "#f00", 16 + ifritDmg);
      if(window.WebGLFX && WebGLFX.onCombatImpact) WebGLFX.onCombatImpact(ifritDmg, e.x, e.y);
      if(player.level < 10) {
        logMsg("<span style='color:#f60'>Ifrit barely flinches! You need to be level 10+ to deal full damage.</span>");
      }
      if(e.stats.hp <= 0) {
        logMsg("<span style='color:#FFD700'>🔥 IFRIT DEFEATED! The fire elemental crumbles to ash!</span>");
        let ifritLoot = [new ItemStack('tomeOfFireball', 1)];
        if(Math.random() < 0.5 && player.level >= 20) {
          ifritLoot.push(new ItemStack('enchantedValise', 1));
          logMsg("<span style='color:#FFD700'>An Enchanted Valise falls from the ashes!</span>");
        }
        createCorpse(e.x, e.y, e.type, e.stats, ifritLoot);
        player.xp += 500;
        checkLevelUp();
        zone.npcs.splice(enemyIndex, 1);
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
        dmg = e.takeDamage(dmg, player);
        addFloatingText(e.x, e.y, `-${dmg}`, "#f00", 16 + dmg);
        let pct = e.stats.hp / 200;
        if (pct <= 0.75 && player.knightLimb === 0) { player.knightLimb = 1; logMsg("'Tis but a scratch!' (Damage Reduced)"); e.stats.dmg -= 5; }
        if (pct <= 0.50 && player.knightLimb === 1) { player.knightLimb = 2; logMsg("'Just a flesh wound!'"); e.stats.dmg -= 5; }
        if (pct <= 0.25 && player.knightLimb === 2) { player.knightLimb = 3; logMsg("'I'll bite your legs off!' (Speed Reduced)"); e.stats.speed = 0.1; e.stats.icon = '🦵'; }
        if (e.stats.hp <= 0) {
          logMsg("'Alright, we'll call it a draw!'");
          createCorpse(e.x, e.y, e.type, e.stats, [new ItemStack('severedLeg', 1)]);
          zone.npcs.splice(enemyIndex, 1); player.xp += 500; checkLevelUp();
        }
      }
      advanceTurn(1);
      return;
    }

    if(getPlayerPrimaryHand() === 'accordion') {
      // Using Accordion in battle.
      Sound.polka();
      logMsg(`<span style='color:var(--warning)'>You strike up a catastrophic little polka at the ${e.type}. It hurts nobody and improves nothing.</span>`);
      awardAchievement('neros_polka');
    }
    else {
      Sound.sword();

      // Check to see if player misses.
      if (getPlayerHits(e)) {
        dmg = e.takeDamage(dmg, player);
        logMsg(`You hit the ${e.type} for ${dmg} damage.`);
        // Provoke passive/friendly animals when attacked
        if(e.stats.passive || e.friendly || e.farmAnimal) {
          e.provoked = true;
          // 50% chance to fight back, 50% chance to panic-flee
          e.stats.passive = false;
          if(Math.random() < 0.5) {
            e.fleePlayer = true;
            e.stats.speed = (e.stats.speed ?? 1) * 2;
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
    let e = zone.npcs[enemyIndex];
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
    let e = zone.npcs[enemyIndex];
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

    e._insultRoundCount = (e._insultRoundCount ?? 0) + 1;

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
    let e = zone.npcs[enemyIndex];
    if(e) e._insultPlayerOpened = true;
    beginInsultRound(enemyIndex);
  };

  window.playerOpenInsultChoice = (enemyIndex, idx, known) => {
    const e = zone.npcs[enemyIndex];
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
    let e = zone.npcs[enemyIndex];
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
      e._prideLosses = (e._prideLosses ?? 0) + 1;
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

  // (function monsterAttack(enemyIndex) retired Iter 4 — combat
  // resolution now lives on NPC.attack(target, ctx) in src/npc.js.
  // Callers used to be all in the legacy zone.npcs.forEach block, now
  // gone. The remaining call site was the ctx.monsterAttack bridge
  // in makeNpcCtx — also retired; NPC.takeTurn calls this.attack
  // directly.)

  // ── Real-time activity tracking (for tutorials) ─────────────
  const ACTIVITY_TIMEOUT = 60000;   // 60s — gaps longer than this are idle time
  const SAVE_TUTORIAL_MS  = 900000; // 15 minutes

  function _trackActivity() {
    const now = Date.now();
    if (window._lastActivityTime) {
      const dt = now - window._lastActivityTime;
      if (dt < ACTIVITY_TIMEOUT) {
        player._realPlayTimeMs = (player._realPlayTimeMs || 0) + dt;
      }
    }
    window._lastActivityTime = now;

    if (player._realPlayTimeMs >= SAVE_TUTORIAL_MS &&
        window.gameSettings?.tutorial !== false &&
        !player._hasSaved &&
        (!player._seenTutorials || !player._seenTutorials.includes('tutorial_save'))) {
      if (!player._seenTutorials) player._seenTutorials = [];
      player._seenTutorials.push('tutorial_save');
      setTimeout(function() {
        if (typeof Dialog !== 'undefined' && Dialog.startSelf) {
          Dialog.startSelf('tutorial_save');
        }
      }, 300);
    }
  }

  function movePlayer(dx, dy) {
    if(isDead || player.isSleeping) return;
    _trackActivity();
    // E15: T-Rex stomp stun check
    if(player._stunned && player._stunned > 0) {
      player._stunned--;
      logMsg("<span style='color:#f88'>You're stunned!</span>");
      advanceTurn(1); return;
    }
    player.facing = {dx, dy};
    let nx = player.x + dx, ny = player.y + dy;
    if(nx < 0 || nx >= mapW || ny < 0 || ny >= mapH) { Sound.oof(); if(dx !== 0 && dy !== 0) { const _sx=player.x,_sy=player.y; movePlayer(dx,0); if(player.x!==_sx||player.y!==_sy) return; movePlayer(0,dy); } return; }
    let tile = theMap[ny][nx];

    // #13: Background scene boundary collision check
    if(tile === TILES.BG_SCENE && window.BOUNDARY_DATA) {
      const bd = window.BOUNDARY_DATA[currentScene];
      if(bd) {
        const isWalkable = bd.walkable && bd.walkable.some(p => p.x === nx && p.y === ny);
        const isBlocked = bd.blocked && bd.blocked.some(p => p.x === nx && p.y === ny);
        if(!isWalkable || isBlocked) { Sound.oof(); if(dx !== 0 && dy !== 0) { const _sx=player.x,_sy=player.y; movePlayer(dx,0); if(player.x!==_sx||player.y!==_sy) return; movePlayer(0,dy); } return; }
      }
    }
    
    // Bridge Keeper trigger removed — keeper now opts into the Dialog system
    // via phraseId. The quests_monty_python_bridge.js pack registers the
    // 3-question tree (bridge_keeper_q1/q2/q3/win/lose). The general
    // phraseId branch a few lines below handles the bump.

    if (tile === TILES.LETTER) {
       let letter = window.letterMap ? window.letterMap[`${nx},${ny}`] : 'A';
       if ("IEHOVA".indexOf(letter) === -1) { logMsg("Wrong letter!"); die('jehovah'); return; }
    }

    let eIdx = zone.npcs.findIndex(e => e.x === nx && e.y === ny);
    if (eIdx !== -1) {
      // Non-hostile NPC interactions
      let npc = zone.npcs[eIdx];

      // E6: Deckard Cain heals player to full on first visit per town entry.
      // Must happen before Dialog routing (Cain now uses phraseId).
      if(npc.type === 'cain' && !window._cainHealedThisVisit) {
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

      // Andor's-Trail-style dialog: NPCs with a phraseId opt into the new
      // Dialog system. Everything below this is legacy per-NPC handling
      // that we'll migrate NPC-by-NPC in tier-2+. Tier-1 migrants today:
      // cain, mended_drum_barman + 4 patrons (vimes/cohen/librarian/bearded_dwarf),
      // and bridge_keeper (spawn + tree owned by quests_monty_python_bridge.js).
      if (npc.phraseId && typeof Dialog !== 'undefined') {
        // Intercept: if player owes theft debt to this NPC, redirect to thief dialog
        const debtKey = npc.shopType || npc.type;
        if (player._thiefDebt && player._thiefDebt[debtKey]) {
          if (npc.phraseId) npc._thiefReturnPhrase = npc.phraseId;
          Dialog.startWith(npc, '_thief_caught_debt');
          return;
        }
        Dialog.startWith(npc, npc.phraseId);
        return;
      }

      if(npc.type === 'chaplain') {
        openShop('chaplain');
        return;
      }
      if(npc.type === 'dennis') {
        openShop('dennis');
        return;
      }
      // fence migrated to Dialog system (phraseId 'fence_greet'). The Dialog
      // branch above intercepts; this block remains as legacy fallback only.
      // #12: Town guard — discount quest (Bethesda-style civic duty reward)
      if(npc.type === 'town_guard') {
        openShop('town_guard');
        return;
      }

      // dennis_wife / muck_peasant / retired_soldier migrated to Dialog
      // system. Their phraseIds are set on the spawn sites; the Dialog
      // branch above intercepts before this point.
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
        if((typeof window._hasLight === 'function' && window._hasLight()) || (window.debugFlags && debugFlags.fullLight)) {
          if(!player._grokMetBefore) {
            grokFirstMeet(); // Was sleeping — wakes up grumpy
          } else {
            openPacifistOrc('intro');
          }
        } else {
          // Various dark-encounter hints, escalating with danger
          let grueDanger = player.grueDanger ?? 0;
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
        const hasBottle = inventory.some(i => i && i.itemName === 'brassBottle');
        if(hasBottle && typeof Dialog !== 'undefined' && Dialog._phrases && Dialog._phrases['kq5_genie_greet']) {
          // Wish dialog now owned by quests_kq5_genie.js. Dialog tree
          // delegates to legacy genieWish() via callFn scriptEffects.
          if(typeof Sound !== 'undefined' && Sound.playVoice) Sound.playVoice('voice_genie_greeting');
          Dialog.startWith(npc, 'kq5_genie_greet');
          return;
        } else {
          // No bottle (or no quest pack loaded) — genie attacks
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
    if (tile === TILES.WALL || tile === TILES.TREE || tile === TILES.ROCK || tile === TILES.MOAT) { Sound.oof(); if(dx !== 0 && dy !== 0) { const _sx=player.x,_sy=player.y; movePlayer(dx,0); if(player.x!==_sx||player.y!==_sy) return; movePlayer(0,dy); } return; }

    // Phase 5b: bumping into an impassable container (Box, Chest, Safe,
    // etc. with def.impassable) opens the loot popup at THAT tile rather
    // than moving the player onto it. Walking onto a non-impassable
    // container falls through to the regular move-and-show-popup path.
    if (typeof zone !== 'undefined') {
      // Phase 6c: mimic check fires BEFORE the popup opens, regardless
      // of whether the chest is impassable. Bump or walk-onto, the
      // mimic springs.
      if (_checkMimicAt(nx, ny)) return;
      const bumped = zone.lootablesAt(nx, ny).find(l => l.ownerKind === 'container' && l.def?.impassable);
      if (bumped) {
        if (typeof window.hideLootPopup === 'function') window.hideLootPopup();
        if (typeof window.showLootPopup === 'function') window.showLootPopup(nx, ny);
        Sound.oof();
        return;
      }
    }
    if(tile === TILES.DEEP_WATER && isEagleSkyTile(nx, ny)) {
      Sound.oof();
      logMsg("<span style='color:#88CCFF'>A sheer cliff drops away into open sky. Best not to test whether you can fly.</span>");
      if(dx !== 0 && dy !== 0) { const _sx=player.x,_sy=player.y; movePlayer(dx,0); if(player.x!==_sx||player.y!==_sy) return; movePlayer(0,dy); }
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

    // (Chest tiles are gone since Phase 6c — chests are impassable
    // container Lootables now, handled by the bump-into-container
    // popup branch above.)

    if(currentScene === 'town' && (tile === TILES.WATER || tile === TILES.DEEP_WATER)) {
      Sound.splash();
      // #9: Splash emoji + brief swim avatar
      addFloatingText(nx, ny, '💦', '#88CCFF', 22);
      player._swimming = true;
      setTimeout(() => { player._swimming = false; drawMap(); }, 600);
      logMsg("<span style='color:#88CCFF'>You step into the brook, splash once, and instantly remember that you absolutely cannot swim.</span>");
      if(typeof Sound !== 'undefined' && Sound.playVoice) Sound.playVoice('voice_internal_brook');
      logMsg("<span style='color:#888'>You stumble back onto dry land, dripping and embarrassed.</span>");
      advanceTurn('move');
      return;
    }

    // Moving anywhere closes any open loot popup — the popup is for
    // "what's here?" and once the player leaves, the answer changes.
    if (typeof window.hideLootPopup === 'function') window.hideLootPopup();

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
        const ifrit = zone.npcs.find(e => e.type === 'ifrit' && e.isIfrit);
        if(ifrit) {
          const dist = Math.abs(ifrit.x - player.x) + Math.abs(ifrit.y - player.y);
          if(dist <= 8) Sound.playMusic('ifrit_lair');
        }
      }
    }

    // Eagle Crag entry detection (Floor 3) — legacy check, now handled by BOUNDARY_DATA scene path

    // Corpse walk-over: funny messages
    {
      let steppedCorpse = zone.corpses.find(c => c.x === nx && c.y === ny && !c.isBones);
      if(steppedCorpse && Math.random() < 0.4) {
        let msg = CORPSE_WALK_MESSAGES[Math.floor(Math.random() * CORPSE_WALK_MESSAGES.length)];
        logMsg(`<span style='color:#888; font-style:italic;'>${msg}</span>`);
      }
    }

    // Corpse decay is now scheduler-driven (Phase 4a-2.5) — Corpse.takeTurn
    // handles flesh→bones and bones→removal on game-time ticks. No
    // wall-clock poll needed here.

    // Phase 6c: mimic check on the destination tile — non-impassable
    // chest variants (Small Chest, Chest of Holding) get walked onto
    // instead of bumped, so the bump path's mimic check wouldn't fire.
    // _checkMimicAt returns true if the tile sprung; bail before
    // showing a popup for the now-removed Lootable.
    if (_checkMimicAt(player.x, player.y)) return;

    // Phase 4b: open the loot popup if the tile the player just stepped
    // onto has any lootable source (corpse, floor pile, or container).
    // hideLootPopup was called above on move-start; this re-opens for
    // the new tile.
    if (typeof window.showLootPopup === 'function') {
      window.showLootPopup(player.x, player.y);
    }

    if(tile === TILES.WATER || tile === TILES.DEEP_WATER) {
      Sound.splash();
      // Bug 42-43: Shark aggro — immediately provoke any nearby shark when player enters water
      zone.npcs.forEach(e => {
        if(e.type === 'shark' && e.stats && e.stats.stalks) {
          let dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
          if(dist <= (e.stats.aggro ?? 6)) {
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
        if (typeof awardAchievement === 'function') {
          if (currentLevel >= 3)  awardAchievement('floor_3');
          if (currentLevel >= 5)  awardAchievement('floor_5');
          if (currentLevel >= 10) awardAchievement('floor_10');
          if (currentLevel >= 15) awardAchievement('floor_15');
        }
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
      if (typeof awardAchievement === 'function') {
        if (currentLevel >= 3)  awardAchievement('floor_3');
        if (currentLevel >= 5)  awardAchievement('floor_5');
        if (currentLevel >= 10) awardAchievement('floor_10');
        if (currentLevel >= 15) awardAchievement('floor_15');
      }
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
        if (typeof awardAchievement === 'function') {
          if (currentLevel >= 3)  awardAchievement('floor_3');
          if (currentLevel >= 5)  awardAchievement('floor_5');
          if (currentLevel >= 10) awardAchievement('floor_10');
          if (currentLevel >= 15) awardAchievement('floor_15');
        }
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
      // Mended Drum handled by NPC bump dialog — tile is just walkable
      if (window._mendedDrumX && nx === window._mendedDrumX && ny === window._mendedDrumY) return;
      openShop('apu');
      return;
    }
    if(tile === TILES.BOOKSTORE) {
      if (typeof Dialog !== 'undefined' && Dialog.startWith) {
        Dialog.startWith({
          type: 'bookstore',
          stats: { icon: '📚', name: 'Erasmus' },
        }, 'bookstore_greet');
      } else {
        openShop('wizard');
      }
      return;
    }
    if(tile === TILES.LEFTYS) {
      openShop('leftys');
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
    advanceTurn('move');
  }

  // bridgeTrial / bridgeAns / bridgeAns2 / bridgeAns3 deleted — the bridge
  // keeper now uses the Dialog system. See quests_monty_python_bridge.js for
  // the 3-question tree (phrase ids bridge_keeper_q1/q2/q3/win/lose). The
  // player.bridgeQuestions flag is gone too; the keeper is despawned via the
  // @remove sentinel on the win phrase.

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

    let beadCount = inventory.reduce((sum, i) => sum + (i && i.itemName === 'orichalcumBead' ? (i.qty ?? 1) : 0), 0);

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
      if(inventory[i] && inventory[i].itemName === 'orichalcumBead') {
        let take = Math.min(inventory[i].qty ?? 1, toConsume);
        inventory[i].qty = (inventory[i].qty ?? 1) - take;
        toConsume -= take;
        if(inventory[i].qty <= 0) inventory[i] = null;
      }
    }
    renderQuickslots();
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

  
