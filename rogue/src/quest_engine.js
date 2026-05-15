  /*
  ╔══════════════════════════════════════════════════════════════════════════════╗
  ║  QUEST ENGINE MODULE — DATA-DRIVEN QUEST & ACHIEVEMENT SYSTEM              ║
  ║  Rogue JS Build 742                                                    ║
  ╚══════════════════════════════════════════════════════════════════════════════╝

  GAME DESIGN LESSON: The Event-Driven Quest Architecture
  ========================================================

  In early game development, quests are often implemented as scattered if/else
  blocks buried in combat code, movement code, and UI code. This works for a
  prototype, but it creates several serious problems:

    1. COUPLING: Adding a quest means modifying the combat engine, the shop
       system, the map generator, and the UI — all at once. One mistake in
       any of these breaks everything.

    2. DISCOVERABILITY: Quest state ends up as dozens of ad-hoc boolean flags
       (player.fedEagle, player.safeCrackingQuest, player.caughtByRat...)
       scattered across files. No one can tell what quests exist or what
       state they're in without reading every line of code.

    3. PERSISTENCE: If quest state isn't centralized, it's easy to forget to
       save/load it. (This is exactly the bug we had — achievements were
       never saved!)

    4. COLLABORATION: Multiple content creators can't work simultaneously
       because everyone is editing the same engine files.

  The solution is the EVENT-DRIVEN QUEST ARCHITECTURE, inspired by systems
  like Andor's Trail, where:

    - Quests are defined as DATA (JSON objects), not CODE
    - The game engine EMITS EVENTS ("player killed a duck", "player entered
      the beach") and the quest engine EVALUATES them against quest triggers
    - Requirements and rewards are COMPOSABLE primitives that combine to
      create complex behaviors without custom code
    - Quest state is CENTRALIZED in one serializable object

  This module implements that pattern. Content creators only write JSON.
  They never touch the game engine.

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                        ARCHITECTURE DIAGRAM                            │
  │                                                                        │
  │  ┌────────────┐    emit()     ┌──────────────┐    evaluate()           │
  │  │ Game Code  │──────────────►│ Quest Engine │────────────►            │
  │  │ engine.js  │               │              │  ┌──────────────────┐   │
  │  │ shop.js    │◄──────────────│  - triggers  │  │ Quest Pack JSON  │   │
  │  │ map.js     │   rewards     │  - state     │  │ quests_base.js   │   │
  │  │ mechanics  │   callbacks   │  - log       │  │ quests_monkey.js │   │
  │  └────────────┘               └──────────────┘  └──────────────────┘   │
  │                                                                        │
  │  The game code only knows how to emit events.                          │
  │  The quest data only knows what it cares about.                        │
  │  The engine is the matchmaker.                                         │
  └─────────────────────────────────────────────────────────────────────────┘

  KEY CONCEPTS FOR STUDENTS:
  - "Separation of Concerns": game mechanics vs. quest content
  - "Data-Driven Design": behavior defined by data, not code
  - "Event Bus Pattern": decoupled communication between systems
  - "Composable Primitives": simple pieces that combine into complexity
  - "Single Source of Truth": one place for all quest/achievement state
*/

  // ============================================================================
  // THE QUEST ENGINE SINGLETON
  // ============================================================================
  //
  // DESIGN PATTERN: Singleton Module
  // We use a single global object because there should only ever be one quest
  // engine running. All state lives inside this closure, making it easy to
  // serialize (save) and deserialize (load) as a single blob.
  //
  // WHY NOT A CLASS? In a single-HTML-file game with no module bundler,
  // a plain object on `window` is the simplest pattern that works. In a
  // larger project, you'd use ES modules or a proper DI container.
  // ============================================================================

  const QuestEngine = {

    // ──────────────────────────────────────────────────────────────────────────
    // INTERNAL STATE
    // ──────────────────────────────────────────────────────────────────────────
    //
    // LESSON: Centralized state is the key insight. Instead of 57 ad-hoc
    // player.* flags, all quest progress lives in these three objects.
    // This makes save/load trivial and debugging straightforward.
    // ──────────────────────────────────────────────────────────────────────────

    _questDefs: {},          // { questId: questDefinition } — registered quest definitions
    _achieveDefs: {},        // { achieveId: achieveDefinition } — registered achievement defs
    _questState: {},         // { questId: currentStageNumber } — player's progress per quest
    _achievements: {},       // { achieveId: true } — which achievements have been earned
    _achievePoints: 0,       // running total of achievement points
    _counters: {},           // { counterName: number } — kill counts, visit counts, etc.
    _flags: {},              // { flagName: value } — arbitrary state flags for quest logic
    _listeners: {},          // { eventType: [callback] } — event listener registry
    _npcInteractions: {},    // { npcType: true } — which NPC types player has interacted with
    _questLog: [],           // ordered array of { questId, stage, text, timestamp }
    _initialized: false,

    // ──────────────────────────────────────────────────────────────────────────
    // INITIALIZATION
    // ──────────────────────────────────────────────────────────────────────────
    //
    // LESSON: The init() function is called once at game start. It registers
    // all quest and achievement definitions from the JSON quest packs.
    //
    // Notice that we separate DEFINITION (what quests exist) from STATE
    // (what progress the player has made). Definitions are static data
    // loaded at startup. State is dynamic and changes during gameplay.
    // ──────────────────────────────────────────────────────────────────────────

    init(questPacks, achieveDefs) {
      /*
        questPacks: array of quest pack objects, each containing:
          { quests: [...], achievements: [...] }

        achieveDefs: the legacy ACHIEVEMENT_DEFS array (for backward compat)

        DESIGN NOTE: We accept multiple quest packs so different content
        creators can each maintain their own file without merge conflicts.
      */

      this._questDefs = {};
      this._achieveDefs = {};

      // Register quest packs
      for (const pack of questPacks) {
        if (pack.quests) {
          for (const q of pack.quests) {
            if (this._questDefs[q.id]) {
              console.warn(`[QuestEngine] Duplicate quest ID: "${q.id}" — later definition wins`);
            }
            this._questDefs[q.id] = q;
          }
        }
        if (pack.achievements) {
          for (const a of pack.achievements) {
            this._achieveDefs[a.id] = a;
          }
        }
      }

      // Also register legacy ACHIEVEMENT_DEFS for backward compatibility
      if (achieveDefs) {
        for (const a of achieveDefs) {
          if (!this._achieveDefs[a.id]) {
            this._achieveDefs[a.id] = a;
          }
        }
      }

      // Wire up auto-triggers: quests that listen for specific events
      this._wireAutoTriggers();

      this._initialized = true;
      console.log(`[QuestEngine] Initialized: ${Object.keys(this._questDefs).length} quests, ${Object.keys(this._achieveDefs).length} achievements`);
    },

    // ──────────────────────────────────────────────────────────────────────────
    // EVENT SYSTEM
    // ──────────────────────────────────────────────────────────────────────────
    //
    // LESSON: The Event Bus Pattern
    //
    // Instead of the game engine calling quest functions directly:
    //   BAD:  if(e.type === 'duck') { player.duckKills++; if(duckKills >= 5)... }
    //
    // The game engine emits a generic event:
    //   GOOD: QuestEngine.emit('kill', { type: 'duck' });
    //
    // And quest definitions declare what events they care about:
    //   { trigger: { event: 'kill', filter: { type: 'duck' }, count: 5 } }
    //
    // This means adding a "kill 10 sharks" quest requires ZERO changes to
    // the combat code. You just add a JSON object to a quest pack file.
    //
    // SUPPORTED EVENTS:
    //   'kill'        — { type: monsterType }
    //   'pickup'      — { item: itemIcon }
    //   'enter_tile'  — { tile: tileType, x, y }
    //   'enter_level' — { level: number, scene: string }
    //   'npc_talk'    — { type: npcType }
    //   'shop_visit'  — { type: shopType }
    //   'item_use'    — { item: itemIcon }
    //   'combat_hit'  — { target: monsterType, damage: number }
    //   'combat_hurt' — { attacker: monsterType, damage: number }
    //   'sleep'       — {}
    //   'quest_advance' — { questId, stage } (meta-event, fired internally)
    //   'achievement'   — { id } (meta-event, fired internally)
    //   'custom'      — { id: string, ...data } (for one-off scripted events)
    // ──────────────────────────────────────────────────────────────────────────

    emit(eventType, data = {}) {
      /*
        LESSON: This is the main entry point that game code calls.
        It does three things:

        1. Updates internal counters (kill counts, etc.)
        2. Evaluates all active quest triggers
        3. Notifies any registered listeners

        IMPORTANT: emit() may cause quest state changes, which may cause
        further events (quest_advance, achievement), which may cause further
        state changes. This is intentional — it's how quest chains work.
        But be careful not to create infinite loops in your quest definitions!
      */

      // Step 1: Update counters for counting-type events
      this._updateCounters(eventType, data);

      // Step 2: Evaluate quest auto-triggers
      this._evaluateAutoTriggers(eventType, data);

      // Step 3: Notify listeners
      if (this._listeners[eventType]) {
        for (const cb of this._listeners[eventType]) {
          try {
            cb(data);
          } catch (e) {
            console.error(`[QuestEngine] Listener error on "${eventType}":`, e);
          }
        }
      }
    },

    on(eventType, callback) {
      /*
        Register a listener for a specific event type.
        Returns an unsubscribe function (useful for temporary listeners).

        LESSON: This allows game systems to react to quest events without
        polling. For example, the UI can listen for 'achievement' events
        to show toast notifications.
      */
      if (!this._listeners[eventType]) this._listeners[eventType] = [];
      this._listeners[eventType].push(callback);
      return () => {
        this._listeners[eventType] = this._listeners[eventType].filter(cb => cb !== callback);
      };
    },

    // ──────────────────────────────────────────────────────────────────────────
    // QUEST PROGRESSION API
    // ──────────────────────────────────────────────────────────────────────────
    //
    // LESSON: Quest Stage Model (borrowed from Andor's Trail)
    //
    // Each quest has numbered STAGES. Stages don't have to be sequential —
    // stage 60 and stage 70 might be mutually exclusive branches (e.g.,
    // "spared the goblin" vs "killed the goblin").
    //
    // The player's progress for a quest is simply the SET of stages they've
    // reached. We store the highest stage as the "current" stage, but we
    // also track which stages have been visited (for branching quests).
    //
    // Stage numbers use multiples of 10 by convention, leaving room to
    // insert intermediate stages later without renumbering everything.
    // ──────────────────────────────────────────────────────────────────────────

    advance(questId, stageNum) {
      /*
        Advance a quest to a specific stage. This is the core state mutation.

        Returns true if the stage was newly reached, false if already there.

        DESIGN NOTE: We allow advancing to any stage, not just the "next" one.
        This supports branching quests where you might jump from stage 20
        directly to stage 60 (skipping 30-50 if you chose a different path).
      */
      const quest = this._questDefs[questId];
      if (!quest) {
        console.warn(`[QuestEngine] Unknown quest: "${questId}"`);
        return false;
      }

      // Initialize quest state if this is the first stage
      if (!this._questState[questId]) {
        this._questState[questId] = { current: 0, visited: [], startedAt: Date.now() };
      }

      const state = this._questState[questId];

      // Don't re-advance to a stage we've already visited
      if (state.visited.includes(stageNum)) return false;

      // Find the stage definition
      const stageDef = quest.stages.find(s => s.progress === stageNum);
      if (!stageDef) {
        console.warn(`[QuestEngine] Quest "${questId}" has no stage ${stageNum}`);
        return false;
      }

      // Update state
      state.visited.push(stageNum);
      if (stageNum > state.current) state.current = stageNum;

      // Add to quest log
      this._questLog.push({
        questId,
        stage: stageNum,
        text: stageDef.logText,
        timestamp: Date.now()
      });

      // Apply stage rewards
      if (stageDef.rewards) {
        this._applyRewards(stageDef.rewards);
      }

      // XP reward
      if (stageDef.rewardExperience) {
        player.xp += stageDef.rewardExperience;
        logMsg(`<span style='color:var(--success)'>+${stageDef.rewardExperience} XP (${quest.name})</span>`);
        checkLevelUp();
      }

      // Log quest progress to game log
      if (quest.showInLog !== false) {
        logMsg(`<span style='color:#FFD700'>📜 Quest Update: ${quest.name}</span>`);
        logMsg(`<span style='color:#CCCCCC; font-style:italic;'>${stageDef.logText}</span>`);
        if (typeof Sound !== 'undefined' && Sound.questAdvance) Sound.questAdvance();
      }

      // ── INT-GATED HINTS ──
      // LESSON: Rewarding player builds is a core RPG design principle.
      // A high-INT character should notice things others don't. We implement
      // this by attaching optional hint text and INT thresholds to stages.
      // The hint only appears if the player's INT meets the requirement.
      //
      // This is a SOFT GATE — it doesn't block progress, it just gives
      // extra information. Hard gates (you MUST have INT 15 to proceed)
      // should be implemented as requirements on quest triggers instead.
      if (stageDef.intHint && player.stats.int >= (stageDef.intHintThreshold ?? 12)) {
        logMsg(`<span style='color:#88CCFF'>💡 [Insight] ${stageDef.intHint}</span>`);

        // If there's also a modal hint (for particularly important insights),
        // show it as a popup
        if (stageDef.intHintModal) {
          let m = document.getElementById('modal-content');
          m.innerHTML = `<h2>💡 Insight (INT ${player.stats.int})</h2>
            <p style="font-size:60px; margin:5px 0;">🧠</p>
            <p>${stageDef.intHintModal}</p>
            <p style="font-size:11px; color:#88CCFF; font-style:italic;">
              Your keen intellect reveals what others would miss.
            </p>
            <button onclick="document.getElementById('overlay').style.display='none'"
              style="margin-top:12px;">I see...</button>`;
          document.getElementById('overlay').style.display = 'flex';
        }
      }

      // Check if quest is complete
      if (stageDef.finishesQuest) {
        state.completed = true;
        state.completedAt = Date.now();
        logMsg(`<span style='color:#FFD700'>🏆 Quest Complete: ${quest.name}!</span>`);
      }

      // Emit meta-event so other systems can react
      this.emit('quest_advance', { questId, stage: stageNum, completed: !!stageDef.finishesQuest });

      return true;
    },

    check(questId) {
      /*
        Returns the current highest stage reached for a quest, or 0 if not started.

        LESSON: This is the READ side of the quest state. Other systems use
        this to check progress without mutating anything. For example:
          if (QuestEngine.check('safe_cracking') >= 30) { showSafeOption(); }
      */
      return this._questState[questId]?.current ?? 0;
    },

    hasVisited(questId, stageNum) {
      /*
        Check if a specific stage has been visited (for branching quests).
        Different from check() because a quest might be at stage 70 but
        have also visited stage 60 on a different branch.
      */
      return this._questState[questId]?.visited?.includes(stageNum) || false;
    },

    isActive(questId) {
      /* A quest is "active" if it's been started but not completed. */
      const state = this._questState[questId];
      return state && state.current > 0 && !state.completed;
    },

    isComplete(questId) {
      return this._questState[questId]?.completed || false;
    },

    // ──────────────────────────────────────────────────────────────────────────
    // ACHIEVEMENT API
    // ──────────────────────────────────────────────────────────────────────────
    //
    // LESSON: Achievements are a special case of quest progression — they're
    // single-stage "quests" that are either earned or not. We keep them
    // as a separate system because they have different UI treatment
    // (toast notifications, point totals, category filtering).
    //
    // By routing achievements through the quest engine, we get:
    //   - Centralized save/load (the bug we're fixing!)
    //   - Event-driven triggers (no more scattered awardAchievement calls)
    //   - Achievements can be REQUIREMENTS for quests ("earn 20 achievements
    //     to unlock the Hall of Champions")
    // ──────────────────────────────────────────────────────────────────────────

    award(achieveId) {
      /*
        Award an achievement. Idempotent — calling twice has no effect.
        Returns true if newly awarded, false if already earned.
      */
      if (this._achievements[achieveId]) return false;

      const def = this._achieveDefs[achieveId];
      if (!def) {
        console.warn(`[QuestEngine] Unknown achievement: "${achieveId}"`);
        return false;
      }

      this._achievements[achieveId] = true;
      this._achievePoints += (def.points ?? 10);

      logMsg(`<span style="color:#FFD700">🏆 ACHIEVEMENT UNLOCKED: ${def.icon || '🏆'} ${def.name}! (+${def.points || 10}pts)</span>`);
      if (typeof Sound !== 'undefined' && Sound.achieve) Sound.achieve();

      // Milestone checks (auto-awards at threshold counts)
      this._checkMilestones();

      // Emit meta-event
      this.emit('achievement', { id: achieveId, name: def.name, points: def.points });

      return true;
    },

    hasAchievement(achieveId) {
      return !!this._achievements[achieveId];
    },

    getAchievementCount() {
      return Object.keys(this._achievements).length;
    },

    getAchievementPoints() {
      return this._achievePoints;
    },

    // ──────────────────────────────────────────────────────────────────────────
    // REQUIREMENT EVALUATION
    // ──────────────────────────────────────────────────────────────────────────
    //
    // LESSON: Composable Requirements
    //
    // This is the most powerful concept in the engine. A REQUIREMENT is a
    // small, testable condition like "player has 100 gold" or "player has
    // killed 5 ducks". Requirements can be combined with AND logic (all
    // must be true) to create complex conditions:
    //
    //   requirements: [
    //     { type: "questProgress", questId: "safe_cracking", stage: 30 },
    //     { type: "inventoryHas", item: "🐟", qty: 1 },
    //     { type: "playerStat", stat: "int", min: 12 }
    //   ]
    //
    // This means: "player must have started the safe cracking quest, must
    // be carrying a Red Herring, and must have INT >= 12."
    //
    // The beauty is that you can express almost any game condition as a
    // combination of these simple primitives, without writing custom code.
    //
    // For OR logic, create multiple dialogue replies with different
    // requirements pointing to the same next step (same as Andor's Trail).
    // ──────────────────────────────────────────────────────────────────────────

    evaluate(requirements) {
      /*
        Evaluate an array of requirements. Returns true only if ALL are met.
        (AND logic — see lesson above for OR logic pattern)
      */
      if (!requirements || requirements.length === 0) return true;

      for (const req of requirements) {
        let result = this._evaluateOne(req);

        // Support negation: { type: "questProgress", ..., negate: true }
        // means "this condition must NOT be true"
        if (req.negate) result = !result;

        if (!result) return false;
      }
      return true;
    },

    _evaluateOne(req) {
      /*
        Evaluate a single requirement. Returns boolean.

        LESSON: Each requirement type is a pure function of game state.
        No side effects. This makes them safe to call from UI code
        (e.g., "should I gray out this dialogue option?").
      */
      switch (req.type) {

        case 'questProgress':
          // Has the player reached at least this stage?
          return this.check(req.questId) >= (req.stage ?? 0);

        case 'questExact':
          // Has the player visited this SPECIFIC stage? (for branching)
          return this.hasVisited(req.questId, req.stage);

        case 'questActive':
          return this.isActive(req.questId);

        case 'questComplete':
          return this.isComplete(req.questId);

        case 'inventoryHas':
          // Player has at least qty of an item (does NOT consume it)
          return inventory.some(i => i && i.itemName === req.item && (i.qty ?? 1) >= (req.qty ?? 1));

        case 'inventoryRemove':
          // Like inventoryHas, but CONSUMES the item if the check passes.
          // WARNING: This has a side effect! Only use in reward/action
          // contexts, never in "should I show this option?" UI checks.
          return this._tryRemoveItem(req.item, req.qty ?? 1);

        case 'killedMonster':
          return (this._counters[`kill_${req.monsterType}`] ?? 0) >= (req.count ?? 1);

        case 'playerLevel':
          return player.level >= (req.min ?? 1);

        case 'playerStat':
          // Check a specific stat (str, dex, int, con, wis)
          return (player.stats[req.stat] ?? 0) >= (req.min ?? 1);

        case 'achievementEarned':
          return this.hasAchievement(req.id);

        case 'achievementCount':
          return this.getAchievementCount() >= (req.min ?? 0);

        case 'gold':
          return player.gp >= (req.min ?? 0);

        case 'location':
          // Check if player is on a specific floor or scene
          if (req.level !== undefined && currentLevel !== req.level) return false;
          if (req.scene && currentScene !== req.scene) return false;
          return true;

        case 'npcInteracted':
          return !!this._npcInteractions[req.npcType];

        case 'flag':
          // Check an arbitrary flag set by quest rewards
          return this._flags[req.flag] === (req.value !== undefined ? req.value : true);

        case 'counter':
          // Check a named counter
          return (this._counters[req.counter] ?? 0) >= (req.min ?? 1);

        // ── INT-GATED REQUIREMENT ──
        // LESSON: This requirement type is specifically for INT-gated
        // dialogue options. It allows quest designers to create dialogue
        // choices that only appear if the player is smart enough to
        // notice them. This rewards character build diversity.
        case 'intCheck':
          return player.stats.int >= (req.min ?? 10);

        default:
          console.warn(`[QuestEngine] Unknown requirement type: "${req.type}"`);
          return false;
      }
    },

    // ──────────────────────────────────────────────────────────────────────────
    // REWARD APPLICATION
    // ──────────────────────────────────────────────────────────────────────────
    //
    // LESSON: Rewards are the "write" counterpart to requirements' "read".
    // When a quest stage is reached or a dialogue choice is made, the
    // engine applies rewards to change game state.
    //
    // Like requirements, rewards are composable primitives. A single quest
    // stage might give gold, XP, an item, AND advance another quest.
    //
    // The CALLBACK reward type is our escape hatch for things that can't
    // be expressed as data — minigames, custom animations, complex UI.
    // This is the "hybrid" in our hybrid architecture.
    // ──────────────────────────────────────────────────────────────────────────

    _applyRewards(rewards) {
      for (const reward of rewards) {
        this._applyOneReward(reward);
      }
    },

    _applyOneReward(reward) {
      switch (reward.type) {

        case 'questProgress':
          this.advance(reward.questId, reward.stage);
          break;

        case 'giveItem': {
          // reward.item is a camelCase name (post quest-data migration).
          const def = ItemDefs[reward.item];
          let emptySlot = inventory.findIndex(i => i === null);
          if (emptySlot !== -1) {
            inventory[emptySlot] = new ItemStack(reward.item, reward.qty ?? 1);
            if (def) logMsg(`<span style='color:var(--success)'>Received: ${def.displayName}</span>`);
            if (typeof renderQuickslots === 'function') renderQuickslots();
          } else {
            logMsg(`<span style='color:var(--error)'>Inventory full! Item dropped on ground.</span>`);
            zone.dropAt(player.x, player.y, new ItemStack(reward.item, reward.qty ?? 1));
          }
          break;
        }

        case 'giveGold':
          changeGold(reward.amount ?? 0, { floatText: (reward.amount ?? 0) > 0, x: player.x, y: player.y, size: 16 });
          break;

        case 'giveXP':
          player.xp += (reward.amount ?? 0);
          checkLevelUp();
          break;

        case 'achievement':
          this.award(reward.id);
          break;

        case 'setFlag':
          this._flags[reward.flag] = reward.value !== undefined ? reward.value : true;
          break;

        case 'setCounter':
          this._counters[reward.counter] = reward.value ?? 0;
          break;

        case 'incrementCounter':
          this._counters[reward.counter] = (this._counters[reward.counter] ?? 0) + (reward.amount ?? 1);
          break;

        // ── CALLBACK REWARD ──
        // LESSON: The escape hatch. When you need to do something that
        // can't be expressed as data (play a custom animation, start a
        // minigame, modify the map), you register a named callback and
        // reference it from the quest JSON.
        //
        // EXAMPLE:
        //   In quest JSON:  { type: "callback", fn: "showDuckHuntDogLaugh" }
        //   In game code:   window.showDuckHuntDogLaugh = () => { ... }
        //
        // This keeps the quest data clean while still allowing custom code.
        // The rule of thumb: if you need a callback, you're doing something
        // VISUAL or INTERACTIVE that data alone can't express.
        case 'callback':
          if (typeof window[reward.fn] === 'function') {
            window[reward.fn](reward.args || {});
          } else {
            console.warn(`[QuestEngine] Callback not found: "${reward.fn}"`);
          }
          break;

        default:
          console.warn(`[QuestEngine] Unknown reward type: "${reward.type}"`);
      }
    },

    // ──────────────────────────────────────────────────────────────────────────
    // AUTO-TRIGGER SYSTEM
    // ──────────────────────────────────────────────────────────────────────────
    //
    // LESSON: Auto-triggers are what make the system truly data-driven.
    //
    // Each quest stage can define a TRIGGER — a combination of an event type,
    // a filter, and requirements. When the engine receives a matching event
    // AND all requirements are met, the quest automatically advances.
    //
    // This is how you define "kill 5 ducks → earn Duck Hunter achievement"
    // entirely in JSON:
    //
    //   {
    //     progress: 10,
    //     trigger: {
    //       event: "kill",
    //       filter: { type: "duck" },
    //       requirements: [{ type: "counter", counter: "kill_duck", min: 5 }]
    //     },
    //     rewards: [{ type: "achievement", id: "duck_hunter" },
    //               { type: "callback", fn: "showDuckHuntDogLaugh" }]
    //   }
    //
    // The combat code just calls QuestEngine.emit('kill', {type:'duck'}).
    // It has no idea that a duck-hunting quest even exists.
    // ──────────────────────────────────────────────────────────────────────────

    _autoTriggers: [],

    _wireAutoTriggers() {
      /*
        Scan all quest definitions and build a lookup table of
        { event, filter, requirements, questId, stageNum } for quick matching.
      */
      this._autoTriggers = [];

      for (const [questId, quest] of Object.entries(this._questDefs)) {
        for (const stage of quest.stages) {
          if (stage.trigger) {
            this._autoTriggers.push({
              event: stage.trigger.event,
              filter: stage.trigger.filter || {},
              requirements: stage.trigger.requirements || [],
              questId,
              stageNum: stage.progress
            });
          }
        }
      }

      console.log(`[QuestEngine] Wired ${this._autoTriggers.length} auto-triggers`);
    },

    _evaluateAutoTriggers(eventType, data) {
      /*
        For each auto-trigger that matches the event type:
        1. Check that the event data matches the filter
        2. Check that all requirements are met
        3. If both pass, advance the quest
      */
      for (const trigger of this._autoTriggers) {
        if (trigger.event !== eventType) continue;

        // Check filter (e.g., { type: "duck" } must match event data)
        if (!this._matchesFilter(data, trigger.filter)) continue;

        // Don't re-trigger already-visited stages
        if (this.hasVisited(trigger.questId, trigger.stageNum)) continue;

        // Check requirements
        if (!this.evaluate(trigger.requirements)) continue;

        // All checks passed — advance the quest!
        this.advance(trigger.questId, trigger.stageNum);
      }
    },

    _matchesFilter(data, filter) {
      /*
        Simple object matching: every key in `filter` must exist in `data`
        with the same value. Empty filter matches everything.
      */
      for (const [key, value] of Object.entries(filter)) {
        if (data[key] !== value) return false;
      }
      return true;
    },

    // ──────────────────────────────────────────────────────────────────────────
    // COUNTER SYSTEM
    // ──────────────────────────────────────────────────────────────────────────
    //
    // LESSON: Many quests need to count things — "kill 5 ducks", "buy 3 grogs",
    // "visit 4 stores". Instead of adding a player.duckKills, player.grogTurns,
    // etc. for each quest, we maintain a generic counter dictionary.
    //
    // Counters are automatically updated when events are emitted.
    // The naming convention is: {event}_{filterValue}
    // e.g., emit('kill', {type:'duck'}) increments counter "kill_duck"
    // ──────────────────────────────────────────────────────────────────────────

    _updateCounters(eventType, data) {
      // Auto-increment counters based on event type
      if (eventType === 'kill' && data.type) {
        const key = `kill_${data.type}`;
        this._counters[key] = (this._counters[key] ?? 0) + 1;
      }
      if (eventType === 'shop_visit' && data.type) {
        const key = `shop_visit_${data.type}`;
        this._counters[key] = (this._counters[key] ?? 0) + 1;
      }
      if (eventType === 'npc_talk' && data.type) {
        this._npcInteractions[data.type] = true;
        const key = `npc_talk_${data.type}`;
        this._counters[key] = (this._counters[key] ?? 0) + 1;
      }
      if (eventType === 'item_use' && data.item) {
        const key = `item_use_${data.item}`;
        this._counters[key] = (this._counters[key] ?? 0) + 1;
      }
    },

    getCounter(name) {
      return this._counters[name] ?? 0;
    },

    // ──────────────────────────────────────────────────────────────────────────
    // MILESTONE ACHIEVEMENTS (auto-award at threshold counts)
    // ──────────────────────────────────────────────────────────────────────────

    _checkMilestones() {
      const count = this.getAchievementCount();
      if (count >= 20 && !this._achievements['champion']) {
        this._achievements['champion'] = true;
        this._achievePoints += 50;
        logMsg(`<span style="color:#FFD700">🏆👑 ACHIEVEMENT UNLOCKED: 👑 Champion! (${count} achievements earned!)</span>`);
        logMsg(`<span style="color:var(--primary)">The Hall of Champions in Tristram is now open to you!</span>`);
      }
      if (count >= 25 && !this._achievements['legend']) {
        this._achievements['legend'] = true;
        this._achievePoints += 100;
        logMsg(`<span style="color:#FFD700">🏆⭐ ACHIEVEMENT UNLOCKED: ⭐ Living Legend! (${count} achievements!)</span>`);
      }
      if (count >= 30 && !this._achievements['mythic']) {
        this._achievements['mythic'] = true;
        this._achievePoints += 200;
        logMsg(`<span style="color:#FFD700">🏆💫 ACHIEVEMENT UNLOCKED: 💫 Mythic Champion! (${count} achievements!)</span>`);
      }
    },

    // ──────────────────────────────────────────────────────────────────────────
    // SERIALIZATION (SAVE / LOAD)
    // ──────────────────────────────────────────────────────────────────────────
    //
    // LESSON: The #1 bug we're fixing. Previously, achievements were stored
    // in module-level variables that were never included in saveGame().
    // By centralizing ALL quest/achievement state in the engine, saving
    // becomes a single call: JSON.stringify(QuestEngine.getState()).
    //
    // RULE: Only serialize STATE, never DEFINITIONS. Definitions are loaded
    // from quest pack files at startup and never change during gameplay.
    // State is what the player has done — progress, counters, flags.
    // ──────────────────────────────────────────────────────────────────────────

    getState() {
      return {
        questState: this._questState,
        achievements: this._achievements,
        achievePoints: this._achievePoints,
        counters: this._counters,
        flags: this._flags,
        npcInteractions: this._npcInteractions,
        questLog: this._questLog
      };
    },

    loadState(saved) {
      if (!saved) return;
      this._questState = saved.questState || {};
      this._achievements = saved.achievements || {};
      this._achievePoints = saved.achievePoints ?? 0;
      this._counters = saved.counters || {};
      this._flags = saved.flags || {};
      this._npcInteractions = saved.npcInteractions || {};
      this._questLog = saved.questLog || [];
      console.log(`[QuestEngine] State loaded: ${Object.keys(this._questState).length} quests, ${Object.keys(this._achievements).length} achievements`);
    },

    // ──────────────────────────────────────────────────────────────────────────
    // QUEST LOG API (for UI)
    // ──────────────────────────────────────────────────────────────────────────
    //
    // LESSON: A quest log transforms an opaque state machine into a readable
    // narrative. Players should always be able to answer: "What am I doing?
    // What should I do next?" The quest log answers both questions.
    //
    // Andor's Trail writes log entries in first person ("I found the map")
    // which creates a journal-like feel. We adopt the same convention.
    // ──────────────────────────────────────────────────────────────────────────

    getQuestLog() {
      /*
        Returns an array of quest summaries for the UI:
        [{ id, name, category, active, completed, stages: [{progress, text, visited}] }]
      */
      const result = [];
      for (const [questId, quest] of Object.entries(this._questDefs)) {
        if (quest.showInLog === false) continue;
        const state = this._questState[questId];
        if (!state || state.current === 0) continue; // Not started

        result.push({
          id: questId,
          name: quest.name,
          category: quest.category || 'General',
          active: !state.completed,
          completed: !!state.completed,
          stages: quest.stages
            .filter(s => state.visited.includes(s.progress))
            .sort((a, b) => a.progress - b.progress)
            .map(s => ({
              progress: s.progress,
              text: s.logText,
              visited: true
            }))
        });
      }
      return result;
    },

    getActiveQuests() {
      return this.getQuestLog().filter(q => q.active);
    },

    getCompletedQuests() {
      return this.getQuestLog().filter(q => q.completed);
    },

    // ──────────────────────────────────────────────────────────────────────────
    // DIALOGUE SYSTEM
    // ──────────────────────────────────────────────────────────────────────────
    //
    // LESSON: Hybrid Dialogue Architecture
    //
    // Pure data-driven dialogues (Andor's Trail style) work great for simple
    // conversations. But our game has minigames (Astrochicken), custom UI
    // (insult sword fighting), and animated sequences (Duck Hunt dog) that
    // can't be expressed as text + choices.
    //
    // Our hybrid approach:
    //   - Dialogue TEXT and BRANCHING is defined in JSON
    //   - Dialogue OPTIONS can have requirements (grayed out if not met)
    //   - INT-gated options show extra choices for smart characters
    //   - CALLBACK options invoke named JS functions for custom behavior
    //
    // This gives content creators the simplicity of JSON for 90% of
    // dialogues, with an escape hatch for the other 10%.
    // ──────────────────────────────────────────────────────────────────────────

    showDialogue(dialogueId, npcType) {
      /*
        Render a dialogue from its JSON definition.
        This is the data-driven replacement for the step-based functions
        like chaplainSpeak(step), antiqueShopDialogue(step), etc.
      */
      const dialogue = this._questDefs[`dialogue_${dialogueId}`] || this._findDialogue(dialogueId);
      if (!dialogue) {
        console.warn(`[QuestEngine] Unknown dialogue: "${dialogueId}"`);
        return;
      }

      // Record NPC interaction
      if (npcType) {
        this.emit('npc_talk', { type: npcType });
      }

      // Apply any rewards for reaching this dialogue node
      if (dialogue.rewards) {
        this._applyRewards(dialogue.rewards);
      }

      // If this is a SELECTOR (no message), find the first matching reply
      if (!dialogue.message) {
        for (const reply of (dialogue.replies || [])) {
          if (this.evaluate(reply.requires || [])) {
            if (reply.nextPhraseID && reply.nextPhraseID !== 'X') {
              this.showDialogue(reply.nextPhraseID, npcType);
            }
            return;
          }
        }
        return; // No matching branch
      }

      // Render the dialogue modal
      let m = document.getElementById('modal-content');
      Sound.gibberish();

      let html = `<h2>${dialogue.title || ''}</h2>`;
      if (dialogue.icon) {
        html += `<p style="font-size:60px; margin:5px 0;">${dialogue.icon}</p>`;
      }
      html += `<p>${dialogue.message}</p>`;

      // Render replies (with requirement gating)
      for (const reply of (dialogue.replies || [])) {
        const meetsReqs = this.evaluate(reply.requires || []);

        // ── INT-GATED DIALOGUE OPTIONS ──
        // LESSON: Some replies only appear if the player has high enough INT.
        // This creates a tangible reward for investing in Intelligence —
        // you literally see options that other characters can't.
        //
        // We show the option but grayed out with a hint if INT is close
        // but not quite enough. This tells the player "come back when
        // you're smarter" — a classic RPG design technique.
        if (reply.intRequired) {
          const hasInt = player.stats.int >= reply.intRequired;
          if (!hasInt) {
            if (player.stats.int >= reply.intRequired - 3) {
              // Close but not enough — show grayed-out hint
              html += `<button disabled style="display:block; margin:4px 0; width:100%; opacity:0.4; cursor:not-allowed;"
                title="Requires INT ${reply.intRequired}">
                🧠 [INT ${reply.intRequired}] ${reply.text}</button>`;
            }
            // If INT is far below, don't show the option at all
            continue;
          }
          // Player has enough INT — show with a brain icon
          html += `<button onclick="${reply.callback ? reply.callback : `QuestEngine.showDialogue('${reply.nextPhraseID}','${npcType}')`}"
            style="display:block; margin:4px 0; width:100%; border-left: 3px solid #88CCFF;">
            🧠 ${reply.text}</button>`;
          continue;
        }

        if (meetsReqs) {
          if (reply.nextPhraseID === 'X' || !reply.nextPhraseID) {
            html += `<button onclick="document.getElementById('overlay').style.display='none'; advanceTurn(1)"
              style="display:block; margin:4px 0; width:100%;">${reply.text}</button>`;
          } else if (reply.callback) {
            html += `<button onclick="${reply.callback}"
              style="display:block; margin:4px 0; width:100%;">${reply.text}</button>`;
          } else {
            html += `<button onclick="QuestEngine.showDialogue('${reply.nextPhraseID}','${npcType}')"
              style="display:block; margin:4px 0; width:100%;">${reply.text}</button>`;
          }
        }
      }

      m.innerHTML = html;
      document.getElementById('overlay').style.display = 'flex';
    },

    _findDialogue(id) {
      // Search all quest packs for a dialogue node with this ID
      for (const quest of Object.values(this._questDefs)) {
        if (quest.dialogues) {
          const found = quest.dialogues.find(d => d.id === id);
          if (found) return found;
        }
      }
      return null;
    },

    // ──────────────────────────────────────────────────────────────────────────
    // UTILITY METHODS
    // ──────────────────────────────────────────────────────────────────────────

    _tryRemoveItem(itemName, qty) {
      let found = 0;
      for (let i = 0; i < inventory.length; i++) {
        if (inventory[i] && inventory[i].itemName === itemName) {
          found += (inventory[i].qty ?? 1);
        }
      }
      if (found < qty) return false;
      // Actually remove
      let remaining = qty;
      for (let i = 0; i < inventory.length && remaining > 0; i++) {
        if (inventory[i] && inventory[i].itemName === itemName) {
          let has = inventory[i].qty ?? 1;
          if (has <= remaining) {
            remaining -= has;
            inventory[i] = null;
          } else {
            inventory[i].qty -= remaining;
            remaining = 0;
          }
        }
      }
      if (typeof renderQuickslots === 'function') renderQuickslots();
      return true;
    },

    // ──────────────────────────────────────────────────────────────────────────
    // BACKWARD COMPATIBILITY BRIDGE
    // ──────────────────────────────────────────────────────────────────────────
    //
    // LESSON: When refactoring a live system, never break the old API.
    // Existing code calls `awardAchievement('pirate_insult')`. We need
    // that to keep working during the migration. This bridge function
    // redirects old calls to the new engine.
    // ──────────────────────────────────────────────────────────────────────────

    installLegacyBridge() {
      // Replace global awardAchievement with engine call
      window.awardAchievement = (id) => {
        QuestEngine.award(id);
      };

      // Make engine globally accessible
      window.QuestEngine = this;

      console.log('[QuestEngine] Legacy bridge installed');
    }
  };

  // ============================================================================
  // AUTO-INITIALIZE ON LOAD
  // ============================================================================
  //
  // LESSON: The engine initializes itself when the script loads, picking up
  // quest packs that have been registered by earlier scripts. The order in
  // build.py matters: quest pack files must load BEFORE quest_engine.js.
  //
  // We use a global array `_questPacks` as a simple registration mechanism.
  // Each quest pack file pushes its data into this array, and the engine
  // collects them all at init time.
  // ============================================================================

  // Collect quest packs registered by earlier scripts
  window._questPacks = window._questPacks || [];

  // Defer initialization until DOM is ready and all scripts have loaded
  window._initQuestEngine = function() {
    QuestEngine.init(window._questPacks, ACHIEVEMENT_DEFS);
    QuestEngine.installLegacyBridge();
  };
