  /*
  ╔══════════════════════════════════════════════════════════════════════════════╗
  ║  QUEST PACK: QUEST FOR GLORY — Wizard Challenges and Fighter Training      ║
  ║  Rogue JS Build 742                                                    ║
  ╚══════════════════════════════════════════════════════════════════════════════╝

  GAME DESIGN LESSON: Class-Flavored Quests
  ==========================================

  Quest for Glory's brilliance was in offering different quest solutions
  for different character classes. A Fighter bashes through obstacles,
  a Mage solves puzzles with spells, and a Thief sneaks past danger.

  This pack brings two class-flavored quest lines:
  - Erasmus's Tower: a wizard NPC in the bookshop challenges the player
    with a test of intellect and magical knowledge
  - Fighter's Training: a pure combat progression quest that rewards
    reaching level 5 through battle

  DESIGN PRINCIPLE: Multiple paths to success. Not every quest should
  demand the same playstyle. Offer quests that reward different builds.
*/

  (function() {
    'use strict';

    window._questPacks = window._questPacks || [];
    window._questPacks.push({
      id: 'quest_for_glory',
      name: 'Quest for Glory',

      quests: [

        // ── ERASMUS'S TOWER ──
        // The wizard Erasmus appears in the bookshop and challenges the
        // player to a test of wit. INT-gated content with multiple stages.
        {
          id: 'q_erasmus_tower',
          name: "Erasmus's Tower",
          category: 'Quests',
          showInLog: true,
          stages: [
            {
              progress: 10,
              logText: 'I met a flamboyant wizard named Erasmus in the bookshop. He was browsing the spellbook section with his rat familiar, Fenrus. He challenged me to visit his tower and prove my worth.',
              trigger: {
                event: 'custom',
                filter: { id: 'erasmus_met' },
                requirements: []
              },
              rewards: [],
              rewardExperience: 15,
              intHint: 'Erasmus is eccentric but brilliant. His challenges tend to be riddles and logic puzzles, not combat. Preparing my mind is more important than sharpening my sword.',
              intHintThreshold: 12
            },
            {
              progress: 20,
              logText: 'I found Erasmus\'s tower. The door asked me a riddle: "What has roots as nobody sees, is taller than trees, up, up it goes, and yet never grows?" I answered correctly: a mountain.',
              trigger: {
                event: 'custom',
                filter: { id: 'erasmus_riddle_solved' },
                requirements: [{ type: 'questProgress', questId: 'q_erasmus_tower', stage: 10 }]
              },
              rewards: [],
              rewardExperience: 50,
              intHint: 'Erasmus\'s tower has more challenges inside. Each floor tests a different aspect of intellect. The final challenge is said to be a game of wits against Erasmus himself.',
              intHintThreshold: 13
            },
            {
              progress: 30,
              logText: 'I completed Erasmus\'s challenge! The old wizard clapped his hands in delight. "Splendid! You have the mind of a true Hero!" Fenrus the rat squeaked approvingly. Erasmus gave me a scroll of ancient knowledge as a reward.',
              trigger: {
                event: 'custom',
                filter: { id: 'erasmus_challenge_complete' },
                requirements: [{ type: 'questProgress', questId: 'q_erasmus_tower', stage: 20 }]
              },
              rewards: [{ type: 'achievement', id: 'erasmus_challenge' }],
              rewardExperience: 200,
              finishesQuest: true
            },
            {
              // ALTERNATE ENDING: failed the challenge
              progress: 25,
              logText: 'I failed Erasmus\'s final challenge. The wizard sighed and teleported me back to town. "Come back when you\'ve studied more," he said. Fenrus looked disappointed.',
              trigger: {
                event: 'custom',
                filter: { id: 'erasmus_challenge_failed' },
                requirements: []
              },
              rewards: [],
              rewardExperience: 25,
              finishesQuest: true
            }
          ]
        },

        // ── FIGHTER'S TRAINING ──
        // A combat progression quest: reach level 5 by fighting monsters.
        // Tracks the classic QFG Fighter path.
        {
          id: 'q_fighter_training',
          name: "Fighter's Training",
          category: 'Combat',
          showInLog: true,
          stages: [
            {
              progress: 10,
              logText: 'I began training as a fighter. Every monster I defeat makes me stronger. The weapon master said I need to reach level 5 to be considered a true warrior.',
              trigger: {
                event: 'kill',
                filter: {},
                requirements: [{ type: 'counter', counter: 'kill_total', min: 5 }]
              },
              rewards: [],
              rewardExperience: 20,
              intHint: 'The weapon master trains fighters in the courtyard every morning. Consistent combat practice is the fastest path to level 5.',
              intHintThreshold: 10
            },
            {
              progress: 20,
              logText: 'My combat skills are improving. I can feel myself getting stronger with each battle. Level 3 — halfway there.',
              trigger: {
                event: 'level_up',
                filter: {},
                requirements: [{ type: 'playerLevel', min: 3 }]
              },
              rewards: [],
              rewardExperience: 30
            },
            {
              progress: 30,
              logText: 'I reached level 5! The weapon master nodded with approval. "You fight like a true Hero now. The guild recognizes your skill." I am a trained fighter.',
              trigger: {
                event: 'level_up',
                filter: {},
                requirements: [{ type: 'playerLevel', min: 5 }]
              },
              rewards: [{ type: 'achievement', id: 'fighter_trained' }],
              rewardExperience: 150,
              finishesQuest: true
            }
          ]
        }
      ],

      achievements: [
        { id: 'erasmus_challenge', name: 'Wizard\'s Apprentice', cat: 'Quests', desc: 'Complete Erasmus\'s tower challenge',       icon: '🧙', points: 30 },
        { id: 'fighter_trained',   name: 'Trained Fighter',      cat: 'Combat', desc: 'Reach level 5 through combat training',    icon: '⚔️', points: 25 }
      ]
    });
  })();
