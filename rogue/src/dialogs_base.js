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
      // Multi-paragraph greeting: opener, then the carved-over-the-bar motto,
      // then a sales pitch for the in-sewer-ants policy. Paragraphs split on
      // blank lines (\n\n).
      message:
        "What'll it be, traveler?\n\n" +
        "Motto over the bar reads: \"Quanti Canicula Ille In Fenestra.\" Old Latin. " +
        "Means \"How much is that doggie in the window?\" Long story, don't ask.\n\n" +
        "We've also got an Inn-Sewer-Ants Policy — 50 quid, covers you for limb loss up to but not including the head. Highly recommended.",
      // No '[Leave]' reply — the bottom Leave button handles closure.
      // Only meaningful response options live in the replies list.
      replies: [
        { text: 'Browse your wares.', nextPhrase: '@shop', default: true },
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
      replies: [
        {
          text: 'Onward',
          nextPhrase: 'welcome_message',
          default: true,
          scriptEffects: [{ type: 'improveTalent', talentId: 'fighterClass' }],
        },
      ],
    },

    'rogue_start': {
      message: "The fog lifts over Tristram. Embers still drift from the ruins of the old cathedral. Distant bells toll, muted by a damp wind.\n\n" +
        "Shadow and cunning — you are a Rogue.",
      replies: [
        {
          text: 'Onward',
          nextPhrase: 'welcome_message',
          default: true,
          scriptEffects: [{ type: 'improveTalent', talentId: 'rogueClass' }],
        },
      ],
    },

    'spellcaster_start': {
      message: "The fog lifts over Tristram. Embers still drift from the ruins of the old cathedral. Distant bells toll, muted by a damp wind.\n\n" +
        "Arcane wisdom — you are a Spellcaster.",
      replies: [
        {
          text: 'Onward',
          nextPhrase: 'welcome_message',
          default: true,
          scriptEffects: [{ type: 'improveTalent', talentId: 'spellcasterClass' }],
        },
      ],
    },

    'welcome_message': {
      message: "The brook chatters east of town, and a road runs toward an overgrown hedge country.",
      replies: [
        {
          text: 'Ready my fighter gear',
          nextPhrase: '@close',
          default: true,
          requires: [{ type: 'talent', talentId: 'fighterClass' }],
          scriptEffects: [
            { type: 'improveTalent', talentId: 'wieldSwords' },
            { type: 'equipItem', slot: 'leftHand', itemName: 'sword' },
            { type: 'equipItem', slot: 'feet', itemName: 'fightersBoots' },
            { type: 'modStat', stat: 'maxHp', delta: 5 },
            { type: 'modStat', stat: 'hp', delta: 5 },
          ],
        },
        {
          text: 'Ready my rogue gear',
          nextPhrase: '@close',
          default: true,
          requires: [{ type: 'talent', talentId: 'rogueClass' }],
          scriptEffects: [
            { type: 'improveTalent', talentId: 'wieldDaggers' },
            { type: 'giveItem', itemName: 'lockpickingTools', qty: 1 },
            { type: 'equipItem', slot: 'leftHand', itemName: 'dagger' },
          ],
        },
        {
          text: 'Ready my spellcaster gear',
          nextPhrase: '@close',
          default: true,
          requires: [{ type: 'talent', talentId: 'spellcasterClass' }],
          scriptEffects: [
            { type: 'improveTalent', talentId: 'wieldStaffs' },
            { type: 'improveTalent', talentId: 'level1Spell', level: 2 },
            { type: 'equipItem', slot: 'chest', itemName: 'robe' },
            { type: 'modStat', stat: 'maxMp', delta: 2 },
            { type: 'modStat', stat: 'mp', delta: 2 },
          ],
        },
      ],
    },
  });
})();
