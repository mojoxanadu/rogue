  /*
  MAP MODULE – PROCEDURAL GENERATION AND SCENE MANAGEMENT
  ========================================================
  This module handles the creation and initialization of game levels, including
  procedurally generated dungeons, themed outdoor scenes (desert, beach, mountain),
  and the central town hub. It defines tile layouts, spawns monsters and items,
  and sets up special Monty Python‑themed encounters.

  Key responsibilities:
  1. Map generation (initMap) – creates tile grids based on current scene and level
  2. Scene management – dungeon, town, desert, beach, mountain, forest, castle themes
  3. Procedural algorithms – binary space partitioning for room‑and‑corridor dungeons
  4. Special level layouts – Tristram town, desert trial (Bridge of Death, Black Knight)
  5. Spawn logic – monsters, loot, stairs, NPCs, quest items (Holy Hand Grenade)
  6. Utility functions – getRandomFloor, getDeadEndWall, spawnMonsters, spawnLoot

  The functions here are called when the player descends/ascends stairs (engine.js),
  from the start button (input.js), and from debug warp commands. They populate the
  global theMap, darkMap, explored, visible, enemies, and itemsOnGround arrays.
*/
// === Map Generation (v7.2.0) ===

  function getDeadEndWall() {
    let candidates = [];
    for(let y=1; y<mapH-1; y++) {
      for(let x=1; x<mapW-1; x++) {
        if(theMap[y][x] === TILES.WALL) {
          let floors = 0;
          if(theMap[y-1] && isTileFloor(theMap[y-1][x])) floors++;
          if(theMap[y+1] && isTileFloor(theMap[y+1][x])) floors++;
          if(isTileFloor(theMap[y][x-1])) floors++;
          if(isTileFloor(theMap[y][x+1])) floors++;
          if(floors === 1) candidates.push({x,y});
        }
      }
    }
    return candidates.length > 0 ? candidates[Math.floor(Math.random()*candidates.length)] : {x:5,y:5};
  }

  // Returns a dead-end wall tile that is at least minDist (Manhattan) from all positions in excludeList
  function getDeadEndWallFarFrom(excludeList, minDist) {
    let candidates = [];
    for(let y=1; y<mapH-1; y++) {
      for(let x=1; x<mapW-1; x++) {
        if(theMap[y][x] === TILES.WALL) {
          let floors = 0;
          if(theMap[y-1] && isTileFloor(theMap[y-1][x])) floors++;
          if(theMap[y+1] && isTileFloor(theMap[y+1][x])) floors++;
          if(isTileFloor(theMap[y][x-1])) floors++;
          if(isTileFloor(theMap[y][x+1])) floors++;
          if(floors === 1) {
            let tooClose = excludeList.some(p => Math.abs(p.x - x) + Math.abs(p.y - y) < minDist);
            if(!tooClose) candidates.push({x, y});
          }
        }
      }
    }
    // Fallback: if no candidate far enough, use the farthest available
    if(candidates.length === 0) {
      let allCandidates = [];
      for(let y=1; y<mapH-1; y++) {
        for(let x=1; x<mapW-1; x++) {
          if(theMap[y][x] === TILES.WALL) {
            let floors = 0;
            if(theMap[y-1] && isTileFloor(theMap[y-1][x])) floors++;
            if(theMap[y+1] && isTileFloor(theMap[y+1][x])) floors++;
            if(isTileFloor(theMap[y][x-1])) floors++;
            if(isTileFloor(theMap[y][x+1])) floors++;
            if(floors === 1) allCandidates.push({x, y});
          }
        }
      }
      if(allCandidates.length === 0) return {x:5, y:5};
      // Pick the one with the greatest minimum distance to any exclude position
      if(excludeList.length === 0) return allCandidates[Math.floor(Math.random() * allCandidates.length)];
      allCandidates.sort((a, b) => {
        let minA = Math.min(...excludeList.map(p => Math.abs(p.x-a.x)+Math.abs(p.y-a.y)));
        let minB = Math.min(...excludeList.map(p => Math.abs(p.x-b.x)+Math.abs(p.y-b.y)));
        return minB - minA;
      });
      return allCandidates[0];
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function carveFloorPad(cx, cy, radius = 1) {
    for(let y = cy - radius; y <= cy + radius; y++) {
      for(let x = cx - radius; x <= cx + radius; x++) {
        if(x > 0 && x < mapW - 1 && y > 0 && y < mapH - 1 && theMap[y][x] !== TILES.LEFTYS && theMap[y][x] !== TILES.STORE && theMap[y][x] !== TILES.BOOKSTORE) {
          theMap[y][x] = TILES.FLOOR;
        }
      }
    }
  }

  function findNearbyFloorTile(originX, originY, maxDist = 4, exclude = new Set()) {
    for(let dist = 1; dist <= maxDist; dist++) {
      for(let dy = -dist; dy <= dist; dy++) {
        for(let dx = -dist; dx <= dist; dx++) {
          if(Math.abs(dx) + Math.abs(dy) > dist) continue;
          let x = originX + dx, y = originY + dy;
          if(x < 1 || x >= mapW - 1 || y < 1 || y >= mapH - 1) continue;
          if(exclude.has(`${x},${y}`)) continue;
          if(isTileFloor(theMap[y][x])) return { x, y };
        }
      }
    }
    return null;
  }

  // E.TRIST.3: Expand town into larger overworld map
  function expandTownOverworld(town) {
    const TW = 120, TH = 90; // overworld size
    const ox = Math.floor((TW - town.mapW) / 2); // offset to center town
    const oy = Math.floor((TH - town.mapH) / 2);

    // Create full overworld map
    let overworld = Array(TH).fill().map(() => Array(TW).fill(TILES.GRASS));

    // Simple value noise for terrain variation
    function vnoise(x, y) {
      let n = (x * 374761393 + y * 668265263) >>> 0;
      n = (n ^ (n >>> 13)) * 1274126177;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    }
    // Fractal noise (2 octaves)
    function fbm(x, y) {
      return (vnoise(x, y) * 0.6 + vnoise(x * 2.1 + 100, y * 2.1 + 100) * 0.4);
    }

    // Step 1: Fill base terrain with grass, trees, and fields
    for(let y = 0; y < TH; y++) {
      for(let x = 0; x < TW; x++) {
        // Skip town area
        if(x >= ox && x < ox + town.mapW && y >= oy && y < oy + town.mapH) continue;

        // Irregular boundary — dense impassable at edges
        const edgeDistX = Math.min(x, TW - 1 - x);
        const edgeDistY = Math.min(y, TH - 1 - y);
        const edgeDist = Math.min(edgeDistX, edgeDistY);
        const edgeNoise = vnoise(x * 3, y * 3) * 6;
        if(edgeDist + edgeNoise < 4) {
          overworld[y][x] = vnoise(x, y) > 0.3 ? TILES.WALL : TILES.TREE;
          continue;
        }

        // Distance from town center
        const tcx = ox + Math.floor(town.mapW / 2);
        const tcy = oy + Math.floor(town.mapH / 2);
        const distToTown = Math.hypot(x - tcx, y - tcy);

        // Forest density increases with distance from town
        const forestThreshold = 0.55 - distToTown * 0.001;
        const n = fbm(x * 0.15, y * 0.15);

        // Crop fields in a band south and east of town
        const fieldBand = (y > oy + town.mapH + 2 && y < oy + town.mapH + 20 && x > ox - 5 && x < ox + town.mapW + 15);
        const fieldPattern = vnoise(x * 0.8, y * 0.8) > 0.4;

        const clusterNoise = fbm(x * 0.06 + 17, y * 0.06 - 31);

        if(fieldBand && fieldPattern && distToTown < 40) {
          // Crop field — use FLOOR with bush as crop decoration
          overworld[y][x] = vnoise(x * 2, y * 2) > 0.7 ? TILES.BUSH : TILES.GRASS;
        } else if(n > forestThreshold && edgeDist > 8) {
          // Dense forest clumps
          if(clusterNoise > 0.62) {
            overworld[y][x] = TILES.TREE;
          } else {
            overworld[y][x] = vnoise(x * 5, y * 5) > 0.6 ? TILES.TREE : (vnoise(x, y) > 0.5 ? TILES.BUSH : TILES.GRASS);
          }
        } else if(n > forestThreshold - 0.1) {
          // Light forest — small copses and occasional lone trees
          if(clusterNoise > 0.7) overworld[y][x] = TILES.TREE;
          else if(clusterNoise > 0.64) overworld[y][x] = vnoise(x * 4, y * 4) > 0.45 ? TILES.TREE : TILES.BUSH;
          else overworld[y][x] = vnoise(x * 3, y * 3) > 0.82 ? TILES.TREE : TILES.GRASS;
        } else {
          // Open grassland
          overworld[y][x] = vnoise(x * 4, y * 4) > 0.85 ? TILES.BUSH : TILES.GRASS;
        }
      }
    }

    // Step 2: Carve paths from town gate southward and eastward
    const gateX = ox + Math.floor(town.mapW / 2);
    const gateY = oy + town.mapH; // just south of town

    // Main path south from gate
    let px = gateX, py = gateY;
    for(let step = 0; step < TH - gateY - 5; step++) {
      // Gentle wander
      const wander = Math.round((vnoise(step * 7, 0) - 0.5) * 1.5);
      px = Math.max(4, Math.min(TW - 5, gateX + wander));
      for(let dx = -1; dx <= 1; dx++) {
        const mx = px + dx;
        if(mx >= 0 && mx < TW && py >= 0 && py < TH) {
          if(overworld[py][mx] !== TILES.WALL) overworld[py][mx] = TILES.FLOOR;
        }
      }
      py++;
    }

    // Secondary path east from town
    let epx = ox + town.mapW, epy = oy + Math.floor(town.mapH / 2);
    for(let step = 0; step < TW - epx - 5; step++) {
      const wander = Math.round((vnoise(0, step * 7) - 0.5) * 1.5);
      epy = Math.max(4, Math.min(TH - 5, oy + Math.floor(town.mapH / 2) + wander));
      for(let dy = -1; dy <= 1; dy++) {
        const my = epy + dy;
        if(my >= 0 && my < TH && epx >= 0 && epx < TW) {
          if(overworld[my][epx] !== TILES.WALL) overworld[my][epx] = TILES.FLOOR;
        }
      }
      epx++;
    }

    // Step 3: Carve streams
    // Stream from northwest, curves through forest
    let sx = 5, sy = 5;
    for(let step = 0; step < 80; step++) {
      sx += 1;
      sy += Math.round(Math.sin(step * 0.3) * 1.2);
      sy = Math.max(3, Math.min(TH - 4, sy));
      for(let dy = -1; dy <= 0; dy++) {
        const my = sy + dy;
        if(my >= 0 && my < TH && sx >= 0 && sx < TW) {
          overworld[my][sx] = TILES.WATER;
        }
      }
    }

    // Step 4: Place town map into overworld
    for(let y = 0; y < town.mapH; y++) {
      for(let x = 0; x < town.mapW; x++) {
        overworld[oy + y][ox + x] = town.map[y][x];
      }
    }

    // Step 5: Adjust NPC positions to overworld coordinates
    town.enemies.forEach(e => {
      e.x += ox;
      e.y += oy;
      if(Array.isArray(e.patrolPath) && e.patrolPath.length > 0) {
        e.patrolPath = e.patrolPath.map(p => ({ x: p.x + ox, y: p.y + oy }));
      }
    });

    // Track embedded Tristram bounds inside the outworld map.
    window._tristramBounds = { x1: ox, y1: oy, x2: ox + town.mapW - 1, y2: oy + town.mapH - 1 };

    const absGateX = ox + gateX;
    const absGateY = oy + gateY;

    // B.757/B.759: keep muck peasants outside Tristram walls in the south fields.
    let peasantIdx = 0;
    town.enemies.forEach(e => {
      if(e.type !== 'muck_peasant') return;
      const px = absGateX + (peasantIdx % 2 === 0 ? -7 : 7);
      const py = absGateY + 3 + peasantIdx;
      e.x = Math.max(2, Math.min(TW - 3, px));
      e.y = Math.max(absGateY + 2, Math.min(TH - 3, py));
      e.patrolPath = [
        { x: e.x, y: e.y },
        { x: e.x + 2, y: e.y },
        { x: e.x + 2, y: e.y + 1 },
        { x: e.x, y: e.y + 1 }
      ];
      e.patrolIndex = 0;
      peasantIdx++;
    });

    function setWalkableTile(x, y) {
      if(x < 0 || x >= TW || y < 0 || y >= TH) return;
      const t = overworld[y][x];
      if(t === TILES.STORE || t === TILES.LEFTYS || t === TILES.BOOKSTORE || t === TILES.FORGE || t === TILES.HALL) return;
      overworld[y][x] = TILES.FLOOR;
    }

    function carvePath(x1, y1, x2, y2, halfWidth) {
      let x = x1, y = y1;
      while(x !== x2) {
        x += Math.sign(x2 - x);
        for(let wy = -halfWidth; wy <= halfWidth; wy++) setWalkableTile(x, y + wy);
      }
      while(y !== y2) {
        y += Math.sign(y2 - y);
        for(let wx = -halfWidth; wx <= halfWidth; wx++) setWalkableTile(x + wx, y);
      }
    }

    // Step 6: Add ambiance objects (houses, huts) scattered in open areas
    const ambianceSpots = [];
    for(let i = 0; i < 15; i++) {
      const ax = Math.floor(vnoise(i * 137, i * 251) * (TW - 20)) + 10;
      const ay = Math.floor(vnoise(i * 311, i * 173) * (TH - 20)) + 10;
      // Don't place on town, paths, water, or walls
      if(ax >= ox - 2 && ax < ox + town.mapW + 2 && ay >= oy - 2 && ay < oy + town.mapH + 2) continue;
      if(overworld[ay][ax] === TILES.WALL || overworld[ay][ax] === TILES.WATER || overworld[ay][ax] === TILES.ROCK) continue;
      if(overworld[ay][ax] === TILES.TREE) {
        overworld[ay][ax] = TILES.GRASS; // clear a spot
      }
      ambianceSpots.push({x: ax, y: ay});
    }

    // Store ambiance data for rendering
    window._overworldAmbiance = ambianceSpots.map((s, i) => {
      const types = ['🏠','🛖','🏚️','⛪','🛖','🏠'];
      return { x: s.x, y: s.y, emoji: types[i % types.length], scale: 2 + Math.floor(vnoise(i * 77, i * 99) * 8) };
    });

    // E.TRIST.MENDED_DRUM: Place The Mended Drum at far east edge
    const drumX = TW - 12, drumY = Math.floor(TH / 2);
    // Carve a small clearing
    for(let dy = -2; dy <= 2; dy++) {
      for(let dx = -2; dx <= 2; dx++) {
        const mx = drumX + dx, my = drumY + dy;
        if(mx >= 0 && mx < TW && my >= 0 && my < TH) {
          overworld[my][mx] = (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) ? TILES.FLOOR : TILES.GRASS;
        }
      }
    }
    overworld[drumY][drumX] = TILES.STORE;
    window._mendedDrumX = drumX;
    window._mendedDrumY = drumY;
    // Place Mended Drum NPCs
    town.enemies.push({
      x: drumX - 1, y: drumY - 1, type: "mended_drum_barman",
      stats: { icon: '🧔', hp: 999, maxHp: 999, dmg: 0, hit: 0, crit: 0, dodge: 0, speed: 0, throughWalls: false, passive: true, quest: true },
      actionTimer: 0, isQuestNPC: true, _stayInShop: true
    });

    // Ensure guaranteed clear routes from town gate to key buildings and Mended Drum
    const gateInsideX = absGateX;
    const gateInsideY = absGateY - 1;
    const keyBuildingTiles = new Set([TILES.STORE, TILES.LEFTYS, TILES.BOOKSTORE, TILES.FORGE, TILES.HALL]);
    const buildingTargets = [];
    for(let y = oy; y < oy + town.mapH; y++) {
      for(let x = ox; x < ox + town.mapW; x++) {
        if(keyBuildingTiles.has(overworld[y][x])) buildingTargets.push({ x, y });
      }
    }
    buildingTargets.forEach(t => carvePath(gateInsideX, gateInsideY, t.x, t.y, 1));
    carvePath(gateInsideX, gateInsideY, drumX, drumY, 1);

    // E.HAMLET: Route Rosencrantz & Guildenstern between gate and Mended Drum.
    const rosen = town.enemies.find(e => e && e.type === 'rosencrantz_guildenstern');
    if(rosen) {
      const tx = drumX - 1;
      const ty = drumY;
      const patrol = [];
      let px = gateInsideX;
      let py = gateInsideY;
      patrol.push({ x: px, y: py });
      while(px !== tx) {
        px += Math.sign(tx - px);
        patrol.push({ x: px, y: py });
      }
      while(py !== ty) {
        py += Math.sign(ty - py);
        patrol.push({ x: px, y: py });
      }
      for(let i = patrol.length - 2; i >= 0; i--) {
        patrol.push({ x: patrol[i].x, y: patrol[i].y });
      }
      rosen.x = patrol[0].x;
      rosen.y = patrol[0].y;
      rosen.patrolPath = patrol;
      rosen.patrolIndex = 0;
      rosen.isSceneNPC = true;
      rosen._sceneMoveCooldown = 0;
    }

    // Reduce Tristram outworld tree density by 75%
    for(let y = 0; y < TH; y++) {
      for(let x = 0; x < TW; x++) {
        const inTownRect = x >= ox && x < ox + town.mapW && y >= oy && y < oy + town.mapH;
        if(inTownRect) continue;
        if(overworld[y][x] === TILES.TREE && vnoise(x * 13 + 7, y * 13 + 19) < 0.75) {
          overworld[y][x] = vnoise(x * 5 + 1, y * 5 + 3) > 0.78 ? TILES.BUSH : TILES.GRASS;
        }
      }
    }

    // B756.TRISTRAM_TREES: finalize forest clustering.
    // 1) Remove isolated trees near town roads/walls.
    // 2) Grow a few intentional copses farther out.
    const tcx = ox + Math.floor(town.mapW / 2);
    const tcy = oy + Math.floor(town.mapH / 2);
    const dirs8 = [
      [-1,-1],[0,-1],[1,-1],
      [-1,0],        [1,0],
      [-1,1], [0,1], [1,1]
    ];

    for(let y = 1; y < TH - 1; y++) {
      for(let x = 1; x < TW - 1; x++) {
        if(overworld[y][x] !== TILES.TREE) continue;
        const inTownRect = x >= ox && x < ox + town.mapW && y >= oy && y < oy + town.mapH;
        if(inTownRect) continue;
        const distToTown = Math.hypot(x - tcx, y - tcy);
        let treeNeighbors = 0;
        for(const [dx, dy] of dirs8) {
          if(overworld[y + dy][x + dx] === TILES.TREE) treeNeighbors++;
        }
        // Keep town approaches open and remove lonely blocker trees.
        if((distToTown < 26 && treeNeighbors < 3) || treeNeighbors <= 1) {
          overworld[y][x] = vnoise(x * 9 + 3, y * 9 + 11) > 0.6 ? TILES.BUSH : TILES.GRASS;
        }
      }
    }

    // Stamp occasional compact copses away from town center.
    for(let i = 0; i < 8; i++) {
      const cx = 8 + Math.floor(vnoise(i * 113, i * 41) * (TW - 16));
      const cy = 8 + Math.floor(vnoise(i * 59, i * 97) * (TH - 16));
      if(Math.hypot(cx - tcx, cy - tcy) < 30) continue;
      const r = 2 + Math.floor(vnoise(i * 17, i * 23) * 3); // 2..4
      for(let y = cy - r; y <= cy + r; y++) {
        for(let x = cx - r; x <= cx + r; x++) {
          if(x < 1 || x >= TW - 1 || y < 1 || y >= TH - 1) continue;
          const inTownRect = x >= ox && x < ox + town.mapW && y >= oy && y < oy + town.mapH;
          if(inTownRect) continue;
          if(overworld[y][x] === TILES.WATER || overworld[y][x] === TILES.WALL || overworld[y][x] === TILES.FLOOR) continue;
          const d = Math.hypot(x - cx, y - cy);
          if(d <= r && vnoise(x * 5 + i * 19, y * 5 + i * 31) > 0.25) {
            overworld[y][x] = TILES.TREE;
          }
        }
      }
    }

    // Spawn pixies in outworld copses near Tristram (outside town walls).
    if(MONSTER_DEF && MONSTER_DEF['pixie']) {
      const pixieCandidates = [];
      for(let y = 2; y < TH - 2; y++) {
        for(let x = 2; x < TW - 2; x++) {
          const inTownRect = x >= ox && x < ox + town.mapW && y >= oy && y < oy + town.mapH;
          if(inTownRect) continue;
          const t = overworld[y][x];
          if(!(t === TILES.GRASS || t === TILES.BUSH || t === TILES.FLOOR)) continue;
          const wallDx = x < ox ? (ox - x) : (x > ox + town.mapW - 1 ? x - (ox + town.mapW - 1) : 0);
          const wallDy = y < oy ? (oy - y) : (y > oy + town.mapH - 1 ? y - (oy + town.mapH - 1) : 0);
          const distToWall = Math.hypot(wallDx, wallDy);
          if(distToWall < 30 || distToWall > 70) continue;
          let treeNeighbors = 0;
          for(const [dx, dy] of dirs8) {
            if(overworld[y + dy][x + dx] === TILES.TREE) treeNeighbors++;
          }
          if(treeNeighbors >= 3) pixieCandidates.push({ x, y });
        }
      }
      // Deterministic spread without introducing additional RNG variance.
      const desiredPixies = 3;
      for(let i = 0; i < desiredPixies && pixieCandidates.length > 0; i++) {
        const idx = Math.floor(vnoise(i * 41 + 7, i * 97 + 13) * pixieCandidates.length);
        const p = pixieCandidates.splice(idx, 1)[0];
        town.enemies.push({ x: p.x, y: p.y, type: 'pixie', stats: { ...MONSTER_DEF['pixie'] }, actionTimer: 0, isSceneNPC: true });
      }
    }

    // Final safety pass: no pixies/peasants inside Tristram walls.
    const insideTown = (x, y) => x >= ox && x < ox + town.mapW && y >= oy && y < oy + town.mapH;
    let outsideFieldIdx = 0;
    town.enemies.forEach(e => {
      if(!insideTown(e.x, e.y)) return;
      if(e.type === 'muck_peasant') {
        const ex = absGateX + (outsideFieldIdx % 2 === 0 ? -8 : 8);
        const ey = absGateY + 3 + outsideFieldIdx;
        e.x = Math.max(2, Math.min(TW - 3, ex));
        e.y = Math.max(absGateY + 2, Math.min(TH - 3, ey));
        e.patrolPath = [
          { x: e.x, y: e.y },
          { x: e.x + 2, y: e.y },
          { x: e.x + 2, y: e.y + 1 },
          { x: e.x, y: e.y + 1 }
        ];
        e.patrolIndex = 0;
        outsideFieldIdx++;
      } else if(e.type === 'pixie') {
        const copse = [];
        for(let y = absGateY + 2; y < TH - 2; y++) {
          for(let x = 2; x < TW - 2; x++) {
            if(insideTown(x, y)) continue;
            const wallDx = x < ox ? (ox - x) : (x > ox + town.mapW - 1 ? x - (ox + town.mapW - 1) : 0);
            const wallDy = y < oy ? (oy - y) : (y > oy + town.mapH - 1 ? y - (oy + town.mapH - 1) : 0);
            if(Math.hypot(wallDx, wallDy) < 30) continue;
            if(!(overworld[y][x] === TILES.GRASS || overworld[y][x] === TILES.BUSH || overworld[y][x] === TILES.FLOOR)) continue;
            let tn = 0;
            for(const [dx, dy] of dirs8) if(overworld[y + dy][x + dx] === TILES.TREE) tn++;
            if(tn >= 3) copse.push({ x, y });
          }
        }
        if(copse.length > 0) {
          const p = copse[Math.floor(vnoise(e.x * 17 + 1, e.y * 17 + 9) * copse.length)];
          e.x = p.x; e.y = p.y;
        }
      }
    });

    // E760.PEASANTS: ensure peasants exist in outside grass fields.
    const livePeasants = town.enemies.filter(e => e.type === 'muck_peasant');
    if(livePeasants.length < 3) {
      const candidates = [];
      for(let y = absGateY + 2; y < TH - 2; y++) {
        for(let x = 2; x < TW - 2; x++) {
          if(insideTown(x, y)) continue;
          if(overworld[y][x] !== TILES.GRASS) continue;
          candidates.push({x,y});
        }
      }
      while(livePeasants.length < 3 && candidates.length > 0) {
        const idx = Math.floor(vnoise(livePeasants.length * 37 + 11, livePeasants.length * 53 + 19) * candidates.length);
        const p = candidates.splice(idx, 1)[0];
        const peasant = {
          x: p.x, y: p.y,
          type: 'muck_peasant',
          stats: {...MONSTER_DEF['muck_peasant']},
          actionTimer: 0, isQuestNPC: true, isSceneNPC: true,
          patrolPath: [{x:p.x,y:p.y},{x:p.x+1,y:p.y},{x:p.x+1,y:p.y+1},{x:p.x,y:p.y+1}],
          patrolIndex: 0, _sceneMoveCooldown: Math.floor(Math.random() * 5)
        };
        town.enemies.push(peasant);
        livePeasants.push(peasant);
      }
    }

    // Ensure spawn is inside town walls near center, on a walkable tile
    const preferredSpawn = { x: ox + 17, y: oy + 14 };
    let spawn = null;
    if(isTileFloor(overworld[preferredSpawn.y] && overworld[preferredSpawn.y][preferredSpawn.x])) {
      spawn = preferredSpawn;
    } else {
      for(let radius = 1; radius <= 20 && !spawn; radius++) {
        for(let dy = -radius; dy <= radius && !spawn; dy++) {
          for(let dx = -radius; dx <= radius && !spawn; dx++) {
            const sx = preferredSpawn.x + dx;
            const sy = preferredSpawn.y + dy;
            if(sx < ox + 1 || sx >= ox + town.mapW - 1 || sy < oy + 1 || sy >= oy + town.mapH - 1) continue;
            if(isTileFloor(overworld[sy] && overworld[sy][sx])) spawn = { x: sx, y: sy };
          }
        }
      }
    }
    if(spawn) { player.x = spawn.x; player.y = spawn.y; }

    // Update gate position reference
    window._townGateX = absGateX;
    window._townGateY = absGateY - 1;

    town.map = overworld;
    town.mapW = TW;
    town.mapH = TH;
    return town;
  }
  function mapgenTown(townId) {
    // Tristram Hub + adjoining overworld field
    let town = { enemies: [], map: [], mapW: 35, mapH: 29, townId: 1 };
    player.x = 17; player.y = 14;

    // Hard-coded grid for now.
    town.map = Array(town.mapH).fill().map(()=>Array(town.mapW).fill(TILES.GRASS));
    const tristMap = [
      "wwwwwwwwwwwwwwwwwwwwwwwwwwwAAwwwwww",
      "wgggggggggggggggggggggggggAAgggrrrr",
      "wgggggggfffgTgggggggggAAAAAggggrfXr",
      "wggggggTf4fffggggggggAAgggggggggffr",
      "wgggggggfffTfggggggggAgggggggggffrr",
      "wggTggTgggggfggggggggAgggggggggfggw",
      "wgggfffgggggfggggggggAAggggggggfggw",
      "wgggf3ffffffffggggggggAgggggggfgggw",
      "wgggfffTgggggfggggggggAAgggggfggggw",
      "wgggTfgggggggffggggggggAggggTfggTgw",
      "wggggfgggggggffggggggggAgggggfffggw",
      "wggggfgggrrrrffrrrrgggAAgggggf5fggw",
      "wggggfgggrggggggggrgggAggggTffffggw",
      "wggggfgggrggggggggrgggAgggggfgggTggw",
      "wggggfffffggg1ggggffffBffffffgggggw",
      "wgggffffffggggggggffffBfffffffffggw",
      "wgggfggggrggggggggrgggAgggggggggggw",
      "wggggggggrggggggggrgggAAggggggggggw",
      "wggggggggrrrrffrrrrggggAggggggggggw",
      "wggggggggggggffggggggggAAggggggggggw",
      "wggggggggggggffggfTgggggAgggggggggw",
      "wggggggggggggfffff2gggggAgggggggggw",
      "wggrrrgrrrgggggggfffgggAAgggggggggw",
      "wggrgggggrgggggggggggAAAggggggggggw",
      "wggrgggcgrggggggggggAAggggggggggggw",
      "wggrgcgggrggggggggggAgggggggggggggw",
      "wggrrrrrrrggggggggggAgggggggggggggw",
      "wgggggggggggggggggggAAggggggggggggw",
      "wwwwwwwwwwwwwwwwwwwwwAwwwwwwwwwwwww",
    ];
    for(let y=0; y<town.mapH; y++) for(let x=0; x<town.mapW; x++) {
      let t = TILES.GRASS;
      switch(tristMap[y][x]) {
        case 'g': t = (Math.random() < 0.05 ? TILES.BUSH : TILES.GRASS); break;
        case 'w': t = TILES.WALL; break;
        case 'r': t = TILES.ROCK; break;
        case 'B': t = TILES.BRIDGE; break;
        case 'A': t = TILES.WATER; break;
        case 'f': t = TILES.FLOOR; break;
        case 'T': t = TILES.TREE; break;
            
        case 'c': town.enemies.push({ x: x, y: y, type: "cow", stats: {...MONSTER_DEF["cow"]} }); break;

        case '1': t = TILES.PORTAL; break;
        case '2': t = TILES.HALL; break;
        case '3': t = TILES.BOOKSTORE; break;
        case '4': t = TILES.STORE; break;
        case '5': t = TILES.FORGE; break;

        case 'X': t = TILES.STAIR_DOWN; break;
      }
      town.map[y][x] = t;
    }

    town.enemies.push({ x: 12, y: 14, type: "cain", stats: {...MONSTER_DEF["cain"], icon: '🧙🏽‍♂️'} });
    // E5: Blacksmith NPC — stands adjacent to the FORGE tile (tristMap '5' at x=30, y=11). Spawn 1 tile to the left.
    town.enemies.push({ x: 29, y: 11, type: "blacksmith", stats: {...MONSTER_DEF["blacksmith"]}, actionTimer: 0, isQuestNPC: true, _blacksmithDialogIdx: 0 });
    town.enemies.push({ x: 15, y: 20, type: "dennis", stats: {...MONSTER_DEF["dennis"]} });
    // E.753.FARM: Dennis's expanded farm — chickens, cows, ram, ewe, mule, goose, pigs
    const farmStats = (icon, hp, speed) => ({ icon, hp, maxHp: hp, dmg: 0, hit: 0.0, crit: 0.0, dodge: 0.05, speed, throughWalls: false, passive: true });
    town.enemies.push({ x: 5, y: 21, type: "chicken", stats: farmStats('🐔', 8, 0.5), actionTimer: 0, isFarmAnimal: true });
    town.enemies.push({ x: 7, y: 24, type: "chicken", stats: farmStats('🐔', 8, 0.5), actionTimer: 0, isFarmAnimal: true });
    town.enemies.push({ x: 4, y: 23, type: "chicken", stats: farmStats('🐔', 8, 0.5), actionTimer: 0, isFarmAnimal: true });
    town.enemies.push({ x: 6, y: 22, type: "chicken", stats: farmStats('🐔', 8, 0.5), actionTimer: 0, isFarmAnimal: true });
    town.enemies.push({ x: 9, y: 22, type: "cow", stats: farmStats('🐄', 20, 0.3), actionTimer: 0, isFarmAnimal: true });
    town.enemies.push({ x: 10, y: 24, type: "cow", stats: farmStats('🐄', 20, 0.3), actionTimer: 0, isFarmAnimal: true });
    town.enemies.push({ x: 3, y: 25, type: "ram", stats: farmStats('🐏', 15, 0.4), actionTimer: 0, isFarmAnimal: true });
    town.enemies.push({ x: 4, y: 26, type: "ewe", stats: farmStats('🐑', 12, 0.4), actionTimer: 0, isFarmAnimal: true });
    town.enemies.push({ x: 11, y: 21, type: "mule", stats: farmStats('🫏', 25, 0.3), actionTimer: 0, isFarmAnimal: true });
    town.enemies.push({ x: 6, y: 25, type: "goose", stats: farmStats('🪿', 6, 0.6), actionTimer: 0, isFarmAnimal: true });
    town.enemies.push({ x: 2, y: 24, type: "pig", stats: farmStats('🐷', 15, 0.2), actionTimer: 0, isFarmAnimal: true });
    town.enemies.push({ x: 3, y: 23, type: "pig", stats: farmStats('🐷', 15, 0.2), actionTimer: 0, isFarmAnimal: true });
    town.enemies.push({ x: 8, y: 7, type: "mouse", stats: {...MONSTER_DEF["mouse"]}, actionTimer: 0, isVermin: true });
    town.enemies.push({ x: 27, y: 16, type: "mouse", stats: {...MONSTER_DEF["mouse"]}, actionTimer: 0, isVermin: true });
    town.enemies.push({ x: 29, y: 13, type: "cockroach", stats: {...MONSTER_DEF["cockroach"]}, actionTimer: 0, isVermin: true });
    // #12: Town guard — near the town entrance (south gate area)
    town.enemies.push({ x: Math.floor(town.mapW / 2), y: town.mapH - 4, type: "town_guard", stats: { icon: '💂', hp: 200, maxHp: 200, dmg: 0, hit: 0.5, crit: 0.0, dodge: 0.2, speed: 0.0, throughWalls: false, passive: true, quest: true }, actionTimer: 0, isQuestNPC: true });

    // E.HAMLET: Rosencrantz & Guildenstern — patrol between The Mended Drum and Tristram gates
    // Looking for their childhood friend Prince Hamlet who stayed at the Drum last night.
    town.enemies.push({
      x: Math.floor(town.mapW / 2), y: Math.floor(town.mapH / 2) + 2,
      type: "rosencrantz_guildenstern",
      stats: {...MONSTER_DEF["rosencrantz_guildenstern"]},
      actionTimer: 0,
      isQuestNPC: true,
      isSceneNPC: true,
      patrolPath: [
        { x: Math.floor(town.mapW / 2), y: Math.floor(town.mapH / 2) + 2 },  // near center
        { x: Math.floor(town.mapW / 2), y: town.mapH - 5 },                  // near south gate
        { x: Math.floor(town.mapW / 2) + 1, y: town.mapH - 5 },
        { x: Math.floor(town.mapW / 2) + 1, y: Math.floor(town.mapH / 2) + 2 }
      ],
      patrolIndex: 0,
      _sceneMoveCooldown: 0
    });

    // Wire the fence bar position so patrol logic can find it
    window._fenceBarX = Math.floor(town.mapW / 2) + 4; window._fenceBarY = town.mapH - 8;

    // E.TRIST.4: Dennis's Hut — near the gate, just off the path
    const gateX = Math.floor(town.mapW / 2);
    const gateY = town.mapH - 3;
    // Dennis's Wife patrols in front of hut (near gate, east side)
    const wifePatrol = [
      {x: gateX + 3, y: gateY - 2}, {x: gateX + 4, y: gateY - 2},
      {x: gateX + 4, y: gateY - 1}, {x: gateX + 3, y: gateY - 1}
    ];
    town.enemies.push({
      x: wifePatrol[0].x, y: wifePatrol[0].y,
      type: "dennis_wife",
      stats: {...MONSTER_DEF["dennis_wife"]},
      actionTimer: 0, isQuestNPC: true, isSceneNPC: true,
      patrolPath: wifePatrol, patrolIndex: 0, _sceneMoveCooldown: 0
    });
    // Sheep follows Dennis's Wife — start near her
    town.enemies.push({
      x: wifePatrol[0].x + 1, y: wifePatrol[0].y,
      type: "sheep",
      stats: {...MONSTER_DEF["sheep"]},
      actionTimer: 0, farmAnimal: true,
      _followTarget: 'dennis_wife'
    });

    // E.TRIST.5: Muck peasants — wander the fields (south of town)
    const peasantSpots = [
      {x: gateX - 8, y: gateY + 1}, {x: gateX + 6, y: gateY + 2},
      {x: gateX - 5, y: gateY + 3}
    ];
    peasantSpots.forEach(function(spot, idx) {
      const peasant = {
        x: spot.x, y: spot.y,
        type: "muck_peasant",
        stats: {...MONSTER_DEF["muck_peasant"]},
        actionTimer: 0, isQuestNPC: true, isSceneNPC: true,
        patrolPath: [
          {x: spot.x, y: spot.y},
          {x: spot.x + (idx % 2 === 0 ? 2 : -2), y: spot.y},
          {x: spot.x + (idx % 2 === 0 ? 2 : -2), y: spot.y + 1},
          {x: spot.x, y: spot.y + 1}
        ],
        patrolIndex: 0, _sceneMoveCooldown: Math.floor(Math.random() * 5)
      };
      town.enemies.push(peasant);
    });

    // E.TRIST.6: Retired soldier — stands in front of a house (north area)
    town.enemies.push({
      x: gateX - 10, y: 5,
      type: "retired_soldier",
      stats: {...MONSTER_DEF["retired_soldier"]},
      actionTimer: 0, isQuestNPC: true
    });
      
    // ── MUSIC: Tristram sample loop if available, FM fallback otherwise ──
    //Sound.playMusic('tristram');
    //Sound.stopAmbient(); // Town has no ambient loop
    
    logMsg("<span style='color:#888; font-style:italic;'>The brook chatters east of town, and a road runs toward an overgrown hedge country.</span>");
    return town;
  }

  function initMap(baseSize) {
    if (currentLevel > 10) {
      if (currentLevel === 11) currentScene = 'mountain';
      else if (currentLevel === 12) currentScene = 'beach';
      else if (currentLevel === 13) currentScene = 'desert';
      else if (currentLevel === 14) currentScene = 'forest';
      else if (currentLevel >= 15) currentScene = 'castle';
    } else if (currentLevel === 0) { currentScene = 'town'; } // Tristram
    else { currentScene = 'dungeon'; }

    let scaledSize = Math.floor(baseSize * Math.pow(1.1, Math.max(0, currentLevel - 1)));
    if(scaledSize % 2 === 0) scaledSize++;
    mapW = scaledSize; mapH = scaledSize;
    
    let defaultTile = currentScene === 'dungeon' ? TILES.WALL : TILES.GRASS;
    if(currentScene === 'desert') defaultTile = TILES.SAND;
    if(currentScene === 'beach') defaultTile = TILES.SAND;

    theMap = Array(mapH).fill().map(()=>Array(mapW).fill(defaultTile));
    darkMap = Array(mapH).fill().map(()=>Array(mapW).fill(false));
    explored = Array(mapH).fill().map(()=>Array(mapW).fill(false));
    visible = Array(mapH).fill().map(()=>Array(mapW).fill(false));
    enemies = []; itemsOnGround = []; lightTurns = 0; if(typeof corpses !== 'undefined') corpses.length = 0;
    window._swordmasterMazeActive = false;
    window._swordmasterMazeBounds = null;
    window._eagleDoor = null;
    window._eagleCragBounds = null;
    window._eagleSkyTiles = null;
    window._eagleCragEntered = false;
    window._eagleRevealShown = false;

    if (currentScene === 'town') {
      let town = mapgenTown(1);
      // E.TRIST.3: Expand town into larger overworld
      town = expandTownOverworld(town);
      mapW = town.mapW;
      mapH = town.mapH;
      theMap = town.map;
      darkMap = Array(mapH).fill().map(()=>Array(mapW).fill(false));
      explored = Array(mapH).fill().map(()=>Array(mapW).fill(false));
      visible = Array(mapH).fill().map(()=>Array(mapW).fill(false));
      for (let i = 0; i < town.enemies.length; i++) enemies.push(town.enemies[i]);
      window._townPortalTile = null;
      for(let y = 0; y < mapH && !window._townPortalTile; y++) {
        for(let x = 0; x < mapW; x++) {
          if(theMap[y][x] === TILES.PORTAL) { window._townPortalTile = { x, y }; break; }
        }
      }
      spawnRandomAnimals(currentScene);
    } 
    else if (currentScene === 'dungeon') {
      // v5.3.6-style BSP map generation: tight rooms with varied shapes
      let rooms = [];
      function splitArea(x, y, w, h, iter) {
        if(iter === 0 || (w < 12 && h < 12)) {
          rooms.push({x, y, w, h, cx: Math.floor(x+w/2), cy: Math.floor(y+h/2)});
          return;
        }
        // Prefer splitting along the longer axis
        let splitHoriz = Math.random() > 0.5;
        if(w > h*1.5) splitHoriz = false; else if(h > w*1.5) splitHoriz = true;

        if(splitHoriz) {
          let split = Math.floor(h/2) + (Math.floor(Math.random()*3)-1);
          splitArea(x, y, w, split, iter-1);
          splitArea(x, y+split, w, h-split, iter-1);
        } else {
          let split = Math.floor(w/2) + (Math.floor(Math.random()*3)-1);
          splitArea(x, y, split, h, iter-1);
          splitArea(x+split, y, w-split, h, iter-1);
        }
      }
      splitArea(1, 1, mapW-2, mapH-2, 4);

      // Varied room shapes: pillars, single cell, rect, drunkard's walk
      for(let r of rooms) {
        let type = Math.random();
        if(type < 0.15) {
          // Single-cell "secret" or pillared room
          theMap[r.cy][r.cx] = TILES.FLOOR;
        } else if(type < 0.55) {
          // Tight rectangle (70% of BSP cell)
          let rw = Math.max(3, Math.floor(r.w * 0.7));
          let rh = Math.max(3, Math.floor(r.h * 0.7));
          let rx = r.x + Math.floor((r.w - rw) / 2);
          let ry = r.y + Math.floor((r.h - rh) / 2);
          for(let cy=ry; cy<ry+rh; cy++) for(let cx=rx; cx<rx+rw; cx++) theMap[cy][cx] = TILES.FLOOR;
        } else {
          // Drunkard's walk for an organic cave feel
          let cx = r.cx, cy = r.cy, steps = Math.floor(r.w * r.h * 0.6);
          for(let i=0; i<steps; i++) {
            theMap[cy][cx] = TILES.FLOOR;
            let dirs = [[0,-1],[1,0],[0,1],[-1,0]];
            let d = dirs[Math.floor(Math.random()*4)];
            if(cx+d[0] > r.x && cx+d[0] < r.x+r.w-1) cx += d[0];
            if(cy+d[1] > r.y && cy+d[1] < r.y+r.h-1) cy += d[1];
          }
        }
      }

      // Connect rooms with L-shaped corridors
      for(let i=0; i<rooms.length-1; i++) {
        let p1 = rooms[i], p2 = rooms[i+1];
        let cx = p1.cx, cy = p1.cy;
        while(cx !== p2.cx) { theMap[cy][cx] = TILES.FLOOR; cx += Math.sign(p2.cx - cx); }
        while(cy !== p2.cy) { theMap[cy][cx] = TILES.FLOOR; cy += Math.sign(p2.cy - cy); }
      }

      // Place flooded chambers (water) on certain levels
      if(currentLevel >= 4 && Math.random() < 0.4) {
        let waterRoom = rooms[Math.floor(Math.random() * rooms.length)];
        for(let cy=waterRoom.y+1; cy<waterRoom.y+waterRoom.h-1; cy++)
          for(let cx=waterRoom.x+1; cx<waterRoom.x+waterRoom.w-1; cx++)
            if(isTileFloor(theMap[cy][cx])) theMap[cy][cx] = TILES.WATER;
      }

      // Place shops on even levels or specific floors
      // Track placed special tile positions for minimum 5-cell spacing
      let specialTilePositions = [];
      let storePositions = [];
      if(currentLevel % 2 === 0) {
        let storePos = getDeadEndWallFarFrom(specialTilePositions, 5);
        theMap[storePos.y][storePos.x] = TILES.STORE;
        storePositions.push(storePos);
        specialTilePositions.push(storePos);
      }
      if(currentLevel === 3) {
        let leftyPos = getDeadEndWallFarFrom(specialTilePositions, 5);
        theMap[leftyPos.y][leftyPos.x] = TILES.LEFTYS;
        window._fenceBarX = leftyPos.x;
        window._fenceBarY = leftyPos.y;
        specialTilePositions.push(leftyPos);
        let reserved = new Set([`${leftyPos.x},${leftyPos.y}`]);
        let fencePos = null;
        for(let r = 3; r <= 6 && !fencePos; r++) {
          let cand = findNearbyFloorTile(leftyPos.x, leftyPos.y, r, reserved);
          if(cand && Math.abs(cand.x - leftyPos.x) + Math.abs(cand.y - leftyPos.y) >= 2) fencePos = cand;
        }
        if(!fencePos) fencePos = { x: leftyPos.x + 2, y: leftyPos.y + 1 };
        reserved.add(`${fencePos.x},${fencePos.y}`);
        enemies.push({ x: fencePos.x, y: fencePos.y, type: "fence", stats: {...MONSTER_DEF["fence"]} });
        let corpsePos = findNearbyFloorTile(leftyPos.x, leftyPos.y, 4, reserved);
        if(corpsePos && typeof createCorpse === 'function') {
          createCorpse(corpsePos.x, corpsePos.y, 'busker', { icon: '🧑‍🎤' }, [{ icon: '🪗', qty: 1 }, { icon: '📎', qty: 1 }]);
          let buskerCorpse = corpses[corpses.length - 1];
          if(buskerCorpse) {
            buskerCorpse.name = 'busker corpse';
            buskerCorpse.buskerJoke = true;
          }
        }
      }
      // The Curiosity Shoppe - Discworld-style moving bookstore!
      // Appears on levels 2, 4, 6, 8 but in different random locations each time
      if(currentLevel >= 2 && currentLevel % 2 === 0) {
        let bookPos = getDeadEndWallFarFrom(specialTilePositions, 5);
        theMap[bookPos.y][bookPos.x] = TILES.BOOKSTORE;
        specialTilePositions.push(bookPos);
        // Add some flavor text
        if(Math.random() < 0.25) {
          logMsg("<span style='color:#888; font-style:italic;'>You notice a shop that wasn't there before... or was it on the other side?</span>");
        }
      }
      
      // Thief Hideout - appears on milestone floors and occasionally in mid dungeon.
      if((currentLevel % 5 === 0 || (currentLevel >= 3 && currentLevel <= 9 && Math.random() < 0.28)) && currentLevel !== 3 && rooms.length >= 3) {
        let hideoutRoom = rooms[Math.max(1, rooms.length - 2)]; // Keep separate from special end-room doors
        // Place SECRET_WALL entrance
        let entranceX = hideoutRoom.x;
        let entranceY = hideoutRoom.cy;
        if(entranceX >= 0 && entranceX < mapW && entranceY >= 0 && entranceY < mapH) {
          theMap[entranceY][entranceX] = TILES.SECRET_WALL;
        }
        // Fill hideout room with floor
        for(let cy = hideoutRoom.y+1; cy < hideoutRoom.y+hideoutRoom.h-1; cy++) {
          for(let cx = hideoutRoom.x+1; cx < hideoutRoom.x+hideoutRoom.w-1; cx++) {
            if(theMap[cy][cx] === TILES.WALL) theMap[cy][cx] = TILES.FLOOR;
          }
        }
        // Add thief and loot
        enemies.push({
          x: hideoutRoom.cx, y: hideoutRoom.cy,
          type: 'thief',
          stats: {...MONSTER_DEF['thief'], patrolling: false, wandering: true},
          actionTimer: 0
        });
        // Add some loot
        itemsOnGround.push({ x: hideoutRoom.cx + 1, y: hideoutRoom.cy, icon: '💰' });
        itemsOnGround.push({ x: hideoutRoom.cx - 1, y: hideoutRoom.cy, icon: '🗝️' });
        if(Math.random() < 0.5) {
          itemsOnGround.push({ x: hideoutRoom.cx, y: hideoutRoom.cy + 1, icon: '🗡️' });
        }
      }

      // #27: Courtyard room with FightingMaster — appears on floors 3, 6, 9
      if([3, 6, 9].includes(currentLevel) && rooms.length >= 4) {
        let yardRoom = rooms[Math.floor(Math.random() * (rooms.length - 2)) + 1]; // pick a room not at edges
        // Make it a courtyard (HALL tile = open stone floor)
        for(let cy = yardRoom.y + 1; cy < yardRoom.y + yardRoom.h - 1; cy++) {
          for(let cx = yardRoom.x + 1; cx < yardRoom.x + yardRoom.w - 1; cx++) {
            if(theMap[cy][cx] === TILES.WALL) theMap[cy][cx] = TILES.HALL;
          }
        }
        // Spawn FightingMaster at the center
        enemies.push({
          x: yardRoom.cx, y: yardRoom.cy,
          type: 'fighting_master',
          stats: { hp: 999, dmg: 0, speed: 0, dodge: 1.0, icon: '🤺', passive: true, quest: true },
          actionTimer: 0,
          isQuestNPC: true
        });
        if(Math.random() < 0.3) {
          logMsg("<span style='color:#888; font-style:italic;'>You hear the ring of steel on steel somewhere nearby — a Weapon Master trains in a courtyard.</span>");
        }
      }

      // Place 2 chests in random room centres
      for(let i=0; i<2; i++) {
        let rm = rooms[Math.floor(Math.random() * rooms.length)];
        let cx = Math.min(mapW-2, rm.cx+1);
        if(isTileFloor(theMap[rm.cy][cx])) theMap[rm.cy][cx] = TILES.CHEST;
      }
      // #14: Occasionally spawn a Mimic disguised as a chest (5% chance per chest on floors 3+)
      if(currentLevel >= 3 && Math.random() < 0.05) {
        let rm = rooms[Math.floor(Math.random() * rooms.length)];
        let mx = Math.min(mapW-2, rm.cx+2);
        if(isTileFloor(theMap[rm.cy][mx])) {
          theMap[rm.cy][mx] = TILES.CHEST;
          // Mark this chest as a mimic in chestStates
          chestStates[`${mx},${rm.cy}`] = -1; // -1 = mimic
        }
      }

      // Stairs — use far-from spacing to keep them away from shops and each other
      let upStairPos = getDeadEndWallFarFrom(specialTilePositions, 5);
      player.x = upStairPos.x; player.y = upStairPos.y;
      // B15 FIX: Floor 1 also needs a STAIR_UP so the player can return to town.
      // Previously floor 1 placed TILES.FLOOR here, leaving no way back up.
      theMap[player.y][player.x] = TILES.STAIR_UP;
      specialTilePositions.push(upStairPos);

      let downStairPos = getDeadEndWallFarFrom(specialTilePositions, 5);
      theMap[downStairPos.y][downStairPos.x] = TILES.STAIR_DOWN;
      specialTilePositions.push(downStairPos);

      // E.GENIE / KQ5: Big Genie boss guards the dungeon exit on Floor 10.
      // Requires Brass Bottle quest item to pass. Appears at 4x size.
      if(currentScene === 'dungeon' && currentLevel === 10 && MONSTER_DEF && MONSTER_DEF['genie']) {
        enemies.push({
          x: Math.max(1, Math.min(mapW - 2, downStairPos.x + 2)),
          y: Math.max(1, Math.min(mapH - 2, downStairPos.y + 1)),
          type: 'genie',
          stats: {...MONSTER_DEF['genie'], renderScale: 4.0},
          actionTimer: 0,
          isBoss: true,
          isQuestNPC: true,
          isGenieGuardian: true
        });
        logMsg("<span style='color:var(--warning)'>🧞 A colossal Genie blocks the exit stairs! It demands the Brass Bottle before it will let you pass.</span>");
      }

      // ── DARK CHAMBERS (Grue lairs) ──
      // 10% chance per room to be a dark chamber. Not rooms with stairs or stores.
      // All dark chambers spawn a Grue. Level 6 gets a pacifist orc NPC.
      if(currentScene === 'dungeon') {
        // Find which rooms contain stairs or stores
        let stairAndStoreTiles = new Set();
        for(let y = 0; y < mapH; y++) for(let x = 0; x < mapW; x++) {
          let t = theMap[y][x];
          if(t === TILES.STAIR_UP || t === TILES.STAIR_DOWN || t === TILES.STORE || t === TILES.LEFTYS || t === TILES.BOOKSTORE) {
            stairAndStoreTiles.add(`${x},${y}`);
          }
        }
        let roomHasSpecial = (rm) => {
          for(let y = rm.y; y < rm.y + rm.h; y++)
            for(let x = rm.x; x < rm.x + rm.w; x++)
              if(stairAndStoreTiles.has(`${x},${y}`)) return true;
          return false;
        };
        let darkRoomCount = 0;
        for(let rm of rooms) {
          if(roomHasSpecial(rm)) continue;
          if(Math.random() >= 0.10) continue;
          // Make this room dark
          darkRoomCount++;
          for(let y = rm.y+1; y < rm.y+rm.h-1; y++) {
            for(let x = rm.x+1; x < rm.x+rm.w-1; x++) {
              if(isTileFloor(theMap[y][x])) darkMap[y][x] = true;
            }
          }
          // No enemy spawn — Grues are a lurking danger, not a fightable monster.
          // The darkness itself is the threat. Players need light to survive.
          // Level 6: pacifist orc NPC in the first dark room
          if(currentLevel === 6 && darkRoomCount === 1) {
            enemies.push({
              x: rm.cx + 1, y: rm.cy,
              type: 'pacifist_orc',
              stats: {...MONSTER_DEF['orc'], icon: '🧌', hp: 999, dmg: 0, quest: true},
              actionTimer: 0, isQuestNPC: true
            });
            logMsg("<span style='color:#666; font-style:italic;'>You sense something watching from the darkness...</span>");
            // E.753.CUPCAKE: Two cupcakes on the floor near Grok
            itemsOnGround.push({ x: rm.cx - 1, y: rm.cy,     icon: '🧁', _cupcakeIdx: 0 });
            itemsOnGround.push({ x: rm.cx,     y: rm.cy + 1, icon: '🧁', _cupcakeIdx: 1 });
          }
        }

        // Bug 6: If player spawned on a dark tile, move them to the nearest non-dark floor tile
        if(darkMap[player.y] && darkMap[player.y][player.x]) {
          let moved = false;
          // BFS to find nearest non-dark floor tile
          let queue = [{x: player.x, y: player.y}];
          let visited = new Set();
          visited.add(`${player.x},${player.y}`);
          while(queue.length > 0 && !moved) {
            let cur = queue.shift();
            let neighbors = [[0,-1],[1,0],[0,1],[-1,0]];
            for(let [ndx, ndy] of neighbors) {
              let nx2 = cur.x + ndx, ny2 = cur.y + ndy;
              if(nx2 < 0 || nx2 >= mapW || ny2 < 0 || ny2 >= mapH) continue;
              let key = `${nx2},${ny2}`;
              if(visited.has(key)) continue;
              visited.add(key);
              if(isTileFloor(theMap[ny2][nx2]) && !darkMap[ny2][nx2]) {
                player.x = nx2; player.y = ny2;
                moved = true;
                break;
              }
              queue.push({x: nx2, y: ny2});
            }
          }
        }
      }

      // Spawn monsters scaled to level
      spawnMonsters(3 + currentLevel);
      // Scatter some floor loot
      for(let i=0; i<2; i++) { let p = getRandomFloor(); spawnLoot(p.x, p.y, false); }

      // ── MUSIC: Play scene-appropriate background music ──
      // LESSON: Music sets the emotional tone. Different floors and scenes
      // deserve different soundscapes. These FM-synthesis tracks were
      // defined in music_data.js but never triggered — now they are.
      if(currentLevel === 3) Sound.playMusic('leftys');
      else if(currentLevel >= 5 && currentLevel <= 6) Sound.playMusic('monkey');
      else if(currentLevel === 9) Sound.playMusic('bandit');
      else Sound.stopMusic();
      Sound.playAmbient('dungeon');

      // Floor 4-5: Pirates roaming the dungeon (Monkey Island quest)
      if(currentLevel === 4 && rooms.length >= 3) {
        // Spawn 3-4 lowly pirates that roam
        for(let i = 0; i < 3 + Math.floor(Math.random() * 2); i++) {
          let rm = rooms[Math.floor(Math.random() * rooms.length)];
          enemies.push({
            x: rm.cx + Math.floor(Math.random() * 3) - 1,
            y: rm.cy + Math.floor(Math.random() * 3) - 1,
            type: 'pirate',
            stats: {...MONSTER_DEF['pirate']},
            actionTimer: 0
          });
        }
        // Pirate Chaplain on floor 4 — wanders randomly
        let chapRoom = rooms[rooms.length - 2] || rooms[0];
        carveFloorPad(chapRoom.cx, chapRoom.cy, 1);
        enemies.push({
          x: chapRoom.cx, y: chapRoom.cy,
          type: 'chaplain',
          stats: { icon: '⛪🏴‍☠️', hp: 30, dmg: 0, hit: 0, crit: 0, dodge: 0, speed: 0, quest: true, wandering: true, wanderTimer: 0 },
          actionTimer: 0, isQuestNPC: true
        });
      }
      if(currentLevel === 5 && rooms.length >= 3) {
        // ── SWORDMASTER MAZE: last 3-4 rooms become a dark, confusing maze ──
        let mazeRoomCount = Math.min(4, Math.max(3, rooms.length - 1));
        let mazeRooms = rooms.slice(rooms.length - mazeRoomCount);
        
        // Track maze bounds for minimap scrambling
        let mazeBounds = {
          x1: Math.min(...mazeRooms.map(r => r.x)),
          y1: Math.min(...mazeRooms.map(r => r.y)),
          x2: Math.max(...mazeRooms.map(r => r.x + r.w)),
          y2: Math.max(...mazeRooms.map(r => r.y + r.h))
        };
        window._swordmasterMazeActive = true;
        window._swordmasterMazeBounds = mazeBounds;
        
        // Force all maze room tiles to dark (forces use of light)
        for(let rm of mazeRooms) {
          for(let my = rm.y+1; my < rm.y+rm.h-1; my++) {
            for(let mx = rm.x+1; mx < rm.x+rm.w-1; mx++) {
              if(mx >= 0 && mx < mapW && my >= 0 && my < mapH) {
                darkMap[my][mx] = true;
              }
            }
          }
        }
        
        // Add extra false corridors between maze rooms to confuse navigation
        for(let i = 0; i < mazeRooms.length - 1; i++) {
          let r1 = mazeRooms[i], r2 = mazeRooms[(i + 2) % mazeRooms.length];
          // Dead-end false corridor
          let fx = r1.cx, fy = r1.cy;
          let targetX = r2.cx, targetY = r2.cy;
          let steps = Math.floor(Math.min(r1.w, r1.h) * 0.8);
          for(let s = 0; s < steps; s++) {
            if(fx >= 1 && fx < mapW-1 && fy >= 1 && fy < mapH-1) {
              theMap[fy][fx] = TILES.FLOOR;
              darkMap[fy][fx] = true;
            }
            fx += Math.sign(targetX - fx) || (Math.random() > 0.5 ? 1 : -1);
          }
        }
        
        // Place pirate guards at chokepoints between maze rooms (1-2 guards)
        let guardCount = 1 + Math.floor(Math.random() * 2);
        for(let i = 0; i < guardCount && i < mazeRooms.length - 1; i++) {
          let guardRoom = mazeRooms[i];
          enemies.push({
            x: guardRoom.cx, y: guardRoom.cy,
            type: 'pirate',
            stats: {...MONSTER_DEF['pirate']},
            actionTimer: 0
          });
        }
        
        // Swordmaster at the deepest (last) maze room
        let masterRoom = mazeRooms[mazeRooms.length - 1];
        enemies.push({
          x: masterRoom.cx, y: masterRoom.cy,
          type: 'master',
          stats: {...MONSTER_DEF['master']},
          actionTimer: 0
        });
      }

      // Floor 1: Hidden passage → Ifrit boss chamber (remote + concealed)
      if(currentLevel === 1 && rooms.length >= 2) {
        const anchorRoom = rooms[Math.floor(Math.random() * Math.max(1, rooms.length - 1))];
        const side = (anchorRoom.cx < mapW / 2) ? 1 : -1;
        const panelY = anchorRoom.cy;
        const panelX = side > 0 ? anchorRoom.x + anchorRoom.w - 1 : anchorRoom.x;
        if(theMap[panelY] && theMap[panelY][panelX] === TILES.WALL) theMap[panelY][panelX] = TILES.SECRET_WALL;

        const hallStartX = panelX + side;
        const hallStartY = panelY;
        const hallLen = 12 + Math.floor(Math.random() * 8);
        const chamberW = 9, chamberH = 9;
        const chamberX = side > 0
          ? Math.min(mapW - chamberW - 2, hallStartX + hallLen)
          : Math.max(2, hallStartX - hallLen - chamberW + 1);
        const chamberY = Math.max(2, Math.min(mapH - chamberH - 2, hallStartY - Math.floor(chamberH / 2)));

        // Carve hidden hallway (wide enough for easy passage)
        for(let i = 0; i <= hallLen; i++) {
          const hx = hallStartX + i * side;
          if(hx <= 1 || hx >= mapW - 1) break;
          for(let wy = -1; wy <= 1; wy++) {
            const hy = hallStartY + wy;
            if(hy > 0 && hy < mapH - 1 && theMap[hy]) theMap[hy][hx] = TILES.FLOOR;
          }
        }

        // Carve sealed chamber not too close to main route
        for(let y = chamberY; y < chamberY + chamberH; y++) {
          for(let x = chamberX; x < chamberX + chamberW; x++) {
            const edge = (x === chamberX || y === chamberY || x === chamberX + chamberW - 1 || y === chamberY + chamberH - 1);
            theMap[y][x] = edge ? TILES.WALL : TILES.FLOOR;
          }
        }
        // Wide doorless connection from hall to chamber edge
        const connectX = side > 0 ? chamberX : chamberX + chamberW - 1;
        for(let wy = -1; wy <= 1; wy++) {
          const cy2 = hallStartY + wy;
          if(cy2 > 0 && cy2 < mapH - 1) theMap[cy2][connectX] = TILES.FLOOR;
        }

        const ifritX = chamberX + Math.floor(chamberW / 2);
        const ifritY = chamberY + Math.floor(chamberH / 2);
        // Place Ifrit — loot (Tome of Fireball) comes from his corpse via combat
        enemies.push({
          x: ifritX, y: ifritY,
          type: 'ifrit',
          stats: {...MONSTER_DEF['ifrit'], renderScale: 2.8, speed: 0.9},
          actionTimer: 0,
          isIfrit: true,
          taunted: false,
          patrolCenter: { x: ifritX, y: ifritY },
          patrolRadius: 3
        });
        // Fireproof decor: scatter rocks, mechanical parts, and fire pit markers
        const ifritDecor = [
          { dx: -1, dy: -1, icon: '🪨' },
          { dx:  1, dy: -1, icon: '🪨' },
          { dx: -1, dy:  1, icon: '⚙️' },
          { dx:  1, dy:  1, icon: '⚙️' },
          { dx:  0, dy: -2, icon: '🔥' },
          { dx: -2, dy:  0, icon: '🔥' },
          { dx:  2, dy:  0, icon: '🔥' },
        ];
        ifritDecor.forEach(d => {
          let dx = ifritX + d.dx, dy = ifritY + d.dy;
           if(dx > chamberX && dx < chamberX + chamberW - 1 &&
              dy > chamberY && dy < chamberY + chamberH - 1 &&
              theMap[dy] && isTileFloor(theMap[dy][dx])) {
             itemsOnGround.push({ x: dx, y: dy, icon: d.icon });
           }
         });
        window._ifritChamber = { x1: chamberX + 1, y1: chamberY + 1, x2: chamberX + chamberW - 2, y2: chamberY + chamberH - 2 };
        logMsg("<span style='color:#f90; font-style:italic;'>You feel intense heat radiating from behind the hidden wall...</span>");
      }

      // ── FLOOR 3: Eagle Crag — KQ5 Quest ──
      // Place an entry tile that triggers the eagle_crag background scene.
      // The actual scene map is generated by the BOUNDARY_DATA path in initMap.
      if(currentLevel === 3 && rooms.length >= 3) {
        let cragEntry = rooms[rooms.length - 1];
        let entryX = cragEntry.cx;
        let entryY = cragEntry.cy;
        if(entryX > 0 && entryX < mapW - 1 && entryY > 0 && entryY < mapH - 1) {
          theMap[entryY][entryX] = TILES.CASTLE_DOOR;
          window._eagleCragDoor = { x: entryX, y: entryY, opened: false };
          logMsg("<span style='color:var(--warning)'>🦅 A weathered door stands at the end of the corridor, wind whistling through its cracks.</span>");
        }
      }

      // Vermin near stores - scuttle around, flee from player
      for(const sp of storePositions) {
        let verminCount = 2 + Math.floor(Math.random() * 3);
        for(let i = 0; i < verminCount; i++) {
          let ox = sp.x + Math.floor(Math.random() * 7) - 3;
          let oy = sp.y + Math.floor(Math.random() * 7) - 3;
          if(ox >= 0 && ox < mapW && oy >= 0 && oy < mapH && isTileFloor(theMap[oy][ox])) {
            let type = Math.random() < 0.5 ? 'mouse' : 'cockroach';
            enemies.push({ x: ox, y: oy, type, stats: {...MONSTER_DEF[type]}, actionTimer: 0, isVermin: true });
          }
        }
      }
    } 
    else if (currentScene === 'desert') {
      // Monty Python & Indy Trials — Last Crusade + Fate of Atlantis
      for(let i=5; i<15; i++) theMap[10][i] = TILES.LETTER; // IEHOVA name-of-god trial
      theMap[12][10] = TILES.BLADE;                         // Breath-of-god trial (kneel)
      
      enemies.push({ x: 15, y: 10, type: "bridge_keeper", stats: {...MONSTER_DEF["bridge_keeper"]} });
      enemies.push({ x: 20, y: 20, type: "black_knight",  stats: {...MONSTER_DEF["black_knight"]}, actionTimer: 0 });
      enemies.push({ x: 5,  y: 5,  type: "killer_rabbit", stats: {...MONSTER_DEF["killer_rabbit"]}, actionTimer: 0 });
      enemies.push({ x: 2,  y: 15, type: "french_taunter",stats: {...MONSTER_DEF["french_taunter"]} });
      
      itemsOnGround.push({ x: 6, y: 5, icon: '💣🌟' }); // Holy Hand Grenade
      
      // ── FATE OF ATLANTIS: Orichalcum Beads scattered in the desert ──
      // 8 beads total. The drawbridge machine costs 3. Players will likely
      // waste 1-2 on decoys before finding the right one.
      let beadPositions = [
        {x:3,y:3}, {x:8,y:8}, {x:18,y:5}, {x:22,y:12},
        {x:14,y:18}, {x:7,y:22}, {x:25,y:20}, {x:20,y:3}
      ];
      beadPositions.forEach(p => {
        if(isTileFloor(theMap[p.y]?.[p.x]))
          itemsOnGround.push({ x: p.x, y: p.y, icon: '📿' });
      });
      
      // ── ATLANTEAN MACHINES (5 total, 4 decoys, 1 real drawbridge machine) ──
      // Placed along the south wall, progressing east toward the castle entrance.
      // LESSON: The machines increase in plausibility as you go east, so players
      // who work left-to-right find the real one last (after wasting beads).
      // The INT hint reveals this pattern to observant players.
      window.atlanteanMachines = [
        {
          x: 5, y: mapH-4, real: false,
          name: "Luminous Orb Pedestal",
          desc: "A stone pedestal with a glowing crystal socket.",
          effect: "A blinding flash of light! A voice booms: 'CALIBRATED.' Nothing else happens.",
          beadCost: 1
        },
        {
          x: 10, y: mapH-4, real: false,
          name: "Resonance Amplifier",
          desc: "A humming device with concentric bronze rings.",
          effect: "The rings spin and sing a haunting chord that fades into the desert wind.",
          beadCost: 1
        },
        {
          x: 15, y: mapH-4, real: false,
          name: "Tidal Harmonics Engine",
          desc: "A complex machine with dozens of gears and pipes.",
          effect: "Gears whirr magnificently. Steam vents. A small flag pops up reading 'OPERATIONAL'. The gears stop.",
          beadCost: 2
        },
        {
          x: 20, y: mapH-4, real: false,
          name: "Gravitational Inversion Array",
          desc: "A sleek obsidian device that makes the air feel heavy.",
          effect: "You float briefly! The sensation is incredible! Then gravity returns. Nothing opened.",
          beadCost: 1
        },
        {
          x: 25, y: mapH-4, real: true,
          name: "Drawbridge Counterweight Mechanism",
          desc: "A load-bearing device; its gears run down into the desert floor.",
          effect: "CLUNK. CLUNK. CLUNK. The drawbridge to the castle rises with a grinding roar!",
          beadCost: 3
        }
      ];
      
      // Mark machine tiles on the map for rendering
      window.atlanteanMachines.forEach((m, i) => {
        if(theMap[m.y]?.[m.x] !== undefined) theMap[m.y][m.x] = TILES.MACHINE;
      });
      
      player.x = 2; player.y = 2;
      // Castle entrance is blocked by drawbridge until beads used
      theMap[mapH-2][mapW-2] = TILES.STAIR_DOWN;
      // Drawbridge blocks direct path to the stair until opened
      if(!QuestEngine || !QuestEngine._flags?.castle_bridge_open) {
        for(let x = mapW-8; x < mapW-2; x++) {
          if(theMap[mapH-3]?.[x] !== undefined) theMap[mapH-3][x] = TILES.WALL;
        }
      }
      
      Sound.playMusic('bandit');
      Sound.playAmbient('desert');
    }
    else if (currentScene === 'mountain' || currentScene === 'beach' || currentScene === 'forest') {
      // Open outdoor scenes — use BSP dungeon generator on a grass/sand base
      // theMap already initialized with GRASS above; generate traversable paths
      let rooms = [];
      function splitOutdoor(x, y, w, h, iter) {
        if(iter === 0 || (w < 10 && h < 10)) {
          rooms.push({x, y, w, h, cx: Math.floor(x+w/2), cy: Math.floor(y+h/2)});
          return;
        }
        let splitHoriz = Math.random() > 0.5;
        if(splitHoriz) {
          let s = Math.floor(h/2);
          splitOutdoor(x, y, w, s, iter-1);
          splitOutdoor(x, y+s, w, h-s, iter-1);
        } else {
          let s = Math.floor(w/2);
          splitOutdoor(x, y, s, h, iter-1);
          splitOutdoor(x+s, y, w-s, h, iter-1);
        }
      }
      splitOutdoor(1, 1, mapW-2, mapH-2, 3);
      // Fill clearings
      for(let r of rooms) {
        for(let cy=r.y+1; cy<r.y+r.h-1; cy++)
          for(let cx=r.x+1; cx<r.x+r.w-1; cx++)
            if(Math.random() < 0.7) theMap[cy][cx] = TILES.FLOOR;
      }
      // Connect clearings
      for(let i=0; i<rooms.length-1; i++) {
        let p1 = rooms[i], p2 = rooms[i+1];
        let cx = p1.cx, cy = p1.cy;
        while(cx !== p2.cx) { theMap[cy][cx] = TILES.FLOOR; cx += Math.sign(p2.cx-cx); }
        while(cy !== p2.cy) { theMap[cy][cx] = TILES.FLOOR; cy += Math.sign(p2.cy-cy); }
      }
      // Trees/rocks as decoration
      for(let i=0; i<20; i++) {
        let rx = 1+Math.floor(Math.random()*(mapW-2));
        let ry = 1+Math.floor(Math.random()*(mapH-2));
        if(theMap[ry][rx] === TILES.GRASS) {
          theMap[ry][rx] = currentScene === 'forest' ? TILES.TREE : TILES.ROCK;
        }
      }
      let up = rooms[0]; player.x = up.cx; player.y = up.cy; theMap[player.y][player.x] = TILES.FLOOR;
      // #4 FIX: Outworld uses open gates on map edges, not stairs.
      // Place a 3-tile-wide gate on the south edge for down transition,
      // and a 3-tile-wide gate on the north edge for up transition.
      // Gates store position in window._outworldGates for engine.js bidirectional wiring.
      const gateY_up = 1;
      const gateX_up = Math.floor(mapW / 2);
      const gateY_dn = mapH - 2;
      const gateX_dn = Math.floor(mapW / 2);
      // North gate (from previous area)
      if(currentLevel > 1) {
        for(let gx = gateX_up - 1; gx <= gateX_up + 1; gx++) {
          theMap[gateY_up][gx] = TILES.OPEN_GATE;
        }
        player.x = gateX_up; player.y = gateY_up + 1; // Spawn just inside south of north gate
      }
      // South gate (to next area)
      for(let gx = gateX_dn - 1; gx <= gateX_dn + 1; gx++) {
        theMap[gateY_dn][gx] = TILES.OPEN_GATE;
      }
      // Ensure floor path to each gate
      for(let gy = gateY_up + 1; gy <= gateY_up + 3; gy++) theMap[gy][gateX_up] = TILES.FLOOR;
      for(let gy = gateY_dn - 3; gy < gateY_dn; gy++) theMap[gy][gateX_dn] = TILES.FLOOR;
      window._outworldGates = {
        north: { x: gateX_up, y: gateY_up },
        south: { x: gateX_dn, y: gateY_dn }
      };

      if(currentScene === 'mountain' && rooms.length >= 3) {
        let nestRoom = rooms[rooms.length - 1];
        if(nestRoom && nestRoom.cy > 1 && nestRoom.cy < mapH - 1 && nestRoom.cx > 1 && nestRoom.cx < mapW - 1) {
          theMap[nestRoom.cy][nestRoom.cx] = TILES.NEST;
          for(let dy = -1; dy <= 1; dy++) {
            for(let dx = -1; dx <= 1; dx++) {
              let tx = nestRoom.cx + dx;
              let ty = nestRoom.cy + dy;
              if(tx > 0 && tx < mapW - 1 && ty > 0 && ty < mapH - 1 && theMap[ty][tx] !== TILES.NEST) {
                theMap[ty][tx] = TILES.FLOOR;
              }
            }
          }
        }
      }
      spawnMonsters(4 + currentLevel);
      spawnRandomAnimals(currentScene); // E20: random encounter animals

      // ── MUSIC: Overworld scene music ──
      if(currentScene === 'beach') Sound.playMusic('monkey');
      else if(currentScene === 'castle') Sound.playMusic('lechuck');
      else Sound.stopMusic();
      Sound.playAmbient(currentScene === 'forest' ? 'forest' : currentScene === 'beach' ? 'beach' : 'dungeon');
      
      // Beach: add Pirate Chaplain and beach village (Monkey Island theme)
      if(currentScene === 'beach' && rooms.length >= 3) {
        let chRoom = rooms[Math.floor(rooms.length / 2)];
        enemies.push({
          x: chRoom.cx, y: chRoom.cy,
          type: 'chaplain',
          stats: {...MONSTER_DEF['chaplain']},
          actionTimer: 0
        });
        
        // Beach village with Monkey Island references
        if(rooms.length >= 5) {
          // Create a small beach village
          let villageRoom = rooms[1]; // Use second room for village
          
          // SCUMMbar (pirate bar)
          if(villageRoom.w >= 6 && villageRoom.h >= 6) {
            theMap[villageRoom.cy][villageRoom.cx] = TILES.SCUMM_BAR;
            // Add some pirate NPCs around the bar
            enemies.push({
              x: villageRoom.cx + 1, y: villageRoom.cy,
              type: 'pirate',
              stats: {...MONSTER_DEF['pirate']},
              actionTimer: 0
            });
            enemies.push({
              x: villageRoom.cx - 1, y: villageRoom.cy,
              type: 'pirate',
              stats: {...MONSTER_DEF['pirate']},
              actionTimer: 0
            });
          }
          
          // Antique shop (with safe cracking quest)
          if(rooms.length >= 6) {
            let shopRoom = rooms[2];
            if(shopRoom.w >= 5 && shopRoom.h >= 5) {
              theMap[shopRoom.cy][shopRoom.cx] = TILES.ANTIQUE_SHOP;
              // Add a hard-of-hearing shopkeeper
              enemies.push({
                x: shopRoom.cx, y: shopRoom.cy,
                type: 'fence', // Reuse fence as shopkeeper
                stats: {...MONSTER_DEF['fence']},
                actionTimer: 0,
                isShopkeeper: true,
                shopType: 'antique'
              });
            }
          }
          
          // Swordmaster's house
          if(rooms.length >= 7) {
            let masterRoom = rooms[3];
            if(masterRoom.w >= 5 && masterRoom.h >= 5) {
              theMap[masterRoom.cy][masterRoom.cx] = TILES.HUT;
              // Add swordmaster
              enemies.push({
                x: masterRoom.cx, y: masterRoom.cy,
                type: 'master',
                stats: {...MONSTER_DEF['master']},
                actionTimer: 0
              });
            }
          }
          
          // Add some beach decorations
          for(let i = 0; i < 10; i++) {
            let rx = 1 + Math.floor(Math.random() * (mapW - 2));
            let ry = 1 + Math.floor(Math.random() * (mapH - 2));
            if(theMap[ry][rx] === TILES.GRASS) {
              theMap[ry][rx] = TILES.BUSH; // Beach bushes/seaweed
            }
          }
          
          // Add a boat/dock
          if(rooms.length >= 8) {
            let dockRoom = rooms[4];
            if(dockRoom.w >= 4 && dockRoom.h >= 4) {
              theMap[dockRoom.cy][dockRoom.cx] = TILES.BOAT;
              // Add a pirate near the boat
              enemies.push({
                x: dockRoom.cx + 1, y: dockRoom.cy,
                type: 'pirate',
                stats: {...MONSTER_DEF['pirate']},
                actionTimer: 0
              });
            }
          }
          
          // Add fishing spot for Red Herring (Caustic Grog quest)
          if(rooms.length >= 9) {
            let fishRoom = rooms[5];
            if(fishRoom.w >= 3 && fishRoom.h >= 3) {
              // Place water tiles for fishing
              theMap[fishRoom.cy][fishRoom.cx] = TILES.WATER;
              theMap[fishRoom.cy+1][fishRoom.cx] = TILES.WATER;
              theMap[fishRoom.cy][fishRoom.cx+1] = TILES.WATER;
              // Mark this as a fishing spot
              if(!window.fishingSpots) window.fishingSpots = [];
              window.fishingSpots.push({x: fishRoom.cx, y: fishRoom.cy});
            }
          }
        }
      }

      // B758: Guaranteed Beach Village landmarks and coastline/ocean.
      if(currentScene === 'beach') {
        const vx = Math.max(8, mapW - 18);
        const vy = Math.max(8, Math.floor(mapH / 2));

        // Ocean strip along the east edge.
        for(let y = 1; y < mapH - 1; y++) {
          for(let x = mapW - 7; x < mapW - 1; x++) {
            theMap[y][x] = TILES.WATER;
          }
        }

        // Village clearings near coastline.
        for(let y = vy - 6; y <= vy + 6; y++) {
          for(let x = vx - 8; x <= vx + 2; x++) {
            if(y > 0 && y < mapH - 1 && x > 0 && x < mapW - 1 && theMap[y][x] !== TILES.WATER) {
              theMap[y][x] = TILES.FLOOR;
            }
          }
        }

        // Build docks that jut into the ocean (eastward piers).
        const coastX = mapW - 8;
        const pierYs = [vy - 3, vy, vy + 3];
        pierYs.forEach(py => {
          for(let x = coastX - 3; x <= mapW - 5; x++) {
            if(py > 0 && py < mapH - 1 && x > 0 && x < mapW - 1) {
              theMap[py][x] = TILES.BRIDGE;
            }
          }
        });
        // Crosswalk connecting the three piers
        for(let y = vy - 3; y <= vy + 3; y++) {
          if(y > 0 && y < mapH - 1 && coastX - 3 > 0) theMap[y][coastX - 3] = TILES.BRIDGE;
        }

        // Move SCUMMbar, Supercenter, and Antique Shoppe onto the docks.
        theMap[vy - 3][coastX - 2] = TILES.SCUMM_BAR;
        theMap[vy][coastX - 2] = TILES.STORE;
        theMap[vy + 3][coastX - 2] = TILES.ANTIQUE_SHOP;
        theMap[vy][coastX] = TILES.BOAT;

        // Ensure a navigable path from player spawn to village + dock.
        let px2 = player.x;
        let py2 = player.y;
        while(px2 !== coastX - 5) { theMap[py2][px2] = TILES.FLOOR; px2 += Math.sign((coastX - 5) - px2); }
        while(py2 !== vy) { theMap[py2][px2] = TILES.FLOOR; py2 += Math.sign(vy - py2); }
        while(px2 <= coastX - 3) { theMap[py2][px2] = TILES.BRIDGE; px2++; }

        // Ensure required shopkeepers/NPC anchors exist near the landmarks.
        if(!enemies.some(e => e.type === 'chaplain')) {
          enemies.push({ x: coastX - 5, y: vy - 1, type: 'chaplain', stats: {...MONSTER_DEF['chaplain']}, actionTimer: 0 });
        }
        if(!enemies.some(e => e.shopType === 'antique')) {
          enemies.push({
            x: coastX - 2, y: vy + 3,
            type: 'fence', stats: {...MONSTER_DEF['fence']}, actionTimer: 0,
            isShopkeeper: true, shopType: 'antique'
          });
        }
      }
    }
    else if (currentScene === 'castle') {
      // Castle: stone walls, open courtyards, moats — all walkable (no infinite-wall freeze)
      // Fill with floor, add wall structures inside
      for(let y=0; y<mapH; y++) for(let x=0; x<mapW; x++) theMap[y][x] = TILES.FLOOR;
      // Outer moat ring
      for(let i=0; i<mapW; i++) { theMap[1][i] = TILES.MOAT; theMap[mapH-2][i] = TILES.MOAT; }
      for(let i=1; i<mapH-1; i++) { theMap[i][1] = TILES.MOAT; theMap[i][mapW-2] = TILES.MOAT; }
      // Stone walls for rooms
      for(let ry=3; ry<mapH-3; ry+=8) {
        for(let rx=3; rx<mapW-3; rx+=8) {
          for(let cy=ry; cy<Math.min(ry+6, mapH-3); cy++) {
            theMap[cy][rx] = TILES.WALL;
            theMap[cy][Math.min(rx+5, mapW-3)] = TILES.WALL;
          }
          for(let cx=rx; cx<Math.min(rx+6, mapW-3); cx++) {
            theMap[ry][cx] = TILES.WALL;
            theMap[Math.min(ry+5, mapH-3)][cx] = TILES.WALL;
          }
          // Doorway
          theMap[ry + 3][rx] = TILES.CASTLE_DOOR;
        }
      }
      // Stairs
      player.x = 4; player.y = 4; theMap[4][4] = TILES.STAIR_UP;
      theMap[mapH-4][mapW-4] = TILES.STAIR_DOWN;
      // Boss area
      enemies.push({ x: mapW-6, y: mapH-6, type: "black_knight", stats: {...MONSTER_DEF["black_knight"]}, actionTimer: 0 });
      spawnMonsters(5 + currentLevel);
    }
    else if (window.BOUNDARY_DATA && window.BOUNDARY_DATA[currentScene]) {
      const sceneData = window.BOUNDARY_DATA[currentScene];
      mapW = sceneData.gridW;
      mapH = sceneData.gridH;
      theMap = Array(mapH).fill().map(() => Array(mapW).fill(TILES.BG_SCENE));
      darkMap = Array(mapH).fill().map(() => Array(mapW).fill(false));
      explored = Array(mapH).fill().map(() => Array(mapW).fill(false));
      visible = Array(mapH).fill().map(() => Array(mapW).fill(false));
      enemies = [];
      itemsOnGround = [];

      const walkable = sceneData.walkable || [];
      const entry = walkable[Math.floor(walkable.length / 2)] || { x: Math.floor(mapW / 2), y: Math.floor(mapH / 2) };
      player.x = entry.x;
      player.y = entry.y;

      (sceneData.npcs || []).forEach(npc => {
        const def = MONSTER_DEF[npc.type] || {};
        enemies.push({
          x: npc.x,
          y: npc.y,
          type: npc.type,
          stats: {
            icon: npc.icon || def.icon || '🙂',
            hp: def.hp || 999,
            maxHp: def.hp || 999,
            dmg: def.dmg || 0,
            hit: def.hit || 0,
            crit: def.crit || 0,
            dodge: def.dodge != null ? def.dodge : 1,
            speed: 0,
            throughWalls: false,
            passive: true,
            quest: true
          },
          actionTimer: 0,
          isQuestNPC: true,
          patrolPath: npc.patrolPath ? npc.patrolPath.map(p => ({ x: p.x, y: p.y })) : [],
          patrolIndex: 0,
          isSceneNPC: true
        });
      });
    }
    // Regenerate grass height map whenever a new map loads
    if (typeof window.regenerateGrassHeightMap === 'function') window.regenerateGrassHeightMap();
  }

  function getRandomFloor() {
    const walkable = [TILES.FLOOR, TILES.SAND, TILES.GRASS, TILES.BRIDGE];
    let x, y, tries = 0;
    do {
      x = Math.floor(Math.random()*mapW);
      y = Math.floor(Math.random()*mapH);
      tries++;
      if(tries > 10000) { x = Math.floor(mapW/2); y = Math.floor(mapH/2); break; }
    } while(!walkable.includes(theMap[y]?.[x]));
    return {x, y};
  }

  function getRandomWater() {
    let waterTiles = [];
    for(let y=1; y<mapH-1; y++) {
      for(let x=1; x<mapW-1; x++) {
        if(theMap[y][x] === TILES.WATER) waterTiles.push({x, y});
      }
    }
    return waterTiles.length > 0 ? waterTiles[Math.floor(Math.random() * waterTiles.length)] : null;
  }

  function spawnMonsters(count) {
    if(currentScene === 'town') return;

    // Scene-specific monster types
    let sceneMonsters = {
      'dungeon': ['slime', 'skeleton', 'bat', 'ghost'],
      'mountain': ['chipmunk', 'troll', 'eagle'],
      'beach': ['snake', 'crab', 'lizard'],
      'desert': ['snake', 'scorpion', 'lizard'],
      'forest': ['chipmunk', 'snake', 'troll', 'pixie', 'lizard'],
      'castle': ['skeleton', 'ghost', 'assassin']
    };

    // E.753.ZOMBIE: Add zombies on dungeon floors 1-3
    if(currentScene === 'dungeon' && currentLevel >= 1 && currentLevel <= 3) {
      sceneMonsters['dungeon'].push('zombie', 'zombie');
    }

    // E.753.LIZARD: Tiny vermin in early/mid dungeons
    if(currentScene === 'dungeon' && currentLevel >= 1 && currentLevel <= 6) {
      sceneMonsters['dungeon'].push('lizard');
    }
    
      let availableTypes = sceneMonsters[currentScene] || ['slime'];
    
    for(let i=0; i<count; i++) {
      let pos = getRandomFloor();
      // Bug 6: Skip dark tiles when placing monsters
      let tries = 0;
      while(darkMap[pos.y] && darkMap[pos.y][pos.x] && tries++ < 20) {
        pos = getRandomFloor();
      }
      let type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
      if(MONSTER_DEF[type]) {
        enemies.push({ x: pos.x, y: pos.y, type, stats: {...MONSTER_DEF[type]}, actionTimer: 0 });
      }
    }
    
    // Spawn aquatic creatures in WATER tiles (ducks, wet rats)
    // Shark is a single boss — spawned once per game, not per floor
    if(currentScene === 'dungeon') {
      let waterCount = 0;
      let sharkSpawned = enemies.some(e => e.type === 'shark');
      for(let y=1; y<mapH-1; y++) {
        for(let x=1; x<mapW-1; x++) {
          if(theMap[y][x] === TILES.WATER && Math.random() < 0.15) {
            let roll = Math.random();
            let aquaticType;
            if(roll < 0.65) aquaticType = 'duck';          // 65% duck
            else aquaticType = 'wet_rat';                   // 35% wet rat
            
            // Boss shark: one per game, only on deeper floors, 200% size
            if(!sharkSpawned && !window._sharkBossSpawned && currentLevel >= 4 && Math.random() < 0.05) {
              aquaticType = 'shark';
              sharkSpawned = true;
              window._sharkBossSpawned = true;
            }
            
            if(MONSTER_DEF[aquaticType]) {
              let stats = {...MONSTER_DEF[aquaticType]};
              if(aquaticType === 'shark') {
                stats.isBig = true; // 200% rendering size
                stats.hp *= 2; stats.maxHp = stats.hp;
                stats.dmg = Math.floor(stats.dmg * 1.5);
              }
              enemies.push({ x, y, type: aquaticType, stats, actionTimer: 0 });
              waterCount++;
            }
          }
        }
      }
      if(waterCount > 0 && Math.random() < 0.3) {
        logMsg(`<span style='color:#888; font-style:italic;'>You hear splashing and quacking from the flooded chambers...</span>`);
      }

      // E15: T-Rex — rare spawn on floors 8-12, one per floor at most
      if(currentLevel >= 8 && currentLevel <= 12 && Math.random() < 0.15 && !enemies.some(e => e.type === 'trex')) {
        let pos = getRandomFloor();
        let tries = 0;
        while(tries++ < 30 && (Math.abs(pos.x - player.x) + Math.abs(pos.y - player.y) < 10)) {
          pos = getRandomFloor();
        }
        let trexStats = {...MONSTER_DEF['trex']};
        trexStats.maxHp = trexStats.hp;
        enemies.push({
          x: pos.x, y: pos.y,
          type: 'trex',
          stats: trexStats,
          actionTimer: 0
        });
        logMsg("<span style='color:#f44; font-weight:bold;'>🦖 The ground trembles beneath your feet...</span>");
      }
    }
  }

  function spawnLoot(x, y, isChest) {
    // Helper: place a single item as a floor item (requires right-click to pick up)
    function placeItem(icon) {
      itemsOnGround.push({x, y, icon});
    }

    // Rare drop override (~1% chance on floor scatter)
    if (!isChest && Math.random() < 0.01) {
      let rares = ['💎💠', '👢⚡', '💍'];
      placeItem(rares[Math.floor(Math.random() * rares.length)]);
      return;
    }

    // E.753.TRASH: Dungeon floor trash (5% chance)
    if (!isChest && Math.random() < 0.05) {
      let trash = ['🪀', '🧸', '🧩'];
      placeItem(trash[Math.floor(Math.random() * trash.length)]);
      return;
    }

    let roll = Math.random();
    if (isChest) {
      // Monster ambush chance (10%)
      if (roll < 0.10) {
        let ambushTypes = ['slime', 'skeleton', 'snake', 'bat'];
        let type = ambushTypes[Math.floor(Math.random() * ambushTypes.length)];
        if (MONSTER_DEF[type]) {
          enemies.push({ x, y, type, stats: {...MONSTER_DEF[type]}, actionTimer: 0 });
        }
        return;
      }
      // Gold (10%) — direct credit, no floor item needed
      else if (roll < 0.20) {
        changeGold(50 + Math.floor(Math.random() * 100 * currentLevel));
        logMsg("The chest contains gold!");
        return;
      }
      // Build a multi-item loot pile for the chest (right-click to loot)
      let chestLoot = [];
      if (roll < 0.35) chestLoot.push({icon:'🗡️', qty:1});
      else if (roll < 0.50) chestLoot.push({icon:'🛡️', qty:1});
      else if (roll < 0.62) chestLoot.push({icon:'🧪', qty:1});
      else if (roll < 0.74) chestLoot.push({icon:'🕯️', qty:1});
      else if (roll < 0.82) chestLoot.push({icon: randomBag(player.level), qty:1});
      else if (roll < 0.90) chestLoot.push({icon:'📃', qty:1});
      else if (roll < 0.97) chestLoot.push({icon:'🌀', qty:1});
      else chestLoot.push({icon:'🗝️', qty:1});
      // 30% chance of bonus item in chest
      if (Math.random() < 0.3) {
        let bonus = ['🧪','🕯️','🍕','🍖','💰','📃'];
        chestLoot.push({icon: bonus[Math.floor(Math.random() * bonus.length)], qty:1});
      }
      // 8% chance of coin bonus
      if (Math.random() < 0.08) {
        chestLoot.push({icon:'🪙', qty: 10 + Math.floor(Math.random() * 30 * currentLevel)});
      }
      // Create as a "chest" corpse for right-click looting
      if(typeof createCorpse === 'function' && typeof window.autoLootEnabled !== 'undefined') {
        if(window.autoLootEnabled && player.talents && player.talents['autoLoot']) {
          chestLoot.forEach(item => {
            if(item.icon === '🪙') { changeGold(item.qty); }
            else { let s = inventoryx.findIndex(s => s === null); if(s !== -1) inventoryx[s] = {icon:item.icon, qty:item.qty}; else if(typeof tryPlaceInPouch==='function') tryPlaceInPouch(item); }
          });
          if(!chestLoot.some(item => item.icon === '🪙')) Sound.clink();
        } else {
          createCorpse(x, y, 'chest', {icon:'📦', name:'Chest'}, chestLoot);
        }
      } else {
        // Fallback if engine not loaded yet
        chestLoot.forEach(item => placeItem(item.icon));
      }
    } else {
      // Floor scatter loot — single items as right-click floor items
      if (roll < 0.25) return; // empty
      let floorLoot = ['🧪', '🧪', '🍕', '🕯️', '🦴', '📎', '🪙', '📃'];
      // E16: Bomb appears as rare floor loot on mid-game floors (5-9)
      if(currentLevel >= 5 && currentLevel <= 9 && Math.random() < 0.05) {
        placeItem('💣');
        return;
      }
      placeItem(floorLoot[Math.floor(Math.random() * floorLoot.length)]);
    }
  }

  // E20: Spawn random animals in outdoor scenes
  function spawnRandomAnimals(scene) {
    const OUTDOOR_ANIMALS = ['hedgehog','bunny','turkey','goose','mosquito','buffalo','skunk','beaver','turtle','blackbird','owl','fly','ladybug','lizard'];
    const OUTDOOR_SCENES = ['town', 'fields', 'forest', 'mountain', 'beach'];
    if(!OUTDOOR_SCENES.some(s => scene && scene.includes(s))) return;

    // Find all grass/bush/plant tiles to spawn near
    const plantTiles = [];
    for(let y = 0; y < mapH; y++) {
      for(let x = 0; x < mapW; x++) {
        const t = theMap[y][x];
        if(t === TILES.GRASS || t === TILES.BUSH || t === TILES.TREE) {
          plantTiles.push({x, y});
        }
      }
    }
    if(plantTiles.length === 0) return;

    const count = 3 + Math.floor(Math.random() * 6); // 3-8 animals
    for(let i = 0; i < count; i++) {
      const plant = plantTiles[Math.floor(Math.random() * plantTiles.length)];
      const animalType = OUTDOOR_ANIMALS[Math.floor(Math.random() * OUTDOOR_ANIMALS.length)];
      const def = MONSTER_DEF[animalType];
      if(!def) continue;

      // Find empty tile near plant
      const offsets = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:1},{dx:-1,dy:-1}];
      const off = offsets[Math.floor(Math.random() * offsets.length)];
      const ax = plant.x + off.dx, ay = plant.y + off.dy;
      if(ax < 1 || ax >= mapW-1 || ay < 1 || ay >= mapH-1) continue;
      if(theMap[ay][ax] === TILES.WALL) continue;

      // Check not on player or other enemy
      if(enemies.some(e => e && e.x === ax && e.y === ay)) continue;

      enemies.push({
        x: ax, y: ay,
        type: animalType,
        icon: def.icon,
        friendly: def.friendly || false,
        farmAnimal: def.farmAnimal || false,
        noGold: def.noGold || false,
        stats: { hp: def.hp, maxHp: def.maxHp, atk: def.dmg, def: 0,
                  hit: def.hit, dodge: def.dodge, xp: 1,
                  speed: def.speed, throughWalls: def.throughWalls || false },
        renderScale: def.renderScale || 1.0,
        loot: def.loot || [],
        actionTimer: 0,
        // AI flags
        fleePlayer: def.friendly || false,
        preferPlants: true
      });
    }
  }
