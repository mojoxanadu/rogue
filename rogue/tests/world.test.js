// world.test.js — unit tests for Zone and World.

const test   = require('node:test');
const assert = require('node:assert/strict');
const { loadSrc } = require('./_harness');

function setup() {
  // World references Map (built-in JS) — preload entities.js because Zone
  // back-references entity.zone when adding entities.
  return loadSrc('entities.js', 'world.js');
}

// Lootable-aware setup. dropAt() and the corpses/lootables tests need
// the Lootable class loaded into the same context as Zone.
function setupWithLoot() {
  return loadSrc('items.js', 'entities.js', 'loot.js', 'world.js');
}


// ─── Zone ─────────────────────────────────────────────────────

test('Zone requires integer width and height >= 1', () => {
  const { Zone } = setup();
  // Missing dimensions
  assert.throws(() => new Zone(),                                />= 1/);
  assert.throws(() => new Zone({ width: 5 }),                    />= 1/);
  assert.throws(() => new Zone({ height: 5 }),                   />= 1/);
  // Zero — falsy under the old check, still rejected
  assert.throws(() => new Zone({ width: 0, height: 5 }),         />= 1/);
  assert.throws(() => new Zone({ width: 5, height: 0 }),         />= 1/);
  // Negative — truthy under the old check; new check rejects
  assert.throws(() => new Zone({ width: -3, height: 5 }),        />= 1/);
  assert.throws(() => new Zone({ width: 5, height: -1 }),        />= 1/);
  // Non-integer — also rejected
  assert.throws(() => new Zone({ width: 2.5, height: 5 }),       />= 1/);
  assert.throws(() => new Zone({ width: '5', height: 5 }),       />= 1/);
  // Valid: 1x1 is allowed
  assert.doesNotThrow(() => new Zone({ width: 1, height: 1 }));
});

test('Zone builds an empty tile grid by default', () => {
  const { Zone } = setup();
  const z = new Zone({ width: 3, height: 2 });
  assert.equal(z.width, 3);
  assert.equal(z.height, 2);
  assert.equal(z.tiles.length, 2);
  assert.equal(z.tiles[0].length, 3);
  assert.deepEqual(z.tiles, [[0,0,0],[0,0,0]]);
});

test('Zone.inBounds + tileAt', () => {
  const { Zone } = setup();
  const z = new Zone({ width: 3, height: 3, tiles: [[1,2,3],[4,5,6],[7,8,9]] });
  assert.equal(z.inBounds(0, 0), true);
  assert.equal(z.inBounds(2, 2), true);
  assert.equal(z.inBounds(3, 0), false);
  assert.equal(z.inBounds(-1, 0), false);
  assert.equal(z.tileAt(0, 0), 1);
  assert.equal(z.tileAt(1, 2), 8);
  assert.equal(z.tileAt(3, 0), -1);   // out of bounds → -1
});

test('Zone.add sets entity.zone back-reference', () => {
  const { Zone, Entity } = setup();
  const z = new Zone({ width: 5, height: 5 });
  const e = new Entity({ x: 1, y: 1 });
  z.add(e);
  assert.equal(z.entities.length, 1);
  assert.equal(e.zone, z);
});

test('Zone.remove clears the back-reference', () => {
  const { Zone, Entity } = setup();
  const z = new Zone({ width: 5, height: 5 });
  const e = new Entity({ x: 1, y: 1 });
  z.add(e);
  const removed = z.remove(e);
  assert.equal(removed, true);
  assert.equal(z.entities.length, 0);
  assert.equal(e.zone, null);
});

test('Zone.entitiesAt filters by tile coordinates', () => {
  const { Zone, Entity } = setup();
  const z = new Zone({ width: 5, height: 5 });
  z.add(new Entity({ x: 1, y: 1, icon: 'a' }));
  z.add(new Entity({ x: 1, y: 1, icon: 'b' }));
  z.add(new Entity({ x: 2, y: 2, icon: 'c' }));
  const at11 = z.entitiesAt(1, 1);
  assert.equal(at11.length, 2);
  // Compare icons individually (cross-realm deepEqual is finicky on arrays).
  const icons = at11.map(e => e.icon).sort();
  assert.equal(icons[0], 'a');
  assert.equal(icons[1], 'b');
  assert.equal(z.entitiesAt(0, 0).length, 0);
});


// ─── World ────────────────────────────────────────────────────

test('World.addZone requires a zone with an id', () => {
  const { World, Zone } = setup();
  const w = new World();
  const z = new Zone({ width: 3, height: 3 });
  assert.throws(() => w.addZone(z), /requires a Zone with an id/);
});

test('World.getActiveZone returns null when none set', () => {
  const { World } = setup();
  const w = new World();
  assert.equal(w.getActiveZone(), null);
});

test('World.setActiveZone requires a registered zone', () => {
  const { World, Zone } = setup();
  const w = new World();
  w.addZone(new Zone({ id: 'a', width: 3, height: 3 }));
  w.setActiveZone('a');
  assert.equal(w.getActiveZone().id, 'a');
  assert.throws(() => w.setActiveZone('b'), /not registered/);
});

test('World.updateCamera centers on LocalPlayer in WORLD coords', () => {
  const { World, Zone, LocalPlayer } = setup();
  const z = new Zone({ id: 'a', width: 20, height: 20 });   // worldX/Y default 0
  const lp = new LocalPlayer({ x: 5, y: 5 });
  z.add(lp);                                                // entity.zone = z
  const w = new World({ localPlayer: lp });
  w.addZone(z);
  w.setActiveZone('a');
  w.updateCamera(10, 10);
  // Player world pos = zone origin (0,0) + local (5,5) = world (5,5).
  // Centered camera: origin = (5 - 5, 5 - 5) = (0, 0).
  assert.equal(w.camera.x, 0);
  assert.equal(w.camera.y, 0);
});

test('World.updateCamera does NOT clamp — multi-zone composition can show void', () => {
  const { World, Zone, LocalPlayer } = setup();
  const z = new Zone({ id: 'a', width: 20, height: 20 });
  const lp = new LocalPlayer({ x: 18, y: 18 });
  z.add(lp);
  const w = new World({ localPlayer: lp });
  w.addZone(z);
  w.setActiveZone('a');
  w.updateCamera(10, 10);
  // Camera origin = world (18-5, 18-5) = (13, 13). No clamp, so the
  // right/bottom edge of the camera extends beyond the zone (showing
  // void at world x∈[20,23), y∈[20,23)).
  assert.equal(w.camera.x, 13);
  assert.equal(w.camera.y, 13);
});

test('World.updateCamera accounts for non-zero zone worldX/Y', () => {
  const { World, Zone, LocalPlayer } = setup();
  const z = new Zone({ id: 'a', width: 20, height: 20, worldX: 100, worldY: 50 });
  const lp = new LocalPlayer({ x: 5, y: 5 });
  z.add(lp);
  const w = new World({ localPlayer: lp });
  w.addZone(z);
  w.setActiveZone('a');
  w.updateCamera(10, 10);
  // Player world pos = (100 + 5, 50 + 5) = (105, 55). Camera origin = (100, 50).
  assert.equal(w.camera.x, 100);
  assert.equal(w.camera.y, 50);
});

test('World.visibleEntities(margin=0) is strictly inside the camera box', () => {
  const { World, Zone, Entity, LocalPlayer } = setup();
  const z  = new Zone({ id: 'a', width: 20, height: 20 });
  const lp = new LocalPlayer({ x: 5, y: 5 });
  z.add(lp);
  const w  = new World({ localPlayer: lp });
  w.addZone(z);
  w.setActiveZone('a');
  z.add(new Entity({ x: 5,  y: 5,  icon: 'in'  })); // center
  z.add(new Entity({ x: 9,  y: 9,  icon: 'in'  })); // corner just inside
  z.add(new Entity({ x: 0,  y: 0,  icon: 'in'  })); // top-left inside
  z.add(new Entity({ x: 10, y: 5,  icon: 'out' })); // x boundary (exclusive)
  z.add(new Entity({ x: 5,  y: 10, icon: 'out' })); // y boundary (exclusive)
  z.add(new Entity({ x: 15, y: 15, icon: 'out' })); // far outside
  w.updateCamera(10, 10);
  const labeled = w.visibleEntities(0).filter(e => e.icon === 'in' || e.icon === 'out');
  assert.equal(labeled.filter(e => e.icon === 'in').length,  3);
  assert.equal(labeled.filter(e => e.icon === 'out').length, 0);
});

test('World.visibleEntities() default margin includes just-off-camera entities', () => {
  const { World, Zone, Entity, LocalPlayer } = setup();
  const z  = new Zone({ id: 'a', width: 30, height: 30 });
  const lp = new LocalPlayer({ x: 5, y: 5 });
  z.add(lp);
  const w  = new World({ localPlayer: lp });
  w.addZone(z);
  w.setActiveZone('a');
  // Camera 10x10 centered on player at (5,5) → strict box [0,10)×[0,10).
  // Default entityMargin=4 expands to [-4,14)×[-4,14) in world coords.
  z.add(new Entity({ x: 12, y: 5, icon: 'edge' }));    // x=12: outside cam (10), inside +4 margin
  z.add(new Entity({ x: 5,  y: 13, icon: 'edge' }));   // y=13: outside cam (10), inside margin
  z.add(new Entity({ x: 14, y: 14, icon: 'far'  }));   // x=14, y=14: AT viewport edge (exclusive)
  z.add(new Entity({ x: 20, y: 20, icon: 'far'  }));   // beyond margin
  w.updateCamera(10, 10);
  // Default margin: 'edge' entities included, 'far' entities (at or beyond margin) excluded
  const def = w.visibleEntities().filter(e => e.icon === 'edge' || e.icon === 'far');
  assert.equal(def.filter(e => e.icon === 'edge').length, 2, 'just-off-camera entities included by default margin');
  assert.equal(def.filter(e => e.icon === 'far').length,  0, 'entities beyond margin excluded');
});

test('World.visibleEntities respects an explicit margin override', () => {
  const { World, Zone, Entity, LocalPlayer } = setup();
  const z  = new Zone({ id: 'a', width: 30, height: 30 });
  const lp = new LocalPlayer({ x: 5, y: 5 });
  z.add(lp);
  const w  = new World({ localPlayer: lp });
  w.addZone(z);
  w.setActiveZone('a');
  z.add(new Entity({ x: 19, y: 5, icon: 'far' }));     // x=19: outside default margin (14), inside margin=20
  w.updateCamera(10, 10);
  assert.equal(w.visibleEntities(0).filter(e => e.icon === 'far').length,   0);
  assert.equal(w.visibleEntities(15).filter(e => e.icon === 'far').length,  1);
});

test('World.entityViewport reflects camera + margin', () => {
  const { World, Zone, LocalPlayer } = setup();
  const z  = new Zone({ id: 'a', width: 20, height: 20 });
  const lp = new LocalPlayer({ x: 10, y: 10 });
  z.add(lp);
  const w  = new World({ localPlayer: lp, entityMargin: 3 });
  w.addZone(z);
  w.setActiveZone('a');
  w.updateCamera(10, 10);
  // Camera origin: world (10-5, 10-5) = (5, 5). With margin 3:
  // viewport [2, 18) × [2, 18).
  const v = w.entityViewport();
  assert.equal(v.left,   2);
  assert.equal(v.top,    2);
  assert.equal(v.right, 18);
  assert.equal(v.bottom, 18);
  // Explicit margin override
  const v0 = w.entityViewport(0);
  assert.equal(v0.left,   5);
  assert.equal(v0.right, 15);
});

test('World.visibleEntities composes across multiple zones', () => {
  const { World, Zone, Entity, LocalPlayer } = setup();
  // Two zones side by side: zA at world (0,0)..(10,10), zB at world (10,0)..(20,10).
  const zA = new Zone({ id: 'a', width: 10, height: 10, worldX: 0,  worldY: 0 });
  const zB = new Zone({ id: 'b', width: 10, height: 10, worldX: 10, worldY: 0 });
  const lp = new LocalPlayer({ x: 9, y: 5 });   // near zone A's east edge
  zA.add(lp);
  const w = new World({ localPlayer: lp });
  w.addZone(zA);
  w.addZone(zB);
  w.setActiveZone('a');
  zA.add(new Entity({ x: 8, y: 5, icon: 'A1' }));   // world (8, 5) — inside strict camera
  zA.add(new Entity({ x: 0, y: 0, icon: 'A2' }));   // world (0, 0) — outside strict, INSIDE default margin (x∈[0,18))
  zB.add(new Entity({ x: 0, y: 5, icon: 'B1' }));   // world (10, 5) — inside strict camera
  zB.add(new Entity({ x: 7, y: 5, icon: 'B2' }));   // world (17, 5) — outside strict (x≥14), INSIDE default margin (x<18)
  // Camera 10x10 centered on player at world (9, 5) → origin (4, 0).
  // Strict camera: x∈[4,14), y∈[0,10).
  // Default margin (4): x∈[0,18), y∈[-4,14).
  w.updateCamera(10, 10);
  const strict  = w.visibleEntities(0).filter(e => e.icon && e.icon.length === 2);
  const labels  = strict.map(e => e.icon).sort();
  assert.equal(labels.length, 2);
  assert.equal(labels[0], 'A1');
  assert.equal(labels[1], 'B1');
  // With default margin: A2 and B2 also visible (just-off-strict but inside margin)
  const wide   = w.visibleEntities().filter(e => e.icon && e.icon.length === 2);
  const wideLs = wide.map(e => e.icon).sort();
  assert.equal(wideLs.length, 4);
  assert.equal(wideLs.join(','), 'A1,A2,B1,B2');
});

test('World.visibleEntities returns empty list when camera misses every zone', () => {
  const { World, Zone, LocalPlayer } = setup();
  const z = new Zone({ id: 'a', width: 5, height: 5 });
  const lp = new LocalPlayer({ x: 0, y: 0 });
  z.add(lp);
  const w = new World({ localPlayer: lp });
  w.addZone(z);
  w.setActiveZone('a');
  w.updateCamera(2, 2);
  // Force camera far from any zone (well past default margin)
  w.camera.x = 100; w.camera.y = 100;
  assert.equal(w.visibleEntities().length, 0);
});


// ─── Zone.corpses ─────────────────────────────────────────────

test('Zone.corpses defaults to empty array', () => {
  const { Zone } = setup();
  const z = new Zone({ width: 5, height: 5 });
  assert.equal(z.corpses.length, 0);
});

test('Zone.addCorpse / removeCorpse', () => {
  const { Zone } = setup();
  const z = new Zone({ width: 5, height: 5 });
  const c1 = { x: 1, y: 2, name: 'rat' };
  const c2 = { x: 3, y: 4, name: 'bat' };
  z.addCorpse(c1);
  z.addCorpse(c2);
  assert.equal(z.corpses.length, 2);
  assert.equal(z.removeCorpse(c1), true);
  assert.equal(z.corpses.length, 1);
  assert.equal(z.corpses[0], c2);
  assert.equal(z.removeCorpse(c1), false, 'removing a corpse not present returns false');
});

test('Zone.corpsesAt filters by tile', () => {
  const { Zone } = setup();
  const z = new Zone({ width: 5, height: 5 });
  z.addCorpse({ x: 1, y: 2 });
  z.addCorpse({ x: 1, y: 2 });
  z.addCorpse({ x: 3, y: 4 });
  assert.equal(z.corpsesAt(1, 2).length, 2);
  assert.equal(z.corpsesAt(3, 4).length, 1);
  assert.equal(z.corpsesAt(0, 0).length, 0);
});


// ─── Zone.lootables ───────────────────────────────────────────

test('Zone.lootables defaults to empty array', () => {
  const { Zone } = setup();
  const z = new Zone({ width: 5, height: 5 });
  assert.equal(z.lootables.length, 0);
});

test('Zone.addLootable / removeLootable / lootablesAt', () => {
  const { Zone, Lootable } = setupWithLoot();
  const z = new Zone({ width: 5, height: 5 });
  const a = new Lootable({ ownerKind: 'floor',     x: 1, y: 1 });
  const b = new Lootable({ ownerKind: 'container', x: 2, y: 2 });
  const c = new Lootable({ ownerKind: 'floor',     x: 1, y: 1 }); // same tile as a
  z.addLootable(a);
  z.addLootable(b);
  z.addLootable(c);
  assert.equal(z.lootables.length, 3);
  assert.equal(z.lootablesAt(1, 1).length, 2);
  assert.equal(z.lootablesAt(2, 2).length, 1);
  assert.equal(z.lootablesAt(9, 9).length, 0);

  assert.equal(z.removeLootable(a), true);
  assert.equal(z.lootables.length, 2);
  assert.equal(z.lootablesAt(1, 1).length, 1);
  assert.equal(z.removeLootable(a), false, 'removing absent returns false');
});

test('Zone.dropAt creates a floor Lootable when none exists at that tile', () => {
  const { Zone, ItemStack, Lootable } = setupWithLoot();
  const z = new Zone({ width: 5, height: 5 });
  const stack = new ItemStack('gold', 5);
  const l = z.dropAt(2, 3, stack);
  assert.ok(l instanceof Lootable);
  assert.equal(l.ownerKind, 'floor');
  assert.equal(l.x, 2);
  assert.equal(l.y, 3);
  assert.equal(l.size(), 1);
  assert.equal(z.lootables.length, 1);
});

test('Zone.dropAt accumulates into the existing floor Lootable at same tile', () => {
  const { Zone, ItemStack } = setupWithLoot();
  const z = new Zone({ width: 5, height: 5 });
  z.dropAt(2, 3, new ItemStack('gold', 5));
  z.dropAt(2, 3, new ItemStack('key'));
  z.dropAt(2, 3, new ItemStack('cheese'));
  assert.equal(z.lootables.length, 1, 'one floor pile per tile, not three');
  assert.equal(z.lootables[0].size(), 3);
});

test('Zone.dropAt: different tiles get separate floor Lootables', () => {
  const { Zone, ItemStack } = setupWithLoot();
  const z = new Zone({ width: 5, height: 5 });
  z.dropAt(1, 1, new ItemStack('gold', 5));
  z.dropAt(2, 2, new ItemStack('key'));
  assert.equal(z.lootables.length, 2);
  assert.equal(z.lootablesAt(1, 1).length, 1);
  assert.equal(z.lootablesAt(2, 2).length, 1);
});

test('Zone.dropAt does NOT merge into a non-floor Lootable on same tile', () => {
  const { Zone, Lootable, ItemStack } = setupWithLoot();
  const z = new Zone({ width: 5, height: 5 });
  const chest = new Lootable({ ownerKind: 'container', x: 4, y: 4 });
  z.addLootable(chest);
  z.dropAt(4, 4, new ItemStack('gold'));
  assert.equal(z.lootables.length, 2, 'a chest and a floor pile coexist on the same tile');
  const floor = z.lootables.find(l => l.ownerKind === 'floor');
  assert.equal(floor.size(), 1);
  assert.equal(chest.size(), 0, 'gold did not bleed into the chest');
});
