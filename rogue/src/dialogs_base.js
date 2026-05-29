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

  Dialog.registerPhrases({
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
