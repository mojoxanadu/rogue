  /*
  ╔══════════════════════════════════════════════════════════════════════════════╗
  ║  QUEST PACK: ELDER SCROLLS — Daedric Bargains and Dark Brotherhood         ║
  ║  Rogue JS Build 742                                                    ║
  ╚══════════════════════════════════════════════════════════════════════════════╝

  GAME DESIGN LESSON: Moral Choices and Consequence
  ===================================================

  The Elder Scrolls series is built on moral ambiguity. Daedric quests
  offer power at a price, and the Dark Brotherhood punishes murderers
  with unexpected consequences. This pack brings both mechanics:

  - Clavicus Vile's Bargain: accept a powerful artifact (the Masque)
    in exchange for a permanent stat penalty, or refuse and keep your
    soul intact. Neither choice is "correct" — both have trade-offs.

  - Dark Brotherhood: killing passive creatures flags you as a target.
    An assassin visits while you sleep. This is a CONSEQUENCE QUEST —
    the player's past actions trigger future danger.

  DESIGN PRINCIPLE: The best moral choices have no "right" answer.
  Both paths should feel meaningful and have lasting gameplay impact.
*/

  (function() {
    'use strict';

    window._questPacks = window._questPacks || [];
    window._questPacks.push({
      id: 'elder_scrolls',
      name: 'Elder Scrolls',

      quests: [

        // ── CLAVICUS VILE'S BARGAIN ──
        // A Daedric Prince offers the Masque of Clavicus Vile in exchange
        // for the player's soul (permanent stat penalty). A true moral dilemma.
        {
          id: 'q_clavicus_bargain',
          name: "Clavicus Vile's Bargain",
          category: 'Quests',
          showInLog: true,
          stages: [
            {
              progress: 10,
              logText: 'A smooth-talking NPC in fine clothes appeared from nowhere. He introduced himself as a "humble servant" of Lord Clavicus Vile and offered me a deal.',
              trigger: {
                event: 'custom',
                filter: { id: 'clavicus_npc_met' },
                requirements: []
              },
              rewards: [],
              rewardExperience: 20,
              intHint: 'This man serves a Daedric Prince — a being of immense power and questionable morality. Any deal he offers will have a hidden cost. Listen carefully to the exact wording.',
              intHintThreshold: 13,
              intHintModal: 'Your intellect recognizes the signs of a Daedric bargain. Clavicus Vile is the Prince of Bargains and Wishes — he always gives exactly what he promises, but never what you actually want. The Masque is powerful, but "your soul" likely means a permanent penalty to something vital.'
            },
            {
              progress: 20,
              logText: 'The servant offered me the Masque of Clavicus Vile — a helm of incredible power. The price: my soul. I must decide.',
              trigger: {
                event: 'custom',
                filter: { id: 'clavicus_offer_made' },
                requirements: [{ type: 'questProgress', questId: 'q_clavicus_bargain', stage: 10 }]
              },
              rewards: [],
              rewardExperience: 25,
              intHint: '"Your soul" in Daedric terms usually translates to a permanent reduction in maximum HP or experience gain. The Masque will boost charisma and defense, but the soul penalty is forever.',
              intHintThreshold: 14
            },
            {
              // ACCEPTED THE DEAL
              progress: 30,
              logText: 'I accepted the Masque of Clavicus Vile. Power surges through me, but something feels... missing. My soul belongs to a Daedric Prince now.',
              trigger: {
                event: 'custom',
                filter: { id: 'clavicus_accepted' },
                requirements: []
              },
              rewards: [
                { type: 'achievement', id: 'clavicus_deal' },
                { type: 'setFlag', flag: 'sold_soul_clavicus', value: true }
              ],
              rewardExperience: 200,
              finishesQuest: true
            },
            {
              // REFUSED THE DEAL
              progress: 25,
              logText: 'I refused the Daedric bargain. The servant smiled knowingly and vanished. "Perhaps next time," he whispered.',
              trigger: {
                event: 'custom',
                filter: { id: 'clavicus_refused' },
                requirements: []
              },
              rewards: [],
              rewardExperience: 100,
              finishesQuest: true
            }
          ]
        },

        // ── DARK BROTHERHOOD ──
        // If the player has killed passive creatures, an assassin appears
        // during a rest event. Consequence-driven quest design.
        {
          id: 'q_dark_brotherhood',
          name: 'Dark Brotherhood',
          category: 'Quests',
          showInLog: true,
          stages: [
            {
              progress: 10,
              logText: 'I woke to find a note on my chest: "We know." Signed with a black handprint. Someone is watching me.',
              trigger: {
                event: 'custom',
                filter: { id: 'dark_brotherhood_note' },
                requirements: [{ type: 'counter', counter: 'kill_passive', min: 3 }]
              },
              rewards: [],
              rewardExperience: 15,
              intHint: 'The Black Hand is the symbol of the Dark Brotherhood — an assassins guild that recruits through murder. Killing innocent creatures has drawn their attention. An assassin will come for me soon.',
              intHintThreshold: 12
            },
            {
              progress: 20,
              logText: 'An assassin in dark leather attacked me while I slept! The Dark Brotherhood has come to collect.',
              trigger: {
                event: 'custom',
                filter: { id: 'assassin_attack' },
                requirements: [{ type: 'questProgress', questId: 'q_dark_brotherhood', stage: 10 }]
              },
              rewards: [],
              rewardExperience: 50,
              intHint: 'The assassin is fast and deals poison damage. If I can survive the first strike, the poison wears off quickly. Heavy armor helps absorb the initial blow.',
              intHintThreshold: 13
            },
            {
              progress: 30,
              logText: 'I defeated the Dark Brotherhood assassin! On his body I found a contract with my name on it — and a set of fine dark leather armor.',
              trigger: {
                event: 'kill',
                filter: { type: 'assassin' },
                requirements: [{ type: 'questProgress', questId: 'q_dark_brotherhood', stage: 20 }]
              },
              rewards: [{ type: 'achievement', id: 'assassin_survived' }],
              rewardExperience: 200,
              finishesQuest: true
            }
          ]
        }
      ],

      achievements: [
        { id: 'clavicus_deal',    name: 'Soul Bargainer',      cat: 'Quests', desc: 'Complete Clavicus Vile\'s Bargain',          icon: '😈', points: 30 },
        { id: 'assassin_survived', name: 'Assassin Survivor',  cat: 'Quests', desc: 'Survive a Dark Brotherhood assassination',   icon: '🗡️', points: 35 }
      ]
    });
  })();
