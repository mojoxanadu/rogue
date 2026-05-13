  /*
  ╔══════════════════════════════════════════════════════════════════════════════╗
  ║  QUEST PACK: SPACE QUEST — Astrochicken, Roger Wilco, and Janitor Glory    ║
  ║  Rogue JS Build 742                                                    ║
  ╚══════════════════════════════════════════════════════════════════════════════╝

  GAME DESIGN LESSON: Minigames and Useless Items
  =================================================

  Space Quest's genius lies in two areas:
  1. Embedded minigames (Astrochicken in SQ3) that reward mastery
  2. The "janitor hero" identity — Roger Wilco solves problems with
     mundane items like mops, buckets, and cleaning supplies

  The Astrochicken quest rewards skill at an arcade-style minigame.
  The janitor quest rewards exploration with a deliberately "useless"
  item that becomes a badge of honor.

  DESIGN PRINCIPLE: Not every reward needs to be mechanically useful.
  Sometimes the reward IS the joke. A mop that does nothing is funnier
  and more memorable than a +1 sword.
*/

  (function() {
    'use strict';

    window._questPacks = window._questPacks || [];
    window._questPacks.push({
      id: 'space_quest',
      name: 'Space Quest',

      quests: [

        // ── ASTROCHICKEN CHAMPION ──
        // Score 5 points in the Astrochicken minigame to prove your
        // arcade mastery. A nod to Space Quest III's hidden game.
        {
          id: 'q_astrochicken',
          name: 'Astrochicken Champion',
          category: 'Easter Eggs',
          showInLog: true,
          stages: [
            {
              progress: 10,
              logText: 'I found an old arcade cabinet in the dungeon. The screen reads: "ASTROCHICKEN — Insert Coin." I gave it a try.',
              trigger: {
                event: 'custom',
                filter: { id: 'astrochicken_started' },
                requirements: []
              },
              rewards: [],
              rewardExperience: 10,
              intHint: 'The chicken steers like a brick in zero gravity. Short, controlled bursts of thrust work better than holding the button down. Aim for the planets, avoid the asteroids.',
              intHintThreshold: 11
            },
            {
              progress: 20,
              logText: 'I scored 3 points in Astrochicken. The chicken is getting the hang of orbital mechanics.',
              trigger: {
                event: 'custom',
                filter: { id: 'astrochicken_score' },
                requirements: [{ type: 'counter', counter: 'astrochicken_score', min: 3 }]
              },
              rewards: [],
              rewardExperience: 25
            },
            {
              progress: 30,
              logText: 'HIGH SCORE! 5 points in Astrochicken! The cabinet played a victory fanfare and dispensed a token. "Congratulations, Astrochicken Champion!"',
              trigger: {
                event: 'custom',
                filter: { id: 'astrochicken_score' },
                requirements: [{ type: 'counter', counter: 'astrochicken_score', min: 5 }]
              },
              rewards: [{ type: 'achievement', id: 'astrochicken_champion' }],
              rewardExperience: 150,
              finishesQuest: true
            }
          ]
        },

        // ── ROGER WILCO'S LEGACY ──
        // Find the janitor's mop — a "useless" quest item that exists
        // purely as a Space Quest tribute. The real reward is the journey.
        {
          id: 'q_janitor_legacy',
          name: "Roger Wilco's Legacy",
          category: 'Quests',
          showInLog: true,
          stages: [
            {
              progress: 10,
              logText: 'I found a dusty plaque on the wall: "ROGER WILCO — HEAD JANITOR, XENON ORBITAL STATION 4." Someone scratched "hero" underneath it.',
              trigger: {
                event: 'custom',
                filter: { id: 'janitor_plaque_found' },
                requirements: []
              },
              rewards: [],
              rewardExperience: 10,
              intHint: 'Roger Wilco was a janitor who saved the galaxy multiple times using nothing but cleaning supplies and sheer dumb luck. There might be more of his legacy hidden in this dungeon.',
              intHintThreshold: 12
            },
            {
              progress: 20,
              logText: 'I found Roger Wilco\'s supply closet! Inside: one (1) mop, slightly used. It has "Property of R. Wilco" written on the handle in permanent marker.',
              trigger: {
                event: 'custom',
                filter: { id: 'janitor_closet_found' },
                requirements: [{ type: 'questProgress', questId: 'q_janitor_legacy', stage: 10 }]
              },
              rewards: [],
              rewardExperience: 25,
              intHint: 'The mop is completely ordinary. It has no magical properties, no hidden blade, no secret compartment. It is just a mop. And that is exactly the point.',
              intHintThreshold: 10
            },
            {
              progress: 30,
              logText: 'I picked up the janitor\'s mop. It does absolutely nothing useful, but carrying it makes me feel like a hero. Roger Wilco would be proud.',
              trigger: {
                event: 'custom',
                filter: { id: 'janitor_mop_taken' },
                requirements: [{ type: 'questProgress', questId: 'q_janitor_legacy', stage: 20 }]
              },
              rewards: [{ type: 'achievement', id: 'janitor_legacy' }],
              rewardExperience: 100,
              finishesQuest: true
            }
          ]
        }
      ],

      achievements: [
        { id: 'astrochicken_champion', name: 'Astrochicken Champion', cat: 'Easter Eggs', desc: 'Score 5 points in the Astrochicken minigame', icon: '🐔', points: 30 },
        { id: 'janitor_legacy',        name: "Wilco's Heir",          cat: 'Quests',      desc: 'Find Roger Wilco\'s legendary mop',          icon: '🧹', points: 25 }
      ]
    });
  })();
