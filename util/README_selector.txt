Roguelike Asset Selector Tool
================================

This package contains an interactive HTML tool to select new sprites for your roguelike game.

HOW TO USE:
1. Extract the ZIP file on your computer or phone.
2. Open `index.html` in a web browser.
3. You will see a table of game assets (monsters, NPCs, tiles, items, etc.).
4. For each asset, suggested sprites from LPC (Liberated Pixel Cup) and DCSS (Dungeon Crawler Stone Soup) are shown as thumbnails.
5. Click on a thumbnail to select it for that asset.
6. After selecting sprites for all desired assets, click the "Generate Mapping JSON" button at the bottom.
7. Copy the JSON output that appears, and send it back to the AI assistant.

The JSON will look like:
{
  "skeleton": {"source": "crawl", "path": "mon/undead/skeleton.png"},
  ...
}

The assistant will use this mapping to integrate the selected sprites into the game.

NOTES:
- The HTML file references images located in the `external/` subdirectory (included).
- Keep the directory structure intact when extracting.
- Works best on modern browsers with JavaScript enabled.
- Images are pixel art, may appear small; click to select.

After you send the JSON mapping, the assistant will update the game's asset definitions accordingly.

Enjoy!
