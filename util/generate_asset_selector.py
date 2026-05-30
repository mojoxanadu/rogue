#!/usr/bin/env python3
"""
Generate an HTML asset selector for roguelike sprites.
"""
import os
import json
import base64
import re
from pathlib import Path

# Extract sprite definitions from build_complete_assets.py
def parse_sprite_definitions():
    """Parse sprite_definitions from build_complete_assets.py"""
    with open('build_complete_assets.py', 'r') as f:
        content = f.read()
    # Find sprite_definitions = {...}
    start = content.find('sprite_definitions = {')
    if start == -1:
        return {}
    # Find matching brace
    brace_count = 0
    i = start
    for i in range(start, len(content)):
        if content[i] == '{':
            brace_count += 1
        elif content[i] == '}':
            brace_count -= 1
            if brace_count == 0:
                end = i
                break
    else:
        end = len(content)
    dict_text = content[start:end+1]
    # Evaluate as Python dict (dangerous but we control the file)
    # Instead, we can use a simple regex to extract lines
    # We'll do a safer approach: parse lines manually
    lines = dict_text.split('\n')
    sprite_defs = {}
    current_key = None
    for line in lines:
        line = line.strip()
        if line.startswith('"') or line.startswith("'"):
            # Key line
            key_match = re.match(r'^["\']([^"\']+)["\']\s*:', line)
            if key_match:
                current_key = key_match.group(1)
                # Find value up to next comma
                val_part = line.split(':', 1)[1].strip()
                if val_part.startswith('{'):
                    # multi-line dict
                    pass
                else:
                    # simple dict, ignore
                    pass
        elif line.startswith('}'):
            break
    # For now, return hardcoded list from earlier reading
    # We'll manually define categories
    return {}

# Manual categorization based on build_complete_assets.py and state.js
# Let's hardcode for now; we can improve later.
assets = {
    'monsters': [
        'player', 'slime', 'skeleton', 'bat', 'ghost', 'robot', 'dragon',
        'snake', 'troll', 'medusa', 'assassin', 'killer_rabbit',
        'chipmunk', 'duck', 'shark', 'wet_rat', 'duck_hunt_dog',
    ],
    'npcs': [
        'thief', 'fence', 'fence_flasher', 'cain', 'pirate', 'master',
        'cat', 'genie', 'king', 'eagle', 'gurgi', 'erasmus', 'cow',
        'black_knight', 'black_knight_4limbs', 'black_knight_3limbs',
        'black_knight_2limbs', 'black_knight_1limb', 'black_knight_0limbs',
        'french_taunter', 'dennis', 'bridge_keeper',
    ],
    'tiles': [
        'wall', 'floor', 'water', 'sand', 'grass', 'tree', 'rock',
        'chest_closed', 'chest_open', 'bookstore',
    ],
    'items': [
        '💣🌟', '🧪', '🗡️', '🛡️', '💰',  # emoji keys
        # Also map to sprite keys: sword, potion, shield, coin, grenade?
    ],
    'backgrounds': [
        'bg_eagle_s_crag', 'bg_hall_of_champions', 'bg_roc_nest',
    ],
    'heads': [
        'npc_apu', 'npc_wizard', 'npc_chaplain',
    ],
    'warrior_sheets': [
        'warrior_walk', 'warrior_run', 'warrior_sleep', 'warrior_fight',
    ],
}

# Scan LPC and DCSS directories for images
def scan_image_dirs():
    lpc_dir = Path('external/lpc-spritesheet')
    crawl_dir = Path('external/crawl/crawl-ref/source/rltiles')
    images = {'lpc': [], 'crawl': []}
    if lpc_dir.exists():
        for ext in ['*.png', '*.jpg', '*.jpeg', '*.gif', '*.bmp']:
            for img in lpc_dir.rglob(ext):
                rel = img.relative_to(lpc_dir)
                images['lpc'].append(str(rel))
    if crawl_dir.exists():
        # We'll focus on subdirectories: dngn, mon, item, player, misc
        for sub in ['dngn', 'mon', 'item', 'player', 'misc']:
            subdir = crawl_dir / sub
            if subdir.exists():
                for ext in ['*.png', '*.jpg', '*.jpeg', '*.gif']:
                    for img in subdir.rglob(ext):
                        rel = img.relative_to(crawl_dir)
                        images['crawl'].append(f"{sub}/{rel}")
    return images

def embed_image_as_data_url(img_path):
    """Read image file and return data URL"""
    if not os.path.exists(img_path):
        return None
    with open(img_path, 'rb') as f:
        data = f.read()
    # Guess MIME type from extension
    ext = img_path.split('.')[-1].lower()
    mime = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
            'gif': 'image/gif', 'bmp': 'image/bmp'}.get(ext, 'application/octet-stream')
    b64 = base64.b64encode(data).decode('ascii')
    return f"data:{mime};base64,{b64}"

def generate_html():
    image_db = scan_image_dirs()
    # For each asset, find suggestions (simple filename matching)
    suggestions = {}
    for category, keys in assets.items():
        for key in keys:
            suggestions[key] = {'lpc': [], 'crawl': []}
            # Search in LPC filenames containing key
            for img in image_db['lpc']:
                if key.lower() in img.lower():
                    suggestions[key]['lpc'].append(img)
            # Search in crawl
            for img in image_db['crawl']:
                if key.lower() in img.lower():
                    suggestions[key]['crawl'].append(img)
    
    # Start building HTML
    html = []
    html.append('<!DOCTYPE html>')
    html.append('<html><head><meta charset="UTF-8"><title>Asset Selector</title>')
    html.append('<style>')
    html.append('body { font-family: sans-serif; margin: 20px; }')
    html.append('table { border-collapse: collapse; width: 100%; }')
    html.append('th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }')
    html.append('img.thumb { width: 32px; height: 32px; image-rendering: pixelated; }')
    html.append('.suggestion { cursor: pointer; border: 2px solid transparent; }')
    html.append('.suggestion.selected { border-color: blue; }')
    html.append('</style>')
    html.append('</head><body>')
    html.append('<h1>Roguelike Asset Selector</h1>')
    html.append('<p>Click on a suggestion to select it for each asset. Then click Generate Mapping at the bottom.</p>')
    
    for category, keys in assets.items():
        html.append(f'<h2>{category.title()}</h2>')
        html.append('<table><thead><tr><th>Asset Key</th><th>Current</th><th>LPC Suggestions</th><th>DCSS Suggestions</th><th>Selected</th></tr></thead><tbody>')
        for key in keys:
            html.append(f'<tr data-key="{key}">')
            html.append(f'<td>{key}</td>')
            # Current representation
            if key in ['💣🌟', '🧪', '🗡️', '🛡️', '💰']:
                html.append(f'<td><span style="font-size: 24px;">{key}</span></td>')
            else:
                html.append('<td>???</td>')
            # LPC suggestions
            lpc_cell = []
            for img in suggestions[key]['lpc'][:5]:  # limit to 5
                lpc_cell.append(f'<img class="thumb suggestion" src="file://{Path("external/lpc-spritesheet")/img}" data-source="lpc" data-path="{img}" alt="{img}">')
            html.append(f'<td>{" ".join(lpc_cell) if lpc_cell else "none"}</td>')
            # DCSS suggestions
            crawl_cell = []
            for img in suggestions[key]['crawl'][:5]:
                crawl_cell.append(f'<img class="thumb suggestion" src="file://{Path("external/crawl/crawl-ref/source/rltiles")/img}" data-source="crawl" data-path="{img}" alt="{img}">')
            html.append(f'<td>{" ".join(crawl_cell) if crawl_cell else "none"}</td>')
            html.append('<td class="selected-cell">-</td>')
            html.append('</tr>')
        html.append('</tbody></table>')
    
    html.append('<button id="generate">Generate Mapping</button>')
    html.append('<pre id="output"></pre>')
    
    html.append('<script>')
    html.append('let selections = {};')
    html.append('document.querySelectorAll(".suggestion").forEach(img => {')
    html.append('  img.addEventListener("click", function() {')
    html.append('    let row = this.closest("tr");')
    html.append('    let key = row.dataset.key;')
    html.append('    selections[key] = { source: this.dataset.source, path: this.dataset.path };')
    html.append('    row.querySelector(".selected-cell").textContent = this.dataset.path;')
    html.append('    // Visual feedback')
    html.append('    row.querySelectorAll(".suggestion").forEach(i => i.classList.remove("selected"));')
    html.append('    this.classList.add("selected");')
    html.append('  });')
    html.append('});')
    html.append('document.getElementById("generate").addEventListener("click", () => {')
    html.append('  let output = JSON.stringify(selections, null, 2);')
    html.append('  document.getElementById("output").textContent = output;')
    html.append('});')
    html.append('</script>')
    html.append('</body></html>')
    
    return '\n'.join(html)

if __name__ == '__main__':
    html = generate_html()
    with open('asset_selector.html', 'w') as f:
        f.write(html)
    print('Generated asset_selector.html')