  /*
  ╔══════════════════════════════════════════════════════════════════════════════╗
  ║  QUEST PACK: LEISURE SUIT LARRY — Adult Humor, Embarrassment, and Charm    ║
  ║  Rogue JS Build 742                                                    ║
  ╚══════════════════════════════════════════════════════════════════════════════╝

  GAME DESIGN LESSON: Comedy Through Consequences
  =================================================

  Leisure Suit Larry's humor comes from social embarrassment. The player
  does something awkward, and the game world reacts in the most cringe-
  worthy way possible. The "price check" gag is a perfect example:
  buying a simple item triggers a public announcement that mortifies
  the player character.

  This pack brings Larry's brand of humor to the dungeon:
  - The Prophylactic quest recreates the classic pharmacy gag
  - The Mystery Woman quest adds a social encounter with risk/reward

  DESIGN PRINCIPLE: Comedy quests should have low stakes but high
  entertainment value. The "punishment" for failure is laughter, not
  a game over screen.
*/

  (function() {
    'use strict';

    window._questPacks = window._questPacks || [];
    window._questPacks.push({
      id: 'leisure_suit_larry',
      name: 'Leisure Suit Larry',

      quests: [

        // ── THE PROPHYLACTIC ──
        // Buy a certain item from Apu's store. The price check announcement
        // over the loudspeaker is the punchline.
        {
          id: 'q_prophylactic',
          name: 'The Prophylactic',
          category: 'Easter Eggs',
          showInLog: true,
          stages: [
            {
              progress: 10,
              logText: 'I noticed a "special item" behind the counter at Apu\'s store. He says I have to ask for it by name. How embarrassing.',
              trigger: {
                event: 'shop_visit',
                filter: { type: 'apu' },
                requirements: [{ type: 'counter', counter: 'shop_visit_apu', min: 1 }]
              },
              rewards: [],
              rewardExperience: 5,
              intHint: 'Apu seems to enjoy the awkwardness. If I just ask confidently, maybe it will be less painful. Or maybe not.',
              intHintThreshold: 10
            },
            {
              progress: 20,
              logText: 'I asked Apu for the prophylactic. He picked up the loudspeaker: "PRICE CHECK ON PROPHYLACTICS!" The entire dungeon heard it.',
              trigger: {
                event: 'custom',
                filter: { id: 'price_check_announced' },
                requirements: [{ type: 'questProgress', questId: 'q_prophylactic', stage: 10 }]
              },
              rewards: [{ type: 'achievement', id: 'price_checked' }],
              rewardExperience: 50,
              intHint: 'Well, that was mortifying. But at least I have the item now. In Larry\'s world, embarrassment is just the cost of doing business.',
              intHintThreshold: 10
            },
            {
              progress: 30,
              logText: 'I survived the most embarrassing shopping trip of my life. Apu winked and said "Come again!" I\'d rather not.',
              trigger: {
                event: 'custom',
                filter: { id: 'prophylactic_purchased' },
                requirements: [{ type: 'questProgress', questId: 'q_prophylactic', stage: 20 }]
              },
              rewards: [],
              rewardExperience: 75,
              finishesQuest: true
            }
          ]
        },

        // ── MYSTERY WOMAN ──
        // Chat up the lady at Lefty's Bar. Social skill check with
        // comedic failure states.
        {
          id: 'q_mystery_woman',
          name: 'Mystery Woman',
          category: 'Social',
          showInLog: true,
          stages: [
            {
              progress: 10,
              logText: 'I spotted a mysterious woman sitting alone at Lefty\'s Bar. She looked bored. This is my chance.',
              trigger: {
                event: 'custom',
                filter: { id: 'leftys_bar_entered' },
                requirements: []
              },
              rewards: [],
              rewardExperience: 10,
              intHint: 'She\'s reading a book on ancient philosophy. Leading with a smart conversation topic might work better than a cheesy pickup line.',
              intHintThreshold: 13
            },
            {
              progress: 20,
              logText: 'I introduced myself to the mystery woman. She raised an eyebrow but didn\'t leave. Progress!',
              trigger: {
                event: 'custom',
                filter: { id: 'mystery_woman_chatted' },
                requirements: [{ type: 'questProgress', questId: 'q_mystery_woman', stage: 10 }]
              },
              rewards: [{ type: 'achievement', id: 'mystery_woman_met' }],
              rewardExperience: 50
            },
            {
              progress: 30,
              logText: 'The mystery woman and I had a surprisingly deep conversation about dungeon architecture. She gave me a lucky charm before leaving. "For courage," she said.',
              trigger: {
                event: 'custom',
                filter: { id: 'mystery_woman_charmed' },
                requirements: [{ type: 'questProgress', questId: 'q_mystery_woman', stage: 20 }]
              },
              rewards: [],
              rewardExperience: 100,
              finishesQuest: true
            },
            {
              // ALTERNATE ENDING: rejection
              progress: 25,
              logText: 'The mystery woman threw her drink in my face. "Not in a million years, pal." Lefty laughed so hard he fell behind the bar.',
              trigger: {
                event: 'custom',
                filter: { id: 'mystery_woman_rejected' },
                requirements: []
              },
              rewards: [],
              rewardExperience: 25,
              finishesQuest: true
            }
          ]
        }
      ],

      achievements: [
        { id: 'price_checked',    name: 'Price Check!',        cat: 'Easter Eggs', desc: 'Endure the prophylactic price check announcement',  icon: '📢', points: 25 },
        { id: 'mystery_woman_met', name: 'Smooth Operator',    cat: 'Social',      desc: 'Successfully chat up the mystery woman at Lefty\'s', icon: '💃', points: 20 }
      ]
    });
  })();
