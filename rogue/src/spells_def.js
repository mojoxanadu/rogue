// ============================================================
//  SPELL_DEFS  –  src/spells_def.js
//
//  Spell dictionary keyed by camelCase spell id. Mirrors the
//  shape of TALENT_DEFS (data-only registry). The full spell
//  list comes later — this stub seeds the entries the engine
//  currently references so that player.countSpells({level: N})
//  can answer correctly today.
//
//  Schema per entry:
//    name  : display name (string)
//    level : 1..5 — slot tier (consumed by Level N Spell talent)
// ============================================================

const SPELL_DEFS = {
  illuminate: { name: 'Illuminate',   level: 1, duration: 30, radius: 15 },
  unlock:     { name: 'Unlock',       level: 1 },
  lightning:  { name: 'Lightning',    level: 1 },
  fireball:   { name: 'Fireball',     level: 1 },
  haste:      { name: 'Haste',        level: 1 },
  heal:       { name: 'Heal',         level: 1 },
  icebolt:    { name: 'Ice Bolt',     level: 1 },
  shield:     { name: 'Shield',       level: 1 },
  strength:   { name: 'Strength',     level: 1 },
  portal:     { name: 'Town Portal',  level: 1 },
};

const SPELL_ICONS = {
  illuminate: '\uD83C\uDF00',
  unlock:     '\uD83D\uDD13',
  lightning:  '\u26A1',
  fireball:   '\uD83D\uDD25',
  haste:      '\uD83D\uDC5F',
  heal:       '\uD83D\uDC96',
  icebolt:    '\u2744\uFE0F',
  shield:     '\uD83D\uDEE1\uFE0F',
  strength:   '\uD83D\uDCAA',
  portal:     '\uD83D\uDCD6',
};

if (typeof window !== 'undefined') {
  window.SPELL_DEFS = SPELL_DEFS;
  window.SPELL_ICONS = SPELL_ICONS;
}
