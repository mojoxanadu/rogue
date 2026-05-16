# Rogue TODO

Pri: 1 = critical / drop-everything (rarely used — fix immediately, don't queue).
Higher numbers = less urgent. No cap. Decimals OK for fine-grained ordering.

Status: `new`, `in progress`, `partial` (some done, rest postponed).

Type: `bug`, `cos` (cosmetic), `enh` (enhancement).

| Status | Pri | Type | ID                  | Description                                                                                                  |
|--------|-----|------|---------------------|--------------------------------------------------------------------------------------------------------------|
| new    | 2   | enh  | second wind         | Implement Second Wind talent — hp=0 can persist briefly without death, then heal back above 0.                |
| new    | 2.5 | enh  | pickpocket          | Implement Pickpocket talent.                                                                                  |
| new    | 2.5 | enh  | scavenger           | Implement Scavenger talent.                                                                                   |
| new    | 3   | enh  | growth spurt        | Implement Growth Spurt talent.                                                                                |
| new    | 3   | enh  | endurance           | Implement Endurance talent.                                                                                   |
| new    | 3   | enh  | life magic          | Implement Life Magic talent.                                                                                  |
| new    | 3   | enh  | sweettalking        | Implement Sweettalking talent.                                                                                |
| new    | 3   | enh  | weave magic         | Implement Weave Magic talent.                                                                                 |
| new    | 3   | enh  | brawler             | Implement Brawler talent (+5%×N hit when unarmed) — def claims impl (no `tbi`) but 0 refs in code.            |
| new    | 3   | enh  | intimidation        | Implement Intimidation talent — def claims impl (no `tbi`) but 0 refs in code.                                |
| new    | 3   | enh  | level1Spell gate    | Wire tome-learning (mechanics.js:497) to gate on `talents.level1Spell.level` — currently unconditional.       |
| new    | 3.5 | enh  | receiveHealing      | Add Sentient.receiveHealing() — central hook needed for Disciple of Life and similar healing-modifier talents.|
| new    | 4   | enh  | floor/area split    | Dissociate floor numbers from area ids.                                                                       |
| partial| 4   | enh  | foraging re-entry   | Spawn a small foraging-food batch when re-entering an already-cached floor (gen + per-turn paths impl; cache-restore path missing). |
| new    | 4   | fix  | light levels        | Light levels don't work well; consolidate the various light/dark/visibility issues into one pass.             |
| new    | 4   | enh  | damage types        | Support multiple damage types (Holy, etc.) end-to-end — prereq for Divine Strike / Divine Champion / Flame Strike. |
| new    | 4   | enh  | sleep scheduler     | Run sleep under the scheduler so the world (NPCs, conditions, timers) keeps ticking while the player rests.   |
| new    | 4   | fix  | loot balance        | Audit and rebalance all loot spawn rules — drop rates, gold scaling, item-tier gating across floors.          |
| new    | 5   | enh  | darkvision          | Implement Darkvision talent (depends on: light levels fix).                                                   |
| new    | 5   | enh  | dual wield          | Implement Dual Wield talent.                                                                                  |
| new    | 5   | enh  | defensive fighting  | Implement Defensive Fighting talent.                                                                          |
| new    | 5   | enh  | divine strike       | Implement Divine Strike talent (depends on: damage types).                                                    |
| new    | 5   | enh  | disciple of life    | Implement Disciple of Life talent (depends on: receiveHealing).                                               |
| new    | 5   | enh  | divine champion     | Implement Divine Champion talent (depends on: damage types).                                                  |
| new    | 5   | enh  | dueling             | Implement Dueling talent.                                                                                     |
| new    | 5   | enh  | flame strike        | Implement Flame Strike talent (depends on: damage types).                                                     |
| new    | 5   | enh  | speed picking       | Implement Speed Picking talent.                                                                               |
| new    | 5   | enh  | monster CRs         | Add challenge ratings to monster defs and use them to drive spawn-level scaling.                              |
| new    | 5   | enh  | stats tab           | Add Statistics tab to Achievements.                                                                           |
| new    | 5.1 | enh  | stats→achievements  | Review new statistics for additional achievement ideas (depends on: stats tab).                               |
| new    | 6   | cos  | building fix        | Fix buildings graphically and for solidity.                                                                   |
| new    | 6   | enh  | hunger rebalance    | Rework hunger effects for gameplay-fun-vs-balance tuning.                                                     |
| new    | 7   | enh  | random town gen     | Procedurally generate towns.                                                                                  |
| new    | 10  | enh  | levelup equip hints | Suggest additional helpful equipment (e.g. armor) in the level-up screen.                                     |
