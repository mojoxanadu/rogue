Roguelike Asset Selector v4 (Improved UI)
==========================================

## What's New
- **All game items** (154 total assets) - Includes items from ITEM_DEF
- **Emoji rows**: Show emoji for all 111 emoji items
- **Modern UI**: Dark theme, aligned columns, sticky headers
- **Category clarity**: Each category has its own table with clear header
- **Better organization**: Assets categorized by type (Monsters, NPCs, Tiles, Items, etc.)
- **Embedded images**: All thumbnails included (1.4 MB total, works offline)

## How to Use
1. Extract the ZIP file on your computer or phone
2. Open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge)
3. **Table Structure**:
   - **Key**: Asset identifier (clickable)
   - **Name**: Human-readable name
   - **Current**: Click this column to keep the emoji or current color
   - **LPC/DCSS Suggestions**: Click thumbnails to select sprite replacement
   - **Selected**: Shows your choice (click to clear)
4. Scroll through categories and select sprites for each asset
5. Click "Generate Mapping JSON" at the bottom
6. Copy the JSON output and send it back

## Categories Included
- **Monsters**: Game enemies (skeleton, slime, bat, etc.)
- **NPCs**: Friendly characters (thief, pirate, king, etc.)
- **Tiles**: Environment (wall, floor, grass, water, etc.)
- **Items (Sprite)**: Emoji items currently using sprites
- **All Items**: Complete list from game's ITEM_DEF (all have emojis)
- **Extra Monsters**: Monsters from MONSTER_DEF not in sprite_definitions

## JSON Output Format
```json
{
  "skeleton": {"source": "crawl", "path": "mon/undead/skeleton.png"},
  "💣🌟": {"source": "emoji", "path": "💣🌟"},
  "🧪": {"source": "lpc", "path": "items/potion_red.png"},
  "💰": {"source": "color", "path": "#FDCB6E"}
}
```

- `source`: "lpc", "crawl", "emoji", or "color"
- `path`: image path, emoji string, or color hex

## Tips
- **Keep emoji**: Click the emoji in "Current" column to keep using the emoji
- **Search**: Use browser search (Ctrl+F) to find specific items
- **Scroll**: Categories are separate tables for easy navigation
- **Load time**: First load may take a moment (1.4 MB of embedded images)

## Troubleshooting
- If images don't load: Refresh the page or try a different browser
- If page is slow: Wait for all thumbnails to load
- For best experience: Use Chrome or Firefox on desktop

After making selections, send the JSON mapping back for integration into the game.

Enjoy! 🎮