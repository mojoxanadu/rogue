  /*
  ╔══════════════════════════════════════════════════════════════════════════════╗
  ║  QUEST PACK: BLACK CAULDRON — Prydain, Gurgi, Morva Witches, Horned King   ║
  ║  Rogue JS Build 742                                                    ║
  ╚══════════════════════════════════════════════════════════════════════════════╝

  GAME DESIGN LESSON: Emotional Quest Design
  =============================================

  The Black Cauldron quest pack demonstrates EMOTIONAL BEATS in quest design.
  Not every quest is about combat or loot. The best quests create moments
  that players REMEMBER:

  - KINDNESS:   Feeding Gurgi creates an emotional bond
  - SACRIFICE:  Gurgi jumping into the Cauldron is the climax
  - HUMOR:      The Morva witches' trilling is comic relief
  - TENSION:    Castle Rat capture creates helplessness
  - RELIEF:     Mouse rescue is the payoff for the tension

  When designing quests, map out the EMOTIONAL ARC, not just the mechanical
  steps. Ask: "How should the player FEEL at each stage?"

  LESSON: INT-gated hints in this pack reveal Prydain lore and give
  strategic advice about the Horned King's weaknesses.
*/

  window._questPacks = window._questPacks || [];

  window._questPacks.push({

    quests: [

      // ── GURGI'S QUEST ──
      // LESSON: This is the emotional centerpiece of the pack. It follows
      // the classic hero's journey "ordeal" structure:
      //   1. Meet ally (Gurgi in the forest)
      //   2. Bond with ally (feed him)
      //   3. Ally helps you (shows castle entrance)
      //   4. Climactic sacrifice (Gurgi jumps in the Cauldron)
      //
      // Note how stage 40 uses a CALLBACK reward for the sacrifice
      // animation — this is the kind of custom moment that can't be
      // expressed as data alone.
      {
        id: "q_gurgi",
        name: "Munchings and Crunchings",
        category: "Quests",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "I met a strange creature in the forest. It calls itself Gurgi and begs for 'munchings and crunchings.' It seems hungry and harmless.",
            // Manual — triggered by bumping into Gurgi
            intHint: "Gurgi appears to be a loyal but cowardly creature. If I feed him, he might become an ally. Forest creatures like him often know secret paths that others can't find.",
            intHintThreshold: 11
          },
          {
            progress: 20,
            logText: "I fed Gurgi! He danced with joy and swore eternal friendship. 'Gurgi's friend! Gurgi will help! Gurgi knows the way!' He seems to know a secret entrance to the castle.",
            rewards: [{ type: "achievement", id: "gurgi_fed" }],
            rewardExperience: 100,
            intHint: "Gurgi mentioned a 'dark door under the rocks' near the castle walls. This must be the service entrance to the Horned King's fortress. Without Gurgi, we'd never find it.",
            intHintThreshold: 12,
            intHintModal: "Gurgi tugs at your sleeve and whispers: 'Gurgi knows the secret way! Under the big rock, behind the thorny bush! The bad soldiers never look there!' Your intellect recognizes this as invaluable intelligence — a hidden entrance bypassing the castle's main defenses."
          },
          {
            progress: 30,
            logText: "Gurgi led me to a hidden entrance into the Horned King's castle! Without him, I'd never have found it.",
            rewards: [
              { type: "setFlag", flag: "castle_entrance_found", value: true }
            ],
            rewardExperience: 150
          },
          {
            progress: 40,
            logText: "In the final confrontation, Gurgi leapt into the Black Cauldron to destroy its power. His sacrifice saved us all. The Cauldron cracked and its dark magic dissipated. Poor, brave Gurgi...",
            rewards: [
              { type: "achievement", id: "gurgi_sacrifice" },
              { type: "callback", fn: "gurgiSacrificeScene" }
            ],
            rewardExperience: 500,
            finishesQuest: true,
            intHint: "The Cauldron's magic required a willing sacrifice to be undone. Gurgi understood this instinctively — his simple heart grasped what scholars couldn't. Sometimes wisdom isn't about intelligence at all.",
            intHintThreshold: 15
          }
        ]
      },

      // ── CASTLE RAT QUEST ──
      // LESSON: This quest demonstrates FAILURE AS PROGRESSION.
      // Getting captured by the Castle Rat isn't game over — it's
      // a quest stage that leads to a different (and memorable) path.
      //
      // Many players' instinct is to make failure = death. But the most
      // memorable game moments come from RECOVERING from failure.
      // Being rescued by mice after being captured is more interesting
      // than simply defeating the rat and moving on.
      {
        id: "q_castle_rat",
        name: "Prisoner of the Horned King",
        category: "Quests",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "I spotted the Castle Rat skulking through the Horned King's fortress. It seems to be a spy — I should avoid it.",
            intHint: "The Castle Rat reports directly to the Horned King's guard captain. If it spots me, I'll be thrown in the dungeon. I should try to sneak past it rather than fight — its alarm will bring reinforcements.",
            intHintThreshold: 12,
            intHintModal: "Your intellect analyzes the rat's patrol pattern. It follows a predictable route along the corridor walls. If you time your movement carefully, you can slip past when it turns the corner. Fighting it is a BAD idea — it has an alarm ability that summons guards."
          },
          {
            progress: 20,
            logText: "The Castle Rat captured me! I was thrown into a dark cell deep in the castle dungeon. The door is solid iron — I can't break it.",
            rewards: [{ type: "achievement", id: "castle_rat_captured" }],
            intHint: "The cell walls are old and crumbling in places. I can hear tiny scratching sounds — mice, perhaps? If I had some food to lure them...",
            intHintThreshold: 10
          },
          {
            progress: 30,
            logText: "I used food to lure mice to my cell! They gnawed through my bonds and squeezed through a crack in the wall, showing me a way out. Bless their tiny hearts.",
            rewards: [
              { type: "achievement", id: "mouse_rescue" },
              { type: "callback", fn: "mouseRescueScene" }
            ],
            rewardExperience: 200,
            finishesQuest: true,
            intHint: "The mouse hole leads to a network of passages inside the castle walls. These connect to the Horned King's throne room — a back entrance he doesn't know about.",
            intHintThreshold: 14
          }
        ]
      },

      // ── MORVA WITCHES QUEST ──
      // LESSON: Comic relief serves a critical design purpose — it
      // releases tension before the climax. The Morva witches' trilling
      // and absurd bargaining provides a break between the tense
      // castle infiltration and the final boss fight.
      //
      // Also demonstrates the TRADE MECHANIC pattern: the witches want
      // items in exchange for information/items. This gives purpose to
      // "junk" items the player has been collecting.
      {
        id: "q_morva_witches",
        name: "The Witches of Morva",
        category: "Quests",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "I found a hut in the forest inhabited by three witches — Orddu, Orgoch, and Orwen. They trill and cackle incessantly. They claim to know the location of the Black Cauldron.",
            // Manual — triggered by entering the witches' hut
            intHint: "The witches are shrewd bargainers despite their eccentric behavior. They'll want something valuable in trade for the Cauldron's location. Flattery might work on Orwen — she's the vainest of the three.",
            intHintThreshold: 13
          },
          {
            progress: 20,
            logText: "The witches want a trade for the Cauldron's location. Orddu wants something 'interesting,' Orgoch wants something to eat, and Orwen wants something 'pretty.' Their trilling is giving me a headache.",
            rewards: [{ type: "achievement", id: "morva_trill" }],
            intHint: "Orwen keeps eyeing my equipment. I think she wants the enchanted brooch — the magical one. Orgoch would settle for any food. And Orddu... Orddu wants the Brass Bottle. She says it 'reminds her of someone.'",
            intHintThreshold: 14,
            intHintModal: "Your intellect deciphers the witches' true desires beneath their trilling madness:\n\n• ORDDU (the leader): Wants the Brass Bottle (🏺). She senses the genie's residual magic.\n• ORGOCH (the hungry one): Wants any food item. She's always hungry.\n• ORWEN (the vain one): Wants a piece of jewelry or shiny equipment.\n\nSatisfy all three and they'll reveal the Cauldron's location AND give you a powerful blessing."
          },
          {
            progress: 30,
            logText: "I satisfied the witches' demands! They revealed that the Black Cauldron is hidden in the deepest chamber of the Horned King's castle. They also gave me a blessing — 'for courage,' they said, through their trilling.",
            rewards: [
              { type: "giveXP", amount: 300 },
              { type: "setFlag", flag: "cauldron_location_known", value: true }
            ],
            rewardExperience: 100,
            finishesQuest: true
          }
        ]
      },

      // ── HORNED KING BOSS QUEST ──
      // LESSON: The final boss quest ties together multiple quest chains.
      // Notice the requirements: you need Gurgi's help (stage 30) AND
      // the Cauldron location from the witches. This makes all previous
      // quests feel MEANINGFUL — they were building toward this moment.
      {
        id: "q_horned_king",
        name: "The Horned King",
        category: "Quests",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "I've learned of the Horned King — a skeletal warlord who seeks the Black Cauldron to raise an army of the undead. He must be stopped.",
            intHint: "The Horned King is a lich-like being. His power comes from the Cauldron itself. If the Cauldron can be destroyed, his army of Cauldron Born will crumble to dust — but destroying the Cauldron requires a willing sacrifice...",
            intHintThreshold: 14,
            intHintModal: "Your scholarly mind pieces together the ancient texts: The Black Cauldron can raise the dead as 'Cauldron Born' — mindless undead warriors. But the Cauldron has a flaw: if a LIVING being willingly enters it, the Cauldron's power is broken forever.\n\nThe catch? The one who enters... doesn't come back.\n\nYou realize with horror that someone will have to sacrifice themselves to save the world."
          },
          {
            progress: 20,
            logText: "I've entered the Horned King's castle. Cauldron Born patrol the halls — reanimated warriors with empty eyes. The Cauldron must be close.",
            intHint: "The Cauldron Born are immune to normal weapons but vulnerable to magical attacks. If I don't have spells, I should avoid them entirely and head straight for the throne room.",
            intHintThreshold: 12
          },
          {
            progress: 30,
            logText: "I found the Black Cauldron in the throne room! The Horned King stands before it, channeling dark energy to raise more of the dead.",
            rewardExperience: 100
          },
          {
            progress: 40,
            logText: "I DEFEATED THE HORNED KING! As the Cauldron's power faded, his body crumbled to ash. The Cauldron Born collapsed where they stood. The world is safe... but the cost was high.",
            trigger: {
              event: "kill",
              filter: { type: "horned_king" },
              requirements: []
            },
            rewards: [
              { type: "achievement", id: "horned_king_defeated" },
              { type: "giveXP", amount: 1000 },
              { type: "giveGold", amount: 500 }
            ],
            rewardExperience: 500,
            finishesQuest: true
          }
        ]
      }
    ],

    achievements: [
      { id: 'gurgi_fed',       name: 'Munchings & Crunchings', cat: 'Quests', desc: 'Feed Gurgi to befriend him', icon: '🐵', points: 20 },
      { id: 'gurgi_sacrifice', name: "Gurgi's Sacrifice",      cat: 'Quests', desc: "Witness Gurgi's noble sacrifice", icon: '💔', points: 40 },
      { id: 'castle_rat_captured', name: 'Prisoner of the Horned King', cat: 'Quests', desc: 'Captured by the Castle Rat', icon: '🐀', points: 15 },
      { id: 'mouse_rescue',    name: 'Rescued by Mice',        cat: 'Quests', desc: 'Rescued by mice from the dungeon cell', icon: '🐭', points: 25 },
      { id: 'morva_trill',     name: "Witch's Trill",          cat: 'Easter Eggs', desc: "Endure the Morva witches' trilling", icon: '🧙‍♀️', points: 20 },
      { id: 'horned_king_defeated', name: 'Defeater of the Horned King', cat: 'Quests', desc: 'Defeat the Horned King', icon: '💀', points: 50 },
      { id: 'eagle_eye',       name: 'Eagle Eye',              cat: 'Quests', desc: 'Feed the starving eagle', icon: '🦅', points: 20 },
      { id: 'clavicus',        name: "Devil's Bargain",        cat: 'Quests', desc: 'Deal with Clavicus Vile', icon: '👺', points: 20 }
    ]
  });
