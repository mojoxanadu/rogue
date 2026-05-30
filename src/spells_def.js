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
	illuminate: { name: 'Illuminate',   level: 1, duration: 50, radius: 5, desc: 'Light the darkness for a short time.' },
  unlock:     { name: 'Unlock',       level: 1, desc: 'Adds Cast Unlock option to locked doors and containers.' },
  lightning:  { name: 'Lightning',    level: 3 },
  fireball:   { name: 'Fireball',     level: 3 },
  haste:      { name: 'Haste',        level: 2 },
  heal:       { name: 'Heal',         level: 1 },
  icebolt:    { name: 'Ice Bolt',     level: 1 },
  shield:     { name: 'Shield',       level: 1 },
  strength:   { name: 'Strength',     level: 1 },
  portal:     { name: 'Town Portal',  level: 1 },

  // ── Level 1 spells (from raw/spells.txt) ─────────────────
  // Implement castSpell effects in mechanics.js

  // Burning Hands (item: Burning Gloves, equip-to-use).
  // castTime: 0.2, duration: 4.0, target: self/ally.
  // Effect: adds 1-6 (+Potent) heat damage to each melee hit for duration.
  // Potent scaling: +Potent to the heat damage roll.
  // Implementation: apply a condition "burningHands" that adds bonus heat
  // damage to player's melee attacks while active. Condition cooldown = 4.0.
  // When casting from equipped Burning Gloves: no MP cost, no learn needed;
  // item shows in quickslot list, or right-click/long-press on paper-doll uses it.
  // Duration is in game-seconds (4 ticks at 1.0 cooldown each).
  burningHands: { name: 'Burning Hands', level: 1, castTime: 0.2, duration: 4.0,
    desc: 'Briefly increase melee damage, adding 1-6 heat damage to each hit.' },

  // Cure Condition (items: Antitoxin, Antibiotic — consumables).
  // castTime: 5.0 / Potent, duration: instantaneous, target: self/ally.
  // Effect: adds "Cast Cure" option next to each condition in the detailed
  // conditions dialog (accessible by clicking any active condition icon).
  // Clicking the button spends 2 MP and removes the condition.
  // Potent scaling: castTime = 5.0 / Potent (min 1.0).
  // Implementation: when player has conditions, render a "Cast Cure" button
  // in the conditions tooltip or dialog. On click: if mp >= 2, deduct 2 MP,
  // remove the clicked condition. From item antitoxin/antibiotic: same effect
  // but no MP cost (item is consumed instead).
  cureCondition: { name: 'Cure Condition', level: 1, castTime: 5.0,
    desc: 'Adds Cast Cure option to remove each active condition.' },

  // Heal Wounds (items: various healing potions).
  // castTime: 1.0, duration: instantaneous, target: self/ally.
  // Effect: restores 2d6 +Potent HP.
  // Potent scaling: +Potent to the heal roll.
  // Implementation: roll 2d6, add Potent level, apply to player.hp.
  // From potion: use existing maxHeal / heal flow (already works).
  healWounds: { name: 'Heal Wounds', level: 1, castTime: 1.0,
    desc: 'Restores 2d6 + Potent HP.' },

  // Hinder (item: Smoke Bomb, consumable).
  // castTime: 1.0, duration: 6.0, AoE: circle radius 2 (+Potent) around caster.
  // Effect: all creatures except caster within range get -15% to-hit for duration.
  // Potent scaling: radius += Potent (e.g. Potent 3 → radius 5).
  // Implementation: apply "hinder" condition to each hostile NPC within
  // radius. Condition reduces their hit rate by 15%. Condition cooldown 6.0.
  // From Smoke Bomb: same effect, consumes the item, no MP cost.
  hinder: { name: 'Hinder', level: 1, castTime: 1.0, duration: 6.0, radius: 2,
    desc: 'All creatures except caster in a radius get -15% to-hit.' },

  // Necrotic Shroud (item: Necrotic Skin, equip on torso).
  // castTime: 4.0, duration: until used up or unconscious, target: self/ally.
  // Effect: inflicts NecroShroud condition with points = 8 +Potent.
  // When target takes corporal melee damage, half (rounded down) is absorbed
  // by the shroud and reflected back to the attacker. When points run out,
  // remaining damage leaks through and condition ends.
  // Potent scaling: +Potent to initial points.
  // Implementation (from spec): NecroShroud condition stores "points" value.
  // In takeDamage melee path: if target has NecroShroud && damage is corporal,
  //   halfDamage = floor(damage / 2)
  //   reflected = min(halfDamage, shroudPoints)
  //   shroudPoints -= reflected
  //   attacker takes reflected damage (reflection, not thorns — no save)
  //   return damage - reflected (leak-through to original target)
  //   if shroudPoints <= 0: remove condition
  // From Necrotic Skin: same effect, equipped item gives the spell; points
  // reset on waking from sleep.
  necroticShroud: { name: 'Necrotic Shroud', level: 1, castTime: 4.0,
    desc: 'Inflicts NecroShroud that reflects melee damage back to the attacker.' },

  // Nourish (items: any food consumables).
  // castTime: 4.0, duration: 40.0 (spell cooldown, can't recast), target: self/ally.
  // Effect: removes 10%-30% +Potent*10 of target's hunger.
  // Potent scaling: +Potent*10 to the percentage removed.
  // Implementation: calculate reduction = clamp(0.1 + random(0,0.2) + Potent*0.1, ...),
  // apply to player hunger. Set spell cooldown of 40.0 on player so recast
  // is blocked until it expires. From food: existing eat flow handles hunger
  // (already works via foodValue).
  nourish: { name: 'Nourish', level: 1, castTime: 4.0, duration: 40.0,
    desc: 'Removes hunger (10%-30% +Potent*10).' },
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
  burningHands: '\uD83D\uDD25',
  cureCondition: '\uD83D\uDC8A',
  healWounds: '\uD83D\uDC9A',
  hinder:     '\uD83D\uDCA8',
  necroticShroud: '\u2620\uFE0F',
  nourish:    '\uD83C\uDF4E',
};

if (typeof window !== 'undefined') {
  window.SPELL_DEFS = SPELL_DEFS;
  window.SPELL_ICONS = SPELL_ICONS;
}
