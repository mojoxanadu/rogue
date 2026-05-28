# Rogue TODO

PICKPOCKET  pri:2.5  enhancement
Implement Pickpocket talent.

SCAVENGER  pri:2.5  enhancement
Implement Scavenger talent.

GROWTH_SPURT  pri:3  enhancement
Implement Growth Spurt talent.

ENDURANCE  pri:3  enhancement
Implement Endurance talent.

LIFE_MAGIC  pri:3  enhancement
Implement Life Magic talent.

SWEETTALKING  pri:3  enhancement
Implement Sweettalking talent.

WEAVE_MAGIC  pri:3  enhancement
Implement Weave Magic talent.

BRAWLER  pri:3  enhancement
Implement Brawler talent (+5%×N hit when unarmed) — def claims
impl (no `tbi`) but 0 refs in code.

INTIMIDATION  pri:3  enhancement
Implement Intimidation talent — def claims impl (no `tbi`) but 0
refs in code.

LEVEL1_SPELL_GATE  pri:3  enhancement
Wire tome-learning (mechanics.js:497) to gate on
`talents.level1Spell.level` — currently unconditional.

RECEIVE_HEALING  pri:3.5  enhancement
Add Sentient.receiveHealing() — central hook needed for Disciple
of Life and similar healing-modifier talents.

FLOOR_AREA_SPLIT  pri:4  enhancement
Dissociate floor numbers from area ids.

WALL_LOOT_PICKUP  pri:4  bug
Wall-tile loot (e.g. ghost killed inside a wall) is
unreachable — let the player bump the wall to grab it.

DPAD_DIAGONAL_SLIDE  pri:4  enhancement
When a tapped D-pad diagonal is blocked, slide to the open
horizontal move, else the vertical one.

FORAGING_RE_ENTRY  pri:4  enhancement
Spawn a small foraging-food batch when re-entering an already-
cached floor (gen + per-turn paths impl; cache-restore path
missing).

LIGHT_LEVELS  pri:4  bug
Light levels don't work well; consolidate the various
light/dark/visibility issues into one pass.

DAMAGE_TYPES  pri:4  enhancement
Support multiple damage types (Holy, etc.) end-to-end — prereq
for Divine Strike / Divine Champion / Flame Strike.

SLEEP_SCHEDULER  pri:4  enhancement
Run sleep under the scheduler so the world (NPCs, conditions,
timers) keeps ticking while the player rests.

LOOT_BALANCE  pri:4  bug
Audit and rebalance all loot spawn rules — drop rates, gold
scaling, item-tier gating across floors.

DARKVISION  pri:5  enhancement
Implement Darkvision talent (depends on: light levels fix).

DUAL_WIELD  pri:5  enhancement
Implement Dual Wield talent.

DEFENSIVE_FIGHTING  pri:5  enhancement
Implement Defensive Fighting talent.

DIVINE_STRIKE  pri:5  enhancement
Implement Divine Strike talent (depends on: damage types).

DISCIPLE_OF_LIFE  pri:5  enhancement
Implement Disciple of Life talent (depends on: receiveHealing).

DIVINE_CHAMPION  pri:5  enhancement
Implement Divine Champion talent (depends on: damage types).

DUELING  pri:5  enhancement
Implement Dueling talent.

FLAME_STRIKE  pri:5  enhancement
Implement Flame Strike talent (depends on: damage types).

SPEED_PICKING  pri:5  enhancement
Implement Speed Picking talent.

MONSTER_CRS  pri:5  enhancement
Add challenge ratings to monster defs and use them to drive
spawn-level scaling.

STATS_TAB  pri:5  enhancement
Add Statistics tab to Achievements.

STATS_TO_ACHIEVEMENTS  pri:5.1  enhancement
Review new statistics for additional achievement ideas (depends
on: stats tab).

BUILDING_FIX  pri:6  cosmetic
Fix buildings graphically and for solidity.

HUNGER_REBALANCE  pri:6  enhancement
Rework hunger effects for gameplay-fun-vs-balance tuning.

RANDOM_TOWN_GEN  pri:7  enhancement
Procedurally generate towns.

LEVELUP_EQUIP_HINTS  pri:10  enhancement
Suggest additional helpful equipment (e.g. armor) in the level-
up screen.
