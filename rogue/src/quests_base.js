  /*
  ╔══════════════════════════════════════════════════════════════════════════════╗
  ║  QUEST PACK: BASE — Core game quests and achievements                      ║
  ║  Rogue JS Build 742                                                    ║
  ╚══════════════════════════════════════════════════════════════════════════════╝

  GAME DESIGN LESSON: Quest Pack Organization
  =============================================

  Each quest pack is a self-contained file that registers its quests and
  achievements with the engine. Content creators work in THEIR OWN FILE
  and never touch engine code or other quest packs.

  FILE NAMING CONVENTION:
    quests_base.js          — core game mechanics (kills, levels, exploration)
    quests_monkey_island.js — Monkey Island themed content
    quests_monty_python.js  — Monty Python themed content
    quests_black_cauldron.js — Black Cauldron / Prydain themed content

  ANATOMY OF A QUEST DEFINITION:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  {                                                                      │
  │    id: "unique_quest_id",     // Must be globally unique across packs   │
  │    name: "Display Name",      // Shown in quest log                     │
  │    category: "Combat",        // For UI grouping                        │
  │    showInLog: true,           // false = hidden quest (internal only)   │
  │    stages: [                                                            │
  │      {                                                                  │
  │        progress: 10,          // Stage number (use multiples of 10)     │
  │        logText: "I did X.",   // First-person journal entry             │
  │        trigger: {             // OPTIONAL: auto-advance conditions      │
  │          event: "kill",       // Which game event to listen for         │
  │          filter: {type:"rat"},// Match specific event data              │
  │          requirements: [...]  // Additional conditions to check         │
  │        },                                                               │
  │        rewards: [...],        // OPTIONAL: rewards when stage reached   │
  │        rewardExperience: 50,  // OPTIONAL: XP bonus                     │
  │        intHint: "...",        // OPTIONAL: shown if INT >= threshold    │
  │        intHintThreshold: 14,  // OPTIONAL: INT needed (default: 12)    │
  │        intHintModal: "...",   // OPTIONAL: popup for important hints    │
  │        finishesQuest: true    // OPTIONAL: marks quest complete         │
  │      }                                                                  │
  │    ]                                                                    │
  │  }                                                                      │
  └─────────────────────────────────────────────────────────────────────────┘

  ANATOMY OF AN ACHIEVEMENT DEFINITION:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  {                                                                      │
  │    id: "unique_id",           // Must be globally unique                │
  │    name: "Display Name",      // Shown in achievement toast             │
  │    cat: "Combat",             // Category tab in achievement UI         │
  │    desc: "Kill 10 monsters",  // Description text                       │
  │    icon: "💀",               // Emoji icon                              │
  │    points: 20                 // Achievement point value                │
  │  }                                                                      │
  └─────────────────────────────────────────────────────────────────────────┘
*/

  // ============================================================================
  // REGISTER THIS QUEST PACK
  // ============================================================================
  //
  // LESSON: The registration pattern. Each pack pushes itself into the
  // global _questPacks array. The quest engine collects these at init time.
  // This is a simple dependency-injection pattern that avoids circular
  // dependencies between quest packs and the engine.
  // ============================================================================

  window._questPacks = window._questPacks || [];

  window._questPacks.push({

    // ──────────────────────────────────────────────────────────────────────────
    // BASE QUESTS — core gameplay progression
    // ──────────────────────────────────────────────────────────────────────────
    //
    // LESSON: Auto-Triggered Quests vs. Manual Quests
    //
    // AUTO-TRIGGERED quests have a `trigger` field on their stages. The engine
    // watches for matching events and advances automatically. These are great
    // for background tracking (kill counts, exploration milestones).
    //
    // MANUAL quests are advanced by explicit QuestEngine.advance() calls from
    // game code (NPC dialogues, scripted events). These are for story-driven
    // content where the player makes choices.
    //
    // Most quests are a MIX: early stages are manual (NPC gives you the quest)
    // and later stages are auto-triggered (kill the boss, find the item).
    // ──────────────────────────────────────────────────────────────────────────

    quests: [

      // Kill/floor/level milestones are achievements only — see
      // engine.js award sites near the corresponding QuestEngine.emit calls.
      // Quests are reserved for content with a giver, narrative, or player choice.

      // ── DUCK HUNT QUEST ──
      // LESSON: This quest demonstrates:
      // 1. Counter-based auto-triggers (kill 5 ducks)
      // 2. Callback rewards (the Duck Hunt dog animation)
      // 3. Multi-stage progression with escalating rewards
      {
        id: "q_duck_hunter",
        name: "Duck Hunt",
        category: "Combat",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "I killed a duck in the flooded chambers. It quacked indignantly.",
            trigger: {
              event: "kill",
              filter: { type: "duck" },
              requirements: [{ type: "counter", counter: "kill_duck", min: 1 }]
            },
            rewardExperience: 10,
            intHint: "These ducks seem to congregate in flooded dungeon chambers. I wonder what draws them here.",
            intHintThreshold: 10
          },
          {
            progress: 20,
            logText: "3 ducks down. I'm getting good at this.",
            trigger: {
              event: "kill",
              filter: { type: "duck" },
              requirements: [{ type: "counter", counter: "kill_duck", min: 3 }]
            },
            rewardExperience: 20
          },
          {
            progress: 30,
            logText: "5 ducks slain. A familiar dog appeared from nowhere and laughed at me.",
            trigger: {
              event: "kill",
              filter: { type: "duck" },
              requirements: [{ type: "counter", counter: "kill_duck", min: 5 }]
            },
            rewards: [
              { type: "achievement", id: "duck_hunter" },
              { type: "callback", fn: "showDuckHuntDogLaugh" }
            ],
            rewardExperience: 50,
            finishesQuest: true
          }
        ]
      },

      // ── SHARK ENCOUNTER QUEST ──
      {
        id: "q_shark_encounter",
        name: "Jaws of the Deep",
        category: "Combat",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "I survived a shark attack in the flooded dungeon! These waters are dangerous.",
            trigger: {
              event: "combat_hurt",
              filter: { attacker: "shark" },
              requirements: []
            },
            rewards: [{ type: "achievement", id: "shark_survivor" }],
            rewardExperience: 50,
            intHint: "Sharks in a dungeon? The water must connect to an underground river system. Where there are sharks, there may be valuable things they guard.",
            intHintThreshold: 13,
            intHintModal: "Your intellect allows you to reason that the flooded chambers were once part of an ancient aqueduct. The sharks followed the fish, and the fish followed the runoff from the surface. If you can find the source of the water, you might find a passage to the surface — or to something even more interesting."
          },
          {
            progress: 20,
            logText: "I slew the dungeon shark! It dropped something valuable.",
            trigger: {
              event: "kill",
              filter: { type: "shark" },
              requirements: []
            },
            rewardExperience: 100,
            finishesQuest: true
          }
        ]
      },

      // ── THIEF HIDEOUT QUEST ──
      {
        id: "q_thief_hideout",
        name: "Den of Thieves",
        category: "Quests",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "A thief pickpocketed me! I need to be more careful.",
            trigger: {
              event: "custom",
              filter: { id: "pickpocketed" },
              requirements: []
            },
            intHint: "The thief moved toward the far wall before vanishing. There might be a hidden passage nearby.",
            intHintThreshold: 12
          },
          {
            progress: 20,
            logText: "I found a hidden passage in the dungeon walls. Could this be the thief's hideout?",
            trigger: {
              event: "custom",
              filter: { id: "secret_wall_found" },
              requirements: [{ type: "questProgress", questId: "q_thief_hideout", stage: 10 }]
            },
            rewardExperience: 25
          },
          {
            progress: 30,
            logText: "I raided the thief's hideout and recovered stolen goods!",
            trigger: {
              event: "custom",
              filter: { id: "thief_hideout_looted" },
              requirements: []
            },
            rewards: [{ type: "achievement", id: "thief_hideout" }],
            rewardExperience: 100,
            finishesQuest: true
          }
        ]
      },

      // ── STARVATION QUEST ──
      {
        id: "q_starvation",
        name: "Hungry Adventurer",
        category: "General",
        showInLog: false,
        stages: [
          {
            progress: 10,
            logText: "I'm starving.",
            trigger: {
              event: "custom",
              filter: { id: "starving" },
              requirements: []
            },
            rewards: [{ type: "achievement", id: "starving" }],
            finishesQuest: true
          }
        ]
      },

      // ── VERMIN SLAYER QUEST ──
      {
        id: "q_vermin_slayer",
        name: "Pest Control",
        category: "Combat",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "Vermin! No shopkeeper has asked, but if I cull them the merchants will surely thank me."
          },
          {
            progress: 20,
            logText: "10 vermin killed! The dungeon is cleaner thanks to my efforts.",
            trigger: {
              event: "kill",
              filter: {},
              requirements: [{ type: "counter", counter: "kill_vermin", min: 10 }]
            },
            rewards: [{ type: "achievement", id: "vermin_slayer" }],
            rewardExperience: 50,
            finishesQuest: true
          }
        ]
      },

      // ── DRAGON SLAYER QUEST ──
      {
        id: "q_dragon_slayer",
        name: "Dragon Slayer",
        category: "Combat",
        showInLog: false,
        stages: [
          {
            progress: 10,
            logText: "I slew a dragon!",
            trigger: { event: "kill", filter: { type: "dragon" }, requirements: [] },
            rewards: [{ type: "achievement", id: "dragon_slayer" }],
            rewardExperience: 200,
            finishesQuest: true,
            intHint: "The dragon's scales shimmer with residual magical energy. These could be crafted into powerful armor by a skilled blacksmith.",
            intHintThreshold: 14
          }
        ]
      },

      // ── GRUE SLAYER QUEST ──
      {
        id: "q_grue_slayer",
        name: "Not Afraid of the Dark",
        category: "Combat",
        showInLog: false,
        stages: [
          {
            progress: 10,
            logText: "I defeated a Grue! They said it couldn't be done.",
            trigger: { event: "kill", filter: { type: "grue" }, requirements: [] },
            rewards: [{ type: "achievement", id: "grue_slayer" }],
            rewardExperience: 500,
            finishesQuest: true
          }
        ]
      },

      // ── SHOPPING QUEST ──
      {
        id: "q_shopaholic",
        name: "Shopaholic",
        category: "Social",
        showInLog: false,
        stages: [
          {
            progress: 10,
            logText: "I've visited Apu's store more than 3 times. He's starting to recognize me.",
            trigger: {
              event: "shop_visit",
              filter: { type: "apu" },
              requirements: [{ type: "counter", counter: "shop_visit_apu", min: 4 }]
            },
            rewards: [{ type: "achievement", id: "shopper" }],
            finishesQuest: true
          }
        ]
      },
      // #12: Town Guard Quest — Bethesda-style civic duty reward
      {
        id: "q_guard_duty",
        name: "Guard's Request",
        category: "Town",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "The town guard asked me to clear 10 monsters from the dungeon. The merchants will give me a discount.",
            trigger: { event: "guard_task_accepted", filter: {} },
            rewards: [],
            intHint: "The guard near the south gate wants the dungeon thinned out. Kill 10 monsters.",
            intHintThreshold: 10
          },
          {
            progress: 50,
            logText: "I killed 10 dungeon monsters. The guard rewarded me with a 10% discount at all Tristram shops.",
            trigger: { event: "guard_reward_claimed", filter: {} },
            rewards: [{ type: "achievement", id: "town_defender" }],
            finishesQuest: true
          }
        ]
      },
      // #12: Town Guard Quest — Bethesda-style civic duty reward
      {
        id: "q_guard_duty",
        name: "Guard's Request",
        category: "Town",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "The town guard asked me to clear 10 monsters from the dungeon. The merchants will give me a discount.",
            trigger: { event: "guard_task_accepted", filter: {} },
            rewards: [],
            intHint: "The guard near the south gate wants the dungeon thinned out. Kill 10 monsters.",
            intHintThreshold: 10
          },
          {
            progress: 50,
            logText: "I killed 10 dungeon monsters. The guard rewarded me with a 10% discount at all Tristram shops.",
            trigger: { event: "guard_reward_claimed", filter: {} },
            rewards: [{ type: "achievement", id: "town_defender" }],
            finishesQuest: true
          }
        ]
      }
    ],

    // ──────────────────────────────────────────────────────────────────────────
    // BASE ACHIEVEMENTS
    //
    // LESSON: We duplicate the achievement definitions here (in addition to
    // the ACHIEVEMENT_DEFS array in state.js) so the quest engine has its
    // own source of truth. During migration, both exist. Eventually,
    // ACHIEVEMENT_DEFS in state.js can be removed entirely.
    //
    // We DON'T include Monkey Island, Monty Python, or Black Cauldron
    // achievements here — those belong in their respective quest packs.
    // ──────────────────────────────────────────────────────────────────────────

    achievements: [
      // General
      { id: 'town_defender',  name: 'Town Defender',        cat: 'General', desc: 'Complete the guard\'s dungeon clearing task', icon: '💂', points: 25 },
      { id: 'first_blood',    name: 'First Blood',          cat: 'General', desc: 'Kill your first monster',          icon: '🩸', points: 10 },
      { id: 'level_5',        name: 'Apprentice',           cat: 'General', desc: 'Reach character level 5',          icon: '⭐', points: 10 },
      { id: 'level_10',       name: 'Journeyman',           cat: 'General', desc: 'Reach character level 10',         icon: '🌟', points: 20 },
      { id: 'level_15',       name: 'Master Adventurer',    cat: 'General', desc: 'Reach character level 15',         icon: '👑', points: 30 },
      { id: 'starving',       name: 'Hangry Adventurer',    cat: 'General', desc: 'Reach 100% hunger',                icon: '🍖', points: 10 },
      { id: 'resurrected',    name: 'Woke Up in the Morning', cat: 'General', desc: 'Use a Resurrection Crystal',    icon: '💎', points: 20 },

      // Exploration
      { id: 'floor_3',        name: 'Getting Started',      cat: 'Exploration', desc: 'Reach Dungeon Floor 3',        icon: '⬇️', points: 10 },
      { id: 'floor_5',        name: 'Deep Explorer',        cat: 'Exploration', desc: 'Reach Dungeon Floor 5',        icon: '🏚️', points: 10 },
      { id: 'floor_10',       name: 'Cave Dweller',         cat: 'Exploration', desc: 'Reach Dungeon Floor 10',       icon: '🏚️', points: 20 },
      { id: 'floor_15',       name: 'Castle Conqueror',     cat: 'Exploration', desc: 'Reach the Castle Floor',       icon: '🏰', points: 30 },
      { id: 'town_portal',    name: 'There and Back Again', cat: 'Exploration', desc: 'Use a Town Portal Scroll',     icon: '🌀', points: 10 },
      { id: 'listen',         name: 'Eavesdropper',         cat: 'Exploration', desc: 'Use the Listen command 5 times', icon: '👂', points: 10 },

      // Combat
      { id: 'kill_10',        name: 'Slaughterer',          cat: 'Combat', desc: 'Kill 10 monsters',                  icon: '💀', points: 10 },
      { id: 'kill_50',        name: 'Exterminator',         cat: 'Combat', desc: 'Kill 50 monsters',                  icon: '☠️', points: 20 },
      { id: 'kill_100',       name: 'Dungeon Cleaner',      cat: 'Combat', desc: 'Kill 100 monsters',                 icon: '☠️', points: 30 },
      { id: 'dragon_slayer',  name: 'Dragon Slayer',        cat: 'Combat', desc: 'Slay a dragon',                     icon: '🐉', points: 30 },
      { id: 'grue_slayer',    name: 'Not Afraid of the Dark', cat: 'Combat', desc: 'Defeat a Grue',                  icon: '🔦', points: 50 },
      { id: 'pacifist_orc',   name: 'Inner Peace',            cat: 'Social', desc: 'Find the pacifist orc in a dark chamber', icon: '🧘', points: 25 },
      { id: 'duck_hunter',    name: 'Duck Hunter',          cat: 'Combat', desc: 'Kill 5 ducks in flooded chambers',  icon: '🦆', points: 15 },
      { id: 'shark_survivor', name: 'Shark Survivor',       cat: 'Combat', desc: 'Survive an encounter with a dungeon shark', icon: '🦈', points: 25 },
      { id: 'vermin_slayer',  name: 'Dungeon Pest Control', cat: 'Easter Eggs', desc: 'Kill 10 vermin',               icon: '🐭', points: 15 },

      // Social
      { id: 'shopper',        name: 'Shopaholic',           cat: 'Social', desc: 'Visit Apu more than 3 times',       icon: '🛒', points: 10 },
      { id: 'prophet',        name: 'Stay Awhile and Listen', cat: 'Social', desc: 'Get items identified by Cain',    icon: '🧔', points: 10 },
      { id: 'safe_casanova',  name: 'Safe Casanova',        cat: 'Social', desc: 'Survive the Mystery Lady encounter', icon: '💃', points: 20 },
      { id: 'dave_encounter', name: "Who's Dave?",          cat: 'Social', desc: 'Meet Cousin Dave',                  icon: '👨', points: 20 },
      { id: 'grue_wisdom',    name: 'Well Informed',        cat: 'Social', desc: 'Learn everything about Grues',      icon: '📖', points: 15 },

      // Easter Eggs
      { id: 'pervert',        name: 'Pervert!',             cat: 'Easter Eggs', desc: 'Complete the prophylactic quest', icon: '🧴', points: 30 },
      { id: 'world_domination', name: 'Pinky and the Brain', cat: 'Easter Eggs', desc: 'Find the Plans for World Domination', icon: '📋', points: 50 },
      { id: 'bookworm',       name: 'Bookworm',             cat: 'Easter Eggs', desc: 'Buy a spellbook from the Wizard', icon: '📖', points: 10 },
      { id: 'granny_weatherwax', name: 'Headology Expert',  cat: 'Easter Eggs', desc: 'Receive wisdom from Granny Weatherwax', icon: '👵', points: 25 },
      { id: 'astrochicken',   name: 'Astrochicken Champion', cat: 'Easter Eggs', desc: 'Launch Astrochicken into orbit', icon: '🐔', points: 30 },
      { id: 'thief_hideout',  name: "Thief's Bane",         cat: 'Quests', desc: 'Discover and loot the thief hideout', icon: '👤', points: 30 },

      // Milestones
      { id: 'champion',       name: 'Champion',             cat: 'Milestones', desc: 'Earn 20 achievements — Hall of Champions opens!', icon: '👑', points: 50 },
      { id: 'legend',         name: 'Living Legend',         cat: 'Milestones', desc: 'Earn 25 achievements',          icon: '⭐', points: 100 },
      { id: 'mythic',         name: 'Mythic Champion',      cat: 'Milestones', desc: 'Earn 30 achievements',          icon: '💫', points: 200 }
    ]
  });
