  /*
  RENDER MODULE – CANVAS GRAPHICS, FIELD OF VIEW, AND VISUAL EFFECTS
  ==================================================================
  This module handles all visual rendering for the game, drawing the world, entities,
  and UI elements onto HTML5 Canvas. It includes sprite‑based rendering with fallback
  to emoji/text, dynamic field‑of‑view calculations, lighting effects, and visual
  feedback systems (floating damage numbers, level‑up flashes, active effect lines).

  Key responsibilities:
  1. Canvas setup & resize handling (resizeCanvas) – adapts to window size
  2. Field‑of‑view computation (calculateFOV) – ray‑casting for visibility and exploration
  3. Primary map rendering (drawMap) – tiles, items, enemies, player, with sprite support
  4. Minimap rendering (drawMinimap) – top‑down overview of explored areas
  5. Visual effects – floating text, combat flashes, lightning lines, level‑up screen tint
  6. Performance optimizations – viewport culling, explored‑only rendering, sprite caching

  The functions here are called from engine.js (after each turn), from ui_logic.js
  (when UI updates require redraw), and from window resize events. They read the global
  game state (theMap, itemsOnGround, enemies, player, activeEffects) and write to the canvas.
*/
// === Renderer (v7.2.0) ===
  // #4 FIX: tileNoise — simple 2D hash noise for tile variation
  // Returns a value 0-1 based on tile coordinates (deterministic, no flicker)
  function tileNoise(x, y) {
    let h = ((x * 374761393 + y * 668265263 + 1274126177) ^ (x * 1013)) & 0x7fffffff;
    h = ((h >> 13) ^ h);
    h = (h * (h * h * 60493 + 19990303) + 1376312589) & 0x7fffffff;
    return (h % 10000) / 10000;
  }

  // ── Grass Height Map ─────────────────────────────────────────────────────────
  // Per-tile smooth height multiplier [0..1]. Generated once per map using
  // overlapping sine waves at two frequencies — produces gentle rolling hills
  // of tall and short grass rather than random salt-and-pepper variation.
  //
  // O'Reilly pattern – "Lazy Evaluation":
  //   We regenerate only when mapW/mapH change (new map loaded), not every frame.
  //
  //   grassH(x, y) ∈ [0..1]
  //   blade height px = GRASS_MIN_H + grassH * (GRASS_MAX_H - GRASS_MIN_H)
  const GRASS_MIN_H = 3;   // pixels — shortest blades
  const GRASS_MAX_H = 13;  // pixels — tallest blades (≈ 40% of TILE_SIZE=32)
  let _grassHeightMap = null;
  let _grassMapW = 0, _grassMapH = 0;

  function ensureGrassHeightMap() {
    if (_grassHeightMap && _grassMapW === mapW && _grassMapH === mapH) return;
    _grassMapW = mapW; _grassMapH = mapH;
    _grassHeightMap = [];
    for (let y = 0; y < mapH; y++) {
      _grassHeightMap[y] = new Float32Array(mapW);
      for (let x = 0; x < mapW; x++) {
        // Two overlapping sine waves — large wavelength (8 tiles) and medium (4 tiles)
        const low  = (Math.sin(x * 0.78 + y * 0.45 + 1.2) + Math.cos(x * 0.31 + y * 0.67 + 0.8)) * 0.25 + 0.5;
        const mid  = (Math.sin(x * 1.57 + y * 1.13 + 2.4) + Math.cos(x * 1.21 + y * 1.44 + 0.3)) * 0.125 + 0.25;
        // Blend with a tiny bit of per-tile hash noise for micro-variation
        const hash = tileNoise(x, y) * 0.1;
        _grassHeightMap[y][x] = Math.max(0, Math.min(1, low + mid + hash - 0.35));
      }
    }
  }

  // Public: call this when a new map is loaded (called from initMap hook below)
  window.regenerateGrassHeightMap = function() { _grassHeightMap = null; };

  // Get the grass height multiplier for a tile (0..1)
  function grassHeight(x, y) {
    ensureGrassHeightMap();
    if (!_grassHeightMap[y]) return 0.5;
    return _grassHeightMap[y][x] ?? 0;
  }

  // ── E23: Tile Edge Smoothing ──────────────────────────────────────────────
  // Draws feathered gradient strips at terrain-type transitions to soften the
  // sharp pixel edges between different tile types (water/land, wall/floor, etc.)
  // This is a purely additive visual pass — it never modifies map data.
  // Gate: window.tileSmoothing !== false (default enabled).
  function drawTileEdgeSmoothing(ctx, mapX, mapY, px, py, tileSize, animNow) {
    if(window.tileSmoothing === false) return;

    const tile = theMap[mapY] && theMap[mapY][mapX];
    if(tile === undefined || tile === null) return;

    // Only process tiles that participate in smoothed transitions
    const smoothableTiles = new Set([
      TILES.WATER, TILES.DEEP_WATER, TILES.MOAT,
      TILES.FLOOR, TILES.GRASS, TILES.SAND, TILES.ROCK,
      TILES.BRIDGE, TILES.BRIDGE_TILE,
    ]);
    if(!smoothableTiles.has(tile)) return;

    const nb = {
      n:  theMap[mapY-1] ? theMap[mapY-1][mapX]   : undefined,
      s:  theMap[mapY+1] ? theMap[mapY+1][mapX]   : undefined,
      e:  theMap[mapY]   ? theMap[mapY][mapX+1]   : undefined,
      w:  theMap[mapY]   ? theMap[mapY][mapX-1]   : undefined,
      ne: theMap[mapY-1] ? theMap[mapY-1][mapX+1] : undefined,
      nw: theMap[mapY-1] ? theMap[mapY-1][mapX-1] : undefined,
      se: theMap[mapY+1] ? theMap[mapY+1][mapX+1] : undefined,
      sw: theMap[mapY+1] ? theMap[mapY+1][mapX-1] : undefined,
    };

    const isWall = (t) => t === TILES.WALL || t === TILES.SECRET_WALL;
    const isWater = (t) => t === TILES.WATER || t === TILES.DEEP_WATER || t === TILES.MOAT;

    // Get the fill color for a tile type (crisp, no alpha)
    function tileColor(t) {
      if(isWall(t)) return '#1a1a1a';
      if(isWater(t)) return '#1a3a5a';
      if(t === TILES.GRASS || t === TILES.BUSH) return '#2a5a1a';
      if(t === TILES.FLOOR) return '#5a5040';
      if(t === TILES.SAND) return '#8a7a50';
      if(t === TILES.ROCK) return '#6a6a5a';
      return '#3a3a3a';
    }

    // Check if a neighbor is different from this tile
    const diffN  = nb.n  !== undefined && nb.n  !== tile && smoothableTiles.has(nb.n);
    const diffS  = nb.s  !== undefined && nb.s  !== tile && smoothableTiles.has(nb.s);
    const diffE  = nb.e  !== undefined && nb.e  !== tile && smoothableTiles.has(nb.e);
    const diffW  = nb.w  !== undefined && nb.w  !== tile && smoothableTiles.has(nb.w);

    const hasDiff = diffN || diffS || diffE || diffW;
    if(!hasDiff) return;

    const r = Math.round(tileSize * 0.42);
    const edgeW = Math.round(tileSize * 0.28);

    ctx.save();

    function edgeGradient(x1, y1, x2, y2, color) {
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, color + 'cc');
      g.addColorStop(1, color + '00');
      return g;
    }

    // Feathered edge strips
    if(diffN) {
      const c = tileColor(nb.n);
      ctx.fillStyle = edgeGradient(px, py, px, py + edgeW, c);
      ctx.fillRect(px, py, tileSize, edgeW);
    }
    if(diffS) {
      const c = tileColor(nb.s);
      ctx.fillStyle = edgeGradient(px, py + tileSize, px, py + tileSize - edgeW, c);
      ctx.fillRect(px, py + tileSize - edgeW, tileSize, edgeW);
    }
    if(diffW) {
      const c = tileColor(nb.w);
      ctx.fillStyle = edgeGradient(px, py, px + edgeW, py, c);
      ctx.fillRect(px, py, edgeW, tileSize);
    }
    if(diffE) {
      const c = tileColor(nb.e);
      ctx.fillStyle = edgeGradient(px + tileSize, py, px + tileSize - edgeW, py, c);
      ctx.fillRect(px + tileSize - edgeW, py, edgeW, tileSize);
    }

    // Rounded corner blending (do not require diagonal diff)
    if(diffN && diffW) {
      const c = tileColor(nb.n === nb.w ? nb.n : nb.n);
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, c + 'dd');
      g.addColorStop(1, c + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, r, Math.PI, 1.5 * Math.PI);
      ctx.closePath();
      ctx.fill();
    }
    if(diffN && diffE) {
      const c = tileColor(nb.n === nb.e ? nb.n : nb.n);
      const g = ctx.createRadialGradient(px + tileSize, py, 0, px + tileSize, py, r);
      g.addColorStop(0, c + 'dd');
      g.addColorStop(1, c + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(px + tileSize, py);
      ctx.arc(px + tileSize, py, r, 1.5 * Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    }
    if(diffS && diffE) {
      const c = tileColor(nb.s === nb.e ? nb.s : nb.s);
      const g = ctx.createRadialGradient(px + tileSize, py + tileSize, 0, px + tileSize, py + tileSize, r);
      g.addColorStop(0, c + 'dd');
      g.addColorStop(1, c + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(px + tileSize, py + tileSize);
      ctx.arc(px + tileSize, py + tileSize, r, 0, 0.5 * Math.PI);
      ctx.closePath();
      ctx.fill();
    }
    if(diffS && diffW) {
      const c = tileColor(nb.s === nb.w ? nb.s : nb.s);
      const g = ctx.createRadialGradient(px, py + tileSize, 0, px, py + tileSize, r);
      g.addColorStop(0, c + 'dd');
      g.addColorStop(1, c + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(px, py + tileSize);
      ctx.arc(px, py + tileSize, r, 0.5 * Math.PI, Math.PI);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function viewportSize() {
    const root = document.documentElement;
    const w = Math.max(1, (window.visualViewport && window.visualViewport.width) || root.clientWidth || window.innerWidth || 1);
    const h = Math.max(1, (window.visualViewport && window.visualViewport.height) || root.clientHeight || window.innerHeight || 1);
    return { w: Math.floor(w), h: Math.floor(h) };
  }

  function resizeCanvas() {
    const vp = viewportSize();
    canvas.width = vp.w;
    canvas.height = vp.h;
    VIEW_COLS = Math.ceil(canvas.width / TILE_SIZE);
    VIEW_ROWS = Math.ceil(canvas.height / TILE_SIZE);
    if(theMap.length > 0) drawMap();
  }
  window.addEventListener('resize', resizeCanvas);

  // B12 FIX: The one-shot orb-fill hide ran here before WebGL.start() was ever
  // called, so WebGLFX.state.active was always false and the CSS fills were never
  // hidden. The hide logic is now inside updateUI() where it runs on every frame
  // after WebGL has had time to initialize.

  // Continuous render loop for time-based animations (floating text, damage tint, etc.)
  function needsAnimatedMapRedraw() {
    if(currentLevel === 3 && !!window._eagleSkyTiles && (!!window._eagleCragEntered || !!(window._eagleDoor && window._eagleDoor.opened))) return true;
    if(activeEffects.length > 0) return true;
    return !!(window.WebGLFX && WebGLFX.needsMapAnimation && WebGLFX.needsMapAnimation());
  }

  // #14: Wind SFX + cloud speed in Eagle's Crag
  // Schedule intermittent wind gusts when player is in eagle crag
  window._windGustActive = false;
  window._nextWindGust = 0;
  function maybePlayWindGust(animNow) {
    if(!window._eagleSkyTiles) return;
    const now = Date.now();
    if(now >= window._nextWindGust) {
      window._nextWindGust = now + 15000 + Math.random() * 30000; // 15–45s between gusts
      window._windGustActive = true;
      window._windGustEnd = now + 5000;
      Sound.playSample('wind_gust', 0.6);
    }
    if(window._windGustActive && now > window._windGustEnd) {
      window._windGustActive = false;
    }
  }

  function drawEagleSkyTile(px, py, mapX, mapY, animNow) {
    let grad = ctx.createLinearGradient(px, py, px, py + TILE_SIZE);
    grad.addColorStop(0, '#8ed6ff');
    grad.addColorStop(0.55, '#63b6ff');
    grad.addColorStop(1, '#3477d6');
    ctx.fillStyle = grad;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    // #14: Cloud drift speeds up during wind gusts
    const windMult = (window._windGustActive) ? 4.0 : 1.0;
    let cloudDrift = (animNow * 0.018 * windMult + mapY * 11) % (TILE_SIZE * 4);
    let cloudX = px + cloudDrift - TILE_SIZE * 2;
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(cloudX + 6, py + 11, 6, 0, Math.PI * 2);
    ctx.arc(cloudX + 14, py + 9, 7, 0, Math.PI * 2);
    ctx.arc(cloudX + 22, py + 11, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  
  function calculateFOV() {
    for(let y=0; y<mapH; y++) if(visible[y]) visible[y].fill(false);
    if(window.debugFlags && debugFlags.fullLight) {
      for(let y=0; y<mapH; y++) { visible[y].fill(true); explored[y].fill(true); }
      _emitSawVerminIfFirstTime();
      return;
    }
    let sightLimit = lightTurns > 0 ? 15 : 5;
    if(darkMap[player.y] && darkMap[player.y][player.x] && lightTurns <= 0) {
      visible[player.y][player.x] = true; explored[player.y][player.x] = true;
      return; 
    }
    visible[player.y][player.x] = true; explored[player.y][player.x] = true;
    for(let angle=0; angle<360; angle+=2) {
      let rad = angle * Math.PI / 180;
      let dx = Math.cos(rad), dy = Math.sin(rad);
      let cx = player.x + 0.5, cy = player.y + 0.5;
      for(let r=1; r<=sightLimit; r++) {
        cx += dx; cy += dy;
        let mapX = Math.floor(cx), mapY = Math.floor(cy);
        if(mapX < 0 || mapY < 0 || mapX >= mapW || mapY >= mapH) break;
        visible[mapY][mapX] = true; explored[mapY][mapX] = true;
        if(theMap[mapY][mapX] === TILES.WALL || (window._eagleDoor && !window._eagleDoor.opened && mapX === window._eagleDoor.x && mapY === window._eagleDoor.y)) break;
        if(darkMap[mapY][mapX] && lightTurns <= 0) break;
      }
    }
    _emitSawVerminIfFirstTime();
  }

  // Fires the `saw_vermin` quest event the first time the player has a vermin
  // in their FOV. Matches the kill counter's allowlist so the quest can't be
  // started by sighting a creature that wouldn't count toward completion.
  function _emitSawVerminIfFirstTime() {
    if(window._sawVerminFired) return;
    if(typeof QuestEngine === 'undefined' || !enemies || !visible) return;
    for(const e of enemies) {
      if((e.type === 'mouse' || e.type === 'cockroach') &&
         visible[e.y] && visible[e.y][e.x]) {
        window._sawVerminFired = true;
        QuestEngine.emit('saw_vermin', {});
        return;
      }
    }
  }

  function getFloorItemSprite(item) {
    if(!(window.useSprites && assets.sprites)) return null;
    if(assets.sprites[item.icon]) return assets.sprites[item.icon];
    if(item.itemName === 'sword')                  return assets.sprites['sword'];
    if(item.itemName === 'healthPotion')           return assets.sprites['potion'];
    if(item.itemName === 'certifiedPastafarian')   return assets.sprites['scroll'];
    if(item.itemName === 'gold')                   return assets.sprites['coin'];
    return null;
  }

  function drawFloorItemGlyph(targetCtx, item, px, py) {
    const sprite = getFloorItemSprite(item);
    if(sprite && sprite.complete && sprite.naturalWidth > 32) {
      targetCtx.drawImage(sprite, px + 4, py + 4, 24, 24);
      return;
    }
    targetCtx.save();
    targetCtx.font = '20px sans-serif';
    targetCtx.textAlign = 'left';
    targetCtx.textBaseline = 'alphabetic';
    targetCtx.fillText(item.icon, px + 4, py + 24);
    targetCtx.restore();
  }

  function drawCorpseGlyph(targetCtx, corpse, px, py, maskOnly) {
    if(corpse.isBones && corpse.icon === 'BONES_PILE') {
      targetCtx.save();
      targetCtx.font = '14px sans-serif';
      targetCtx.textAlign = 'center';
      targetCtx.textBaseline = 'middle';
      targetCtx.fillText('🦴', px + TILE_SIZE / 2 - 3, py + TILE_SIZE / 2 + 2);
      targetCtx.translate(px + TILE_SIZE / 2 + 3, py + TILE_SIZE / 2 - 2);
      targetCtx.rotate(0.8);
      targetCtx.fillText('🦴', 0, 0);
      targetCtx.restore();
      return;
    }
    if(!corpse.isBones) {
      targetCtx.save();
      if(!maskOnly) {
        targetCtx.globalAlpha = 0.75;
        targetCtx.filter = 'grayscale(80%) brightness(60%)';
      }
      targetCtx.transform(1, 0, -0.2, 0.66, px + TILE_SIZE * 0.15, py + TILE_SIZE * 0.2);
      targetCtx.font = '18px sans-serif';
      targetCtx.textAlign = 'left';
      targetCtx.textBaseline = 'top';
      targetCtx.fillText(corpse.icon, 0, 0);
      targetCtx.restore();
      if(!maskOnly) {
        targetCtx.save();
        targetCtx.globalAlpha = 0.18;
        targetCtx.fillStyle = '#555';
        targetCtx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        targetCtx.restore();
      }
      return;
    }
    targetCtx.save();
    targetCtx.font = '14px sans-serif';
    targetCtx.textAlign = 'center';
    targetCtx.textBaseline = 'middle';
    targetCtx.fillText('🦴', px + TILE_SIZE / 2, py + TILE_SIZE / 2);
    targetCtx.restore();
  }

  function drawFootprintGlow(drawGlyph, px, py, color) {
    const pad = 10;
    const size = TILE_SIZE + pad * 2;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = size;
    maskCanvas.height = size;
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.fillStyle = '#fff';
    drawGlyph(maskCtx, pad, pad, true);
    maskCtx.globalCompositeOperation = 'source-in';
    maskCtx.fillStyle = '#fff';
    maskCtx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.globalAlpha = color === '#9a9a9a' ? 0.6 : 0.92;
    ctx.shadowColor = color;
    ctx.shadowBlur = color === '#ff4d4d' ? 14 : 10;
    ctx.drawImage(maskCanvas, px - pad, py - pad);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = color === '#9a9a9a' ? 0.2 : 0.35;
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => {
      ctx.drawImage(maskCanvas, px - pad + dx, py - pad + dy);
    });
    ctx.restore();
  }

  function drawMap() {
    if(!ctx) return;
    // Update debug console stats chips
    if(typeof updateDebugChips === 'function') updateDebugChips();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let cx = Math.floor(VIEW_COLS / 2), cy = Math.floor(VIEW_ROWS / 2);
    const animNow = performance.now();
    maybePlayWindGust(animNow);

    // #13: Background art scenes — draw image behind the tile layer
    // Each scene has a registered bg sprite key and an optional boundary map
    const BG_SCENE_MAP = {
      'nest':      'bg_roc_nest',
      'champion':  'bg_hall_of_champions',
      'eagle_crag': 'bg_eagle_s_crag'
    };
    if(BG_SCENE_MAP[currentScene] && window.assets && assets.sprites) {
      const bgSprite = assets.sprites[BG_SCENE_MAP[currentScene]];
      if(bgSprite && bgSprite.complete && bgSprite.naturalWidth > 32) {
        // Scale to fill canvas, maintaining aspect ratio (cover)
        const sw = bgSprite.naturalWidth, sh = bgSprite.naturalHeight;
        const scale = Math.max(canvas.width / sw, canvas.height / sh);
        const bw = sw * scale, bh = sh * scale;
        const bx = (canvas.width - bw) / 2, by = (canvas.height - bh) / 2;
        ctx.drawImage(bgSprite, bx, by, bw, bh);

        // Apply camera offset based on player position (parallax)
        // Tiles are still drawn on top with BG_SCENE tiles being transparent
      }
    }

    // Per-level wall and floor tints — visually distinct per dungeon level
    const levelPalettes = [
      { wall: '#4A4458', floor: '#2A2830' },  // 1 – purple dungeon
      { wall: '#2e4536', floor: '#1a2b20' },  // 2 – dark green
      { wall: '#45322e', floor: '#2b1e1a' },  // 3 – dark brown
      { wall: '#2e3845', floor: '#1a2230' },  // 4 – dark blue
      { wall: '#452e41', floor: '#2b1a28' },  // 5 – dark magenta
      { wall: '#554433', floor: '#332a20' },  // 6 – ochre
      { wall: '#334455', floor: '#1e2a35' },  // 7 – steel blue
      { wall: '#553344', floor: '#35202b' },  // 8 – crimson stone
      { wall: '#445533', floor: '#2a3520' },  // 9 – mossy
      { wall: '#553322', floor: '#35200f' },  // 10 – lava red
    ];
    const palette = currentLevel === 0
      ? { wall: '#666a70', floor: '#2A4A1A' }  // Tristram: gray brick walls
      : (levelPalettes[Math.max(0, (currentLevel - 1)) % levelPalettes.length] || { wall: '#4A4458', floor: '#2A2830' });
    const wCol = palette.wall;
    const fCol = palette.floor;

    for (let y = 0; y < VIEW_ROWS; y++) {
      let mapY = player.y + y - cy; 
      for (let x = 0; x < VIEW_COLS; x++) {
        let mapX = player.x + x - cx; 
        if (mapY >=0 && mapY < mapH && mapX >= 0 && mapX < mapW) {
          if (!explored[mapY][mapX] && !(window.debugFlags && debugFlags.revealMap)) continue;
          let tile = theMap[mapY][mapX];
          let isVis = visible[mapY][mapX] || (window.debugFlags && debugFlags.revealMap);
          let isDark = darkMap[mapY][mapX];
          let px = x * TILE_SIZE, py = y * TILE_SIZE;

          // Always use color-fill for tiles to avoid isometric sprite gaps
          // Sprites are only used for entities (monsters, items), not terrain
          if(tile === TILES.WALL) {
            ctx.fillStyle = wCol; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            // Subtle top-edge highlight for depth
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(px, py, TILE_SIZE, 3);
            if(currentLevel === 0) {
              ctx.strokeStyle = 'rgba(20,20,20,0.35)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(px, py + TILE_SIZE * 0.35); ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE * 0.35);
              ctx.moveTo(px, py + TILE_SIZE * 0.72); ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE * 0.72);
              ctx.moveTo(px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.35); ctx.lineTo(px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.72);
              ctx.stroke();
              ctx.save();
              ctx.globalAlpha = 0.22;
              ctx.font = `${Math.floor(TILE_SIZE * 0.9)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('🧱', px + TILE_SIZE / 2, py + TILE_SIZE / 2);
              ctx.restore();
            }
          }
          else if(tile === TILES.SECRET_WALL) {
            // Slightly offcolor wall panel — looks almost like a regular wall
            // but with a visible crack line so players can find it.
            let sc = wCol.replace(/[0-9a-fA-F]/g, (c, i) => {
              let v = parseInt(c, 16);
              return ((v + 1) % 16).toString(16);
            });
            ctx.fillStyle = sc; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            // Visible crack line hint (brighter than before)
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px + TILE_SIZE * 0.25, py + TILE_SIZE * 0.15);
            ctx.lineTo(px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.5);
            ctx.lineTo(px + TILE_SIZE * 0.75, py + TILE_SIZE * 0.85);
            ctx.stroke();
            // Subtle shimmer
            ctx.save();
            ctx.globalAlpha = 0.06 + 0.04 * Math.sin(animNow * 0.002 + mapX * 3 + mapY * 7);
            ctx.fillStyle = '#a0d0ff';
            ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            ctx.restore();
          }
          else if(tile === TILES.FLOOR) {
            if(currentScene === 'town') {
              let n = tileNoise(mapX, mapY);
              ctx.fillStyle = n > 0.66 ? '#74614a' : n > 0.33 ? '#6a5741' : '#5e4b37';
              ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
              ctx.strokeStyle = 'rgba(255,255,255,0.08)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(px + 4, py + 8 + (mapX % 3));
              ctx.lineTo(px + TILE_SIZE - 4, py + 6 + (mapY % 4));
              ctx.stroke();
            } else {
              ctx.fillStyle = fCol;
              ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }
          }
          else if(tile === TILES.STAIR_UP) {
            ctx.fillStyle = fCol; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('⬆️', px+TILE_SIZE/2, py+TILE_SIZE/2);
          }
          else if(tile === TILES.STAIR_DOWN) {
            ctx.fillStyle = fCol; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('⬇️', px+TILE_SIZE/2, py+TILE_SIZE/2);
          }
          else if(tile === TILES.OPEN_GATE) {
            // Open stone gate — rendered as walkable floor with a gateway arch
            ctx.fillStyle = fCol; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = '#8b7355'; ctx.lineWidth = 2;
            // Stone arch posts on left/right edges of tile
            ctx.fillStyle = '#7a6549';
            ctx.fillRect(px, py + 4, 4, TILE_SIZE - 4);
            ctx.fillRect(px + TILE_SIZE - 4, py + 4, 4, TILE_SIZE - 4);
            // Arch top
            ctx.beginPath();
            ctx.arc(px + TILE_SIZE/2, py + 6, TILE_SIZE/2 - 2, Math.PI, 0);
            ctx.strokeStyle = '#8b7355'; ctx.lineWidth = 2; ctx.stroke();
            // Ground (dirt path through gate)
            ctx.fillStyle = '#5a4a38';
            ctx.fillRect(px + 4, py + TILE_SIZE - 8, TILE_SIZE - 8, 8);
          }
          // (Chest tiles retired in Phase 6c. Chests are container
          // Lootables now, drawn by the unified Lootable render loop
          // further down in this file.)
          else if(tile === TILES.STORE) {
            ctx.fillStyle = '#2A3A2A'; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.font = `${Math.floor(TILE_SIZE * 4)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const isMendedDrum = (window._mendedDrumX === mapX && window._mendedDrumY === mapY);
            ctx.fillText(isMendedDrum ? '🍻' : '🏪', px+TILE_SIZE/2, py+TILE_SIZE/2);
          }
          else if(tile === TILES.SCUMM_BAR) {
            ctx.fillStyle = '#2b1e0f';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            // User request: SCUMMbar uses a 500% beer icon sprite.
            ctx.font = `${Math.floor(TILE_SIZE * 5)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🍻', px + TILE_SIZE / 2, py + TILE_SIZE / 2);
          }
          else if(tile === TILES.ANTIQUE_SHOP) {
            ctx.fillStyle = '#3b2f1d';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.font = `${Math.floor(TILE_SIZE * 4)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🕰️', px + TILE_SIZE / 2, py + TILE_SIZE / 2);
          }
          else if(tile === TILES.BOAT) {
            ctx.fillStyle = '#0f3c6e';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.font = `${Math.floor(TILE_SIZE * 4)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🛶', px + TILE_SIZE / 2, py + TILE_SIZE / 2);
          }
          else if(tile === TILES.LEFTYS) {
            ctx.fillStyle = '#2A2A3A'; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.font = `${Math.floor(TILE_SIZE * 4)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('🍺', px+TILE_SIZE/2, py+TILE_SIZE/2);
          }
          else if(tile === TILES.BOOKSTORE) {
            ctx.fillStyle = '#2A2A3A'; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.font = `${Math.floor(TILE_SIZE * 4)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('📚', px+TILE_SIZE/2, py+TILE_SIZE/2);
          }
          else if(tile === TILES.FORGE) {
            ctx.fillStyle = '#3A2A1A'; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.font = `${Math.floor(TILE_SIZE * 4)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('🔥', px+TILE_SIZE/2, py+TILE_SIZE/2);
          }
          else if(tile === TILES.HALL) {
            ctx.fillStyle = '#2A2A1A'; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.font = `${Math.floor(TILE_SIZE * 4)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('🏛️', px+TILE_SIZE/2, py+TILE_SIZE/2);
          }
          else if(tile === TILES.MACHINE) {
            // Atlantean machine — pulses with a faint blue glow
            let pulse = 0.5 + 0.5 * Math.sin(Date.now() / 600);
            ctx.fillStyle = `rgba(0, 80, 180, ${0.4 + 0.3 * pulse})`;
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('⚙️', px+TILE_SIZE/2, py+TILE_SIZE/2);
          }
          else if(tile === TILES.PORTAL) {
            // Town portal: show dirt when no active portal, portal effect when open
            const portalActive = !!(window._portalPos);
            if(portalActive) {
              ctx.fillStyle = fCol; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
              // High-quality Navier-Stokes fluid simulation
              let drewFluid = false;
              if(window.WebGLFX && WebGLFX.drawPortalFluid) {
                drewFluid = WebGLFX.drawPortalFluid(ctx, px, py, TILE_SIZE, animNow);
              }
              if(!drewFluid) {
                // Fallback: pulsing purple glow + spinning emoji at 30 RPM
                const pulse = 0.5 + 0.5 * Math.sin(animNow * 0.004);
                ctx.fillStyle = `rgba(120,0,200,${0.3 + 0.2*pulse})`;
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                ctx.save();
                ctx.translate(px + TILE_SIZE/2, py + TILE_SIZE/2);
                ctx.rotate(animNow * 0.001 * Math.PI);
                ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('🌀', 0, 0);
                ctx.restore();
              }
            } else {
              // No active portal — just show dirt/floor
              ctx.fillStyle = fCol; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }
            // Draw cast animation if active (renders around the player, not the tile)
            if(window.WebGLFX && WebGLFX.drawPortalCastEffect) {
              const playerScreenX = cx * TILE_SIZE;
              const playerScreenY = cy * TILE_SIZE;
              WebGLFX.drawPortalCastEffect(ctx, playerScreenX, playerScreenY, TILE_SIZE, animNow);
            }
          }
          else if(tile === TILES.WATER) {
            if(currentScene === 'town') {
              ctx.fillStyle = '#2b87d1';
              ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
              ctx.strokeStyle = 'rgba(255,255,255,0.18)';
              ctx.beginPath();
              ctx.moveTo(px + 2, py + 9 + (mapX % 3));
              ctx.lineTo(px + TILE_SIZE - 2, py + 12 + (mapY % 2));
              ctx.stroke();
            } else {
              ctx.fillStyle = '#1565C0';
              ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }
          }
          else if(tile === TILES.DEEP_WATER) {
            if(isEagleSkyTile(mapX, mapY)) {
              drawEagleSkyTile(px, py, mapX, mapY, animNow);
            } else {
              ctx.fillStyle = '#0D47A1';
              ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }
          }
          else if(tile === TILES.SAND) { ctx.fillStyle = '#C2A04A'; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE); }
          else if(tile === TILES.BG_SCENE) {
            // #13: Background art tile — transparent, background image shows through
            // Optionally draw a subtle semi-transparent walkable path indicator
            // when debug mode is on
            if(window.debugFlags && debugFlags.showBgBounds) {
              ctx.fillStyle = 'rgba(0,255,0,0.08)';
              ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }
          }
          else if(tile === TILES.GRASS) {
            let n = tileNoise(mapX, mapY);
            // Ground fill — colour varies with noise
            ctx.fillStyle = n > 0.66 ? '#3a7421' : n > 0.33 ? '#2f641d' : '#2a5718';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

            // B756.WEBGL: animate heavy grass blades only for currently visible tiles.
            if(isVis) {
              // ── Grass height from smooth height map ─────────────────────────
              // grassHeight() returns 0..1; map to GRASS_MIN_H..GRASS_MAX_H pixels
              const gh = grassHeight(mapX, mapY);
              const baseBladeH = GRASS_MIN_H + gh * (GRASS_MAX_H - GRASS_MIN_H);

              // Distance from player for grass-parting effect
              const gdx = mapX - player.x;
              const gdy = mapY - player.y;
              const gDist = Math.sqrt(gdx * gdx + gdy * gdy);
              const isParting = gDist < 1.5;
              const partOffX = isParting ? gdx * (1.5 - gDist) * 4 : 0;
              const partOffY = isParting ? gdy * (1.5 - gDist) * 4 : 0;

              const bladeCount = currentScene === 'town' ? 6 : 4;
              ctx.save();
              for(let b = 0; b < bladeCount; b++) {
                let bx = px + 2 + (b * 4 + mapX % 3);
                let by = py + TILE_SIZE - 4;
                // Per-blade micro-variation on top of the tile's smooth height
                let bh = baseBladeH * (0.7 + 0.3 * tileNoise(mapX * 7 + b, mapY * 13 + b * 3));
                let lean = ((mapX + b * 5) % 3) - 1;
                ctx.strokeStyle = n > 0.5
                  ? `rgba(120,190,60,${0.5 + b * 0.07})`
                  : `rgba(90,160,40,${0.45 + b * 0.07})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(bx + partOffX, by + partOffY);
                ctx.quadraticCurveTo(
                  bx + lean * 2 + partOffX * 0.5,
                  by - bh * 0.5 + partOffY * 0.5,
                  bx + lean * 3 + partOffX,
                  by - bh + partOffY
                );
                ctx.stroke();
              }
              // Subtle lighter highlight on taller grass patches
              if(gh > 0.5) {
                ctx.fillStyle = `rgba(200,240,140,${0.03 + gh * 0.05})`;
                ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, 3);
              }
              ctx.restore();
            }
          }
          else if(tile === TILES.TREE) {
            ctx.fillStyle = '#2E5A1C'; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.textAlign = 'center';
            if(currentScene === 'town') {
              const avatarBase = TILE_SIZE * 1.5;
              const scale = 1 + tileNoise(mapX * 9 + 17, mapY * 9 + 31) * 3; // 100%-400% of avatar size
              const treeSize = Math.floor(avatarBase * scale);
              ctx.font = `${treeSize}px sans-serif`;
              ctx.textBaseline = 'alphabetic';
              ctx.fillText('🌳', px + TILE_SIZE / 2, py + TILE_SIZE + Math.max(2, Math.floor(TILE_SIZE * 0.1)));
            } else {
              ctx.font = '18px sans-serif';
              ctx.textBaseline = 'middle';
              ctx.fillText('🌳', px + TILE_SIZE / 2, py + TILE_SIZE / 2);
            }
          }
          else if(tile === TILES.BUSH) {
            ctx.fillStyle = currentScene === 'town' ? '#305f1f' : '#2b5a1b';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(currentScene === 'town' ? '🌿' : '🌱', px+TILE_SIZE/2, py+TILE_SIZE/2);
          }
          else if(tile === TILES.ROCK) {
            if(currentScene === 'town') {
              ctx.fillStyle = '#6e6a67';
              ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
              ctx.fillStyle = '#8a8680';
              ctx.fillRect(px + 2, py + 6, TILE_SIZE - 4, TILE_SIZE - 10);
              ctx.fillStyle = '#4c4845';
              ctx.fillRect(px + 2, py + TILE_SIZE - 7, TILE_SIZE - 4, 3);
            } else {
              ctx.fillStyle = '#4A4A4A'; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
              ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText('🪨', px+TILE_SIZE/2, py+TILE_SIZE/2);
            }
          }
          else if(tile === TILES.MOAT) { ctx.fillStyle = '#1565C0'; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE); }
          else if(tile === TILES.BRIDGE) {
            // #8 FIX: Rotated 90° CW — bridge runs E/W (planks run N/S, rails run E/W)
            ctx.fillStyle = '#5f4428';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            // Planks run N/S (vertical in tile = E/W orientation)
            ctx.fillStyle = '#8b6840';
            for(let bx = 3; bx < TILE_SIZE; bx += 6) {
              ctx.fillRect(px + bx, py, 3, TILE_SIZE);
            }
            // Rail cross-beams run E/W (horizontal in tile)
            ctx.fillStyle = '#3c2a18';
            ctx.fillRect(px, py + 3, TILE_SIZE, 3);
            ctx.fillRect(px, py + TILE_SIZE - 6, TILE_SIZE, 3);
          }
          else if(tile === TILES.CASTLE_DOOR) {
            ctx.fillStyle = '#5C4033'; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('🚪', px+TILE_SIZE/2, py+TILE_SIZE/2);
          }
          else if(tile === TILES.BLADE) {
            ctx.fillStyle = fCol; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('⚔️', px+TILE_SIZE/2, py+TILE_SIZE/2);
          }
          else if(tile === TILES.LETTER) {
            ctx.fillStyle = '#C2A04A'; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.font = '12px bold sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#900'; ctx.fillText(window.letterMap ? (window.letterMap[`${mapX},${mapY}`]||'?') : '?', px+TILE_SIZE/2, py+TILE_SIZE/2);
          }
          else {
            // Any unhandled tile: use floor color
            ctx.fillStyle = isDark && lightTurns <= 0 ? '#000' : fCol;
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          }

          if(isVis && window.WebGLFX && WebGLFX.drawGrassUnderlay && (currentScene === 'town' || window._eagleCragBounds)) {
            WebGLFX.drawGrassUnderlay(ctx, px, py, mapX, mapY, animNow);
          }

          // E23: Tile edge smoothing — feathered gradients at terrain transitions
          if(window.tileSmoothing !== false) {
            drawTileEdgeSmoothing(ctx, mapX, mapY, px, py, TILE_SIZE, animNow);
          }

          // Explored-but-not-visible tiles get a subtle desaturation tint
          // The radial gradient overlay handles main lighting; this just darkens explored-only tiles
          if (!isVis) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }

    // SPRITE BUG FIX: reset text state after tile rendering loop
    // to prevent leaked textAlign/textBaseline from tile emoji affecting entity draw
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Draw Lootables (floor piles + placed containers). Each draws its
    // .icon — floor piles auto-derive from first slot; containers use
    // their def.icon. Locked containers overlay a 🔒 badge.
    zone.entities.forEach((l) => {
      if (!(typeof Lootable !== 'undefined' && l instanceof Lootable)) return;
      if (l.ownerKind !== 'floor' && l.ownerKind !== 'container') return;
      if (l.ownerKind === 'floor' && l.size() === 0) return;
      let vx = l.x - player.x + cx, vy = l.y - player.y + cy;
      if(vx >= 0 && vx < VIEW_COLS && vy >= 0 && vy < VIEW_ROWS && visible[l.y] && visible[l.y][l.x]) {
        const tilePx = vx * TILE_SIZE;
        const tilePy = vy * TILE_SIZE;
        const flashActive = l._flashRed && Date.now() - l._flashRed < 250;
        const hoverActive = window._hoverFloorItemIdx === zone.entities.indexOf(l);
        const glowColor = flashActive ? '#ff4d4d' : hoverActive ? (window._hoverFloorItemReachable ? '#ffffff' : '#9a9a9a') : null;
        // Pass the lootable itself — drawFloorItemGlyph reads `.icon`,
        // which works for both ItemStack (slot in floor pile) and a
        // container Lootable (icon set at construction from def).
        const drawTarget = (l.ownerKind === 'floor') ? l.slots[0] : l;
        if(glowColor) drawFootprintGlow((targetCtx, glyphPx, glyphPy) => drawFloorItemGlyph(targetCtx, drawTarget, glyphPx, glyphPy), tilePx, tilePy, glowColor);
        drawFloorItemGlyph(ctx, drawTarget, tilePx, tilePy);
        // Lock badge for locked containers.
        if (l.ownerKind === 'container' && l.isLocked) {
          ctx.save();
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillText('🔒', tilePx + TILE_SIZE - 2, tilePy + 1);
          ctx.restore();
        }
      }
    });

    // E16: Draw active bombs with pulsing glow and countdown timer
    if(window._activeBombs && window._activeBombs.length > 0) {
      for(const bomb of window._activeBombs) {
        const bvx = bomb.x - player.x + cx, bvy = bomb.y - player.y + cy;
        if(bvx < 0 || bvx >= VIEW_COLS || bvy < 0 || bvy >= VIEW_ROWS) continue;
        if(!visible[bomb.y] || !visible[bomb.y][bomb.x]) continue;
        const bpx = bvx * TILE_SIZE;
        const bpy = bvy * TILE_SIZE;
        const age = (performance.now() - bomb.startTime) / 1000;
        const frac = Math.min(1, age / bomb.maxTimer);
        const pulseFreq = 1 + frac * 8;
        const pulse = Math.sin(performance.now() * 0.006 * pulseFreq) > 0;
        ctx.save();
        if(pulse && frac > 0.3) {
          ctx.shadowColor = `rgba(255,${Math.floor(100*(1-frac))},0,0.8)`;
          ctx.shadowBlur = 8 + frac * 20;
        }
        ctx.font = `${Math.floor(TILE_SIZE * 0.9)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bomb.icon, bpx + TILE_SIZE/2, bpy + TILE_SIZE/2);
        // Countdown timer display
        const remaining = Math.ceil(bomb.maxTimer - age);
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = frac > 0.7 ? '#f00' : '#ff8';
        ctx.shadowBlur = 0;
        ctx.fillText(remaining, bpx + TILE_SIZE - 4, bpy + 8);
        ctx.restore();
      }
    }

    // Draw Corpses
    {
      zone.corpses.forEach((c, cIdx) => {
        let vx = c.x - player.x + cx, vy = c.y - player.y + cy;
        if(vx >= 0 && vx < VIEW_COLS && vy >= 0 && vy < VIEW_ROWS && (visible[c.y] && visible[c.y][c.x] || explored[c.y] && explored[c.y][c.x])) {
          const tilePx = vx * TILE_SIZE;
          const tilePy = vy * TILE_SIZE;
          const flashActive = c._flashRed && Date.now() - c._flashRed < 250;
          const hoverActive = window._hoverCorpseIdx === cIdx;
          const glowColor = flashActive ? '#ff4d4d' : hoverActive ? (window._hoverCorpseReachable ? '#ffffff' : '#9a9a9a') : null;
          if(glowColor) drawFootprintGlow((targetCtx, glyphPx, glyphPy) => drawCorpseGlyph(targetCtx, c, glyphPx, glyphPy, true), tilePx, tilePy, glowColor);
          drawCorpseGlyph(ctx, c, tilePx, tilePy, false);
          // Loot count indicator
          const lootCount = (c.lootable && c.lootable.slots) ? c.lootable.slots.length : 0;
          if(lootCount > 0 && !c.isBones) {
            ctx.fillStyle = '#FFD700'; ctx.font = 'bold 9px sans-serif';
            ctx.fillText(lootCount, vx*TILE_SIZE + TILE_SIZE - 4, vy*TILE_SIZE + 10);
          }
        }
      });
    }

    // Draw Enemies
    enemies.forEach(e => {
      let vx = e.x - player.x + cx, vy = e.y - player.y + cy;
      if(vx >= 0 && vx < VIEW_COLS && vy >= 0 && vy < VIEW_ROWS && visible[e.y][e.x]) {
        let sprite = null;
        if(window.useSprites && assets.sprites) {
          if(assets.sprites[e.type]) sprite = assets.sprites[e.type];
          else if(e.type === 'slime') sprite = assets.sprites['slime'];
          else if(e.type === 'skeleton') sprite = assets.sprites['skeleton'];
          else if(e.type === 'bat') sprite = assets.sprites['bat'];
          else if(e.type === 'ghost') sprite = assets.sprites['ghost'];
          else if(e.type === 'dragon') sprite = assets.sprites['dragon'];
          else if(e.type === 'black_knight') sprite = assets.sprites['black_knight'];
          else if(e.type === 'killer_rabbit') sprite = assets.sprites['rabbit'];
          else if(e.type === 'wizard') sprite = assets.sprites['wizard'];
        }
        const renderScale = e.stats.renderScale || (e.stats.isBig ? 2 : (e.stats.isBoss ? 1.8 : 1));
        let drawSize = TILE_SIZE * renderScale;
        if(e.type === 'ifrit' && e.isIfrit) drawSize *= 1.25;
        let drawOffset = (TILE_SIZE - drawSize) / 2;
        const px = vx * TILE_SIZE + drawOffset;
        const py = vy * TILE_SIZE + drawOffset;
        const drewIfrit = !!(e.type === 'ifrit' && e.isIfrit && window.WebGLFX && WebGLFX.drawIfritAura && WebGLFX.drawIfritAura(ctx, px, py, drawSize, animNow, e));
        ctx.save();
        // SPRITE BUG FIX: always reset text alignment before drawing enemy glyphs
        // to avoid inheriting stale values from tile rendering above
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        // Flip horizontally when moving right (emojis face left by default)
        const flipX = e._lastDx > 0;
        if(flipX) {
          ctx.save();
          ctx.translate(px + drawSize / 2, py + drawSize / 2);
          ctx.scale(-1, 1);
          ctx.translate(-(px + drawSize / 2), -(py + drawSize / 2));
        }
        if(drewIfrit) {
          // Ifrit has its own WebGL avatar draw; do not overlay emoji fallback.
        } else if(sprite && sprite.complete && sprite.naturalWidth > 32) {
          ctx.drawImage(sprite, px, py, drawSize, drawSize);
        } else {
          let minFont = (e.type === 'fly' || e.type === 'mosquito') ? 6 : 10;
          let fontSize = Math.max(minFont, Math.round(24 * renderScale));
          ctx.font = `${fontSize}px sans-serif`;
          const offX = (drawSize - fontSize) / 2;
          const offY = (drawSize - fontSize) / 2;
           ctx.fillText(e.icon || e.stats.icon || '?', px + offX, py + offY);
        }
        if(flipX) ctx.restore();
        ctx.restore();

        // HP Bar
        ctx.fillStyle = 'red'; ctx.fillRect(vx*TILE_SIZE, vy*TILE_SIZE-4, TILE_SIZE, 3);
        let maxHp = MONSTER_DEF[e.type]?.hp || e.stats.hp;
        ctx.fillStyle = 'green'; ctx.fillRect(vx*TILE_SIZE, vy*TILE_SIZE-4, TILE_SIZE * (e.stats.hp / maxHp), 3);
      }
    });

    // Draw overworld ambiance objects (houses, huts)
    // B756.AVATAR_OPACITY: force normal alpha/filter in case prior draw passes altered state.
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    if(window._overworldAmbiance && currentScene === 'town') {
      window._overworldAmbiance.forEach(a => {
        const vx = a.x - player.x + cx;
        const vy = a.y - player.y + cy;
        if(vx >= -1 && vx <= VIEW_COLS && vy >= -1 && vy <= VIEW_ROWS && visible[a.y] && visible[a.y][a.x]) {
          const scale = a.scale ?? 3;
          const fontSize = Math.floor(TILE_SIZE * scale * 0.8);
          ctx.font = `${fontSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(a.emoji, vx * TILE_SIZE + TILE_SIZE / 2, vy * TILE_SIZE + TILE_SIZE / 2);
        }
      });
    }

    // Draw Player
    // Use drawAvatar() which handles warrior sprite sheets + procedural fallback
    let playerDrawn = false;
    if(window.PlayerSprites && window.useSprites && !window.PlayerSprites._skip) {
      playerDrawn = window.PlayerSprites.draw(ctx, cx*TILE_SIZE, cy*TILE_SIZE, TILE_SIZE);
    }
    if(!playerDrawn) {
      // Scale avatar slightly based on local grass height:
      // In tallest grass the avatar appears a few px smaller (partially obscured).
      // In shortest grass or non-grass tiles, full size.
      const playerTile = theMap[player.y] && theMap[player.y][player.x];
      let avatarSize = Math.floor(TILE_SIZE * 1.25);
      if(playerTile === TILES.GRASS) {
        const gh = grassHeight(player.x, player.y);
        // Tall grass (gh=1) → 88% size; short grass (gh=0) → full size
        avatarSize = Math.floor(TILE_SIZE * 1.25 * (1.0 - gh * 0.12));
      }
      drawAvatar(ctx, cx*TILE_SIZE, cy*TILE_SIZE, avatarSize);
    }

    // #13: Draw foreground tiles (avatar walks behind these) in background scenes
    if(window.BOUNDARY_DATA && window.BOUNDARY_DATA[currentScene]) {
      const fgTiles = window.BOUNDARY_DATA[currentScene].foreground || [];
      fgTiles.forEach(fg => {
        const vx = fg.x - player.x + cx, vy = fg.y - player.y + cy;
        if(vx >= 0 && vx < VIEW_COLS && vy >= 0 && vy < VIEW_ROWS) {
          // Draw semi-transparent overlay for foreground objects
          ctx.fillStyle = 'rgba(30,20,10,0.35)';
          ctx.fillRect(vx * TILE_SIZE, vy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          // Draw a subtle "behind" indicator
          ctx.fillStyle = 'rgba(255,200,100,0.15)';
          ctx.fillRect(vx * TILE_SIZE + 2, vy * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        }
      });
    }

    // Active Effects (Lightning etc)
    activeEffects = activeEffects.filter(eff => {
      let handled = false;
      if(window.WebGLFX) {
        if(eff.kind === 'chainLightning' && WebGLFX.drawChainLightning) {
          handled = WebGLFX.drawChainLightning(ctx, eff, player.x, player.y, cx, cy, TILE_SIZE, animNow);
        } else if((eff.kind === 'fireballTrail' || eff.kind === 'fireballBurst') && WebGLFX.drawFireballEffect) {
          handled = WebGLFX.drawFireballEffect(ctx, eff, player.x, player.y, cx, cy, TILE_SIZE, animNow);
        } else if(eff.kind === 'icebeam' && WebGLFX.drawIcebeamEffect) {
          handled = WebGLFX.drawIcebeamEffect(ctx, eff, player.x, player.y, cx, cy, TILE_SIZE, animNow);
        } else if(eff.kind === 'goldCoins' && WebGLFX.drawGoldCoinsEffect) {
          handled = WebGLFX.drawGoldCoinsEffect(ctx, eff, player.x, player.y, cx, cy, TILE_SIZE, animNow);
        }
      }
      if(!handled) {
        if(eff.kind === 'fireballTrail' || eff.kind === 'fireballBurst') {
          let fx = ((eff.x != null ? eff.x : eff.x2) - player.x + cx) * TILE_SIZE + 16;
          let fy = ((eff.y != null ? eff.y : eff.y2) - player.y + cy) * TILE_SIZE + 16;
          let radius = eff.kind === 'fireballBurst' ? 14 : 8;
          ctx.save();
          ctx.globalAlpha = eff.kind === 'fireballBurst' ? 0.55 : 0.35;
          ctx.fillStyle = eff.kind === 'fireballBurst' ? '#ffb347' : '#ff6a00';
          ctx.beginPath(); ctx.arc(fx, fy, radius, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        } else if(eff.kind === 'icebeam') {
          // Fallback ice beam — blue line
          let sx = ((eff.x1 - player.x + cx) * TILE_SIZE + TILE_SIZE / 2);
          let sy = ((eff.y1 - player.y + cy) * TILE_SIZE + TILE_SIZE / 2);
          let ex = ((eff.x2 - player.x + cx) * TILE_SIZE + TILE_SIZE / 2);
          let ey = ((eff.y2 - player.y + cy) * TILE_SIZE + TILE_SIZE / 2);
          ctx.strokeStyle = '#aef'; ctx.lineWidth = 3;
          ctx.shadowColor = '#4cf'; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.shadowBlur = 0;
        } else {
          ctx.strokeStyle = eff.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo((eff.x1-player.x+cx)*TILE_SIZE+16, (eff.y1-player.y+cy)*TILE_SIZE+16);
          ctx.lineTo((eff.x2-player.x+cx)*TILE_SIZE+16, (eff.y2-player.y+cy)*TILE_SIZE+16); ctx.stroke();
        }
      }
      eff.life -= eff.kind === 'chainLightning' ? 0.08 : eff.kind ? 0.06 : 0.1;
      return eff.life > 0;
    });

    // Floating Text — time-bound, fades in 0.25s from spawn
    const nowMs = performance.now();
    floatingTexts = floatingTexts.filter(ft => {
      const elapsed = (nowMs - ft.spawnTime) / 250; // 0→1 over 250ms
      if(elapsed >= 1) return false;
      let vx = ft.x - player.x + cx, vy = ft.y - player.y + cy;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - elapsed);
      ctx.fillStyle = ft.color;
      ctx.font = `bold ${ft.size}px sans-serif`;
      ctx.fillText(ft.text, vx*TILE_SIZE, vy*TILE_SIZE - elapsed*24);
      ctx.restore();
      return true;
    });
  // === Smooth Radial Fog-of-War Light Cone ===
  // Environmental lighting: outdoors scenes get full/partial light.
  // Dungeons get a radial light cone. Town/beach/desert/hedge = full light.
  //
  // LESSON: The original code drew 0.92 opacity black over the entire canvas,
  // then drew a gradient ON TOP with source-over compositing. The gradient's
  // transparent center did nothing against the already-dark canvas, so the
  // entire game was 92% dark even at the player's position.
  //
  // FIX: Use 'destination-out' compositing to CUT a hole in the darkness layer.
  // We draw darkness to an offscreen canvas, punch a hole, then composite it
  // over the main canvas.
  
  const scene = typeof currentScene !== 'undefined' ? currentScene : 'dungeon';
  
  // Scenes with full environmental light — no darkness overlay at all
  const fullLightScenes = ['town', 'beach', 'desert', 'mountain'];
  // Scenes with partial environmental light — dimmer but not dark
  const partialLightScenes = ['forest'];
  
  const isFullLight = (window.debugFlags && debugFlags.fullLight) || fullLightScenes.includes(scene);
  const isPartialLight = partialLightScenes.includes(scene);
  
  if(!isFullLight) {
    const playerScrX = cx * TILE_SIZE + TILE_SIZE / 2;
    const playerScrY = cy * TILE_SIZE + TILE_SIZE / 2;
    
    // Forest gets a wider, dimmer cone; dungeons get tight cone
    let baseSight = isPartialLight ? 10 : 5;
    const lightTileRadius = player.blind ? 0 : (lightTurns > 0 ? 15 : baseSight);
    const lightPx = lightTileRadius * TILE_SIZE;
    
    // Darkness intensity: forest = 0.4 (dim), dungeon = 0.92 (dark)
    const darknessAlpha = isPartialLight ? 0.4 : 0.92;

    // Create offscreen canvas for the darkness layer
    const darkCanvas = document.createElement('canvas');
    darkCanvas.width = canvas.width;
    darkCanvas.height = canvas.height;
    const darkCtx = darkCanvas.getContext('2d');

    // Fill with darkness
    darkCtx.fillStyle = `rgba(0, 0, 0, ${darknessAlpha})`;
    darkCtx.fillRect(0, 0, darkCanvas.width, darkCanvas.height);

    if(lightPx > 0) {
      const featherPx = lightPx * 1.6;
      darkCtx.globalCompositeOperation = 'destination-out';
      const grad = darkCtx.createRadialGradient(
        playerScrX, playerScrY, 0,
        playerScrX, playerScrY, featherPx
      );
      grad.addColorStop(0,    'rgba(0, 0, 0, 1)');
      grad.addColorStop(0.25, 'rgba(0, 0, 0, 1)');
      grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.85)');
      grad.addColorStop(0.60, 'rgba(0, 0, 0, 0.55)');
      grad.addColorStop(0.75, 'rgba(0, 0, 0, 0.25)');
      grad.addColorStop(0.90, 'rgba(0, 0, 0, 0.08)');
      grad.addColorStop(1.0,  'rgba(0, 0, 0, 0)');
      darkCtx.fillStyle = grad;
      darkCtx.fillRect(0, 0, darkCanvas.width, darkCanvas.height);
      darkCtx.globalCompositeOperation = 'source-over';
    }

    ctx.drawImage(darkCanvas, 0, 0);
  } else {
    // B756.AVATAR_OPACITY: full-light scenes keep unexplored fog, but without
    // global blur haze so avatar/overworld objects stay fully opaque.
    const fogCanvas = document.createElement('canvas');
    fogCanvas.width = canvas.width;
    fogCanvas.height = canvas.height;
    const fogCtx = fogCanvas.getContext('2d');
    fogCtx.fillStyle = 'rgba(0,0,0,0)';
    fogCtx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);

    let hadFog = false;
    for(let y = 0; y < VIEW_ROWS; y++) {
      let mapY = player.y + y - cy;
      for(let x = 0; x < VIEW_COLS; x++) {
        let mapX = player.x + x - cx;
        if(mapY < 0 || mapY >= mapH || mapX < 0 || mapX >= mapW) {
          fogCtx.fillStyle = 'rgba(0,0,0,0.82)';
          fogCtx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          hadFog = true;
        } else if(!explored[mapY][mapX] && !(window.debugFlags && debugFlags.revealMap)) {
          fogCtx.fillStyle = 'rgba(0,0,0,0.82)';
          fogCtx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          hadFog = true;
        }
      }
    }
    if(hadFog) ctx.drawImage(fogCanvas, 0, 0);
  }

  // Level Up Flash
  if (window.levelUpFlash > 0) {
    ctx.globalAlpha = window.levelUpFlash * 0.5;
    ctx.fillStyle = `hsl(${(1 - window.levelUpFlash) * 360}, 100%, 50%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
  }
  drawMinimap();
}

  // Bug 5: Animated avatar drawing (walking, running, sleeping, fighting)
  // Uses warrior sprite sheets when loaded, falls back to procedural drawing.
  // Sprite sheets: 1200×896, 12 cols × 7 rows, 100×128 per frame.
  // Row 0=down, row 1=left, row 2=right, row 3=up
  // Avatar: emoji-based, state and direction aware.
  // East-facing uses CSS scaleX(-1) to mirror west-facing emojis.
  let _avatarFrame = 0;
  let _avatarLastTick = 0;

  function drawAvatar(ctx, px, py, size) {
    const now = performance.now();

    // Pick emoji based on state
    let emoji;
    if(player._swimming) {
      emoji = '🏊🏻‍♂️';
    } else if(player.isSleeping) {
      emoji = '😴';
    } else if(player.isKneeling) {
      emoji = '🙇';
    } else if(player._isAttacking) {
      emoji = '⚔️';
    } else if(player.isRunning) {
      if(now - _avatarLastTick > 120) { _avatarFrame = (_avatarFrame + 1) % 2; _avatarLastTick = now; }
      emoji = _avatarFrame === 0 ? '🏃' : '🚶';
    } else {
      let timeSinceMove = now - (window._lastPlayerMoveTime ?? 0);
      if(timeSinceMove < 400) {
        if(now - _avatarLastTick > 200) { _avatarFrame = (_avatarFrame + 1) % 2; _avatarLastTick = now; }
        emoji = _avatarFrame === 0 ? '🚶' : '🧍';
      } else {
        emoji = '🧍';
      }
    }

    // Determine if facing east (mirror west-facing emojis)
    let facingEast = player.facing && player.facing.dx > 0;

    // Anchor the glyph's bottom just above the tile floor so feet stay in
    // the logically-occupied tile. Any size excess overflows upward (head).
    const tileCx = px + TILE_SIZE / 2;
    const footY = py + TILE_SIZE - 2;

    ctx.save();
    ctx.font = `${size - 2}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    if(facingEast && emoji !== '🛌') {
      ctx.translate(tileCx, footY);
      ctx.scale(-1, 1);
      ctx.fillText(emoji, 0, 0);
    } else {
      ctx.fillText(emoji, tileCx, footY);
    }
    ctx.restore();
  }


// E4: Toggle minimap visibility
window.minimapVisible = true;
window.toggleMinimap = function() {
  window.minimapVisible = !window.minimapVisible;
  let canvas = document.getElementById('minimap');
  let zoomBtns = document.getElementById('minimap-zoom-btns');
  let toggleBtn = document.getElementById('minimap-toggle-btn');
  if(canvas) canvas.style.display = window.minimapVisible ? '' : 'none';
  // Hide +/- buttons (but keep the toggle button itself visible)
  if(zoomBtns) {
    Array.from(zoomBtns.children).forEach(btn => {
      if(btn.id !== 'minimap-toggle-btn') btn.style.display = window.minimapVisible ? '' : 'none';
    });
  }
  if(toggleBtn) toggleBtn.title = window.minimapVisible ? 'Hide minimap' : 'Show minimap';
};

function drawMinimap() {
  let minCanvas = document.getElementById('minimap');
  if (!minCanvas) return;
  if(window.minimapVisible === false) return;
  if (mapW === 0 || mapH === 0) return;
  const MW = 150, MH = 150;
  if(minCanvas.width !== MW) minCanvas.width = MW;
  if(minCanvas.height !== MH) minCanvas.height = MH;
  let mCtx = minCanvas.getContext('2d');
  mCtx.clearRect(0, 0, MW, MH);

  // Bug 29: If swordmaster maze active and player is in maze area, scramble minimap
  if(window._swordmasterMazeActive && window._swordmasterMazeBounds) {
    let mb = window._swordmasterMazeBounds;
    let inMaze = player.x >= mb.x1 && player.x <= mb.x2 && player.y >= mb.y1 && player.y <= mb.y2;
    if(inMaze) {
      for(let y = 0; y < MH; y += 2) {
        for(let x = 0; x < MW; x += 2) {
          let r = Math.random();
          if(r < 0.3) mCtx.fillStyle = '#555';
          else if(r < 0.5) mCtx.fillStyle = '#333';
          else if(r < 0.55) mCtx.fillStyle = '#f0f';
          else if(r < 0.6) mCtx.fillStyle = '#0ff';
          else continue;
          mCtx.fillRect(x, y, 2, 2);
        }
      }
      if(!window._mazeCompassMsg || Date.now() - window._mazeCompassMsg > 15000) {
        window._mazeCompassMsg = Date.now();
        if(typeof logMsg !== 'undefined') {
          logMsg("<span style='color:#888; font-style:italic;'>The Noodly Appendage of the Flying Spaghetti Monster reaches out and blesses your compass with confusion.</span>");
        }
      }
      mCtx.fillStyle = '#0f0';
      mCtx.fillRect(MW/2 + Math.floor(Math.random()*10)-5, MH/2 + Math.floor(Math.random()*10)-5, 3, 3);
      return;
    }
  }

  // #12: Zoom level (tile radius) — controlled by +/- buttons in UI
  const radiusTiles = window._minimapZoom ?? 8;
  const cells = radiusTiles * 2 + 1;
  const scale = MW / cells;
  const centerX = MW / 2;
  const centerY = MH / 2;
  const circleR = MW / 2 - 4;

  function minimapColor(tile, x, y) {
    if(tile === TILES.STORE || tile === TILES.LEFTYS || tile === TILES.BOOKSTORE || tile === TILES.FORGE || tile === TILES.HALL) return '#d9b54a';
    if(tile === TILES.STAIR_DOWN || tile === TILES.STAIR_UP || tile === TILES.PORTAL) return '#d26cff';
    if(tile === TILES.BRIDGE) return '#8b6840';
    if(tile === TILES.WATER || tile === TILES.MOAT) return '#2b87d1';
    if(tile === TILES.DEEP_WATER && isEagleSkyTile(x, y)) return '#79c6ff';
    if(tile === TILES.DEEP_WATER) return '#0d47a1';
    if(tile === TILES.WALL || tile === TILES.ROCK || tile === TILES.TREE) return '#5a5a5a';
    if(tile === TILES.GRASS || tile === TILES.BUSH) return '#2d5b28';
    return '#4b4033';
  }

  mCtx.save();
  mCtx.beginPath();
  mCtx.arc(centerX, centerY, circleR, 0, Math.PI * 2);
  mCtx.clip();
  mCtx.fillStyle = '#071016';
  mCtx.fillRect(0, 0, MW, MH);

  for(let dy = -radiusTiles; dy <= radiusTiles; dy++) {
    for(let dx = -radiusTiles; dx <= radiusTiles; dx++) {
      let mapX = player.x + dx;
      let mapY = player.y + dy;
      if(mapX < 0 || mapX >= mapW || mapY < 0 || mapY >= mapH) continue;
      if(!explored[mapY][mapX] && !(window.debugFlags && debugFlags.revealMap)) continue;
      let drawX = centerX + dx * scale - scale / 2;
      let drawY = centerY + dy * scale - scale / 2;
      mCtx.fillStyle = minimapColor(theMap[mapY][mapX], mapX, mapY);
      mCtx.fillRect(drawX, drawY, Math.ceil(scale), Math.ceil(scale));
      if(visible[mapY] && visible[mapY][mapX]) {
        mCtx.fillStyle = 'rgba(255,255,255,0.08)';
        mCtx.fillRect(drawX, drawY, Math.ceil(scale), Math.ceil(scale));
      }
    }
  }

  mCtx.restore();

  // #11 FIX: Canvas ring only — CSS border removed from #minimap-container
  mCtx.strokeStyle = 'rgba(180,160,220,0.5)';
  mCtx.lineWidth = 1.5;
  mCtx.beginPath();
  mCtx.arc(centerX, centerY, circleR, 0, Math.PI * 2);
  mCtx.stroke();

  // Player dot
  mCtx.fillStyle = '#0f0';
  mCtx.beginPath();
  mCtx.arc(centerX, centerY, 4, 0, Math.PI * 2);
  mCtx.fill();

  const faceDx = player.facing && (player.facing.dx || player.facing.dy) ? player.facing.dx : 0;
  const faceDy = player.facing && (player.facing.dx || player.facing.dy) ? player.facing.dy : 1;
  mCtx.strokeStyle = 'rgba(255,255,255,0.35)';
  mCtx.beginPath();
  mCtx.moveTo(centerX, centerY);
  mCtx.lineTo(centerX + faceDx * 7, centerY + faceDy * 7);
  mCtx.stroke();

  // #24: Area name along the bottom arc of the minimap
  const areaName = currentScene === 'town' ? 'Tristram'
    : currentScene === 'mountain' ? 'Highlands'
    : currentScene === 'champion' ? 'Hall of Champions'
    : currentScene === 'nest' ? "Roc's Nest"
    : currentScene === 'eagle_crag' ? "Eagle's Crag"
    : currentScene === 'forest' ? 'Hedge Country'
    : currentScene === 'beach' ? 'Beach'
    : currentScene === 'desert' ? 'Desert'
    : `Floor ${currentLevel}`;
  mCtx.save();
  mCtx.font = 'bold 9px sans-serif';
  mCtx.fillStyle = 'rgba(220,200,255,0.75)';
  mCtx.textAlign = 'center';
  mCtx.textBaseline = 'bottom';
  mCtx.fillText(areaName, centerX, MH - 6);
  mCtx.restore();
}

// #4: Map sweep transition — animates the map sliding under the player's feet
// Direction: 'east' (sweep right), 'west' (sweep left), 'north' (sweep up), 'south' (sweep down)
// callback: function to call after sweep completes (generate new map, position player)
window.mapSweepTransition = function(direction, callback) {
  const gameCanvas = document.getElementById('gameCanvas');
  if(!gameCanvas) { callback(); return; }

  // Capture current frame
  const snapshot = document.createElement('canvas');
  snapshot.width = gameCanvas.width;
  snapshot.height = gameCanvas.height;
  snapshot.getContext('2d').drawImage(gameCanvas, 0, 0);

  const ctx = gameCanvas.getContext('2d');
  const W = gameCanvas.width, H = gameCanvas.height;
  const duration = 400; // ms
  const startTime = performance.now();

  // Generate new map via callback
  callback();

  // Draw the new map frame (so we have the target state)
  drawMap();
  const newFrame = document.createElement('canvas');
  newFrame.width = W; newFrame.height = H;
  newFrame.getContext('2d').drawImage(gameCanvas, 0, 0);

  // Animate the sweep
  function animateSweep(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    // Ease-out for smooth feel
    const eased = 1 - Math.pow(1 - t, 3);

    ctx.clearRect(0, 0, W, H);

    if(direction === 'east') {
      // Old slides left, new slides in from right
      ctx.drawImage(snapshot, -eased * W, 0);
      ctx.drawImage(newFrame, W - eased * W, 0);
    } else if(direction === 'west') {
      ctx.drawImage(snapshot, eased * W, 0);
      ctx.drawImage(newFrame, -(W - eased * W), 0);
    } else if(direction === 'south') {
      ctx.drawImage(snapshot, 0, -eased * H);
      ctx.drawImage(newFrame, 0, H - eased * H);
    } else { // north
      ctx.drawImage(snapshot, 0, eased * H);
      ctx.drawImage(newFrame, 0, -(H - eased * H));
    }

    if(t < 1) {
      requestAnimationFrame(animateSweep);
    } else {
      // Final frame — ensure clean state
      ctx.drawImage(newFrame, 0, 0);
    }
  }
  requestAnimationFrame(animateSweep);
};

// ── Continuous grass/ambient animation loop ───────────────────────────
// Draws at ~15fps to keep grass sway and portal effects animated.
// Only runs when the map is visible (start screen hidden, no blocking overlay).
(function() {
  let _lastGrassFrame = 0;
  const GRASS_INTERVAL = 66; // ~15fps
  function grassAnimLoop(ts) {
    requestAnimationFrame(grassAnimLoop);
    if(ts - _lastGrassFrame < GRASS_INTERVAL) return;
    _lastGrassFrame = ts;
    // Only redraw if game is active
    const startScreen = document.getElementById('start-screen');
    if(startScreen && startScreen.style.display !== 'none' && startScreen.style.display !== '') return;
    if(typeof theMap === 'undefined' || theMap.length === 0) return;
    if(typeof isDead !== 'undefined' && isDead) return;
    // Check if overlay is blocking the map (only skip when explicitly shown)
    const overlay = document.getElementById('overlay');
    if(overlay && (overlay.style.display === 'flex' || overlay.style.display === 'block')) return;
    if(typeof drawMap === 'function') drawMap();
  }
  requestAnimationFrame(grassAnimLoop);
})();
