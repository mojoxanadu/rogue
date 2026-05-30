# NPC Dialog Voice Audit (Build 760)

Date: 2026-04-16

## Scope

- `src/shop.js` NPC chat trees and branching dialog modals
- `src/engine.js` non-shop NPC dialog modals (insult battle + bridge keeper)

## Method

1. Enumerated all `window.*` modal/dialog functions that write `innerHTML`.
2. Verified each NPC dialog branch has an explicit voice call (`playVoiceClip(...)` or `Sound.playVoice(...)`).
3. Verified every referenced voice key in `shop.js` + `engine.js` has a generated MP3 file in `sounds/generated/voices/**`.

## Result

- NPC dialog trees are now voice-wired at all branch levels in `shop.js` and `engine.js`.
- Voice key verification: `69` referenced keys, `0` missing files.

## Newly Wired in This Pass

- Apu dungeon-reason branch (`askApuWhyDungeon`) now rotates matching voice clips (`voice_apu_dungeon_0..4`).
- Lefty mystery-lady branch now has invite/outcome voice (`voice_larry_*`).
- Caustic Grog branch now has dedicated quest-line voice (`voice_caustic_*`).
- Bridge Keeper question chain now has per-question voice (`voice_bridgekeeper_q1..q3`).
- SCUMMbar branch voice/text alignment was corrected with dedicated SCUMMbar clips.

## Intentional Non-NPC Exceptions

- `astrochickenBarGame` (minigame UI)
- `openLootWindow`, `activateAtlanteanMachine`, `showDuckHuntDogLaugh` (system/easter-egg UI)

These are not NPC chat trees and were excluded from required branch-voice coverage.
