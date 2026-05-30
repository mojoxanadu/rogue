Roguelike Asset Selector v6 (Andor's Trail & Emoji Support)
============================================================

## What's New in v6
- **Andor's Trail Assets**: Added column for Andor's Trail sprites (358 PNGs)
- **All Emojis Displayed**: Duck 🦆, Shark 🦈, and all other items now show their emoji icons
- **Fixed Names**: Name column now shows human-readable names (e.g., "Duck" instead of "duck")
- **Improved Matching**: Semantic search with synonyms and fuzzy matching
- **Better UI**: Dark theme with distinct columns for Key, Name, Current, LPC, Andor's Trail, DCSS

## Assets Included
- **154 Total Assets**: Monsters, NPCs, Tiles, Items
- **3 Image Sources**:
  - LPC (Liberated Pixel Cup)
  - Andor's Trail (new!)
  - DCSS (Dungeon Crawler Stone Soup)
- **Emojis**: All emoji items show their actual emoji in "Current" column

## How to Use
1. Extract ZIP and open `index.html` in a browser
2. **Columns**:
   - **Key**: Asset identifier (e.g., "duck")
   - **Name**: Human-readable name (e.g., "Duck")
   - **Current**: Emoji or color (click to keep as-is)
   - **LPC**: Sprites from Liberated Pixel Cup
   - **Andor's Trail**: Sprites from Andor's Trail repository
   - **DCSS**: Sprites from Dungeon Crawler Stone Soup
   - **Selected**: Your choice (click image to select)
3. Click thumbnails to select sprites
4. Click "Generate Mapping JSON" to get your selection

## JSON Output
```json
{
  "duck": {"source": "emoji", "path": "🦆"},
  "skeleton": {"source": "andor", "path": "monsters_skeleton1.png"},
  "shark": {"source": "emoji", "path": "🦈"}
}
```

## Matching Logic
- Exact name match (e.g., "skeleton" matches files with "skeleton" in path)
- Synonym expansion (e.g., "skeleton" → "bone", "skel")
- Fuzzy matching on path segments
- Prioritizes sprites that look like the asset

## Notes
- File size: ~2.5MB (includes embedded thumbnails)
- Works offline in any modern browser
- Click emoji in "Current" column to keep using emoji instead of sprite

## Game Integration
After selecting sprites and generating JSON:
1. Copy the JSON to `selections.json`
2. Run `python3 build_complete_assets.py`
3. Open `roguelike7.2.6.html` in a browser
4. The game will auto-load `roguelike_assets.dat`

Enjoy! 🎮