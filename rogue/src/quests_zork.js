  /*
  ╔══════════════════════════════════════════════════════════════════════════════╗
  ║  QUEST PACK: ZORK — Grues, Thieves, and the Great Underground Empire       ║
  ║  Rogue JS Build 742                                                    ║
  ╚══════════════════════════════════════════════════════════════════════════════╝

  GAME DESIGN LESSON: Darkness as a Mechanic
  ============================================

  Zork's most iconic mechanic is darkness. "It is pitch black. You are
  likely to be eaten by a grue." The grue is never seen — it exists only
  as a consequence of being in a dark place without a light source.

  This quest pack brings that tension to Roguelike: venturing into
  deep, unlit floors without a torch is a gamble. The grue encounter
  rewards players who survive the darkness, while the thief quest adds
  a classic inventory-theft mechanic from the original Zork trilogy.
*/

  (function() {
    'use strict';

    window._questPacks = window._questPacks || [];
    window._questPacks.push({
      id: 'zork',
      name: 'Zork',

      quests: [

        // ── GRUE ENCOUNTER ──
        // Deep dark areas on floor 6+ hold the dreaded grue.
        // Survive the encounter to prove you're no ordinary adventurer.
        {
          id: 'q_grue_encounter',
          name: 'Grue Encounter',
          category: 'Quests',
          showInLog: true,
          stages: [
            {
              progress: 10,
              logText: 'It is pitch black. I am likely to be eaten by a grue. I should find a light source.',
              trigger: {
                event: 'enter_level',
                filter: {},
                requirements: [{ type: 'location', level: 6 }]
              },
              rewards: [],
              rewardExperience: 10,
              intHint: 'Grues cannot survive in any light. Even a fading torch will keep them at bay — but once it goes out, they strike instantly.',
              intHintThreshold: 11
            },
            {
              progress: 20,
              logText: 'I felt the grue\'s breath on my neck in the darkness. My torch flickered but held. Too close.',
              trigger: {
                event: 'custom',
                filter: { id: 'grue_near_miss' },
                requirements: [{ type: 'questProgress', questId: 'q_grue_encounter', stage: 10 }]
              },
              rewards: [],
              rewardExperience: 50,
              intHint: 'The grue retreated when the light returned. They seem to fear even the smallest flame. A lantern would be more reliable than a torch down here.',
              intHintThreshold: 13
            },
            {
              progress: 30,
              logText: 'I survived the darkness of the Great Underground Empire. The grue will have to find another meal.',
              trigger: {
                event: 'custom',
                filter: { id: 'grue_survived' },
                requirements: []
              },
              rewards: [{ type: 'achievement', id: 'grue_survivor' }],
              rewardExperience: 150,
              finishesQuest: true
            }
          ]
        },

        // ── THIEF'S LAIR ──
        // The infamous Zork thief stalks the dungeon, stealing items.
        // Track him to his lair, defeat him, and recover your treasure.
        {
          id: 'q_zork_thief',
          name: "Thief's Lair",
          category: 'Quests',
          showInLog: true,
          stages: [
            {
              progress: 10,
              logText: 'A seedy-looking individual with a large bag just robbed me blind! He vanished into the shadows.',
              trigger: {
                event: 'custom',
                filter: { id: 'zork_thief_robbed' },
                requirements: []
              },
              rewards: [],
              rewardExperience: 10,
              intHint: 'The thief dropped a trail of coins heading east. He must have a hideout somewhere on this floor.',
              intHintThreshold: 12
            },
            {
              progress: 20,
              logText: 'I found the thief\'s hidden lair behind a crumbling wall. He\'s here, counting his stolen loot.',
              trigger: {
                event: 'custom',
                filter: { id: 'zork_thief_lair_found' },
                requirements: [{ type: 'questProgress', questId: 'q_zork_thief', stage: 10 }]
              },
              rewards: [],
              rewardExperience: 50,
              intHint: 'The thief is quick but fragile. He relies on dodging, not armor. A heavy weapon or area attack would be most effective.',
              intHintThreshold: 13
            },
            {
              progress: 30,
              logText: 'I defeated the thief and recovered my stolen treasure! His bag contained far more than what he took from me.',
              trigger: {
                event: 'kill',
                filter: { type: 'thief' },
                requirements: [{ type: 'questProgress', questId: 'q_zork_thief', stage: 20 }]
              },
              rewards: [
                { type: 'achievement', id: 'zork_thief_defeated' },
                { type: 'giveGold', amount: 200 }
              ],
              rewardExperience: 200,
              finishesQuest: true
            }
          ]
        }
      ],

      achievements: [
        { id: 'grue_survivor',       name: 'Grue Survivor',       cat: 'Quests', desc: 'Survive a grue encounter in the dark',    icon: '🕯️', points: 30 },
        { id: 'zork_thief_defeated', name: 'Thief Bane',          cat: 'Quests', desc: 'Defeat the thief and recover your loot',  icon: '💰', points: 35 }
      ]
    });
  })();
