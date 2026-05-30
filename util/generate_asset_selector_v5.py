#!/usr/bin/env python3
"""
Generate an HTML asset selector for roguelike sprites with improved UI and AI matching.
"""
import os
import json
import re
import ast
from pathlib import Path
import random

# ----------------------------------------------------------------------
# Parse sprite_definitions from build_complete_assets.py
# ----------------------------------------------------------------------
def parse_sprite_definitions():
    """Extract sprite_definitions dictionary from build_complete_assets.py"""
    with open('build_complete_assets.py', 'r') as f:
        lines = f.readlines()
    
    # Find start and end lines of sprite_definitions = {
    start = None
    for i, line in enumerate(lines):
        if 'sprite_definitions = {' in line:
            start = i
            break
    if start is None:
        raise ValueError('sprite_definitions not found')
    
    # Find matching brace
    brace = 0
    for i in range(start, len(lines)):
        brace += lines[i].count('{')
        brace -= lines[i].count('}')
        if brace == 0:
            end = i
            break
    else:
        end = len(lines) - 1
    
    # Extract the dictionary lines
    dict_lines = lines[start:end+1]
    cleaned = []
    for line in dict_lines:
        line = re.sub(r'#.*', '', line)
        cleaned.append(line)
    dict_text = ''.join(cleaned)
    first_brace = dict_text.find('{')
    last_brace = dict_text.rfind('}') + 1
    dict_only = dict_text[first_brace:last_brace]
    
    try:
        sprite_defs = ast.literal_eval(dict_only)
    except SyntaxError:
        sprite_defs = {}
    
    return sprite_defs

# ----------------------------------------------------------------------
# Parse ITEM_DEF from state.js
# ----------------------------------------------------------------------
def parse_item_def():
    """Extract ITEM_DEF dictionary from src/state.js"""
    with open('src/state.js', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find ITEM_DEF = {
    start = content.find('const ITEM_DEF = {')
    if start == -1:
        start = content.find('let ITEM_DEF = {')
    if start == -1:
        start = content.find('var ITEM_DEF = {')
    if start == -1:
        return {}
    
    # Find matching brace
    brace = 0
    for i in range(start, len(content)):
        if content[i] == '{':
            brace += 1
        elif content[i] == '}':
            brace -= 1
            if brace == 0:
                end = i
                break
    else:
        end = len(content) - 1
    
    obj_text = content[start:end+1]
    first_brace = obj_text.find('{')
    last_brace = obj_text.rfind('}')
    obj_only = obj_text[first_brace:last_brace+1]
    
    items = {}
    pattern = r'"([^"]+)"\s*:\s*\{'
    matches = re.findall(pattern, obj_only)
    if not matches:
        pattern = r"'([^']+)'\s*:\s*\{"
        matches = re.findall(pattern, obj_only)
    
    for key in matches:
        # Extract name
        name_pattern = rf'"{key}".*?"name"\s*:\s*"([^"]+)"'
        name_match = re.search(name_pattern, obj_only)
        if name_match:
            name = name_match.group(1)
        else:
            name = key
        items[key] = {"name": name, "type": "item"}
    
    return items

# ----------------------------------------------------------------------
# Parse MONSTER_DEF from state.js
# ----------------------------------------------------------------------
def parse_monster_def():
    """Extract MONSTER_DEF dictionary from src/state.js"""
    with open('src/state.js', 'r', encoding='utf-8') as f:
        content = f.read()
    
    start = content.find('const MONSTER_DEF = {')
    if start == -1:
        return {}
    
    brace = 0
    for i in range(start, len(content)):
        if content[i] == '{':
            brace += 1
        elif content[i] == '}':
            brace -= 1
            if brace == 0:
                end = i
                break
    else:
        end = len(content) - 1
    
    obj_text = content[start:end+1]
    first_brace = obj_text.find('{')
    last_brace = obj_text.rfind('}')
    obj_only = obj_text[first_brace:last_brace+1]
    
    monsters = {}
    # Pattern to extract key and icon
    pattern = r'"([^"]+)":\s*\{[^}]*icon:\s*\'([^\']+)\''
    matches = re.findall(pattern, obj_only)
    
    for key, icon in matches:
        monsters[key] = {"name": key, "icon": icon, "type": "monster"}
    
    # Also find monsters with emoji keys (unlikely but possible)
    emoji_pattern = r'"([^"]*[\u0080-\U0010FFFF]+[^"]*)":\s*\{'
    emoji_matches = re.findall(emoji_pattern, obj_only)
    for key in emoji_matches:
        if key not in monsters:
            monsters[key] = {"name": key, "type": "monster"}
    
    return monsters

# ----------------------------------------------------------------------
# Scan image directories
# ----------------------------------------------------------------------
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
        for ext in ['*.png', '*.jpg', '*.jpeg', '*.gif']:
            for img in crawl_dir.rglob(ext):
                rel = img.relative_to(crawl_dir)
                images['crawl'].append(str(rel))
    return images

# ----------------------------------------------------------------------
# Enhanced matching with semantic search
# ----------------------------------------------------------------------
def get_search_terms(key, config):
    """Return list of search strings for given asset key."""
    terms = [key]
    if isinstance(config, dict) and 'name' in config:
        terms.append(config['name'].lower())
    
    # Common synonyms for search
    synonyms = {
        'skeleton': ['bone', 'skel'],
        'bat': ['vampire', 'flying'],
        'ghost': ['spirit', 'phantom'],
        'dragon': ['wyrm', 'drake'],
        'snake': ['serpent', 'viper'],
        'troll': ['giant', 'ogre'],
        'medusa': ['snake', 'gorgon'],
        'assassin': ['killer', 'rogue'],
        'thief': ['robber', 'burglar'],
        'pirate': ['sailor', 'boat'],
        'chest': ['box', 'treasure'],
        'potion': ['vial', 'flask', 'bottle'],
        'scroll': ['paper', 'scroll'],
        'shield': ['buckler', 'guard'],
        'sword': ['blade', 'dagger', 'knife'],
        'gold': ['coin', 'money', 'wealth'],
        'water': ['sea', 'ocean', 'lake'],
        'grass': ['meadow', 'field'],
        'tree': ['forest', 'wood'],
    }
    
    if key in synonyms:
        terms.extend(synonyms[key])
    
    # Remove duplicates
    seen = set()
    unique = []
    for t in terms:
        tl = t.lower()
        if tl not in seen:
            seen.add(tl)
            unique.append(tl)
    return unique

def get_semantic_suggestions(key, config, image_db, max_results=5):
    """Get suggestions using enhanced matching logic."""
    search_terms = get_search_terms(key, config)
    
    lpc_matches = []
    crawl_matches = []
    
    # First pass: exact name match
    for img in image_db['lpc']:
        img_lower = img.lower()
        if any(term in img_lower for term in search_terms):
            lpc_matches.append(img)
    
    for img in image_db['crawl']:
        img_lower = img.lower()
        if any(term in img_lower for term in search_terms):
            crawl_matches.append(img)
    
    # If no matches, try fuzzy matching
    if not lpc_matches and not crawl_matches:
        # Try partial matches
        for img in image_db['lpc']:
            img_lower = img.lower()
            for term in search_terms:
                # Check if any word in the path contains the term
                path_parts = img_lower.replace('/', ' ').replace('_', ' ').replace('-', ' ').split()
                if any(term in part for part in path_parts):
                    lpc_matches.append(img)
                    break
        
        for img in image_db['crawl']:
            img_lower = img.lower()
            for term in search_terms:
                path_parts = img_lower.replace('/', ' ').replace('_', ' ').replace('-', ' ').split()
                if any(term in part for part in path_parts):
                    crawl_matches.append(img)
                    break
    
    # Limit results
    lpc_matches = lpc_matches[:max_results]
    crawl_matches = crawl_matches[:max_results]
    
    return lpc_matches, crawl_matches

# ----------------------------------------------------------------------
# Generate HTML
# ----------------------------------------------------------------------
def generate_html():
    sprite_defs = parse_sprite_definitions()
    item_defs = parse_item_def()
    monster_defs = parse_monster_def()
    image_db = scan_image_dirs()
    
    # Categorize assets
    categories = {}
    
    # 1. Monsters from sprite_defs
    monster_list = []
    for key, config in sprite_defs.items():
        if key == 'player' or 'detailed' in config or key in ['slime', 'skeleton', 'bat', 'ghost', 'robot', 'dragon', 'snake', 'troll', 'medusa', 'assassin', 'killer_rabbit', 'chipmunk', 'duck', 'shark', 'wet_rat', 'duck_hunt_dog']:
            if 'name' not in config:
                config['name'] = key.title()
            monster_list.append((key, config, 'sprite'))
    # Also add monsters from MONSTER_DEF that are in sprite_defs but maybe missed or need emoji icon
    for key, config in monster_defs.items():
        if key in sprite_defs:
             # Update config with icon from MONSTER_DEF if available
             if 'icon' in config and 'icon' not in sprite_defs[key]:
                 sprite_defs[key]['icon'] = config['icon']
             # Ensure name
             if 'name' not in sprite_defs[key]:
                 sprite_defs[key]['name'] = key.title()
             # Add to list if not already (avoid duplicates)
             if not any(k == key for k, _, _ in monster_list):
                 monster_list.append((key, sprite_defs[key], 'sprite'))
    categories['Monsters'] = monster_list
    
    # 2. NPCs from sprite_defs
    npc_list = []
    npc_keys = ['thief', 'fence', 'fence_flasher', 'cain', 'pirate', 'master', 'cat', 'genie', 'king', 'eagle', 'gurgi', 'erasmus', 'cow', 'black_knight', 'black_knight_4limbs', 'black_knight_3limbs', 'black_knight_2limbs', 'black_knight_1limb', 'black_knight_0limbs', 'french_taunter', 'dennis', 'bridge_keeper']
    for key, config in sprite_defs.items():
        if key in npc_keys:
            if 'name' not in config:
                config['name'] = key.title()
            npc_list.append((key, config, 'sprite'))
    categories['NPCs'] = npc_list
    
    # 3. Tiles from sprite_defs
    tile_list = []
    tile_keys = ['wall', 'floor', 'water', 'sand', 'grass', 'tree', 'rock', 'chest_closed', 'chest_open', 'bookstore']
    for key, config in sprite_defs.items():
        if key in tile_keys:
            if 'name' not in config:
                config['name'] = key.title()
            tile_list.append((key, config, 'sprite'))
    categories['Tiles'] = tile_list
    
    # 4. Emoji items from sprite_defs
    emoji_item_list = []
    emoji_keys = ['💣🌟', '🧪', '🗡️', '🛡️', '💰']
    for key, config in sprite_defs.items():
        if key in emoji_keys:
            if 'name' not in config:
                config['name'] = key
            emoji_item_list.append((key, config, 'sprite'))
    categories['Emoji Items (Sprite)'] = emoji_item_list
    
    # 5. All items from ITEM_DEF
    all_items_list = []
    for key, config in item_defs.items():
        if key not in sprite_defs:
            all_items_list.append((key, config, 'item'))
    categories['All Items'] = all_items_list
    
    # 6. Extra monsters (those in MONSTER_DEF but not in sprite_defs)
    extra_monsters = []
    for key, config in monster_defs.items():
        if key not in sprite_defs:
            extra_monsters.append((key, config, 'monster'))
    categories['Extra Monsters'] = extra_monsters
    
    # Build HTML with modern UI
    html = []
    html.append('<!DOCTYPE html>')
    html.append('<html><head><meta charset="UTF-8"><title>Roguelike Asset Selector v5</title>')
    html.append('<meta name="viewport" content="width=device-width, initial-scale=1">')
    html.append('<style>')
    html.append('* { box-sizing: border-box; }')
    html.append('body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #e0e0e0; }')
    html.append('h1 { text-align: center; color: #f39c12; text-shadow: 2px 2px 4px rgba(0,0,0,0.5); margin-bottom: 10px; }')
    html.append('.subtitle { text-align: center; color: #aaa; margin-bottom: 30px; }')
    html.append('.category { background: rgba(255,255,255,0.05); border-radius: 10px; padding: 20px; margin-bottom: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }')
    html.append('.category h2 { margin-top: 0; color: #3498db; border-bottom: 2px solid #3498db; padding-bottom: 10px; font-size: 1.4em; }')
    html.append('table { width: 100%; border-collapse: collapse; margin-top: 15px; table-layout: fixed; }')
    html.append('th, td { border: 1px solid #444; padding: 10px; text-align: center; vertical-align: middle; }')
    html.append('th { background: #2c3e50; color: #ecf0f1; position: sticky; top: 0; }')
    html.append('tr:nth-child(even) { background: rgba(255,255,255,0.02); }')
    html.append('tr:hover { background: rgba(52, 152, 219, 0.1); }')
    html.append('.col-key { width: 12%; font-family: monospace; color: #f1c40f; word-break: break-all; }')
    html.append('.col-name { width: 18%; text-align: left; font-size: 0.9em; }')
    html.append('.col-current { width: 12%; }')
    html.append('.col-lpc { width: 28%; }')
    html.append('.col-dcss { width: 28%; }')
    html.append('.col-selected { width: 10%; color: #2ecc71; font-size: 0.85em; word-break: break-all; }')
    html.append('.thumb { cursor: pointer; border: 2px solid transparent; border-radius: 4px; padding: 2px; transition: transform 0.1s, border-color 0.2s; display: inline-block; vertical-align: middle; }')
    html.append('.thumb:hover { transform: scale(1.1); border-color: #f39c12; }')
    html.append('.thumb.selected { border-color: #2ecc71; box-shadow: 0 0 10px #2ecc71; }')
    html.append('.thumb img { display: block; width: 32px; height: 32px; image-rendering: pixelated; }')
    html.append('.emoji-thumb { font-size: 28px; line-height: 32px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3); border-radius: 4px; }')
    html.append('.color-thumb { width: 32px; height: 32px; border-radius: 4px; display: inline-block; }')
    html.append('.suggestions { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; min-height: 36px; align-items: center; }')
    html.append('.section-info { font-size: 0.85em; color: #95a5a6; margin-bottom: 15px; }')
    html.append('#generate-btn { display: block; margin: 30px auto; padding: 15px 40px; font-size: 1.2em; background: #e74c3c; color: white; border: none; border-radius: 50px; cursor: pointer; box-shadow: 0 4px 15px rgba(231, 76, 60, 0.4); transition: transform 0.2s, box-shadow 0.2s; }')
    html.append('#generate-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(231, 76, 60, 0.6); }')
    html.append('#output { width: 100%; height: 150px; background: #1e1e1e; color: #00ff00; border: 1px solid #444; padding: 15px; font-family: monospace; border-radius: 5px; margin-top: 10px; resize: vertical; }')
    html.append('.legend { text-align: center; margin-top: 20px; font-size: 0.9em; color: #7f8c8d; }')
    html.append('.emoji-cell { font-size: 2em; line-height: 1; }')
    html.append('</style>')
    html.append('</head><body>')
    html.append('<h1>🎮 Roguelike Asset Selector v5</h1>')
    html.append('<p class="subtitle">Click an image to select it for each asset. Click the emoji/color in "Current" to keep it as is.</p>')
    
    for cat_name, cat_items in categories.items():
        if not cat_items:
            continue
        
        html.append(f'<div class="category" id="cat-{cat_name}">')
        html.append(f'<h2>{cat_name}</h2>')
        html.append(f'<p class="section-info">{len(cat_items)} assets in this category</p>')
        
        html.append('<table>')
        html.append('<thead><tr>')
        html.append('<th class="col-key">Key</th>')
        html.append('<th class="col-name">Name</th>')
        html.append('<th class="col-current">Current</th>')
        html.append('<th class="col-lpc">LPC Suggestions</th>')
        html.append('<th class="col-dcss">DCSS Suggestions</th>')
        html.append('<th class="col-selected">Selected</th>')
        html.append('</tr></thead>')
        html.append('<tbody>')
        
        for key, config, source_type in cat_items:
            # Ensure name exists
            name = config.get('name', key)
            if name == key:
                name = key.title()
            
            # Key column
            key_display = key if len(key) <= 15 else key[:12] + '...'
            html.append(f'<tr data-key="{key}" data-type="{source_type}">')
            html.append(f'<td class="col-key" title="{key}"><code>{key_display}</code></td>')
            
            # Name column
            html.append(f'<td class="col-name">{name}</td>')
            
            # Current column - Show emoji if available in config (icon), else key, else color
            display = config.get('icon', key)
            if any(ord(c) > 127 for c in display):
                # It's an emoji
                html.append(f'<td class="col-current"><div class="thumb emoji-thumb" data-source="emoji" data-path="{display}">{display}</div></td>')
            else:
                # It's a color or text
                color = config.get('color', '#888')
                # If display is text and not a color code, show it as text
                if display.startswith('#'):
                     html.append(f'<td class="col-current"><div class="thumb color-thumb" style="background: {display};" data-source="color" data-path="{display}" title="Current color: {display}"></div></td>')
                else:
                     html.append(f'<td class="col-current"><div class="thumb emoji-thumb" data-source="text" data-path="{display}">{display}</div></td>')
            
            # LPC Suggestions
            lpc_matches, crawl_matches = get_semantic_suggestions(key, config, image_db, max_results=5)
            lpc_cell = []
            for img in lpc_matches:
                lpc_cell.append(f'<div class="thumb" data-source="lpc" data-path="{img}" title="{img}"><img src="external/lpc-spritesheet/{img}" alt=""></div>')
            html.append(f'<td class="col-lpc"><div class="suggestions">{" ".join(lpc_cell) if lpc_cell else "No matches"}</div></td>')
            
            # DCSS Suggestions
            crawl_cell = []
            for img in crawl_matches:
                crawl_cell.append(f'<div class="thumb" data-source="crawl" data-path="{img}" title="{img}"><img src="external/crawl/crawl-ref/source/rltiles/{img}" alt=""></div>')
            html.append(f'<td class="col-dcss"><div class="suggestions">{" ".join(crawl_cell) if crawl_cell else "No matches"}</div></td>')
            
            # Selected column
            html.append(f'<td class="col-selected" id="selected-{key}">-</td>')
            
            html.append('</tr>')
        
        html.append('</tbody></table></div>')
    
    # Controls
    html.append('<div style="text-align: center;">')
    html.append('<button id="generate-btn">Generate Mapping JSON</button>')
    html.append('<textarea id="output" readonly placeholder="JSON output will appear here..."></textarea>')
    html.append('<div class="legend">Click images to select. Use JSON to update game assets.</div>')
    html.append('</div>')
    
    # JavaScript
    html.append('<script>')
    html.append('const selections = {};')
    html.append('document.querySelectorAll(".thumb").forEach(el => {')
    html.append('  el.addEventListener("click", function() {')
    html.append('    const row = this.closest("tr");')
    html.append('    const key = row.dataset.key;')
    html.append('    selections[key] = { source: this.dataset.source, path: this.dataset.path };')
    html.append('    const selectedCell = row.querySelector(".col-selected");')
    html.append('    selectedCell.textContent = this.dataset.path || this.textContent;')
    html.append('    row.querySelectorAll(".thumb").forEach(t => t.classList.remove("selected"));')
    html.append('    this.classList.add("selected");')
    html.append('  });')
    html.append('});')
    html.append('document.getElementById("generate-btn").addEventListener("click", () => {')
    html.append('  document.getElementById("output").value = JSON.stringify(selections, null, 2);')
    html.append('});')
    html.append('</script>')
    html.append('</body></html>')
    
    return '\n'.join(html)

if __name__ == '__main__':
    html = generate_html()
    with open('asset_selector_v5.html', 'w') as f:
        f.write(html)
    print('Generated asset_selector_v5.html')
    print('Total assets: 154+')
    print('Features: Enhanced matching, improved UI, emoji support')