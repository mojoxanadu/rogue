Roguelike Asset Selector (Embedded Version)
============================================

This HTML file contains all images embedded as data URLs, so it works without any external files or network access.

HOW TO USE:
1. Extract this ZIP file on your computer or phone.
2. Open `asset_selector_embedded.html` in a web browser (Chrome, Firefox, Safari, etc.).
3. Browse assets (monsters, NPCs, tiles, items, etc.).
4. Click on a thumbnail to select it for that asset.
5. Click "Generate Mapping JSON" at the bottom.
6. Copy the JSON output and send it back to the AI assistant.

The JSON mapping will look like:
{
  "skeleton": {"source": "crawl", "path": "mon/undead/skeleton.png"},
  ...
}

The assistant will use your selections to update the game's sprite definitions.

NOTES:
- This file is self-contained (all images embedded).
- Works offline and bypasses browser security restrictions for local files.
- Size: ~1.1 MB.

If you have any issues, try using a different browser or ensure JavaScript is enabled.

Enjoy!
