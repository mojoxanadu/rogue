Roguelike Asset Selector v3 (All Items Included)
=================================================

This HTML file contains ALL game items (182 total assets) with images embedded as data URLs.

## WHAT'S NEW
- Includes ALL items from the game's ITEM_DEF (not just the 5 in sprite_definitions)
- Improved search terms for emoji items
- All images embedded - works offline in any browser
- DCSS (Dungeon Crawler Stone Soup) and LPC (Liberated Pixel Cup) suggestions for each asset

## HOW TO USE
1. Extract this ZIP file on your computer or phone.
2. Open `index.html` in a web browser (Chrome, Firefox, Safari, etc.).
3. Browse assets by category: Monsters, NPCs, Tiles, Items, Additional Items, etc.
4. **Current Representation Column**:
   - Emoji items show the current emoji (clickable to keep it)
   - Other assets show colored squares (clickable to keep current color)
5. **LPC/DCSS Suggestions**: Click on thumbnail images to select a replacement sprite.
6. Click "Generate Mapping JSON" at the bottom.
7. Copy the JSON output and send it back to the AI assistant.

## JSON OUTPUT FORMAT
{
  "skeleton": {"source": "crawl", "path": "mon/undead/skeleton.png"},
  "💣🌟": {"source": "emoji", "path": "💣🌟"},
  ...
}

- `source`: "lpc", "crawl", "emoji", or "color"
- `path`: image path relative to repository root, or emoji string, or color hex

## NOTES
- All 378 referenced images are embedded in the HTML (3.1 MB).
- DCSS suggestions may be limited for some items; LPC has broader coverage.
- If you prefer to keep an emoji over a sprite, click the emoji in the "Current" column.
- The selector includes monsters, NPCs, tiles, items, warrior sheets, heads, and backgrounds.

## TROUBLESHOOTING
- If images don't load, try a different browser or ensure JavaScript is enabled.
- For best results, use Chrome or Firefox.
- If the page is slow due to many images, be patient while loading.

After selecting sprites, send the JSON mapping back for integration into the game.

Enjoy!