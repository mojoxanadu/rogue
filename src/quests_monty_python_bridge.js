// === quests_monty_python_bridge.js ===
/*
  Monty Python — The Bridge of Death (drop-in quest pack).

  Owns the bridge keeper end-to-end: spawn site + dialog tree + trial outcomes.
  Replaces the old engine.js bridgeTrial() + bridgeAns + bridgeAns2 + bridgeAns3
  chain and the player.bridgeQuestions flag.

  Removing this file from build_files.py removes the keeper entirely — no
  spawn, no dialog, no orphaned code (per the drop-in contract).

  Spawn mechanism: the pack wraps QuestEngine.emit in its IIFE to hook
  'enter_level' for the desert scene. Pack handler blocks aren't actually
  invoked by anything today (verified 2026-05-22) — wrapping emit is the
  pragmatic tier-1 path until quest_engine.js grows a real .on() API.
*/
(function() {
  'use strict';

  // ─── Dialog tree ─────────────────────────────────────────────
  if (typeof Dialog !== 'undefined') {
    Dialog.registerPhrases({
      'bridge_keeper_q1': {
        message: 'Stop! Who would cross the Bridge of Death must answer me these questions three, ere the other side he see. What... is your name?',
        replies: [
          { text: '"Sir Lancelot of Camelot."', nextPhrase: 'bridge_keeper_q2' },
          { text: '"Galahad the... wait!"',     nextPhrase: 'bridge_keeper_lose' },
        ],
      },
      'bridge_keeper_q2': {
        message: 'What... is your quest?',
        replies: [
          { text: '"To seek the Holy Grail."',    nextPhrase: 'bridge_keeper_q3' },
          { text: '"To find a nice shrubbery."',  nextPhrase: 'bridge_keeper_lose' },
        ],
      },
      'bridge_keeper_q3': {
        message: 'What... is the airspeed velocity of an unladen swallow?',
        replies: [
          { text: '"24 miles per hour?"', nextPhrase: 'bridge_keeper_lose' },
          // Gated on high INT — preserves the existing "smart-player-only" path.
          {
            text: '"What do you mean? African or European swallow?"',
            nextPhrase: 'bridge_keeper_win',
            requires: [{ type: 'playerStat', stat: 'int', min: 15 }],
          },
        ],
      },
      'bridge_keeper_win': {
        message: "What? I don't know that! AHHHHHHH!",
        replies: [
          { text: '[Watch him plummet]', nextPhrase: '@remove' },
        ],
      },
      'bridge_keeper_lose': {
        message: 'AHHHHHHH!',
        scriptEffects: [{ type: 'die', cause: 'bridgekeeper' }],
        replies: [],
      },
    });
  }

  // ─── Spawn-on-enter-desert hook ──────────────────────────────
  // Idempotent: only spawn if no keeper already exists in zone.
  function spawnKeeper() {
    if (typeof zone === 'undefined' || typeof MONSTER_DEF === 'undefined' || typeof spawnNpc !== 'function') return;
    if (zone.npcs.some(e => e.type === 'bridge_keeper')) return;
    spawnNpc(zone.npcs, 15, 10, 'bridge_keeper', {
      stats: { ...MONSTER_DEF['bridge_keeper'] },
      phraseId: 'bridge_keeper_q1',
      isQuestNPC: true,
    });
  }

  // Pack files load BEFORE quest_engine.js (per build_files.py ordering — packs
  // self-register on window._questPacks, which quest_engine collects during its
  // own load). So QuestEngine isn't defined yet at this point. Defer the emit
  // wrap until the next tick when the rest of the scripts have parsed.
  function installEmitHook() {
    if (typeof QuestEngine === 'undefined' || typeof QuestEngine.emit !== 'function') return;
    if (QuestEngine.__bridgeEmitHooked) return;  // idempotent across hot-reload
    QuestEngine.__bridgeEmitHooked = true;
    const _orig = QuestEngine.emit.bind(QuestEngine);
    QuestEngine.emit = function(type, data) {
      const result = _orig(type, data);
      if (type === 'enter_level' && data && data.scene === 'desert') {
        spawnKeeper();
      }
      return result;
    };
  }
  if (typeof window !== 'undefined') {
    // setTimeout(0) waits past current script-eval; works whether quest_engine
    // loads next or many files later.
    setTimeout(installEmitHook, 0);
  }

  // ─── Pack registration (cosmetic — no quest stages used in tier-1) ──
  window._questPacks = window._questPacks || [];
  window._questPacks.push({
    id: 'monty_python_bridge',
    name: 'The Bridge of Death',
    quests: [],
    achievements: [],
    handlers: {},
  });
})();
