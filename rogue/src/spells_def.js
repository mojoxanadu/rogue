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
  illuminate: { name: 'Illuminate', level: 1 },
};

if (typeof window !== 'undefined') window.SPELL_DEFS = SPELL_DEFS;
