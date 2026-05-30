# Quest Engine — Contributor Guide

## Overview

The Quest Engine is a data-driven system that lets content creators add quests
and achievements to Dungeon Descent **without modifying game engine code**.

You write JSON. The engine handles the rest.

```
Your Quest Pack (.js)          Quest Engine              Game Code
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ quests: [...]     │────►│ auto-triggers    │◄────│ emit('kill',     │
│ achievements: []  │     │ requirements     │     │   {type:'duck'}) │
└──────────────────┘     │ rewards          │────►│                  │
                         │ save/load        │     │ (awards, items,  │
                         └──────────────────┘     │  gold, XP, etc.) │
                                                  └──────────────────┘
```

## Quick Start: Adding a Quest

### 1. Choose or create a quest pack file

```
src/quests_base.js            — core mechanics (kills, levels, exploration)
src/quests_monkey_island.js   — Monkey Island themed content
src/quests_monty_python.js    — Monty Python themed content
src/quests_black_cauldron.js  — Black Cauldron / Prydain content
src/quests_kings_quest.js     — King's Quest content (create this!)
```

### 2. Write your quest

```javascript
window._questPacks = window._questPacks || [];

window._questPacks.push({
  quests: [
    {
      id: "q_my_quest",           // Unique ID (prefix with q_)
      name: "My Quest Name",      // Shown in quest log
      category: "Quests",         // For UI grouping
      showInLog: true,            // false = hidden background quest
      stages: [
        {
          progress: 10,           // Stage number (use multiples of 10)
          logText: "I met a strange old man who asked me to find his cat.",

          // OPTIONAL: Auto-advance when this event+filter+requirements match
          trigger: {
            event: "npc_talk",
            filter: { type: "old_man" },
            requirements: []
          },

          // OPTIONAL: Rewards when this stage is reached
          rewards: [
            { type: "giveGold", amount: 50 },
            { type: "setFlag", flag: "met_old_man", value: true }
          ],

          rewardExperience: 25,   // OPTIONAL: XP bonus

          // OPTIONAL: INT-gated hints (shown if player INT >= threshold)
          intHint: "The old man seems nervous. He's hiding something.",
          intHintThreshold: 12,

          // OPTIONAL: INT-gated popup (for important revelations)
          intHintModal: "Your intellect detects that the old man is lying about the cat. There never was a cat. He wants you to go to the cave for a different reason entirely."
        },
        {
          progress: 20,
          logText: "I found the 'cat'. It was actually a dragon.",
          trigger: {
            event: "kill",
            filter: { type: "dragon" },
            requirements: [
              { type: "questProgress", questId: "q_my_quest", stage: 10 }
            ]
          },
          rewards: [
            { type: "achievement", id: "my_achievement" }
          ],
          rewardExperience: 200,
          finishesQuest: true      // Marks quest complete
        }
      ]
    }
  ],

  achievements: [
    {
      id: "my_achievement",
      name: "Dragon Finder",
      cat: "Quests",
      desc: "Find the old man's 'cat'",
      icon: "🐉",
      points: 30
    }
  ]
});
```

### 3. Add file to build.py

Insert your file **before** `quest_engine.js`:

```python
files = [
    ...
    'quests_my_pack.js',     # <-- add here
    'quest_engine.js',
    ...
]
```

### 4. Build and test

```bash
python3 build.py
```

## Reference

### Events (emitted by game code)

These are the events the game engine currently emits. Your quest triggers
can listen for any of them.

| Event | Data Fields | When Fired |
|-------|-------------|------------|
| `kill` | `{ type }` | Any monster killed |
| `combat_hurt` | `{ attacker, damage }` | Player takes damage |
| `enter_level` | `{ level, scene }` | Player changes floor |
| `level_up` | `{ level }` | Player gains a level |
| `npc_talk` | `{ type }` | Player talks to NPC |
| `shop_visit` | `{ type }` | Player enters a shop |
| `item_use` | `{ item }` | Player uses an item |
| `quest_advance` | `{ questId, stage, completed }` | Quest stage reached (meta) |
| `achievement` | `{ id, name, points }` | Achievement awarded (meta) |
| `custom` | `{ id, ...data }` | One-off scripted events |

To emit a custom event from game code:
```javascript
QuestEngine.emit('custom', { id: 'my_event', extra: 'data' });
```

### Requirement Types

Requirements are the conditions that must be met for a trigger to fire
or a dialogue option to appear. All requirements in an array use AND logic.

| Type | Fields | Example |
|------|--------|---------|
| `questProgress` | `questId`, `stage` | Player reached stage 30+ of a quest |
| `questExact` | `questId`, `stage` | Player visited this exact stage (branching) |
| `questActive` | `questId` | Quest started but not completed |
| `questComplete` | `questId` | Quest finished |
| `inventoryHas` | `item`, `qty` | Player carrying N of an item (no consume) |
| `inventoryRemove` | `item`, `qty` | Player has AND consumes item (side effect!) |
| `killedMonster` | `monsterType`, `count` | Killed N of a monster type |
| `playerLevel` | `min` | Player level >= N |
| `playerStat` | `stat`, `min` | STR/DEX/INT/CON/WIS >= N |
| `achievementEarned` | `id` | Has a specific achievement |
| `achievementCount` | `min` | Has N total achievements |
| `gold` | `min` | Has >= N gold |
| `location` | `level`, `scene` | On specific floor/scene |
| `npcInteracted` | `npcType` | Has talked to this NPC type |
| `flag` | `flag`, `value` | Arbitrary flag matches value |
| `counter` | `counter`, `min` | Named counter >= N |
| `intCheck` | `min` | Player INT >= N |

**Negation**: Add `negate: true` to any requirement to invert it:
```json
{ "type": "questProgress", "questId": "q_foo", "stage": 10, "negate": true }
```
This means "player has NOT reached stage 10."

**OR logic**: Create multiple dialogue replies with different requirements
pointing to the same destination. The first one whose requirements pass wins.

### Reward Types

Rewards are applied when a quest stage is reached.

| Type | Fields | Effect |
|------|--------|--------|
| `questProgress` | `questId`, `stage` | Advance another quest |
| `giveItem` | `item`, `qty` | Add item to inventory |
| `giveGold` | `amount` | Add gold |
| `giveXP` | `amount` | Add experience |
| `achievement` | `id` | Award achievement |
| `setFlag` | `flag`, `value` | Set arbitrary flag |
| `setCounter` | `counter`, `value` | Set counter to value |
| `incrementCounter` | `counter`, `amount` | Add to counter |
| `callback` | `fn`, `args` | Call `window[fn](args)` |

### INT-Gated Content

Three tiers of intelligence-based content, from subtle to dramatic:

**Tier 1 — Log Hint** (soft gate, informational)
```javascript
{
  progress: 10,
  logText: "I entered the cave.",
  intHint: "The cave walls show signs of recent excavation.",
  intHintThreshold: 12    // default: 12
}
```

**Tier 2 — Modal Popup** (soft gate, visual emphasis)
```javascript
{
  progress: 10,
  logText: "I entered the cave.",
  intHint: "Short log version...",
  intHintThreshold: 14,
  intHintModal: "Long detailed popup with strategic information..."
}
```

**Tier 3 — Dialogue Hard Gate** (blocks option entirely)
```javascript
// In dialogue replies:
{
  text: "I notice the runes are a warning...",
  intRequired: 15,
  nextPhraseID: "secret_path"
}
```
Options with `intRequired` are invisible if INT is too low. If INT is within
3 points, they show grayed out with a `[INT N]` tag (teaches the player to
invest in INT).

### Counters

The engine auto-increments counters for common events:

| Counter Name | Incremented On |
|-------------|----------------|
| `kill_{type}` | Any kill (e.g., `kill_duck`, `kill_shark`) |
| `kill_total` | Any kill |
| `kill_vermin` | Mouse or cockroach killed |
| `shop_visit_{type}` | Shop entered (e.g., `shop_visit_apu`) |
| `npc_talk_{type}` | NPC talked to |
| `item_use_{item}` | Item used |

Use counters in requirements:
```json
{ "type": "counter", "counter": "kill_duck", "min": 5 }
```

### API Reference (for game code authors)

```javascript
// Emit an event (game code does this)
QuestEngine.emit('kill', { type: 'duck' });

// Manual quest progression (for scripted moments)
QuestEngine.advance('q_gurgi', 20);

// Read quest state
QuestEngine.check('q_safe_cracking');     // → current stage number
QuestEngine.isActive('q_gurgi');          // → boolean
QuestEngine.isComplete('q_gurgi');        // → boolean
QuestEngine.hasVisited('q_gurgi', 30);    // → boolean (branching)

// Achievements
QuestEngine.award('duck_hunter');         // → true if newly awarded
QuestEngine.hasAchievement('duck_hunter');// → boolean
QuestEngine.getAchievementCount();        // → number
QuestEngine.getAchievementPoints();       // → number

// Requirements (check without side effects)
QuestEngine.evaluate([
  { type: 'playerStat', stat: 'int', min: 15 },
  { type: 'gold', min: 100 }
]);

// Quest log (for UI)
QuestEngine.getQuestLog();     // → [{id, name, category, active, completed, stages}]
QuestEngine.getActiveQuests();
QuestEngine.getCompletedQuests();

// Save/load
let saved = QuestEngine.getState();   // → serializable object
QuestEngine.loadState(saved);         // restore from save

// Listen for events
let unsub = QuestEngine.on('achievement', (data) => {
  showToast(data.name);
});
unsub(); // stop listening
```

### Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Quest IDs | `q_` prefix, snake_case | `q_insult_swordfighting` |
| Achievement IDs | snake_case, no prefix | `duck_hunter` |
| Quest pack files | `quests_{theme}.js` | `quests_monkey_island.js` |
| Stage numbers | Multiples of 10 | 10, 20, 30 |
| Branch stages | Use 5s between tens | 25 = alt path between 20 and 30 |
| Callbacks | camelCase, descriptive | `showDuckHuntDogLaugh` |
| Flags | snake_case | `castle_entrance_found` |
| Counters | `{event}_{detail}` | `kill_duck`, `shop_visit_apu` |

### Content Packs by Franchise

| File | Franchise | Status |
|------|-----------|--------|
| `quests_base.js` | Core gameplay | Active |
| `quests_monkey_island.js` | Monkey Island | Active |
| `quests_monty_python.js` | Monty Python & Holy Grail | Active |
| `quests_black_cauldron.js` | The Black Cauldron / Prydain | Active |
| `quests_kings_quest.js` | King's Quest V | TODO: restore rat rescue, bandit camp, temple, genie from v7.1.0 |
| `quests_space_quest.js` | Space Quest | TODO: Astrochicken exists in shop.js |
| `quests_indiana_jones.js` | Indiana Jones | TODO: Last Crusade trials exist; Fate of Atlantis beads/machines/drawbridge missing |
| `quests_quest_for_glory.js` | Quest for Glory | TODO: Erasmus defined in MONSTER_DEF, never used |
| `quests_zork.js` | Zork | TODO: Grue lore in shop.js, thief/pickpocket/fence system in engine.js |
| `quests_bethesda.js` | Elder Scrolls | TODO: Clavicus Vile, Dark Brotherhood assassin, atronach exist |
| `quests_leisure_suit_larry.js` | Leisure Suit Larry | TODO: prophylactic quest + Mystery Woman exist in shop.js |
| `quests_final_fantasy.js` | Final Fantasy | TODO: Ifrit boss + Tome of Fireball exist in engine.js/map.js |
