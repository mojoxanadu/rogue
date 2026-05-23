// === quests_kq5_genie.js ===
/*
  KQ5 — Genie of the Brass Bottle (drop-in quest pack).

  Owns the genie's wish dialog. The genie NPC itself is still spawned by
  map.js (in the desert/dungeon level 10 path) because the spawn coords
  are coupled to the level's geometry — extracting that is a separate
  tier-3 effort. What this pack DOES own:
    - The dialog tree shown when the player bumps the genie WITH the
      Brass Bottle in inventory (the wish scene).
    - The replies that delegate to the legacy window.genieWish() handler
      in shop.js via the callFn scriptEffect.

  The no-bottle path (genie auto-attacks) remains in engine.js's bump
  handler — that's pure combat plumbing, not dialog content.

  Drop-in property: removing this file means the wish dialog isn't
  registered. The bump handler in engine.js checks
  `typeof Dialog !== 'undefined' && Dialog._phrases['kq5_genie_greet']`
  before delegating, so without the pack the player falls through to
  the no-bottle (combat) path — degraded but not broken.
*/
(function() {
  'use strict';
  if (typeof Dialog === 'undefined') return;

  Dialog.registerPhrases({
    'kq5_genie_greet': {
      // Three-paragraph greeting — the original modal's <p>s collapsed
      // into a single message with blank-line breaks (dialog.js's
      // multi-paragraph support handles the split).
      speaker: 'The Genie of the Dungeon',
      message:
        "You carry the Brass Bottle!\n\n" +
        "I am bound to its master.\n\n" +
        "Speak your wish, mortal.",
      replies: [
        {
          text: "I wish for full health and mana.",
          nextPhrase: '@close',
          scriptEffects: [{ type: 'callFn', fn: 'genieWish', args: ['heal'] }],
        },
        {
          text: "I wish for wealth beyond measure.",
          nextPhrase: '@close',
          scriptEffects: [{ type: 'callFn', fn: 'genieWish', args: ['gold'] }],
        },
        {
          text: "I wish to pass to the next level.",
          nextPhrase: '@close',
          scriptEffects: [{ type: 'callFn', fn: 'genieWish', args: ['pass'] }],
        },
        {
          text: "I wish to fight you!",
          nextPhrase: '@close',
          scriptEffects: [{ type: 'callFn', fn: 'genieWish', args: ['fight'] }],
        },
      ],
    },
  });

  window._questPacks = window._questPacks || [];
  window._questPacks.push({
    id: 'kings_quest_v_genie',
    name: 'KQ5 — Genie of the Brass Bottle',
    quests: [],
    achievements: [],
    handlers: {},
  });
})();
