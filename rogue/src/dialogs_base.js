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
      replies: [
        { text: '[Browse wares]', nextPhrase: '@shop' },
        { text: '[Leave]',        nextPhrase: '@close' },
      ],
    },

    // ── Vimes ────────────────────────────────────────────────
    'mended_drum_vimes_greet': {
      message: quipsFrom('vimes', "I'm off duty. Which means I'm still on duty."),
      replies: [
        { text: '[Leave]', nextPhrase: '@close' },
      ],
    },

    // ── Cohen ────────────────────────────────────────────────
    'mended_drum_cohen_greet': {
      message: quipsFrom('cohen', "Young people today. Always complaining."),
      replies: [
        { text: '[Leave]', nextPhrase: '@close' },
      ],
    },

    // ── Librarian ────────────────────────────────────────────
    'mended_drum_librarian_greet': {
      message: quipsFrom('librarian', 'Ook.'),
      replies: [
        { text: '[Leave]', nextPhrase: '@close' },
      ],
    },

    // ── Dorimunde Ironchin ───────────────────────────────────
    'mended_drum_dorimunde_greet': {
      message: quipsFrom('bearded_dwarf', 'Excuse me, do you know where The Dirty Rat is?'),
      replies: [
        { text: 'Sorry, no.', nextPhrase: '@close' },
        { text: '[Leave]',    nextPhrase: '@close' },
      ],
    },
  });
})();
