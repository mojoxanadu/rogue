// ============================================================
//  WORLD MODEL  –  src/world.js
//
//  Zone: a rectangular tile area + its own entity list. Tiles are
//        plain integers (no tile class); entities render OVER tiles.
//  World: container of zones, knows the LocalPlayer, owns the
//        rendering camera. The view layer asks World for what to
//        draw and which entities are nearby — World composes the
//        answer from whichever zone(s) are currently visible.
//
//  Skeleton: API surface matches the eventual usage pattern but
//  single-zone semantics is fine for the legacy game; multi-zone
//  composition is the eventual goal flagged in walkVisible() and
//  visibleEntities() comments.
// ============================================================

// ─── Zone ───────────────────────────────────────────────────
/**
 * A rectangular tile area with an entity list. Tiles are stored
 * row-major: `tiles[y][x]` is the integer tile id.
 *
 * Visibility layers (darkMap, explored, visible) are per-zone and
 * live here rather than as parallel globals — the previous design
 * had them as top-level arrays.
 *
 * Entities are added via add(); the zone reference on the entity
 * is set automatically so callers don't have to remember.
 */
class Zone {
  constructor(spec = {}) {
    if (!Number.isInteger(spec.width)  || spec.width  < 1 ||
        !Number.isInteger(spec.height) || spec.height < 1) {
      throw new Error('Zone requires integer width and height >= 1');
    }
    this.id        = spec.id        ?? null;
    this.name      = spec.name      ?? '';
    this.width     = spec.width;
    this.height    = spec.height;
    // World-space origin: where this zone's local (0,0) sits in the
    // World coordinate system. Multi-zone composition stitches zones
    // together via these offsets. Single-zone games leave them at 0.
    this.worldX    = spec.worldX    ?? 0;
    this.worldY    = spec.worldY    ?? 0;
    this.tiles     = spec.tiles     ?? Zone._emptyGrid(spec.width, spec.height, 0);
    // CANONICAL entity list — every drawable on this zone's tiles lives
    // here: NPCs, Player, Corpse, Lootable (floor piles + containers +
    // doors as Phases 5+ land). Specialized accessors (`corpses`,
    // `lootables`) are filter getters over this list; mutators
    // (addCorpse, addLootable, dropAt, etc.) push here. Cross-list
    // duplication is forbidden — `entities` is the source of truth.
    this.entities  = spec.entities  ?? [];
    // Legacy spec.corpses/lootables (snapshots from before unification)
    // get folded into entities so old saves keep loading.
    if (Array.isArray(spec.corpses))   for (const c of spec.corpses)   this.entities.push(c);
    if (Array.isArray(spec.lootables)) for (const l of spec.lootables) this.entities.push(l);
    // Visibility layers — undefined means "not yet built"; consumers
    // (FOV code, render) initialize lazily.
    this.darkMap   = spec.darkMap   ?? null;
    this.explored  = spec.explored  ?? null;
    this.visible   = spec.visible   ?? null;
  }

  // ─── Filter getters over the unified entities list ──────────
  // Each call rebuilds a fresh array. Read-only — mutating the returned
  // array does NOT affect zone.entities. Use addCorpse/removeCorpse/
  // clearCorpses (and the lootable counterparts) for mutation.
  get corpses() {
    return this.entities.filter(e =>
      (typeof Corpse !== 'undefined' && e instanceof Corpse)
    );
  }
  get lootables() {
    return this.entities.filter(e =>
      (typeof Lootable !== 'undefined' && e instanceof Lootable)
    );
  }

  /** Convert a zone-local coordinate to world space. */
  localToWorld(x, y) {
    return { x: this.worldX + x, y: this.worldY + y };
  }

  /** Zone bounds in world space: [left, top, right, bottom) — exclusive end. */
  worldBounds() {
    return {
      left:   this.worldX,
      top:    this.worldY,
      right:  this.worldX + this.width,
      bottom: this.worldY + this.height,
    };
  }

  static _emptyGrid(w, h, fill) {
    const g = new Array(h);
    for (let y = 0; y < h; y++) g[y] = new Array(w).fill(fill);
    return g;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Tile id at (x, y); returns -1 if out of bounds. */
  tileAt(x, y) {
    return this.inBounds(x, y) ? this.tiles[y][x] : -1;
  }

  /** Add an entity to the zone, setting its back-reference. */
  add(entity) {
    if (!entity) return;
    entity.zone = this;
    this.entities.push(entity);
  }

  /** Remove an entity (by reference). Returns true if removed. */
  remove(entity) {
    const i = this.entities.indexOf(entity);
    if (i === -1) return false;
    this.entities.splice(i, 1);
    if (entity.zone === this) entity.zone = null;
    return true;
  }

  /** Entities at a specific tile (predicate-friendly). */
  entitiesAt(x, y) {
    return this.entities.filter(e => e && e.x === x && e.y === y);
  }

  // ─── Corpses ────────────────────────────────────────────────
  // Convenience wrappers around the unified entities list. addCorpse
  // pushes to entities; removeCorpse splices it; clearCorpses removes
  // every Corpse in one pass (replaces the legacy `corpses.length = 0`
  // mutation, which now silently fails since the corpses getter
  // returns a derived array).

  addCorpse(corpse) {
    if (!corpse) return;
    this.entities.push(corpse);
  }

  removeCorpse(corpse) {
    const i = this.entities.indexOf(corpse);
    if (i === -1) return false;
    this.entities.splice(i, 1);
    return true;
  }

  clearCorpses() {
    if (typeof Corpse === 'undefined') return;
    this.entities = this.entities.filter(e => !(e instanceof Corpse));
  }

  corpsesAt(x, y) {
    return this.corpses.filter(c => c && c.x === x && c.y === y);
  }

  // ─── Lootables (world-bound) ────────────────────────────────

  addLootable(lootable) {
    if (!lootable) return;
    this.entities.push(lootable);
  }

  removeLootable(lootable) {
    const i = this.entities.indexOf(lootable);
    if (i === -1) return false;
    this.entities.splice(i, 1);
    return true;
  }

  clearLootables() {
    if (typeof Lootable === 'undefined') return;
    this.entities = this.entities.filter(e => !(e instanceof Lootable));
  }

  lootablesAt(x, y) {
    return this.lootables.filter(l => l && l.x === x && l.y === y);
  }

  // ─── NPCs (Phase 6g, commit A: facade over the legacy `enemies`
  // global) ─────────────────────────────────────────────────────
  // The new API surface lives here; storage is still the bare global
  // for now so this commit ships zero behaviour change. Commit B
  // moves NPCs into this.entities and deletes the global, at which
  // point every call site already using zone.npcs/addNpc/removeNpc
  // follows automatically. Until then, callers can freely migrate
  // one site at a time without coordinating.

  get npcs() {
    return (typeof enemies !== 'undefined') ? enemies : [];
  }

  addNpc(npc) {
    if (!npc) return;
    if (typeof enemies !== 'undefined') enemies.push(npc);
  }

  removeNpc(npc) {
    if (typeof enemies === 'undefined') return false;
    const i = enemies.indexOf(npc);
    if (i === -1) return false;
    enemies.splice(i, 1);
    return true;
  }

  clearNpcs() {
    if (typeof enemies !== 'undefined') enemies.length = 0;
  }

  npcAt(x, y) {
    return this.npcs.find(n => n && n.x === x && n.y === y) || null;
  }

  findNpc(pred) {
    return this.npcs.find(pred) || null;
  }

  /** The (single) floor pile at (x,y) — null if none. There is at most
   *  one floor Lootable per tile; multiple items at one tile share its
   *  slots[]. Mirrors the find-or-create rule in dropAt(). */
  floorPileAt(x, y) {
    return this.entities.find(l =>
      (typeof Lootable !== 'undefined') && l instanceof Lootable &&
      l.ownerKind === 'floor' && l.x === x && l.y === y) || null;
  }

  /**
   * Find-or-create the floor Lootable at (x,y) and push `stack` into it.
   * "Floor" pile is anonymous loot lying on the ground (gold pile, item
   * dropped by the player, scatter from a decayed corpse). Multiple
   * stacks accumulate into a single floor Lootable per tile so the popup
   * renders one "Floor:" section per tile, not one per item.
   * Returns the Lootable.
   */
  dropAt(x, y, stack) {
    let l = this.floorPileAt(x, y);
    if (!l) {
      l = new Lootable({ ownerKind: 'floor', x, y });
      this.entities.push(l);
    }
    l.add(stack);
    return l;
  }
}


// ─── World ──────────────────────────────────────────────────
/**
 * Container of zones. Knows the LocalPlayer (the camera follows
 * them) and the currently active zone (where the player is).
 *
 * Zones are keyed by id. The active zone is the one containing
 * the LocalPlayer; multi-zone view composition (visibleEntities,
 * walkVisible) is reserved for cases where the camera straddles
 * a zone boundary or shows neighbors at once.
 */
class World {
  constructor(spec = {}) {
    this.zones        = new Map();   // id → Zone
    this.localPlayer  = spec.localPlayer ?? null;
    this.activeZoneId = spec.activeZoneId ?? null;
    // Tile-render viewport: what gets drawn this frame.
    this.camera       = { x: 0, y: 0, width: 0, height: 0 };
    // Entity-query viewport extends the camera by this margin (tiles) in
    // every direction. visibleEntities() uses the wider box so callers
    // see entities just off-screen — needed for AI ticking, transition
    // animations, asset preloading, etc. View-controller code that wants
    // a strict camera-only check should pass margin=0 explicitly.
    this.entityMargin = spec.entityMargin ?? World.DEFAULT_ENTITY_MARGIN;
  }

  addZone(zone) {
    if (!zone || zone.id == null) throw new Error('World.addZone requires a Zone with an id');
    this.zones.set(zone.id, zone);
    return zone;
  }

  getActiveZone() {
    return this.activeZoneId != null ? this.zones.get(this.activeZoneId) : null;
  }

  setActiveZone(id) {
    if (!this.zones.has(id)) throw new Error(`World.setActiveZone: zone '${id}' not registered`);
    this.activeZoneId = id;
  }

  /**
   * Update the camera viewport. Camera coords are in WORLD space.
   * Centers on the LocalPlayer's world position (their zone's
   * world origin plus their local position). No clamping —
   * multi-zone composition means the camera can straddle zone
   * boundaries or even show void at the edges of the world.
   * Callers wanting a "stay inside one zone" feel can override
   * this method.
   */
  updateCamera(viewWidthTiles, viewHeightTiles) {
    this.camera.width  = viewWidthTiles;
    this.camera.height = viewHeightTiles;
    const lp = this.localPlayer;
    if (!lp) return;
    const lpZone = lp.zone;
    const wx = (lpZone ? lpZone.worldX : 0) + lp.x;
    const wy = (lpZone ? lpZone.worldY : 0) + lp.y;
    this.camera.x = wx - Math.floor(viewWidthTiles  / 2);
    this.camera.y = wy - Math.floor(viewHeightTiles / 2);
  }

  /**
   * The entity-query viewport in world coords: the camera box
   * expanded by `margin` tiles on each side. Defaults to
   * this.entityMargin. Pass margin=0 to get the strict camera box.
   */
  entityViewport(margin = this.entityMargin) {
    const c = this.camera;
    return {
      left:   c.x - margin,
      top:    c.y - margin,
      right:  c.x + c.width  + margin,
      bottom: c.y + c.height + margin,
    };
  }

  /**
   * Entities currently within the entity-query viewport, collected
   * from every zone whose world bounds intersect it. Entity coords
   * are zone-local; we transform to world coords for the test.
   *
   * The default margin (this.entityMargin) makes this return entities
   * just off-screen too — needed for AI ticking, transition animations,
   * and asset preloading. Pass margin=0 to get a strict camera-only
   * query (e.g., for tile-render entity overlay).
   */
  visibleEntities(margin = this.entityMargin) {
    const v = this.entityViewport(margin);
    const result = [];
    for (const zone of this.zones.values()) {
      const zb = zone.worldBounds();
      // Skip zones that don't overlap the entity viewport at all.
      if (zb.right  <= v.left || zb.left >= v.right)  continue;
      if (zb.bottom <= v.top  || zb.top  >= v.bottom) continue;
      for (const e of zone.entities) {
        if (!e) continue;
        const ewx = zone.worldX + e.x;
        const ewy = zone.worldY + e.y;
        if (ewx >= v.left && ewx < v.right && ewy >= v.top && ewy < v.bottom) {
          result.push(e);
        }
      }
    }
    return result;
  }
}
World.DEFAULT_ENTITY_MARGIN = 4;


// Expose to the global concat scope.
window.Zone  = Zone;
window.World = World;
