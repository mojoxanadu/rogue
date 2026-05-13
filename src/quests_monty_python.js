  /*
  ╔══════════════════════════════════════════════════════════════════════════════╗
  ║  QUEST PACK: MONTY PYTHON — Holy Grail, Black Knight, Bridge of Death      ║
  ║  Rogue JS Build 742                                                    ║
  ╚══════════════════════════════════════════════════════════════════════════════╝

  GAME DESIGN LESSON: Stat-Gated Content
  ========================================

  The Monty Python quest pack demonstrates INT-gated gameplay most clearly.
  The Bridge of Death has a question only answerable with INT >= 15. This is
  a HARD GATE — you literally cannot pass without the stat requirement.

  Compare this with the SOFT GATES in other packs (hints that give extra
  info but don't block progress). Good quest design uses both:

  HARD GATES:  "You must be this smart to ride this ride."
               Used sparingly for memorable, rewarding moments.
               The player KNOWS they need to come back stronger.

  SOFT GATES:  "Smart players get extra info and shortcuts."
               Used frequently for flavor and build diversity.
               The player never feels blocked, just rewarded.

  The ratio should be roughly 80% soft / 20% hard gates.
*/

  window._questPacks = window._questPacks || [];

  window._questPacks.push({

    quests: [

      // ── BRIDGE OF DEATH ──
      // LESSON: This quest demonstrates a HARD INT GATE at stage 30.
      // Only characters with INT >= 15 can answer the final question.
      // This is one of the most memorable moments in the game because
      // it makes the player's stat build MATTER for quest outcomes.
      {
        id: "q_bridge_of_death",
        name: "The Bridge of Death",
        category: "Quests",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "I encountered the Bridge Keeper in the desert. He demands I answer three questions to cross.",
            intHint: "The third question is always a trick. The Keeper doesn't know the answer himself — if you're clever enough, you can turn it back on him.",
            intHintThreshold: 13,
            intHintModal: "Your intellect warns you: the Bridge Keeper's third question is about the airspeed velocity of an unladen swallow. The correct response isn't to ANSWER — it's to ask 'African or European?' This will confuse the Keeper and cause HIM to fall into the gorge. But you'll need INT 15 to see this option in the dialogue."
          },
          {
            progress: 20,
            logText: "I answered the first two questions correctly. One remains.",
            rewardExperience: 25
          },
          {
            progress: 30,
            logText: "I outwitted the Bridge Keeper! He didn't know the answer to his own question and fell into the gorge!",
            rewards: [{ type: "achievement", id: "bridge_of_death" }],
            rewardExperience: 200,
            finishesQuest: true
          },
          {
            // ALTERNATE ENDING: death by wrong answer
            progress: 25,
            logText: "I answered incorrectly and was cast into the gorge. AHHHHHHH!",
            finishesQuest: true
          }
        ]
      },

      // ── BLACK KNIGHT ──
      {
        id: "q_black_knight",
        name: "The Black Knight",
        category: "Quests",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "I encountered the Black Knight in the desert. He refuses to let me pass.",
            intHint: "The knight's armor has weak points at the joints. Each time you reduce him below a health threshold, he'll lose a limb — and his damage will decrease.",
            intHintThreshold: 12
          },
          {
            progress: 20,
            logText: "I severed the Black Knight's arm! He claims it's 'just a scratch.'",
            trigger: {
              event: "custom",
              filter: { id: "knight_limb_1" },
              requirements: []
            }
          },
          {
            progress: 30,
            logText: "Both arms gone now. He says it's 'just a flesh wound.' Incredible.",
            trigger: {
              event: "custom",
              filter: { id: "knight_limb_2" },
              requirements: []
            }
          },
          {
            progress: 40,
            logText: "The Black Knight is now just a torso. He threatened to bite my legs off. We called it a draw.",
            trigger: {
              event: "custom",
              filter: { id: "knight_defeated" },
              requirements: []
            },
            rewards: [{ type: "achievement", id: "rabbit_killer" }],
            rewardExperience: 200,
            finishesQuest: true
          }
        ]
      },

      // ── KILLER RABBIT ──
      {
        id: "q_killer_rabbit",
        name: "The Killer Rabbit of Caerbannog",
        category: "Quests",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "I spotted the Killer Rabbit. It looks... fluffy. And deadly.",
            intHint: "That rabbit has dynamite-level damage and near-perfect dodge. Don't try to fight it with a sword. You'll need the Holy Hand Grenade of Antioch — it should be somewhere in this desert.",
            intHintThreshold: 11,
            intHintModal: "Your intellect screams a warning: this is no ordinary rabbit! Its stats are absurdly high — 999 damage, 90% dodge. The ONLY way to kill it is with the Holy Hand Grenade. 'First shalt thou take out the Holy Pin. Then shalt thou count to three, no more, no less.'"
          },
          {
            progress: 20,
            logText: "I slew the Killer Rabbit with the Holy Hand Grenade! Brother Maynard would be proud.",
            trigger: {
              event: "kill",
              filter: { type: "killer_rabbit" },
              requirements: []
            },
            rewards: [{ type: "achievement", id: "rabbit_killer" }],
            rewardExperience: 300,
            finishesQuest: true
          }
        ]
      },

      // ── DENNIS THE PEASANT ──
      {
        id: "q_dennis_convention",
        name: "The Constitutional Convention",
        category: "Quests",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "I met Dennis in Tristram. He's an anarcho-syndicalist who objects to monarchical systems of government.",
            intHint: "Dennis will only give you the Constitutional Convention scroll if you're wealthy (1000g) or wearing a crown. He respects power even though he claims not to.",
            intHintThreshold: 13
          },
          {
            progress: 20,
            logText: "Dennis gave me a Scroll of Constitutional Convention. He shouted something about being repressed.",
            rewards: [{ type: "achievement", id: "convention" }],
            rewardExperience: 100,
            finishesQuest: true
          }
        ]
      },

      // ── FRENCH TAUNTER ──
      {
        id: "q_french_taunter",
        name: "Your Mother Was a Hamster",
        category: "Easter Eggs",
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: "A French soldier on the castle wall hurled insults at me. And a cow.",
            intHint: "The French taunter is invincible — 999 HP and 100% dodge. Don't waste your time attacking. The cow he throws does real damage though, so keep your distance.",
            intHintThreshold: 10
          }
        ]
      }
    ],

    achievements: [
      { id: 'bridge_of_death', name: 'Bridge Keeper Bypass',  cat: 'Quests', desc: 'Survive the Bridge of Death',     icon: '🧙', points: 30 },
      { id: 'convention',      name: 'Peasants Unite',        cat: 'Quests', desc: 'Get the Constitutional Convention', icon: '📜', points: 20 },
      { id: 'rabbit_killer',   name: 'Run Away!',             cat: 'Combat', desc: 'Kill the Killer Rabbit',          icon: '🐰', points: 30 },
      { id: 'holy_hand',       name: 'Holy Hand Grenade',     cat: 'Quests', desc: 'Find the Holy Hand Grenade',      icon: '💣', points: 30 },
      { id: 'black_knight_win', name: 'Tis But a Scratch',   cat: 'Combat', desc: 'Defeat the Black Knight',         icon: '🤺', points: 30 }
    ]
  });

  /*
  ╔══════════════════════════════════════════════════════════════════════════════╗
  ║  MONTY PYTHON NPC DIALOGS — WIRING NOTES FOR KELCH                         ║
  ║  Build 747 — Needs engine.js and map.js wiring (Kelch's domain)            ║
  ╚══════════════════════════════════════════════════════════════════════════════╝

  The quest data above is fully defined. The following NPCs need dialog wiring
  and map placement in engine.js/map.js. Dialogs are defined below in shop.js
  format — wire them to NPC collision/click events as you do for Cain, Dennis, etc.

  ── BRIDGE KEEPER ──────────────────────────────────────────────────────────────
  NPC type: 'bridge_keeper'  (already in MONSTER_DEF)
  Placement: On a BRIDGE_TILE (TILES.BRIDGE_TILE) spanning a chasm.
             Suggest: Mountain scene, or a special dungeon room with TILES.CHASM
             on either side of the bridge.

  Dialog mechanic (3-question gating):
    Question 1: "What is your name?"       — any answer passes
    Question 2: "What is your quest?"      — any answer passes
    Question 3: "What is the airspeed velocity of an unladen swallow?"
      - INT < 15: only option is "What do you mean? African or European?"
                  → player is thrown into chasm, takes 30 damage, fails quest stage 25
      - INT >= 15: "African or European?" option + "What do you mean? What?" option
                  → choosing either throws the keeper into the chasm, advances quest stage 30

  Call in engine.js NPC interaction: openBridgeKeeperDialog()
  (implement in shop.js; dialog flow sets player.bridgeQuestions flag)
  QuestEngine.advance('q_bridge_of_death', { ... }) called on outcomes.

  ── CASTLE AGHHH ───────────────────────────────────────────────────────────────
  NPC: 'french_taunter'  (already in MONSTER_DEF, hp:999, dodge:1.0)
  Placement: Needs a CASTLE_DOOR tile cluster. Suggest:
    - In map.js initMap(), for dungeon floors >= 8, occasionally spawn a small
      "castle" room: 4x4 room with WALL borders, one CASTLE_DOOR on south face,
      and a french_taunter spawned at x,y inside.
    - The castle can have a 'cow' projectile mechanic: if player moves adjacent,
      a cow is thrown (medium damage, treated as ranged attack from the taunter).

  Quest advancement: auto-triggers via QuestEngine 'encounter_french_taunter' event.
  DO NOT kill the taunter — they have 1.0 dodge. Quest advances just by hearing them.
  Cow-throw: QuestEngine.emit('french_taunter_cow', {}) → triggers q_french_taunter.

  ── DENNIS THE PEASANT ─────────────────────────────────────────────────────────
  NPC: 'dennis'  (already in MONSTER_DEF; placed in Tristram at x:15, y:20)
  Current state: Dennis is placed but has only stub dialog in engine.js.

  Full dialog flow (implement in shop.js openDennisDialog()):
    Step 1: Dennis complains about feudal oppression.
            → QuestEngine.advance('q_dennis_convention', { progress: 10 })
    Step 2: Player can ask about the "Constitutional Convention" he's organizing.
            → If INT >= 13: hint about needing 1000g or a crown item (👑)
    Step 3: Player gives 1000g or has 👑:
            → Dennis hands over a scroll  📜 (add to inventory)
            → QuestEngine.advance('q_dennis_convention', { progress: 20 })
            → awardAchievement('convention')

  ── BLACK KNIGHT ───────────────────────────────────────────────────────────────
  NPC: 'black_knight'  (already in MONSTER_DEF, hp:200)
  Placement: As a boss encounter in a dedicated dungeon room. Suggest floor 7+.
  Quest events to emit from engine.js resolveEnemyDefeat or monsterAttack:
    On first hit reducing HP below 150: QuestEngine.emit('knight_limb_1', {})
    On first hit reducing HP below 100: QuestEngine.emit('knight_limb_2', {})
    On HP <= 0:                         QuestEngine.emit('knight_defeated', {})
  Each event logs flavor text. On knight_defeated: awardAchievement('black_knight_win').
  NOTE: Fix copy-paste bug — quest currently awards 'rabbit_killer' on stage 40.
        Change to 'black_knight_win' (now defined in achievements above).

  ── HOLY HAND GRENADE ──────────────────────────────────────────────────────────
  Already implemented in mechanics.js pickupItems() → triggerGrenade(idx).
  The 💣🌟 icon triggers the sequence when picked up from a chest.
  Placement: Add 💣🌟 to a chest on floors 5+ with very low spawn weight.
  QuestEngine.emit('grenade_found', {}) → advance q_killer_rabbit stage 10.

  ── APU PRICE CHECK (Prophylactic Quest) ────────────────────────────────────
  The price check dialog is part of the prophylactic/safety/mystery woman quest.
  Apu should call out price checks over the PA for all prophylactic combinations:
    - Regular / Ribbed / Glow-in-the-dark / Extra-strength variants
    - With / Without lubrication
    - Size: S / M / L / Novelty
  That's 4 × 2 × 4 = 32 possible price-check lines.
  All have been recorded at 2× volume via ElevenLabs (voice_apu_pricecheck_*).
  Wire to: when player selects a prophylactic variant in the Larry Easter Egg
           dialog (shop.js larryEasterEgg()), call playVoiceClip('voice_apu_pricecheck_' + variantKey)
           at vol=1.8 (2× normal) before completing the purchase.
  */
