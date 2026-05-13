  /*
  ╔══════════════════════════════════════════════════════════════════════════════╗
  ║  QUEST PACK: MONKEY ISLAND — Insult Sword Fighting, Grog, and Piracy      ║
  ║  Rogue JS Build 742                                                    ║
  ╚══════════════════════════════════════════════════════════════════════════════╝

  GAME DESIGN LESSON: Branching Quest Chains
  ============================================

  The Monkey Island quest pack demonstrates a QUEST CHAIN — a series of
  interconnected quests where completing one unlocks or advances another.

  The chain here is:
    1. Visit SCUMMbar → learn about insult sword fighting
    2. Fight pirates → learn insults (tracked by counter)
    3. Defeat swordmaster → learn safe combination
    4. Crack the safe at the antique shop → get reward
    5. (Optional) Create Caustic Grog via cook distraction

  Each quest is independent (has its own ID and log), but stages can
  have requirements that reference OTHER quests. This creates the chain
  without hard-coding the order in the engine.

  LESSON: INT-gated hints in this pack reveal Monkey Island lore and
  give strategic advice about which pirates to fight first.
*/

  window._questPacks = window._questPacks || [];

  window._questPacks.push({

    quests: [

      // ── INSULT SWORD FIGHTING QUEST CHAIN ──
      // LESSON: This quest has both auto-triggered and manual stages.
      // - Stage 10 is manual (triggered when entering SCUMMbar)
      // - Stage 20 is auto-triggered (pirate kill counter)
      // - Stage 30 requires checking learned insults (counter)
      // - Stage 40 is auto-triggered by defeating the swordmaster
      {
        id: "q_insult_swordfighting",
        name: "The Art of Insult Sword Fighting",
        category: "Quests",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "I visited the SCUMM Bar on the beach. The pirates there told me about 'insult sword fighting' — a duel of wits, not blades. To master it, I must fight pirates and learn their insults.",
            // Manual trigger — set when player visits SCUMMbar
            rewardExperience: 25,
            intHint: "The pirates seem to use a fixed set of insults. If I fight enough of them, I should be able to learn all the correct retorts. The swordmaster probably uses the same insults but expects the retorts from memory.",
            intHintThreshold: 12
          },
          {
            progress: 20,
            logText: "I've fought several pirates and learned some of their insults. Each fight teaches me a new retort.",
            trigger: {
              event: "kill",
              filter: { type: "pirate" },
              requirements: [
                { type: "counter", counter: "kill_pirate", min: 2 },
                { type: "questProgress", questId: "q_insult_swordfighting", stage: 10 }
              ]
            },
            rewardExperience: 50
          },
          {
            progress: 30,
            logText: "I've mastered pirate insults! I know every retort. Time to face the Swordmaster.",
            trigger: {
              event: "custom",
              filter: { id: "all_insults_learned" },
              requirements: []
            },
            rewards: [{ type: "achievement", id: "insult_master" }],
            rewardExperience: 100,
            intHint: "The swordmaster lives in a hut near the beach. He'll use the same insults I learned from the pirates, but his HP is much higher. I should make sure I know ALL the retorts before challenging him.",
            intHintThreshold: 11
          },
          {
            progress: 40,
            logText: "I DEFEATED THE SWORDMASTER! He admitted I was the better insult fighter. He muttered something about a safe combination before fleeing.",
            trigger: {
              event: "kill",
              filter: { type: "master" },
              requirements: [{ type: "questProgress", questId: "q_insult_swordfighting", stage: 10 }]
            },
            rewards: [
              { type: "achievement", id: "swordmaster_defeated" },
              { type: "setFlag", flag: "knows_safe_combo", value: true }
            ],
            rewardExperience: 200,
            finishesQuest: true,
            intHint: "The swordmaster mentioned numbers as he fled — they sounded like a combination. This must be for the safe at the antique shop the shopkeeper told me about!",
            intHintThreshold: 10,
            intHintModal: "As the Swordmaster admits defeat, he drops a scrap of parchment in his haste to flee. Your keen eye catches it: it's the combination to the antique shop safe! The numbers are worn but legible to someone of your intellect."
          }
        ]
      },

      // ── SAFE CRACKING QUEST ──
      {
        id: "q_safe_cracking",
        name: "The Melee Island Safe",
        category: "Quests",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "The hard-of-hearing shopkeeper at the Melee Island Antique Shop told me about a safe he can't open. He says the Swordmaster might know the combination.",
            // Manual — triggered by antique shop dialogue
            intHint: "The shopkeeper is practically deaf. I could probably talk about anything and he wouldn't notice. But he did mention the Swordmaster and a connection to insult fighting...",
            intHintThreshold: 11
          },
          {
            progress: 20,
            logText: "I've agreed to find the safe combination. I need to defeat the Swordmaster in insult combat first.",
            rewardExperience: 25
          },
          {
            progress: 30,
            logText: "I cracked the safe! Inside was a treasure trove of gold and a mysterious artifact.",
            // Manual — triggered by completeSafeCrackingQuest()
            rewards: [
              { type: "achievement", id: "safe_cranked" },
              { type: "giveGold", amount: 500 },
              { type: "giveItem", item: "brassBottle" }
            ],
            rewardExperience: 300,
            finishesQuest: true
          }
        ]
      },

      // ── CAUSTIC GROG QUEST ──
      {
        id: "q_caustic_grog",
        name: "The Legendary Caustic Grog",
        category: "Quests",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "I heard the SCUMM Bar serves the most potent grog in the land. But the recipe is secret, guarded by a jealous cook.",
            intHint: "The cook seems easily distracted. If I could find something eye-catching — like a fish — I might be able to sneak into the kitchen while he investigates.",
            intHintThreshold: 11
          },
          {
            progress: 20,
            logText: "I caught a Red Herring at the beach fishing spot. This could be useful for distracting someone...",
            trigger: {
              event: "custom",
              filter: { id: "found_red_herring" },
              requirements: []
            },
            rewardExperience: 25,
            intHint: "A red herring is traditionally a distraction — a false clue. But in this case, it might serve as an ACTUAL distraction. The cook would surely want to investigate a suspicious fish.",
            intHintThreshold: 13,
            intHintModal: "You hold the Red Herring up to the light. It's suspiciously red. Almost... deliberately red. As if someone WANTED it to be noticed. Your intellect suggests this is the perfect tool for distracting an easily-excited cook."
          },
          {
            progress: 30,
            logText: "I distracted the cook with the Red Herring and stole the grog ingredients!",
            rewardExperience: 50
          },
          {
            progress: 40,
            logText: "I brewed the legendary Caustic Grog! It burns going down but grants incredible power.",
            rewards: [{ type: "achievement", id: "caustic_grog" }],
            rewardExperience: 150,
            finishesQuest: true
          }
        ]
      },

      // ── PIRATE GROG DRINKING QUEST ──
      {
        id: "q_pirate_grog",
        name: "Drinking Buddies",
        category: "Social",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "I had my first grog at the SCUMM Bar. The pirates eyed me suspiciously.",
            trigger: {
              event: "custom",
              filter: { id: "bought_grog" },
              requirements: [{ type: "counter", counter: "grogs_bought", min: 1 }]
            }
          },
          {
            progress: 20,
            logText: "Two grogs down. The pirates are starting to warm up to me.",
            trigger: {
              event: "custom",
              filter: { id: "bought_grog" },
              requirements: [{ type: "counter", counter: "grogs_bought", min: 2 }]
            }
          },
          {
            progress: 30,
            logText: "Three grogs! The pirates consider me one of their own now. Yo ho ho!",
            trigger: {
              event: "custom",
              filter: { id: "bought_grog" },
              requirements: [{ type: "counter", counter: "grogs_bought", min: 3 }]
            },
            rewards: [{ type: "achievement", id: "pirate_grog" }],
            rewardExperience: 50,
            finishesQuest: true
          }
        ]
      }
    ],

    achievements: [
      { id: 'pirate_insult',  name: 'Pirate Insulter',        cat: 'Quests', desc: 'Win a Battle of Wits against a pirate', icon: '🏴‍☠️', points: 20 },
      { id: 'insult_master',  name: 'Insult Master',          cat: 'Quests', desc: 'Learn all pirate insults', icon: '📚', points: 30 },
      { id: 'swordmaster_defeated', name: 'Swordmaster Slayer', cat: 'Quests', desc: 'Defeat the Swordmaster in insult combat', icon: '🤺', points: 40 },
      { id: 'pirate_grog',    name: 'Pirate Grog',            cat: 'Quests', desc: 'Drink 3 grogs at the SCUMM Bar', icon: '🍺', points: 15 },
      { id: 'safe_cranked',   name: 'Safe Cracker',           cat: 'Quests', desc: 'Complete the safe cracking quest', icon: '🏺', points: 25 },
      { id: 'caustic_grog',   name: 'Caustic Brewer',         cat: 'Quests', desc: 'Create the legendary Caustic Grog', icon: '🍺', points: 30 }
    ]
  });
