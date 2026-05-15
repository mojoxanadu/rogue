  /*
  UI_LOGIC MODULE – USER INTERFACE, SAVE/LOAD, AND DEBUG SYSTEMS
  ===============================================================
  This module contains all front‑end logic for updating the game's HTML interface,
  managing save/load with optional encryption, rendering inventory grids, handling
  draggable modals, and providing debug/developer tools. It bridges the game state
  with the DOM, ensuring the player sees real‑time feedback.

  Key responsibilities:
  1. UI update functions – health/mana orbs, XP bar, gold, hunger, status chips, equipment slots
  2. Logging system – timestamped message display with auto‑scroll
  3. Save/load system – JSON serialization with XOR obfuscation, file download/upload
  4. Draggable modal management – mouse drag‑and‑drop for movable windows
  5. Inventory & inventory rendering – visual grids with drag‑and‑drop between inventory/inventory
  6. Stat & talent panels – allocation UI, talent tree display, spell management
  7. Debug/cheat functions – god mode, warp, add items, edit stats, toggle encryption
  8. Asset loader – import external sprite/sound packs via JSON file
  9. Quest actions – listen, kneel, attack, cast spell, toggle fog/light

  The functions here are called from engine.js (updateUI), from input.js (key/mouse events),
  and from direct HTML button clicks. They modify DOM elements and update global state.
*/
// === Tap-to-select mobile gesture ===
// Drag-and-drop isn't reliable on touchscreens, so we layer a tap-based
// alternative on top: tap an inventory slot or equip slot to "pick it up"
// (sticky highlight); tap any other slot (incl. quickslot HUD) to drop.
// Quickslot HUD slots preserve their existing tap-to-use behavior when no
// selection is active — they only act as drop TARGETS, never as sources.
//
// State: window._stickyDrag is null OR
//        { source: 'inv',   idx: <inventory index 0..29> } OR
//        { source: 'equip', slot: <'head'|'chest'|...> } OR
//        { source: 'bag',   bagRef: ItemStack, slotIdx: N }
//
// Open-bag state: window._openBags is a Set of ItemStack references.
// A bag is "open" when its ItemStack is in the set; rendering inlines
// its contents right after the bag's slot. Multiple bags can be open
// at once (including nested). Open state survives sticky-drag moves
// because the Set keys on the stable ItemStack reference.
window._stickyDrag = null;
if (!window._openBags) window._openBags = new Set();

// Return a bag's slots[], lazy-initialising if missing. The ItemStack
// constructor (items.js:136) allocates slots for container defs, but
// some legacy spawn paths produce ItemStacks before items_registry is
// built or with stripped class identity (JSON-roundtrip from save).
// This helper keeps callers from sprinkling `bag.slots ?? (bag.slots = ...)`
// everywhere.
function _bagSlots(bag) {
  if (!bag) return [];
  if (!bag.slots) bag.slots = new Array(bag.def?.bagSlots ?? 3).fill(null);
  return bag.slots;
}
window._bagSlots = _bagSlots;

// Recursively check if `bag` contains `candidate` at any depth. Used to
// reject bag-in-bag drops that would create a cycle (A contains B,
// then attempting to put A inside B).
function _bagContainsDeep(bag, candidate) {
  if (!bag || !candidate) return false;
  const c = bag.slots;
  if (!c) return false;
  for (const s of c) {
    if (!s) continue;
    if (s === candidate) return true;
    if (s.def?.type === 'bag' && _bagContainsDeep(s, candidate)) return true;
  }
  return false;
}
window._bagContainsDeep = _bagContainsDeep;

// Returns true if a sticky operation handled this tap (caller should NOT
// fall through to use-item / open-bag / etc.).
//
// Signature backwards-compatible:
//   handleStickyTap('inv', 5)              → inv slot 5
//   handleStickyTap('equip', 'head')       → equip slot
//   handleStickyTap('bag', 2, bagRef)      → bag's slot 2 inside bagRef
window.handleStickyTap = function(targetSource, targetIdxOrSlot, bagRef) {
  const src = window._stickyDrag;
  if (!src) return false;
  const target = (targetSource === 'bag')
    ? { source: 'bag', bagRef, slotIdx: targetIdxOrSlot }
    : (targetSource === 'equip')
      ? { source: 'equip', slot: targetIdxOrSlot }
      : { source: 'inv',   idx:  targetIdxOrSlot };
  // Self-tap: cancel the selection.
  const isSame = (
    src.source === target.source && (
      src.source === 'equip' ? src.slot === target.slot :
      src.source === 'bag'   ? (src.bagRef === target.bagRef && src.slotIdx === target.slotIdx) :
                               src.idx === target.idx
    )
  );
  if (isSame) {
    window._stickyDrag = null;
    if (typeof renderQuickslots === 'function') renderQuickslots();
    if (typeof renderInventory === 'function') renderInventory();
    if (typeof updateUI === 'function') updateUI();
    if (typeof window._updateSelectedNameLabels === 'function') window._updateSelectedNameLabels();
    return true;
  }
  _performStickyMove(src, target);
  window._stickyDrag = null;
  if (typeof renderQuickslots === 'function') renderQuickslots();
  if (typeof renderInventory === 'function') renderInventory();
  if (typeof updateUI === 'function') updateUI();
  if (typeof window._updateSelectedNameLabels === 'function') window._updateSelectedNameLabels();
  return true;
};

// Begin a sticky selection. Same-shape signature as handleStickyTap.
window.startStickyDrag = function(source, idxOrSlot, bagRef) {
  if (source === 'inv'   && !inventory[idxOrSlot]) return;
  if (source === 'equip' && !player.equipped[idxOrSlot]) return;
  if (source === 'bag') {
    const c = bagRef && bagRef.slots;
    if (!c || !c[idxOrSlot]) return;
    window._stickyDrag = { source: 'bag', bagRef, slotIdx: idxOrSlot };
  } else if (source === 'equip') {
    window._stickyDrag = { source, slot: idxOrSlot };
  } else {
    window._stickyDrag = { source, idx: idxOrSlot };
  }
  if (typeof renderQuickslots === 'function') renderQuickslots();
  if (typeof renderInventory === 'function') renderInventory();
  if (typeof updateUI === 'function') updateUI();
  if (typeof window._updateSelectedNameLabels === 'function') window._updateSelectedNameLabels();
};

function _equipSlotFits(slot, def) {
  if (!def) return false;
  if (slot === 'leftHand'  && (def.type === 'weapon' || def.slot === 'leftHand'))  return true;
  if (slot === 'rightHand' && (def.type === 'weapon' || def.slot === 'rightHand')) return true;
  return def.slot === slot;
}

// Read the stack at an addr (returns null for empty).
function _readAddr(addr) {
  if (addr.source === 'inv') return inventory[addr.idx] || null;
  if (addr.source === 'bag') {
    const c = (addr.bagRef && addr.bagRef.slots) || [];
    return c[addr.slotIdx] || null;
  }
  if (addr.source === 'equip') {
    const name = player.equipped[addr.slot];
    return name ? new ItemStack(name, 1) : null;
  }
  return null;
}

// Write a stack into an addr (inv or bag only — equip uses dedicated paths).
function _writeAddr(addr, stack) {
  if (addr.source === 'inv') { inventory[addr.idx] = stack; return; }
  if (addr.source === 'bag') {
    const c = window._bagSlots(addr.bagRef);
    c[addr.slotIdx] = stack;
    return;
  }
}

function _performStickyMove(src, target) {
  // Equip targets: route through existing equip/unequip path. Source
  // must be inv (no bag-direct-equip yet — Phase 6 may unify).
  if (target.source === 'equip') {
    if (src.source === 'inv') {
      if (typeof swapEquip === 'function') swapEquip(src.idx, target.slot);
      return;
    }
    if (src.source === 'equip') {
      if (typeof logMsg === 'function') {
        logMsg(`<span style='color:#aaa'>To move an equipped item to another slot, tap an inventory slot to unequip first.</span>`);
      }
      return;
    }
    // bag → equip: unsupported for now (would need to clear bag slot
    // AND validate equip-slot fit — niche; defer to Phase 6).
    if (typeof logMsg === 'function') logMsg('Move bag item to inventory first, then equip.');
    return;
  }

  // Equip source going to inv or bag: use existing unequip flow if
  // target is inv; bag target works the same with swap semantics.
  if (src.source === 'equip') {
    const equippedName = player.equipped[src.slot];
    if (!equippedName) return;
    const existing = _readAddr(target);
    if (existing) {
      const existingDef = ItemDefs[existing.itemName];
      if (!_equipSlotFits(src.slot, existingDef)) {
        if (typeof logMsg === 'function') {
          logMsg(`<span style='color:var(--warning)'>${existingDef?.displayName ?? 'That item'} doesn't fit the ${src.slot} slot.</span>`);
        }
        return;
      }
      player.equipped[src.slot] = existing.itemName;
    } else {
      player.equipped[src.slot] = null;
    }
    _writeAddr(target, new ItemStack(equippedName, 1));
    return;
  }

  // Inv ↔ inv, inv ↔ bag, bag ↔ inv, bag ↔ bag — uniform swap with
  // bag-cycle guard.
  const srcStack = _readAddr(src);
  if (!srcStack) return;
  if (target.source === 'bag') {
    if (srcStack.def?.type === 'bag') {
      if (srcStack === target.bagRef) {
        if (typeof logMsg === 'function') logMsg(`<span style='color:var(--warning)'>Can't put a bag inside itself.</span>`);
        return;
      }
      if (window._bagContainsDeep(srcStack, target.bagRef)) {
        if (typeof logMsg === 'function') logMsg(`<span style='color:var(--warning)'>Would create a bag-in-bag cycle.</span>`);
        return;
      }
    }
  }
  const tgtStack = _readAddr(target);
  _writeAddr(target, srcStack);
  _writeAddr(src,    tgtStack);
}

// === E13: Item Status Glow Helper ===
  function itemHasStatusEffect(icon) {
    // Guard checks the runtime registry (ItemDefs / ItemDef.byIcon), not the
    // legacy raw-data table — items_registry.js now owns the lookup path.
    if(!icon || typeof ItemDefs === 'undefined') return false;
    const def = ItemDef.byIcon(icon);
    if(!def) return false;
    return !!(def.evadePercent || def.thornsDmg || def.intBonus || def.special ||
              def.magicScaling || def.lightRange || def.manaCost || def.hitRateBonus ||
              def.meleeDmgBonus || def.rangedDmgBonus || (def.maxHeal && def.maxHeal > 5));
  }

// === Core UI & Layout Control ===
  // Cycle the game log height through 5 steps: 150 → 120 → 90 → 60 →
  // 30, then wrap back to 150. Useful on mobile where the log eats
  // vertical space. Button glyph is ▾ while there's room to shrink
  // (next tap will reduce by 30) and ▴ at the minimum (next tap
  // jumps back to 150 — the "expand" direction).
  window.toggleLogCollapse = function() {
    const body = document.getElementById('log-body');
    const btn  = document.getElementById('log-collapse');
    if (!body) return;
    const current = parseInt(body.style.height, 10)
                 || parseInt(getComputedStyle(body).height, 10)
                 || 60;
    const next = current <= 30 ? 150 : current - 30;
    body.style.height = next + 'px';
    if (btn) btn.textContent = next <= 30 ? '▴' : '▾';
  };

  function logMsg(msg) {
    const logDiv = document.getElementById('log');
    const logOverlay = document.getElementById('log-overlay');
    if(!logDiv) return;
    // Drain any errors captured before logMsg was wired up (window.onerror
    // fires before this file is parsed if a script loaded earlier throws).
    if (window._earlyErrors && window._earlyErrors.length) {
      const buffered = window._earlyErrors;
      window._earlyErrors = [];
      buffered.forEach(function(text) {
        logInfo.count++;
        const escErr = String(text)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        logDiv.innerHTML += '<div class="log-entry"><span class="log-new log-error"><strong>JS Error</strong><pre>' + escErr + '</pre></span></div>';
      });
    }
    logInfo.count++;
    logDiv.innerHTML += `<div class="log-entry"><span class="log-new">${msg}</span></div>`;
    // Scroll all scrollable containers to bottom
    requestAnimationFrame(() => {
      if(logOverlay) logOverlay.scrollTop = logOverlay.scrollHeight;
      logDiv.scrollTop = logDiv.scrollHeight;
      // Also scroll any parent with overflow
      let parent = logDiv.parentElement;
      while(parent) {
        if(parent.scrollHeight > parent.clientHeight) parent.scrollTop = parent.scrollHeight;
        parent = parent.parentElement;
      }
    });
  }

  function updateUI() {
    // View must never mutate state. HP/MP can legitimately exceed maxHp/maxMp
    // (talents grant temporary overflow). Drawing code clamps to 100% locally
    // for the orb fill height; the player object stays the source of truth.

    // Orb renderer health check: do not rely on global WebGL state.
    // We gate CSS fallback strictly by per-orb draw success.
    if(window.WebGLFX && WebGLFX.start && !(WebGLFX.state && WebGLFX.state.active)) WebGLFX.start();

    // E.759.NAKED: public streaker achievement.
    if(typeof awardAchievement === 'function' && currentScene !== 'dungeon' && player && player.equipped) {
      const isNaked = !player.equipped.head && !player.equipped.chest && !player.equipped.legs && !player.equipped.feet;
      if(isNaked) awardAchievement('naked_public');
    }

    const hpOrb = document.getElementById('hp-orb');
    if (hpOrb) {
        const hpFill = hpOrb.querySelector('.orb-fill');
        const hpText = hpOrb.querySelector('.orb-text');
        const hpPct = (player.maxHp > 0 && !isNaN(player.hp) && !isNaN(player.maxHp)) ? Math.max(0, Math.min(100, player.hp / player.maxHp * 100)) : 0;
        if (hpFill) {
          hpFill.style.height = `${hpPct}%`;
        }
        if (hpText) {
          const hp = isNaN(player.hp) ? 0 : Math.floor(player.hp);
          const maxHp = isNaN(player.maxHp) ? 16 : Math.floor(player.maxHp);
          hpText.innerText = `${hp}/${maxHp}`;
        }
        // B17 FIX: Draw WebGL fluid effect on hp-wave-canvas inside the orb
        let hpOrbWebgl = false;
        if (window.WebGLFX && WebGLFX.drawOrb) {
          const phase = performance.now() / 1000 * 0.2;
          hpOrbWebgl = !!WebGLFX.drawOrb('hp-wave-canvas', hpPct / 100, '#8b0000', phase, 'hp');
        }
        if (hpFill) hpFill.style.display = hpOrbWebgl ? 'none' : '';
    }
    const mpOrb = document.getElementById('mp-orb');
    if (mpOrb) {
        const mpFill = mpOrb.querySelector('.orb-fill');
        const mpText = mpOrb.querySelector('.orb-text');
        const mpPct = (player.maxMp > 0 && !isNaN(player.mp) && !isNaN(player.maxMp)) ? Math.max(0, Math.min(100, player.mp / player.maxMp * 100)) : 0;
        if (mpFill) {
          mpFill.style.height = `${mpPct}%`;
        }
        if (mpText) {
          const mp = isNaN(player.mp) ? 0 : Math.floor(player.mp);
          const maxMp = isNaN(player.maxMp) ? 0 : Math.floor(player.maxMp);
          mpText.innerText = `${mp}/${maxMp}`;
        }
        // B17 FIX: Draw WebGL fluid effect on mp-wave-canvas inside the orb
        let mpOrbWebgl = false;
        if (window.WebGLFX && WebGLFX.drawOrb) {
          const phase = performance.now() / 1000 * 0.15;
          mpOrbWebgl = !!WebGLFX.drawOrb('mp-wave-canvas', mpPct / 100, '#1155cc', phase, 'mp');
        }
        if (mpFill) mpFill.style.display = mpOrbWebgl ? 'none' : '';
    }

    const xpBar = document.getElementById('xp-bar-fill');
    const xpText = document.getElementById('xp-text');
    if (xpBar && xpText) {
      let requiredXp = CONSTANTS.XP_BASE * Math.pow(CONSTANTS.XP_MULT, player.level - 1);
      xpBar.style.width = Math.min(100, (player.xp / requiredXp) * 100) + '%';
      xpText.innerText = `Lvl ${player.level} - ${Math.floor(player.xp)}/${Math.floor(requiredXp)} XP`;
    }

    const minimapLabel = document.getElementById('minimap-label');
    if(minimapLabel) minimapLabel.innerText = 'Floor ' + currentLevel;

    const gpUI = document.getElementById('gpUI');
    if(gpUI) gpUI.innerText = `💰 ${player.gp}`;
    
    const hungerFill = document.getElementById('hunger-bar-fill');
    const hungerText = document.getElementById('hunger-text');
    const hPct = Math.max(0, Math.min(100, player.hunger || 0));
    if(hungerFill) hungerFill.style.width = hPct + '%';
    if(hungerText) hungerText.innerText = `Hunger ${Math.floor(hPct)}%`;

    const statusUI = document.getElementById('statusUI');
    if(statusUI) {
      // Show exhaustion warning above other statuses
      if(player.exhaustion > 20) {
        statusUI.style.display = 'block';
        statusUI.innerText = `EXHAUSTED (${Math.floor(player.exhaustion)})`;
        statusUI.className = "chip danger";
        // Warn once per threshold cross
        if(!player._exhaustedWarnFired) {
          player._exhaustedWarnFired = true;
          logMsg("<span style='color:var(--error)'>⚠️ You are exhausted! HP and MP draining while running.</span>");
        }
      } else if(player.isRunning && player.exhaustion > 12) {
        statusUI.style.display = 'block';
        statusUI.innerText = `TIRED (${Math.floor(player.exhaustion)})`;
        statusUI.className = "chip";
        player._exhaustedWarnFired = false;
      } else if(player.statusType) {
        statusUI.style.display = 'block';
        statusUI.innerText = player.statusType.toUpperCase();
        statusUI.className = "chip danger";
        player._exhaustedWarnFired = false;
      } else if(player.hasCondition && player.hasCondition('diarrhea')) {
        statusUI.style.display = 'block';
        // Condition.pointsRemaining is the new authoritative turn counter.
        let turns = 0;
        for (const c of player.conditions) {
          if (c.name === 'diarrhea') { turns = Math.max(0, Math.floor(c.pointsRemaining)); break; }
        }
        statusUI.innerText = `DIARRHEA${turns ? ` (${turns})` : ''}`;
        statusUI.className = "chip danger";
        player._exhaustedWarnFired = false;
      } else if(player.equipped && (player.equipped.rightHand === 'ringOfMidas' || player.equipped.leftHand === 'ringOfMidas')) {
        statusUI.style.display = 'block';
        statusUI.innerText = 'MIDAS TOUCH';
        statusUI.className = 'chip';
        player._exhaustedWarnFired = false;
      } else {
        statusUI.style.display = 'none';
        player._exhaustedWarnFired = false;
      }
    }

    const totalPts = (player.statPoints ?? 0);
    const badge = document.getElementById('stat-badge');
    if(badge) {
       badge.innerText = totalPts;
       badge.style.display = totalPts > 0 ? 'block' : 'none';
    }
    const menuBadge = document.getElementById('stat-badge-menu');
    if(menuBadge) {
      menuBadge.innerText = totalPts;
      menuBadge.style.display = totalPts > 0 ? 'inline-block' : 'none';
    }
    ['menu-toggle-btn', 'stats-talents-menu-btn'].forEach((id) => {
      const el = document.getElementById(id);
      if(el) el.classList.toggle('points-pending', totalPts > 0);
    });
    
    const slotLabels = { head: 'Head', chest: 'Chest', leftHand: 'L-Hand', rightHand: 'R-Hand', legs: 'Legs', feet: 'Feet' };
    Object.keys(player.equipped).forEach(slot => {
      const el = document.getElementById(`eq${slot}`);
      if(el) {
        const name  = player.equipped[slot];
        const def   = name ? ItemDefs[name] : null;
        const label = slotLabels[slot] || slot;
        // Build via textContent rather than innerHTML — values come from
        // ItemDefs (trusted) but the slot label could be any string; safer
        // not to rely on string-template HTML construction here.
        el.replaceChildren();
        const labelEl = document.createElement('div');
        labelEl.className   = 'equip-label';
        labelEl.textContent = label;
        const iconEl = document.createElement('span');
        iconEl.style.fontSize = '24px';
        iconEl.textContent    = def ? def.icon : '';
        el.appendChild(labelEl);
        el.appendChild(iconEl);
        el.title = def ? def.displayName : '';
        // K6: Make filled slots draggable; always accept drops from inventory
        el.draggable = !!name;
        el.ondragstart = name ? (e) => equipSlotDragStart(e, slot) : null;
        el.ondragover = (e) => equipSlotDragOver(e, slot);
        el.ondrop = (e) => equipSlotDrop(e, slot);
        el.style.cursor = name ? 'grab' : '';
        // Sticky-tap support: tap a filled equip slot to begin a move; tap
        // again with a pending move to drop. Empty equip slots are valid
        // drop targets but cannot start a move.
        el.onclick = () => {
          if (handleStickyTap('equip', slot)) return;
          if (name) startStickyDrag('equip', slot);
        };
        if (window._stickyDrag && window._stickyDrag.source === 'equip' && window._stickyDrag.slot === slot) {
          el.classList.add('sticky-selected');
        } else {
          el.classList.remove('sticky-selected');
        }
      }
    });

    const statsModal = document.getElementById('stats-modal');
    if(statsModal && statsModal.style.display === 'flex') {
      // Talents tab is currently a placeholder (new model TBD); only
      // the Stats tab has content to refresh.
      showStats();
    }
    
    const magicModal = document.getElementById('magic-modal');
    if(magicModal && magicModal.style.display === 'flex') showMagic();

    // Bug 32: Update quickslot spell cooldown countdown numbers
    ['spell-icon-1', 'spell-icon-2'].forEach((id, idx) => {
      const slotEl = document.getElementById(id);
      if(!slotEl) return;
      const spellKey = idx === 0 ? player.equippedSpell : player.secondarySpell;
      // Remove old cooldown badge if present
      let badge = slotEl.parentElement.querySelector('.spell-cd-badge');
      if(badge) badge.remove();
      if(spellKey) {
        slotEl.textContent = spellKey === 'illuminate' ? '🌟' : spellKey === 'fireball' ? '🔥' : spellKey === 'lightning' ? '⚡' : spellKey === 'icebolt' ? '❄️' : spellKey === 'poison' ? '☠️' : spellKey === 'shield' ? '🛡️' : spellKey === 'haste' ? '⚡' : '✨';
        const cdRem = window._spellCooldownRemaining ? window._spellCooldownRemaining(spellKey) : 0;
        if(cdRem > 0) {
          let cdBadge = document.createElement('span');
          cdBadge.className = 'spell-cd-badge';
          cdBadge.style.cssText = 'position:absolute;bottom:1px;right:2px;font-size:7px;color:#FFD700;font-weight:bold;pointer-events:none;';
          cdBadge.textContent = Math.ceil(cdRem) + 's';
          slotEl.parentElement.style.opacity = '0.55';
          slotEl.parentElement.appendChild(cdBadge);
        } else {
          slotEl.parentElement.style.opacity = '1';
        }
      } else {
        // #2: Show empty slot indicator when no spell selected
        slotEl.textContent = '🔘';
        slotEl.parentElement.style.opacity = '1';
      }
    });

    const inventoryModal = document.getElementById('inventory-modal');
    if(inventoryModal && inventoryModal.style.display === 'flex') renderInventory();

    // Bug 8/9/10: Show bubbles only when orb fill > 10%
    const hpPctForBubble = player.maxHp > 0 ? player.hp / player.maxHp : 0;
    const mpPctForBubble = player.maxMp > 0 ? player.mp / player.maxMp : 0;
    ['hp-bubble-1', 'hp-bubble-2'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.style.opacity = hpPctForBubble > 0.10 ? '' : '0';
    });
    ['mp-bubble-1', 'mp-bubble-2'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.style.opacity = mpPctForBubble > 0.10 ? '' : '0';
    });

    // Bug 4: Update orb slosh animation based on player state
    document.querySelectorAll('.orb-fill').forEach(orb => {
      orb.classList.remove('slosh-walk', 'slosh-run');
      if(player.isSleeping || player.isKneeling || isDead) {
        // No slosh
      } else if(player.isRunning || (player._isAttacking)) {
        orb.classList.add('slosh-run');
      } else if(Date.now() - lastMoveTime < 500) {
        orb.classList.add('slosh-walk');
      }
    });

    // K1: Sync melee button icon with left-hand equipped item.
    // player.equipped.leftHand holds a camelCase item NAME ('sword',
    // 'longsword', etc) — resolve to its display icon via ItemDef.
    // Legacy emoji values would short-circuit through iconOf's
    // unknown-name fallback ('?'); guard with a presence check so
    // an unequipped slot stays as fists 👊.
    const meleeIcon = document.getElementById('melee-icon');
    if (meleeIcon) {
      const lh = player.equipped && player.equipped.leftHand;
      meleeIcon.textContent = lh
        ? (typeof ItemDef !== 'undefined' && ItemDef.iconOf ? ItemDef.iconOf(lh) : lh)
        : '👊';
    }
    _updateSelectedNameLabels();
  }

  // === Save/Load System ===
  // Obfuscation: ROT13 + MD5 checksum envelope. Portable across machines.
  // Not real encryption — just deters casual save editing.
  function rot13(str) {
    return str.replace(/[a-zA-Z]/g, c => {
      const base = c <= 'Z' ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
  }
  function md5Hash(str) {
    // Simple djb2 hash as a lightweight checksum (not cryptographic MD5)
    let h = 5381;
    for(let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(16).padStart(8, '0');
  }
  function obfuscate(str) {
    const rot = rot13(btoa(unescape(encodeURIComponent(str))));
    const checksum = md5Hash(str);
    return JSON.stringify({ v: 2, d: rot, c: checksum });
  }
  function deobfuscate(str) {
    // Try new v2 ROT13 format
    try {
      const env = JSON.parse(str);
      if(env.v === 2) {
        const decoded = decodeURIComponent(escape(atob(rot13(env.d))));
        const checksum = md5Hash(decoded);
        if(checksum !== env.c) {
          if(typeof debugLog === 'function') debugLog('WARNING: Save file checksum mismatch — file may have been modified.');
        }
        return decoded;
      }
    } catch(e) {}
    // Fall back to old XOR+base64 format
    const SAVE_KEY = "DungeonDescentSecret";
    const raw = atob(str);
    return raw.split('').map((char, i) => String.fromCharCode(char.charCodeAt(0) ^ SAVE_KEY.charCodeAt(i % SAVE_KEY.length))).join('');
  }

  const SAVE_DB_NAME = 'rogue_js_save_db';
  const SAVE_DB_VERSION = 1;
  const SAVE_DB_STORE = 'saves';
  const SAVE_DB_SLOT = 'latest';

  function openSaveDb() {
    return new Promise((resolve, reject) => {
      if(!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      const req = window.indexedDB.open(SAVE_DB_NAME, SAVE_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(SAVE_DB_STORE)) {
          db.createObjectStore(SAVE_DB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    });
  }

  async function saveToIndexedDb(payload) {
    const db = await openSaveDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SAVE_DB_STORE, 'readwrite');
      const store = tx.objectStore(SAVE_DB_STORE);
      store.put({ id: SAVE_DB_SLOT, payload, savedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
    db.close();
  }

  async function loadFromIndexedDb() {
    const db = await openSaveDb();
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(SAVE_DB_STORE, 'readonly');
      const store = tx.objectStore(SAVE_DB_STORE);
      const req = store.get(SAVE_DB_SLOT);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
    });
    db.close();
    return row ? row.payload : null;
  }

  function buildSaveState() {
    const questState = (typeof QuestEngine !== 'undefined' && QuestEngine.getState) ? QuestEngine.getState() : {};
    const playerSave = Object.assign({}, player);
    if(playerSave.identifiedItems instanceof Set) {
      playerSave.identifiedItems = Array.from(playerSave.identifiedItems);
    }
    return {
      _comment_meta: "Rogue JS save file. Edit at your own risk — checksum will fail.",
      _build: 757,
      _saved: new Date().toISOString(),
      player: playerSave,
      _comment_world: "World state — map, level, scene.",
      currentLevel, currentScene, mapW, mapH,
      theMap, explored,
      _comment_entities: "Entities on the current floor.",
      lootables: zone.lootables.map(l => ({
        ownerKind: l.ownerKind, x: l.x, y: l.y,
        slots: l.slots.map(s => ({ itemName: s.itemName, qty: s.qty })),
        isLocked: l.isLocked, lockKind: l.lockKind,
      })),
      enemies,
      corpses: zone.corpses.map(c => ({
        x: c.x, y: c.y, name: c.name, icon: c.icon,
        isBones: c.isBones, actionCooldown: c.actionCooldown,
        lootable: c.lootable ? {
          ownerKind: c.lootable.ownerKind, x: c.lootable.x, y: c.lootable.y,
          slots: c.lootable.slots.map(s => ({ itemName: s.itemName, qty: s.qty })),
        } : null,
      })),
      _comment_progress: "Persistent progression data.",
      levelCache, stolenItems, questState,
      _comment_settings: "Player settings and macros.",
      gameSettings: window.gameSettings || {},
      keybindings: window._keybindings || {},
      macros: player.macros || []
    };
  }

  function serializeSaveState(state) {
    const json = JSON.stringify(state, null, 2);
    if (window.debugFlags && window.debugFlags.noEncryption) {
      if(typeof debugLog === 'function') debugLog("Game saved (unencrypted).");
      return { payload: json, obfuscated: false };
    }
    if(typeof debugLog === 'function') debugLog("Game saved (obfuscated).");
    return { payload: obfuscate(json), obfuscated: true };
  }

  function parseSavePayload(rawText) {
    let parsed = null;
    try { parsed = JSON.parse(rawText); } catch(e) {}
    if(parsed && parsed.player) {
      if(typeof debugLog === 'function') debugLog("Loaded plain JSON save.");
      return parsed;
    }
    try {
      const decoded = JSON.parse(deobfuscate(rawText));
      if(decoded && decoded.player) {
        if(typeof debugLog === 'function') debugLog("Loaded obfuscated save.");
        return decoded;
      }
    } catch(e) {}
    throw new Error('Invalid save data');
  }

  function applyLoadedState(data) {
    Object.assign(player, data.player);
    if(Array.isArray(player.identifiedItems)) player.identifiedItems = new Set(player.identifiedItems);
    else if(!(player.identifiedItems instanceof Set)) player.identifiedItems = new Set();
    currentLevel = data.currentLevel; currentScene = data.currentScene;
    theMap = data.theMap; explored = data.explored;
    enemies = data.enemies;
    levelCache = data.levelCache; stolenItems = data.stolenItems || [];
    // Rehydrate Lootables (JSON-cloned in save).
    zone.clearLootables();
    (data.lootables || []).forEach(spec => {
      const slots = (spec.slots || []).map(s => new ItemStack(s.itemName, s.qty ?? 1));
      zone.addLootable(new Lootable({
        ownerKind: spec.ownerKind, x: spec.x, y: spec.y, slots,
        isLocked: !!spec.isLocked, lockKind: spec.lockKind || null,
      }));
    });
    // Rehydrate Corpses (with their owned Lootable).
    zone.clearCorpses();
    (data.corpses || []).forEach(spec => {
      const lootable = spec.lootable ? new Lootable({
        ownerKind: 'corpse', x: spec.x, y: spec.y,
        slots: (spec.lootable.slots || []).map(s => new ItemStack(s.itemName, s.qty ?? 1)),
      }) : null;
      const c = new Corpse({
        x: spec.x, y: spec.y, name: spec.name, icon: spec.icon,
        isBones: !!spec.isBones, actionCooldown: spec.actionCooldown ?? 0,
        lootable,
      });
      zone.addCorpse(c);
    });
    if(data.gameSettings) Object.assign(window.gameSettings, data.gameSettings);
    if(data.keybindings) Object.assign(window._keybindings || {}, data.keybindings);
    if(data.macros) player.macros = data.macros;
    if (data.questState && typeof QuestEngine !== 'undefined' && QuestEngine.loadState) {
      QuestEngine.loadState(data.questState);
      logMsg("Quest & achievement progress restored.");
    }
    mapW = data.mapW; mapH = data.mapH;
    visible = Array(mapH).fill().map(() => Array(mapW).fill(false));
    darkMap = data.darkMap || Array(mapH).fill().map(() => Array(mapW).fill(false));
    logMsg("Save loaded!");
    toggleModal('menu-modal');
    calculateFOV();
    drawMap();
    updateUI();
  }

  async function writeSaveFileWithChooser(payload) {
    if(window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'dungeon_save.json',
        types: [{ description: 'JSON Save', accept: { 'application/json': ['.json'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(payload);
      await writable.close();
      return true;
    }
    return false;
  }

  function downloadSaveFile(payload) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    a.download = 'dungeon_save.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 100);
  }

  async function readSaveFileWithChooser() {
    if(window.showOpenFilePicker) {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'JSON Save', accept: { 'application/json': ['.json'] } }]
      });
      if(!handles || !handles[0]) return null;
      const file = await handles[0].getFile();
      return await file.text();
    }
    return await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if(!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result || null);
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      };
      input.click();
    });
  }

  window.saveGame = async () => {
    const state = buildSaveState();
    const serialized = serializeSaveState(state);

    try {
      await saveToIndexedDb(serialized.payload);
      logMsg("Save stored in browser (IndexedDB).");
    } catch(e) {
      if(typeof debugLog === 'function') debugLog(`IndexedDB save failed: ${e && e.message ? e.message : e}`);
      logMsg("<span style='color:var(--warning)'>Could not write IndexedDB save.</span>");
    }

    try {
      const wroteByChooser = await writeSaveFileWithChooser(serialized.payload);
      if(!wroteByChooser) downloadSaveFile(serialized.payload);
      logMsg(serialized.obfuscated ? "Game saved to file." : "Game saved to file (unencrypted).");
    } catch(e) {
      if(e && e.name === 'AbortError') {
        logMsg("File save canceled. IndexedDB save is still available.");
        return;
      }
      if(typeof debugLog === 'function') debugLog(`File save failed: ${e && e.message ? e.message : e}`);
      logMsg("<span style='color:var(--warning)'>Could not save to file.</span>");
    }
  };

  window.loadGame = async () => {
    try {
      const indexed = await loadFromIndexedDb();
      if(indexed && confirm('Load latest browser save (IndexedDB)?\nPress Cancel to choose a file instead.')) {
        const data = parseSavePayload(indexed);
        applyLoadedState(data);
        logMsg("Loaded from IndexedDB.");
        return;
      }
    } catch(e) {
      if(typeof debugLog === 'function') debugLog(`IndexedDB load check failed: ${e && e.message ? e.message : e}`);
    }

    let raw = null;
    try {
      raw = await readSaveFileWithChooser();
    } catch(e) {
      if(e && e.name === 'AbortError') {
        logMsg("Load canceled.");
        return;
      }
      if(typeof debugLog === 'function') debugLog(`File chooser load failed: ${e && e.message ? e.message : e}`);
    }
    if(!raw) return;

    try {
      const data = parseSavePayload(raw);
      applyLoadedState(data);
      try { await saveToIndexedDb(raw); } catch(e) {}
    } catch(e) {
      alert('Invalid save file!');
    }
  };

  // === Settings ===
  // E1/E2: musicMode and sfxMode: 'off' | 'fm' | 'mp3'
  window.gameSettings = { sfx: true, music: true, sprites: false, musicMode: 'fm', sfxMode: 'fm' };
  
  // Initialize checkbox states from gameSettings on page load
  window.addEventListener('DOMContentLoaded', () => {
    // Apply the touch-mode body class as the FIRST act of boot. CSS
    // rules keyed off body.touch (smaller default log, larger hit
    // areas, narrower modals, etc) take effect immediately. Any
    // future view-side adaptation gates on this class — no UA
    // sniffing scattered through the code. Update IS_TOUCH state at
    // boot time only; live device-rotation / hot-plug isn't worth
    // chasing for a roguelike.
    if (window.IS_TOUCH) document.body.classList.add('touch');
    // (Log collapse glyph: stays ▾ at boot for both desktop (120px,
    // next tap shrinks to 90) and touch (60px, next tap shrinks to
    // 30). Only the wraparound state at 30 → 150 flips the glyph
    // to ▴, handled inside toggleLogCollapse.)

    const sfxToggle = document.getElementById('sfx-toggle');
    const musicToggle = document.getElementById('music-toggle');
    if(sfxToggle) sfxToggle.checked = window.gameSettings.sfx;
    if(musicToggle) musicToggle.checked = window.gameSettings.music;
    // Update knob positions
    if(sfxToggle && typeof toggleSetting === 'function') toggleSetting('sfx', window.gameSettings.sfx);
    if(musicToggle && typeof toggleSetting === 'function') toggleSetting('music', window.gameSettings.music);
  });

  // E1/E2: Cycle a 3-position mode setting: off → fm → mp3 → off
  window.cycleModeToggle = (setting) => {
    const modes = ['off', 'fm', 'mp3'];
    const current = window.gameSettings[setting] || 'off';
    const nextIdx = (modes.indexOf(current) + 1) % modes.length;
    const next = modes[nextIdx];
    window.gameSettings[setting] = next;

    // Sync legacy boolean fields for backward compatibility
    if(setting === 'musicMode') {
      window.gameSettings.music = (next !== 'off');
    } else if(setting === 'sfxMode') {
      window.gameSettings.sfx = (next !== 'off');
    }

    // Update button label
    const btn = document.getElementById(`${setting}-cycle-btn`);
    if(btn) btn.textContent = _modeLabel(next);

    // Side effects for music
    if(setting === 'musicMode') {
      if(next === 'off') {
        Sound.stopMusic();
      } else {
        Sound.currentTrack = null;
        if(currentScene === 'town') Sound.playMusic('leftys');
        else if(typeof currentLevel !== 'undefined' && currentLevel === 3) Sound.playMusic('leftys');
        else if(typeof currentLevel !== 'undefined' && currentLevel >= 5 && currentLevel <= 6) Sound.playMusic('monkey');
        else if(typeof currentLevel !== 'undefined' && currentLevel === 9) Sound.playMusic('bandit');
        else if(currentScene === 'beach') Sound.playMusic('monkey');
        else if(currentScene === 'desert') Sound.playMusic('bandit');
        else if(currentScene === 'castle') Sound.playMusic('lechuck');
        else Sound.playMusic('monkey');
      }
    }

  };

  function _modeLabel(mode) {
    if(mode === 'off') return 'Off';
    if(mode === 'fm') return 'FM Synth';
    if(mode === 'mp3') return 'MP3';
    return mode;
  }

  // #1 FIX: Initialize settings knobs from gameSettings when modal opens
  window.initSettingsUI = () => {
    // Sprites toggle (legacy boolean knob)
    const setting = 'sprites';
    const knob = document.getElementById(`${setting}-knob`);
    const checkbox = document.getElementById(`${setting}-toggle`);
    const val = window.gameSettings[setting];
    if(knob) {
      const thumb = knob.querySelector('span');
      if(val) {
        knob.style.background = '#D0BCFF';
        if(thumb) thumb.style.left = '27px';
      } else {
        knob.style.background = '#4A4458';
        if(thumb) thumb.style.left = '3px';
      }
    }
    if(checkbox) checkbox.checked = val;

    // E1/E2: Update cycle button labels
    const musicBtn = document.getElementById('musicMode-cycle-btn');
    if(musicBtn) musicBtn.textContent = _modeLabel(window.gameSettings.musicMode || 'fm');
    const sfxBtn = document.getElementById('sfxMode-cycle-btn');
    if(sfxBtn) sfxBtn.textContent = _modeLabel(window.gameSettings.sfxMode || 'fm');
  };
  
  window.toggleSetting = (setting, value) => {
    window.gameSettings[setting] = value;
    const knob = document.getElementById(`${setting}-knob`);
    if(knob) {
      const thumb = knob.querySelector('span');
      if(value) {
        knob.style.background = '#D0BCFF';
        if(thumb) thumb.style.left = '27px';
      } else {
        knob.style.background = '#4A4458';
        if(thumb) thumb.style.left = '3px';
      }
    }
    if(setting === 'sprites') window.useSprites = value;
    if(setting === 'music' && !value) {
      Sound.stopMusic();
    }
    if(setting === 'music' && value) {
      // Bug 21: Re-enable music for current scene
      Sound.currentTrack = null; // Reset so playMusic will trigger
      // Determine which track to play based on current scene/level
      if(currentScene === 'town') Sound.playMusic('leftys');
      else if(currentLevel === 3) Sound.playMusic('leftys');
      else if(currentLevel >= 5 && currentLevel <= 6) Sound.playMusic('monkey');
      else if(currentLevel === 9) Sound.playMusic('bandit');
      else if(currentScene === 'beach') Sound.playMusic('monkey');
      else if(currentScene === 'desert') Sound.playMusic('bandit');
      else if(currentScene === 'castle') Sound.playMusic('lechuck');
      else Sound.playMusic('monkey'); // Default
    }
  };

  // === Draggable Modals ===
  let activeModal = null, isDragging = false, dragOffset = {x: 0, y: 0};
  window.draggedItemIdx = null; window.draggedSource = null;

  window.toggleModal = (id) => {
    let el = document.getElementById(id);
    if(!el) return;
    el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'flex' : 'none';
    if(el.style.display === 'flex') {
      // Opening any modal dismisses the loot popup so it doesn't sit
      // hidden beneath the modal (and then awkwardly reappear once the
      // modal closes). Player can re-trigger the popup by stepping
      // off-and-back-onto the tile.
      if (typeof window.hideLootPopup === 'function') window.hideLootPopup();
      if(id === 'stats-modal') { showStatsTab('stats'); }
      if(id === 'magic-modal') showMagic();
      if(id === 'inventory-modal') renderInventory();
      if(id === 'asset-viewer-modal') showAssetViewer();
      if(id === 'achieve-modal') showAchievements();
      if(id === 'quest-modal') showQuestLog();
      if(id === 'debug-modal' && typeof debugShowTiming === 'function') debugShowTiming();
    }
  };

  // ─── Loot Popup (Phase 4b) ──────────────────────────────────
  //
  // Non-modal HUD overlay shown when the player stands on (or bumps
  // into) a tile with one or more Lootables. Sections per source —
  // each Corpse contributes its lootable as a "<Name>:" / "Bones of
  // <name>:" section; placed Lootables contribute floor piles
  // ("Floor:") and containers ("<Name>: [🔒]" if locked).
  //
  // Triggers (wired in engine.js movePlayer):
  //   walk onto a tile with any lootable → show
  //   any player action (move off-tile, attack, cast, ...) → hide
  //   ESC → hide
  //
  // State: window._lootPopupTile = {x,y} (or null when hidden).

  // Snapshot the lootable sources at the player's tile into a list of
  // sections the renderer can iterate. Each section has:
  //   { heading, locked, lootable, stacks: [{stack, slotIdx}] }
  // - corpse-owned lootables come from zone.corpsesAt
  // - placed Lootables (floor/container/door) from zone.lootablesAt
  function _lootSectionsAtTile(x, y) {
    const sections = [];
    if (typeof zone === 'undefined') return sections;
    for (const corpse of zone.corpsesAt(x, y)) {
      const l = corpse.lootable;
      if (!l) continue;
      sections.push({
        heading: corpse.isBones ? `Bones of ${corpse.name}` : corpse.name,
        locked: false,
        lootable: l,
        stacks: l.slots.map((stack, slotIdx) => ({ stack, slotIdx })),
      });
    }
    for (const l of zone.lootablesAt(x, y)) {
      if (l.ownerKind === 'floor') {
        sections.push({
          heading: 'Floor',
          locked: false,
          lootable: l,
          stacks: l.slots.map((stack, slotIdx) => ({ stack, slotIdx })),
        });
      } else if (l.ownerKind === 'container' || l.ownerKind === 'door') {
        const name = l.def?.displayName || l.def?.name || (l.ownerKind === 'door' ? 'Door' : 'Container');
        sections.push({
          heading: name,
          locked: !!l.isLocked,
          lootable: l,
          stacks: l.isLocked ? [] : l.slots.map((stack, slotIdx) => ({ stack, slotIdx })),
        });
      }
    }
    return sections;
  }

  // ─── Unlock options (Phase 5c+5d) ───────────────────────────
  //
  // For a locked Lootable, return the list of unlock methods the
  // player can attempt. Each option carries:
  //   { method, label, icon, enabled, hint }
  // - 'key' / 'masterKey'  : enabled if matching key in inventory
  // - 'castUnlock'         : enabled if Cast Unlock spell known
  // - 'pickLock'           : enabled if Lockpicking talent owned
  // - 'kick'               : always enabled (player takes damage)
  function _unlockOptionsFor(lootable) {
    const hasItem = (name) => inventory.some(s => s && s.itemName === name);
    const tal     = (id) => (player.talents?.[id]?.level) || 0;
    // player.spells is a dict { spellId: { level: N } }. Knowing a
    // spell is presence of the key (any positive level).
    const knowsSpell = (id) => !!(player.spells && player.spells[id] && (player.spells[id].level ?? 0) > 0);
    const slots = lootable.def?.bagSlots ?? 1;
    const unlockMp = (typeof SPELL_DEFS !== 'undefined' && SPELL_DEFS.unlock?.mpCost) || 5;
    const knowsUnlock = knowsSpell('unlock');
    const enoughMp = (player.mp ?? 0) >= unlockMp;
    return [
      { method: 'key',        label: 'Use Key',         icon: '🗝️',
        enabled: hasItem('key') },
      { method: 'masterKey',  label: 'Use Master Key',  icon: '🔑',
        enabled: hasItem('masterKey') },
      { method: 'castUnlock', label: 'Cast Unlock',     icon: '✨',
        enabled: knowsUnlock && enoughMp,
        hint:    !knowsUnlock ? '(spell not learned)'
               : !enoughMp   ? `(needs ${unlockMp} MP)`
               :                `(${unlockMp} MP)` },
      { method: 'pickLock',   label: 'Pick Lock',       icon: '🔍',
        enabled: tal('lockpicking') > 0,
        hint:    tal('lockpicking') > 0 ? `(${19 * tal('lockpicking')}%)` : '(no talent)' },
      { method: 'kick',       label: 'Kick',            icon: '🦶',
        enabled: true,
        hint:    `(${5 + 10 * tal('shitKicker')}%, 1..${slots} dmg)` },
    ];
  }

  // Resolve an unlock attempt — consumes resources, rolls success,
  // mutates the Lootable on success, applies kick damage either way.
  // Returns nothing; messages are logged and the popup re-renders.
  window.attemptUnlock = (lootableId, method) => {
    const lootable = _findLootableById(lootableId);
    if (!lootable || !lootable.isLocked) { _renderLootPopup(); return; }
    const containerName = lootable.def?.displayName ?? 'container';
    const tal = (id) => (player.talents?.[id]?.level) || 0;
    const consumeOne = (name) => {
      const idx = inventory.findIndex(s => s && s.itemName === name);
      if (idx === -1) return false;
      const stk = inventory[idx];
      stk.qty = (stk.qty ?? 1) - 1;
      if (stk.qty <= 0) inventory[idx] = null;
      return true;
    };
    const unlock = () => {
      lootable.isLocked = false;
      lootable.lockKind = null;
      logMsg(`<span style='color:var(--success)'>The ${containerName} unlocks.</span>`);
      Sound.clink && Sound.clink();
    };
    if (method === 'key') {
      if (!consumeOne('key')) { logMsg('No key available.'); return; }
      logMsg(`You turn a key in the ${containerName}.`);
      unlock();
    } else if (method === 'masterKey') {
      if (!consumeOne('masterKey')) { logMsg('No master key available.'); return; }
      logMsg(`You turn a master key in the ${containerName}.`);
      unlock();
    } else if (method === 'castUnlock') {
      const knowsUnlock = !!(player.spells && player.spells.unlock && (player.spells.unlock.level ?? 0) > 0);
      const mpCost = (typeof SPELL_DEFS !== 'undefined' && SPELL_DEFS.unlock?.mpCost) || 5;
      if (!knowsUnlock) { logMsg('You do not know the Unlock spell.'); return; }
      if ((player.mp ?? 0) < mpCost) { logMsg(`Not enough MP (need ${mpCost}).`); return; }
      player.mp -= mpCost;
      logMsg(`<span style='color:var(--primary)'>You cast Unlock on the ${containerName}.</span>`);
      unlock();
    } else if (method === 'pickLock') {
      const N = tal('lockpicking');
      if (N <= 0) { logMsg('You lack the Lockpicking talent.'); return; }
      const chance = 0.19 * N;
      if (Math.random() < chance) {
        logMsg(`You deftly pick the lock on the ${containerName}.`);
        unlock();
      } else {
        logMsg(`<span style='color:var(--warning)'>You fumble the picks; the ${containerName} stays locked.</span>`);
      }
    } else if (method === 'kick') {
      const slots = lootable.def?.bagSlots ?? 1;
      const chance = 0.05 + 0.10 * tal('shitKicker');
      const dmg = 1 + Math.floor(Math.random() * slots);
      if (typeof player.takeDamage === 'function') player.takeDamage(dmg, 'corporal');
      else player.hp = Math.max(0, player.hp - dmg);
      logMsg(`<span style='color:var(--error)'>You kick the ${containerName} — ${dmg} damage!</span>`);
      if (Math.random() < chance) {
        logMsg(`The ${containerName} splinters open.`);
        unlock();
      } else {
        logMsg(`<span style='color:var(--warning)'>It holds.</span>`);
      }
    }
    updateUI();
    drawMap();
    _renderLootPopup();
  };

  // Re-paint the popup div from current Zone state. Hides if there's
  // nothing useful to show.
  function _renderLootPopup() {
    const el = document.getElementById('loot-popup');
    if (!el) return;
    const tile = window._lootPopupTile;
    if (!tile) { el.style.display = 'none'; return; }
    const sections = _lootSectionsAtTile(tile.x, tile.y);
    // Container sections show even when empty so the player can confirm
    // "I already cleared this one." Floor/corpse sections still drop
    // away when empty — there's nothing visually there anyway.
    const live = sections.filter(s =>
      s.locked ||
      s.stacks.length > 0 ||
      s.lootable.ownerKind === 'container'
    );
    if (live.length === 0) { el.style.display = 'none'; window._lootPopupTile = null; return; }

    const hasUnlocked = live.some(s => !s.locked && s.stacks.length > 0);
    const parts = [];
    if (hasUnlocked) {
      parts.push(`<button class="lp-allbtn" onclick="pickupAllAtTile(${tile.x},${tile.y})">Pick Up All</button>`);
    }
    for (const s of live) {
      const lockBadge = s.locked ? `<span class="lp-lock">🔒</span>` : '';
      parts.push(`<div class="lp-section">`);
      parts.push(`<div class="lp-heading">${lockBadge}${s.heading}</div>`);
      if (s.locked) {
        const opts = _unlockOptionsFor(s.lootable);
        for (const opt of opts) {
          const dim = opt.enabled ? '' : ' style="opacity:0.45; cursor:not-allowed;"';
          const handler = opt.enabled ? `onclick="attemptUnlock(${s.lootable.id},'${opt.method}')"` : '';
          parts.push(
            `<div class="lp-row"${dim} ${handler}>` +
              `<span class="lp-icon">${opt.icon}</span>` +
              `<span class="lp-name">${opt.label}</span>` +
              `<span class="lp-qty">${opt.hint || ''}</span>` +
            `</div>`
          );
        }
      } else if (s.stacks.length === 0) {
        // Empty (unlocked) container — show placeholder so the player
        // knows the section exists and is cleared.
        parts.push(`<div class="lp-row" style="opacity:0.5; cursor:default;"><span class="lp-name">(empty)</span></div>`);
      } else {
        for (const { stack, slotIdx } of s.stacks) {
          const def = stack.def;
          const name = def?.displayName ?? stack.itemName ?? stack.icon ?? '?';
          const qty  = (stack.qty && stack.qty > 1) ? ` ×${stack.qty}` : '';
          parts.push(
            `<div class="lp-row" onclick="pickupLootSlot(${s.lootable.id},${slotIdx})">` +
              `<span class="lp-icon">${stack.icon ?? ''}</span>` +
              `<span class="lp-name">${name}</span>` +
              `<span class="lp-qty">${qty}</span>` +
            `</div>`
          );
        }
      }
      parts.push(`</div>`);
    }
    parts.push(`<div class="lp-hint">ESC or any action closes</div>`);
    el.innerHTML = parts.join('');
    el.style.display = 'block';
  }

  window.showLootPopup = (x, y) => {
    if (typeof zone === 'undefined') return;
    const sections = _lootSectionsAtTile(x, y);
    if (sections.length === 0) return;
    window._lootPopupTile = { x, y };
    _renderLootPopup();
  };

  window.hideLootPopup = () => {
    window._lootPopupTile = null;
    const el = document.getElementById('loot-popup');
    if (el) el.style.display = 'none';
  };

  // Pick up a single slot from a Lootable identified by its id.
  // Stack goes to inventory (or gold goes to player.gp). Empty lootables
  // get removed from zone if they're placed (floor/container/door).
  window.pickupLootSlot = (lootableId, slotIdx) => {
    if (typeof zone === 'undefined') return;
    const lootable = _findLootableById(lootableId);
    if (!lootable) return;
    if (lootable.isLocked) return;
    const stack = lootable.slots[slotIdx];
    if (!stack) return;
    if (stack.def?.pickupTo === 'gp') {
      changeGold(stack.qty, { x: lootable.x ?? player.x, y: lootable.y ?? player.y, floatText: true });
      lootable.remove(slotIdx);
    } else {
      const placed = tryPlaceInInventory(stack);
      if (placed) {
        lootable.remove(slotIdx);
        logMsg(`Picked up ${stack.icon}`);
        Sound.clink && Sound.clink();
        _onCupcakePickup(stack.icon);
      } else {
        logMsg("Inventory full!");
        return;
      }
    }
    _afterLootMutation(lootable);
  };

  // Grok's "those cupcakes were for Bruce" gag — fired on first/second
  // cupcake pickup, regardless of which loot path picked it up. Lives
  // here in ui_logic.js so the loot popup (Phase 4b) AND any future
  // pickup paths share one point of truth.
  function _onCupcakePickup(icon) {
    if (icon !== '🧁') return;
    if (!window._grokCupcakePickups) window._grokCupcakePickups = 0;
    window._grokCupcakePickups++;
    if (window._grokCupcakePickups === 1) {
      logMsg("<span style='color:#f88'>🧌 Grok: 'Hey!!! I made those cupcakes for Bruce, not for you!!!'</span>");
      if (typeof playVoiceClip === 'function') playVoiceClip('voice_orc_cupcake_1');
    } else {
      logMsg("<span style='color:#f88'>🧌 Grok: 'Hey! Aren't you fat enough already? Leave some for the Grues!'</span>");
      if (typeof playVoiceClip === 'function') playVoiceClip('voice_orc_cupcake_2');
    }
  }

  // Pick Up All — iterates every unlocked section at the tile and grabs
  // everything that fits. Items that don't fit stay where they are.
  window.pickupAllAtTile = (x, y) => {
    if (typeof zone === 'undefined') return;
    const sections = _lootSectionsAtTile(x, y).filter(s => !s.locked);
    for (const s of sections) {
      // Iterate a snapshot so splices don't shift the live slots.
      const stacks = s.lootable.slots.slice();
      for (const stack of stacks) {
        if (stack.def?.pickupTo === 'gp') {
          changeGold(stack.qty, { x, y, floatText: true });
          const idx = s.lootable.slots.indexOf(stack);
          if (idx !== -1) s.lootable.remove(idx);
          continue;
        }
        const placed = tryPlaceInInventory(stack);
        if (placed) {
          const idx = s.lootable.slots.indexOf(stack);
          if (idx !== -1) s.lootable.remove(idx);
          logMsg(`Picked up ${stack.icon}`);
          Sound.clink && Sound.clink();
          _onCupcakePickup(stack.icon);
        } else {
          logMsg("Inventory full!");
          // Stop trying — re-render shows what's left.
          break;
        }
      }
      _afterLootMutation(s.lootable);
    }
  };

  function _findLootableById(id) {
    if (typeof zone === 'undefined') return null;
    for (const e of zone.entities) {
      if (e && e.id === id && typeof Lootable !== 'undefined' && e instanceof Lootable) return e;
    }
    for (const c of zone.corpses) {
      if (c && c.lootable && c.lootable.id === id) return c.lootable;
    }
    return null;
  }

  function _afterLootMutation(lootable) {
    // Floor piles auto-removed when empty — leftover empty pile is
    // visual clutter. Corpse-owned lootables stay (corpse will scatter
    // on its own decay).
    if (lootable.ownerKind === 'floor' && lootable.size() === 0) {
      zone.removeLootable(lootable);
    }
    renderQuickslots();
    renderInventory();
    updateUI();
    drawMap();
    _renderLootPopup();
  }

  window.toggleMoreActions = () => {
    const el = document.getElementById('more-actions-modal');
    if(!el) return;
    const opening = el.style.display !== 'block';
    el.style.display = opening ? 'block' : 'none';
    // Opening the more-actions ring dismisses the loot popup (both
    // are HUD overlays — only one should be vying for attention).
    if (opening && typeof window.hideLootPopup === 'function') window.hideLootPopup();
  };

  window.quickSave = () => {
    if(typeof saveGame === 'function') saveGame();
  };

  window.hideOverlay = () => {
    if(window.Sound && Sound.stopVoice) Sound.stopVoice();
    document.getElementById('overlay').style.display = 'none';
  };
  window.showOverlay = () => {
    if (typeof window.hideLootPopup === 'function') window.hideLootPopup();
    document.getElementById('overlay').style.display = 'flex';
  };

  window.startNewGame = () => {
    toggleModal('menu-modal');
    toggleModal('class-modal');
    // Initialize class videos from asset bundle
    if(typeof initClassVideos === 'function') {
      setTimeout(initClassVideos, 100); // Small delay to ensure modal is visible
    }
  };

  window.selectClass = (className) => {
    player.startingClass = className;
    switch(className) {
      case 'fighter':
        player.maxHp += 5;
        player.hp = player.maxHp;
        player.baseDmg += 2;
        player.hitRate += 0.05;
        addToInventory('sword');
        break;
      case 'rogue':
        player.dodgeRate += 0.05;
        player.critRate += 0.05;
        addToInventory('sword');
        break;
      case 'spellcaster':
        player.maxMp += 10;
        player.mp = player.maxMp;
        player.spellDmgBonus += 2;
        // Was '📜' (Certified Pastafarian per LEGACY_ITEM_DATA — useless item).
        // Likely a legacy bug; addToInventory is undefined so this branch
        // is dead anyway. Migration just removes the emoji literal.
        addToInventory('certifiedPastafarian');
        break;
    }
    toggleModal('class-select-modal');
    logMsg(`You have chosen the ${className} class!`);
    if(window.currentLevel === undefined || currentLevel === 0) {
      generateMap(1);
    }
    updateUI();
  };

  document.addEventListener('mousedown', (e) => {
    const header = e.target.closest('.modal-header');
    const logBody = e.target.closest('#log-body');
    if(header) {
      isDragging = true; activeModal = header.closest('.draggable-modal');
      let rect = activeModal.getBoundingClientRect();
      dragOffset = {x: e.clientX - rect.left, y: e.clientY - rect.top};
    } else if(logBody) {
      isDragging = true; activeModal = document.getElementById('log-overlay');
      let rect = activeModal.getBoundingClientRect();
      dragOffset = {x: e.clientX - rect.left, y: e.clientY - rect.top};
    }
  });
  document.addEventListener('mousemove', (e) => {
    if(isDragging && activeModal) {
      let newLeft = e.clientX - dragOffset.x;
      let newTop = e.clientY - dragOffset.y;
      // Clamp so title bar stays on screen
      const maxLeft = window.innerWidth - 60;
      const maxTop = window.innerHeight - 30;
      newLeft = Math.max(-10, Math.min(maxLeft, newLeft));
      newTop = Math.max(0, Math.min(maxTop, newTop));
      activeModal.style.left = newLeft + 'px';
      activeModal.style.top = newTop + 'px';
    }
  });
  document.addEventListener('mouseup', () => { isDragging = false; activeModal = null; });

  // Updates the "selected item" name shown beside each modal's title.
  // Reads window._stickyDrag and resolves the current ItemDef's displayName.
  // Both inventory and equip modal headers carry a sibling span; we write
  // into both so whichever modal is currently visible shows the selection.
  function _updateSelectedNameLabels() {
    const invLbl = document.getElementById('inv-selected-name');
    const eqLbl  = document.getElementById('eq-selected-name');
    const drag = window._stickyDrag;
    let name = '';
    if (drag) {
      if (drag.source === 'inv') {
        const stack = inventory[drag.idx];
        name = stack ? (stack.def?.displayName ?? stack.itemName ?? stack.icon ?? '') : '';
      } else if (drag.source === 'equip') {
        const itemName = player.equipped[drag.slot];
        const def = itemName ? ItemDefs[itemName] : null;
        name = def?.displayName ?? itemName ?? '';
      }
    }
    const text = name ? `· ${name}` : '';
    if (invLbl) invLbl.textContent = text;
    if (eqLbl)  eqLbl.textContent  = text;
  }
  window._updateSelectedNameLabels = _updateSelectedNameLabels;

  // === Inventory Rendering ===
  window.renderQuickslots = () => {
    const grid = document.getElementById('quickslots-grid'); if(!grid) return;
    grid.innerHTML = '';
    for(let i=0; i<player.quickslotCount; i++) {
      let item = inventory[i], slot = document.createElement('div');
      slot.className = isIdentifying ? 'inv-slot selected' : 'inv-slot';
      // Sticky-tap drop target: tap completes a pending sticky-drag move
      // onto inventory[i]. Quickslots NEVER initiate a sticky-drag (the
      // user's existing tap-to-use behavior is preserved when no sticky
      // selection is active).
      if (window._stickyDrag && window._stickyDrag.source === 'inv' && window._stickyDrag.idx === i) {
        slot.classList.add('sticky-selected');
      }
      slot.draggable = item ? true : false;
      if(item) slot.addEventListener('dragstart', (e) => handleDragStart(e, 'inv', i));
      slot.addEventListener('dragover', allowDrop);
      slot.addEventListener('drop', (e) => handleDropItem(e, 'inv', i));
      slot.innerHTML = `<span class="hotkey">${i===9?0:i+1}</span>`;
      if(item) {
        slot.innerHTML += item.icon;
        if(item.qty > 1) slot.innerHTML += `<span class="qty">${item.qty}</span>`;
        // E13: Green border glow for items with status effects
        const hasEffect = itemHasStatusEffect(item.icon);
        const isIdentified = player.identifiedItems && player.identifiedItems.has(item.icon);
        if(hasEffect) {
          slot.style.outline = '2px solid #0f8';
          if(!isIdentified) slot.title = (item.def?.displayName ?? item.icon) + ' [Unidentified effects]';
        }
      }
      slot.onclick = () => {
        if (handleStickyTap('inv', i)) return;
        if(item && item.def && item.def.type === 'bag') return;
        handleItemClick(i);
      };
      // #35: Double-click to use item directly
      slot.ondblclick = () => { if(item) handleItemClick(i); };
      // Bug 27: Right-click for Use/Drop popup
      slot.oncontextmenu = (e) => { e.preventDefault(); showItemContextMenu(i, e); };
      grid.appendChild(slot);
    }
  };

  // Bug 27: Right-click context menu for inventory items
  window.showItemContextMenu = (idx, e) => {
    let item = inventory[idx];
    if(!item) return;
    let existing = document.getElementById('item-ctx-menu');
    if(existing) existing.remove();
    let menu = document.createElement('div');
    menu.id = 'item-ctx-menu';
    menu.style.cssText = `position:fixed; z-index:9999; background:rgba(29,27,32,0.95); border:2px solid var(--secondary);
      border-radius:6px; padding:4px 0; min-width:140px; box-shadow:0 4px 12px rgba(0,0,0,0.5);`;
    let name = item.def?.displayName ?? item.icon;
    const def = item.def;
    const canEquip = def && (def.slot || def.type === 'weapon' || def.type === 'armor');
    const freeInventory = inventory.findIndex(s => s === null);
    menu.innerHTML = `
      <div style="padding:4px 12px; color:var(--primary); font-size:11px; border-bottom:1px solid #444; margin-bottom:2px;">${item.icon} ${name}</div>
      <div style="padding:6px 12px; cursor:pointer; font-size:12px;" onmouseover="this.style.background='#4A4458'" onmouseout="this.style.background=''"
        onclick="handleItemClick(${idx}); document.getElementById('item-ctx-menu')?.remove();">Use</div>
      ${canEquip ? `<div style="padding:6px 12px; cursor:pointer; font-size:12px;" onmouseover="this.style.background='#4A4458'" onmouseout="this.style.background=''"
        onclick="swapEquip(${idx}, '${def.slot || 'leftHand'}'); document.getElementById('item-ctx-menu')?.remove();">Equip</div>` : ''}
      ${freeInventory !== -1 ? `<div style="padding:6px 12px; cursor:pointer; font-size:12px;" onmouseover="this.style.background='#4A4458'" onmouseout="this.style.background=''"
        onclick="tryPlaceInInventory(inventory[${idx}]); inventory[${idx}]=null; renderQuickslots(); renderInventory(); document.getElementById('item-ctx-menu')?.remove();">Move to Inventory</div>` : ''}
      <div style="padding:6px 12px; cursor:pointer; font-size:12px; color:var(--error);" onmouseover="this.style.background='#4A4458'" onmouseout="this.style.background=''"
        onclick="dropItemFromCtx(${idx}); document.getElementById('item-ctx-menu')?.remove();">Drop</div>`;
    menu.style.left = Math.min(e.clientX, window.innerWidth - 150) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - 120) + 'px';
    document.body.appendChild(menu);
    setTimeout(() => {
      document.addEventListener('click', function closeCtx() { menu.remove(); document.removeEventListener('click', closeCtx); });
    }, 50);
  };

  window.dropItemFromCtx = (idx) => {
    let item = inventory[idx];
    if(!item) return;
    zone.dropAt(player.x, player.y, new ItemStack(item.itemName, item.qty ?? 1));
    inventory[idx] = null;
    logMsg(`Dropped ${item.icon} on the ground.`);
    renderQuickslots(); updateUI();
  };

  window.handleInventoryClick = (i) => {
    if(dropMode) { zone.dropAt(player.x, player.y, new ItemStack(inventory[i].itemName, 1)); decrementInventory(i); dropMode = false; renderInventory(); return; }
    if(inventory[i]) logMsg(`Inventory[${i}]: ${inventory[i].def?.name || inventory[i].icon}`);
  };

  // Tap-on-bag handler: completes a pending sticky-drag if one's
  // active (drops the carried item INTO this bag's slot space — for
  // top-level inv bags, completion goes to the bag's first empty
  // contents slot). Otherwise toggles select+open per the design:
  //   not selected → select for sticky AND toggle open state
  //   already selected → deselect, leave open state alone
  window.handleBagInvTap = (invIdx) => {
    const bag = inventory[invIdx];
    if (!bag || bag.def?.type !== 'bag') return;
    const drag = window._stickyDrag;
    // Pending drag from somewhere else → drop into this bag's first
    // empty contents slot. (Tap on a SPECIFIC inner slot is handled
    // by the inner-slot handler, not here.)
    if (drag) {
      const isSameInvSlot = (drag.source === 'inv' && drag.idx === invIdx);
      if (!isSameInvSlot) {
        const c = window._bagSlots(bag);
        const emptyIdx = c.findIndex(s => s === null || s === undefined);
        if (emptyIdx === -1) {
          if (typeof logMsg === 'function') logMsg(`<span style='color:var(--warning)'>The bag is full.</span>`);
          return;
        }
        return window.handleStickyTap('bag', emptyIdx, bag);
      }
      // Same-tap deselect (no open toggle).
      return window.handleStickyTap('inv', invIdx);
    }
    // No pending drag → select+toggle-open.
    if (window._openBags.has(bag)) window._openBags.delete(bag);
    else                           window._openBags.add(bag);
    window.startStickyDrag('inv', invIdx);
  };

  // Same toggle for a bag that lives INSIDE another bag (nested).
  window.handleBagBagTap = (parentBag, slotIdx) => {
    const bag = (parentBag.slots || [])[slotIdx];
    if (!bag || bag.def?.type !== 'bag') return;
    const drag = window._stickyDrag;
    if (drag) {
      const isSameBagSlot = (drag.source === 'bag' && drag.bagRef === parentBag && drag.slotIdx === slotIdx);
      if (!isSameBagSlot) {
        const c = window._bagSlots(bag);
        const emptyIdx = c.findIndex(s => s === null || s === undefined);
        if (emptyIdx === -1) {
          if (typeof logMsg === 'function') logMsg(`<span style='color:var(--warning)'>The bag is full.</span>`);
          return;
        }
        return window.handleStickyTap('bag', emptyIdx, bag);
      }
      return window.handleStickyTap('bag', slotIdx, parentBag);
    }
    if (window._openBags.has(bag)) window._openBags.delete(bag);
    else                           window._openBags.add(bag);
    window.startStickyDrag('bag', slotIdx, parentBag);
  };

  // ─── Inventory rendering (Phase: inline open bags) ─────────
  //
  // The inventory modal renders the 30-slot inventory as a wrap-flowed
  // sequence of cells. When a bag is "open" (its ItemStack lives in
  // window._openBags), its contents inline right after the bag's own
  // cell with a tinted background so the player sees bag + interior
  // as one connected group. Open bags can nest — depth tints darken
  // slightly. Modal grows vertically to fit.
  window.renderInventory = () => {
    const grid = document.getElementById('inventory-grid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let i = 0; i < 30; i++) {
      _appendInvSlot(grid, i);
    }
  };

  // Render a single inventory slot, and (recursively) its bag contents
  // if the slot holds an open bag.
  function _appendInvSlot(grid, invIdx) {
    const item = inventory[invIdx];
    const isBag = !!(item && item.def && item.def.type === 'bag');
    const isOpenBag = isBag && window._openBags.has(item);
    const cell = _makeInvCell({
      item,
      onTap:    () => _onInvSlotTap(invIdx),
      tintDepth: isOpenBag ? 0 : -1,
      stickySelected: !!(window._stickyDrag &&
        window._stickyDrag.source === 'inv' &&
        window._stickyDrag.idx === invIdx),
    });
    grid.appendChild(cell);
    if (isOpenBag) _appendBagContents(grid, item, 1);
  }

  // Render every contents-slot of an open bag inline, and recurse for
  // any nested open bags. depth tint brightens the further down we go.
  function _appendBagContents(grid, bag, depth) {
    const c = window._bagSlots(bag);
    for (let k = 0; k < c.length; k++) {
      const inner = c[k];
      const innerIsBag = !!(inner && inner.def && inner.def.type === 'bag');
      const innerIsOpen = innerIsBag && window._openBags.has(inner);
      const cell = _makeInvCell({
        item: inner,
        onTap:    () => _onBagSlotTap(bag, k),
        tintDepth: depth,
        stickySelected: !!(window._stickyDrag &&
          window._stickyDrag.source === 'bag' &&
          window._stickyDrag.bagRef === bag &&
          window._stickyDrag.slotIdx === k),
      });
      grid.appendChild(cell);
      if (innerIsOpen) _appendBagContents(grid, inner, depth + 1);
    }
  }

  // Build a single inv-slot DOM node with shared styling.
  // tintDepth: -1 = normal slot, 0..N = open-bag depth tint band.
  function _makeInvCell({ item, onTap, tintDepth, stickySelected }) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    slot.style.width = '36px'; slot.style.height = '36px';
    slot.style.fontSize = '16px'; slot.style.minWidth = '0';
    slot.style.borderRadius = '6px'; slot.style.margin = '1px';
    if (stickySelected) slot.classList.add('sticky-selected');
    if (tintDepth === 0) slot.classList.add('bag-open');
    else if (tintDepth === 1) slot.classList.add('bag-open-d1');
    else if (tintDepth >= 2) slot.classList.add('bag-open-d2');
    if (item) {
      slot.innerHTML = item.icon;
      if (item.qty > 1) slot.innerHTML += `<span class="qty">${item.qty}</span>`;
      // E13: Green glow for items with status effects
      const hasEffect = itemHasStatusEffect(item.icon);
      const isIdentified = player.identifiedItems && player.identifiedItems.has(item.icon);
      if (hasEffect) {
        slot.style.outline = '2px solid #0f8';
        if (!isIdentified) slot.title = (item.def?.displayName ?? item.icon) + ' [Unidentified effects]';
      } else if (item.def?.displayName) {
        slot.title = item.def.displayName;
      }
    }
    slot.onclick = onTap;
    return slot;
  }

  function _onInvSlotTap(invIdx) {
    const item = inventory[invIdx];
    // Bag-tap is its own handler — toggles open + sticky select.
    if (item && item.def && item.def.type === 'bag') {
      return window.handleBagInvTap(invIdx);
    }
    // Non-bag: standard sticky-tap flow.
    if (window.handleStickyTap('inv', invIdx)) return;
    if (item) window.startStickyDrag('inv', invIdx);
  }

  function _onBagSlotTap(parentBag, slotIdx) {
    const inner = (parentBag.slots || [])[slotIdx];
    if (inner && inner.def && inner.def.type === 'bag') {
      return window.handleBagBagTap(parentBag, slotIdx);
    }
    if (window.handleStickyTap('bag', slotIdx, parentBag)) return;
    if (inner) window.startStickyDrag('bag', slotIdx, parentBag);
  }

  // Legacy stub — call sites still reference renderAttachedBagPanel.
  // The old side-panel was retired; renderInventory now inlines bag
  // contents directly in the main grid. No-op kept so old callers
  // don't ReferenceError; remove in a future cleanup.
  function renderAttachedBagPanel() { /* no-op since side panel removed */ }

  window.handleDragStart = (e, source, idx) => { window.draggedSource = source; window.draggedItemIdx = idx; e.dataTransfer.setData('text/plain', idx); };
  window.allowDrop = (e) => { e.preventDefault(); };

  // Drag any inventory/floor/loot item onto the inventory icon — auto-find open slot
  window.dropToInventory = (e) => {
    e.preventDefault();
    let item = null;
    // B6: From bag panel drag — move item to inventory
    if(window.draggedSource === 'bag' && window._dragBagSource != null && window._dragBagIdx != null) {
      const bagArr = window._dragBagSource === 'inv' ? inventory : inventory;
      const bag = bagArr[window._dragBagIdx];
      const bagSlotIdx = window.draggedItemIdx;
      if(bag && bag.slots && bag.slots[bagSlotIdx]) {
        const bagItem = bag.slots[bagSlotIdx];
        let placed = tryPlaceInInventory(bagItem);
        if(placed) {
          bag.slots[bagSlotIdx] = null;
          logMsg(`${bagItem.icon} stashed in inventory from bag.`);
          if(typeof Sound !== 'undefined') Sound.clink();
        } else {
          logMsg("Inventory and all bags are full!");
        }
      }
      window.draggedItemIdx = null; window.draggedSource = null;
      window._dragBagSource = null; window._dragBagIdx = null;
      renderQuickslots(); renderInventory(); updateUI();
      return;
    }
    // From inventory drag
    if(window.draggedItemIdx !== null && window.draggedSource === 'inv') {
      item = inventory[window.draggedItemIdx];
      if(item) {
        let placed = tryPlaceInInventory(item);
        if(placed) {
          inventory[window.draggedItemIdx] = null;
          logMsg(`${item.icon} stashed in inventory.`);
          Sound.clink();
        } else {
          logMsg("Inventory and all bags are full!");
        }
        window.draggedItemIdx = null; window.draggedSource = null;
        renderQuickslots(); renderInventory(); updateUI();
      }
    }
    // Phase 6: corpse-loot drag handler removed. The popup replaced
    // the drag-from-modal flow; window._lootDrag is no longer set
    // anywhere.
  };
  window.handleDropItem = (e, targetSource, targetIdx) => {
    e.preventDefault();
    // K6: Handle drag FROM an equipped paper doll slot → inventory/inventory slot
    {
      let raw = null;
      try { raw = e.dataTransfer.getData('text/plain'); } catch(_) {}
      if (raw) {
        let dragData = null;
        try { dragData = JSON.parse(raw); } catch(_) {}
        if (dragData && dragData.source === 'equip') {
          const slotName = dragData.slot;
          const equippedName = player.equipped[slotName];   // camelCase name
          const equippedDef  = equippedName ? ItemDefs[equippedName] : null;
          if (equippedName) {
            const tgtArr = targetSource === 'inv' ? inventory : inventory;
            const targetItem = tgtArr[targetIdx];
            if (targetItem === null) {
              // Drop to empty slot — unequip (new stack of qty 1)
              tgtArr[targetIdx] = new ItemStack(equippedName, 1);
              player.equipped[slotName] = null;
              logMsg(`Unequipped ${equippedDef?.displayName || equippedName}.`);
              swapEquip(-1, slotName);
            } else {
              // Swap — check if target item fits the slot
              const targetDef = ItemDefs[targetItem.itemName];
              const fitsSlot = targetDef && (
                (slotName === 'leftHand' && (targetDef.type === 'weapon' || targetDef.slot === 'leftHand')) ||
                (slotName === 'rightHand' && (targetDef.type === 'weapon' || targetDef.slot === 'rightHand')) ||
                (targetDef.slot === slotName)
              );
              if (fitsSlot) {
                tgtArr[targetIdx] = new ItemStack(equippedName, 1);
                player.equipped[slotName] = targetItem.itemName;
                logMsg(`Swapped ${equippedDef?.displayName || equippedName} with ${targetDef?.displayName || targetItem.itemName}.`);
                swapEquip(-1, slotName);
              } else {
                logMsg(`${targetDef?.name || targetItem.icon} doesn't fit the ${slotName} slot.`);
                return;
              }
            }
            updateUI();
            renderEquipModal();
          }
          return;
        }
      }
    }
    // B6: Handle drag from bag panel slot → inventory/inventory slot
    if(window.draggedSource === 'bag' && window._dragBagSource != null && window._dragBagIdx != null) {
      const bagArr = window._dragBagSource === 'inv' ? inventory : inventory;
      const bag = bagArr[window._dragBagIdx];
      const bagSlotIdx = window.draggedItemIdx;
      if(bag && bag.slots && bag.slots[bagSlotIdx]) {
        const bagItem = bag.slots[bagSlotIdx];
        const tgtArr = targetSource === 'inv' ? inventory : inventory;
        const displaced = tgtArr[targetIdx];
        tgtArr[targetIdx] = new ItemStack(bagItem.itemName, bagItem.qty ?? 1);
        // Put displaced item (if any) into the bag slot we dragged from
        bag.slots[bagSlotIdx] = displaced ? new ItemStack(displaced.itemName, displaced.qty ?? 1) : null;
        logMsg(`${bagItem.icon} moved from bag to ${targetSource}.`);
        if(typeof Sound !== 'undefined') Sound.clink();
      }
      window.draggedItemIdx = null; window.draggedSource = null;
      window._dragBagSource = null; window._dragBagIdx = null;
      renderQuickslots(); renderInventory(); updateUI();
      return;
    }
    // Handle loot drag from corpse window → inventory/inventory slot
    // Phase 6: corpse-loot drag-onto-inventory-slot retired with the
    // modal. Popup is the loot entry point.
    if(window.draggedItemIdx !== null && window.draggedSource !== null) {
      let srcArr = window.draggedSource === 'inv' ? inventory : inventory;
      let tgtArr = targetSource === 'inv' ? inventory : inventory;
      let tgtItem = tgtArr[targetIdx];
      let srcItem = srcArr[window.draggedItemIdx];
      // Bug 33: If target slot has a bag, try to add dragged item into the bag
      if(tgtItem && srcItem && tgtItem.def && tgtItem.def.type === 'bag') {
        let bagDef = tgtItem.def;
        if(!tgtItem.slots) tgtItem.slots = new Array(bagDef.bagSlots ?? 3).fill(null);
        let freeSlot = tgtItem.slots.findIndex(s => s === null);
        if(freeSlot !== -1) {
          tgtItem.slots[freeSlot] = new ItemStack(srcItem.itemName, srcItem.qty ?? 1);
          srcArr[window.draggedItemIdx] = null;
          logMsg(`${srcItem.icon} placed into ${bagDef.name}.`);
          Sound.clink();
          window.draggedItemIdx = null; window.draggedSource = null;
          renderQuickslots(); renderInventory(); updateUI();
          return;
        }
      }
      // Bug 34: If same icon and stackable, merge up to maxStack
      if(tgtItem && srcItem && tgtItem.itemName === srcItem.itemName) {
        let def = tgtItem.def;
        if(def && def.stackable) {
          let maxStack = def.maxStack ?? 10;
          let canAdd = maxStack - (tgtItem.qty ?? 1);
          if(canAdd > 0) {
            let toMove = Math.min(canAdd, srcItem.qty ?? 1);
            tgtItem.qty = (tgtItem.qty ?? 1) + toMove;
            srcItem.qty = (srcItem.qty ?? 1) - toMove;
            if(srcItem.qty <= 0) srcArr[window.draggedItemIdx] = null;
            window.draggedItemIdx = null; window.draggedSource = null;
            renderQuickslots(); renderInventory(); updateUI();
            return;
          }
        }
      }
      let temp = tgtArr[targetIdx]; tgtArr[targetIdx] = srcArr[window.draggedItemIdx]; srcArr[window.draggedItemIdx] = temp;
      window.draggedItemIdx = null; window.draggedSource = null;
      renderQuickslots(); renderInventory(); updateUI();
    }
  };

  window.handleDrop = (e, slot) => {
    e.preventDefault();
    // #31: Allow drag from either inventory or inventory to equip slot
    if(window.draggedItemIdx !== null && (window.draggedSource === 'inv' || window.draggedSource === 'inventory')) {
      if(window.draggedSource === 'inventory') {
        // Move from inventory to inventory temp slot, then equip
        let inventoryItem = inventory[window.draggedItemIdx];
        if(inventoryItem) {
          let freeInv = inventory.findIndex(s => s === null);
          if(freeInv !== -1) {
            inventory[freeInv] = inventoryItem;
            inventory[window.draggedItemIdx] = null;
            swapEquip(freeInv, slot);
          } else {
            logMsg("Inventory full — can't equip from inventory.");
          }
        }
      } else {
        swapEquip(window.draggedItemIdx, slot);
      }
      window.draggedItemIdx = null; window.draggedSource = null;
    }
  };

  // === K6: Equipment paper doll drag-to-unequip / slot-swap ===

  // Helper to refresh equip modal slots after K6 drag operations
  window.renderEquipModal = function() {
    updateUI();
  };

  // Called when dragging an equipped item OUT of a paper doll slot
  window.equipSlotDragStart = function(event, slotName) {
    if (!player.equipped[slotName]) return;
    event.dataTransfer.setData('text/plain', JSON.stringify({
      source: 'equip',
      slot: slotName,
      itemName: player.equipped[slotName]   // camelCase name (post-icon-migration)
    }));
    event.dataTransfer.effectAllowed = 'move';
  };

  // Allow dragging inventory/inventory items INTO a paper doll slot
  window.equipSlotDragOver = function(event, slotName) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  // Handle a drop onto a paper doll equip slot
  window.equipSlotDrop = function(event, slotName) {
    event.preventDefault();

    // Determine drag source — prefer JSON dataTransfer, fall back to global vars
    let srcArr = null;
    let fromIdx = null;

    let raw = null;
    try { raw = event.dataTransfer.getData('text/plain'); } catch(_) {}
    let dragData = null;
    if (raw) { try { dragData = JSON.parse(raw); } catch(_) {} }

    if (dragData && (dragData.source === 'inventory' || dragData.source === 'inventory')) {
      // Explicit JSON source (future-proof / from new drag start format)
      // Both source labels now refer to slots in the same inventory array
      // (quickslot row vs bag panel are two views of the same storage).
      srcArr = inventory;
      fromIdx = dragData.idx;
    } else if (window.draggedItemIdx !== null && (window.draggedSource === 'inv' || window.draggedSource === 'inventory')) {
      // Legacy global variable drag system — same unification as above.
      srcArr = inventory;
      fromIdx = window.draggedItemIdx;
    } else {
      // Nothing we can handle
      return;
    }

    const item = srcArr[fromIdx];
    if (!item) return;
    const def = item.def;
    if (!def) return;

    // Check slot compatibility
    const fits = (slotName === 'leftHand' && (def.type === 'weapon' || def.slot === 'leftHand')) ||
                 (slotName === 'rightHand' && (def.type === 'weapon' || def.slot === 'rightHand')) ||
                 (def.slot === slotName);
    if (!fits) { logMsg(`${def.name} doesn't fit the ${slotName} slot.`); return; }

    // Swap currently equipped item back into source array slot
    const currentEquipped = player.equipped[slotName];  // camelCase name
    if (currentEquipped) {
      srcArr[fromIdx] = new ItemStack(currentEquipped, 1);
    } else {
      srcArr[fromIdx] = null;
    }
    player.equipped[slotName] = item.itemName;
    logMsg(`Equipped ${def.name}.`);
    swapEquip(-1, slotName);
    window.draggedItemIdx = null; window.draggedSource = null;
    updateUI();
    renderEquipModal();
  };

  // === Stats and Talents (v7.2.0) ===
  
  // Stat descriptions and what each stat gives per point
  // ── KELCH MERGE: Direct stat system (replaces str/dex/int/con/wis) ──
  const STAT_INFO = {
    maxHp: { name: 'Max HP', desc: 'Damage player can take before dying. (+2)' },
    maxMp: { name: 'Max MP', desc: 'Mana points to cast spells. (+1)' },
    meleeDmgBonus: { name: 'Melee Damage Bonus', desc: 'Damage added to melee attacks. (+1 for 5 pts.)' },
    rangedDmgBonus: { name: 'Ranged Damage Bonus', desc: 'Damage added to ranged attacks. (+1 for 5 pts.)' },
    spellDmgBonus: { name: 'Spell Damage Bonus', desc: 'Damage added to spell attacks. (+1 for 5 pts.)' },
    hitRate: { name: 'Hit Rate', desc: 'Chance to-hit. (+5%)' },
    critRate: { name: 'Crit Rate', desc: 'Chance hit will be critical (x1.5 damage). (+5%)' },
    dodgeRate: { name: 'Dodge Rate', desc: 'Chance player dodges a hit. (+3%)' },
  };

  // Compute what a +1 to a stat would give as a preview string
  window._statPreview = (stat) => {
    switch(stat) {
      case 'maxHp': return '+2';
      case 'maxMp': return '+1';
      case 'meleeDmgBonus': return '+1 for 5 pts';
      case 'rangedDmgBonus': return '+1 for 5 pts';
      case 'spellDmgBonus': return '+1 for 5 pts';
      case 'hitRate': return '+5%';
      case 'critRate': return '+5%';
      case 'dodgeRate': return '+3%';
      default: return '';
    }
  };

  // #29: Modal z-index manager — clicking/focusing brings modal to front
  window._modalZBase = 100;
  window._modalZTop = 100;
  window.bringToFront = (el) => {
    window._modalZTop++;
    el.style.zIndex = window._modalZTop;
  };
  document.querySelectorAll('.draggable-modal').forEach(modal => {
    modal.addEventListener('mousedown', () => bringToFront(modal));
  });

  // Modal open helper — also brings to front
  const _origToggleModal = window.toggleModal;
  window.toggleModal = (id) => {
    if(_origToggleModal) _origToggleModal(id);
    const el = document.getElementById(id);
    if(el && el.style.display !== 'none') bringToFront(el);
  };

  // Tab switching for the Stats/Talents modal. The Talents tab is
  // currently a placeholder (its body says so) — selecting it just
  // toggles which panel is visible; there is no showTalents() to
  // call until the new talent system lands.
  window.showStatsTab = (tab) => {
    const statsPanel = document.getElementById('stats-tab-panel');
    const talentsPanel = document.getElementById('talents-tab-panel');
    const btnStats = document.getElementById('tab-btn-stats');
    const btnTalents = document.getElementById('tab-btn-talents');
    if(!statsPanel || !talentsPanel) return;
    if(tab === 'stats') {
      statsPanel.style.display = 'block';
      talentsPanel.style.display = 'none';
      if(btnStats) { btnStats.style.background = 'var(--secondary)'; btnStats.style.color = '#fff'; }
      if(btnTalents) { btnTalents.style.background = 'var(--surface-container)'; btnTalents.style.color = '#aaa'; }
      showStats();
    } else {
      statsPanel.style.display = 'none';
      talentsPanel.style.display = 'block';
      if(btnStats) { btnStats.style.background = 'var(--surface-container)'; btnStats.style.color = '#aaa'; }
      if(btnTalents) { btnTalents.style.background = 'var(--secondary)'; btnTalents.style.color = '#fff'; }
      showTalents();
    }
  };

  // Pending stat allocation (for multi-point spending workflow)
  let _pendingStat = null;
  let _pendingStatAmount = 1;

  window.allocateStat = (stat) => {
    if(player.statPoints <= 0) return;
    _pendingStat = stat;
    _pendingStatAmount = (stat === 'meleeDmgBonus' || stat === 'rangedDmgBonus' || stat === 'spellDmgBonus' ? 5 : 1);
    const info = STAT_INFO[stat];
    let previewDiv = document.getElementById('stat-preview-bar');
    if(!previewDiv) return;
    const maxSpend = player.statPoints;
    const _renderPreview = () => {
      const amt = _pendingStatAmount;
      // Build effect preview string for N points
      let effects = [];
      switch(stat) {
        case 'maxHp': effects.push(`+2 Max HP`); break;
        case 'maxMp': effects.push(`+1 Max MP`); break;
        case 'meleeDmgBonus': effects.push(`+1 Melee Damage`); break;
        case 'rangedDmgBonus': effects.push(`+1 Ranged Damage`); break;
        case 'spellDmgBonus': effects.push(`+1 Spell Damage`); break;
        case 'hitRate': effects.push(`+5% Hit Rate`); break;
        case 'critRate': effects.push(`+5% Crit Rate`); break;
        case 'dodgeRate': effects.push(`+3% Dodge Rate`); break;
      }
      previewDiv.innerHTML = `
        <div style="background:rgba(208,188,255,0.1); border:1px solid var(--primary); border-radius:6px; padding:8px 12px; margin-top:6px;">
          <div style="font-size:11px; color:var(--primary);">Allocate points to ${info.name}</div>
          <div style="display:flex; align-items:center; gap:8px; margin:6px 0;">
            <span style="font-size:16px; font-weight:bold; color:var(--primary); min-width:24px; text-align:center;">${amt}</span>
            <span style="font-size:10px; color:#888;">(of ${maxSpend} available)</span>
          </div>
          <div style="font-size:12px; color:var(--success);">${effects.join(', ')}</div>
          <div style="display:flex; gap:8px; margin-top:6px;">
            <button onclick="confirmStatAlloc()" style="background:var(--success); color:#000; font-weight:bold; border:none; padding:4px 12px; border-radius:4px; cursor:pointer; font-size:12px;">✓ Confirm (${amt} pt${amt>1?'s':''})</button>
            <button onclick="cancelStatAlloc()" style="background:var(--error); color:#000; font-weight:bold; border:none; padding:4px 12px; border-radius:4px; cursor:pointer; font-size:12px;">✗ Cancel</button>
          </div>
        </div>`;
    };
    _renderPreview();
  };

  window.confirmStatAlloc = () => {
    if(!_pendingStat) return;
    const stat = _pendingStat;
    const amt = Math.min(_pendingStatAmount, player.statPoints);
    // ── KELCH MERGE: Direct stat allocation ──
    player.statPoints -= amt;
    switch(stat) {
      case 'maxHp': player.maxHp += 2; player.hp += 2; break;
      case 'maxMp': player.maxMp += 1; player.mp += 1;
        if(typeof addFloatingText === 'function') addFloatingText(player.x, player.y, '+1 MP', '#4af', 15);
        break;
      case 'meleeDmgBonus': player.meleeDmgBonus += 1; break;
      case 'rangedDmgBonus': player.rangedDmgBonus += 1; break;
      case 'spellDmgBonus': player.spellDmgBonus += 1; break;
      case 'hitRate': player.hitRate += 0.05; break;
      case 'critRate': player.critRate += 0.05; break;
      case 'dodgeRate': player.dodgeRate += 0.03; break;
    }
    _pendingStat = null;
    _pendingStatAmount = (stat === 'meleeDmgBonus' || stat === 'rangedDmgBonus' || stat === 'spellDmgBonus' ? 5 : 1);
    showStats(); updateUI();
  };

  window.cancelStatAlloc = () => {
    _pendingStat = null;
    _pendingStatAmount = (stat === 'meleeDmgBonus' || stat === 'rangedDmgBonus' || stat === 'spellDmgBonus' ? 5 : 1);
    showStats();
  };

  window.exchangeAPforTP = () => {
    if ((player.statPoints ?? 0) < 3) return;
    player.statPoints -= 3;
    player.talentPoints = (player.talentPoints ?? 0) + 1;
    logMsg && logMsg(`Exchanged 3 AP for 1 TP. (TP: ${player.talentPoints}, AP: ${player.statPoints})`);
    showStats(); updateUI();
  };

  // ── Talents pane ────────────────────────────────────────────
  // Filter/sort state survives across re-renders. The menu open
  // flag is also state (toggled by ☰ click).
  window._talentFilters = window._talentFilters || {
    maxed:       true,
    improvable:  true,
    needTP:      true,
    unavailable: false,   // hidden by default per spec
    sort:        'hier',  // 'hier' | 'alpha'
    usableTop:   false,
  };
  window._talentMenuOpen = false;

  // ── Model-layer thin shims ─────────────────────────────────
  // The predicates live on Player (entities.js) so they can be tested
  // without DOM. These shims keep the call sites below terse.
  const _buyVerdict     = (id) => player.buyVerdict(id);
  const _classifyTalent = (id) => player.classifyTalent(id);

  // ── Sorting ─────────────────────────────────────────────────
  function _alphaSort(ids) {
    return ids.slice().sort((a, b) =>
      TALENT_DEFS[a].name.localeCompare(TALENT_DEFS[b].name));
  }
  function _hierSort(ids) {
    const set = new Set(ids);
    const childrenOf = { __root__: [] };
    for (const id of ids) {
      const def = TALENT_DEFS[id];
      const reqId = def.requires ? Object.keys(def.requires)[0] : null;
      const parent = (reqId && set.has(reqId)) ? reqId : '__root__';
      (childrenOf[parent] = childrenOf[parent] || []).push(id);
    }
    for (const k of Object.keys(childrenOf)) {
      childrenOf[k].sort((a, b) =>
        TALENT_DEFS[a].name.localeCompare(TALENT_DEFS[b].name));
    }
    const out = [];
    (function dfs(p) {
      for (const c of childrenOf[p] || []) { out.push(c); dfs(c); }
    })('__root__');
    return out;
  }
  function _applyUsableTop(ids) {
    const u = [], t = [], r = [];
    for (const id of ids) {
      const f = TALENT_DEFS[id].flags || [];
      if      (f.includes('use'))    u.push(id);
      else if (f.includes('toggle')) t.push(id);
      else                            r.push(id);
    }
    return [...u, ...t, ...r];
  }

  // ── Filter ──────────────────────────────────────────────────
  function _selectVisibleTalents() {
    const f = window._talentFilters;
    const out = [];
    for (const id of Object.keys(TALENT_DEFS)) {
      const def = TALENT_DEFS[id];
      if (def.tbi) continue;
      const cls = _classifyTalent(id);
      if (cls == null) continue;
      if (!f[cls]) continue;
      out.push(id);
    }
    return out;
  }

  // ── Action: buy / improve ───────────────────────────────────
  window.buyTalent = (id) => {
    const def = TALENT_DEFS[id];
    if (!def) return;
    const ownedLvl = (player.talents[id] && player.talents[id].level) || 0;
    const v = _buyVerdict(id);
    if (!v.allowed) {
      logMsg && logMsg(v.reason === 'maxed' ? `${def.name} is maxed.` : `Prereq not met for ${def.name}.`);
      return;
    }
    if ((player.talentPoints || 0) < v.cost) {
      logMsg && logMsg(`Need ${v.cost} TP for ${def.name}.`); return;
    }
    player.talentPoints -= v.cost;
    if (!player.talents[id]) player.talents[id] = { level: 0 };
    player.talents[id].level = ownedLvl + 1;
    logMsg && logMsg(`<span style='color:var(--success)'>Acquired ${def.name} (rank ${player.talents[id].level}). −${v.cost} TP.</span>`);
    showTalents(); updateUI();
  };

  // ── Stubs for use/toggle (engine wiring lands per-talent) ───
  window.useTalent = (id) => {
    logMsg && logMsg(`${TALENT_DEFS[id]?.name || id}: use action TBI.`);
  };
  window.toggleTalentFlag = (id) => {
    const owned = player.talents[id];
    if (!owned) return;
    owned.on = !owned.on;
    logMsg && logMsg(`${TALENT_DEFS[id].name}: ${owned.on ? 'on' : 'off'}.`);
    showTalents();
  };

  // ── Filter / sort handlers ──────────────────────────────────
  function _isShowAll() {
    const f = window._talentFilters;
    return f.maxed && f.improvable && f.needTP && f.unavailable;
  }
  window.toggleTalentFilter = (key) => {
    const f = window._talentFilters;
    if (key === 'all') {
      const on = _isShowAll();
      f.maxed = f.improvable = f.needTP = f.unavailable = !on;
    } else {
      f[key] = !f[key];
    }
    showTalents();
  };
  window.setTalentSort = (sort) => {
    window._talentFilters.sort = sort;
    showTalents();
  };
  window.toggleUsableTop = () => {
    window._talentFilters.usableTop = !window._talentFilters.usableTop;
    showTalents();
  };
  window.toggleTalentMenu = () => {
    window._talentMenuOpen = !window._talentMenuOpen;
    showTalents();
  };

  // ── Rendering ───────────────────────────────────────────────
  const _BUCKET_BG = {
    maxed:       '#1d3a1d',
    improvable:  '#1a3346',
    needTP:      '#2a2a2a',
    unavailable: '#3a322a',
  };

  function _renderTalentRow(id) {
    const def = TALENT_DEFS[id];
    const owned = player.talents[id];
    const ownedLvl = (owned && owned.level) || 0;
    const cls = _classifyTalent(id);
    const flags = def.flags || [];

    // Left-side controls — only meaningful once owned.
    let leftCtrl = '';
    if (ownedLvl > 0 && flags.includes('use')) {
      leftCtrl = `<button onclick="useTalent('${id}')" style="background:var(--secondary); color:#fff; border:none; border-radius:3px; padding:2px 8px; font-size:11px; cursor:pointer;">Use</button>`;
    } else if (ownedLvl > 0 && flags.includes('toggle')) {
      const on = !!(owned && owned.on);
      leftCtrl = `<button onclick="toggleTalentFlag('${id}')" title="Toggle ${def.name}" style="background:transparent; color:#ccc; border:1px solid #666; border-radius:3px; padding:2px 6px; font-size:11px; cursor:pointer;">${on ? '☑' : '☐'}</button>`;
    }

    // Right-side action / cost / prereq parenthetical.
    let rightCtrl = '';
    if (cls === 'maxed') {
      rightCtrl = `<span style="color:#9c9;">(maxed)</span>`;
    } else if (cls === 'unavailable') {
      const reqId = Object.keys(def.requires)[0];
      const reqRank = def.requires[reqId];
      const reqDef = TALENT_DEFS[reqId];
      const reqLabel = reqDef ? reqDef.name : reqId;
      const rankPart = reqRank > 1 ? ` ×${reqRank}` : '';
      rightCtrl = `<span style="color:#bba88f;">(requires ${reqLabel}${rankPart})</span>`;
    } else {
      const v = _buyVerdict(id);
      const cost = v.cost;
      const action = ownedLvl === 0 ? 'Buy' : 'Improve';
      // JoaT: the verdict carries a viaJoaT flag when prereq was
      // bypassed (and cost was doubled). Surface that to the player.
      const joatNote = v.viaJoaT
        ? ' <span style="color:#dc9; font-size:10px;">(JoaT 2×)</span>' : '';
      if (cls === 'improvable') {
        rightCtrl = `(<button onclick="buyTalent('${id}')" style="background:var(--primary); color:#000; border:none; border-radius:3px; padding:1px 8px; font-size:11px; cursor:pointer; font-weight:bold;">${action}</button> for ${cost} TP${joatNote})`;
      } else { // needTP
        rightCtrl = `(<span style="color:#aaa;">${action}</span> for ${cost} TP${joatNote})`;
      }
    }

    // Rank badge for owned (Rank N or N/M).
    const maxLabel = def.cost.max === -1 ? '∞' : def.cost.max;
    const rankBadge = ownedLvl > 0
      ? ` <span style="color:#bbb; font-size:11px;">[${ownedLvl}/${maxLabel}]</span>`
      : '';

    return `
      <div style="background:${_BUCKET_BG[cls]}; border-radius:6px; padding:8px 10px; margin-bottom:6px;">
        <div style="display:flex; align-items:center; gap:8px; font-size:13px;">
          ${leftCtrl}
          <strong style="color:#fff;">${def.name}</strong>${rankBadge}
          <span style="margin-left:auto;">${rightCtrl}</span>
        </div>
        <div style="font-size:11px; color:#ccc; margin-top:5px; line-height:1.35;">${def.desc}</div>
      </div>
    `;
  }

  function _renderTalentMenu() {
    const f = window._talentFilters;
    const display = window._talentMenuOpen ? 'block' : 'none';
    const cb = (key, label) => `
      <label style="display:block; padding:3px 0; cursor:pointer; user-select:none;">
        <input type="checkbox" ${f[key] ? 'checked' : ''} onchange="toggleTalentFilter('${key}')">
        ${label}
      </label>`;
    const radio = (val, label) => `
      <label style="display:block; padding:3px 0; cursor:pointer; user-select:none;">
        <input type="radio" name="talent-sort" ${f.sort === val ? 'checked' : ''} onchange="setTalentSort('${val}')">
        ${label}
      </label>`;
    return `
      <div id="talent-menu" style="display:${display}; position:absolute; right:8px; top:100%;
            background:#1a1a1a; border:1px solid #555; border-radius:6px; padding:8px 12px;
            z-index:1000; min-width:200px; font-size:12px; box-shadow:0 4px 12px rgba(0,0,0,0.6);">
        ${cb('maxed',       'Show maxed')}
        ${cb('improvable',  'Show improvable')}
        ${cb('needTP',      'Show need TP')}
        ${cb('unavailable', 'Show unavailable')}
        <label style="display:block; padding:3px 0; cursor:pointer; user-select:none;">
          <input type="checkbox" ${_isShowAll() ? 'checked' : ''} onchange="toggleTalentFilter('all')">
          <strong>Show all</strong>
        </label>
        <hr style="border-color:#444; margin:6px 0;">
        ${radio('hier',  'Sort hierarchically')}
        ${radio('alpha', 'Sort alphabetically')}
        <hr style="border-color:#444; margin:6px 0;">
        <label style="display:block; padding:3px 0; cursor:pointer; user-select:none;">
          <input type="checkbox" ${f.usableTop ? 'checked' : ''} onchange="toggleUsableTop()">
          Usable at top
        </label>
      </div>
    `;
  }

  window.showTalents = () => {
    const body = document.getElementById('talents-body');
    if (!body) return;
    // Reset placeholder styling — we own the body now.
    body.style.padding   = '0';
    body.style.textAlign = 'left';
    body.style.color     = '#ccc';
    body.style.fontSize  = '12px';

    const tp = player.talentPoints ?? 0;
    let visible = _selectVisibleTalents();
    visible = (window._talentFilters.sort === 'hier') ? _hierSort(visible) : _alphaSort(visible);
    if (window._talentFilters.usableTop) visible = _applyUsableTop(visible);

    const listHtml = visible.length
      ? visible.map(_renderTalentRow).join('')
      : `<em style="color:#888;">No talents to show. Adjust filters in ☰.</em>`;

    body.innerHTML = `
      <div style="position:relative; display:flex; align-items:center; justify-content:space-between;
                  padding:8px 12px; border-bottom:1px solid #444; background:var(--surface-container);">
        <div><strong>Talent Points:</strong>
          <span style="color:var(--warning); margin-left:6px;">${tp}</span>
        </div>
        <button onclick="toggleTalentMenu()" title="Talent options"
          style="background:transparent; color:#ccc; border:1px solid #555;
                 border-radius:4px; padding:2px 8px; font-size:14px; cursor:pointer;">☰</button>
        ${_renderTalentMenu()}
      </div>
      <div id="talents-list" style="padding:8px 12px; max-height:320px; overflow-y:auto;">
        ${listHtml}
      </div>
    `;
  };

  window.showStats = () => {
    const statsBody = document.getElementById('stats-body');
    if(!statsBody) return;
    const canExchange = (player.statPoints ?? 0) >= 3;
    let html = `<p>Level ${player.level}</p>
      <p>Ability Points: <span style="color:var(--warning)">${player.statPoints}</span></p>
      <p>Talent Points: <span style="color:var(--warning)">${player.talentPoints ?? 0}</span>
        <button onclick="exchangeAPforTP()" ${canExchange ? '' : 'disabled'} title="Spend 3 AP for 1 TP"
          style="font-size:10px; padding:2px 6px; margin-left:8px; ${canExchange ? '' : 'opacity:0.4;'}">+1 TP (3 AP)</button>
      </p>`;
    
    // All 5 stats with full names (no abbreviations), values, and allocate buttons
    for(const [key, info] of Object.entries(STAT_INFO)) {
      let val = player[key] ?? 0;
      if (key === 'hitRate' || key === 'critRate' || key === 'dodgeRate')
        val = `${Math.round(val * 100)}%`;
      let hasPoints = player.statPoints >= (key === 'meleeDmgBonus' || key === 'rangedDmgBonus' || key === 'spellDmgBonus' ? 5 : 1);
      html += `<div style="font-size:12px; margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap;">
        <div>
          <strong style="color:var(--primary);">${info.name}</strong>: ${val}
          <span style="color:#888; font-size:10px;"> – ${info.desc}</span>
        </div>
        ${hasPoints ? `<button onclick="allocateStat('${key}')" style="font-size:10px; padding:2px 6px; margin-left:4px;">+</button>` : ''}
      </div>`;
    }
    
    // Preview bar for pending stat changes
    html += `<div id="stat-preview-bar"></div>`;
    
    // Calculate some basic combat stats from player stats
    // combined with whatever they have equipped at the moment.
    let currentBaseDmg = CONSTANTS.PLAYER_UNARMED_BASE_DMG;
    let meleeDmgMsg = `${currentBaseDmg} (unarmed)`;
    Object.values(player.equipped).forEach(name => {
      if(name) {
        let d = ItemDefs[name];
        if(!d) return;
        if(d.type === "weapon") {
          currentBaseDmg = (d.baseDmg ?? 0);
          meleeDmgMsg = `${currentBaseDmg} (${d.displayName})`;
        }
      }
    });
    if(player.meleeDmgBonus) meleeDmgMsg += `, plus ${player.meleeDmgBonus} from player bonus above`;

    // See if player happens to be carrying anything unequipped
    // that could improve their combat stats if it were.
    let considerEquip = false;
    [inventory, inventory].forEach(arr => {
      arr.forEach(item => {
        if(!item) return;
        let def = item.def;
        if(!def) return;
        if(def.type === "weapon" && def.baseDmg && def.baseDmg > currentBaseDmg) {
          if (considerEquip) {
            meleeDmgMsg += `, or ${def.name} for ${def.baseDmg}`;
          }
          else {
            meleeDmgMsg += `. Consider equipping ${def.name}, which would give you a higher base damage of ${def.baseDmg}`;
            considerEquip = true;
          }
          return;
        }
      });
    });
    if (currentBaseDmg < CONSTANTS.PLAYER_UNARMED_BASE_DMG)
      meleeDmgMsg += `. You would ${considerEquip ? "also " : ""}have a higher base damage of ${CONSTANTS.PLAYER_UNARMED_BASE_DMG} if you were unarmed`;

    // Show the calculated stats (informational only).
    html += `<div style="margin-top: 10px; text-align:left; font-size:12px; border-top:1px solid #555; padding-top:8px;">
      <p><strong>Current Combat Stats</strong></p>
      <p>Max Melee Damage: ${meleeDmgMsg}.</p>
    </div>`;
    statsBody.innerHTML = html;
  };

  // (buyTalent + showTalents removed — the old TALENT_TREES data is
  // gone in preparation for a redesigned talent system. The Talents
  // tab body is now a static placeholder set in HTML; once the new
  // model lands, a fresh renderer will replace this stub.)

  // Bug 32: Spell cooldown helper — returns remaining seconds (float) or 0
  window._spellCooldownRemaining = (spellName) => {
    const now = Date.now();
    if(spellName === 'illuminate') {
      if(player._illumLastUse) {
        const cd = 10000; // 10s illuminate cooldown
        const rem = (player._illumLastUse + cd - now) / 1000;
        return rem > 0 ? rem : 0;
      }
    }
    if(spellName === 'fireball') {
      if(window.fireballCooldown && window.fireballCooldown > now) {
        return (window.fireballCooldown - now) / 1000;
      }
    }
    // Generic: check player._spellCooldowns map
    if(player._spellCooldowns && player._spellCooldowns[spellName]) {
      const rem = (player._spellCooldowns[spellName] - now) / 1000;
      return rem > 0 ? rem : 0;
    }
    return 0;
  };

  window.showMagic = () => {
    const magicBody = document.getElementById('magic-body');
    if(!magicBody) return;
    if(!player.spells) player.spells = {};
    let keys = Object.keys(player.spells);
    if(keys.length === 0) {
      magicBody.innerHTML = "<p style='color:#888;'>No spells known. Find spell tomes in shops!</p>";
      return;
    }
    let html = "<div style='display:flex; flex-direction:column; gap:4px;'>";
    keys.forEach(k => {
      let sp = player.spells[k] || { level: 1 };
      let isEq = player.equippedSpell === k, isSec = player.secondarySpell === k;
      let cdRem = window._spellCooldownRemaining(k);
      let onCd = cdRem > 0;
      html += `<div style="background:var(--surface-container); padding:6px; border-radius:4px; display:flex; justify-content:space-between; align-items:center; position:relative; ${onCd ? 'opacity:0.7;' : ''}">
        ${onCd ? `<div style="position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);border-radius:4px;display:flex;align-items:center;justify-content:center;z-index:1;pointer-events:none;"><span style="color:#FFD700;font-size:14px;font-weight:bold;">${cdRem.toFixed(1)}s</span></div>` : ''}
        <span style="font-size:12px; cursor:pointer; z-index:2;" onclick="castSpell('${k}')">${k.toUpperCase()} (Lv${sp.level ?? 1})${onCd ? ' ⏳' : ''}</span>
        <div style="display:flex; gap:4px; z-index:2;">
          <button onclick="player.equippedSpell='${k}';showMagic();updateUI();" style="font-size:10px; background:${isEq?'var(--success)':'#444'}; padding:2px 6px;">${isEq?'F:✓':'F'}</button>
          <button onclick="player.secondarySpell='${k}';showMagic();updateUI();" style="font-size:10px; background:${isSec?'var(--primary)':'#444'}; padding:2px 6px;">${isSec?'G:✓':'G'}</button>
        </div>
      </div>`;
    });
    magicBody.innerHTML = html + "</div>";

    // Start interval refresh when magic modal is open (clear previous)
    if(window._magicCdInterval) clearInterval(window._magicCdInterval);
    const magicModal = document.getElementById('magic-modal');
    window._magicCdInterval = setInterval(() => {
      if(!magicModal || magicModal.style.display === 'none') {
        clearInterval(window._magicCdInterval);
        window._magicCdInterval = null;
        return;
      }
      showMagic();
    }, 1000);
  };

  window.showAssetViewer = () => {
    const body = document.getElementById('asset-viewer-body');
    if(!body) return;
    let html = "<h3>Sprites</h3><div style='display:grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); gap:8px;'>";
    Object.keys(assets.sprites).forEach(k => {
      let s = assets.sprites[k];
      let src = (s && s.src) ? s.src : '';
      html += `<div style='text-align:center; font-size:10px;'>${src ? `<img src='${src}' style='width:32px; height:32px;'>` : '<span style="font-size:24px;">?</span>'}<br>${k}</div>`;
    });
    html += "</div><h3>Sounds</h3>";
    Object.keys(assets.sounds).forEach(k => { html += `<button onclick="Sound.playSample('${k}')" style="margin:2px; padding:2px 6px; font-size:12px; cursor:pointer;">${k}</button> `; });
    if(Object.keys(assets.sounds).length === 0) html += "<p style='color:#888; font-size:11px;'>No sounds loaded. Load the asset file first.</p>";
    // Bug 28: Also show built-in FM sounds
    html += "<h3>Built-in Sounds</h3>";
    ['step','grunt','scream','clink','sword','splash','quack','squeak','gurgle','oof','snore'].forEach(k => {
      html += `<button onclick="Sound.${k}()" style="margin:2px; padding:2px 6px; font-size:12px; cursor:pointer;">${k}</button> `;
    });
    body.innerHTML = html;
  };

  // === Achievements ===
  // === Achievements Display (Classic WoW style) ===
  let _achieveCat = null; // currently expanded category

  window.showAchievements = () => {
    const body = document.getElementById('achieve-body');
    if(!body) return;

    // Bug 39: check both legacy achievements object and QuestEngine._achievements
    const _hasAchievement = (id) => achievements[id] || (typeof QuestEngine !== 'undefined' && QuestEngine.hasAchievement && QuestEngine.hasAchievement(id));
    let earnedCount = ACHIEVEMENT_DEFS.filter(a => _hasAchievement(a.id)).length;
    let html = `<div style="margin-bottom:10px; color:#FFD700; font-weight:bold; font-size:14px;">
      🏆 Achievements: ${earnedCount} / ${ACHIEVEMENT_DEFS.length} &nbsp; (${achievementPoints} pts)
    </div>`;

    // Category tabs
    html += `<div style="display:flex; gap:4px; margin-bottom:12px; flex-wrap:wrap;">`;
    for(const cat of ACHIEVEMENT_CATS) {
      let catAchieves = ACHIEVEMENT_DEFS.filter(a => a.cat === cat);
      let catEarned = catAchieves.filter(a => _hasAchievement(a.id)).length;
      let isActive = _achieveCat === cat;
      let color = isActive ? '#FFD700' : (catEarned === catAchieves.length ? '#81c784' : '#aaa');
      html += `<button onclick="_achieveCat='${cat}'; showAchievements();"
        style="background:${isActive?'rgba(255,215,0,0.15)':'rgba(255,255,255,0.05)'};
        color:${color}; border:1px solid ${isActive?'#FFD700':'#4A4458'};
        border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer;">
        ${cat} (${catEarned}/${catAchieves.length})</button>`;
    }
    html += `</div>`;

    if(!_achieveCat) {
      // Overview: show all categories collapsed
      for(const cat of ACHIEVEMENT_CATS) {
        let catAchieves = ACHIEVEMENT_DEFS.filter(a => a.cat === cat);
        let catEarned = catAchieves.filter(a => _hasAchievement(a.id)).length;
        html += `<div style="margin-bottom:8px; padding:6px 8px; background:rgba(255,255,255,0.03); border-radius:6px; cursor:pointer;"
          onclick="_achieveCat='${cat}'; showAchievements();">
          <div style="font-weight:bold; color:var(--primary); font-size:12px;">
            ${cat} <span style="color:#aaa; font-size:11px;">(${catEarned}/${catAchieves.length})</span>
          </div>
          <div style="font-size:10px; color:#888; margin-top:2px;">
            ${catEarned === catAchieves.length ? '<span style="color:#81c784;">✓ Complete!</span>' :
              `${catEarned > 0 ? catEarned + ' earned' : 'No achievements yet'}`}
          </div>
        </div>`;
      }
    } else {
      // Show achievements for selected category
      html += `<button onclick="_achieveCat=null; showAchievements();"
        style="background:none; border:none; color:#aaa; cursor:pointer; font-size:11px; margin-bottom:8px;">
        ← Back to categories</button>`;
      let catAchieves = ACHIEVEMENT_DEFS.filter(a => a.cat === _achieveCat);
      for(const a of catAchieves) {
        let isEarned = _hasAchievement(a.id);
        if(isEarned) {
          html += `<div style="display:flex; align-items:center; gap:10px; padding:8px 10px; background:rgba(255,215,0,0.06); border-radius:6px; margin-bottom:4px; border:1px solid rgba(255,215,0,0.15);">
            <span style="font-size:28px;">${a.icon}</span>
            <div style="flex:1;">
              <div style="font-weight:bold; color:#FFD700; font-size:13px;">${a.name}</div>
              <div style="font-size:11px; color:#aaa;">${a.desc}</div>
            </div>
            <div style="text-align:right;">
              <div style="color:#FFD700; font-size:12px; font-weight:bold;">+${a.points ?? 10}</div>
              <div style="color:#81c784; font-size:10px;">✓</div>
            </div>
          </div>`;
        } else {
          html += `<div style="display:flex; align-items:center; gap:10px; padding:8px 10px; opacity:0.45; border-radius:6px; margin-bottom:4px;">
            <span style="font-size:28px; filter:grayscale(1) brightness(0.5);">?</span>
            <div style="flex:1;">
              <div style="font-weight:bold; color:#888; font-size:13px;">${a.name}</div>
              <div style="font-size:11px; color:#666;">${a.desc}</div>
            </div>
            <div style="color:#666; font-size:11px;">${a.points ?? 10}pts</div>
          </div>`;
        }
      }
    }
    body.innerHTML = html;
  };

  // ============================================================================
  // QUEST LOG UI
  // ============================================================================
  //
  // GAME DESIGN LESSON: The Quest Log as Player Compass
  //
  // A quest log serves two critical UX functions:
  //
  // 1. ORIENTATION: "What am I doing?" — Active quests remind the player
  //    of their current objectives after a break.
  //
  // 2. MOTIVATION: "What should I do next?" — Incomplete quests with
  //    visible next-steps guide the player without hand-holding.
  //
  // The design here borrows from classic RPGs:
  //   - WoW-style tabs for Active / Completed
  //   - First-person journal entries (Andor's Trail convention)
  //   - Category grouping so combat quests don't drown out story quests
  //   - Stage-by-stage expansion to show quest history
  //
  // The quest log reads from QuestEngine.getQuestLog() and never mutates
  // state. It's a pure VIEW of the quest engine's data.
  // ============================================================================

  let _questLogTab = 'active'; // 'active' or 'completed'

  window.showQuestLog = () => {
    const body = document.getElementById('quest-body');
    if(!body) return;

    // Graceful fallback if quest engine isn't initialized yet
    if(typeof QuestEngine === 'undefined' || !QuestEngine.getQuestLog) {
      body.innerHTML = `<p style="color:#888; font-style:italic;">Quest log not available yet.</p>`;
      return;
    }

    let activeQuests = QuestEngine.getActiveQuests();
    let completedQuests = QuestEngine.getCompletedQuests();

    let html = '';

    // ── Tab bar ──
    html += `<div style="display:flex; gap:4px; margin-bottom:12px; border-bottom:1px solid #4A4458; padding-bottom:8px;">
      <button onclick="_questLogTab='active'; showQuestLog();"
        style="flex:1; background:${_questLogTab==='active'?'rgba(200,160,255,0.15)':'rgba(255,255,255,0.03)'};
        color:${_questLogTab==='active'?'var(--primary)':'#888'};
        border:1px solid ${_questLogTab==='active'?'var(--primary)':'#4A4458'};
        border-radius:4px; padding:6px; font-size:12px; cursor:pointer;">
        📋 Active (${activeQuests.length})</button>
      <button onclick="_questLogTab='completed'; showQuestLog();"
        style="flex:1; background:${_questLogTab==='completed'?'rgba(129,199,132,0.15)':'rgba(255,255,255,0.03)'};
        color:${_questLogTab==='completed'?'#81c784':'#888'};
        border:1px solid ${_questLogTab==='completed'?'#81c784':'#4A4458'};
        border-radius:4px; padding:6px; font-size:12px; cursor:pointer;">
        ✅ Completed (${completedQuests.length})</button>
    </div>`;

    let quests = _questLogTab === 'active' ? activeQuests : completedQuests;

    if(quests.length === 0) {
      if(_questLogTab === 'active') {
        html += `<div style="text-align:center; padding:30px 10px; color:#888;">
          <p style="font-size:32px; margin:0 0 8px 0;">📜</p>
          <p style="font-style:italic; font-size:12px;">No active quests.</p>
          <p style="font-size:11px; color:#666;">Explore the dungeon, talk to NPCs, and fight monsters to discover quests.</p>
        </div>`;
      } else {
        html += `<div style="text-align:center; padding:30px 10px; color:#888;">
          <p style="font-size:32px; margin:0 0 8px 0;">📜</p>
          <p style="font-style:italic; font-size:12px;">No completed quests yet.</p>
        </div>`;
      }
    }

    // ── Group quests by category ──
    // LESSON: Grouping prevents information overload. A player with 15
    // active quests needs categories to find the one they care about.
    let categories = {};
    for(const q of quests) {
      let cat = q.category || 'General';
      if(!categories[cat]) categories[cat] = [];
      categories[cat].push(q);
    }

    for(const [cat, catQuests] of Object.entries(categories)) {
      html += `<div style="margin-bottom:4px;">
        <div style="font-size:11px; color:var(--primary); font-weight:bold;
          text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;
          padding:2px 0; border-bottom:1px solid rgba(200,160,255,0.2);">
          ${cat}
        </div>`;

      for(const quest of catQuests) {
        let isComplete = quest.completed;
        let borderColor = isComplete ? '#81c784' : 'var(--primary)';
        let bgColor = isComplete ? 'rgba(129,199,132,0.06)' : 'rgba(200,160,255,0.06)';

        html += `<div style="margin-bottom:8px; padding:8px 10px;
          background:${bgColor}; border-radius:6px;
          border-left:3px solid ${borderColor};">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-weight:bold; color:${isComplete?'#81c784':'#e0d0ff'};
              font-size:13px;">
              ${isComplete?'✅':'📋'} ${quest.name}
            </div>
            <div style="font-size:10px; color:#888;">
              ${quest.stages.length} stage${quest.stages.length !== 1 ? 's' : ''}
            </div>
          </div>`;

        // ── Show journal entries (stages visited) ──
        // LESSON: Each stage's logText is written in first person, creating
        // a journal-like narrative. Reading through the stages tells the
        // story of what happened, not just what to do next.
        for(const stage of quest.stages) {
          html += `<div style="margin-top:6px; padding-left:10px;
            border-left:2px solid rgba(255,255,255,0.08);
            font-size:11px; color:#bbb; line-height:1.4;">
            <span style="color:#888; font-style:italic;">&#8220;</span>${stage.text}<span style="color:#888; font-style:italic;">&#8221;</span>
          </div>`;
        }

        html += `</div>`; // close quest card
      }

      html += `</div>`; // close category
    }

    body.innerHTML = html;
  };

  // === Debug Timing Audit ===
  window.debugShowTiming = () => {
    const div = document.getElementById('debug-timing');
    if(!div) return;
    let html = '<strong style="color:var(--primary);">⏱️ Active Effects & Statuses</strong><br>';
    html += '<div style="margin:4px 0; border-bottom:1px solid #333; padding-bottom:4px;">';
    html += '<span style="color:#FFD700;">TIME-BASED (uses requestAnimationFrame / setInterval)</span><br>';
    html += `<span>Floating Texts: ${floatingTexts.length} active (fade=250ms via performance.now)</span><br>`;
    html += `<span>Damage Tint: ${damageTint > 0 ? damageTint + ' frames' : 'none'}</span><br>`;
    html += `<span>Level Up Flash: ${window.levelUpFlash > 0 ? window.levelUpFlash.toFixed(2) : 'none'}</span><br>`;
    html += `<span>Quest Timer: ${questTimer.active ? questTimer.label + ' (' + questTimer.time.toFixed(1) + 's)' : 'none'}</span><br>`;
    html += '</div>';
    html += '<div style="margin:4px 0; border-bottom:1px solid #333; padding-bottom:4px;">';
    html += '<span style="color:#FFD700;">TURN-BASED (advances via advanceTurn)</span><br>';
    html += `<span>Hunger: ${player.hunger.toFixed(1)}% (hunger damage at 100%)</span><br>`;
    html += `<span>Exhaustion: ${player.exhaustion.toFixed(1)} (HP/MP drain if >20)</span><br>`;
    html += `<span>Light Turns: ${lightTurns > 0 ? lightTurns + ' remaining' : 'none'}</span><br>`;
    html += `<span>Heal Over Time: ${player.healOverTime > 0 ? player.healOverTime + ' ticks' : 'none'}</span><br>`;
    html += `<span>Status Effect: ${player.statusType || 'none'} (${player.statusTurns} turns)</span><br>`;
    html += `<span>Vermin Kills: ${player.verminKills ?? 0}</span><br>`;
    html += '</div>';
    html += '<div style="margin:4px 0;">';
    html += '<span style="color:#FFD700;">DECISION NOTES</span><br>';
    html += '<span style="color:#81c784;">✓ Floating text uses time-bound fade (0.25s)</span><br>';
    html += '<span style="color:#81c784;">✓ Damage tint is turn-bound (decrements in advanceTurn)</span><br>';
    html += '<span style="color:#ffb74d;">⚠ Hunger/exhaustion use turn-based accumulation</span><br>';
    html += '<span style="color:#ffb74d;">⚠ Status effects use turn-based countdown</span><br>';
    html += '</div>';
    div.innerHTML = html;
  };

  // === Quest Actions ===
  window.listenAction = () => {
    if(window._eagleDoor && !window._eagleDoor.opened && Math.abs(player.x - window._eagleDoor.x) <= 1 && Math.abs(player.y - window._eagleDoor.y) <= 1) {
      logMsg("<span style='color:#88CCFF'>You hear wind hissing through old stone, then the flutter of birds somewhere beyond the locked door.</span>");
      Sound.playTone(180, 'sine', 0.2, 0.04, 120);
      return;
    }
    if(darkMap[player.y] && darkMap[player.y][player.x] && lightTurns <= 0) {
      logMsg("<span style='color:var(--warning)'>You hear faint, scuttling footsteps... something is near.</span>");
      Sound.playTone(100, 'sine', 0.5, 0.05, 50);
    } else { logMsg("You hear nothing but your own breath."); }
  };

  window.kneelAction = () => {
    player.isKneeling = true; logMsg("You kneel low to the ground.");
    const kneelBtn = document.getElementById('kneelBtn');
    if(kneelBtn) kneelBtn.style.background = 'var(--success)';
    setTimeout(() => {
      player.isKneeling = false;
      const kb = document.getElementById('kneelBtn');
      if(kb) kb.style.background = '';
    }, 1000);
  };

  // Action Buttons
  window.meleeAttack = () => {
    const weaponName = player.equipped && player.equipped.leftHand;  // camelCase name
    const weaponDef  = weaponName ? ItemDefs[weaponName] : null;
    if(weaponDef && weaponDef.ranged) {
      startRangedAttackTargeting();
      return;
    }
    // Check if there's an enemy in an adjacent cell
    let dx = player.facing.dx, dy = player.facing.dy;
    let nx = player.x + dx, ny = player.y + dy;
    // Set attacking flag for sprite animation
    player._isAttacking = true;
    setTimeout(() => { player._isAttacking = false; }, 300);
    let eIdx = enemies.findIndex(e => e.x === nx && e.y === ny);
    if(eIdx !== -1) {
      // Enemy found — attack it
      movePlayer(dx, dy);
    } else {
      // No enemy — swing and miss, no movement
      if(weaponName === 'accordion') {
        Sound.polka();
        logMsg("<span style='color:#888'>You play a pointless burst of dungeon polka at the empty air.</span>");
      } else {
        Sound.sword();
        logMsg("<span style='color:#888'>You swing at the air. Nothing there.</span>");
      }
      advanceTurn(1);
    }
  };
  window.castEquippedSpell = () => { if(player.equippedSpell) castSpell(player.equippedSpell); else logMsg("No spell equipped!"); };
  window.castSecondarySpell = () => { if(player.secondarySpell) castSpell(player.secondarySpell); else logMsg("No secondary spell equipped!"); };

  // (Shadowstep / blink, toggleAutoLoot, updateAutoLootBtn removed —
  // all gated on talents that no longer exist. The keybind for
  // shadowstep is still in input.js handlers; calls now hit a stub.
  // Future talent system will reintroduce active abilities through
  // a cleaner registration pattern.)
  window.shadowstep = () => { logMsg("Shadowstep is currently disabled."); };
  window.toggleMenu = () => { toggleModal('menu-modal'); };
  window.toggleFog = () => { debugFlags.revealMap = !debugFlags.revealMap; drawMap(); };
  window.toggleLight = () => { debugFlags.fullLight = !debugFlags.fullLight; calculateFOV(); drawMap(); };
  // Debug Abilities
  window.debugToggleGodMode = () => { debugFlags.godMode = !debugFlags.godMode; logMsg(`God Mode ${debugFlags.godMode ? 'ON' : 'OFF'}`); };
  window.debugToggleNoRegen = () => { debugFlags.noRegen = !debugFlags.noRegen; logMsg(`No Regen ${debugFlags.noRegen ? 'ON' : 'OFF'}`); };
  window.debugAddGold = (amt) => { changeGold(amt); logMsg(`Added ${amt} gold.`); };

  // Dump all Lootables (floor piles, containers, corpses) at the player's
  // tile to the game log as JSON. Useful for verifying the Phase 4 loot
  // model state — what does the popup see at this tile right now? Null
  // and empty fields are stripped to keep the dump scannable.
  window.debugLogLootHere = () => {
    const x = player.x, y = player.y;
    const prune = (obj) => {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        out[k] = v;
      }
      return out;
    };
    const summarizeLootable = (l) => prune({
      ownerKind: l.ownerKind, id: l.id, x: l.x, y: l.y,
      icon: l.icon, isLocked: l.isLocked, lockKind: l.lockKind,
      slots: l.slots.map(s => prune({ itemName: s.itemName, qty: s.qty, icon: s.icon })),
    });
    const piles   = zone.lootablesAt(x, y).map(summarizeLootable);
    const corpses = zone.corpsesAt(x, y).map(c => prune({
      type: 'corpse', name: c.name, icon: c.icon, isBones: c.isBones,
      actionCooldown: c.actionCooldown,
      lootable: c.lootable ? summarizeLootable(c.lootable) : null,
    }));
    const out = prune({ tile: { x, y }, corpses, lootables: piles });
    logMsg(`<pre style="color:#aef; font-size:10px; margin:0; white-space:pre-wrap;">${JSON.stringify(out, null, 2)}</pre>`);
  };
  window.debugAddStatPoints = (amt) => { player.statPoints += amt; logMsg(`Added ${amt} stat points.`); updateUI(); };
  // Floor navigation (floor = the current dungeon depth; level = player character level)
  window.debugWarpNextFloor = () => { currentLevel++; levelCache[currentLevel] = null; initMap(50); calculateFOV(); drawMap(); updateUI(); logMsg(`Warped to Floor ${currentLevel}.`); };
  window.debugWarpPrevFloor = () => { if(currentLevel > 0) { currentLevel--; levelCache[currentLevel] = null; initMap(50); calculateFOV(); drawMap(); updateUI(); logMsg(`Warped to Floor ${currentLevel}.`); } };
  window.debugWarpPortal = (target) => {
    if(target === 'town') {
      currentLevel = 0; currentScene = 'town';
      initMap(50);
      if(window._townGateX) { player.x = window._townGateX; player.y = window._townGateY; }
      calculateFOV(); drawMap(); updateUI();
      logMsg("Warped to Town Portal.");
    } else if(target === 'beach') {
      currentLevel = 12;
      currentScene = 'beach';
      initMap(50);
      player.x = Math.floor(mapW / 2); player.y = Math.floor(mapH / 2);
      calculateFOV(); drawMap(); updateUI();
      logMsg("Warped to Beach.");
    }
  };
  window.debugWarpNextLevel = window.debugWarpNextFloor; // legacy alias
  window.debugWarpPrevLevel = window.debugWarpPrevFloor; // legacy alias
  window.debugSetFloorPrompt = () => {
    let floor = parseInt(window.prompt('Enter Floor number (0 = Town, 1-10 = Dungeon, 11+ = Overworld):'));
    if (!isNaN(floor)) { currentLevel = Math.max(0, floor); initMap(50); calculateFOV(); drawMap(); updateUI(); logMsg(`Warped to Floor ${currentLevel}.`); }
  };
  window.debugHealFull = () => { player.hp = player.maxHp; logMsg(`Healed to full HP.`); updateUI(); };
  window.debugRestoreMana = () => { player.mp = player.maxMp; logMsg(`Restored mana.`); updateUI(); };
  window.debugResurrect = () => { 
    player.hp = player.maxHp; 
    player.mp = player.maxMp;
    // Close death modal if open
    const deathModal = document.getElementById('death-modal');
    if(deathModal) deathModal.style.display = 'none';
    logMsg(`Resurrected.`); 
    updateUI(); 
  };

  window.debugToggleEncryption = () => { debugFlags.noEncryption = !debugFlags.noEncryption; logMsg(`Encryption ${debugFlags.noEncryption ? 'OFF' : 'ON'}`); };
  let _debugSelectedItem = null;
  window.debugItemSearch = (query) => {
    const dd = document.getElementById('debug-item-dropdown');
    if (!query) { dd.style.display = 'none'; _debugSelectedItem = null; return; }
    const q = query.toLowerCase();
    // Iterate the camelCase registry; match against icon, displayName, or
    // the camelCase identifier itself.
    const matches = Object.entries(ItemDefs).filter(([name, def]) =>
      def.icon.includes(query) || def.displayName.toLowerCase().includes(q) || name.toLowerCase().includes(q)
    );
    if (matches.length === 0) { dd.style.display = 'none'; return; }
    // Build via DOM (innerHTML trips the XSS hook even with trusted data)
    while (dd.firstChild) dd.removeChild(dd.firstChild);
    for (const [name, def] of matches) {
      const row = document.createElement('div');
      row.style.cssText = 'padding:5px 8px;cursor:pointer;border-bottom:1px solid #333;';
      row.textContent = `${def.icon} ${def.displayName}`;
      row.onclick      = () => debugSelectItem(name, def.displayName);
      row.onmouseover  = () => { row.style.background = '#4A4458'; };
      row.onmouseout   = () => { row.style.background = ''; };
      dd.appendChild(row);
    }
    dd.style.display = 'block';
    _debugSelectedItem = matches[0][0]; // first matching camelCase name
  };
  window.debugSelectItem = (name, displayName) => {
    _debugSelectedItem = name;
    const def = ItemDefs[name];
    const icon = def ? def.icon : '';
    document.getElementById('debug-item-search').value = `${icon} ${displayName}`;
    document.getElementById('debug-item-dropdown').style.display = 'none';
  };
  window.debugAddSearchedItem = () => {
    if (!_debugSelectedItem) {
      // Try parsing input directly as an item identifier (icon or name)
      const val = (document.getElementById('debug-item-search')?.value ?? '').trim();
      _debugSelectedItem = val;
    }
    debugAddItem(_debugSelectedItem);
    document.getElementById('debug-item-search').value = '';
    document.getElementById('debug-item-dropdown').style.display = 'none';
    _debugSelectedItem = null;
  };
  window.debugAddItem = (idOrIcon) => {
    // Accept either a camelCase name OR an emoji icon (legacy /add commands).
    let name = idOrIcon;
    let def = ItemDefs[name];
    if (!def) {
      def = ItemDef.byIcon(idOrIcon);
      if (def) name = def.name;
    }
    if (!def) { logMsg(`Unknown item: "${idOrIcon}"`); return; }
    const slot = inventory.findIndex(i => i === null);
    if (slot !== -1) {
      inventory[slot] = new ItemStack(name, 1);
    } else {
      zone.dropAt(player.x, player.y, new ItemStack(name, 1));
    }
    logMsg(`Added ${def.displayName} to ${slot !== -1 ? 'inventory' : 'ground'}.`);
    renderQuickslots(); updateUI();
  };
  window.debugEditStats = () => {
    let html = `<h2>Edit Player Stats</h2>`;
    const fields = [
      ['maxHp', 'Max HP', player.maxHp],
      ['hp', 'Current HP', player.hp],
      ['maxMp', 'Max MP', player.maxMp],
      ['mp', 'Current MP', player.mp],
      ['baseDmg', 'Base Damage', player.baseDmg],
      ['meleeDmgBonus', 'Melee Bonus', player.meleeDmgBonus],
      ['rangedDmgBonus', 'Ranged Bonus', player.rangedDmgBonus],
      ['spellDmgBonus', 'Spell Bonus', player.spellDmgBonus],
      ['hitRate', 'Hit Rate (0-1)', player.hitRate],
      ['critRate', 'Crit Rate (0-1)', player.critRate],
      ['dodgeRate', 'Dodge Rate (0-1)', player.dodgeRate],
      ['hunger', 'Hunger (0-100)', player.hunger],
      ['xp', 'XP', player.xp],
      ['talentPoints', 'Talent Points', player.talentPoints ?? 0],
    ];
    fields.forEach(([key, label, val]) => {
      html += `<div style="display:flex;gap:8px;align-items:center;margin:4px 0;">
        <input type="number" id="edit-${key}" value="${val}" step="0.01" style="width:70px;"> <span>${label}</span></div>`;
    });
    html += `<button onclick="applyStatEdit()" style="margin-top:8px;">Apply</button>`;
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('overlay').style.display = 'flex';
    setTimeout(() => {
      fields.forEach(([key]) => {
        document.getElementById(`edit-${key}`)?.addEventListener('keypress', (e) => {
          if(e.key === 'Enter') { e.preventDefault(); applyStatEdit(); }
        });
      });
    }, 50);
  };

  window.applyStatEdit = () => {
    ['maxHp','hp','maxMp','mp','baseDmg','meleeDmgBonus','rangedDmgBonus','spellDmgBonus','hitRate','critRate','dodgeRate','hunger','xp','talentPoints'].forEach(key => {
      const el = document.getElementById(`edit-${key}`);
      if(el) {
        const val = parseFloat(el.value);
        if(!isNaN(val)) player[key] = val;
      }
    });
    logMsg('Stats updated.');
    document.getElementById('overlay').style.display = 'none';
    updateUI();
  };
  window.debugSetLevel = (level) => {
    if (level < 1) level = 1;
    currentLevel = level;
    initMap(50);
    calculateFOV();
    drawMap();
    updateUI();
    logMsg(`Warped to level ${currentLevel}`);
  };
  window.debugAddItemPrompt = () => {
    let icon = window.prompt('Enter item icon (e.g., 🗡️, 🧪, 📜):');
    if (icon) debugAddItem(icon);
  };
  window.debugSetLevelPrompt = () => {
    let level = parseInt(window.prompt('Enter level number:'));
    if (!isNaN(level)) debugSetLevel(level);
  };

   // === Initialization ===
   // === Asset Loader ===
   // Asset bundles (load via the slots on the start screen):
   //   roguelike_assets.dat                 — sprites, GIFs, sounds, voice clips, music
   //   roguelike_assets_ambient_movies.dat  — ambient audio + NPC dialog MP4 movies
   //   roguelike_assets_arcade.dat          — Astrochicken WASM + Centipede
   const loadedAssetFilenames = new Set();

   function loadAssetData(data, filename) {
     let count = 0;
     const summary = { total: 0, sprites: 0, sounds: 0, minigames: 0, movies: 0 };
     if(data.sprites) {
       Object.keys(data.sprites).forEach(k => {
         const v = data.sprites[k];
         if(v.startsWith('data:image/gif') || v.startsWith('data:image/png') || v.startsWith('data:image/')) {
           const img = new Image();
           img.onload = () => { if(theMap.length > 0) drawMap(); };
           img.src = v;
           assets.sprites[k] = img;
         } else {
           assets.sprites[k] = { src: v, complete: true, naturalWidth: 33 };
         }
         count++;
         summary.sprites++;
       });
     }
     if(data.sounds) {
       Object.keys(data.sounds).forEach(k => { assets.sounds[k] = data.sounds[k]; count++; summary.sounds++; });
     }
     if(data.minigames) {
       Object.assign(assets.minigames, data.minigames);
       count += Object.keys(data.minigames).length;
       summary.minigames += Object.keys(data.minigames).length;
     }
       // Movies bundle — base64 video/mp4 data URLs for NPC dialog animations
       if(data.movies) {
         console.log('Loading movies:', Object.keys(data.movies).length, Object.keys(data.movies).slice(0, 5));
         Object.assign(assets.movies, data.movies);
         count += Object.keys(data.movies).length;
         summary.movies += Object.keys(data.movies).length;
       }
      window.useSprites = true;
     if(typeof debugLog === 'function') {
       debugLog(`Assets loaded from ${filename}: ${count} entries (${summary.sprites} sprites, ${summary.sounds} sounds, ${summary.minigames} minigames, ${summary.movies} movies)`);
     }
     summary.total = count;
     return summary;
   }

  // Helper: update asset slot visuals after loading
  function _updateAssetSlot(slotNum, icon, countText, loaded) {
    const slotEl = document.getElementById(`asset-slot-${slotNum}`);
    const iconEl = document.getElementById(`asset-slot-${slotNum}-icon`);
    const countEl = document.getElementById(`asset-slot-${slotNum}-count`);
    if(slotEl) {
      slotEl.style.borderColor = loaded ? 'rgba(129,199,132,0.75)' : '#4b4655';
      slotEl.style.background = loaded ? 'rgba(18,34,22,0.95)' : 'rgba(23,22,28,0.92)';
    }
    if(iconEl) iconEl.textContent = loaded ? '✓' : icon;
    if(countEl) countEl.innerHTML = loaded ? countText : '';
  }

  function _setStartButtonState(text, busy) {
    const btn = document.getElementById('startBtn');
    if(!btn) return;
    btn.textContent = text;
    btn.style.background = busy ? 'var(--warning)' : 'var(--success)';
    btn.disabled = !!busy;
  }

   function _loadAssetSummary(slotNum, summary) {
     if(slotNum === 1) return `${summary.sprites} Sprites<br>${summary.sounds} Sounds`;
      if(slotNum === 2) return `${summary.sounds} amb<br>${summary.movies} 🎬`;
      if(slotNum === 3) return summary.minigames > 0 ? 'WASM' : `${summary.total}`;
      return `${summary.total}`;
    }

  function _loadSelectedAssetFile(slotNum, file, onError) {
    if(!file) return;
    if(loadedAssetFilenames.has(file.name)) {
      logMsg(`<span style='color:var(--warning)'>${file.name} already loaded.</span>`);
      _setStartButtonState('ENTER THE DUNGEON', false);
      return;
    }
    if(slotNum === 1) _setStartButtonState('LOADING...', true);
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if(slotNum === 1 && event.lengthComputable) {
        _setStartButtonState(`LOADING ${Math.round(event.loaded / event.total * 100)}%...`, true);
      }
    };
    reader.onload = (ev) => {
      try {
        const summary = loadAssetData(JSON.parse(ev.target.result), file.name);
        loadedAssetFilenames.add(file.name);
        _updateAssetSlot(slotNum, '+', _loadAssetSummary(slotNum, summary), true);
        _setStartButtonState('ENTER THE DUNGEON', false);
        // Play fanfare on first asset load
        if(slotNum === 1 && typeof Sound !== 'undefined' && Sound.fanfare) {
          Sound.init();
          if(Sound.ctx && Sound.ctx.state === 'suspended') Sound.ctx.resume().catch(() => {});
          Sound.fanfare();
          const ff = window.assets && window.assets.sounds && window.assets.sounds.fanfare;
          if(ff) {
            try {
              const a = new Audio(ff);
              a.volume = 0.65;
              a.play().catch(() => {});
            } catch(e) {}
          }
        }
      } catch(err) {
        _updateAssetSlot(slotNum, '+', '', false);
        _setStartButtonState('ENTER THE DUNGEON', false);
        onError(err);
      }
    };
    reader.onerror = () => {
      _setStartButtonState('ENTER THE DUNGEON', false);
      onError(new Error('Failed to read asset file'));
    };
    reader.readAsText(file);
  }

   window.resetLoadedAssets = () => {
     Object.keys(assets.sprites).forEach(k => delete assets.sprites[k]);
     Object.keys(assets.sounds).forEach(k => delete assets.sounds[k]);
     Object.keys(assets.minigames).forEach(k => delete assets.minigames[k]);
     Object.keys(assets.movies).forEach(k => delete assets.movies[k]);
     loadedAssetFilenames.clear();
     window.useSprites = false;
      ['asset-loader', 'asset-loader-audio', 'asset-loader-extra'].forEach((id, idx) => {
        const input = document.getElementById(id);
        if(input) input.value = '';
        _updateAssetSlot(idx + 1, '+', '', false);
      });
    const spriteToggle = document.getElementById('sprites-toggle');
    const spriteKnob = document.getElementById('sprites-knob');
    if(spriteToggle) spriteToggle.checked = false;
    if(spriteKnob) {
      spriteKnob.style.background = '#4A4458';
      if(spriteKnob.firstElementChild) spriteKnob.firstElementChild.style.left = '3px';
    }
    _setStartButtonState('ENTER THE DUNGEON', false);
    logMsg('Asset state reset.');
  };

  const assetInput = document.getElementById('asset-loader');
  if(assetInput) {
    assetInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      _loadSelectedAssetFile(1, file, (err) => alert('Invalid asset file: ' + err.message));
      e.target.value = '';
    });
  }

  // Ambient + movies bundle
  const assetInputAudio = document.getElementById('asset-loader-audio');
  if(assetInputAudio) {
    assetInputAudio.addEventListener('change', (e) => {
      const file = e.target.files[0];
      _loadSelectedAssetFile(2, file, (err) => alert('Invalid ambient+movies asset file: ' + err.message));
      e.target.value = '';
    });
  }

   // Arcade bundle (Astrochicken WASM + Centipede)
   const assetInputExtra = document.getElementById('asset-loader-extra');
   if(assetInputExtra) {
     assetInputExtra.addEventListener('change', (e) => {
       const file = e.target.files[0];
       _loadSelectedAssetFile(3, file, (err) => alert('Failed to load arcade bundle: ' + err.message));
       e.target.value = '';
     });
   }

  // === Astrochicken Minigame ===
  // Opens the Ms. Astro Chicken game embedded from assets
  window.astrochickenGame = function() {
    if(player.gp < 5) {
      if(typeof showInsufficientFunds === 'function') showInsufficientFunds('leftys', 5, 'Astrochicken');
      else logMsg("<span style='color:var(--error)'>🐔 You need 5 gold to play Astrochicken!</span>");
      return;
    }
    
    changeGold(-5);
    
    // Create modal for the game
    const modal = document.createElement('div');
    modal.id = 'astrochicken-modal';
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.95); z-index: 9999;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
    `;
    
    // Header with close button
    const header = document.createElement('div');
    header.style.cssText = 'color: #0f0; font-family: monospace; margin-bottom: 10px; text-align: center;';
    header.innerHTML = `
      <div style="font-size: 24px; margin-bottom: 5px;">🐔 MS. ASTRO CHICKEN 🐔</div>
      <div style="font-size: 14px; color: #888;">Press R to reset | Arrow keys to fly | Space to throw eggs</div>
      <button onclick="closeAstrochicken()" style="
        margin-top: 10px; padding: 8px 20px; background: #f44; color: white; 
        border: none; cursor: pointer; font-family: monospace;
      ">CLOSE (ESC)</button>
    `;
    modal.appendChild(header);
    
    // Game container
    const gameContainer = document.createElement('div');
    gameContainer.id = 'astrochicken-container';
    gameContainer.style.cssText = 'width: 960px; height: 570px; border: 2px solid #0f0;';
    modal.appendChild(gameContainer);
    
    document.body.appendChild(modal);
    
    // Load the game from assets
    if(window.assets && window.assets.minigames) {
      const indexHtml = window.assets.minigames['astrochicken/index.html'];
      const wasmExec = window.assets.minigames['astrochicken/wasm_exec.js'];
      const wasmBinary = window.assets.minigames['astrochicken/msastrochicken.wasm'];
      
      if(indexHtml && wasmExec && wasmBinary) {
        // Create iframe with the game
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
        
        // We need to create a blob URL for the game
        // First, decode the base64 data
        const decodeBase64 = (dataUrl) => {
          const base64 = dataUrl.split(',')[1];
          return atob(base64);
        };
        
        // Create blob URLs
        const wasmExecBlob = new Blob([decodeBase64(wasmExec)], { type: 'application/javascript' });
        const wasmExecUrl = URL.createObjectURL(wasmExecBlob);
        
        // Properly decode binary WASM data (atob alone corrupts bytes > 127)
        const wasmBinaryStr = decodeBase64(wasmBinary);
        const wasmBinaryArray = new Uint8Array(wasmBinaryStr.length);
        for(let i = 0; i < wasmBinaryStr.length; i++) {
          wasmBinaryArray[i] = wasmBinaryStr.charCodeAt(i) & 0xFF;
        }
        const wasmBlob = new Blob([wasmBinaryArray], { type: 'application/wasm' });
        const wasmUrl = URL.createObjectURL(wasmBlob);
        
        // Modify index.html to use blob URLs and add error logging
        let htmlContent = decodeBase64(indexHtml);
        htmlContent = htmlContent.replace(/src=["']\.?(?:\/)?wasm_exec\.js["']/, `src="${wasmExecUrl}"`);
        htmlContent = htmlContent.replace(/fetch\(["']\.?(?:\/)?msastrochicken\.wasm["']\)/g, `fetch("${wasmUrl}")`);
        // Add fallback for instantiateStreaming (some browsers don't support it with blob URLs)
        htmlContent = htmlContent.replace(
          'WebAssembly.instantiateStreaming(fetch(',
          '(async function(){try{return await WebAssembly.instantiateStreaming(fetch('
        );
        // Fix the closing of the try/catch wrapper
        htmlContent = htmlContent.replace(
          '}).catch(err => {',
          ')}catch(e){return WebAssembly.instantiate(await (await fetch("' + wasmUrl + '")).arrayBuffer(),go.importObject)}})().then(result=>{go.run(result.instance);'
        );
        // Remove the old .then after instantiateStreaming since we wrapped it
        htmlContent = htmlContent.replace(
          '), go.importObject).then(result => {',
          ''
        );
        // Remove the duplicate go.run in the old path
        htmlContent = htmlContent.replace(
          /\n\s*go\.run\(result\.instance\);/,
          ''
        );
        
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const htmlUrl = URL.createObjectURL(htmlBlob);
        
        iframe.src = htmlUrl;
        gameContainer.appendChild(iframe);
        
        logMsg("<span style='color:#0f0'>🐔 Playing Astrochicken! (Arrow keys to fly, Space to throw eggs, R to reset)</span>");
      } else {
        gameContainer.innerHTML = '<div style="color: red; padding: 20px;">Failed to load Astrochicken assets.</div>';
      }
    } else {
      gameContainer.innerHTML = '<div style="color: red; padding: 20px;">Assets not loaded.</div>';
    }
    
    // ESC to close
    const escHandler = (e) => {
      if(e.key === 'Escape') {
        closeAstrochicken();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  };

  // ── E11: Macro Help Modal ──────────────────────────────────────────────────
  window.showMacroHelp = function() {
    const html = `
<div style="max-width:500px;max-height:70vh;overflow-y:auto;font-family:monospace;font-size:11px;color:#ccc;padding:16px;">
  <h2 style="color:#4f4;margin-bottom:12px;">Macro System Help</h2>

  <h3 style="color:#b8860b;">Syntax</h3>
  <pre style="background:#0a0a0a;padding:8px;border-radius:4px;font-size:10px;">/macro NAME TRIGGER: COMMAND</pre>
  <p>NAME: macro identifier<br>
  TRIGGER: turn|hp:&lt;N|&gt;N|=N|move|combat|idle<br>
  COMMAND: any valid console command</p>

  <h3 style="color:#b8860b;margin-top:12px;">Triggers</h3>
  <table style="width:100%;border-collapse:collapse;font-size:10px;">
    <tr><td style="color:#4af;padding:2px 8px;">turn</td><td>Every player turn</td></tr>
    <tr><td style="color:#4af;padding:2px 8px;">hp:&lt;25</td><td>When HP drops below 25</td></tr>
    <tr><td style="color:#4af;padding:2px 8px;">hp:&gt;50</td><td>When HP above 50%</td></tr>
    <tr><td style="color:#4af;padding:2px 8px;">combat</td><td>When enemy in view</td></tr>
    <tr><td style="color:#4af;padding:2px 8px;">idle</td><td>No enemies nearby</td></tr>
    <tr><td style="color:#4af;padding:2px 8px;">move</td><td>On each movement step</td></tr>
  </table>

  <h3 style="color:#b8860b;margin-top:12px;">Available Commands</h3>
  <table style="width:100%;border-collapse:collapse;font-size:10px;">
    <tr><td style="color:#fa4;padding:2px 8px;">/use &lt;item&gt;</td><td>Use item by name or emoji</td></tr>
    <tr><td style="color:#fa4;padding:2px 8px;">/cast &lt;spell&gt;</td><td>Cast spell by name</td></tr>
    <tr><td style="color:#fa4;padding:2px 8px;">/equip &lt;item&gt;</td><td>Equip item from inventory</td></tr>
    <tr><td style="color:#fa4;padding:2px 8px;">/say &lt;text&gt;</td><td>Log message to game log</td></tr>
    <tr><td style="color:#fa4;padding:2px 8px;">/tp &lt;x&gt; &lt;y&gt;</td><td>Teleport (debug)</td></tr>
    <tr><td style="color:#fa4;padding:2px 8px;">/give &lt;item&gt;</td><td>Add item to inventory (debug)</td></tr>
  </table>

  <h3 style="color:#b8860b;margin-top:12px;">Variables</h3>
  <table style="width:100%;border-collapse:collapse;font-size:10px;">
    <tr><td style="color:#c8a;padding:2px 8px;">HP</td><td>Current HP (0-maxHp)</td></tr>
    <tr><td style="color:#c8a;padding:2px 8px;">HP%</td><td>HP as percentage</td></tr>
    <tr><td style="color:#c8a;padding:2px 8px;">MP</td><td>Current MP (0-maxMp)</td></tr>
    <tr><td style="color:#c8a;padding:2px 8px;">LEVEL</td><td>Player level</td></tr>
    <tr><td style="color:#c8a;padding:2px 8px;">FLOOR</td><td>Current dungeon floor</td></tr>
    <tr><td style="color:#c8a;padding:2px 8px;">GOLD</td><td>Current gold</td></tr>
    <tr><td style="color:#c8a;padding:2px 8px;">ENEMIES</td><td>Enemies visible count</td></tr>
  </table>

  <h3 style="color:#b8860b;margin-top:12px;">Example Macros</h3>
  <pre style="background:#0a0a0a;padding:8px;border-radius:4px;font-size:10px;color:#4af;">/macro healOnLow hp:&lt;25: /use 🧪
/macro castOnFull mp:&gt;80: /cast illuminate
/macro autoPortal hp:&lt;10: /cast portal</pre>

  <h3 style="color:#b8860b;margin-top:12px;">Managing Macros</h3>
  <pre style="background:#0a0a0a;padding:8px;border-radius:4px;font-size:10px;">/macro list          - Show all macros
/macro delete NAME   - Delete a macro
/macro clear         - Delete all macros</pre>

  <button onclick="document.getElementById('macro-help-modal').style.display='none'"
    style="margin-top:12px;background:#1a2a1a;border:1px solid #3a5a3a;color:#4f4;padding:4px 16px;cursor:pointer;border-radius:4px;font-family:monospace;">
    Close
  </button>
</div>`;

    let modal = document.getElementById('macro-help-modal');
    if(!modal) {
      modal = document.createElement('div');
      modal.id = 'macro-help-modal';
      modal.className = 'draggable-modal';
      modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#111;border:2px solid #3a5a3a;border-radius:8px;z-index:9999;box-shadow:0 0 40px rgba(0,100,0,0.5);';
      document.body.appendChild(modal);
    }
    const fullHtml = `
<div class="modal-header"><span>📘 Macro Help</span><button class="modal-close" onclick="document.getElementById('macro-help-modal').style.display='none'">✖</button></div>
<div class="modal-body" style="max-width:500px;max-height:70vh;overflow-y:auto;font-family:monospace;font-size:11px;color:#ccc;padding:16px;">
${html}
</div>`;
    modal.innerHTML = fullHtml;
    modal.style.display = 'block';
    bringToFront(modal);
    // ESC to close
    const escHandler = (e) => {
      if(e.key === 'Escape' && modal.style.display !== 'none') {
        modal.style.display = 'none';
      }
    };
    document.addEventListener('keydown', escHandler);
  };

  // ── E12: Macro Builder Panel ───────────────────────────────────────────────
  window.toggleMacroBuilder = function() {
    let panel = document.getElementById('macro-builder-panel');
    if(panel) {
      if(panel.style.display === 'none') {
        panel.style.display = 'block';
        bringToFront(panel);
      } else {
        panel.style.display = 'none';
      }
      return;
    }

    panel = document.createElement('div');
    panel.id = 'macro-builder-panel';
    panel.className = 'draggable-modal';
    panel.style.cssText = 'position:fixed;top:10%;right:10px;width:340px;max-height:80vh;overflow-y:auto;background:#111;border:2px solid #3a4a6a;border-radius:8px;z-index:9998;padding:0;font-family:monospace;font-size:11px;';

    panel.innerHTML = `
<div class="modal-header"><span>⚙️ Macro Builder</span><button class="modal-close" onclick="document.getElementById('macro-builder-panel').style.display='none'">✖</button></div>
<div class="modal-body" style="padding:12px;max-height:calc(80vh - 40px);overflow-y:auto;">
<h3 style="color:#4af;margin-bottom:8px;">&#9881; Macro Builder</h3>
<div style="color:#888;font-size:10px;margin-bottom:8px;">Drag blocks to build. Output shown below.</div>

<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">
  <div style="background:#1a1a2a;border:1px solid #336;padding:4px 8px;border-radius:3px;cursor:grab;color:#88f;"
    draggable="true" ondragstart="macroBuilderDrag(event,'IF HP')" title="Condition: HP check">IF HP</div>
  <div style="background:#1a1a2a;border:1px solid #336;padding:4px 8px;border-radius:3px;cursor:grab;color:#88f;"
    draggable="true" ondragstart="macroBuilderDrag(event,'IF MP')" title="Condition: MP check">IF MP</div>
  <div style="background:#1a1a2a;border:1px solid #336;padding:4px 8px;border-radius:3px;cursor:grab;color:#88f;"
    draggable="true" ondragstart="macroBuilderDrag(event,'IF ENEMIES')" title="Condition: enemy count">IF ENEMIES</div>
  <div style="background:#1a2a1a;border:1px solid #363;padding:4px 8px;border-radius:3px;cursor:grab;color:#4f4;"
    draggable="true" ondragstart="macroBuilderDrag(event,'USE')" title="Action: use item">USE</div>
  <div style="background:#1a2a1a;border:1px solid #363;padding:4px 8px;border-radius:3px;cursor:grab;color:#4f4;"
    draggable="true" ondragstart="macroBuilderDrag(event,'CAST')" title="Action: cast spell">CAST</div>
  <div style="background:#1a2a1a;border:1px solid #363;padding:4px 8px;border-radius:3px;cursor:grab;color:#4f4;"
    draggable="true" ondragstart="macroBuilderDrag(event,'EQUIP')" title="Action: equip item">EQUIP</div>
  <div style="background:#2a1a1a;border:1px solid #633;padding:4px 8px;border-radius:3px;cursor:grab;color:#f88;"
    draggable="true" ondragstart="macroBuilderDrag(event,'AND')" title="Logic: AND">AND</div>
  <div style="background:#2a1a1a;border:1px solid #633;padding:4px 8px;border-radius:3px;cursor:grab;color:#f88;"
    draggable="true" ondragstart="macroBuilderDrag(event,'OR')" title="Logic: OR">OR</div>
  <div style="background:#2a1a1a;border:1px solid #633;padding:4px 8px;border-radius:3px;cursor:grab;color:#f88;"
    draggable="true" ondragstart="macroBuilderDrag(event,'NOT')" title="Logic: NOT">NOT</div>
</div>

<div id="macro-drop-zone"
  style="min-height:60px;border:2px dashed #445;border-radius:4px;padding:8px;margin-bottom:8px;color:#666;"
  ondragover="event.preventDefault()" ondrop="macroBuilderDrop(event)">
  <span style="color:#666;">Drop blocks here to build macro...</span>
</div>

<div style="margin-bottom:4px;color:#888;font-size:10px;">Macro name:</div>
<input id="macro-name-input" placeholder="myMacro" style="width:100%;background:#0a0a0a;border:1px solid #444;color:#ccc;padding:4px;border-radius:3px;font-family:monospace;font-size:11px;box-sizing:border-box;margin-bottom:4px;">

<div style="margin-bottom:4px;color:#888;font-size:10px;">Trigger:</div>
<select id="macro-trigger-select" style="width:100%;background:#0a0a0a;border:1px solid #444;color:#ccc;padding:4px;border-radius:3px;font-family:monospace;font-size:11px;box-sizing:border-box;margin-bottom:8px;">
  <option value="turn">Every turn</option>
  <option value="hp:&lt;25">HP below 25%</option>
  <option value="hp:&lt;50">HP below 50%</option>
  <option value="mp:&lt;25">MP below 25%</option>
  <option value="combat">In combat</option>
  <option value="idle">No enemies</option>
  <option value="move">On movement</option>
</select>

<div style="color:#888;font-size:10px;margin-bottom:4px;">Generated command:</div>
<div id="macro-output" style="background:#0a0a0a;border:1px solid #444;border-radius:3px;padding:6px;min-height:30px;color:#4af;font-size:10px;margin-bottom:8px;word-break:break-all;"></div>

<div style="display:flex;gap:4px;">
  <button onclick="macroBuilderGenerate()" style="flex:1;background:#1a2a3a;border:1px solid #3a4a6a;color:#4af;padding:4px;border-radius:3px;cursor:pointer;font-family:monospace;font-size:10px;">Generate</button>
  <button onclick="macroBuilderInstall()" style="flex:1;background:#1a3a1a;border:1px solid #3a6a3a;color:#4f4;padding:4px;border-radius:3px;cursor:pointer;font-family:monospace;font-size:10px;">Install Macro</button>
  <button onclick="document.getElementById('macro-builder-panel').style.display='none'" style="background:#2a1a1a;border:1px solid #633;color:#f88;padding:4px 8px;border-radius:3px;cursor:pointer;font-family:monospace;font-size:10px;">&#x2715;</button>
</div>
</div>`;

    document.body.appendChild(panel);
    bringToFront(panel);
    // ESC to close
    const escHandler = (e) => {
      if(e.key === 'Escape' && panel.style.display !== 'none') {
        panel.style.display = 'none';
      }
    };
    document.addEventListener('keydown', escHandler);
  };

  window._macroParts = [];
  window.macroBuilderDrag = function(e, block) {
    e.dataTransfer.setData('text/plain', block);
  };
  window.macroBuilderDrop = function(e) {
    e.preventDefault();
    const block = e.dataTransfer.getData('text/plain');
    window._macroParts.push(block);
    macroBuilderRefresh();
  };
  window.macroBuilderRefresh = function() {
    const zone = document.getElementById('macro-drop-zone');
    if(zone) {
      zone.innerHTML = window._macroParts.length ? window._macroParts.map((p, i) =>
        `<span style="display:inline-block;background:#1a1a2a;border:1px solid #445;border-radius:3px;padding:2px 6px;margin:2px;color:#ccc;">${p} <span onclick="window._macroParts.splice(${i},1);macroBuilderRefresh()" style="color:#f44;cursor:pointer;">&#x2715;</span></span>`
      ).join('') : '<span style="color:#666;">Drop blocks here...</span>';
    }
    macroBuilderGenerate();
  };
  window.macroBuilderGenerate = function() {
    const name = (document.getElementById('macro-name-input') || {}).value || 'myMacro';
    const trigger = (document.getElementById('macro-trigger-select') || {}).value || 'turn';
    const parts = window._macroParts;
    let action = '/say action';
    const actionIdx = parts.findIndex(p => ['USE','CAST','EQUIP'].includes(p));
    if(actionIdx >= 0) {
      const act = parts[actionIdx].toLowerCase();
      action = `/${act} [item]`;
    }
    const cmd = `/macro ${name} ${trigger}: ${action}`;
    const out = document.getElementById('macro-output');
    if(out) out.textContent = cmd;
  };
  window.macroBuilderInstall = function() {
    const out = document.getElementById('macro-output');
    if(!out || !out.textContent) return;
    const cmd = out.textContent.trim();
    if(typeof window.handleDebugCommand === 'function') {
      window.handleDebugCommand(cmd);
      if(typeof logMsg === 'function') logMsg(`<span style='color:#4f4'>Macro installed: ${cmd}</span>`);
    } else if(typeof debugLog === 'function') {
      debugLog(`Copy this to console: ${cmd}`);
    }
  };

  window.copyDebugLog = function() {
    const logDiv = document.getElementById('log');
    if(!logDiv) { alert('No log found.'); return; }
    const entries = logDiv.querySelectorAll('.log-entry');
    let text = '';
    entries.forEach(e => {
      const time = e.querySelector('.log-time');
      const msg = e.querySelector('.log-new');
      if(time && msg) text += time.textContent + ' ' + msg.textContent + '\n';
      else text += e.textContent + '\n';
    });
    navigator.clipboard.writeText(text).then(() => {
      if(typeof logMsg === 'function') logMsg("<span style='color:#8f8'>Log copied to clipboard! (" + entries.length + " entries)</span>");
    }).catch(() => {
      // Fallback: create textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      if(typeof logMsg === 'function') logMsg("<span style='color:#8f8'>Log copied to clipboard! (" + entries.length + " entries)</span>");
    });
  };

  window.closeAstrochicken = function() {
    const modal = document.getElementById('astrochicken-modal');
    if(modal) {
      // Clean up blob URLs
      const iframe = modal.querySelector('iframe');
      if(iframe && iframe.src) {
        URL.revokeObjectURL(iframe.src);
      }
      modal.remove();
    }
  };
