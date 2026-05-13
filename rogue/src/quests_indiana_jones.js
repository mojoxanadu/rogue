  /*
  ╔══════════════════════════════════════════════════════════════════════════════╗
  ║  QUEST PACK: INDIANA JONES — Last Crusade + Fate of Atlantis               ║
  ║  Rogue JS Build 742                                                    ║
  ╚══════════════════════════════════════════════════════════════════════════════╝

  GAME DESIGN LESSON: Resource Economy and the Rube Goldberg Problem
  ===================================================================

  Indiana Jones and the Fate of Atlantis has one of the most ingenious
  resource economy designs in adventure game history: Orichalcum Beads.

  You find beads throughout Atlantis. Each bead can be:
    1. Spent on a REAL machine that opens the drawbridge to the castle
    2. Wasted on a DECOY machine that does something impressive but useless

  The design insight: DECOYS must be tempting enough that players waste beads.
  If every decoy is obviously pointless, the puzzle is trivial. The best
  decoys produce IMPRESSIVE EFFECTS that look like they might matter.

  LESSON: The "Rube Goldberg" decoy puzzle teaches players to:
    a) Evaluate what they actually NEED vs. what looks cool
    b) Manage a scarce resource across multiple tempting options
    c) Tolerate ambiguity — you don't know which machine is "real" until
       you've wasted some beads and paid attention to the results

  GAME DESIGN PRINCIPLE: "False affordances" (things that look useful but
  aren't) create memorable moments when players figure out the trick.
  Used sparingly, they reward careful observation over button-mashing.

  The real drawbridge machine is distinguished by:
    1. INT hint (high INT reveals which one it is before wasting beads)
    2. A subtle visual difference in its description
    3. Being the LAST machine you'd try (nearest the castle entrance)
*/

  window._questPacks = window._questPacks || [];

  window._questPacks.push({

    quests: [

      // ── LAST CRUSADE TRIALS ──
      // These are already mechanically implemented (BLADE tiles, LETTER tiles).
      // This quest formalizes them in the quest log.
      {
        id: "q_indy_trials",
        name: "The Trials of the Grail",
        category: "Quests",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "I entered the desert and found ancient stone tiles arranged in patterns. A trap? A test?",
            intHint: "These trials reference the three challenges from the Grail legend: The Breath of God (blades that cut down the proud), The Word of God (the name IEHOVAH), and The Path of God (a leap of faith). I should proceed carefully.",
            intHintThreshold: 12
          },
          {
            progress: 20,
            logText: "I survived the Breath of God — blades that cut the prideful. I had to kneel.",
            trigger: {
              event: "custom",
              filter: { id: "blade_survived" },
              requirements: []
            },
            rewardExperience: 50
          },
          {
            progress: 30,
            logText: "I spelled out IEHOVAH on the stone tiles and crossed safely. Only a penitent man shall pass.",
            trigger: {
              event: "custom",
              filter: { id: "iehova_completed" },
              requirements: []
            },
            rewards: [{ type: "achievement", id: "grail_trials" }],
            rewardExperience: 100,
            finishesQuest: true,
            intHint: "The trials weren't designed to kill — they were designed to test CHARACTER. Humility (kneeling), scholarship (knowing the name), and faith (the leap). The dungeon's architect had a philosopher's sense of humor.",
            intHintThreshold: 15
          }
        ]
      },

      // ── FATE OF ATLANTIS: ORICHALCUM BEAD QUEST ──
      //
      // LESSON: Multi-stage resource quests
      //
      // The bead quest has THREE phases:
      //   1. ACQUISITION — Find beads scattered in the desert
      //   2. EVALUATION — Discover which of 5 machines does what
      //   3. EXPENDITURE — Use the right machine to open the drawbridge
      //
      // The key design tension: beads are scarce (8 total) and the real
      // machine costs 3 beads. If you waste 6+ on decoys, you're stuck.
      // But the decoys are spectacular enough that wasting 1-2 is likely.
      {
        id: "q_atlantis_beads",
        name: "The Orichalcum Beads of Atlantis",
        category: "Quests",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "I found an Orichalcum Bead in the desert — a small blue stone with an inner glow. It feels strangely warm. What is it for?",
            trigger: {
              event: "pickup",
              filter: { item: "📿" },
              requirements: []
            },
            rewardExperience: 25,
            intHint: "Orichalcum — the legendary metal of Atlantis. In the myths, it powered their technology. This stone form might be a power cell of some kind. There could be machines nearby that accept them.",
            intHintThreshold: 12
          },
          {
            progress: 20,
            logText: "I've collected several beads. I've also found strange machines embedded in the desert walls — slots in them just the right size for a bead.",
            rewardExperience: 25,
            intHint: "Count the machines carefully. There are 5 of them, but only one actually does something useful. The others are... diversions. Classic Atlantean engineering: brilliant but deeply impractical.",
            intHintThreshold: 13
          },
          {
            progress: 30,
            logText: "I wasted a bead on a decoy machine. It did something spectacular but completely useless. The Atlanteans had a sense of humor.",
            trigger: {
              event: "custom",
              filter: { id: "bead_wasted" },
              requirements: []
            },
            rewards: [{ type: "achievement", id: "bead_waster" }]
          },
          {
            progress: 40,
            logText: "I found the drawbridge machine! 3 beads and the bridge to the Horned King's castle will open.",
            trigger: {
              event: "custom",
              filter: { id: "drawbridge_machine_found" },
              requirements: []
            },
            rewardExperience: 75,
            intHint: "This machine is different from the others — it's aligned with the castle entrance, and its mechanism connects to the ground rather than the walls. It's load-bearing. This is the one.",
            intHintThreshold: 11,
            intHintModal: "Your intellect makes the connection: the other machines are decorative — theatrical Atlantean showpieces designed to dazzle visitors. This machine is functional. Its gears connect DOWNWARD into the desert floor, not upward into the ceiling. It's the counterweight for the drawbridge. 3 beads will raise it."
          },
          {
            progress: 50,
            logText: "The drawbridge to the Horned King's castle is open! Three beads, correctly spent.",
            trigger: {
              event: "custom",
              filter: { id: "drawbridge_opened" },
              requirements: []
            },
            rewards: [
              { type: "achievement", id: "drawbridge_opened" },
              { type: "setFlag", flag: "castle_bridge_open", value: true }
            ],
            rewardExperience: 200,
            finishesQuest: true
          }
        ]
      }
    ],

    achievements: [
      { id: 'grail_trials',     name: 'Only the Penitent Man',  cat: 'Quests',      desc: 'Complete both desert trials',           icon: '🏺', points: 30 },
      { id: 'bead_waster',      name: 'Rube Goldberg Victim',   cat: 'Easter Eggs', desc: 'Waste a bead on a decoy machine',       icon: '📿', points: 15 },
      { id: 'drawbridge_opened', name: 'Fate of Atlantis',      cat: 'Quests',      desc: 'Open the drawbridge with Orichalcum',  icon: '🌉', points: 35 }
    ]
  });
