/*
  MECHANICS MODULE – INVENTORY, ITEMS, AND SPECIAL ACTIONS
  =========================================================
  This module contains the core game mechanics for handling player interactions with inventory items,
  special quest items, and Monty Python‑themed events. It bridges the UI (clicks, keypresses) with
  the game state (inventory, equipment, zone.npcs, quest flags).

  Key responsibilities:
  1. Item click handling – weapon/armor equipping, food/potion consumption, scroll reading
  2. Special item logic – Holy Hand Grenade (timed modal), Boots of Blinding Speed, Potion of Newt
  3. Monty Python events – Witch Trial (duck‑based justice), Killer Rabbit grenade sequence
  4. Inventory management – pickup, stacking, inventory overflow, greed traps
  5. Equipment swapping – stat recalculation (damage, dodge rate)

  The functions here are called from ui_logic.js (handleItemClick) and from the game loop
  (pickupItems). They update the global inventory, inventory, player.equipped, and enemy arrays.
*/
  // #38: Helper — show blue +MP floating text above player
  function showMpGain(amount) {
    if(amount <= 0) return;
    addFloatingText(player.x, player.y, `+${amount} MP`, '#4af', 16);
    if(window.WebGLFX && WebGLFX.onManaUse) WebGLFX.onManaUse(-amount); // negative = gain
  }

  // === WoW-style Macro System ===
  // Macros evaluate automatically each turn. Saved in player.macros[].
  // Conditions: HP<N, MP<N, HUNGER>N, FLOOR>=N, STATUS=name
  // Actions: USE 'item name', CAST spellname, SLEEP, FLEE
  window.runMacros = function() {
    if(!player.macros || player.macros.length === 0) return;
    for(const macro of player.macros) {
      try {
        if((macro._cdRemaining ?? 0) > 0) {
          macro._cdRemaining--;
          continue;
        }
        if(!evalMacroCondition(macro.condition)) continue;
        execMacroAction(macro.action);
        if((macro.cooldownTurns ?? 0) > 0) {
          macro._cdRemaining = macro.cooldownTurns;
        }
      } catch(e) { /* silent */ }
    }
  };
  function resolveMacroVars(text) {
    const enemyCount = zone.npcs.filter(en => en && en.stats && en.stats.hp > 0 && !en.friendly && !en.farmAnimal).length;
    const vars = {
      '$hp': Math.floor(player.hp),
      '$mp': Math.floor(player.mp),
      '$hunger': Math.floor(player.hunger ?? 0),
      '$floor': currentLevel,
      '$scene': currentScene,
      '$enemy_count': enemyCount,
      '$x': player.x,
      '$y': player.y
    };
    return String(text || '').replace(/\$[a-z_]+/gi, (m) => {
      const key = m.toLowerCase();
      return (key in vars) ? String(vars[key]) : m;
    });
  }
  function evalMacroCondition(cond) {
    cond = resolveMacroVars(cond).trim();
    let m;
    if((m = cond.match(/^HP\s*<\s*(\d+)$/i))) return player.hp < parseInt(m[1]);
    if((m = cond.match(/^MP\s*<\s*(\d+)$/i))) return player.mp < parseInt(m[1]);
    if((m = cond.match(/^HUNGER\s*>\s*(\d+)$/i))) return player.hunger > parseInt(m[1]);
    if((m = cond.match(/^ENEMIES\s*>\s*(\d+)$/i))) return zone.npcs.filter(en => en && en.stats && en.stats.hp > 0 && !en.friendly && !en.farmAnimal).length > parseInt(m[1]);
    if((m = cond.match(/^ENEMIES\s*<\s*(\d+)$/i))) return zone.npcs.filter(en => en && en.stats && en.stats.hp > 0 && !en.friendly && !en.farmAnimal).length < parseInt(m[1]);
    if((m = cond.match(/^FLOOR\s*>=\s*(\d+)$/i))) return currentLevel >= parseInt(m[1]);
    if((m = cond.match(/^SCENE\s*=\s*(\w+)$/i))) return String(currentScene) === String(m[1]).toLowerCase();
    if((m = cond.match(/^STATUS\s*=\s*(\w+)$/i))) return player.statusType === m[1].toLowerCase();
    if((m = cond.match(/^STATUS\s*!=\s*(\w+)$/i))) return player.statusType !== m[1].toLowerCase();
    return false;
  }
  function execMacroAction(action) {
    action = resolveMacroVars(action).trim();
    let m;
    if((m = action.match(/^USE\s+'?(.+?)'?$/i))) {
      const name = m[1].toLowerCase();
      let idx = inventory.findIndex(item => item && item.def && item.def.displayName.toLowerCase() === name);
      if(idx === -1) idx = inventory.findIndex(item => item && item.icon.toLowerCase().includes(name));
      if(idx !== -1) { handleItemClick(idx); return; }
      // Try inventory
      let pidx = inventory.findIndex(item => item && item.def && item.def.displayName.toLowerCase() === name);
      if(pidx !== -1) { handleInventoryUse(pidx); }
    } else if((m = action.match(/^CAST\s+(\w+)$/i))) {
      castSpell(m[1].toLowerCase());
    } else if(/^SLEEP$/i.test(action)) {
      if(typeof sleepPlayer === 'function') sleepPlayer();
    } else if(/^FLEE$/i.test(action)) {
      // Move away from nearest enemy
      const nearest = zone.npcs.reduce((best, e) => {
        const d = Math.abs(e.x-player.x)+Math.abs(e.y-player.y);
        return (!best || d < best.d) ? { e, d } : best;
      }, null);
      if(nearest) {
        const fleeX = player.x - Math.sign(nearest.e.x - player.x);
        const fleeY = player.y - Math.sign(nearest.e.y - player.y);
        if(typeof movePlayer === 'function') movePlayer(fleeX - player.x, fleeY - player.y);
      }
    }
  }
  function handleInventoryUse(idx) {
    let item = inventory[idx]; if(!item) return;
    let def = item.def; if(!def) return;
    // Move to free inventory slot, then use
    let freeSlot = inventory.findIndex(s => s === null);
    if(freeSlot !== -1) { inventory[freeSlot] = item; inventory[idx] = null; handleItemClick(freeSlot); }
  }

  // === Open a bag / expansion bag ===
  // openBagFromSource: source = 'inv' or 'inventory', idx = slot index
  function openBagFromSource(source, idx) {
    let arr = source === 'inv' ? inventory : inventory;
    let item = arr[idx];
    if(!item) return;
    let def = item.def;
    if(!def || def.type !== 'bag') return;
    // Initialize contents array if new bag
    if(!item.slots) {
      item.slots = new Array(def.bagSlots ?? 3).fill(null);
      // Pre-fill new bags with random loot (the "loot bag" aspect)
      if(def.bagSlots <= 3) {
        let lootTable = ['🪙', '🪙', '🧪', '🍖', '🕯️'];
        let count = 1 + Math.floor(Math.random() * Math.min(2, def.bagSlots));
        for(let i = 0; i < count && i < item.slots.length; i++) {
          item.slots[i] = ItemStack.fromIcon(lootTable[Math.floor(Math.random() * lootTable.length)], 1);
        }
      }
    }
    Sound.chestOpen();
    // Phase: bags now track open state via window._openBags (Set of
    // ItemStack refs) so multiple can be inline-expanded at once.
    if (window._openBags) window._openBags.add(item);
    const inventoryModal = document.getElementById('inventory-modal');
    if(inventoryModal && (inventoryModal.style.display === 'none' || inventoryModal.style.display === '')) {
      inventoryModal.style.display = 'flex';
    }
    renderInventory();
  }

  // Legacy wrapper: openBag(idx) works for inventory (backward compat)
  function openBag(idx) { openBagFromSource('inventory', idx); }

  // Public entry points
  window.openBagInInventory = function(idx) { openBagFromSource('inv', idx); };

  window.takeItemFromBagSource = (source, bagIdx, itemIdx) => {
    let arr = source === 'inv' ? inventory : inventory;
    let bag = arr[bagIdx];
    if(!bag || !bag.slots || !bag.slots[itemIdx]) return;
    let taken = bag.slots[itemIdx];
    // Try to add to inventory
    let slot = inventory.findIndex(s => s === null);
    if(slot !== -1) {
      inventory[slot] = ItemStack.fromIcon(taken.icon, taken.qty ?? 1);
      bag.slots[itemIdx] = null;
      let def = taken.def;
      logMsg(`Took ${taken.icon} ${def ? def.name : ''} from bag.`);
    } else {
      // Try inventory
      let pSlot = inventory.findIndex((s, i) => s === null && !(source === 'inventory' && i === bagIdx));
      if(pSlot !== -1) {
        inventory[pSlot] = ItemStack.fromIcon(taken.icon, taken.qty ?? 1);
        bag.slots[itemIdx] = null;
        logMsg(`Took ${taken.icon} to inventory (inventory full).`);
      } else {
        zone.dropAt(player.x, player.y, new ItemStack(taken.itemName, taken.qty ?? 1));
        bag.slots[itemIdx] = null;
        logMsg(`${taken.icon} dropped on ground (no space).`);
      }
    }
    renderQuickslots(); renderInventory(); updateUI();
  };

  // Legacy wrapper
  window.takeItemFromBag = (bagIdx, itemIdx) => { window.takeItemFromBagSource('inventory', bagIdx, itemIdx); };

  // Generate a random bag (by camelCase name) appropriate for the given
  // level. Returns the bag's name string; callers wrap in
  // `new ItemStack(name, 1)`. Fallback 'smallClothBag' when no
  // candidates fit the criteria.
  //
  // Restricted to type:'bag' — Phase 3 added type:'container' for
  // world-bound containers (Box, Iron Chest, Safe, ...) which also
  // pass def.isContainer() because they have bagSlots > 0. Those are
  // NOT pickup-able and must never end up in loot/bag pools.
  window.randomBag = (playerLevel) => {
    const candidates = [];
    for(const [name, def] of Object.entries(ItemDefs)) {
      if (def.type !== 'bag') continue;
      if (!def.isContainer() || def.bagSlots > 10) continue;
      if (def.minLevel && playerLevel < def.minLevel) continue;
      candidates.push(name);
    }
    if (candidates.length === 0) return 'smallClothBag';
    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  // === Inventory & Quest Actions (v7.2.0) ===
   function handleItemClick(idx) {
     if(player.hp <= 0) { logMsg("<span style='color:#888'>You are dead.</span>"); return; }
     let itemObj = inventory[idx];
     if(!itemObj) return;

    // E13: Identify Scroll — mark item as identified, reveal full tooltip
    if(isIdentifying) {
      isIdentifying = false;
      if(!player.identifiedItems) player.identifiedItems = new Set();
      player.identifiedItems.add(itemObj.itemName);
      const identDef = itemObj.def;
      logMsg(`<span style='color:#4af'>✨ Identified: ${identDef ? identDef.name : itemObj.icon}!</span>`);
      if(identDef) {
        const details = [];
        if(identDef.baseDmg) details.push(`Damage: ${identDef.baseDmg}`);
        if(identDef.maxHeal) details.push(`Heal: ${identDef.maxHeal} HP`);
        if(identDef.evadePercent) details.push(`Evasion: ${Math.round(identDef.evadePercent*100)}%`);
        if(identDef.thornsDmg) details.push(`Thorns: ${identDef.thornsDmg} dmg`);
        if(identDef.meleeDmgBonus) details.push(`+${identDef.meleeDmgBonus} melee dmg`);
        if(identDef.hitRateBonus) details.push(`+${Math.round(identDef.hitRateBonus*100)}% hit`);
        if(identDef.magicScaling) details.push(`Magic scaling: ${identDef.magicScaling}`);
        if(details.length) logMsg(`<span style='color:#fd0'>${details.join(' | ')}</span>`);
      }
      renderQuickslots(); renderInventory(); updateUI();
      return;
    }

    // Handle Holy Hand Grenade
    if(itemObj.itemName === 'holyHandGrenade') {
      triggerGrenade(idx);
      return;
    }

    // Handle Potion of Newt (I got better!)
    if(itemObj.itemName === 'potionOfNewt') {
      logMsg("You turned into a newt! ...You got better.");
      player.xp += 100; checkLevelUp(); decrementItem(idx);
      return;
    }

    // Boots of Blinding Speed Logic
    if(itemObj.itemName === 'bootsOfBlindingSpeed') {
      logMsg("<span style='color:var(--primary)'>You feel extremely fast, but everything goes dark!</span>");
      player.blind = true;
      swapEquip(idx, 'feet');
      return;
    }

    // E.753.POISON + E.753.MILK: Poisoned food effects
    if(itemObj.itemName === 'oyster') {
      logMsg("<span style='color:#f44'>Maybe I shouldn't have eaten an oyster from a convenience store in a dungeon...</span>");
      if(typeof Sound !== 'undefined') Sound.playTone(80, 'sawtooth', 0.3, 0.1, 40);
      logMsg("<span style='color:#f44'>You feel nauseous! (-10 HP)</span>");
      decrementItem(idx);
      if(applyPlayerDamage(10, 'poison', { mitigate: false, size: 18 })) return;
      updateUI(); return;
    }
    if(itemObj.itemName === 'peanuts') {
      logMsg("<span style='color:#f44'>I'm allergic to peanuts!</span>");
      if(typeof Sound !== 'undefined') Sound.playTone(100, 'sawtooth', 0.4, 0.1, 30);
      logMsg("<span style='color:#f44'>Your throat swells! (-15 HP)</span>");
      decrementItem(idx);
      if(applyPlayerDamage(15, 'poison', { mitigate: false, size: 18 })) return;
      updateUI(); return;
    }
    if(itemObj.itemName === 'milk') {
      logMsg("<span style='color:#fa0'>Turns out I'm lactose intolerant.</span>");
      applyPlayerDamage(5, 'poison', { mitigate: false, size: 16 });
      // Diarrhea: 100-turn Condition (game-time) carries the speed
      // penalty + auto-cleanup; wall-clock fart SFX cadence still lives
      // in engine.js since it's UX timing, not game mechanics.
      const now = Date.now();
      player.speedMod      = 0.6;
      player._diarrheaUntilMs    = now + (10 * 60 * 1000);
      player._diarrheaNextFartMs = now + 6000 + Math.floor(Math.random() * 6000);
      if (typeof Condition !== 'undefined') {
        player.conditions.push(new Condition({
          name: 'diarrhea',
          interval: 1.0,
          pointsRemaining: 100,
          onTick: () => {},
          onRemove: (p) => {
            p.speedMod = 1.0;
            p._diarrheaUntilMs    = 0;
            p._diarrheaNextFartMs = 0;
            if (typeof logMsg === 'function') {
              logMsg("<span style='color:#8f8'>Your stomach finally settles down.</span>");
            }
          },
        }));
      }
      if(typeof Sound !== 'undefined') {
        if(!Sound.playSample || !Sound.playSample('whoopie', 0.35)) {
          Sound.playTone(120, 'sawtooth', 0.2, 0.1, 30);
        }
      }
      decrementItem(idx);
      updateUI(); return;
    }

    // Standard behavior...
    let def = itemObj.def;
    if(!def) {
      logMsg(`<span style='color:var(--warning)'>Unknown item: ${itemObj.icon}</span>`);
      return;
    }

    // B760.RAT_BOOT: old boot can be thrown at nearby cat during rat chase event.
    if(itemObj.itemName === 'oldBoot') {
      const cat = zone.findNpc(e => e && e.type === 'cat' && Math.abs(e.x - player.x) <= 6 && Math.abs(e.y - player.y) <= 6);
      if(cat) {
        addFloatingText(cat.x, cat.y, '👢', '#ddd', 20);
        logMsg("<span style='color:var(--success)'>You hurl the old boot at the cat. It yowls and bolts, and the rat escapes!</span>");
        logMsg("<span style='color:#88f'>🐀 The rat squeaks: 'You saved me! Maybe someday I can return the favor.'</span>");
        if(typeof Sound !== 'undefined') {
          if(Sound.playSample) Sound.playSample('cat_hiss', 0.55);
          if(Sound.thud) Sound.thud();
          if(Sound.playVoice) Sound.playVoice('voice_rat_saved_thanks');
        }
        zone.removeNpc(cat);
        decrementItem(idx);
        player.xp += 25;
        if(typeof QuestEngine !== 'undefined') QuestEngine.emit('custom', { id: 'rat_saved_with_boot' });
        updateUI();
        return;
      }
    }
    if(def.type === "bag") { openBagFromSource('inv', idx); return; }
    if(def.type === "weapon") { swapEquip(idx, 'leftHand'); return; }
    if(def.type === "armor") { swapEquip(idx, def.slot || 'chest'); return; }
    if(def.type === "key") { logMsg(`${ItemDef.iconOf('key')} Keys are used automatically when you bump a locked chest.`); return; }

    // E16: Explosive items (bombs) — place with a countdown fuse
    if(def.type === "explosive") {
      window._activeBombs = window._activeBombs || [];
      window._activeBombs.push({
        x: player.x,
        y: player.y,
        timer: def.fuseTime ?? 10,
        maxTimer: def.fuseTime ?? 10,
        radius: def.blastRadius ?? 5,
        baseDmg: def.baseDamage ?? 50,
        dmgPerTile: def.damagePerTile ?? 10,
        icon: itemObj.icon,
        startTime: performance.now()
      });
      logMsg(`<span style='color:#f80'>${itemObj.icon} You set the bomb! Get clear!</span>`);
      Sound.playTone(440, 'square', 0.15, 0.05, 200);
      decrementItem(idx);
      updateUI();
      return;
    }

    // Gold Bag — add gold directly, don't keep in inventory
    if(def.type === "wealth") {
      let goldValue = def.maxGP ?? 50;
      changeGold(goldValue);
      logMsg(`<span style='color:var(--success)'>💰 You open the Gold Bag and find ${goldValue}g!</span>`);
      decrementItem(idx);
      return;
    }
    
    // Light sources — equip rather than consume
    if(def.type === "light") { swapEquip(idx, 'leftHand'); return; }
    
    // Useless items
    if(def.type === "useless" || def.type === "misc" || def.type === "quest") {
      // E17: Poop — humorous use messages, does not consume item
      if(itemObj.itemName === 'poop') {
        const poopLines = [
          "You consider using the poop. You decide against it. Some decisions make themselves.",
          "In a moment of desperate creativity, you raise the poop... No. Just no.",
          "You have found a use for the poop! Just kidding. You haven't.",
          "The poop smells. That's all you can say about the poop."
        ];
        player._poopIdx = ((player._poopIdx ?? 0) + 1) % poopLines.length;
        logMsg(`<span style='color:#888; font-style:italic;'>${poopLines[player._poopIdx]}</span>`);
        return; // don't consume
      }
      if(itemObj.itemName === 'earthworm') {
        logMsg("<span style='color:#888'>You have an earthworm. It wriggles. Your options are limited.</span>");
        return;
      }
      logMsg(`<span style='color:#888'>I can't use ${def.label()} right now...</span>`);
      return;
    }
    
    if(def.type === "food" || def.type === "potion") {
      // Cell escape — use food to lure mice
      if(player.inCell && (def.type === 'food' || ['🧀','🍕','🍖','🍗','🧀','🍛'].includes(itemObj.icon))) {
        logMsg("<span style='color:var(--success)'>🐭 You toss the food near the crack in the wall...</span>");
        logMsg("<span style='color:var(--success)'>🐭🐭🐭 Mice pour through! They gnaw your bonds and lead you to freedom!</span>");
        decrementItem(idx);
        if(typeof mouseRescueScene === 'function') mouseRescueScene();
        if(typeof QuestEngine !== 'undefined') QuestEngine.emit('mice_lured', {});
        awardAchievement('mouse_rescue');
        updateUI(); return;
      }

      // Quest Feeding logic — eagle accepts meat, fish, duck leg
      let eagleFood = ['🍖', '🐟', '🍗', '🧀', '🍕'];
      let nearEagle = zone.findNpc(e => e.type === 'eagle' && Math.abs(e.x-player.x)<=2 && Math.abs(e.y-player.y)<=2);
      if(nearEagle && eagleFood.includes(itemObj.icon)) {
        logMsg("<span style='color:var(--success)'>🦅 You feed the starving eagle! It looks at you gratefully.</span>");
        awardAchievement('eagle_eye');
        zone.removeNpc(nearEagle); player.fedEagle = true; player.xp += 500;
        if(typeof QuestEngine !== 'undefined') QuestEngine.emit('eagle_fed', {});
        else if(typeof emitQuestEvent === 'function') emitQuestEvent('eagle_fed', {});
        logMsg("<span style='color:var(--primary)'>🦅 The eagle spreads its wings and soars away over the mountain sky. Perhaps you'll meet again...</span>");
        decrementItem(idx); updateUI(); return;
      }
      
      if(def.maxHeal > 0) {
        if(def.type === "potion") player.hp = Math.min(player.maxHp, player.hp + def.maxHeal);
        else player.totalHealPending += def.maxHeal;
      } else if(def.maxHeal < 0) {
        // Negative heal (whiskey etc)
        player.hp = Math.max(1, player.hp + def.maxHeal);
        logMsg(`<span style='color:var(--warning)'>That burns! Lost ${Math.abs(def.maxHeal)} HP.</span>`);
      }
      player.hunger = Math.max(0, player.hunger - (def.foodValue ?? 0));
      // B10: Game Log message for consuming food/potion
      if(def.maxHeal >= 0 && itemObj.icon !== '🥤') {
        if(def.type === "potion") {
          logMsg(`<span style='color:var(--success)'>You drink the ${def.label()}.</span>`);
        } else {
          logMsg(`<span style='color:var(--success)'>You eat the ${def.label()}.</span>`);
        }
      }
      // Bug 23: Slurpee Sugar Rush
      if(itemObj.itemName === 'slurpee') {
        player.statusType = 'sugar';
        player.statusTurns = 20;
        logMsg("<span style='color:var(--warning)'>⚡ SUGAR RUSH! You feel incredibly fast!</span>");
      }
      decrementItem(idx);
    }
    else if(def.type === "scroll") {
      if(itemObj.itemName === 'identifyScroll') { isIdentifying = true; logMsg("Select an item."); return; }
      if(def.spell) {
        // B756.SCROLL_MANA: require minimum mana to read/cast from scroll,
        // but do not spend mana on a successful scroll cast.
        const spellManaCost = {
          fireball: 5,
          lightning: 6,
          tunnel: 4,
          illuminate: 2,
          icebolt: 4,
          poison: 3,
          shield: 3,
          haste: 3
        };
        const requiredMp = spellManaCost[def.spell] ?? 0;
        if(player.mp < requiredMp) {
          if(typeof Sound !== 'undefined' && Sound.errorBuzz) Sound.errorBuzz();
          logMsg(`<span style='color:var(--error)'>Not enough mana to read this scroll! (${requiredMp} MP required)</span>`);
          return;
        }

        // #39: fromScroll=true keeps mana unchanged; scroll is consumed on success and leaves residue
        const savedMp = player.mp;
        castSpell(def.spell, true);
        player.mp = savedMp; // restore mana — scroll pays the cost
        decrementItem(idx);
        // Place magic residue in same slot
        // Unified residue: state.js's Spell Residue (🌫️). Previously this
        // path created ✨-glyph residue, inconsistent with the other spell
        // residue sites (lines 479/489) which used 🌫️.
        const residueName = 'spellResidue';
        if(!inventory[idx]) {
          inventory[idx] = new ItemStack(residueName, 1);
        } else {
          let freeSlot = inventory.findIndex(s => s === null);
          if(freeSlot !== -1) inventory[freeSlot] = new ItemStack(residueName, 1);
          else { let fp = inventory.findIndex(s => s === null); if(fp !== -1) inventory[fp] = new ItemStack(residueName, 1); else zone.dropAt(player.x, player.y, new ItemStack(residueName, 1)); }
        }
        logMsg("<span style='color:#888; font-style:italic;'>The scroll crumbles to magic residue.</span>");
        renderQuickslots(); renderInventory(); updateUI();
      }
    }
    else if(def.type === "spell") {
      // E9: Tome of Town Portal — use directly to cast portal spell, then becomes ash
      if(def.spell === 'portal' && itemObj.itemName === 'tomeOfTownPortal') {
        logMsg(`<span style='color:var(--success)'>You open the ${def.label()} and read from its pages...</span>`);
        castSpell('portal', true);
        // Consume the tome (replace with ash)
        inventory[idx] = new ItemStack('spellResidue', 1);
        renderQuickslots(); updateUI();
        return;
      }
      // Show tome learning dialog instead of auto-learning
      if (typeof window.showTomeDialog === 'function') {
        window.showTomeDialog(idx);
        return;
      }
      logMsg(`<span style='color:var(--warning)'>Cannot interact with this tome right now.</span>`);
    }
    else if(itemObj.itemName === 'magicTeapot') {
      // Magic Teapot — create a healing potion (60min cooldown)
      let now = Date.now();
      let lastUse = player.teapotLastUse ?? 0;
      let cooldownMs = 60 * 60 * 1000; // 60 minutes
      let remaining = cooldownMs - (now - lastUse);
      if(remaining > 0) {
        let mins = Math.ceil(remaining / 60000);
        logMsg(`${ItemDef.iconOf('magicTeapot')} The teapot is still cooling! (${mins} min remaining)`);
        return;
      }
      player.teapotLastUse = now;
      // Add health potion to inventory
      let slot = inventory.findIndex(i => i === null);
      if(slot !== -1) {
        inventory[slot] = new ItemStack('healthPotion', 1);
        logMsg(`<span style='color:var(--success)'>${ItemDef.iconOf('magicTeapot')} The Magic Teapot brews a Health Potion!</span>`);
      } else {
        // Try inventory
        let pSlot = inventory.findIndex(i => i === null);
        if(pSlot !== -1) {
          inventory[pSlot] = new ItemStack('healthPotion', 1);
          logMsg(`<span style='color:var(--success)'>${ItemDef.iconOf('magicTeapot')} The Magic Teapot brews a Health Potion! (stashed in inventory)</span>`);
        } else {
          zone.dropAt(player.x, player.y, new ItemStack('healthPotion', 1));
          logMsg(`<span style='color:var(--success)'>${ItemDef.iconOf('magicTeapot')} The Magic Teapot brews a Health Potion! (dropped at feet)</span>`);
        }
      }
      renderQuickslots(); renderInventory(); updateUI();
    }
    updateUI();
  }

  // === Monty Python Specialized Modals ===
  window.triggerGrenade = (idx) => {
    let m = document.getElementById('modal-content');
    player.grenadeCount = 1;
    m.innerHTML = `<h2>💣 Holy Hand Grenade</h2>
      <p id='grenade-text' style='font-size:24px; font-weight:bold;'>ONE...</p>
      <button onclick="countGrenade(${idx})">AND THREE SHALL BE THE NUMBER!</button>`;
    showOverlay();
    
    const ticker = setInterval(() => {
      if(document.getElementById('overlay').style.display === 'none') { clearInterval(ticker); return; }
      player.grenadeCount++;
      let txt = "";
      if(player.grenadeCount === 2) txt = "TWO...";
      if(player.grenadeCount === 3) txt = "THREE!";
      if(player.grenadeCount === 4) txt = "FOUR?";
      if(player.grenadeCount === 5) txt = "FIVE!!";
      if(player.grenadeCount > 5) { 
        logMsg("You waited too long! The grenade exploded in your hand.");
        die('grenade'); clearInterval(ticker);
      }
      document.getElementById('grenade-text').innerText = txt;
    }, 1000);
  };

  window.countGrenade = (idx) => {
    hideOverlay();
    Sound.explosion();
    if(player.grenadeCount === 3) {
      logMsg("<span style='color:var(--success)'>The Killer Rabbit is blown to tiny bits!</span>");
      zone.removeNpcs(e => e.type === 'killer_rabbit');
      player.xp += 2000; checkLevelUp();
      decrementItem(idx);
    } else {
      logMsg("<span style='color:var(--error)'>You threw it on the count of " + player.grenadeCount + ". It missed!</span>");
    }
    drawMap();
  };

  window.witchTrial = () => {
    let hasDuck = inventory.some(i => i && i.itemName === 'rubberDuck');
    let m = document.getElementById('modal-content');
    if(hasDuck) {
      m.innerHTML = `<h2>⚖️ The Scales of Justice</h2><p>"She weighs the same as a duck!"</p>
        <p style='color:var(--success)'>The crowd gasps! The peasant woman turns into a WITCH and vanishes!</p>
        <button onclick="finishWitch()">Pick up Potion of Newt</button>`;
    } else {
      m.innerHTML = `<h2>⚖️ The Scales of Justice</h2><p>"We need something that floats to weigh her against!"</p>
        <button onclick="hideOverlay()">Maybe a Duck?</button>`;
    }
    showOverlay();
  };

  window.finishWitch = () => {
    hideOverlay();
    let empty = inventory.findIndex(i => i === null);
    if(empty !== -1) inventory[empty] = new ItemStack('potionOfNewt', 1);
    logMsg("The Witch left a Potion of Newt behind.");
    renderQuickslots();
  };

  // (pickupItems() removed in Phase 4a-3 — was defined but unreferenced
  // for many versions. Phase 4b's loot popup is the new tile-pickup
  // entry point.)

  function decrementItem(idx) { 
    if(!inventory[idx]) return; 
    inventory[idx].qty--; 
    if(!inventory[idx].qty || inventory[idx].qty <= 0) inventory[idx] = null; 
    renderQuickslots(); 
  }

  function countItemByName(name) {
    let total = 0;
    inventory.forEach(item => { if(item && item.itemName === name) total += item.qty ?? 1; });
    return total;
  }

  function consumeItemByName(name, qty = 1) {
    let remaining = qty;
    for(let i = 0; i < inventory.length && remaining > 0; i++) {
      let item = inventory[i];
      if(!item || item.itemName !== name) continue;
      let stackQty = item.qty ?? 1;
      let used = Math.min(stackQty, remaining);
      stackQty -= used;
      remaining -= used;
      if(stackQty <= 0) inventory[i] = null;
      else item.qty = stackQty;
    }
    if(typeof renderQuickslots === 'function') renderQuickslots();
    if(typeof renderInventory === 'function') renderInventory();
    return remaining === 0;
  }

  function getEquippedWeaponDef() {
    const weaponName = player.equipped && player.equipped.leftHand;
    return weaponName ? (ItemDefs[weaponName] || null) : null;
  }

  // #16: NPCs protected from melee are also protected from ranged and magic
  // #1: Protected NPC types — cow and chicken removed from town protection;
  // farm animals in town are now attackable (see resolveEnemyDefeat for Dennis trigger).
  const PROTECTED_NPC_TYPES = new Set([
    'cain', 'dennis', 'chaplain', 'pacifist_orc', 'fence',
    'erasmus', 'french_taunter', 'bridge_keeper', 'gurgi', 'blacksmith'
  ]);
  function isProtectedNPC(enemy) {
    if(!enemy || !enemy.stats) return false;
    if(currentScene === 'town') {
      // In Tristram, animals/vermin are intentionally attackable.
      if(!PROTECTED_NPC_TYPES.has(enemy.type)) return false;
    }
    // Farm animals (cow, chicken, duck) are only protected OUTSIDE of town
    if((enemy.type === 'cow' || enemy.type === 'chicken' || enemy.type === 'duck') && currentScene !== 'town') {
      return true;
    }
    return PROTECTED_NPC_TYPES.has(enemy.type) || (enemy.stats.passive && !enemy.stats.aggressive);
  }

  function isSpellHostile(enemy) {
    if(!enemy || !enemy.stats || enemy.stats.hp <= 0) return false;
    if(isProtectedNPC(enemy)) return false;
    return !['chaplain', 'cain', 'dennis', 'pacifist_orc', 'eagle', 'fence'].includes(enemy.type);
  }

  // === Spell System (v7.2.4) ===
  let fireballCooldown = 0; // ms timestamp of last fireball
  const FIREBALL_COOLDOWN_MS = 5000;

  window.castSpell = function(spellName, fromScroll) {
    if(spellName === 'portal') {
      // Town Portal: create a portal 2 tiles in front of player
      if(currentLevel === 0) { logMsg("You're already in town!"); return; }
      let dx = player.facing.dx ?? 0, dy = player.facing.dy ?? 1;
      let px = player.x + dx * 2, py = player.y + dy * 2;
      // Find nearest floor tile if target is blocked
      if(px < 0 || px >= mapW || py < 0 || py >= mapH || theMap[py][px] === TILES.WALL) {
        px = player.x + dx; py = player.y + dy;
      }
      if(px >= 0 && px < mapW && py >= 0 && py < mapH && theMap[py][px] !== TILES.WALL) {
        window._portalPos = {
          active: true,
          x: px,
          y: py,
          fromLevel: currentLevel,
          fromScene: currentScene,
          fromX: px,
          fromY: py,
          townX: null,
          townY: null
        };
        theMap[py][px] = TILES.PORTAL; // Bug 22: Portal tile, not stair
        logMsg("<span style='color:var(--success)'>🌀 A swirling portal to town appears!</span>");
        logMsg("<span style='color:#888'>Step into the portal to return to Tristram.</span>");
        addFloatingText(px, py, "🌀", "#88f", 24);
        Sound.playTone(400, 'sine', 0.5, 0.1, 800);
        awardAchievement('town_portal');
        // Trigger portal cast animation
        if(window.WebGLFX && WebGLFX.state && WebGLFX.state.portal && WebGLFX.state.portal.initialized) {
          WebGLFX.state.portal.castTime = performance.now();
        } else if(window.WebGLFX) {
          window._portalCastTime = performance.now();
        }
        drawMap();
      } else {
        logMsg("No room for a portal here!");
      }
      return;
    }
    if(spellName === 'illuminate') {
      if(player.mp < 2) { logMsg("Not enough mana! (2 MP)"); return; }
      player.mp -= 2;
      if(window.WebGLFX && WebGLFX.onManaUse) WebGLFX.onManaUse(2);
      player._illumTurns = (SPELL_DEFS && SPELL_DEFS.illuminate && SPELL_DEFS.illuminate.duration) || 30;
      logMsg("<span style='color:var(--success)'>✨ Illuminate! Light surrounds you for a few turns...</span>");
      Sound.playTone(600, 'sine', 0.3, 0.08, 900);
      // Brief WebGL aura burst
      if(window.WebGLFX && WebGLFX.onCombatImpact) WebGLFX.onCombatImpact(0, player.x, player.y);
      calculateFOV(); drawMap(); updateUI();
      return;
    }
    if(spellName === 'fireball') {
      let now = performance.now();
      if(now - fireballCooldown < FIREBALL_COOLDOWN_MS) {
        let remaining = Math.ceil((FIREBALL_COOLDOWN_MS - (now - fireballCooldown)) / 1000);
        logMsg(`Fireball on cooldown! (${remaining}s)`);
        return;
      }
      if(player.mp < 5) { logMsg("Not enough mana! (5 MP)"); return; }
      // Enter targeting mode — click to fire
      logMsg("<span style='color:#f60'>🔥 Fireball targeting — click a tile to fire!</span>");
      window._fireballTargeting = true;
      return;
    }
    if(spellName === 'lightning') {
      if(player.mp < 6) { logMsg("Not enough mana! (6 MP)"); return; }
      const visibleTargets = zone.npcs.filter(e => isSpellHostile(e) && visible[e.y] && visible[e.y][e.x]);
      if(visibleTargets.length === 0) {
        logMsg("No hostile target in sight for chain lightning.");
        return;
      }

      visibleTargets.sort((a, b) => {
        let da = Math.abs(a.x - player.x) + Math.abs(a.y - player.y);
        let db = Math.abs(b.x - player.x) + Math.abs(b.y - player.y);
        return da - db;
      });

      const first = visibleTargets.find(e => Math.abs(e.x - player.x) + Math.abs(e.y - player.y) <= 8);
      if(!first) {
        logMsg("No hostile target close enough for chain lightning. (8 tiles)");
        return;
      }

      const chain = [first];
      while(chain.length < 4) {
        const last = chain[chain.length - 1];
        let next = null;
        let bestDist = Infinity;
        for(let i = 0; i < visibleTargets.length; i++) {
          const candidate = visibleTargets[i];
          if(chain.includes(candidate)) continue;
          const dist = Math.abs(candidate.x - last.x) + Math.abs(candidate.y - last.y);
          if(dist <= 5 && dist < bestDist) {
            bestDist = dist;
            next = candidate;
          }
        }
        if(!next) break;
        chain.push(next);
      }

      player.mp -= 6;
      if(window.WebGLFX && WebGLFX.onManaUse) WebGLFX.onManaUse(6);
      Sound.playTone(980, 'sawtooth', 0.24, 0.05, 1200);
      logMsg("<span style='color:#8ff'>⚡ Chain lightning lashes through the room!</span>");

      let sourceX = player.x;
      let sourceY = player.y;
      for(let i = 0; i < chain.length; i++) {
        const target = chain[i];
        const dmg = Math.max(8, Math.floor((14 + player.stats.int * 1.4) * Math.pow(0.72, i)));
        activeEffects.push({
          kind: 'chainLightning',
          x1: sourceX, y1: sourceY,
          x2: target.x, y2: target.y,
          color: '#7ef7ff',
          life: 1.0,
          power: 1.15 - i * 0.12
        });
        target.stats.hp -= dmg;
        addFloatingText(target.x, target.y, `-${dmg}⚡`, '#9ff', 18 + Math.floor(dmg / 3));
        logMsg(`Lightning hits ${target.type} for ${dmg} shock damage.`);
        if(target.stats.hp <= 0) {
          const killIdx = zone.npcs.indexOf(target);
          if(killIdx !== -1) window.resolveEnemyDefeat(killIdx, { source: 'lightning' });
        }
        sourceX = target.x;
        sourceY = target.y;
      }

      drawMap();
      updateUI();
      advanceTurn(1);
      return;
    }
    if(spellName === 'tunnel') {
      if(player.mp < 4) { logMsg("Not enough mana! (4 MP)"); return; }
      let dx = player.facing.dx ?? 1, dy = player.facing.dy ?? 0;
      let tx = player.x + dx, ty = player.y + dy;
      if(!theMap[ty] || theMap[ty][tx] !== TILES.WALL) {
        logMsg("You must be facing a wall to tunnel.");
        return;
      }
      player.mp -= 4;
      if(window.WebGLFX && WebGLFX.onManaUse) WebGLFX.onManaUse(4);
      logMsg("<span style='color:#a87;'>⛏️ The tunnel spell tears through rock!</span>");
      Sound.playTone(80, 'sawtooth', 0.4, 0.1, 600);
      document.getElementById('gameCanvas').style.animation = 'rockViewport 0.8s ease-in-out';
      setTimeout(() => document.getElementById('gameCanvas').style.animation = '', 800);
      let cx = player.x, cy = player.y;
      let stepCount = 0;
      let digInt = setInterval(() => {
        cx += dx; cy += dy;
        if(stepCount >= 8 || cx <= 0 || cx >= mapW-1 || cy <= 0 || cy >= mapH-1) {
          clearInterval(digInt); updateUI(); return;
        }
        if(theMap[cy][cx] !== TILES.WALL) { clearInterval(digInt); updateUI(); return; }
        theMap[cy][cx] = TILES.FLOOR;
        explored[cy][cx] = true;
        addFloatingText(cx, cy, '🪨', '#888', 18);
        calculateFOV(); drawMap();
        stepCount++;
      }, 400);
      return;
    }
    // #28: Icebolt — freeze and damage a visible enemy
    if(spellName === 'icebolt') {
      if(player.mp < 4) { logMsg("Not enough mana! (4 MP)"); return; }
      const visibleHostiles = zone.npcs.filter(e => isSpellHostile(e) && visible[e.y] && visible[e.y][e.x]);
      if(visibleHostiles.length === 0) { logMsg("No hostile target in sight for Icebolt."); return; }
      visibleHostiles.sort((a,b) => (Math.abs(a.x-player.x)+Math.abs(a.y-player.y)) - (Math.abs(b.x-player.x)+Math.abs(b.y-player.y)));
      const target = visibleHostiles[0];
      const dist = Math.abs(target.x-player.x) + Math.abs(target.y-player.y);
      if(dist > 8) { logMsg("No target close enough for Icebolt. (8 tiles)"); return; }
      player.mp -= 4;
      if(window.WebGLFX && WebGLFX.onManaUse) WebGLFX.onManaUse(4);
      const dmg = Math.max(6, Math.floor(10 + (player.spellDmgBonus ?? 0)));
      target.stats.hp -= dmg;
      // Freeze the enemy
      target._frozenTurns = (target._frozenTurns ?? 0) + 3;
      activeEffects.push({ kind: 'icebeam', x1: player.x, y1: player.y, x2: target.x, y2: target.y, color: '#aaddff', life: 1.0, power: 1.0 });
      addFloatingText(target.x, target.y, `-${dmg}❄️`, '#aef', 20);
      logMsg(`<span style='color:#aef'>❄️ Icebolt strikes ${target.type} for ${dmg} cold damage and freezes it!</span>`);
      Sound.playTone(1200, 'sine', 0.08, 0.12, 2000);
      if(target.stats.hp <= 0) {
        logMsg(`The ${target.type} shatters!`);
        if(typeof window.resolveEnemyDefeat === 'function') window.resolveEnemyDefeat(zone.npcs.indexOf(target), { source: 'icebolt' });
      }
      drawMap(); updateUI(); advanceTurn(1);
      return;
    }
    // #28: Poison — deal ongoing damage to a visible enemy
    if(spellName === 'poison') {
      if(player.mp < 3) { logMsg("Not enough mana! (3 MP)"); return; }
      const visibleHostiles = zone.npcs.filter(e => isSpellHostile(e) && visible[e.y] && visible[e.y][e.x]);
      if(visibleHostiles.length === 0) { logMsg("No hostile target in sight for Poison."); return; }
      visibleHostiles.sort((a,b) => (Math.abs(a.x-player.x)+Math.abs(a.y-player.y)) - (Math.abs(b.x-player.x)+Math.abs(b.y-player.y)));
      const target = visibleHostiles[0];
      player.mp -= 3;
      if(window.WebGLFX && WebGLFX.onManaUse) WebGLFX.onManaUse(3);
      target._poisonTurns = (target._poisonTurns ?? 0) + 8;
      target._poisonDmg = Math.max(2, Math.floor(3 + (player.spellDmgBonus ?? 0) * 0.5));
      addFloatingText(target.x, target.y, '☠️', '#7f2', 18);
      logMsg(`<span style='color:#7f2'>☠️ Poison clouds the ${target.type}!</span>`);
      Sound.playTone(220, 'sawtooth', 0.06, 0.15, 300);
      drawMap(); updateUI(); advanceTurn(1);
      return;
    }
    // #28: Shield — temporary damage reduction
    if(spellName === 'shield') {
      if(player.mp < 3) { logMsg("Not enough mana! (3 MP)"); return; }
      player.mp -= 3;
      if(window.WebGLFX && WebGLFX.onManaUse) WebGLFX.onManaUse(3);
      player._shieldTurns = (player._shieldTurns ?? 0) + 10;
      logMsg("<span style='color:#88f'>🛡️ A magical shield surrounds you! (10 turns)</span>");
      Sound.playTone(440, 'sine', 0.15, 0.12, 800);
      drawMap(); updateUI(); advanceTurn(1);
      return;
    }
    // #28: Haste — increase movement speed temporarily
    if(spellName === 'haste') {
      if(player.mp < 3) { logMsg("Not enough mana! (3 MP)"); return; }
      player.mp -= 3;
      if(window.WebGLFX && WebGLFX.onManaUse) WebGLFX.onManaUse(3);
      player.statusType = 'sugar'; // reuse sugar rush speed boost
      player.statusTurns = 15;
      logMsg("<span style='color:#ff6'>⚡ Haste! Everything blurs — you move at lightning speed!</span>");
      Sound.playTone(660, 'sawtooth', 0.1, 0.08, 1000);
      drawMap(); updateUI(); advanceTurn(1);
      return;
    }
    // E10: Beach Portal scroll
    if(spellName === 'beach_portal') {
      logMsg("<span style='color:#4af'>🏖️ A shimmering portal opens... You smell salt air and coconut drinks.</span>");
      addFloatingText(player.x, player.y, "🏖️", "#4af", 24);
      // B756.BEACH_PORTAL: always route through beach scene generation
      // so player spawns on walkable terrain.
      currentLevel = 12;
      currentScene = 'beach';
      initMap(50);
      calculateFOV();
      drawMap();
      updateUI();
      return;
    }
    logMsg(`Unknown spell: ${spellName}`);
  };

  window.startRangedAttackTargeting = function() {
    const weaponDef = getEquippedWeaponDef();
    if(!weaponDef || !weaponDef.ranged) {
      logMsg("You need a ranged weapon equipped.");
      return false;
    }
    if(weaponDef.ammoName && countItemByName(weaponDef.ammoName) <= 0) {
      logMsg(`<span style='color:var(--error)'>Out of ${ItemDefs[weaponDef.ammoName]?.label() ?? 'ammo'}.</span>`);
      return false;
    }
    if(weaponDef.manaCost && player.mp < weaponDef.manaCost) {
      logMsg(`<span style='color:var(--error)'>Not enough mana! (${weaponDef.manaCost} MP)</span>`);
      return false;
    }
    window._rangedTargeting = true;
    logMsg(`<span style='color:var(--primary)'>${weaponDef.label()} targeting — click a tile to fire.</span>`);
    return true;
  };

  window.rangedWeaponTarget = function(tx, ty) {
    window._rangedTargeting = false;
    const weaponDef = getEquippedWeaponDef();
    if(!weaponDef || !weaponDef.ranged) return;

    let dx = tx - player.x, dy = ty - player.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if(dist < 1) { logMsg("Aim away from your own face."); return; }
    if(dist > (weaponDef.range ?? 8)) { logMsg(`Too far! (max ${weaponDef.range ?? 8} tiles)`); return; }
    if(weaponDef.ammoName && !consumeItemByName(weaponDef.ammoName, 1)) {
      logMsg(`<span style='color:var(--error)'>Out of ${ItemDefs[weaponDef.ammoName]?.label() ?? 'ammo'}.</span>`);
      return;
    }
    if(weaponDef.manaCost) {
      if(player.mp < weaponDef.manaCost) {
        logMsg(`<span style='color:var(--error)'>Not enough mana! (${weaponDef.manaCost} MP)</span>`);
        return;
      }
      player.mp -= weaponDef.manaCost;
      if(window.WebGLFX && WebGLFX.onManaUse) WebGLFX.onManaUse(weaponDef.manaCost);
    }

    const steps = Math.ceil(dist);
    const sx = dx / steps;
    const sy = dy / steps;
    const shotGlyph = weaponDef.manaCost ? '✨' : '➶';
    const shotSound = weaponDef.manaCost
      ? () => Sound.playFM(330, 0.18, 0.03, 1.8, 4.5)
      : () => Sound.playTone(900, 'triangle', 0.08, 0.04, 500);
    shotSound();

    for(let i = 1; i <= steps; i++) {
      let cx = Math.round(player.x + sx * i);
      let cy = Math.round(player.y + sy * i);
      if(theMap[cy] && theMap[cy][cx] === TILES.WALL) {
        addFloatingText(cx, cy, '💨', '#888', 18);
        logMsg(`${weaponDef.label()} thunks harmlessly into a wall.`);
        drawMap();
        updateUI();
        advanceTurn(1);
        return;
      }
      addFloatingText(cx, cy, shotGlyph, weaponDef.manaCost ? '#8cf' : '#ddd', 16);
        let monsterIdx = zone.npcs.findIndex(m => m.x === cx && m.y === cy);
      if(monsterIdx !== -1) {
        let enemy = zone.npcs[monsterIdx];
        // #16: Protected NPCs cannot be hit by ranged attacks
        if(isProtectedNPC(enemy)) {
          logMsg(`${enemy.stats.icon || enemy.type} is protected — you can't attack them.`);
          drawMap(); updateUI(); advanceTurn(1);
          return;
        }
        let scalingStat = weaponDef.magicScaling === 'int' ? player.stats.int : player.stats.dex;
        let dmg = weaponDef.rangedDamage + Math.floor(scalingStat / 2);
        if(weaponDef.manaCost) dmg += Math.floor(player.stats.int / 3);
        enemy.stats.hp -= dmg;
        addFloatingText(cx, cy, `-${dmg}`, '#f00', 18 + Math.floor(dmg / 2));
        logMsg(`${weaponDef.label()} hits ${enemy.type} for ${dmg} damage.`);
        // Ifrit counterattack on ranged hit
        if(enemy.type === 'ifrit' && enemy.isIfrit && !enemy.provoked) {
          enemy.provoked = true;
          logMsg("<span style='color:var(--error)'>🔥 Ifrit snarls: 'RANGED?! How DARE you! That's not even close!' and retaliates!</span>");
        }
        if(enemy.stats.hp <= 0) {
          logMsg(`The ${enemy.type} collapses under the ranged hit.`);
          if(typeof window.resolveEnemyDefeat === 'function') window.resolveEnemyDefeat(monsterIdx, { source: 'ranged' });
          else zone.npcs.splice(monsterIdx, 1);
        }
        drawMap();
        updateUI();
        advanceTurn(1);
        return;
      }
    }

    addFloatingText(tx, ty, '💨', '#888', 18);
    logMsg(`${weaponDef.label()} misses everything important.`);
    drawMap();
    updateUI();
    advanceTurn(1);
  };

  // Called when player clicks a tile during fireball targeting
  window.fireballTarget = function(tx, ty) {
    window._fireballTargeting = false;
    let dx = tx - player.x, dy = ty - player.y;
    let dist = Math.sqrt(dx*dx + dy*dy);
    if(dist > 10) { logMsg("Too far! (max 10 tiles)"); return; }
    if(dist < 1) { logMsg("Can't fireball yourself!"); return; }

    fireballCooldown = performance.now();
    window.fireballCooldown = Date.now() + FIREBALL_COOLDOWN_MS;
    player.mp -= 5;
    if(window.WebGLFX && WebGLFX.onManaUse) WebGLFX.onManaUse(5);
    Sound.fireball();

    // Trace path from player to target
    let steps = Math.ceil(dist);
    let sx = dx / steps, sy = dy / steps;
    let hitSomething = false;
    let prevX = player.x;
    let prevY = player.y;
    for(let i = 1; i <= steps; i++) {
      let cx = Math.round(player.x + sx * i);
      let cy = Math.round(player.y + sy * i);
      // Wall collision
      if(theMap[cy] && theMap[cy][cx] === TILES.WALL) {
        addFloatingText(cx, cy, '💨', '#888', 18); // smoke on wall hit
        activeEffects.push({ kind: 'fireballBurst', x: cx, y: cy, color: '#ffb347', life: 0.85, power: 1.0 });
        hitSomething = true;
        break;
      }
      // Trail of fire emojis
      addFloatingText(cx, cy, '🔥', '#f60', 16);
      activeEffects.push({
        kind: 'fireballTrail',
        x: cx, y: cy,
        x1: prevX, y1: prevY,
        x2: cx, y2: cy,
        color: '#ff7b2f',
        life: 0.8,
        power: Math.max(0.65, 1 - i / Math.max(1, steps) * 0.25)
      });
      prevX = cx;
      prevY = cy;
      // Check for monster hit
      let monsterIdx = zone.npcs.findIndex(m => m.x === cx && m.y === cy);
      if(monsterIdx !== -1) {
        let m = zone.npcs[monsterIdx];
        // #16: Protected NPCs cannot be hit by fireball
        if(isProtectedNPC(m)) {
          logMsg(`The fireball fizzles near ${m.stats.icon || m.type}. They seem protected!`);
          hitSomething = true;
          break;
        }
        // Damage decreases after 5 tiles
        let baseDmg = dist <= 5 ? 20 + player.stats.int : Math.floor((20 + player.stats.int) * 0.5);
        if(m.stats.isBoss) baseDmg = Math.floor(baseDmg * 0.5);
        if(m.type === 'ifrit' && m.isIfrit) {
          const heal = Math.max(8, Math.floor(baseDmg * 0.8));
          m.stats.hp = Math.min(m.stats.maxHp ?? 999, m.stats.hp + heal);
          addFloatingText(cx, cy, `+${heal}🔥`, '#7f7', 22);
          activeEffects.push({ kind: 'fireballBurst', x: cx, y: cy, color: '#ffb347', life: 0.95, power: 1.15 });
          logMsg("<span style='color:#f90'>Ifrit absorbs the fireball. \"Thanks for the light!\"</span>");
          if(typeof Sound !== 'undefined' && Sound.playVoice) {
            Sound.playVoice('voice_ifrit_thanks_for_light');
            setTimeout(() => Sound.playSample && Sound.playSample('mimic_laugh', 0.45), 180);
          }
          hitSomething = true;
          break;
        }
        m.stats.hp -= baseDmg;
        addFloatingText(cx, cy, `-${baseDmg}🔥`, '#f00', 22);
        activeEffects.push({ kind: 'fireballBurst', x: cx, y: cy, color: '#ffb347', life: 0.95, power: 1.15 });
        logMsg(`Fireball hits ${m.type} for ${baseDmg} fire damage!`);
        // Smoke effect on hit
        addFloatingText(cx, cy, '💨', '#888', 18);
        Sound.oof();
        if(m.stats.hp <= 0) {
          logMsg(`The ${m.type} is incinerated!`);
          if(typeof window.resolveEnemyDefeat === 'function') window.resolveEnemyDefeat(monsterIdx, { source: 'fireball' });
          else zone.npcs.splice(monsterIdx, 1);
        }
        hitSomething = true;
        break;
      }
    }
    if(!hitSomething) {
      // Smoke at target location
      addFloatingText(tx, ty, '💨', '#888', 20);
      activeEffects.push({ kind: 'fireballBurst', x: tx, y: ty, color: '#ffb347', life: 0.8, power: 0.9 });
    }
    drawMap();
    updateUI();
  };

  function decrementInventory(idx) {
    if(!inventory[idx]) return;
    inventory[idx].qty--;
    if(inventory[idx].qty <= 0) inventory[idx] = null;
    renderInventory();
  }

  // Slots currently held by the same equipped item (linkage for 2H weapons
  // and other multi-slot items). Returns [slot] for single-slot items, or
  // the item's full equip-group for items occupying ≥2 slots. Returns []
  // when nothing is equipped at `slot`.
  function linkedSlotsOf(slot) {
    const name = player.equipped && player.equipped[slot];
    if (!name) return [];
    const def = ItemDefs[name];
    const groups = def && def.equipGroups;
    if (!groups) return [slot];
    // The item was equipped via one of its groups — pick the one whose
    // slots all currently hold this item (handles overlapping groups).
    for (const g of groups) {
      if (g.includes(slot) && g.every(s => player.equipped[s] === name)) return g.slice();
    }
    return [slot];
  }

  function swapEquip(idx, slot) {
    // K6: idx === -1 means "just recalculate stats from current equipped state"
    // (used by drag-to-unequip / slot-swap paths that manage inventory themselves)
    if (idx !== -1) {
      const stackToEquip = inventory[idx];
      if (stackToEquip) {
        const verdict = player.canEquip(stackToEquip.itemName);
        if (!verdict.ok) {
          const need = verdict.talent;
          const talentName = (typeof TALENT_DEFS !== 'undefined' && TALENT_DEFS[need]) ? TALENT_DEFS[need].name : need;
          logMsg(`<span style='color:var(--error)'>You lack the ${talentName} talent — you can carry it but not wield it.</span>`);
          return;
        }
      }
      const incoming = stackToEquip ? stackToEquip.itemName : null;
      const incomingDef = incoming ? ItemDefs[incoming] : null;

      // Pick which equip-group of the incoming item to fill. Prefer one
      // containing `slot` (the drop target); fall back to the first group.
      let targetGroup = null;
      if (incoming && incomingDef && incomingDef.equipGroups) {
        targetGroup = incomingDef.equipGroups.find(g => g.includes(slot)) || incomingDef.equipGroups[0];
      } else if (incoming) {
        targetGroup = [slot]; // legacy fallback
      } else {
        // Unequip path: stack is null, so the "group" is the linkage of
        // whatever currently occupies `slot` (so a 2H weapon clears both).
        targetGroup = linkedSlotsOf(slot);
        if (targetGroup.length === 0) targetGroup = [slot];
      }

      // Gather displaced item names (dedupe by name — a 2H weapon spans
      // multiple slots but is one item to return). Also expand to clear
      // ALL slots linked to each displaced item, so half-equipping a 2H
      // can never be left behind.
      const displaced = [];
      const seen = new Set();
      const slotsToClear = new Set(targetGroup);
      for (const s of targetGroup) {
        const cur = player.equipped[s];
        if (cur && !seen.has(cur)) {
          seen.add(cur);
          displaced.push(cur);
          linkedSlotsOf(s).forEach(ls => slotsToClear.add(ls));
        }
      }
      // Save burn fuel for cleared light items before removing them
      if (player._lightBurnData) {
        slotsToClear.forEach(s => {
          const burn = player._lightBurnData[s];
          if (burn) {
            const elapsed = (Date.now() - burn.equippedAt) / 1000;
            const remaining = Math.max(0, burn.remaining - elapsed);
            if (remaining > 0) {
              if (!player._lightFuel) player._lightFuel = {};
              player._lightFuel[burn.itemName] = remaining;
            }
            delete player._lightBurnData[s];
          }
        });
      }
      slotsToClear.forEach(s => { player.equipped[s] = null; });

      // Write the incoming item to all target-group slots.
      targetGroup.forEach(s => { player.equipped[s] = incoming; });
      // Start burning for incoming light items
      if (incoming) {
        const incDef = ItemDefs[incoming];
        if (incDef && incDef.type === 'light') {
          if (!player._lightBurnData) player._lightBurnData = {};
          if (!player._lightFuel) player._lightFuel = {};
          const saved = player._lightFuel[incoming];
          const remaining = saved != null ? saved : (incDef.burnTime || 0);
          delete player._lightFuel[incoming];
          targetGroup.forEach(s => {
            player._lightBurnData[s] = { itemName: incoming, remaining, equippedAt: Date.now() };
          });
        }
      }

      // Pull the incoming stack out of inventory (qty=1; equippables are
      // non-stackable). Then deposit displaced: first one back into the
      // source slot (the swap), rest into first-empty inv slot or floor.
      inventory[idx] = null;
      if (displaced.length > 0) {
        inventory[idx] = new ItemStack(displaced[0], 1);
        for (let i = 1; i < displaced.length; i++) {
          const empty = inventory.findIndex(s => s === null);
          if (empty !== -1) {
            inventory[empty] = new ItemStack(displaced[i], 1);
          } else {
            zone.dropAt(player.x, player.y, new ItemStack(displaced[i], 1));
            const dn = ItemDefs[displaced[i]]?.label() || displaced[i];
            logMsg(`<span style='color:var(--warning)'>Inventory full — ${dn} dropped at your feet.</span>`);
          }
        }
      }
    }
    // Recalculate combat stats from all equipment. Dedupe by item name so
    // a 2H weapon occupying multiple slots isn't counted multiple times.
    let totalDmg = CONSTANTS.PLAYER_UNARMED_BASE_DMG;
    let totalEvade = CONSTANTS.PLAYER_INITIAL_DODGE_RATE;
    let speedBonus = 0;
    const _seenEquipped = new Set();
    Object.values(player.equipped).forEach(name => {
      if(name && !_seenEquipped.has(name)) {
        _seenEquipped.add(name);
        let d = ItemDefs[name];
        if(!d) return;
        if(d.type === "weapon") totalDmg = (d.baseDmg ?? 0);
        totalEvade += (d.evadePercent ?? 0);
        // Boots of Blinding Speed
        if(name === 'bootsOfBlindingSpeed') {
          speedBonus = 1;
          player.blind = true;
          logMsg(`<span style='color:var(--warning)'>${ItemDef.iconOf('bootsOfBlindingSpeed')} The Boots of Blinding Speed make everything blur!</span>`);
          logMsg("<span style='color:var(--success)'>You feel incredibly fast!</span>");
        }
      }
    });
    // Remove blind if boots unequipped
    if(player.equipped.feet !== 'bootsOfBlindingSpeed' && player.blind) {
      player.blind = false;
      logMsg("<span style='color:var(--primary)'>Your vision clears.</span>");
    }
    player.baseDmg = totalDmg; player.dodgeRate = totalEvade / 100;
    player.speedBonus = speedBonus;
    renderQuickslots(); updateUI();
    // Log equipped message only when an actual inventory item was swapped in
    if (idx !== -1) {
      const equippedName = player.equipped[slot];
      const equippedDef  = equippedName ? ItemDefs[equippedName] : null;
      if(equippedDef) logMsg(`<span style='color:var(--success)'>Equipped ${equippedDef.label()}.</span>`);
    }
  }

  // #34: Unequip from equip slot to ground when inventory is full.
  // Honors multi-slot linkage: a 2H weapon clears all of its slots and
  // returns to inventory/floor as a single stack.
  window.unequipToGround = (slot) => {
    const cur = player.equipped[slot];
    if(!cur) return;
    const def = ItemDefs[cur];
    // Save burn fuel before unequipping
    if (player._lightBurnData && player._lightBurnData[slot]) {
      const burn = player._lightBurnData[slot];
      const elapsed = (Date.now() - burn.equippedAt) / 1000;
      const remaining = Math.max(0, burn.remaining - elapsed);
      if (remaining > 0 && burn.itemName === cur) {
        if (!player._lightFuel) player._lightFuel = {};
        player._lightFuel[cur] = remaining;
      }
      delete player._lightBurnData[slot];
    }
    const group = linkedSlotsOf(slot);
    const freeSlot = inventory.findIndex(s => s === null);
    if(freeSlot !== -1) {
      inventory[freeSlot] = new ItemStack(cur, 1);
      logMsg(`<span style='color:var(--success)'>Unequipped ${def?.label() || cur} to inventory.</span>`);
    } else {
      zone.dropAt(player.x, player.y, new ItemStack(cur, 1));
      logMsg(`<span style='color:var(--warning)'>Inventory full — ${def?.label() || cur} dropped at your feet.</span>`);
    }
    group.forEach(s => { player.equipped[s] = null; });
    renderQuickslots(); updateUI();
  };

  window.linkedSlotsOf = linkedSlotsOf;

  // Return the effective light radius from darkvision + equipped light items.
  // Raw light radius from all sources (before dark-tile penalty).
  window._playerLightRadius = function() {
    let r = 0;
    // Ambient base by scene
    if (currentScene === 'dungeon') r = Math.max(r, 2);
    else if (currentScene === 'forest') r = Math.max(r, 10);
    else r = Math.max(r, 15); // town, outworld, etc. — fully lit
    // Darkvision talent
    if (player.talents && player.talents.darkvision) {
      r = Math.max(r, 2 + player.talents.darkvision.level);
    }
    // Illuminate spell — temporary bright light
    if (player._illumTurns && player._illumTurns > 0) {
      r = Math.max(r, (SPELL_DEFS && SPELL_DEFS.illuminate && SPELL_DEFS.illuminate.radius) || 15);
    }
    // Equipped light items
    if (player._lightBurnData) {
      for (const slot of Object.keys(player._lightBurnData)) {
        const burn = player._lightBurnData[slot];
        if (!burn) continue;
        const def = ItemDefs[burn.itemName];
        if (def && def.type === 'light' && def.lightRadius) {
          r = Math.max(r, def.lightRadius);
        }
      }
    }
    return r;
  };

  // Final light radius after dark-tile penalty.
  // Dark tiles: radius = floor(radius / 2 - 2), clamped to 0.
  window._playerFinalLightRadius = function() {
    let r = window._playerLightRadius();
    if (darkMap[player.y] && darkMap[player.y][player.x]) {
      r = Math.floor(r / 2 - 2);
      if (r < 0) r = 0;
    }
    return r;
  };

  window._hasLight = function() {
    return window._playerFinalLightRadius() > 0;
  };

  // Tick burning light items — depletes fuel and replaces depleted items
  // with their residue. Called from updateUI() each frame.
  window._tickLightBurn = function() {
    if (!player._lightBurnData) return;
    for (const slot of Object.keys(player._lightBurnData)) {
      const burn = player._lightBurnData[slot];
      if (!burn) continue;
      const elapsed = (Date.now() - burn.equippedAt) / 1000;
      const remaining = burn.remaining - elapsed;
      if (remaining <= 0) {
        // Depleted — replace with residue
        const def = ItemDefs[burn.itemName];
        const leaves = (def && def.leaves) || null;
        delete player._lightBurnData[slot];
        player.equipped[slot] = null;
        if (leaves) {
          const freeSlot = inventory.findIndex(s => s === null);
          if (freeSlot !== -1) {
            inventory[freeSlot] = new ItemStack(leaves, 1);
          } else {
            zone.dropAt(player.x, player.y, new ItemStack(leaves, 1));
          }
        }
        if (def) logMsg(`<span style='color:var(--warning)'>Your ${def.displayName} burned out!</span>`);
        calculateFOV(); drawMap();
      }
    }
  };
