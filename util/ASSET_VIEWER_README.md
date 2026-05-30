# Dungeon Descent Asset Viewer

A comprehensive viewer for all game assets in Dungeon Descent v7.2.2.

## Features

1. **Monsters & NPCs** - View all 27 monsters and NPCs with stats, emojis, and sprite previews
2. **Items** - View all 38 items with descriptions, values, and sprite previews  
3. **Tiles** - View all 38 tile types with descriptions and sprite previews
4. **Audio Assets** - View all sound effects and music files
5. **Search** - Real-time search across all assets
6. **Asset Tags** - Consistent `type:id` tags for easy reference in code
7. **File Loading** - Manual file selection for offline Edge sandbox environments
8. **Debug Info** - View raw asset data and file statistics

## How to Use

### 1. Open the Asset Viewer
Open `asset_viewer.html` in your browser.

### 2. Load Asset File
Click the **"Load Asset File"** button in the left navigation and select `roguelike_assets.dat` from the game directory.

### 3. Browse Assets
- **Left Navigation**: Click categories (Monsters, NPCs, Items, Tiles, Audio) to filter
- **Search Box**: Find assets by name, tag, or description
- **Filter Buttons**: Quick filter buttons above the content
- **Asset Stats**: See counts and file size in the left navigation
- **Raw Data**: Click "Show Raw Asset Data" to view JSON structure
- **Tags**: Each asset has a tag (e.g., `monster:slime`, `item:health_potion`) for easy reference

## Asset Tags Reference

### Monsters & NPCs
```
monster:slime          monster:skeleton      monster:dragon
monster:bat            monster:ghost         monster:robot
npc:cain               npc:pirate            npc:black_knight
npc:thief              npc:fence             npc:master
npc:cat                npc:genie             npc:king
npc:eagle              npc:gurgi             npc:erasmus
npc:cow                npc:dennis            npc:bridge_keeper
npc:french_taunter
```

### Items
```
item:holy_hand_grenade  item:health_potion    item:sword
item:shield             item:boots_of_blinding_speed
item:resurrection_crystal
item:candle             item:identify_scroll  item:town_portal_scroll
item:pizza              item:gold_bag         item:running_shirt
item:briefs             item:sandals          item:bone
item:poop               item:paperclip        item:yarn
item:thread             item:old_news         item:single_glove
item:brick              item:soap
```

### Tiles
```
tile:WALL              tile:FLOOR            tile:STAIR_DOWN
tile:STAIR_UP          tile:CHEST            tile:STORE
tile:WATER             tile:LEFTYS           tile:BOOKSTORE
tile:TREE              tile:BUSH             tile:ROCK
tile:SAND              tile:DEEP_WATER       tile:GRASS
tile:MOAT              tile:BRIDGE           tile:ANTIQUE_SHOP
tile:STANS_SHOP        tile:SCUMM_BAR        tile:WILLOW
tile:NEST              tile:PIT              tile:BOULDER
tile:TIGHTROPE         tile:ARCADE           tile:BOAT
tile:HUT               tile:CASTLE_DOOR      tile:PORTAL
tile:BLADE             tile:LETTER           tile:FORGE
tile:COW               tile:CHICKEN          tile:CHASM
tile:BRIDGE_TILE
```

### Sounds
```
sound:sword           sound:step            sound:grunt
sound:oof
```

## For Developers

### Asset File Structure
The `roguelike_assets.dat` file is a JSON file with three main sections:
```json
{
  "sprites": {
    "player": "data:image/svg+xml;base64,...",
    "wall": "data:image/svg+xml;base64,...",
    ...
  },
  "sounds": {
    "sword": "data:audio/mp3;base64,...",
    "step": "data:audio/mp3;base64,...",
    ...
  },
  "midi": {
    // MIDI files (if any)
  }
}
```

### Integration with Game Code
The game loads assets using:
```javascript
// In the actual game code (ui_logic.js)
function loadAssetFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const assets = JSON.parse(e.target.result);
    // Use assets.sprites, assets.sounds, etc.
  };
  reader.readAsText(file);
}
```

### Testing
Run `test_asset_viewer.html` to verify:
1. Asset file exists and is valid JSON
2. Contains expected sprite and sound counts
3. Has all required sprite keys

## Asset File Generation

### Option 1: Complete Assets (Recommended)
```bash
python3 build_complete_assets.py
```
Creates:
- **41 colored rectangle sprites** (SVG fallbacks with names)
- **11 valid MP3 sound files** (silent, game uses synthesized fallbacks)
- **Total**: 52 assets, ~19KB file

### Option 2: Original Build (Broken URLs)
```bash
python3 build_full_assets.py
```
**Note**: Sound URLs are broken (return 404), creates placeholder files.

### Option 3: Basic Assets
```bash
python3 generate_assets.py
```
Minimal asset file, expects SVG files in `temp_icons/` directory.

## Sound Implementation
The game has a **hybrid audio system**:
1. **Synthesized sounds**: Programmatically generated FM synthesis (fallback)
2. **Sample playback**: MP3 files from asset file (if available)
3. **Emoji display**: Visual representation for items

Even with silent MP3 files, the game will play synthesized sounds!

## Notes for Edge Sandbox
- The viewer uses `FileReader` API (not `fetch`) for offline compatibility
- Assets must be loaded manually via file input
- Base64 data URLs are displayed for debugging
- All game data is embedded as fallback
- Left navigation provides easy category filtering
- Asset statistics show real-time counts and file sizes

## File Generation
Assets are generated by:
- `generate_assets.py` - Basic asset generation
- `build_full_assets.py` - Enhanced generation with external downloads
- `build.py` - Builds the final HTML game file