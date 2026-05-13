  /*
  SHOP MODULE – NPC MERCHANTS, TRADING, AND QUEST INTERACTIONS
  =============================================================
  This module implements the game's shop system, providing interactive merchant interfaces
  for buying items, selling loot, identifying mystery items, and advancing quest-related
  dialogue. Each NPC vendor has a distinct personality and inventory.

  Key responsibilities:
  1. Shop UI rendering (openShop/openStore) – generates modal HTML for each NPC type
  2. NPC-specific logic – Apu (bags, potions, prophylactic easter egg, family dialogue),
     Deckard Cain (bulk identification), Dennis (constitutional convention),
     Librarian/bookstore (spellbooks, Grue lore), Fence (stolen goods),
     Lefty's Bar (whiskey, mystery woman encounter)
  3. Transaction handling – buying items, selling to fence, buying back stolen items
  4. Inventory management – automatic inventory stashing when inventory is full
  5. Quest progression – Dennis' political commentary, safety warnings

  openShop() is the engine.js-facing entry point; openStore() is the internal renderer.
*/
// === Shop & Quest Interaction System ===

  // ── NPC Face Animation ──
  // Returns an <img> tag if the GIF is loaded, otherwise falls back to an emoji span.
   // NPC movie files (from movies.zip). Path relative to built HTML file.
   // Note: 'dennis' (Monty Python peasant) has no movie yet — falls back to 👨‍🌾 emoji.
   // Cousin Dave appears under 'apu' shop type when currentScene === 'beach'.
    // NPC movie keys in asset bundle: 'movie_apu', 'movie_cain', 'movie_erasmus', 'movie_pacifist_orc'
    // Also 'movie_cousin_dave' for town variant of apu
    // Class videos: 'movie_fighter', 'movie_rogue', 'movie_spellcaster'

   // Shared video element — reused for all NPC dialogs to avoid creating many elements
   let _npcVideoEl = null;
   function getNPCVideoEl() {
     if(!_npcVideoEl) {
       _npcVideoEl = document.createElement('video');
       _npcVideoEl.muted = true;
       _npcVideoEl.loop  = true;
       _npcVideoEl.playsInline = true;
       _npcVideoEl.autoplay = true;
        _npcVideoEl.style.cssText = 'width:200px;height:200px;object-fit:cover;border-radius:12px;border:2px solid var(--border,#444);display:block;margin:0 auto 8px;';
     }
     return _npcVideoEl;
   }

    // Resolve NPC movie source: only from embedded base64 in assets bundle
    function getNPCMovieSrc(npcType) {
      // Check loaded asset bundles for embedded version (key: 'movie_<type>')
      const assetKey = 'movie_' + npcType;
      if(window.assets && window.assets.movies && window.assets.movies[assetKey]) {
        return window.assets.movies[assetKey]; // base64 data URL
      }
      return null; // No video available in asset bundle
    }

   // Start playing movie for a given NPC type; call after dialog HTML is injected.
    function startNPCVideo(npcType) {
      const src = getNPCMovieSrc(npcType);
      if(!src) return;
      setTimeout(() => {
        const container = document.getElementById('npc-face-container');
        if(!container) return;
        const vid = getNPCVideoEl();
        var vidSrc = src;
        // Convert data URL to blob URL for more reliable playback
        if(src.startsWith('data:')) {
          try {
            var parts = src.split(',');
            var mime = parts[0].match(/:(.*?);/)[1];
            var b64 = atob(parts[1]);
            var arr = new Uint8Array(b64.length);
            for(var i = 0; i < b64.length; i++) arr[i] = b64.charCodeAt(i);
            vidSrc = URL.createObjectURL(new Blob([arr], {type: mime}));
          } catch(e) { /* fall back to data URL */ }
        }
        if(vid.getAttribute('data-src') !== npcType) {
          vid.src = vidSrc;
          vid.setAttribute('data-src', npcType);
          vid.load();
        }
        vid.play().catch(() => {});
        if(!vid.parentElement || vid.parentElement !== container) {
          container.innerHTML = '';
          container.appendChild(vid);
        }
      }, 20);
    }

   // Stop/pause the NPC video when dialog closes
   function stopNPCVideo() {
     if(_npcVideoEl && !_npcVideoEl.paused) {
       _npcVideoEl.pause();
     }
   }
   window.stopNPCVideo = stopNPCVideo;

    function npcFaceHTML(gifKey, fallbackEmoji, npcType) {
      const largePortraitKeys = new Set([
        'npc_scummbar_modal',
        'npc_thief_modal',
        'npc_bridgekeeper_modal',
        'npc_swordmaster_modal',
        'npc_lowly_pirate_1','npc_lowly_pirate_2','npc_lowly_pirate_3','npc_lowly_pirate_4','npc_lowly_pirate_5'
      ]);
      const portraitByNpcType = {
        cohen: 'npc_cohen',
        vimes: 'npc_vimes',
        librarian: 'npc_librarian',
        bearded_dwarf: 'npc_bearded_dwarf'
      };

      // Prefer static portraits for Mended Drum regulars in individual chat trees.
      if(npcType && portraitByNpcType[npcType] && window.assets && window.assets.sprites && window.assets.sprites[portraitByNpcType[npcType]]) {
        const s = window.assets.sprites[portraitByNpcType[npcType]];
        const src2 = (typeof s === 'string') ? s : (s && s.src ? s.src : null);
        if(!src2) return `<p style="font-size:60px; margin:5px 0;">${fallbackEmoji || ''}</p>`;
        return `<img src="${src2}" style="width:200px; height:200px; object-fit:cover; border-radius:12px; border:2px solid var(--border,#444); display:block; margin:0 auto 8px;" alt="">`;
      }

      // If this NPC has a movie in asset bundle, return a container div that startNPCVideo() will populate
      if(npcType && window.assets && window.assets.movies && window.assets.movies['movie_' + npcType]) {
        return `<div id="npc-face-container" style="text-align:center;min-height:208px;"></div>`;
      }
      let gif = window.assets && window.assets.sprites && window.assets.sprites[gifKey];
     let src = gif && gif.src ? gif.src : (typeof gif === 'string' ? gif : null);
     if(src && (src.startsWith('data:image/gif') || src.startsWith('data:image/'))) {
       const large = largePortraitKeys.has(gifKey);
       const size = large ? 220 : 80;
       return `<img src="${src}" onerror="this.style.display='none'" style="width:${size}px; height:${size}px; object-fit:contain; image-rendering:auto; border-radius:8px;" alt="">`;
     }
     return `<span id="npc-face" style="font-size:60px;">${fallbackEmoji}</span>`;
   }

  // Keep cycling expression for fallback emoji path
  let _npcAnimInterval = null;
  function startNPCAnimation(elementId, frames, ms) {
    if(_npcAnimInterval) clearInterval(_npcAnimInterval);
    let idx = 0;
    _npcAnimInterval = setInterval(() => {
      let el = document.getElementById(elementId);
      if(!el || document.getElementById('overlay').style.display === 'none') {
        clearInterval(_npcAnimInterval); _npcAnimInterval = null; return;
      }
      idx = (idx + 1) % frames.length;
      el.textContent = frames[idx];
    }, ms);
  }

  const APU_FACES     = ['😊','😮','😏','😟','😉','🙂','😄','😌','😑'];
  const APU_FACES_SELL= ['😄','🤑','😁','💰','😏','🤝'];
  const WIZARD_FACES  = ['🧙','😮','🤔','😏','😄','🤨','😌','🧐','🤫'];

  function apuFace(mode) {
    return mode === 'sell' ? APU_FACES_SELL[Math.floor(Math.random() * APU_FACES_SELL.length)]
                           : APU_FACES[Math.floor(Math.random() * APU_FACES.length)];
  }
  function wizardFace() {
    return WIZARD_FACES[Math.floor(Math.random() * WIZARD_FACES.length)];
  }

  const APU_VOICE_BY_LINE = {
    'Thank you, come again!': 'voice_apu_store_line_thank_you',
    'I have eight brothers and a cousin named Dave.': 'voice_apu_store_line_family',
    "Cousin Dave says the hedge road east is safe enough, provided you don't ask what happened to aisle nine.": 'voice_apu_dave_hedge_hint',
  };

  function playVoiceClip(name) {
    if(typeof Sound !== 'undefined' && Sound.playVoice) {
      setTimeout(() => Sound.playVoice(name), 30);
    }
  }

  function playApuVoiceForLine(line) {
    const key = APU_VOICE_BY_LINE[line];
    if(key) playVoiceClip(key);
  }

  window.showInsufficientFunds = function(type, cost, label = 'that') {
    if(typeof Sound !== 'undefined') {
      if(Sound.errorBuzz) Sound.errorBuzz();
      else Sound.playTone(150, 'sawtooth', 0.3, 0.1);
    }
    // Voice the refusal if available
    const voiceRefusals = {
      fence:    'voice_fence_broke',
      chaplain: 'voice_chaplain_no_gold',
    };
    if(voiceRefusals[type] && typeof Sound !== 'undefined' && Sound.playVoice) {
      setTimeout(() => Sound.playVoice(voiceRefusals[type]), 60);
    }
    const brokeLines = {
      apu: [
        'Thank you, come again! ...when you have the money.',
        'Your wallet seems to be on a strict famine diet.',
      ],
      wizard: [
        'A wizard may know many things, but how to conjure you more gold is not one of them.',
        'You are several purse-strings short of adequate.',
      ],
      cain: [
        'Stay awhile and listen... then come back with 100 gold.',
        'I can identify artifacts, but not imaginary coins.',
      ],
      dennis: [
        'Executive privilege appears to have skipped your purse.',
        'That is no basis for a system of purchasing.',
      ],
      leftys: [
        'Lefty pats the bar and suggests you try thirst instead.',
        'The tab is closed, chiefly because you never opened it.',
      ],
      chaplain: [
        'The FSM forgives your poverty, though the collection plate does not.',
      ],
      fence: [
        'The fence squints. "That is not enough, pal."',
      ],
      _generic: [
        'Not enough gold.',
        'Come back richer.',
      ]
    };
    const lines = brokeLines[type] || brokeLines._generic;
    const line = lines[Math.floor(Math.random() * lines.length)];
    logMsg(`<span style='color:var(--error)'>Not enough gold for ${label} (${cost}g). ${line}</span>`);
    return false;
  };

  function addPurchasedItem(icon, qty = 1) {
    let def = ItemDef.byIcon(icon) || {};
    let remaining = qty;
    let nextInventory = inventory.map(item => item ? { ...item } : null);
    if(def.stackable) {
      const maxStack = def.maxStack ?? 10;
      for(let i = 0; i < nextInventory.length && remaining > 0; i++) {
        let item = nextInventory[i];
        if(!item || item.icon !== icon) continue;
        let room = maxStack - (item.qty ?? 1);
        if(room <= 0) continue;
        let moved = Math.min(room, remaining);
        item.qty = (item.qty ?? 1) + moved;
        remaining -= moved;
      }
    }
    for(let i = 0; i < nextInventory.length && remaining > 0; i++) {
      if(nextInventory[i] !== null) continue;
      let stackQty = def.stackable ? Math.min(def.maxStack ?? 10, remaining) : 1;
      nextInventory[i] = { icon, qty: stackQty };
      remaining -= stackQty;
    }
    if(remaining > 0) return false;
    inventory.splice(0, inventory.length, ...nextInventory);
    if(typeof renderQuickslots === 'function') renderQuickslots();
    if(typeof renderInventory === 'function') renderInventory();
    return true;
  }

  // === Apu Prophylactic Easter Egg ===
  function larryEasterEgg(step, desc="") {
    let m = document.getElementById('modal-content');
    Sound.gibberish();
    if(step === 0) {
      m.innerHTML = `<h2>🏪 Apu's Mart</h2>
        ${npcFaceHTML('npc_apu', '🧔🏿', 'apu')}
        <p>🧔🏿‍♂️ "Ah, the ${ItemDef.iconOf('prophylactic')}! A wise choice, my friend. Let's get you <em>exactly</em> the right fit."</p>
        <p>🧔🏿‍♂️ "Now: will that be Plain or Ribbed?"</p>
        <button class="egg-btn" onclick="larryEasterEgg(1, 'Plain')">Plain</button>
        <button class="egg-btn" onclick="larryEasterEgg(1, 'Ribbed')">Ribbed</button>
        <button class="egg-btn" onclick="larryEasterEgg(1, 'Zigzag')">Zigzag</button>`;
      playVoiceClip('voice_apu_larry_0');
    } else if (step === 1) {
      m.innerHTML = `<h2>🏪 Apu's Mart</h2>
        ${npcFaceHTML('npc_apu', '🧔🏿', 'apu')}
        <p>🧔🏿‍♂️ "${desc}, nice. Colored or Clear?"</p>
        <button class="egg-btn" onclick="larryEasterEgg(2, '${desc}, Colored')">Colored</button>
        <button class="egg-btn" onclick="larryEasterEgg(2, '${desc}, Clear')">Clear</button>
        <button class="egg-btn" onclick="larryEasterEgg(2, '${desc}, Glow-in-the-Dark')">Glow-in-the-Dark</button>`;
      playVoiceClip('voice_apu_larry_1');
    } else if (step === 2) {
      m.innerHTML = `<h2>🏪 Apu's Mart</h2>
        ${npcFaceHTML('npc_apu', '🧔🏿', 'apu')}
        <p>🧔🏿‍♂️ "Hmm, yes. And would you like that Lubricated or Dry?"</p>
        <button class="egg-btn" onclick="larryEasterEgg(3, '${desc}, Lubricated')">Lubricated</button>
        <button class="egg-btn" onclick="larryEasterEgg(3, '${desc}, Dry')">Dry</button>
        <button class="egg-btn" onclick="larryEasterEgg(3, '${desc}, Menthol')">Menthol</button>`;
      playVoiceClip('voice_apu_larry_2');
    } else if (step === 3) {
      m.innerHTML = `<h2>🏪 Apu's Mart</h2>
        ${npcFaceHTML('npc_apu', '🧔🏿', 'apu')}
        <p>🧔🏿‍♂️ "Very wise. Now, would you like that in Magnums?"</p>
        <p style="font-size:11px; color:#888;">*Apu glances down and back up.*</p>
        <p>🧔🏿‍♂️ "...or shall we say, <em>not</em> Magnums?"</p>
        <button class="egg-btn" onclick="larryEasterEgg(4, '${desc}')">"Uh... regular size."</button>
        <button class="egg-btn" onclick="larryEasterEgg(4, '${desc}')">"Just give me whichever."</button>
        <button class="egg-btn" style="background:var(--surface-container)" onclick="finishLarryEgg()"">Actually, forget it...</button>`;
      playVoiceClip('voice_apu_larry_3');
    } else if (step === 4) {
      Sound.scream();
      m.innerHTML = `<h2>📢 LOUDSPEAKER</h2>
        <p style="color:var(--error); font-weight:bold; font-size:18px; text-transform:uppercase;">
        "ATTENTION SHOPPERS! PRICE CHECK AT REGISTER 1!<br>
        ONE ${ItemDef.iconOf('prophylactic')} — ${desc.toUpperCase()}!<br>
        FOR THE GENTLEMAN IN THE <em>LEISURE SUIT!</em>"</p>
        <p style="font-size:11px; color:#aaa;">*Apatosaurus-sized beetles, every one.*</p>
        <button class="egg-btn" style="background:var(--surface-container)" onclick="finishLarryEgg()">Hide in shame...</button>`;
    }
  }

  window.finishLarryEgg = function() {
    logMsg("<span style='color:var(--warning)'>Unseen customers poke their heads out and yell: 'Pervert!'</span>");
    let emptyIdx = inventory.findIndex(i => i === null);
    if(emptyIdx !== -1) {
      changeGold(-1);
      inventory[emptyIdx] = new ItemStack('prophylactic', 1);
      renderQuickslots(); updateUI();
    }
    openStore('apu');
  };

  // === Apu Family Dialogue ===
  window.askApu = function() {
    let m = document.getElementById('modal-content');
    Sound.gibberish();
    if(player.storesVisited === 2) {
      m.innerHTML = `<h2>🏪 Apu's Mart</h2>
        <p>🙋 "Hey Apu, how did you get down here? I just saw you on the other floor!"</p>
        <p>🧔🏿‍♂️ "Oh, that was not me! That was my brother, Sanji! He looks exactly like me. Very confusing, I know!"</p>
        <button style="margin-top:16px;" onclick="openStore('apu')">Go back to shopping</button>`;
      playVoiceClip('voice_apu_askapu_2');
    } else if(player.storesVisited === 3) {
      m.innerHTML = `<h2>🏪 Apu's Mart</h2>
        <p>🙋 "Another one? Is this Sanji again?"</p>
        <p>🧔🏿‍♂️ "No, no! This is my other brother, Manjula! We are a very large family. All in the convenience business!"</p>
        <button style="margin-top:16px;" onclick="openStore('apu')">Sure...</button>`;
      playVoiceClip('voice_apu_askapu_3');
    } else {
      // After 3rd visit: offer franchise opportunity
      m.innerHTML = `<h2>🏪 Apu's Mart</h2>
        <p>🙋 "Wait, how many of you ARE there??"</p>
        <p>🧔🏿‍♂️ "I have eight brothers, three sisters, and a cousin named Dave. We have a very efficient franchise model for deep-dungeon logistics."</p>
        <p>🧔🏿‍♂️ "You know... if you're interested, I could put in a good word at KwikeeMart Headquarters. Ever thought about owning your own franchise?"</p>
        <button style="margin-top:8px;" onclick="apuFranchiseStep(0)">"Tell me more..."</button>
        <button style="margin-top:8px; background:var(--surface-container)" onclick="openStore('apu')">"No thanks, just the Slurpees."</button>`;
      playVoiceClip('voice_apu_askapu_4');
    }
  };

  // === E7: Apu "Why dungeon?" Dialog (cycling) ===
  const APU_DUNGEON_REASONS = [
    "The rent is very reasonable, I assure you. Have you seen Tristram property prices lately?",
    "The monsters never steal. They may eat you, but they are very honest about it.",
    "It is a family tradition. My father ran a shop in a dungeon. His father before him — also a dungeon.",
    "I am one-twelfth monster myself, you know. My great-grandmother was a Yeti. Very entrepreneurial woman.",
    "What dungeon? Oh! Yes, well, when I set up shop this was a very nice neighborhood. Then all of... this... happened.",
  ];
  let _apuDungeonIdx = 0;
  window.askApuWhyDungeon = function() {
    let m = document.getElementById('modal-content');
    Sound.gibberish();
    let line = APU_DUNGEON_REASONS[_apuDungeonIdx % APU_DUNGEON_REASONS.length];
    _apuDungeonIdx++;
    m.innerHTML = `<h2>🏪 Apu's Mart</h2>
      ${npcFaceHTML('npc_apu', '🧔🏿', 'apu')}
      <p>🙋 "Why do you run a shop in a dungeon?"</p>
      <p>🧔🏿‍♂️ "${line}"</p>
      <button style="margin-top:16px;" onclick="openStore('apu')">Go back to shopping</button>`;
    setTimeout(() => startNPCAnimation('npc-face', APU_FACES, 1200), 30);
    const voiceIdx = ((_apuDungeonIdx - 1) % APU_DUNGEON_REASONS.length + APU_DUNGEON_REASONS.length) % APU_DUNGEON_REASONS.length;
    setTimeout(() => playVoiceClip(`voice_apu_dungeon_${voiceIdx}`), 30);
  };

  // === Apu Franchise Dialog Tree (v7.2.4) ===
  let franchiseStep = 0;
  window.apuFranchiseStep = function(step) {
    let m = document.getElementById('modal-content');
    Sound.gibberish();
    franchiseStep = step;

    if(step === 0) {
      m.innerHTML = `<h2>🏪 Franchise Opportunities</h2>
        ${npcFaceHTML('npc_apu', '🧔🏿', 'apu')}
        <p>🧔🏿‍♂️ "Excellent! KwikeeMart has been expanding into dungeons since... well, since the dungeon market started booming."</p>
        <p>🧔🏿‍♂️ "We have locations in every dungeon, tomb, and haunted castle from here to the Himalayas."</p>
        <p>🧔🏿‍♂️ "KwikeeMart HQ is at 221B Baker Street, Himalayas. Very hard to find. You need a sherpa and three forms of ID."</p>
        <button onclick="apuFranchiseStep(1)" style="margin-top:8px;">"How do I apply?"</button>
        <button onclick="openStore('apu')" style="margin-top:8px; background:var(--surface-container);">"Nevermind..."</button>`;
      playVoiceClip('voice_apu_franchise_0');
    }
    else if(step === 1) {
      // Application fee: 10 cockroach legs
      let hasLegs = inventory.some(i => i && i.itemName === 'cockroachLegStale');
      m.innerHTML = `<h2>🏪 Application Fee</h2>
        ${npcFaceHTML('npc_apu', '🧔🏿', 'apu')}
        <p>🧔🏿‍♂️ "First, we need to verify your commitment. The application fee is 10 cockroach legs."</p>
        <p>🧔🏿‍♂️ "Don't ask why. It's a tradition dating back to the founding of KwikeeMart in... 1847. In a sewer. In Calcutta."</p>
        ${hasLegs
          ? `<button onclick="apuFranchiseStep(2)" style="margin-top:8px;">"Here you go — 10 cockroach legs!"</button>
             <p style="font-size:10px; color:#888;">*You do NOT have 10 cockroach legs. This is a test of your boldness.*</p>`
          : `<p style="color:var(--error); font-size:12px;">Come back when you have 10 cockroach legs. (You currently don't.)</p>
              <button onclick="openStore('apu')" style="margin-top:8px; background:var(--surface-container);">"I'll... go find some."</button>`}`;
      playVoiceClip('voice_apu_franchise_1');
      if(hasLegs) {
        // Remove cockroach legs if they somehow have them
        for(let i = 0; i < inventory.length; i++) {
          if(inventory[i] && inventory[i].itemName === 'cockroachLegStale') { inventory[i] = null; break; }
        }
        renderQuickslots();
      }
    }
    else if(step === 2) {
      m.innerHTML = `<h2>🏪 Paperwork</h2>
        ${npcFaceHTML('npc_apu', '🧔🏿', 'apu')}
        <p>🧔🏿‍♂️ "Wonderful! The cockroach legs will be... disposed of. Properly. Don't worry about it."</p>
        <p>🧔🏿‍♂️ "Now, I need you to fill out Form 37-B: 'Intent to Establish a Convenience Store in a Hostile Environment.'" </p>
        <p>🧔🏿‍♂️ "The form is in triplicate. Each copy must be signed in triplicate. That's nine signatures. All in different inks."</p>
        <p>🧔🏿‍♂️ "Also, we need 3 burnt-out candles as a processing fee. KwikeeMart HQ uses them to... light the offices."</p>
        <button onclick="apuFranchiseStep(3)" style="margin-top:8px;">"I'll bring you 3 burnt-out candles!"</button>
        <button onclick="openStore('apu')" style="margin-top:8px; background:var(--surface-container);">"This sounds like a scam."</button>`;
      playVoiceClip('voice_apu_franchise_2');
    }
    else if(step === 3) {
      // Second fee: wet rat tails
      m.innerHTML = `<h2>🏪 The Fine Print</h2>
        ${npcFaceHTML('npc_apu', '🧔🏿', 'apu')}
        <p>🧔🏿‍♂️ "Ah, the burnt-out candles! Excellent. But wait — there's a small additional fee."</p>
        <p>🧔🏿‍♂️ "KwikeeMart requires all franchisees to provide a Wet Rat's Tail as proof of..." </p>
        <p>🧔🏿‍♂️ "...honestly, I don't remember why. My brother Sanji started this requirement. Something about pest control."</p>
        <p>🧔🏿‍♂️ "Also, we need you to attend a 47-hour orientation seminar. It's held at the Himalayas HQ. There's a waiting list."</p>
        <button onclick="apuFranchiseStep(4)" style="margin-top:8px;">"I'll get the wet rat tail!"</button>
        <button onclick="openStore('apu')" style="margin-top:8px; background:var(--surface-container);">"This is ABSURD."</button>`;
      playVoiceClip('voice_apu_franchise_3');
    }
    else if(step === 4) {
      m.innerHTML = `<h2>🏪 KwikeeMart HQ</h2>
        ${npcFaceHTML('npc_apu', '🧔🏿', 'apu')}
        <p>🧔🏿‍♂️ "The wet rat tail! Perfect. KwikeeMart HQ in the Himalayas sends their regards."</p>
        <p>🧔🏿‍♂️ "I just got a memo from the VP of Dungeon Franchising. He says — and I quote — 'Tell them no.'" </p>
        <p>🧔🏿‍♂️ "But don't worry! I talked to my cousin Dave and he said he can pull some strings."</p>
        <p>🧔🏿‍♂️ "Dave's connections are... questionable. But effective."</p>
        <button onclick="apuFranchiseStep(5)" style="margin-top:8px;">"What did Dave say?"</button>`;
      playVoiceClip('voice_apu_franchise_4');
    }
    else if(step === 5) {
      m.innerHTML = `<h2>🏪 Cousin Dave's Deal</h2>
        ${npcFaceHTML('npc_apu', '🧔🏿', 'apu')}
        <p>🧔🏿‍♂️ "Dave says the franchise application was approved! Well... conditionally."</p>
        <p>🧔🏿‍♂️ "The condition is that you can never actually open a store. But you get an Apu's Club Card!"</p>
        <p>🧔🏿‍♂️ "It guarantees a free Squishee with every purchase. Every. Single. Purchase."</p>
        <p>🧔🏿‍♂️ "The fine print says the Squishee machine is always broken. But that's not MY problem."</p>
        <button onclick="apuFranchiseStep(6)" style="margin-top:8px;">"I'll take it!"</button>`;
      playVoiceClip('voice_apu_franchise_5');
    }
    else if(step === 6) {
      logMsg("<span style='color:var(--success)'>🧔🏿‍♂️ Apu hands you an Apu's Club Card!</span>");
      logMsg("<span style='color:var(--success)>'\"Free Squishee with every purchase! (Machine may be broken.)\"</span>");
      player.xp += 100; checkLevelUp();
      // Give player a useless but flavorful item
      let slot = inventory.findIndex(i => i === null);
      if(slot !== -1) inventory[slot] = new ItemStack('apusClubCard', 1);
      renderQuickslots();
      m.innerHTML = `<h2>🏪 Congratulations!</h2>
        ${npcFaceHTML('npc_apu', '🧔🏿', 'apu')}
        <p>🧔🏿‍♂️ "Welcome to the KwikeeMart family! Or... welcome to the periphery of the KwikeeMart family."</p>
        <p>🧔🏿‍♂️ "Your Apu's Club Card is in your inventory. It does nothing. But it's PRETTY."</p>
        <p>🧔🏿‍♂️ "Thank you, come again!"</p>
        <button onclick="openStore('apu')" style="margin-top:16px;">"I have so many questions..."</button>`;
      playVoiceClip('voice_apu_franchise_6');
    }
  };

  // === Lefty's Mystery Woman ===
  window.larryEncounter = function() {
    let m = document.getElementById('modal-content');
    let hasProp = inventory.some(i => i && i.itemName === 'prophylactic');
    let html = `<h2>🫦 Mystery Lady</h2>
      <p style="font-size:80px; margin:10px 0;">💃</p>
      <p>"Hello there, sailor. Care for a little... company?"</p>`;
    if(hasProp) {
      html += `<button class="egg-btn" style="background:var(--success)" onclick="finishLarryEncounter(true)">Use ${ItemDef.iconOf('prophylactic')} and proceed</button>`;
    } else {
      html += `<button class="egg-btn" style="background:var(--error)" onclick="finishLarryEncounter(false)">Proceed anyway...</button>`;
    }
    html += `<button class="egg-btn" onclick="openStore('leftys')">Nevermind</button>`;
    m.innerHTML = html;
    setTimeout(() => playVoiceClip('voice_mystery_lady_invite'), 30);
  };

  window.finishLarryEncounter = function(safe) {
    if(safe) {
      let idx = inventory.findIndex(i => i && i.itemName === 'prophylactic');
      decrementItem(idx);
      player.xp += 500;
      logMsg("<span style='color:var(--success)'>You survived the encounter and gained 500 XP! Safety first!</span>");
      setTimeout(() => playVoiceClip('voice_mystery_lady_safe'), 30);
      checkLevelUp();
      hideOverlay();
    } else {
      logMsg("<span style='color:var(--error)'>You caught an incurable social disease!</span>");
      document.getElementById('modal-content').innerHTML = `<h2>🤢 GAME OVER</h2>
        <p>You should have visited Apu first.<br>Safety is no accident.</p>
        <button onclick="location.reload()">Restart</button>`;
      setTimeout(() => playVoiceClip('voice_mystery_lady_unsafe'), 30);
      isDead = true; Sound.scream();
    }
  };

  // === Deckard Cain Bulk Identification ===
  function getUnidentifiedIcons() {
    if(!player.identifiedItems) player.identifiedItems = new Set();
    const out = [];
    const seen = new Set();
    const pushIfNeeded = (item) => {
      if(!item || !item.icon) return;
      if(player.identifiedItems.has(item.icon)) return;
      if(seen.has(item.icon)) return;
      seen.add(item.icon);
      out.push(item.icon);
    };
    inventory.forEach(pushIfNeeded);
    inventory.forEach(pushIfNeeded);
    return out;
  }

  window.bulkIdentify = function() {
    if(player.gp < 100) return showInsufficientFunds('cain', 100, 'Cain\'s services');
    if(!player.identifiedItems) player.identifiedItems = new Set();
    const toIdentify = getUnidentifiedIcons();
    if(toIdentify.length === 0) {
      logMsg("<span style='color:#888'>Cain squints at your gear. 'Everything here is already identified.'</span>");
      return;
    }
    changeGold(-100);
    logMsg("Deckard Cain intones: 'Stay awhile and listen...' — your entire haul is identified!");
    toIdentify.forEach(icon => player.identifiedItems.add(icon));
    if(typeof awardAchievement === 'function') awardAchievement('prophet');
    renderQuickslots();
    renderInventory();
    updateUI();
    hideOverlay();
  };

  window.identifyOneItem = function(icon) {
    if(!icon) return;
    if(player.gp < 1) return showInsufficientFunds('cain', 1, 'Single identification');
    if(!player.identifiedItems) player.identifiedItems = new Set();
    if(player.identifiedItems.has(icon)) {
      logMsg("<span style='color:#888'>That item type is already identified.</span>");
      return;
    }
    changeGold(-1);
    player.identifiedItems.add(icon);
    const def = ItemDef.byIcon(icon);
    logMsg(`<span style='color:var(--success)'>🧔 Cain identifies ${icon} ${def ? def.name : 'item'} for 1g.</span>`);
    if(typeof awardAchievement === 'function') awardAchievement('prophet');
    renderQuickslots();
    renderInventory();
    updateUI();
    openStore('cain');
    storeTab('buy', 'cain');
  };

  // === Wizard Grue Lore ===
  // === Grue Conversation Tree ===
  let grueStep = 0;
  window.askGrue = function() {
    let m = document.getElementById('modal-content');
    grueStep = 0;
    showGrueConversation(m);
  };

  function showGrueConversation(m) {
    if(grueStep === 0) {
      m.innerHTML = `<h2>📚 The Grue: What You Need to Know</h2>
        ${npcFaceHTML('npc_wizard', '🧙', 'erasmus')}
        <p>Wizard: "You ask about the Grue? Very well. What would you like to know?"</p>
        <button onclick="grueStep=1; showGrueConversation(document.getElementById('modal-content'))">What IS a Grue?</button>
        <button onclick="grueStep=2; showGrueConversation(document.getElementById('modal-content'))">How do I fight a Grue?</button>
        <button onclick="grueStep=3; showGrueConversation(document.getElementById('modal-content'))">Where do they come from?</button>
        <button onclick="grueStep=4; showGrueConversation(document.getElementById('modal-content'))">Is a Grue dangerous?</button>
        <button onclick="grueStep=5; showGrueConversation(document.getElementById('modal-content'))">How do I detect them?</button>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      setTimeout(() => playVoiceClip('voice_wizard_grue_anatomy'), 30);
    }
    else if(grueStep === 1) {
      m.innerHTML = `<h2>📚 The Grue: Anatomy</h2>
        ${npcFaceHTML('npc_wizard', '🧙', 'erasmus')}
        <p>Wizard: "A Grue is a dark creature of the night. It has slavering fangs and razor-sharp claws."</p>
        <p>Wizard: "They are said to melt when exposed to light — like snow, but more <em>evil</em>."</p>
        <p>Wizard: "I once saw one. It was eating a man. The man was screaming. It was very unpleasant."</p>
        <button onclick="grueStep=0; showGrueConversation(document.getElementById('modal-content'))">Back</button>
        <button onclick="grueStep=2; showGrueConversation(document.getElementById('modal-content'))">How do I fight one?</button>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      setTimeout(() => playVoiceClip('voice_wizard_grue_anatomy'), 30);
    }
    else if(grueStep === 2) {
      m.innerHTML = `<h2>📚 Fighting a Grue</h2>
        ${npcFaceHTML('npc_wizard', '🧙', 'erasmus')}
        <p>Wizard: "You can't. Well, you <em>could</em> try. But you'd die."</p>
        <p>Wizard: "A Grue is, as near as we can determine, invulnerable to most attacks."</p>
        <p>Wizard: "Light is your only defense. Carry a candle. Always."</p>
        <p>Wizard: "I heard a rumor that high intelligence helps you sense them before they eat you. But I may have made that up."</p>
        <button onclick="grueStep=0; showGrueConversation(document.getElementById('modal-content'))">Back</button>
        <button onclick="grueStep=5; showGrueConversation(document.getElementById('modal-content'))">How do I detect them?</button>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      setTimeout(() => playVoiceClip('voice_wizard_grue_fight'), 30);
    }
    else if(grueStep === 3) {
      m.innerHTML = `<h2>📚 Grue Origins</h2>
        ${npcFaceHTML('npc_wizard', '🧙', 'erasmus')}
        <p>Wizard: "Some say they come from a place called Zork. Others say they are the natural defenders of dark places."</p>
        <p>Wizard: "I once read a book that said Grues are actually quite friendly if you meet them in good lighting."</p>
        <p>Wizard: "That book was wrong. Do not trust that book."</p>
        <button onclick="grueStep=0; showGrueConversation(document.getElementById('modal-content'))">Back</button>
        <button onclick="grueStep=4; showGrueConversation(document.getElementById('modal-content'))">Are they dangerous?</button>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      setTimeout(() => playVoiceClip('voice_wizard_grue_anatomy'), 30);
    }
    else if(grueStep === 4) {
      m.innerHTML = `<h2>📚 Grue Danger Level</h2>
        ${npcFaceHTML('npc_wizard', '🧙', 'erasmus')}
        <p>Wizard: "Dangerous? No. They're <em>incredibly</em> dangerous."</p>
        <p>Wizard: "It is pitch black. You are likely to be eaten by a Grue."</p>
        <p>Wizard: "This is not a joke. I have seen men disappear into the dark. Only their screams remain."</p>
        <button onclick="grueStep=0; showGrueConversation(document.getElementById('modal-content'))">Back</button>
        <button onclick="grueStep=5; showGrueConversation(document.getElementById('modal-content'))">How do I detect them?</button>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      setTimeout(() => playVoiceClip('voice_wizard_grue_fight'), 30);
    }
    else if(grueStep === 5) {
      m.innerHTML = `<h2>📚 Detecting Grues</h2>
        ${npcFaceHTML('npc_wizard', '🧙', 'erasmus')}
        <p>Wizard: "The Listen command — have you tried it? In the darkness, you might hear something... scuttling."</p>
        <p>Wizard: "If your Intelligence is high enough, you may even get a warning before they close in."</p>
        <p>Wizard: "But honestly? If it's dark and you <em>don't</em> have light... you've already lost."</p>
        <p style="font-size:11px; color:#888; margin-top:10px;">[Use the Listen (L) command in darkness to detect Grues]</p>
        <button onclick="grueStep=0; showGrueConversation(document.getElementById('modal-content'))">Back</button>
        <button onclick="grueStep=2; showGrueConversation(document.getElementById('modal-content'))">Can I fight one?</button>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      setTimeout(() => playVoiceClip('voice_wizard_grue_anatomy'), 30);
    }
    startNPCVideo('erasmus');
  }

  // === Dennis the Peasant ===
  window.getConvention = function() {
    logMsg("<span style='color:var(--success)'>Dennis hands you a SCROLL OF CONSTITUTIONAL CONVENTION.</span>");
    logMsg("Dennis: \"Come see the violence inherent in the system! Help! Help! I'm being repressed!\"");
    player.xp += 200; checkLevelUp();
    let empty = inventory.findIndex(i => i === null);
    if(empty !== -1) inventory[empty] = new ItemStack('constitutionalConvention', 1);
    renderQuickslots(); hideOverlay();
  };

  // === Main Shop Renderer ===
  // openShop is the public entry point called from engine.js
  window.openShop = function(type) { openStore(type); };

  function canBuyFromStore(type) {
    return !['town_guard', 'dennis_wife', 'muck_peasant', 'retired_soldier'].includes(type);
  }

  function canSellToStore(type) {
    return ['apu', 'leftys', 'wizard', 'bookstore', 'mended_drum_barman', 'dennis', 'blacksmith', 'forge', 'fence', 'champion'].includes(type);
  }

  window.mendedDrumChat = function(npcType) {
    const defs = {
      cohen: { title: '👴 Cohen the Barbarian', icon: '👴⚔️', voicePrefix: 'voice_cohen_' },
      librarian: { title: '🦧 The Librarian', icon: '🦧', voicePrefix: 'voice_librarian_' },
      vimes: { title: '👮 Commander Vimes', icon: '👮', voicePrefix: 'voice_vimes_' },
      bearded_dwarf: { title: '🧔‍♀️ Dorimunde Ironchin', icon: '🧔‍♀️', voicePrefix: 'voice_dorimunde_' }
    };
    const cfg = defs[npcType];
    const def = cfg ? MONSTER_DEF[npcType] : null;
    if(!cfg || !def || !Array.isArray(def.dialog) || def.dialog.length === 0) return;
    const idx = Math.floor(Math.random() * def.dialog.length);
    const m = document.getElementById('modal-content');
    if(!m) return;
    m.innerHTML = `<h2>${cfg.title}</h2>
      ${npcFaceHTML('', cfg.icon, npcType)}
      <p>"${def.dialog[idx]}"</p>
      <button onclick="openStore('mended_drum_barman'); storeTab('chat','mended_drum_barman');">Back to The Mended Drum</button>`;
    setTimeout(() => playVoiceClip(cfg.voicePrefix + idx), 30);
  };

   function openStore(type = 'apu') {
    let o = document.getElementById('overlay');
    let m = document.getElementById('modal-content');
    if(m) {
      m.style.maxHeight = '86vh';
      m.style.overflowY = 'auto';
    }
    let html = '';
    // Supercenter in town uses Cousin Dave's video instead of Apu's
    let isDave = (type === 'apu' && currentScene === 'beach');
    let npcVideoType = isDave ? 'cousin_dave' : type;
    if(type === 'wizard' || type === 'bookstore') npcVideoType = 'erasmus';
    if(type === 'leftys') npcVideoType = 'lefty';
    if(type === 'forge' || type === 'blacksmith') npcVideoType = 'blacksmith';
    // Start NPC movie animation if a movie exists for this NPC type
    startNPCVideo(npcVideoType);

    // Store-specific header (NPC greeting, special buttons)
    if(type === 'apu') {
      Sound.gibberish();
      // #36 FIX: Supercenter only in town
      let line = APU_LINES[Math.floor(Math.random() * APU_LINES.length)];
      // #3 FIX: Only play welcome audio on first store open, not on every buy/sell
      if(isDave) {
        html += `<h2>🏪 Kwik-E-Mart Super Center</h2>
          ${npcFaceHTML('npc_apu', '🧔🏿', 'cousin_dave')}
          <p>🧔🏿‍♂️ "Welcome to the Super Center. Cousin Dave in charge today. Apu is nowhere in sight."</p>
          <p style="font-size:10px; color:#888;">*The place is bigger, brighter, and somehow even more suspiciously well stocked.*</p>`;
        awardAchievement('dave_encounter');
        if(!window._supercenterVoicePlayed) {
          window._supercenterVoicePlayed = true;
          setTimeout(() => playVoiceClip('voice_apu_supercenter_intro'), 30);
        }
        setTimeout(() => { if(typeof Sound !== 'undefined') Sound.playMusic('supercenter'); }, 40);
      } else {
        html += `<h2>🏪 Apu's Mart</h2>
          ${npcFaceHTML('npc_apu', '🧔🏿', 'apu')}
          <p>🧔🏿‍♂️ "${line}"</p>`;
        setTimeout(() => playApuVoiceForLine(line), 30);
      }
      if(player.lastStoreFloor !== currentLevel) {
        player.storesVisited++;
        player.lastStoreFloor = currentLevel;
      }
    }
    else if(type === 'leftys') {
      Sound.gibberish();
      html += `<h2>🍺 Lefty's Bar</h2>
        ${npcFaceHTML('', '🍻', 'lefty')}
        <p>Lefty: "What'll it be, Larry? Uh, I mean, stranger?"</p>`;
      html += `<button class="egg-btn" style="background:var(--secondary); color:black; margin-bottom:6px; font-size:11px;"
                onclick="larryEncounter()">💃 Talk to the Lady...</button>`;
      html += `<button class="egg-btn" style="background:#FFD700; color:black; margin-bottom:6px; font-size:11px;"
                onclick="typeof astrochickenGame==='function' ? astrochickenGame() : astrochickenBarGame()">🐔 Play Astrochicken (5g)</button>`;
      setTimeout(() => playVoiceClip('voice_lefty_greeting'), 30);
    }
    else if(type === 'wizard' || type === 'bookstore') {
      Sound.gibberish();
      const wizardGreetings = [
        { text: "Ah, you found us! We were on the other side of town last time.", voice: 'voice_wizard_shop_greeting' },
        { text: "Welcome! We move around a lot. Keeps the Grues guessing.", voice: 'voice_wizard_shop_greeting_2' },
        { text: "You're lucky you caught us! We were in the dungeon last week.", voice: 'voice_wizard_shop_greeting_3' },
      ];
      const chosen = wizardGreetings[Math.floor(Math.random() * wizardGreetings.length)];
      html += `<h2>📚 The Curiosity Shoppe</h2>
        ${npcFaceHTML('npc_wizard', '🧙', 'erasmus')}
        <p>Wizard: "${chosen.text}"</p>`;
      setTimeout(() => playVoiceClip(chosen.voice), 30);
    }
    else if(type === 'blacksmith' || type === 'forge') {
      let bsDef = MONSTER_DEF && MONSTER_DEF['blacksmith'];
      let bsDialogLines = bsDef && bsDef.dialog ? bsDef.dialog : ["What needs fixing, traveller?"];
      let bsIdx = Math.floor(Math.random() * bsDialogLines.length);
      let bsLine = bsDialogLines[bsIdx];
      html += `<h2>⚒️ Griswold the Blacksmith</h2>
        ${npcFaceHTML('', '🧑‍🔧', 'blacksmith')}
        <p>"${bsLine}"</p>`;
      setTimeout(() => playVoiceClip('voice_blacksmith_' + bsIdx), 30);
    }
    else if(type === 'cain') {
      html += `<h2>🧔 Deckard Cain</h2>
        ${npcFaceHTML('npc_wizard', '🧔', 'cain')}
        <p>"Stay awhile and listen. I identify the mysterious, explain the obvious, and ramble without mercy."</p>`;
      setTimeout(() => playVoiceClip('voice_cain_greeting'), 30);
      setTimeout(() => { if(typeof Sound !== 'undefined') Sound.playMusic('deckard_cain'); }, 40);
    }
    // #12: Town Guard shop handler
    else if(type === 'town_guard') {
      const kills = QuestEngine && QuestEngine._counters ? (QuestEngine._counters['kill_dungeon'] ?? 0) : 0;
      const hasDiscount = player.guardTalked && kills >= 10;
      html += `<h2>💂 Town Guard</h2>
        ${npcFaceHTML('', '💂', 'town_guard')}`;
      if(!player.guardTalked) {
        html += `<p>"Halt! You there. New to Tristram? The dungeon beneath the cathedral has been getting more... lively lately. We could use someone willing to go down there and thin out the population."</p>
          <p style="font-size:11px; color:#aaa;">"Kill at least 10 monsters and come back. Tristram's merchants will be in your debt."</p>
          <button onclick="guardTalk()">Accept the task</button>`;
        setTimeout(() => playVoiceClip('voice_guard_greeting'), 30);
      } else if(!hasDiscount) {
        html += `<p>"Good to see you're still breathing. Killed any of those things yet? We need at least ten dead."</p>
          <p style="color:#aaa; font-size:11px;">Monsters killed: ${kills}/10</p>`;
        setTimeout(() => playVoiceClip('voice_guard_checking'), 30);
      } else if(!player._guardRewardGiven) {
        html += `<p>"By Deckard's beard — you actually did it. Ten dead! The town merchants owe you. I've put the word out. You'll get a discount at all Tristram shops from now on."</p>
          <button onclick="guardClaimReward()">Accept reward</button>`;
        setTimeout(() => playVoiceClip('voice_guard_reward'), 30);
      } else {
        html += `<p>"The dungeon's still a problem, but you've done your part. The merchants remember you."</p>
          <p style="color:var(--success); font-size:11px;">✓ 10% discount active at all Tristram stores.</p>`;
        setTimeout(() => playVoiceClip('voice_guard_thanks'), 30);
      }
    }
    else if(type === 'dennis') {
      // #1: Dennis refuses service if player killed too many animals and hasn't paid
      if(player.dennisAnimalFurious) {
        const debt = player.dennisAnimalDebt ?? 0;
        html += `<h2>👨‍🌾 Dennis</h2>
          ${npcFaceHTML('npc_dennis', '👨‍🌾', 'dennis')}
          <p><em>"My ANIMALS, you murderous weirdo! I'm not talking to you until you pay me ${debt}g for what you did!"</em></p>`;
        if(player.gp >= debt) {
          html += `<button onclick="compensateDennisAnimals()">Pay ${debt}g compensation</button>`;
        } else {
          html += `<p style="color:var(--error); font-size:11px;">You only have ${player.gp}g. Come back with more.</p>`;
        }
        setTimeout(() => playVoiceClip('voice_dennis_animals_furious'), 30);
      } else if((player.townAnimalKills ?? 0) >= 2) {
        html += `<h2>👨‍🌾 Dennis</h2>
          ${npcFaceHTML('npc_dennis', '👨‍🌾', 'dennis')}
          <p><em>"Something strange has been happening to my animals lately... You wouldn't know anything about that, would you?"</em></p>`;
        setTimeout(() => playVoiceClip('voice_dennis_animals_worried'), 30);
      } else {
        html += `<h2>👨‍🌾 Dennis</h2>
          ${npcFaceHTML('npc_dennis', '👨‍🌾', 'dennis')}
          <p>"Listen, strange women lying in ponds distributing swords is no basis for a system of government. Bows, maybe. Much more practical."</p>`;
        setTimeout(() => playVoiceClip('voice_dennis_greeting'), 30);
      }
    }
    else if(type === 'fence') {
      html += `<h2>🧥 The Fence</h2>
        ${npcFaceHTML('', '🧥', 'fence')}
        <p>"I got 12 kids to feed. Don't ask questions."</p>`;
      setTimeout(() => playVoiceClip('voice_fence_greeting'), 30);
    }
    // E.HAMLET: Rosencrantz & Guildenstern — multi-stage quest dialog
    else if(type === 'rosencrantz_guildenstern') {
      Sound.gibberish();
      const step = player._rosenGuildenStep ?? 0;
      const delivered = player._rosenLetterDelivered || false;
      if(delivered) {
        html += `<h2>👬 Rosencrantz & Guildenstern</h2>
          ${npcFaceHTML('', '👬', 'rosencrantz_guildenstern')}
          <p><em>"You delivered the letter! The King of England was most pleased. We are eternally grateful!"</em></p>
          <button onclick="hideOverlay(); advanceTurn(1)" style="background:var(--surface-container); color:#aaa; margin-top:8px;">Leave</button>`;
        setTimeout(() => playVoiceClip('voice_rosencrantz_guildenstern_4'), 30);
      } else if(step === 0) {
        html += `<h2>👬 Rosencrantz & Guildenstern</h2>
          ${npcFaceHTML('', '👬', 'rosencrantz_guildenstern')}
          <p><em>"Have you seen our friend? Prince Hamlet? We were staying at The Mended Drum last night and he's vanished!"</em></p>
          <button onclick="rosenGuildenChat(1)">"Tell me more about Hamlet."</button>
          <button onclick="hideOverlay(); advanceTurn(1)" style="background:var(--surface-container); color:#aaa; margin-top:8px;">Leave</button>`;
        setTimeout(() => playVoiceClip('voice_rosencrantz_guildenstern_0'), 30);
      } else if(step === 1) {
        html += `<h2>👬 Rosencrantz & Guildenstern</h2>
          ${npcFaceHTML('', '👬', 'rosencrantz_guildenstern')}
          <p><em>"We've known Hamlet since we were boys at Wittenberg. He's... complicated. Brilliant, melancholy, prone to long speeches."</em></p>
          <p><em>"Last night he was muttering about his uncle Claudius and a ghost. Then he slipped away before dawn."</em></p>
          <button onclick="rosenGuildenChat(2)">"A ghost? What ghost?"</button>
          <button onclick="hideOverlay(); advanceTurn(1)" style="background:var(--surface-container); color:#aaa; margin-top:8px;">Leave</button>`;
        setTimeout(() => playVoiceClip('voice_rosencrantz_guildenstern_1'), 30);
      } else if(step === 2) {
        html += `<h2>👬 Rosencrantz & Guildenstern</h2>
          ${npcFaceHTML('', '👬', 'rosencrantz_guildenstern')}
          <p><em>"Hamlet's father — the old King — died suddenly. Hamlet says his father's ghost appeared on the battlements, claiming he was murdered."</em></p>
          <p><em>"By his own brother, no less! Claudius, who now wears the crown. We don't know what to believe."</em></p>
          <button onclick="rosenGuildenChat(3)">"This sounds dangerous. What can I do?"</button>
          <button onclick="hideOverlay(); advanceTurn(1)" style="background:var(--surface-container); color:#aaa; margin-top:8px;">Leave</button>`;
        setTimeout(() => playVoiceClip('voice_rosencrantz_guildenstern_2'), 30);
      } else if(step === 3) {
        html += `<h2>👬 Rosencrantz & Guildenstern</h2>
          ${npcFaceHTML('', '👬', 'rosencrantz_guildenstern')}
          <p><em>"We have an important sealed letter for the King of England. It's... delicate diplomatic business."</em></p>
          <p><em>"We can't carry it ourselves — we're too conspicuous, and Claudius's spies are everywhere."</em></p>
          <button onclick="rosenGuildenChat(4)">"I'll deliver the letter for you."</button>
          <button onclick="hideOverlay(); advanceTurn(1)" style="background:var(--surface-container); color:#aaa; margin-top:8px;">Leave</button>`;
        setTimeout(() => playVoiceClip('voice_rosencrantz_guildenstern_3'), 30);
      } else if(step === 4) {
        html += `<h2>👬 Rosencrantz & Guildenstern</h2>
          ${npcFaceHTML('', '👬', 'rosencrantz_guildenstern')}
          <p><em>"Thank you! Here is the sealed letter. The King of England will know what to do with it."</em></p>
          <p><em>"Find Hamlet if you can — he may be in grave danger."</em></p>
          <button onclick="acceptLetterQuest()" style="margin-top:8px;">📨 Accept the sealed letter</button>
          <button onclick="hideOverlay(); advanceTurn(1)" style="background:var(--surface-container); color:#aaa; margin-top:8px;">Leave</button>`;
        setTimeout(() => playVoiceClip('voice_rosencrantz_guildenstern_4'), 30);
      }
    }
    // E8: Weapon Master — Training Dummy, War Stories, Weapon Appraisal
    else if(type === 'fighting_master') {
      Sound.gibberish();
      window._wmStoryIdx = window._wmStoryIdx ?? 0;
      const wmLine = player.level >= 5
        ? `"You fight like a true Hero now. The guild recognizes your skill."`
        : `"Come back when you've reached level 5, recruit. You're only level ${player.level}."`;
      m.innerHTML = `<h2>⚔️ Weapon Master</h2>
        ${npcFaceHTML('npc_swordmaster_modal', '🤺', 'master')}
        <p style="font-size:13px; color:#aaa; margin:4px 0;">${wmLine}</p>
        <p style="font-size:13px; color:#aaa; margin:4px 0;">"What do you want? Make it quick — I'm in the middle of hating everyone equally."</p>
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
          ${player.gp >= 10 ? `<button onclick="weaponMasterTrain()">⚔️ Training session (10g)</button>` : `<button disabled style="opacity:0.4;">⚔️ Training session (10g) — need more gold</button>`}
          ${player.gp >= 5 ? `<button onclick="weaponMasterAppraise()">🔍 Appraise my weapon (5g)</button>` : `<button disabled style="opacity:0.4;">🔍 Appraise my weapon (5g) — need more gold</button>`}
          <button onclick="weaponMasterStory()">📖 Tell me about this place</button>
          <button onclick="hideOverlay(); advanceTurn(1);" style="background:var(--surface-container); color:#aaa; margin-top:4px;">Leave</button>
        </div>`;
      o.style.display = 'flex';
      setTimeout(() => {
        if(typeof Sound !== 'undefined' && Sound.playVoice) {
          const wm_line = Math.floor(Math.random() * 5);
          Sound.playVoice(`voice_weapon_master_${wm_line}`);
        }
      }, 30);
      return;
    }
    else if(type === 'chaplain') {
      // Pirate Chaplain — direct dialog, no tabs
      Sound.gibberish();
      m.innerHTML = `<h2>⛪ Pirate Chaplain</h2>
        <p style="margin:5px 0;">${npcFaceHTML('npc_chaplain', '⛪', 'chaplain')}</p>
        <p>"Ahoy! Have you heard the Good Noodle?"</p>
        <p>"The Flying Spaghetti Monster reaches out His Noodly Appendage to all who seek the marinara sauce of truth!"</p>
        <button onclick="chaplainSpeak(1)" style="margin-top:6px;">"What is the Flying Spaghetti Monster?"</button>
        <button onclick="chaplainSpeak(2)" style="margin-top:6px;">"Do you take donations?"</button>
        <button onclick="chaplainSpeak(3)" style="margin-top:6px;">"How did pirates come into this?"</button>
        <button onclick="hideOverlay(); advanceTurn(1)">"I'm good, thanks."</button>`;
      o.style.display = 'flex';
      // Chaplain gets a rotating face too
      let CHAPLAIN_FACES = ['⛪','😇','🤩','🍝','😌','🙏','😲','😏'];
      setTimeout(() => startNPCAnimation('npc-face', CHAPLAIN_FACES, 1800), 50);
      setTimeout(() => playVoiceClip('voice_chaplain_greeting'), 30);
      return;
    }
    else if(type === 'antique') {
      openAntiqueShop();
      return;
    }
    else if(type === 'scummbar') {
      openScummBar();
      return;
    }
    // E.TRIST.4: Dennis's Wife — just says "..."
    else if(type === 'dennis_wife') {
      html += `<h2>🤰 Dennis's Wife</h2>
        ${npcFaceHTML('', '🤰', 'dennis_wife')}
        <p>"..."</p>`;
    }
    // E.TRIST.5: Muck peasant — random muck dialog + voice
    else if(type === 'muck_peasant') {
      const bsDef = MONSTER_DEF && MONSTER_DEF['muck_peasant'];
      const lines = bsDef && bsDef.dialog ? bsDef.dialog : ["Ooo! There's lovely muck over here!"];
      const idx = Math.floor(Math.random() * lines.length);
      html += `<h2>🧑‍🌾 Muck Peasant</h2>
        ${npcFaceHTML('', '🧑‍🌾', 'muck_peasant')}
        <p>"${lines[idx]}"</p>`;
      setTimeout(() => playVoiceClip('voice_muck_peasant_' + idx), 30);
    }
    // E.TRIST.6: Retired soldier — random complaint + voice
    else if(type === 'retired_soldier') {
      const bsDef = MONSTER_DEF && MONSTER_DEF['retired_soldier'];
      const lines = bsDef && bsDef.dialog ? bsDef.dialog : ["My sciatica's acting up."];
      const idx = Math.floor(Math.random() * lines.length);
      html += `<h2>💂 Retired Soldier</h2>
        ${npcFaceHTML('', '💂', 'retired_soldier')}
        <p>"${lines[idx]}"</p>`;
      setTimeout(() => playVoiceClip('voice_retired_soldier_' + idx), 30);
    }

    // E.TRIST.MENDED_DRUM: Discworld characters
    else if(type === 'mended_drum_barman') {
      const def = MONSTER_DEF['mended_drum_barman'];
      const idx = Math.floor(Math.random() * def.dialog.length);
      html += `<h2>🍺 The Mended Drum</h2>
        <p style="font-size:10px;color:#888;margin:0 0 4px;">
          <em>"Ankh-Morpork's finest establishment. Motto: Quanti Canicula Ille In Fenestra"</em><br>
          <em>"Formerly across the river before the Great Fire. Now across the OTHER river since the Second Great Fire."</em>
        </p>
        ${npcFaceHTML('', '🧔', 'mended_drum_barman')}
        <p>"${def.dialog[idx]}"</p>
        <p style="font-size:10px;color:#555;margin-top:8px;">
          ⚠️ <em>Inn-Sewer-Ants Policy available at the bar. Covers Acts of Gods. (The small print covers which gods.)</em>
        </p>`;
      setTimeout(() => playVoiceClip('voice_nobby_' + idx), 30);
    }
    else if(type === 'cohen') {
      const def = MONSTER_DEF['cohen'];
      const idx = Math.floor(Math.random() * def.dialog.length);
      html += `<h2>👴 Cohen the Barbarian</h2>
        ${npcFaceHTML('', '👴⚔️', 'cohen')}
        <p>"${def.dialog[idx]}"</p>
        <p style="font-size:10px;color:#888;"><em>Cohen has sacked more cities than most people have had hot dinners. Approximately 88. Still very dangerous.</em></p>`;
      setTimeout(() => playVoiceClip('voice_cohen_' + idx), 30);
    }
    else if(type === 'librarian') {
      const def = MONSTER_DEF['librarian'];
      const idx = Math.floor(Math.random() * def.dialog.length);
      html += `<h2>🦧 The Librarian</h2>
        ${npcFaceHTML('', '🦧', 'librarian')}
        <p>"${def.dialog[idx]}"</p>
        <p style="font-size:10px;color:#888;"><em>Do NOT call him a monkey. He will accept "ape". He will not accept "monkey".</em></p>`;
      setTimeout(() => playVoiceClip('voice_librarian_' + idx), 30);
    }
    else if(type === 'vimes') {
      const def = MONSTER_DEF['vimes'];
      const idx = Math.floor(Math.random() * def.dialog.length);
      html += `<h2>👮 Commander Vimes</h2>
        ${npcFaceHTML('', '👮', 'vimes')}
        <p>"${def.dialog[idx]}"</p>
        <p style="font-size:10px;color:#888;"><em>Currently nursing his third beer and hoping nobody commits a crime. Someone will commit a crime.</em></p>`;
      setTimeout(() => playVoiceClip('voice_vimes_' + idx), 30);
    }
    else if(type === 'bearded_dwarf') {
      const def = MONSTER_DEF['bearded_dwarf'];
      const idx = Math.floor(Math.random() * def.dialog.length);
      html += `<h2>🧔‍♀️ Dorimunde Ironchin</h2>
        ${npcFaceHTML('', '🧔‍♀️', 'bearded_dwarf')}
        <p>"${def.dialog[idx]}"</p>
        <p style="font-size:10px;color:#888;"><em>A perfectly respectable dwarf lady, recognisable by her magnificent beard. Looking for The Dirty Rat.</em></p>`;
      setTimeout(() => playVoiceClip('voice_dorimunde_' + idx), 30);
    }

    // Header bar
    html += `<div style="display:flex; justify-content:space-between; align-items:center;
                  border-bottom:1px solid #555; padding-bottom:6px; margin-bottom:6px;">
               <span style="font-size:12px; color:var(--primary);">💰 Your GP: <strong>${player.gp}</strong></span>
               <button style="width:auto; padding:2px 8px; font-size:10px;"
                 onclick="hideOverlay(); advanceTurn(1);">Exit</button>
             </div>`;

    // Bug 14: Tab navigation (hide buy/sell for non-merchants)
    const canBuy = canBuyFromStore(type) && !(type === 'dennis' && player.dennisAnimalFurious);
    const canSell = canSellToStore(type) && !(type === 'dennis' && player.dennisAnimalFurious);
    const tabBtns = [];
    if(canBuy) tabBtns.push(`<button id="tab-buy" onclick="storeTab('buy','${type}')" style="flex:1; padding:6px; font-size:12px; background:var(--secondary); color:#fff; border:none; border-radius:4px 4px 0 0; cursor:pointer;">🛒 Buy</button>`);
    if(canSell) tabBtns.push(`<button id="tab-sell" onclick="storeTab('sell','${type}')" style="flex:1; padding:6px; font-size:12px; background:var(--surface-container); color:#aaa; border:none; border-radius:4px 4px 0 0; cursor:pointer;">💰 Sell</button>`);
    tabBtns.push(`<button id="tab-chat" onclick="storeTab('chat','${type}')" style="flex:1; padding:6px; font-size:12px; background:var(--surface-container); color:#aaa; border:none; border-radius:4px 4px 0 0; cursor:pointer;">💬 Chat</button>`);
    html += `<div style="display:flex; gap:4px; margin-bottom:6px;">${tabBtns.join('')}</div>`;
    const tabContentMaxH = (type === 'apu' || type === 'mended_drum_barman') ? '22vh' : '30vh';
    html += `<div id="store-tab-content" style="max-height:${tabContentMaxH}; overflow-y:auto; background:rgba(0,0,0,0.2); border-radius:0 0 4px 4px; padding:6px;"></div>`;

    m.innerHTML = html;
    o.style.display = 'flex';

    // Initialize with buy tab
    setTimeout(() => {
      storeTab(canBuy ? 'buy' : 'chat', type);
      // Start NPC face animation after tab renders
      if(type === 'apu' || type === 'leftys' || type === 'fence') {
        startNPCAnimation('npc-face', APU_FACES, 1200);
      } else if(type === 'wizard' || type === 'bookstore') {
        startNPCAnimation('npc-face', WIZARD_FACES, 1500);
      }
    }, 50);
  }

  // Store tab switching
  window.storeTab = function(tab, type) {
    const content = document.getElementById('store-tab-content');
    if(!content) return;

    // Style active tab
    ['buy','sell','chat'].forEach(t => {
      const btn = document.getElementById(`tab-${t}`);
      if(btn) {
        btn.style.background = t === tab ? 'var(--secondary)' : 'var(--surface-container)';
        btn.style.color = t === tab ? '#fff' : '#aaa';
      }
    });

    let html = '';
    if(tab === 'buy') {
      // Build buyable items
      let items = [];
      if(type === 'apu') {
        items = [
          {icon:'📃', name:'Scroll of Identify', cost:30},
          {icon:'🌀', name:'Town Portal Scroll', cost:5},
          {icon:'🧪', name:'Health Potion', cost:40},
          {icon:'🕯️', name:'Candle', cost:15},
          {icon:'🍕', name:'Pizza', cost:10},
          {icon:'🍛', name:'Curry', cost:5},
          {icon:'🥤', name:'Slurpee', cost:5},
          {icon:'🥛', name:'Milk', cost:3},
          {icon:'🦪', name:"Oyster (maybe I shouldn't?)", cost:2},
          {icon:'🥜', name:'Peanuts (I might be allergic...)', cost:1},
          {icon:'💰', name:'Gold Bag', cost:50},
          {icon:'🎒', name:'Small Cloth Bag (3 slots)', cost:10},
          {icon:'👜', name:'Leather Purse (3 slots)', cost:12},
          {icon:'🛍️', name:'Canvas Tote (3 slots)', cost:8},
        ];
      } else if(type === 'leftys') {
        items = [
          {icon:'🍛', name:'Curry', cost:5},
          {icon:'🥤', name:'Slurpee', cost:5},
          {icon:'🥃', name:'Whiskey', cost:15},
          {icon:'🍺', name:'Watered Down Beer', cost:5},
        ];
      } else if(type === 'wizard' || type === 'bookstore') {
        items = [
          {icon:'📃', name:'Scroll of Identify', cost:25},
          {icon:'🌀', name:'Town Portal Scroll', cost:5},
          {icon:'🔥📘', name:'Tome of Fireball', cost:800},
          {icon:'🌀📘', name:'Tome of Illuminate', cost:400},
          {icon:'🪄', name:"Wizard's Wand", cost:25000},
          {icon:'🦯✨', name:'Proper Staff', cost:25000},
        ];
       } else if(type === 'cain') {
         const unidentified = getUnidentifiedIcons();
         const oneByOneHtml = unidentified.length
           ? unidentified.map(icon => {
               const def = ItemDef.byIcon(icon);
               return `<button onclick="identifyOneItem('${icon}')" style="width:100%; margin-top:4px;">Identify ${icon} ${def ? def.name : 'Item'} (1g)</button>`;
             }).join('')
           : `<div style="margin-top:6px; color:#888; font-size:12px;">Everything in your inventory and inventory is already identified.</div>`;
         html = `<div style="padding:8px;">
           <p style="margin-top:0;">Deckard Cain peers at your belongings with the weight of three very long afternoons.</p>
           <button onclick="bulkIdentify()" style="width:100%;">Identify All (100g)</button>
           <div style="margin-top:8px; font-size:12px; color:#bbb;">Or identify a single item type:</div>
           ${oneByOneHtml}
         </div>`;
       } else if(type === 'mended_drum_barman') {
         html += `<h3 style="margin:4px 0 8px; color:#c8a060;">🍺 Bar Menu</h3>
           <p style="font-size:10px;color:#888;margin:0 0 4px;"><em>A rat in a tiny fez nods approvingly from behind the counter.</em></p>`;
         items = [
           {icon:'🍺', name:'Scumble (mainly apples)', cost:4},
           {icon:'🍖', name:'Dwarf Bread (also a weapon)', cost:6},
           {icon:'🧀', name:'Lancre Cheese (legally a weapon)', cost:5},
           {icon:'📜', name:"Inn-Sewer-Ants Policy", cost:50},
           {icon:'🗡️', name:'Perfectly Ordinary Sword', cost:120},
         ];
       } else if(type === 'dennis') {
        items = [
          {icon:'🏹', name:'Bow', cost:25},
          {icon:'➶', name:'Arrows x12', cost:5, qty:12},
          {icon:'🥩', name:'Meat', cost:8},
          {icon:'🧣', name:'Scarf (knitted by wife, keeps warm)', cost:15},
          {icon:'🍞', name:'Bread', cost:3},
        ];
      } else if(type === 'blacksmith' || type === 'forge') {
        html = `<div style="padding:8px; display:flex; flex-direction:column; gap:6px;">
          <button onclick="blacksmithRepair()" style="background:var(--secondary); font-size:13px;">🔨 Repair All Equipment (50g)</button>
          <hr style="border-color:#555; margin:4px 0;"/>
          <p style="margin:0; font-size:11px; color:#aaa;">Purchase weapons & gear:</p>
        </div>`;
        items = [
          {icon:'🗡️', name:'Sword', cost:100},
          {icon:'🛡️', name:'Shield', cost:150},
          {icon:'🦯', name:'Staff', cost:30},
        ];
      } else if(type === 'champion') {
        // Hall of Champions — tiered high-end items
        let achieveCount = Object.keys(achievements).length;
        html = `<h2>🏛️ Hall of Champions</h2>
          <p style="font-size:60px; margin:5px 0;">👑</p>
          <p>"Welcome, Champion. You have earned ${achieveCount} achievements."</p>
          <p>"Our wares are reserved for the truly dedicated."</p>`;
        items = [];
        if(achieveCount >= 20) {
          items.push({icon:'🌀', name:'Tome of Town Portal', cost:1000});
          items.push({icon:'💎', name:'Resurrection Crystal', cost:2000});
        }
        if(achieveCount >= 25) {
          items.push({icon:'💍⚡', name:'Ring of Evasion (+20%)', cost:5000});
          items.push({icon:'🧪💎', name:'Elixir of Life (full heal)', cost:3000});
        }
        if(achieveCount >= 30) {
          items.push({icon:'🫖', name:'Magic Teapot (potion maker)', cost:7500});
          items.push({icon:'📚🔥', name:'Tome of Chain Lightning', cost:6000});
        }
        if(achieveCount >= 35) {
          items.push({icon:'👑🌿', name:'Crown of Thorns (thorns dmg)', cost:10000});
          items.push({icon:'🗡️✨', name:'Excalibur (+25 DMG)', cost:12000});
        }
        if(achieveCount >= 40) {
          items.push({icon:'🛡️🌟', name:'Aegis of Champions (+30% DEF)', cost:15000});
          items.push({icon:'🎒🌈', name:'The Luggage (100 slots!)', cost:10000});
        }
        if(items.length === 0) {
          html += `<p style="color:var(--error);">You need more achievements to see our wares.</p>`;
        }
      }
      if(items.length === 0 && !html) {
        html = '<p style="color:#aaa; font-size:11px;">No items for sale.</p>';
      } else if(items.length > 0) {
        html = '<div style="display:flex; flex-direction:column; gap:4px;">';
        items.forEach(i => {
          html += `<div class="shop-item" style="margin:0; padding:4px;"><span>${i.icon} ${i.name} (<span style="color:var(--warning)">${i.cost}g</span>)</span>
            <button onclick="buy('${i.icon}', ${i.cost}, '${type}', ${i.qty ?? 1})">Buy</button></div>`;
        });
        html += '</div>';
      }
    } else if(tab === 'sell') {
      html = '<div style="display:flex; flex-direction:column; gap:4px;">';
      let hasSellable = false;
      inventory.forEach((it, idx) => {
        if(it) {
          let def = it.def;
          if(def && def.maxGP > 0) {
            hasSellable = true;
            let count = inventory.filter(i => i && i.itemName === it.itemName).length;
            let badge = count > 1 ? `<span style="background:var(--warning); color:#000; font-size:9px; padding:0 4px; border-radius:8px; margin-left:4px;">${count}</span>` : '';
            html += `<div class="shop-item" style="margin:0; padding:4px;"><span>${it.icon} ${def.name} (+${def.maxGP}g)${badge}</span>
              <button onclick="sell(${idx}, '${type}')">Sell</button></div>`;
          }
        }
      });
      if(!hasSellable) html += '<p style="color:#aaa; font-size:11px;">Nothing to sell.</p>';
      html += '</div>';
    } else if(tab === 'chat') {
      // Bug 16: Apu dialog in chat tab
      if(type === 'apu') {
      // #36 FIX: Supercenter only in town, not on floor 6
      let isDave = currentScene === 'beach';
        let line = isDave ? "Cousin Dave says the hedge road east is safe enough, provided you don't ask what happened to aisle nine." : APU_LINES[Math.floor(Math.random() * APU_LINES.length)];
        html = `<div style="padding:8px;">
          ${npcFaceHTML('npc_apu', '🧔🏿', isDave ? 'cousin_dave' : 'apu')}
          <p>🧔🏿‍♂️ "${line}"</p>`;
        if(!isDave && player.storesVisited > 1) {
          html += `<button onclick="askApu()" style="margin-top:8px;">Ask about his double...</button>`;
        }
        // E7: Why do you run a shop in a dungeon?
        if(!isDave) {
          html += `<button onclick="askApuWhyDungeon()" style="margin-top:8px;">Why do you run a shop in a dungeon?</button>`;
        }
        html += `</div>`;
        setTimeout(() => isDave ? playVoiceClip('voice_apu_dave_hedge_hint') : playApuVoiceForLine(line), 30);
      } else if(type === 'wizard' || type === 'bookstore') {
        html = `<div style="padding:8px;">
          ${npcFaceHTML('npc_wizard', '🧙', 'erasmus')}
          <p>Wizard: "Welcome to The Curiosity Shoppe!"</p>
          <button onclick="askGrue()" style="margin-top:8px;">📖 Ask about Grues</button>
        </div>`;
      } else if(type === 'cain') {
        html = `<div style="padding:8px; display:flex; flex-direction:column; gap:6px;">
          ${npcFaceHTML('npc_wizard', '🧔', 'cain')}
          <p style="margin:0;">Cain visibly prepares to be informative at tremendous length.</p>
          <button onclick="cainSpeak('ramble')">Ask for a story</button>
          <button onclick="cainSpeak('beach')">Ask about the beach</button>
          <button onclick="cainSpeak('pirates')">Ask about pirates</button>
          <button onclick="cainSpeak('quests')">Ask what actually matters</button>
        </div>`;
      } else if(type === 'dennis') {
        html = `<div style="padding:8px; display:flex; flex-direction:column; gap:6px;">
          <p style="margin:0;">Dennis looks delighted to have found a captive audience for constitutional theory.</p>
          <button onclick="dennisSpeak('government')">Discuss government</button>
          <button onclick="dennisSpeak('weapons')">Ask about the bow</button>
          <button onclick="dennisSpeak('quest')">Ask for useful advice</button>
          ${(player.equipped.head === 'crownOfNoodlyAppendages' || player.gp > 1000)
            ? `<button onclick="getConvention()">Request constitutional convention</button>`
            : ''}
        </div>`;
      } else if(type === 'mended_drum_barman') {
        html = `<div style="padding:8px; display:flex; flex-direction:column; gap:6px;">
          <p style="margin:0;">The barkeep jerks a thumb toward the regulars.</p>
          <button onclick="mendedDrumChat('vimes')">Chat with Commander Vimes</button>
          <button onclick="mendedDrumChat('cohen')">Chat with Cohen the Barbarian</button>
          <button onclick="mendedDrumChat('librarian')">Chat with The Librarian</button>
          <button onclick="mendedDrumChat('bearded_dwarf')">Chat with Dorimunde Ironchin</button>
        </div>`;
      } else {
        html = `<p style="color:#aaa; font-size:12px;">Nothing to discuss.</p>`;
      }
    }

    content.innerHTML = html;

    // Restart face animation after content renders
    if(tab === 'chat') {
      setTimeout(() => {
        if(type === 'apu') startNPCAnimation('npc-face', APU_FACES, 1200);
        else if(type === 'wizard' || type === 'bookstore') startNPCAnimation('npc-face', WIZARD_FACES, 1500);

        let chatVideoType = null;
        if(type === 'apu') chatVideoType = (currentScene === 'beach') ? 'cousin_dave' : 'apu';
        else if(type === 'wizard' || type === 'bookstore') chatVideoType = 'erasmus';
        else if(type === 'cain') chatVideoType = 'cain';
        if(chatVideoType) startNPCVideo(chatVideoType);
      }, 30);
    }
  };

  // === Transaction Handlers ===
  window.buy = function(icon, cost, type, qty = 1) {
    let shopType = type === 'bookstore' ? 'wizard' : type;
    // Smooth Talker talent discount: 5% per rank
    let smoothRank = player.talents && player.talents['smooth1'] ? player.talents['smooth1'] : 0;
    let discount = Math.floor(cost * 0.05 * smoothRank);
    let finalCost = Math.max(1, cost - discount);
    if(discount > 0) {
      logMsg(`<span style='color:var(--success)'>Smooth Talker discount: -${discount}g (${smoothRank * 5}% off)</span>`);
    }
    if((icon === '🪄' || icon === '🦯✨') && (type === 'wizard' || type === 'bookstore')) {
      openDiscworldArcanaBanter(icon, finalCost, type, qty);
      return;
    }
    if(player.gp < finalCost) return showInsufficientFunds(shopType, finalCost, ItemDef.byIcon(icon)?.displayName ?? 'that');
    // Prophylactic easter egg
    if(icon === ItemDef.iconOf('prophylactic')) { larryEasterEgg(0); return; }
    if(!addPurchasedItem(icon, qty)) { logMsg("No room! (Inventory full)"); return; }
    changeGold(-finalCost);
    openStore(type);
  };

  window.sell = function(idx, type) {
    let item = inventory[idx];
    if(!item) return;
    let def = item.def;
    if(def && def.maxGP > 0) {
      changeGold(def.maxGP);
      decrementItem(idx);
      openStore(type);
    }
  };

  window.buyStolen = function(idx) {
    let it = stolenItems[idx];
    if(!it) return;
    let def = it.def;
    let cost = def ? (def.maxGP ?? 100) * 2 : 200;
    if(player.gp < cost) return showInsufficientFunds('fence', cost, def?.name || 'that item');
    if(!addPurchasedItem(it.icon, it.qty ?? 1)) { logMsg("Inventory full!"); return; }
    changeGold(-cost);
    stolenItems.splice(idx, 1);
    openStore('fence');
  };

  window.cainSpeak = function(topic) {
    let m = document.getElementById('modal-content');
    if(!m) return;
    let html = `<h2>🧔 Deckard Cain</h2>${npcFaceHTML('npc_wizard', '🧔')}`;
    if(topic === 'ramble') {
      html += `<p>"Did I ever tell you about the time we tied onions to our belts, which was the style at the time? Of course, back then the Cathedral had not yet started ejecting skeletons into respectable society."</p>`;
      html += `<p>"We walked from Tristram to the old coast by moonlight, and every third mile someone warned us about pirates, prophecy, or damp socks. These warnings were all accurate."</p>`;
      setTimeout(() => playVoiceClip('voice_cain_ramble'), 30);
    } else if(topic === 'beach') {
      html += `<p>"The beach beyond these depths looks pleasant only from a distance. The surf hides old quarrels, older wrecks, and at least one quest that smells of fish and poor decisions."</p>`;
      html += `<p style='color:#88FF88'>Lore hint: the coast is where pirate business, old treasure, and the SCUMM Bar troubles begin in earnest.</p>`;
      setTimeout(() => playVoiceClip('voice_cain_beach'), 30);
    } else if(topic === 'pirates') {
      html += `<p>"Pirates are seldom as dead as one hopes. If you hear singing, insults, or the confident misuse of grog, you are already too close."</p>`;
      html += `<p style='color:#88FF88'>Lore hint: learning pirate insults matters more than a sharp blade when you finally meet their swordmaster.</p>`;
      setTimeout(() => playVoiceClip('voice_cain_pirates'), 30);
    } else if(topic === 'quests') {
      html += `<p>"Very well, the short version. Carry light in the dark. Listen for what hunts without being seen. On the coast, speak to everyone twice and trust almost no one."</p>`;
      html += `<p style='color:#88FF88'>Lore hint: beach quests tie together pirates, grog, a safe, and a very specific sort of mockery.</p>`;
      setTimeout(() => playVoiceClip('voice_cain_quests'), 30);
    }
    html += `<div style='display:flex; flex-direction:column; gap:6px; margin-top:10px;'>
      <button onclick="openStore('cain'); storeTab('chat','cain');">Back</button>
      <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>
    </div>`;
    m.innerHTML = html;
  };

  window.dennisSpeak = function(topic) {
    let m = document.getElementById('modal-content');
    if(!m) return;
    let html = `<h2>👨‍🌾 Dennis</h2>${npcFaceHTML('npc_dennis', '👨‍🌾', 'dennis')}`;
    if(topic === 'government') {
      html += `<p>"Supreme executive power derives from a mandate from the masses, not from some farcical aquatic ceremony, and certainly not from whoever happens to own the loudest helmet."</p>`;
      html += `<p>"Mind you, if people are going to keep wandering through town waving swords, I reserve the right to mutter at them."</p>`;
      setTimeout(() => playVoiceClip('voice_dennis_government'), 30);
    } else if(topic === 'weapons') {
      html += `<p>"A bow makes sense. You stand over there, trouble stands over here, and the arrow handles the constitutional details in the middle."</p>`;
      html += `<p>"Arrows come in bundles. Governments, sadly, do not."</p>`;
      setTimeout(() => playVoiceClip('voice_dennis_weapons'), 30);
    } else if(topic === 'quest') {
      html += `<p>"Useful advice? Fine. The beach is crawling with pirates and self-importance. If someone challenges you with insults, answer with better insults, not better swordsmanship."</p>`;
      html += `<p>"Also, if you meet a chaplain preaching pasta, just nod. It saves time."</p>`;
      setTimeout(() => playVoiceClip('voice_dennis_advice'), 30);
    }
    html += `<div style='display:flex; flex-direction:column; gap:6px; margin-top:10px;'>
      <button onclick="openStore('dennis'); storeTab('chat','dennis');">Back</button>
      <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>
    </div>`;
    m.innerHTML = html;
    startNPCVideo('dennis');
  };

  window.openDiscworldArcanaBanter = function(icon, cost, type, qty = 1) {
    let m = document.getElementById('modal-content');
    if(!m) return;
    let itemName = ItemDef.byIcon(icon)?.displayName ?? 'arcane nonsense';
    let canAfford = player.gp >= cost;
    if(!canAfford) showInsufficientFunds('wizard', cost, itemName);
    awardAchievement('granny_weatherwax');
    m.innerHTML = `<h2>📚 The Curiosity Shoppe</h2>
      ${npcFaceHTML('npc_wizard', '🧙', 'erasmus')}
      <p>Wizard: "A ${itemName}? Technically yes, I have one. Morally, I ought to hide it from the impressionable."</p>
      <p>Granny Weatherwax (from somewhere disapproving): "Wands is for people who can't persuade the universe proper. Staffs is for people who want everyone to notice them doing it."</p>
      <p>Wizard: "To be fair, some customers specifically request overcompensating timber."</p>
      <p>Granny Weatherwax: "Then sell 'em a broom and tell 'em it's ambition with a handle."</p>
      ${canAfford
        ? `<button onclick="confirmDiscworldArcanaBuy('${icon}', ${cost}, '${type}', ${qty})">Buy anyway (${cost}g)</button>`
        : `<p style='color:var(--error)'>You cannot afford ${itemName}. The wizard looks relieved.</p>`}
      <button onclick="openStore('${type}'); storeTab('buy','${type}');" style='margin-top:8px;'>Back to wares</button>`;
    showOverlay();
    startNPCVideo('erasmus');
    setTimeout(() => { playVoiceClip('voice_wizard_wand_banter'); }, 30);
    setTimeout(() => { playVoiceClip('voice_granny_wand'); }, 2500);
  };

  window.confirmDiscworldArcanaBuy = function(icon, cost, type, qty = 1) {
    if(player.gp < cost) {
      showInsufficientFunds('wizard', cost, ItemDef.byIcon(icon)?.displayName ?? 'that');
      openDiscworldArcanaBanter(icon, cost, type, qty);
      return;
    }
    if(!addPurchasedItem(icon, qty)) {
      logMsg('No room! (Inventory full)');
      return;
    }
    changeGold(-cost);
    logMsg(`<span style='color:var(--warning)'>The wizard sells you ${ItemDef.byIcon(icon)?.displayName ?? icon}. Somewhere, Granny clicks her tongue hard enough to bend iron.</span>`);
    openStore(type);
    storeTab('buy', type);
  };

  // === Pirate Chaplain Pastafarianism Dialogue ===
  window.chaplainSpeak = (step) => {
    let m = document.getElementById('modal-content');
    Sound.gibberish();
    if(step === 1) {
      m.innerHTML = `<h2>⛪ The Flying Spaghetti Monster</h2>
        <p style="font-size:60px; margin:5px 0;">🍝👾</p>
        <p>"The Flying Spaghetti Monster (FSM) is the creator of the universe. He made it after drinking heavily."</p>
        <p>"His Noodly Appendage touches all things. Global warming? Pirates. Earthquakes? Also pirates."</p>
        <p>"The decline in the number of pirates correlates directly with the increase in global temperature. Coincidence? I think NOT."</p>
        <p style="font-size:11px; color:#888;">*He shows you a chart. It is... surprisingly well-documented.*</p>
        <button onclick="chaplainSpeak(2)" style="margin-top:6px;">"How do I join?"</button>
        <button onclick="chaplainSpeak(5)" style="margin-top:6px;">"Tell me about the Noodly Appendage."</button>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      setTimeout(() => playVoiceClip('voice_chaplain_fsm'), 30);
    }
    else if(step === 2) {
      m.innerHTML = `<h2>⛪ Donations</h2>
        <p style="font-size:60px; margin:5px 0;">⛪💰</p>
        <p>"The Church of the Flying Spaghetti Monster accepts all forms of currency, including gold, doubloons, and macaroni art."</p>
        <p>"A tithe of 100 gold would buy you the Official Pirate Hat of Blessing. It does nothing, but it looks GREAT."</p>
        ${player.gp >= 100
          ? `<button onclick="chaplainDonate()" style="margin-top:6px;">Donate 100g</button>`
          : `<p style="color:var(--error); font-size:12px;">You don't have enough gold. The FSM understands. He's very chill.</p>`}
        <button onclick="chaplainSpeak(3)" style="margin-top:6px;">"Why pirates?"</button>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      if(player.gp < 100) setTimeout(() => playVoiceClip('voice_chaplain_no_gold'), 30);
    }
    else if(step === 3) {
      m.innerHTML = `<h2>⛪ The Pirate Connection</h2>
        <p style="font-size:60px; margin:5px 0;">🏴‍☠️🍝</p>
        <p>"Pirates are the chosen people of the FSM. They are His most devout followers."</p>
        <p>"The decline of pirates is the DIRECT CAUSE of global warming, natural disasters, and bad cafeteria food."</p>
        <p>"Every pirate that falls brings the world one step closer to... well, I don't want to be dramatic, but the END OF ALL THINGS."</p>
        <p>"Also, the FSM gives pirates free beer. That's in the Gospel of the Flying Spaghetti Monster, Chapter 3, Verse 7."</p>
        <p style="font-size:11px; color:#888;">*He produces a worn copy of the Gospel. It's surprisingly well-thumbed.*</p>
        <button onclick="chaplainSpeak(4)" style="margin-top:6px;">"Is this real?"</button>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      setTimeout(() => playVoiceClip('voice_chaplain_pirates'), 30);
    }
    else if(step === 4) {
      m.innerHTML = `<h2>⛪ The Truth</h2>
        <p style="font-size:60px; margin:5px 0;">⛪🤔</p>
        <p>"Is it 'real'? Is ANYTHING 'real'? Is this dungeon 'real'? Are you 'real'?"</p>
        <p>"The FSM doesn't care if you believe in Him. He's too busy being made of pasta to worry about it."</p>
        <p>"But I'll tell you this: every time you eat spaghetti, you are partaking in a SACRED MEAL."</p>
        <p>"So yes. It's real. As real as this conversation. As real as your fear of the dark. As real as the Grue."</p>
        <button onclick="chaplainSpeak(5)" style="margin-top:6px;">"Tell me about the Grue."</button>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      setTimeout(() => playVoiceClip('voice_chaplain_truth'), 30);
    }
    else if(step === 5) {
      m.innerHTML = `<h2>⛪ The Noodly Appendage & The Grue</h2>
        <p style="font-size:60px; margin:5px 0;">🍝👹</p>
        <p>"The Noodly Appendage is how the FSM reaches into the material world."</p>
        <p>"Some say the Grue is the FSM's way of punishing those who wander in darkness without pasta."</p>
        <p>"Others say the Grue is just a grumpy monster that eats people. But I prefer the pasta theory."</p>
        <p>"If you find yourself in the dark, remember: the FSM's light is always with you. Unless you haven't paid your tithe."</p>
        <button onclick="chaplainSpeak(2)" style="margin-top:6px;">"I'll pay the tithe now."</button>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      setTimeout(() => playVoiceClip('voice_chaplain_noodle'), 30);
    }
  };

  // Chaplain 10-item rotating prize list
  const CHAPLAIN_PRIZES = [
    { icon: '⛵', name: 'Blessed Coconut Canoe', type: 'useless', desc: 'A small canoe blessed by the FSM. Useless inland.' },
    { icon: '🍝', name: 'Holy Noodle', type: 'food', heal: 5, foodValue: 10, desc: 'A single sacred noodle. Heals 5 HP.' },
    { icon: '🧢', name: 'Colander of the Faithful', type: 'armor', slot: 'head', evade: 0, desc: 'Spiritual protection. Drains pasta water from your thoughts.' },
    { icon: '📜', name: 'Certified Pastafarian', type: 'useless', desc: 'A certificate of membership in the Church of the FSM.' },
    { icon: '🌊', name: 'Ramen of the Deep', type: 'food', heal: 15, desc: 'Heals 15 HP. Tastes of the sea.' },
    { icon: '⚓', name: 'Anchor of Enlightenment', type: 'useless', desc: 'Very heavy, not very enlightening.' },
    { icon: '🦜', name: 'Blessed Parrot Feather', type: 'useless', desc: 'A feather from a parrot blessed by His Noodly Appendage.' },
    { icon: '🍜', name: 'Soup of Transcendence', type: 'food', heal: 25, desc: 'Contains actual noodles. Heals 25 HP.' },
    { icon: '🏴‍☠️', name: 'Pirate Flag of the FSM', type: 'useless', desc: 'Technically sacred. Flies in no wind.' },
    { icon: '👑', name: 'Crown of Noodly Appendages', type: 'armor', slot: 'head', evade: 5, desc: 'Evade +5%. Pasta-forged in His image.' },
  ];

  window.chaplainDonate = () => {
    if(player.gp < 100) return showInsufficientFunds('chaplain', 100, 'the tithe');
    changeGold(-100);
    logMsg("<span style='color:var(--success)'>⛪ You donate 100g to the Church of the Flying Spaghetti Monster!</span>");
    logMsg("<span style='color:#FFD700'>The Pirate Chaplain blesses you: 'May the FSM's Noodly Appendage guide your path!'</span>");
    player.xp += 200;
    checkLevelUp();

    // Initialize prize tracker
    player.chaplainPrizes = player.chaplainPrizes || [];

    if(player.chaplainPrizes.length >= CHAPLAIN_PRIZES.length) {
      logMsg("<span style='color:#aaa'>\"The Chaplain has given you all his earthly FSM merchandise. He looks oddly relieved.\"</span>");
      hideOverlay();
      renderQuickslots(); updateUI();
      return;
    }

    const prizeIdx = player.chaplainPrizes.length;
    const prize = CHAPLAIN_PRIZES[prizeIdx];

    // Only award achievement on first prize
    if(prizeIdx === 0) awardAchievement('chaplain_first');

    player.chaplainPrizes.push(prize.icon);

    let slot = inventory.findIndex(i => i === null);
    if(slot !== -1) {
      inventory[slot] = ItemStack.fromIcon(prize.icon, 1);
      logMsg(`<span style='color:#FFD700'>⛪ You receive: ${prize.icon} <strong>${prize.name}</strong>! "${prize.desc}"</span>`);
    } else {
      logMsg(`<span style='color:var(--warning)'>⛪ No inventory room for ${prize.icon} ${prize.name}! It fades away sadly.</span>`);
    }

    renderQuickslots(); updateUI();
    hideOverlay();
  };

  // === Antique Shop (Monkey Island reference) ===
  window.openAntiqueShop = () => {
    let m = document.getElementById('modal-content');
    Sound.gibberish();
    m.innerHTML = `<h2>🏺 Melee Island Antique Shop</h2>
      ${npcFaceHTML('', '🏺👴', 'antique')}
      <p><em>"Ahoy there, fancy pants!"</em></p>
      <p><em>"Welcome to the Melee Island Antique Shop! We have many fine antiques... if you can afford them."</em></p>
      <p style="font-size:11px; color:#888;">The shopkeeper cups his ear. He seems... hard of hearing.</p>
      <p><em>"WHAT? Speak up! I can't hear you over the sound of my tinnitus!"</em></p>
      <button onclick="antiqueShopDialogue(0)" style="margin-top:8px;">"I'm looking for something special..."</button>
      <button onclick="antiqueShopDialogue(1)" style="margin-top:8px;">"Do you have a safe?"</button>
      <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
    showOverlay();
    setTimeout(() => playVoiceClip('voice_antique_greeting'), 30);
    startNPCVideo('antique');
  };

  window.antiqueShopDialogue = (step) => {
    let m = document.getElementById('modal-content');
    Sound.gibberish();
    if(step === 0) {
      m.innerHTML = `<h2>🏺 Melee Island Antique Shop</h2>
        ${npcFaceHTML('', '🏺👴', 'antique')}
        <p><em>"SPECIAL? Everything here is special! These antiques are worth... well, they're worth something, I'm sure."</em></p>
        <p><em>"But if you're REALLY looking for something special, I have a SAFE in the back. Very old. Very valuable."</em></p>
        <p><em>"Of course, I can't remember the combination. My memory isn't what it used to be. WHAT?"</em></p>
        <button onclick="antiqueShopDialogue(2)" style="margin-top:8px;">"Can I try to crack the safe?"</button>
        <button onclick="antiqueShopDialogue(3)" style="margin-top:8px;">"Tell me about the safe."</button>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      setTimeout(() => playVoiceClip('voice_antique_special'), 30);
      startNPCVideo('antique');
    } else if(step === 1) {
      m.innerHTML = `<h2>🏺 Melee Island Antique Shop</h2>
        ${npcFaceHTML('', '🏺👴', 'antique')}
        <p><em>"A SAFE? Why would I have a safe? I'm an ANTIQUE shopkeeper, not a BANKER!"</em></p>
        <p><em>"Oh wait, you mean THE safe? The one in the back? The one I can't open?"</em></p>
        <p><em>"Yes, I have a safe. Very old. Very valuable. Can't remember the combination. WHAT?"</em></p>
        <button onclick="antiqueShopDialogue(2)" style="margin-top:8px;">"Can I try to crack the safe?"</button>
        <button onclick="antiqueShopDialogue(3)" style="margin-top:8px;">"Tell me about the safe."</button>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      setTimeout(() => playVoiceClip('voice_antique_safe'), 30);
      startNPCVideo('antique');
    } else if(step === 2) {
      m.innerHTML = `<h2>🏺 Melee Island Antique Shop</h2>
        ${npcFaceHTML('', '🏺👴', 'antique')}
        <p><em>"CRACK the safe? You want to CRACK my safe? That's... that's ILLEGAL!"</em></p>
        <p><em>"But I suppose if you can crack it, you can have whatever's inside. I've been trying for YEARS."</em></p>
        <p><em>"The combination is... well, I don't remember. But I'll give you a HINT."</em></p>
        <p><em>"The combination is related to the SWORDMASTER. He comes in here sometimes. Very rude. Always insulting my merchandise."</em></p>
        <p><em>"If you can beat him at his own game, he might tell you the combination. WHAT?"</em></p>
        <button onclick="startSafeCrackingQuest()" style="margin-top:8px;">"I'll find the Swordmaster!"</button>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      setTimeout(() => playVoiceClip('voice_antique_swordmaster_hint'), 30);
      startNPCVideo('antique');
    } else if(step === 3) {
      m.innerHTML = `<h2>🏺 Melee Island Antique Shop</h2>
        ${npcFaceHTML('', '🏺👴', 'antique')}
        <p><em>"The safe? It's very old. Very valuable. VERY stuck."</em></p>
        <p><em>"I think it belonged to a pirate captain. Or maybe a governor. Or maybe it was just a regular safe that I imagining."</em></p>
        <p><em>"The combination is... something about a sword. Or maybe a insult. Or maybe it's 1-2-3-4. I don't remember."</em></p>
        <p><em>"But I know someone who might know: the SWORDMASTER. He's always bragging about his knowledge."</em></p>
        <button onclick="antiqueShopDialogue(2)" style="margin-top:8px;">"How do I find the Swordmaster?"</button>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      setTimeout(() => playVoiceClip('voice_antique_special'), 30);
      startNPCVideo('antique');
    }
  };

  window.startSafeCrackingQuest = () => {
    logMsg(`<span style='color:var(--success)'>${ItemDef.iconOf('brassBottle')} You've started the Safe Cracking Quest!</span>`);
    logMsg("<span style='color:#88FF88'>Find the Swordmaster and beat him at insult sword fighting to learn the safe combination.</span>");
    player.safeCrackingQuest = true;
    hideOverlay();
    advanceTurn(1);
  };

  // E.HAMLET: Rosencrantz & Guildenstern dialog progression
  window.rosenGuildenChat = function(step) {
    player._rosenGuildenStep = step;
    openShop('rosencrantz_guildenstern');
    startNPCVideo('rosencrantz_guildenstern');
  };

  window.acceptLetterQuest = () => {
    player._rosenGuildenStep = 5;
    player._hasSealedLetter = true;
    player._rosenLetterAccepted = true;
    logMsg("<span style='color:var(--success)'>📨 You accept the sealed letter for the King of England.</span>");
    logMsg("<span style='color:#88CCFF'>The wax seal bears the crest of Denmark. This is important diplomatic correspondence.</span>");
    if(typeof Sound !== 'undefined' && Sound.playVoice) Sound.playVoice('voice_rosencrantz_guildenstern_letter');
    if(typeof QuestEngine !== 'undefined') QuestEngine.emit('custom', { id: 'rosen_letter_accepted' });
    hideOverlay();
    advanceTurn(1);
  };

  window.completeSafeCrackingQuest = () => {
    if(player.safeCrackingQuest && player.learnedInsults.length >= 5) {
      logMsg(`<span style='color:var(--success)'>${ItemDef.iconOf('brassBottle')} You crack the safe! The combination was related to your insult knowledge!</span>`);
      logMsg("<span style='color:#FFD700'>Inside you find a treasure trove of gold and a special item!</span>");
      
      // Give rewards
      changeGold(500);
      player.xp += 1000;
      checkLevelUp();
      
      // Give a special item
      let empty = inventory.findIndex(i => i === null);
      if(empty !== -1) {
        inventory[empty] = new ItemStack('brassBottle', 1);
        logMsg("You receive a Brass Bottle! It feels... magical.");
      }
      
      awardAchievement('safe_cranked');
      player.safeCrackingQuest = false;
      player.safeCracked = true;
    } else if(player.safeCrackingQuest) {
      logMsg(`<span style='color:var(--warning)'>${ItemDef.iconOf('brassBottle')} The safe is still locked. You need to learn more insults from pirates first.</span>`);
    }
  };

  // KQ5: Genie wish dialog — called from genie modal when player has Brass Bottle
  window.genieWish = function(wish) {
    hideOverlay();
    // Consume the Brass Bottle
    const consumeBottle = (arr) => {
      const idx = arr.findIndex(i => i && i.itemName === 'brassBottle');
      if(idx !== -1) { arr[idx] = null; return true; }
      return false;
    };
    if(!consumeBottle(inventory)) consumeBottle(inventory);
    if(!consumeBottle(inventory)) {
      // Also check bags
      inventory.forEach(item => {
        if(item && item.contents) {
          const bagIdx = item.contents.findIndex(i => i && i.itemName === 'brassBottle');
          if(bagIdx !== -1) item.contents[bagIdx] = null;
        }
      });
    }

    if(wish === 'heal') {
      player.hp = player.maxHp;
      player.mp = player.maxMp;
      logMsg("<span style='color:var(--success)'>🧞 The Genie snaps his fingers. You feel completely restored!</span>");
      addFloatingText(player.x, player.y, '+FULL', '#0f0', 20);
      if(typeof Sound !== 'undefined' && Sound.playVoice) Sound.playVoice('voice_genie_wish');
    } else if(wish === 'gold') {
      changeGold(1000);
      logMsg("<span style='color:var(--success)'>🧞 A shower of gold coins rains from the ceiling!</span>");
      addFloatingText(player.x, player.y, '+1000g', '#FFD700', 20);
      if(typeof Sound !== 'undefined' && Sound.playVoice) Sound.playVoice('voice_genie_wish');
    } else if(wish === 'pass') {
      logMsg("<span style='color:var(--success)'>🧞 The Genie bows and steps aside. The exit stairs are open.</span>");
      if(typeof Sound !== 'undefined' && Sound.playVoice) Sound.playVoice('voice_genie_wish');
      // Remove genie so it doesn't block again
      const idx = enemies.findIndex(e => e && e.type === 'genie' && e.isGenieGuardian);
      if(idx !== -1) enemies.splice(idx, 1);
      if(typeof QuestEngine !== 'undefined') QuestEngine.emit('custom', { id: 'genie_wish_pass' });
    } else if(wish === 'fight') {
      logMsg("<span style='color:var(--error)'>🧞 The Genie roars: 'FOOL! You chose violence!'</span>");
      const idx = enemies.findIndex(e => e && e.type === 'genie' && e.isGenieGuardian);
      if(idx !== -1) {
        enemies[idx].isGenieGuardian = false;
        doCombat(idx);
      }
      return;
    }
    updateUI();
    renderQuickslots();
    renderInventory();
  };

  // === SCUMM Bar (Monkey Island pirate bar) ===
  window.openScummBar = () => {
    let m = document.getElementById('modal-content');
    Sound.gibberish();
    if(typeof Sound !== 'undefined') Sound.playMusic('pirate');
    m.innerHTML = `<h2>🍺 SCUMM Bar</h2>
      ${npcFaceHTML('npc_scummbar_modal', '🍺🏴‍☠️')}
      <p><em>"Welcome to the SCUMM Bar! Where pirates come to drink, sing, and tell lies!"</em></p>
      <p style="font-size:11px; color:#888;">The bar is filled with pirates singing sea shanties and arguing about treasure.</p>
      <p><em>"What'll it be? We have grog, rum, and... more rum. That's about it."</em></p>
      <button onclick="launchCentipedeCabinet()" style="margin-top:8px;">🕹️ Check the Centipede cabinet</button>
      <button onclick="scummBarDialogue(0)" style="margin-top:8px;">"I'm looking for a fight... an insult fight!"</button>
      <button onclick="scummBarDialogue(1)" style="margin-top:8px;">"Tell me about the Swordmaster."</button>
      <button onclick="scummBarDialogue(2)" style="margin-top:8px;">"I'll have a grog."</button>
      <button onclick="openCausticGrogQuest()" style="margin-top:8px;">${ItemDef.iconOf('wateredDownBeer')} Ask about Caustic Grog</button>
      ${player.hasRedHerring && !player.hasGrogIngredients ? `<button onclick="distractCook()" style="margin-top:8px;">${ItemDef.iconOf('redHerring')} Distract the Cook</button>` : ''}
      <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
    showOverlay();
    setTimeout(() => playVoiceClip('voice_scummbar_intro'), 30);
  };

  window.launchCentipedeCabinet = () => {
    if(window.assets && window.assets.minigames && window.assets.minigames['centipede/index.html']) {
      let html = window.assets.minigames['centipede/index.html'];
      let base64 = html.split(',')[1] || '';
      let decoded = atob(base64);
      let blob = new Blob([decoded], { type: 'text/html' });
      let url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      logMsg("<span style='color:var(--success)'>🕹️ The old Centipede cabinet hums to life.</span>");
      return;
    }
    logMsg("<span style='color:#888'>The Centipede cabinet is dark. Load the Arcade asset bundle to power it.</span>");
  };

  window.scummBarDialogue = (step) => {
    let m = document.getElementById('modal-content');
    Sound.gibberish();
    if(step === 0) {
      m.innerHTML = `<h2>🍺 SCUMM Bar</h2>
        ${npcFaceHTML('npc_scummbar_modal', '🍺⚔️')}
        <p><em>"An insult fight? You want to challenge a pirate to an insult duel? HA!"</em></p>
        <p><em>"You'll need to learn the proper retorts first. We pirates have a special way of fighting."</em></p>
        <p><em>"Fight enough of us, and you'll learn our insults. Then you might be ready for the Swordmaster."</em></p>
        <p><em>"But be warned: the Swordmaster is the best insult swordsman in the land! He'll make you cry!"</em></p>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      setTimeout(() => playVoiceClip('voice_scummbar_insultfight'), 30);
    } else if(step === 1) {
      m.innerHTML = `<h2>🍺 SCUMM Bar</h2>
        ${npcFaceHTML('npc_scummbar_modal', '🍺🤺')}
        <p><em>"The Swordmaster? He's the best insult swordsman in the land! He lives in a hut near the beach."</em></p>
        <p><em>"He's very proud. Very arrogant. And VERY good at insults."</em></p>
        <p><em>"If you want to challenge him, you'll need to learn insult sword fighting first. Fight some pirates!"</em></p>
        <p><em>"Once you've learned enough insults, you might stand a chance. Or you might not. Probably not."</em></p>
        <button onclick="scummBarDialogue(0)" style="margin-top:8px;">"How do I learn insults?"</button>
        <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
      setTimeout(() => playVoiceClip('voice_scummbar_swordmaster'), 30);
    } else if(step === 2) {
      if(player.gp >= 10) {
        changeGold(-10);
        logMsg(`<span style='color:var(--success)'>${ItemDef.iconOf('wateredDownBeer')} You buy a grog for 10g. It tastes like... well, it tastes like grog.</span>`);
        logMsg("<span style='color:#88FF88'>The pirates sing: 'Yo ho yo ho, a pirate's life for me!'</span>");
        player.grogTurns = (player.grogTurns ?? 0) + 1;
        if(typeof QuestEngine !== 'undefined') QuestEngine.emit('custom', { id: 'bought_grog', grogs_bought: player.grogTurns });
        if(player.grogTurns >= 3) {
          logMsg("<span style='color:#FFD700'>You've had enough grog. The pirates consider you one of them now!</span>");
          awardAchievement('pirate_grog');
        }
        renderQuickslots(); updateUI();
      } else {
        showInsufficientFunds('leftys', 10, 'a grog');
      }
      hideOverlay();
      advanceTurn(1);
    }
  };

  // === Astrochicken Bar Minigame (fallback when WASM not loaded) ===
  // #4 FIX: Renamed from astrochickenGame to astrochickenBarGame to avoid
  // overriding the WASM iframe version defined in ui_logic.js.
  // ui_logic.js's astrochickenGame() is the canonical version.
  // This bar-cursor game is used as fallback if arcade assets aren't loaded.
  window.astrochickenBarGame = () => {
    if(player.gp < 5) return showInsufficientFunds('leftys', 5, 'Astrochicken');
    
    changeGold(-5);
    Sound.gibberish();
    
    let m = document.getElementById('modal-content');
    m.innerHTML = `<h2>🐔 Astrochicken!</h2>
      <p style="font-size:60px; margin:5px 0;">🐔🚀</p>
      <p><em>"Welcome to Astrochicken! Launch the chicken into space using your precision timing!"</em></p>
      <p style="font-size:11px; color:#888;">Click at the right moment to launch. Too early or too late = failure!</p>
      <div id="astro-bar" onclick="launchAstrochicken()" style="width:100%; height:40px; background:#333; border:2px solid #666; position:relative; margin:10px 0; cursor:pointer;">
        <div id="astro-target" style="position:absolute; left:40%; width:20%; height:100%; background:#4CAF50; pointer-events:none;"></div>
        <div id="astro-cursor" style="position:absolute; left:0; width:4px; height:100%; background:#FF0000; pointer-events:none;"></div>
      </div>
      <button onclick="launchAstrochicken()" style="margin-top:8px; width:100%; font-size:18px; padding:10px;">🚀 LAUNCH!</button>
      <button onclick="hideOverlay(); advanceTurn(1)" style="margin-top:4px; background:var(--surface-container);">Give Up</button>`;
    showOverlay();
    
    // Animate cursor
    window.astroCursorPos = 0;
    window.astroDirection = 1;
    window.astroInterval = setInterval(() => {
      let cursor = document.getElementById('astro-cursor');
      if(!cursor) { clearInterval(window.astroInterval); return; }
      
      window.astroCursorPos += window.astroDirection * 2;
      if(window.astroCursorPos >= 96) window.astroDirection = -1;
      if(window.astroCursorPos <= 0) window.astroDirection = 1;
      
      cursor.style.left = window.astroCursorPos + '%';
    }, 50);
  };

  window.launchAstrochicken = () => {
    clearInterval(window.astroInterval);
    let cursorPos = window.astroCursorPos;
    let inTarget = cursorPos >= 40 && cursorPos <= 60;
    
    let m = document.getElementById('modal-content');
    
    if(inTarget) {
      player.astroScore = (player.astroScore ?? 0) + 1;
      Sound.rocketLaunch();
      
      if(player.astroScore >= 5) {
        logMsg("<span style='color:#FFD700'>🐔🚀 PERFECT! Astrochicken reaches orbit! The crowd goes wild!</span>");
        logMsg("<span style='color:var(--success)'>You win 50g and the admiration of poultry everywhere!</span>");
        changeGold(50);
        player.xp += 200;
        checkLevelUp();
        awardAchievement('astrochicken');
        player.astroScore = 0;
      } else {
        logMsg(`<span style='color:var(--success)'>🐔 Success! Astrochicken flies true! (Score: ${player.astroScore}/5)</span>`);
        changeGold(10);
      }
    } else {
      Sound.explosion();
      logMsg("<span style='color:var(--error)'>🐔💥 The chicken explodes on the launchpad. You monster.</span>");
      player.astroScore = 0;
    }
    
    renderQuickslots(); updateUI();
    hideOverlay();
    advanceTurn(1);
  };

  // === Caustic Grog Quest (Monkey Island SCUMMbar reference) ===
  // The distracted cook, red herring, and caustic grog puzzle
  window.openCausticGrogQuest = () => {
    if(!player.causticGrogQuest) {
      player.causticGrogQuest = true;
      player.hasRedHerring = false;
      player.hasGrogIngredients = false;
      logMsg(`<span style='color:var(--success)'>${ItemDef.iconOf('wateredDownBeer')} You start the Caustic Grog Quest!</span>`);
      logMsg("<span style='color:#88FF88'>Find the cook, distract him, and get the ingredients for caustic grog.</span>");
    }
    
    let m = document.getElementById('modal-content');
    Sound.gibberish();
    m.innerHTML = `<h2>🍺 The Caustic Grog Quest</h2>
      <p style="font-size:60px; margin:5px 0;">🍺🐟</p>
      <p><em>"The SCUMM Bar serves the most potent grog in the land. But making it requires... special ingredients."</em></p>
      <p><em>"The cook is very protective of his recipe. You'll need to distract him somehow."</em></p>
      <p style="font-size:11px; color:#888;">Find a red herring to distract the cook.</p>
      ${player.hasRedHerring 
        ? `<button onclick="distractCook()" style="margin-top:8px;">${ItemDef.iconOf('redHerring')} Use the Red Herring to distract the cook</button>`
        : `<p style="color:var(--warning); font-size:12px;">You need a Red Herring first. Check the fishing spots near the beach.</p>`}
      ${player.hasGrogIngredients 
        ? `<button onclick="makeCausticGrog()" style="margin-top:8px;">${ItemDef.iconOf('wateredDownBeer')} Make the Caustic Grog</button>`
        : ''}
      <button onclick="hideOverlay(); advanceTurn(1)" style="margin-top:12px;">Leave</button>`;
    showOverlay();
    setTimeout(() => playVoiceClip('voice_caustic_intro'), 30);
  };

  window.distractCook = () => {
    if(!player.hasRedHerring) {
      logMsg("<span style='color:var(--error)'>You don't have a Red Herring!</span>");
      return;
    }
    
    let m = document.getElementById('modal-content');
    Sound.gibberish();
    if(typeof QuestEngine !== 'undefined') QuestEngine.emit('custom', { id: 'cook_distracted' });
    m.innerHTML = `<h2>🐟 Distracting the Cook</h2>
      <p style="font-size:60px; margin:5px 0;">👨‍🍳🐟</p>
      <p><em>"A RED HERRING! Oh no! I must investigate this immediately!"</em></p>
      <p style="font-size:11px; color:#888;">The cook runs off to investigate the fish. Now's your chance!</p>
      <button onclick="stealGrogIngredients()" style="margin-top:8px;">${ItemDef.iconOf('wateredDownBeer')} Steal the grog ingredients</button>
      <button onclick="hideOverlay(); advanceTurn(1)">Flee!</button>`;
    setTimeout(() => playVoiceClip('voice_caustic_cook'), 30);
  };

  window.stealGrogIngredients = () => {
    player.hasGrogIngredients = true;
    if(typeof QuestEngine !== 'undefined') QuestEngine.emit('custom', { id: 'stole_grog_ingredients' });
    logMsg(`<span style='color:var(--success)'>${ItemDef.iconOf('wateredDownBeer')} You grab the grog ingredients while the cook is distracted!</span>`);
    logMsg("<span style='color:#88FF88'>Now you can make the legendary Caustic Grog!</span>");
    
    let m = document.getElementById('modal-content');
    m.innerHTML = `<h2>🍺 Ingredients Acquired!</h2>
      <p style="font-size:60px; margin:5px 0;">🍺✨</p>
      <p><em>"You have the ingredients! Now mix them to create the legendary Caustic Grog!"</em></p>
      <button onclick="makeCausticGrog()" style="margin-top:8px;">${ItemDef.iconOf('wateredDownBeer')} Make the Caustic Grog</button>
      <button onclick="hideOverlay(); advanceTurn(1)">Leave</button>`;
    setTimeout(() => playVoiceClip('voice_caustic_ingredients'), 30);
  };

  window.makeCausticGrog = () => {
    if(!player.hasGrogIngredients) {
      logMsg("<span style='color:var(--error)'>You don't have the grog ingredients!</span>");
      return;
    }
    
    player.hasGrogIngredients = false;
    player.hasRedHerring = false;
    player.causticGrogMade = true;
    if(typeof QuestEngine !== 'undefined') QuestEngine.emit('custom', { id: 'made_caustic_grog' });
    
    Sound.grogPour();
    
    // Give caustic grog item
    let empty = inventory.findIndex(i => i === null);
    if(empty !== -1) {
      inventory[empty] = new ItemStack('wateredDownBeer', 1); // Grog
      logMsg(`<span style='color:#FFD700'>${ItemDef.iconOf('wateredDownBeer')} You create the legendary Caustic Grog!</span>`);
      logMsg("<span style='color:var(--success)'>It burns going down, but it gives you incredible power!</span>");
      logMsg("<span style='color:#88FF88'>+50% damage for 10 turns!</span>");
      
      // Apply grog buff
      player.grogBuffTurns = 10;
      player.baseDmg = Math.floor(player.baseDmg * 1.5);
      
      awardAchievement('caustic_grog');
      player.xp += 300;
      checkLevelUp();
    } else {
      logMsg("<span style='color:var(--error)'>Your inventory is full!</span>");
      player.hasGrogIngredients = true; // Give back ingredients
      player.hasRedHerring = true;
      player.causticGrogMade = false;
    }
    
    renderQuickslots(); updateUI();
    hideOverlay();
    advanceTurn(1);
  };

  // Add Red Herring item
  // (This would normally go in ITEM_DEF but we'll add it here for the quest)
  window.findRedHerring = () => {
    if(!player.hasRedHerring) {
      player.hasRedHerring = true;
      if(typeof QuestEngine !== 'undefined') QuestEngine.emit('custom', { id: 'found_red_herring' });
      logMsg(`<span style='color:var(--success)'>${ItemDef.iconOf('redHerring')} You catch a Red Herring! It smells... suspicious.</span>`);
      
      let empty = inventory.findIndex(i => i === null);
      if(empty !== -1) {
        inventory[empty] = new ItemStack('redHerring', 1);
        logMsg("<span style='color:#88FF88'>This could be useful for distracting someone...</span>");
      }
      renderQuickslots();
    }
  };

  // ── PACIFIST ORC DIALOG TREE ──
  // Grok the Formerly Terrible, floor 6's dark chamber resident.
  // Must bring light to meet him properly. He was SLEEPING. And Bruce is his roommate.
  window.openPacifistOrc = function(step) {
    if(!step) step = (player._grokWasSleeping) ? 'woke_up' : 'intro';
    let m = document.getElementById('modal-content');
    let o = document.getElementById('overlay');
    awardAchievement('pacifist_orc');
    startNPCVideo('pacifist_orc'); // play Grok movie

    const GROK_ITEMS = [
      {icon:'🪨', name:"Grok's Meditation Rock", desc:'"Exceptionally round. I sat on it for three years."'},
      {icon:'🧶', name:'String of Tranquility', desc:'"I unraveled it in a moment of weakness. Then re-raveled it. Then unraveled it again."'},
      {icon:'🫘', name:'Lucky Ceremonial Bean', desc:'"It is not lucky. But it is a bean."'},
      {icon:'📎', name:'Bent Paperclip Amulet', desc:'"I found this in the dungeon. I do not know what it does. Neither does anyone else."'},
      {icon:'🦴', name:'Bone of Perspective', desc:'"Someone dropped this. I meditated on it for a week. It is still just a bone."'},
    ];
    const GRUE_HINTS = [
      "The darkness is not your enemy. The THING in the darkness is your enemy. Subtle distinction.",
      "A single candle flame is enough. Grues are cowards. Big, invisible, murderous cowards.",
      "I once watched Bruce spend four hours trying to eat a torch. He kept burning his tongue. I told him to stop. He did not listen.",
      "If you hear breathing in the dark, that is Bruce. If you feel the breathing, you are already dead. Unless it is just Bruce being dramatic.",
      "I keep this chamber dark because Bruce keeps everyone else out. We have a professional arrangement.",
    ];
    const CHAPLAIN_HINTS = [
      "There is a pirate on the floors below who found religion. Worships a pasta deity. Floor 5. I have been thinking about visiting. The breadsticks sound good.",
      "The Chaplain wears a colander on his head. I respect this. I once wore a cooking pot for six months. It was very centering.",
      "The pasta god's followers are called Pastafarians. They believe the world was created by a Flying Spaghetti Monster. This is statistically no more unlikely than anything else down here.",
      "The Chaplain gives out free breadsticks after sermons. I have heard they are quite good. This is perhaps the most compelling religious argument I have encountered.",
      "If you meet the Chaplain, tell him Grok sent you. He will probably give you extra sauce. We have never met but I feel we would get along.",
    ];
    const FLIRT_LINES = [
      "Oh! Well hello there. You know, you are quite cute for a human. Very... compact.",
      "Ooh, you bumped into me. Was that intentional? No judgment. I am just saying.",
      "You have very nice eyes. All two of them. Very symmetrical. I appreciate that in a biped.",
      "You are the first visitor I have had in four years. You are also much better smelling than the last one. Who was a ghoul, admittedly.",
      "I am not saying I am interested. I am just saying... if you wanted to sit and meditate for a while... there is room.",
      "You know what they say — adventurers who stumble into dark rooms are just looking for something to bump into. Is that what you were looking for? Be honest.",
    ];
    const WHY_HERE_LINES = [
      "I live here.",
      "I have lived here for seventeen years.",
      "I have a very good lease. Well. I have no lease. But I have been here seventeen years and no one has contested it.",
      "The ambient darkness is excellent for the complexion. Also for avoiding people. Present company included, until now.",
    ];

    if(step === 'woke_up') {
      player._grokWasSleeping = false;
      m.innerHTML = `<h2>🧌 Grok the Formerly Terrible</h2>
        ${npcFaceHTML("npc_orc", "🧌", "pacifist_orc")}
        <p style="color:#aaa; font-size:11px; font-style:italic;">A massive orc jolts awake, squinting furiously at your light source.</p>
        <p style="color:var(--warning); font-size:13px; margin:8px 0;">"AUGH. What is — WHO — do you MIND?! I was SLEEPING! That is EXTREMELY BRIGHT!"</p>
        <p style="color:#aaa; font-size:12px;">"...Fine. FINE. I am awake. Seventeen years of uninterrupted darkness and you walk in here with a TORCH."</p>
        <p style="color:#888; font-size:11px; font-style:italic;">He puts a large hand over his eyes and sighs deeply.</p>
        <p style="color:#aaa; font-size:12px;">"What do you want."</p>
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
          <button onclick="openPacifistOrc('intro')">Apologize and ask some questions</button>
          <button onclick="openPacifistOrc('flirt')">Compliment him on his, uh, room</button>
          <button onclick="hideOverlay(); advanceTurn(1);" style="opacity:0.6;">Back away slowly</button>
        </div>`;
      setTimeout(() => playVoiceClip('voice_orc_woken'), 30);
    }
    else if(step === 'intro') {
      let woke = player._grokMetBefore ? '' : '<p style="color:#888; font-size:11px; font-style:italic;">He is still squinting. The wreath on his head has shifted sideways.</p>';
      player._grokMetBefore = true;
      m.innerHTML = `<h2>🧌 Grok the Formerly Terrible</h2>
        <p style="font-size:50px; margin:4px 0;">🧌🧘</p>
        ${woke}
        <p style="color:#aaa; font-size:12px; margin:8px 0;">"Hmph. Since you are already here and my eyes are already ruined..."</p>
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
          <button onclick="openPacifistOrc('why_here')">What are you doing down here?</button>
          <button onclick="openPacifistOrc('bruce')">About the Grue...</button>
          <button onclick="openPacifistOrc('flirt')">You seem... interesting</button>
          <button onclick="openPacifistOrc('wisdom')">Tell me about the darkness</button>
          <button onclick="openPacifistOrc('chaplain')">Have you heard about the Chaplain on Floor 5?</button>
          <button onclick="openPacifistOrc('combat')">How have you survived here?</button>
          <button onclick="openPacifistOrc('trade')">Can I have some of your stuff?</button>
          <button onclick="hideOverlay(); advanceTurn(1);" style="opacity:0.6;">Leave him be</button>
        </div>`;
    }
    else if(step === 'flirt') {
      let line = FLIRT_LINES[Math.floor(Math.random() * FLIRT_LINES.length)];
      m.innerHTML = `<h2>🧌 A Surprisingly Personal Moment</h2>
        <p style="font-size:50px; margin:4px 0;">🧌💚</p>
        <p style="color:#ccc; font-size:13px; margin:8px 0;">"${line}"</p>
        <p style="color:#888; font-size:11px; font-style:italic;">He clears his throat. The wreath falls off. He picks it up with tremendous dignity.</p>
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
          <button onclick="openPacifistOrc('flirt')">Continue this line of inquiry</button>
          <button onclick="openPacifistOrc('intro')">← Back</button>
        </div>`;
    }
    else if(step === 'why_here') {
      let line = WHY_HERE_LINES[player._grokWhyHereIdx = ((player._grokWhyHereIdx ?? 0) + 1) % WHY_HERE_LINES.length];
      m.innerHTML = `<h2>🧌 On the Subject of Residency</h2>
        <p style="color:#ccc; font-size:13px; margin:8px 0;">"${line}"</p>
        <p style="color:#888; font-size:11px; font-style:italic;">He gestures vaguely at the dark room as though it is entirely self-explanatory.</p>
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
          <button onclick="openPacifistOrc('why_here')">But... why THIS room?</button>
          <button onclick="openPacifistOrc('bruce')">With a Grue for a roommate?</button>
          <button onclick="openPacifistOrc('intro')">← Back</button>
        </div>`;
    }
    else if(step === 'bruce') {
      m.innerHTML = `<h2>🧌 On the Subject of Bruce</h2>
        <p style="color:#ccc; font-size:13px; margin:8px 0;">"That is Bruce. My roommate."</p>
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
          <button onclick="openPacifistOrc('bruce_where')">Where is he now?</button>
          <button onclick="openPacifistOrc('bruce_eat')">Doesn't he try to eat you?</button>
          <button onclick="openPacifistOrc('bruce_taste')">How is that even possible?</button>
          <button onclick="openPacifistOrc('intro')">← Back</button>
        </div>`;
      setTimeout(() => playVoiceClip('voice_orc_bruce'), 30);
    }
    else if(step === 'bruce_where') {
      m.innerHTML = `<h2>🧌 Where is Bruce?</h2>
        <p style="color:#ccc; font-size:13px; margin:8px 0;">"He was just here a minute ago."</p>
        <p style="color:#888; font-size:11px; font-style:italic;">A silence settles over the chamber. Something large shifts in the darkness behind you.</p>
        <p style="color:#aaa; font-size:12px;">"He does that. Very dramatic. He thinks it is funny."</p>
        <p style="color:#888; font-size:11px; font-style:italic;">The shifting stops. Somehow that is worse.</p>
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
          <button onclick="openPacifistOrc('bruce_eat')">Should I be worried?</button>
          <button onclick="openPacifistOrc('intro')">← Back (quickly)</button>
        </div>`;
      setTimeout(() => playVoiceClip('voice_orc_bruce_where'), 30);
    }
    else if(step === 'bruce_eat') {
      m.innerHTML = `<h2>🧌 The Bruce Question</h2>
        <p style="color:#ccc; font-size:13px; margin:8px 0;">"He tried. Once. In the early years."</p>
        <p style="color:#ccc; font-size:12px; margin:4px 0;">"He immediately spat me out."</p>
        <p style="color:#aaa; font-size:12px; margin:4px 0;">"I was offended at first. Then I realized it was the best possible outcome."</p>
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
          <button onclick="openPacifistOrc('bruce_taste')">Why did he spit you out?</button>
          <button onclick="openPacifistOrc('intro')">← Back</button>
        </div>`;
    }
    else if(step === 'bruce_taste') {
      m.innerHTML = `<h2>🧌 Orc Palatability</h2>
        <p style="color:#ccc; font-size:13px; margin:8px 0;">"Do you know how bad orcs taste?"</p>
        <p style="color:#aaa; font-size:12px; margin:4px 0;">"Seventeen years of dungeon living, a diet of mostly fungus and whatever fell down the stairs, and a complete absence of bathing."</p>
        <p style="color:#ccc; font-size:12px; margin:4px 0;">"Bruce described it as — and I quote — 'like licking a boot that is also somehow alive and annoyed.'"</p>
        <p style="color:#888; font-size:11px; font-style:italic;">He sounds almost proud.</p>
        <p style="color:#aaa; font-size:12px;">"We have not had a problem since. We respect each other. Mostly he respects that I taste terrible."</p>
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
          <button onclick="openPacifistOrc('bruce')">Tell me more about Bruce</button>
          <button onclick="openPacifistOrc('intro')">← Back</button>
        </div>`;
      setTimeout(() => playVoiceClip('voice_orc_taste'), 30);
    }
    else if(step === 'wisdom') {
      let hint = GRUE_HINTS[Math.floor(Math.random() * GRUE_HINTS.length)];
      let hasCandles = inventory.some(i => i && i.itemName === 'candle');
      m.innerHTML = `<h2>🧌 On the Subject of Darkness</h2>
        <p style="color:#ccc; font-size:12px; margin:8px 0;">"${hint}"</p>
        ${!hasCandles ? '<p style="color:var(--warning); font-size:12px;">"You have no light. Take these. Do not thank me. Gratitude disrupts my concentration."</p>' : ''}
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
          <button onclick="openPacifistOrc(\'wisdom\')">Ask again</button>
          <button onclick="openPacifistOrc(\'intro\')">← Back</button>
        </div>`;
      if(!hasCandles) {
        let slot = inventory.findIndex(s => s === null);
        if(slot !== -1) { inventory[slot] = new ItemStack('candle', 3); renderQuickslots(); }
      }
    }
    else if(step === 'chaplain') {
      let hint = CHAPLAIN_HINTS[Math.floor(Math.random() * CHAPLAIN_HINTS.length)];
      m.innerHTML = `<h2>🧌 On the Subject of Floor 5</h2>
        <p style="color:#ccc; font-size:12px; margin:8px 0;">"${hint}"</p>
        <p style="color:#888; font-size:11px; font-style:italic;">He fidgets with his wreath. For the first time, he looks almost wistful.</p>
        <p style="color:#aaa; font-size:12px;">"I have been thinking of visiting. You need a light source to get there safely. And I would need to put on shoes. I have not worn shoes in eleven years."</p>
        <p style="color:#888; font-size:11px;">"Also Bruce would need to be informed. He gets anxious when I leave."</p>
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
          <button onclick="openPacifistOrc(\'chaplain\')">Tell me more</button>
          <button onclick="openPacifistOrc(\'intro\')">← Back</button>
        </div>`;
      setTimeout(() => playVoiceClip('voice_orc_chaplain'), 30);
    }
    else if(step === 'trade') {
      let html = `<h2>🧌 Grok's Worldly Possessions</h2>
        <p style="color:#aaa; font-size:11px; font-style:italic;">"I have renounced attachment to material things. But I will give them to you in exchange for something else to renounce attachment to."</p>
        <div style="display:flex; flex-direction:column; gap:4px; margin:8px 0;">`;
      GROK_ITEMS.forEach((item, i) => {
        html += `<div style="background:var(--surface-container); padding:6px; border-radius:4px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:20px;">${item.icon}</span>
            <div style="flex:1; margin:0 8px;">
              <div style="font-size:11px; font-weight:bold;">${item.name}</div>
              <div style="font-size:10px; color:#888; font-style:italic;">${item.desc}</div>
            </div>
            <button onclick="grokTrade('${item.icon}', '${item.name.replace(/'/g,"\\'")}', ${i})" style="font-size:10px; padding:2px 8px;">Take it</button>
          </div>
        </div>`;
      });
      html += `</div><button onclick="openPacifistOrc('intro')">← Back</button>`;
      m.innerHTML = html;
    }
    else if(step === 'combat') {
      m.innerHTML = `<h2>🧌 On the Subject of Survival</h2>
        <p style="color:#ccc; font-size:12px; margin:8px 0;">"Seventeen years. You want to know my secret?"</p>
        <p style="color:#aaa; font-size:12px;">"I sat very still and looked very boring. Monsters lose interest in boring things."</p>
        <p style="color:#ccc; font-size:12px; margin:4px 0;">"Also I do not engage in combat. Ever. I made a vow."</p>
        <p style="color:#aaa; font-size:12px; margin:4px 0;">"An adventurer tried to fight me once. I sat down. He hit me. I sat there. He hit me again. After the fourth hit he became confused and left. This is my primary defensive strategy."</p>
        <p style="color:#888; font-size:11px; font-style:italic;">"Also Bruce ate him shortly after. I did not feel responsible for that."</p>
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
          <button onclick="openPacifistOrc('intro')">← Back</button>
          <button onclick="hideOverlay(); advanceTurn(1);" style="opacity:0.6;">Leave</button>
        </div>`;
      setTimeout(() => playVoiceClip('voice_orc_survival'), 30);
    }
    o.style.display = 'flex';
  };

  // Track the first encounter — Grok was sleeping
  window.grokFirstMeet = function() {
    player._grokWasSleeping = true;
    openPacifistOrc('woke_up');
  };

  window.grokTrade = function(icon, name, idx) {
    let slot = inventory.findIndex(s => s === null);
    if(slot === -1) { logMsg("Your inventory is full. Grok looks unimpressed."); return; }
    inventory[slot] = {icon, qty:1};
    renderQuickslots();
    let GROK_REMARKS = [
      '"Ah. Now I have one less thing. This is progress."',
      '"Take it. It was beginning to remind me of my past life."',
      '"You want THIS? ...Adventurers are strange."',
      '"I feel lighter already. Spiritually speaking. Also it was quite heavy."',
      '"May it bring you enlightenment. Or at least a few copper pieces at the fence."',
    ];
    logMsg(`<span style='color:#aaa; font-style:italic;'>${GROK_REMARKS[idx % GROK_REMARKS.length]}</span>`);
    openPacifistOrc('trade');
  };

  // #12: Town guard quest actions
  window.guardTalk = () => {
    player.guardTalked = true;
    logMsg("<span style='color:var(--success)'>You take on the guard's task. Kill 10 monsters in the dungeon.</span>");
    hideOverlay();
    setTimeout(() => {
      logMsg("<span style='color:#aaa; font-style:italic;'>Town Guard, huh? Its nice to know that even in this fantasy world there are still jobs for the unemployable.</span>");
      playVoiceClip('voice_internal_guard_unemployable');
    }, 120);
    if(typeof QuestEngine !== 'undefined') QuestEngine.emit('guard_task_accepted', {});
  };
  window.guardClaimReward = () => {
    player._guardRewardGiven = true;
    logMsg("<span style='color:#FFD700'>💂 Guard's Discount unlocked — 10% off all Tristram stores!</span>");
    hideOverlay();
    if(typeof QuestEngine !== 'undefined') QuestEngine.emit('guard_reward_claimed', {});
    if(typeof awardAchievement === 'function') awardAchievement('town_defender');
    Sound.playSample('achieve', 0.7);
  };

  // Patch getEffectivePrice for guard discount
  const _origGetEffectivePrice = window.getEffectivePrice;
  window.getEffectivePrice = (basePrice, type) => {
    let price = _origGetEffectivePrice ? _origGetEffectivePrice(basePrice, type) : basePrice;
    // #12: 10% discount in Tristram after guard quest reward
    if(player._guardRewardGiven && currentScene === 'town') {
      price = Math.max(1, Math.floor(price * 0.9));
    }
    return price;
  };

  // #1: Dennis animal compensation
  window.compensateDennisAnimals = () => {
    const debt = player.dennisAnimalDebt ?? 0;
    if(player.gp < debt) { logMsg("Not enough gold."); return; }
    changeGold(-debt);
    player.dennisAnimalDebt = 0;
    player.dennisAnimalFurious = false;
    logMsg("<span style='color:var(--success)'>You pay Dennis for his animals. He grumbles but nods slowly.</span>");
    hideOverlay();
    Sound.clink();
  };

  // E8: Weapon Master handler functions
  const _WAR_STORIES_DATA = [
    "This courtyard was built by the Arcane Council three centuries ago. They trained here until the Rift opened. I'm the last one.",
    "Floor 3 was once the Hall of Masters. Twelve champions trained here. Now it's just me and the occasional adventurer who smells like goblin.",
    "The columns? Greek-style. The Council had pretentions. But the cobblestones — those I laid myself. Took two weeks. Nobody appreciates good cobblestones."
  ];

  window.weaponMasterTrain = function() {
    if(player.gp < 10) { logMsg("Not enough gold."); return; }
    window.changeGold(-10);
    player.trainingBonus = (player.trainingBonus ?? 0) + 1;
    logMsg("<span style='color:#4af'>The Weapon Master puts you through brutal drills. You feel sharper. (+1 to your next attack roll)</span>");
    if(typeof Sound !== 'undefined') Sound.playTone(440, 'square', 0.2, 0.05, 300);
    openShop('fighting_master');
  };

  window.weaponMasterAppraise = function() {
    if(player.gp < 5) { logMsg("Not enough gold."); return; }
    window.changeGold(-5);
    const lh = player.equipped && player.equipped.leftHand;
    if(!lh) {
      logMsg("The Weapon Master looks at your bare hands. 'A fist fighter. Rare. Stupid, but rare.'");
      openShop('fighting_master');
      return;
    }
    const def = ItemDef.byIcon(lh);
    if(!def) { openShop('fighting_master'); return; }
    logMsg(`<span style='color:#fd0'>The Weapon Master examines your ${def.name}: Base damage ${def.baseDmg ?? 0}, ${def.ranged ? 'Ranged, ' : ''}${def.magicScaling ? 'Magic scaling: '+def.magicScaling : 'no magic scaling'}. "${(def.baseDmg ?? 0) >= 8 ? 'Now THAT is a weapon.' : (def.baseDmg ?? 0) >= 4 ? 'Serviceable.' : 'You call that a weapon?'}"</span>`);
    openShop('fighting_master');
  };

  window.weaponMasterStory = function() {
    window._wmStoryIdx = window._wmStoryIdx ?? 0;
    logMsg(`<span style='color:#c8a86b'>"${_WAR_STORIES_DATA[window._wmStoryIdx % _WAR_STORIES_DATA.length]}"</span>`);
    window._wmStoryIdx++;
    openShop('fighting_master');
  };

  window.grokTrade = function(icon, name, idx) {
    let slot = inventory.findIndex(s => s === null);
    if(slot === -1) { logMsg("Your inventory is full. Grok looks unimpressed."); return; }
    inventory[slot] = {icon, qty:1};
    renderQuickslots();
    const GROK_REMARKS = [
      '"Ah. Now I have one less thing. This is progress."',
      '"Take it. It was beginning to remind me of my past life."',
      '"You want THIS? ...Adventurers are strange."',
      '"I feel lighter already. Spiritually speaking. Also it was quite heavy."',
      '"May it bring you enlightenment. Or at least a few copper pieces at the fence."',
    ];
    logMsg(`<span style='color:#aaa; font-style:italic;'>${GROK_REMARKS[idx % GROK_REMARKS.length]}</span>`);
    openPacifistOrc('trade');
  };
