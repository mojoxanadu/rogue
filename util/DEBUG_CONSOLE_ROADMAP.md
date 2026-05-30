# Debug Console Roadmap

This roadmap tracks debug-console enhancements inspired by classic MUD tooling and WoW-style GM/admin commands.

## Implemented

- [x] `/where` - quick scene/floor/position/context report
- [x] `/goto <x> <y>` - coordinate teleport
- [x] `/seed <n>` - set deterministic map seed for repro
- [x] `/regen` - regenerate current map (seed-aware)
- [x] `/snapshot save|load|list` - save/load local test states
- [x] `/loot add <icon> [qty]` - fast inventory/pouch item injection
- [x] `/validate` - map/entity/player integrity checks
- [x] `/alias add|del|list` - command aliases
- [x] Command chaining via `;` (e.g. `n;n;/where`)
- [x] `/save` command path fixed in console parser

## Next Suggested Additions

### MUD-style

- [x] `/look long` - verbose room parse with nearby interactables
- [x] `/target nearest <type>` - smart target selection
- [x] `/log start|stop|export` - session transcript tooling
- [x] Macro variables (`$hp`, `$scene`, `$enemy_count`) and cooldown guards

### WoW-style GM controls

- [x] `/gm on|off` and `/gm speed <mult>` presets
- [x] `/tele <scene|poi|floor>` fuzzy teleports
- [x] `/spawn <mob> [count]` and `/despawn <scope>`
- [x] `/quest list|stage|complete` admin controls
- [x] `/dps start <seconds>` and `/dps report`
- [x] `/prof fps|ai|render|audio` lightweight runtime profiler
