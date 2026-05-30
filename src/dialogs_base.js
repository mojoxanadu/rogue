// === dialogs_base.js ===
/*
  Base conversation content for engine-owned NPCs.

  Loaded immediately after dialog.js so the registry is populated before any
  map-init code that might attach phraseIds to spawning NPCs runs.

  Tier-1 cohort: the Mended Drum (barman + 4 patrons). Future engine-owned
  NPC migrations (Apu, blacksmith, Cain, Dennis, etc.) drop in here.

  Patron quips are pulled live from MONSTER_DEF.<type>.dialog (already
  authored in state.js) so the same text is reused without duplication.
  Each bump re-rolls a random quip via the array-as-message support in
  dialog.js's _resolveMessage.
*/
(function() {
  'use strict';
  if (typeof Dialog === 'undefined') return;

  // Helper: pull the dialog array from MONSTER_DEF, with a fallback if the
  // def is missing or its dialog list is empty.
  function quipsFrom(type, fallback) {
    return () => {
      const def = (typeof MONSTER_DEF !== 'undefined') ? MONSTER_DEF[type] : null;
      const arr = def && Array.isArray(def.dialog) ? def.dialog : null;
      return (arr && arr.length > 0) ? arr[Math.floor(Math.random() * arr.length)] : fallback;
    };
  }

  // Helper: clear thief debt for a given NPC key.
  // Exposed on window so scriptEffects { type: 'callFn' } can reach it.
  window._clearThiefStatus = function(key) {
    if (player._thiefDebt) delete player._thiefDebt[key];
  };

  Dialog.registerPhrases({
    // ── Thief-caught interceptor ─────────────────────────────
    // First catch — "I caught you!" then auto-advances to the debt demand.
    '_thief_caught': {
      message: function() {
        const npc = Dialog.currentNpc;
        const name = (npc && npc.stats && npc.stats.name) || (npc && (npc.shopType || npc.type)) || 'shopkeeper';
        return `"I caught you! You can't shop here any more until you pay restitution."`;
      },
      autoAdvance: true,
      replies: [
        { text: '', nextPhrase: '_thief_caught_debt', default: true },
      ],
    },

    // Debt demand — shown after the initial catch or on subsequent bumps.
    '_thief_caught_debt': {
      message: function() {
        const npc = Dialog.currentNpc;
        const key = (npc && (npc.shopType || npc.type)) || '';
        const debt = (player._thiefDebt && player._thiefDebt[key]) || 0;
        const enough = typeof player !== 'undefined' && player.gp >= debt;
        return enough
          ? `"Do you have the ${debt} gp you owe me, you thief?"`
          : `"You owe me ${debt} gp, thief. Don't come back until you have it."`;
      },
      replies: function() {
        const npc = Dialog.currentNpc;
        const key = (npc && (npc.shopType || npc.type)) || '';
        const debt = (player._thiefDebt && player._thiefDebt[key]) || 0;
        const enough = typeof player !== 'undefined' && player.gp >= debt;
        const out = [];
        out.push({
          text: enough ? `Yes, I'm so sorry, here's my restitution.` : `I don't have the gold yet.`,
          nextPhrase: enough ? '_thief_forgiven' : '@close',
          scriptEffects: enough ? [
            { type: 'modStat', stat: 'gp', delta: -debt },
            { type: 'callFn', fn: '_clearThiefStatus', args: [key] },
            { type: 'log', message: `You pay ${debt}g restitution.` },
          ] : [],
        });
        if (enough) {
          out[0].default = true;
        }
        out.push({
          text: "Not yet, I'll be back when I have it.",
          nextPhrase: '@close',
        });
        return out;
      },
    },

    '_thief_forgiven': {
      message: '"Don\'t let me catch you again."',
      autoAdvance: true,
      replies: function() {
        const npc = Dialog.currentNpc;
        const returnPhrase = (npc && npc._thiefReturnPhrase) || '@close';
        return [{ text: '', nextPhrase: returnPhrase, default: true }];
      },
    },

    // ── Barman ────────────────────────────────────────────────
    // The barman greets, then the @shop sentinel hands off to the existing
    // store UI (with its buy/sell tabs intact). [Leave] closes the dialog.
    'mended_drum_barman_greet': {
      // Random phrase variant — pick one each time the player bumps the barman.
      // Most variants inherit the default replies below; the Latin motto
      // variant provides its own replies with an extra "What does that mean?"
      // option that leads to the translation phrase.
      randomPhrases: [
        { message: "What'll it be, traveler?" },
        { message: "What'll it be? Scumble? Made from apples. Well. Mainly apples." },
        { message: "No fighting in the Drum. Unless you pay the breakage deposit." },
        {
          message: "Motto over the bar reads: \"Quanti Canicula Ille In Fenestra.\" Old Latin.",
          replies: [
            { text: 'What does that mean?', nextPhrase: 'mended_drum_motto_translation' },
            { text: 'Uh, whatever. I just came to shop.', nextPhrase: '@shop', default: true },
          ],
        },
        { message: "Formerly across the river before the Great Fire. Now across the OTHER river since the Second Great Fire." },
        { message: "Inn-Sewer-Ants Policy available at the bar. Covers Acts of Gods. (The small print covers which gods.)" },
        { message: "We had a wizard in here once. He turned into a toad. Nobody noticed for three days." },
        { message: "Sign says 'No Assassins'. Asterisk says 'By appointment only'." },
        { message: "The rats pay rent. Better tenants than some I could name." },
      ],
      replies: [
        { text: 'Browse your wares.', nextPhrase: '@shop', default: true },
      ],
    },

    'mended_drum_motto_translation': {
      message: "It means, 'How much is that doggie in the window?' Don't ask, no idea.",
      replies: [
        { text: 'Sorry I asked. You have anything to sell?', nextPhrase: '@shop', default: true },
      ],
    },

    // ── Deckard Cain ────────────────────────────────────────
    'cain_greet': {
      message: function() {
        const names = (typeof window.getUnidentifiedItemNames === 'function') ? window.getUnidentifiedItemNames() : [];
        if (names.length > 0) {
          return '"Stay awhile and listen. I see you have items of questionable provenance that require my scholarly attention. Or perhaps you just want a story."';
        }
        return '"Stay awhile and listen. I identify the mysterious, explain the obvious, and ramble without mercy."';
      },
      replies: function() {
        const out = [
          { text: 'Identify everything! (100g)', nextPhrase: 'cain_identify_all',
            requires: [{ type: 'playerStat', stat: 'gp', min: 100 }] },
          { text: 'Identify one item...', nextPhrase: 'cain_identify_one' },
          { text: 'Ask for a story', nextPhrase: 'cain_ramble' },
          { text: 'Ask about the beach', nextPhrase: 'cain_beach' },
          { text: 'Ask about pirates', nextPhrase: 'cain_pirates' },
          { text: 'Ask what actually matters', nextPhrase: 'cain_quests' },
        ];
        if (typeof player !== 'undefined' && player.hp < player.maxHp) {
          out.unshift({ text: 'Heal me.', nextPhrase: 'cain_heal' });
        }
        return out;
      },
    },
    'cain_heal': {
      message: '"Of course. Let me see what I can do."',
      scriptEffects: [{ type: 'healToFull' }],
      replies: [
        { text: 'Thank you.', nextPhrase: 'cain_greet', default: true },
      ],
    },

    'cain_identify_all': {
      message: function() {
        const names = (typeof window.getUnidentifiedItemNames === 'function') ? window.getUnidentifiedItemNames() : [];
        const count = names.length;
        if (count === 0) return '"Everything in your inventory is already identified. You are either very organized or very boring."';
        return `"Very well. Let me examine these ${count} curiosities... Stay awhile and listen."`;
      },
      scriptEffects: [{ type: 'identifyAll' }],
      replies: [
        { text: 'Thanks, Cain.', nextPhrase: '@close', default: true },
      ],
    },

    'cain_identify_one': {
      message: function() {
        const names = (typeof window.getUnidentifiedItemNames === 'function') ? window.getUnidentifiedItemNames() : [];
        if (names.length === 0) return '"Every bauble and blade you carry is already accounted for in my records. Nothing to identify."';
        return '"Which one shall I examine? The fee is a single gold coin — a bargain for enlightenment."';
      },
      replies: function() {
        const names = (typeof window.getUnidentifiedItemNames === 'function') ? window.getUnidentifiedItemNames() : [];
        if (names.length === 0) {
          return [{ text: 'Never mind, then.', nextPhrase: '@close', default: true }];
        }
        const out = names.map(name => {
          const def = (typeof ItemDefs !== 'undefined') ? ItemDefs[name] : null;
          return {
            text: `${def ? def.icon + ' ' : ''}${def ? def.displayName : name} (1g)`,
            nextPhrase: '@close',
            scriptEffects: [{ type: 'identifyOne', itemName: name }],
          };
        });
        out.push({ text: 'Never mind.', nextPhrase: 'cain_greet' });
        return out;
      },
    },

    'cain_ramble': {
      message: '"Did I ever tell you about the time we tied onions to our belts, which was the style at the time? Of course, back then the Cathedral had not yet started ejecting skeletons into respectable society."\n\n"We walked from Tristram to the old coast by moonlight, and every third mile someone warned us about pirates, prophecy, or damp socks. These warnings were all accurate."',
      replies: [
        { text: 'Fascinating.', nextPhrase: 'cain_greet', default: true },
      ],
    },

    'cain_beach': {
      message: '"The beach beyond these depths looks pleasant only from a distance. The surf hides old quarrels, older wrecks, and at least one quest that smells of fish and poor decisions."\n\n[Lore hint: the coast is where pirate business, old treasure, and the SCUMM Bar troubles begin in earnest.]',
      replies: [
        { text: 'Good to know.', nextPhrase: 'cain_greet', default: true },
      ],
    },

    'cain_pirates': {
      message: '"Pirates are seldom as dead as one hopes. If you hear singing, insults, or the confident misuse of grog, you are already too close."\n\n[Lore hint: learning pirate insults matters more than a sharp blade when you finally meet their swordmaster.]',
      replies: [
        { text: 'I\'ll keep that in mind.', nextPhrase: 'cain_greet', default: true },
      ],
    },

    'cain_quests': {
      message: '"Very well, the short version. Carry light in the dark. Listen for what hunts without being seen. On the coast, speak to everyone twice and trust almost no one."\n\n[Lore hint: beach quests tie together pirates, grog, a safe, and a very specific sort of mockery.]',
      replies: [
        { text: 'Sound advice.', nextPhrase: 'cain_greet', default: true },
      ],
    },

    // ── Griswold the Blacksmith ──────────────────────────────
    // Chat first ("Ah, an adventurer!"), then "Show me your wares" → @shop.
    'blacksmith_greet': {
      message: quipsFrom('blacksmith', "Ah, an adventurer! What can I craft for you today?"),
      replies: [
        { text: 'Show me your wares.', nextPhrase: '@shop', default: true },
      ],
    },

    // ── Vimes ────────────────────────────────────────────────
    // No replies — pure flavor NPC. Bottom Leave is always there;
    // Next is hidden when replies is empty.
    'mended_drum_vimes_greet': {
      message: quipsFrom('vimes', "I'm off duty. Which means I'm still on duty."),
    },

    // ── Cohen ────────────────────────────────────────────────
    'mended_drum_cohen_greet': {
      message: quipsFrom('cohen', "Young people today. Always complaining."),
    },

    // ── Librarian ────────────────────────────────────────────
    'mended_drum_librarian_greet': {
      message: quipsFrom('librarian', 'Ook.'),
    },

    // ── Dorimunde Ironchin ───────────────────────────────────
    // Real response retained ("Sorry, no.") — that's actual content,
    // distinct from the redundant Leave.
    'mended_drum_dorimunde_greet': {
      message: quipsFrom('bearded_dwarf', 'Excuse me, do you know where The Dirty Rat is?'),
      replies: [
        { text: 'Sorry, no.', nextPhrase: '@close' },
      ],
    },

    // ── Tier-2 flavor-only Tristram NPCs ─────────────────────
    // Engine-owned NPCs whose former openShop modal was just a single
    // greeting + random quip. Pure flavor: no shop, no quest branching.
    // Their legacy bump-handler blocks in engine.js get deleted.

    'dennis_wife_greet': {
      message: quipsFrom('dennis_wife', '...'),
    },

    'muck_peasant_greet': {
      message: quipsFrom('muck_peasant', 'Lovely muck.'),
    },

    'retired_soldier_greet': {
      message: quipsFrom('retired_soldier', 'My sciatica.'),
    },

    // ── Fence ────────────────────────────────────────────────
    // Has a real shop (stolen goods) but the catalog logic in shop.js is
    // dynamic — falls back to legacy openShop on @shop. Dialog wraps it
    // so bumping fence first opens conversation, matching the AT pattern.
    'fence_greet': {
      message: "I got 12 kids to feed. Don't ask questions.",
      replies: [
        { text: 'Show me the stolen goods.', nextPhrase: '@shop' },
      ],
    },

    // ── Curiosity Shoppe (Erasmus the Wizard) ──────────────
    'bookstore_greet': {
      message: '"Welcome to The Curiosity Shoppe! I am Erasmus, your guide to the arcane and the obscure. What brings you to my humble shop?"',
      replies: [
        { text: 'What books are for sale?', nextPhrase: '@shop', default: true },
        { text: 'Ask about Grues', nextPhrase: 'bookstore_grue_menu' },
      ],
    },

    'bookstore_grue_menu': {
      message: '"Ah, the Grue! A fascinating and terrifying subject. What would you like to know?"',
      replies: [
        { text: 'What IS a Grue?', nextPhrase: 'bookstore_grue_anatomy' },
        { text: 'How do I fight a Grue?', nextPhrase: 'bookstore_grue_fight' },
        { text: 'Where do they come from?', nextPhrase: 'bookstore_grue_origins' },
        { text: 'Is a Grue dangerous?', nextPhrase: 'bookstore_grue_danger' },
        { text: 'How do I detect them?', nextPhrase: 'bookstore_grue_detect' },
      ],
    },

    'bookstore_grue_anatomy': {
      message: '"A Grue is a dark creature of the night. It has slavering fangs and razor-sharp claws. They are said to melt when exposed to light — like snow, but more evil. I once saw one. It was eating a man. The man was screaming. It was very unpleasant."',
      replies: [
        { text: 'Back to Grue questions', nextPhrase: 'bookstore_grue_menu', default: true },
      ],
    },

    'bookstore_grue_fight': {
      message: '"You can\'t. Well, you could try. But you\'d die. A Grue is, as near as we can determine, invulnerable to most attacks. Light is your only defense. Carry a candle. Always. I heard a rumor that high intelligence helps you sense them before they eat you. But I may have made that up."',
      replies: [
        { text: 'Back to Grue questions', nextPhrase: 'bookstore_grue_menu', default: true },
      ],
    },

    'bookstore_grue_origins': {
      message: '"Some say they come from a place called Zork. Others say they are the natural defenders of dark places. I once read a book that said Grues are actually quite friendly if you meet them in good lighting. That book was wrong. Do not trust that book."',
      replies: [
        { text: 'Back to Grue questions', nextPhrase: 'bookstore_grue_menu', default: true },
      ],
    },

    'bookstore_grue_danger': {
      message: '"Dangerous? No. They\'re incredibly dangerous. It is pitch black. You are likely to be eaten by a Grue. This is not a joke. I have seen men disappear into the dark. Only their screams remain."',
      replies: [
        { text: 'Back to Grue questions', nextPhrase: 'bookstore_grue_menu', default: true },
      ],
    },

    'bookstore_grue_detect': {
      message: '"The Listen command — have you tried it? In the darkness, you might hear something scuttling. If your Intelligence is high enough, you may even get a warning before they close in. But honestly? If it\'s dark and you don\'t have light, you\'ve already lost."',
      replies: [
        { text: 'Back to Grue questions', nextPhrase: 'bookstore_grue_menu', default: true },
      ],
    },

    // ── Vermin first sight (self-dialog) ─────────────────────
    'vermin_first_sight': {
      message: "Vermin! No shopkeeper has asked, but if I cull them the merchants will surely thank me.",
      replies: [
        {
          text: 'Time to clean house (accept quest)',
          nextPhrase: '@close',
          default: true,
          scriptEffects: [
            { type: 'advanceQuest', questId: 'q_vermin_slayer', stage: 10 }
          ]
        }
      ]
    },

    // ── Start-of-game class-specific self-dialogs ──────────
    // The class modal sets _selectedClass; input.js starts the
    // corresponding phrase, which grants the class talent and
    // advances to the shared welcome message.
    'fighter_start': {
      message: "The fog lifts over Tristram. Embers still drift from the ruins of the old cathedral. Distant bells toll, muted by a damp wind.\n\n" +
        "Steel and grit — you are a Fighter.",
      autoAdvance: true,
      replies: [
        {
          text: '',
          nextPhrase: 'ready_to_go',
          default: true,
          scriptEffects: [
            { type: 'improveTalent', talentId: 'fighterClass' },
            { type: 'improveTalent', talentId: 'wieldSwords' },
            { type: 'equipItem', slot: 'leftHand', itemName: 'sword' },
            { type: 'equipItem', slot: 'feet', itemName: 'fightersBoots' },
            { type: 'modStat', stat: 'maxHp', delta: 5 },
            { type: 'modStat', stat: 'hp', delta: 5 },
          ],
        },
      ],
    },

    'rogue_start': {
      message: "The fog lifts over Tristram. Embers still drift from the ruins of the old cathedral. Distant bells toll, muted by a damp wind.\n\n" +
        "Shadow and cunning — you are a Rogue.",
      autoAdvance: true,
      replies: [
        {
          text: '',
          nextPhrase: 'ready_to_go',
          default: true,
          scriptEffects: [
            { type: 'improveTalent', talentId: 'rogueClass' },
            { type: 'improveTalent', talentId: 'wieldDaggers' },
            { type: 'giveItem', itemName: 'lockpickingTools', qty: 1 },
            { type: 'equipItem', slot: 'leftHand', itemName: 'dagger' },
          ],
        },
      ],
    },

    'spellcaster_start': {
      message: "The fog lifts over Tristram. Embers still drift from the ruins of the old cathedral. Distant bells toll, muted by a damp wind.\n\n" +
        "Arcane wisdom — you are a Spellcaster.",
      autoAdvance: true,
      replies: [
        {
          text: '',
          nextPhrase: 'ready_to_go',
          default: true,
          scriptEffects: [
            { type: 'improveTalent', talentId: 'spellcasterClass' },
            { type: 'improveTalent', talentId: 'wieldStaffs' },
            { type: 'improveTalent', talentId: 'level1Spell', level: 2 },
            { type: 'equipItem', slot: 'chest', itemName: 'robe' },
            { type: 'equipItem', slot: 'leftHand', itemName: 'staff' },
            { type: 'giveItem', itemName: 'tomeOfIlluminate', qty: 1 },
            { type: 'modStat', stat: 'maxMp', delta: 2 },
            { type: 'modStat', stat: 'mp', delta: 2 },
          ],
        },
      ],
    },

    'ready_to_go': {
      message: "The fog settles. Your gear is ready. The road ahead is uncertain, but fortune favors the bold.",
      replies: [],
    },

    // ── Tutorial phrases ────────────────────────────────────
    'tutorial_first_xp': {
      message: "You gain experience points (XP) from killing monsters and completing quests. Gain enough XP and you level up. The XP needed to reach the next level is shown in the bar at the bottom.",
      replies: [
        { text: 'Got it', nextPhrase: '@close', default: true },
        { text: "Don't show tutorials", nextPhrase: '@close', scriptEffects: [
          { type: 'disableTutorial' },
        ]},
      ],
    },

    'tutorial_first_level_up': {
      message: "You gained enough XP to reach level 2! Whenever you gain a level you get 1 Ability Point (AP) that can be used to increase your base ability scores and 3 Talent Points (TP) that can be used to get or improve special skills. Remember to visit the Character Stats screen each time you gain a level.",
      replies: [
        { text: 'Go to Character Stats now.', nextPhrase: '@close', default: true, scriptEffects: [
          { type: 'callFn', fn: 'toggleModal', args: ['stats-modal'] },
          { type: 'callFn', fn: 'showStatsTab', args: ['stats'] },
        ]},
        { text: 'Save points for later, return to game.', nextPhrase: '@close' },
        { text: "Don't show me these tutorial messages anymore.", nextPhrase: '@close', scriptEffects: [
          { type: 'disableTutorial' },
        ]},
      ],
    },

    'tutorial_save': {
      message: "You've been playing for a while! Don't forget to save your game. Open the menu (tap the ☰ icon in the top-left corner), tap the 💾 Save Game button, and choose where to save. Save often — you never know what's around the corner!",
      replies: [
        { text: 'Save my game now!', nextPhrase: '@close', default: true, scriptEffects: [
          { type: 'callFn', fn: 'saveGame' },
        ]},
        { text: "I'll save later.", nextPhrase: '@close' },
        { text: "Don't show me these tutorial messages anymore.", nextPhrase: '@close', scriptEffects: [
          { type: 'disableTutorial' },
        ]},
      ],
    },

    'tutorial_quickslot': {
      message: "These are your quickslots — they hold items you want quick access to. To assign an item, open your Inventory (tap the 🎒 icon), tap an item to select it, then tap the quickslot you want it in.",
      replies: [
        { text: 'Got it', nextPhrase: '@close', default: true },
        { text: "Don't show tutorials", nextPhrase: '@close', scriptEffects: [
          { type: 'disableTutorial' },
        ]},
      ],
    },

    'tutorial_darkness': {
      message: "Dungeons are dark places. Equip a Candle, cast Illuminate, or invest in the Darkvision talent.",
      replies: [
        { text: 'Got it', nextPhrase: '@close', default: true },
        { text: "Don't show tutorials", nextPhrase: '@close', scriptEffects: [
          { type: 'disableTutorial' },
        ]},
      ],
    },
  });
})();
