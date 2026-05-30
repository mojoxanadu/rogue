#!/usr/bin/env python3
"""
Generate an HTML asset selector for roguelike sprites with Andor's Trail support.
"""
import os
import re
import ast
from pathlib import Path

# ----------------------------------------------------------------------
# Parse sprite_definitions from build_complete_assets.py
# ----------------------------------------------------------------------
def parse_sprite_definitions():
    with open('build_complete_assets.py', 'r') as f:
        lines = f.readlines()
    
    start = None
    for i, line in enumerate(lines):
        if 'sprite_definitions = {' in line:
            start = i
            break
    if start is None:
        return {}
    
    brace = 0
    for i in range(start, len(lines)):
        brace += lines[i].count('{')
        brace -= lines[i].count('}')
        if brace == 0:
            end = i
            break
    else:
        end = len(lines) - 1
    
    dict_lines = lines[start:end+1]
    cleaned = []
    for line in dict_lines:
        # Remove inline comments, but be careful with # inside strings (like hex colors)
        # This regex removes # and everything after it, UNLESS the # is inside quotes
        # This is a heuristic and might fail on complex strings, but works for this file
        # We can just remove the comment part if it's outside quotes.
        # A simpler approach for this specific file: just strip the comment part if # is not in a string
        # Actually, the file has hex codes like #FF6B6B.
        # If we remove `#.*`, it breaks hex codes.
        # If we remove `\s#.*`, it might miss comments at start of line.
        # Let's try to find a # that is not inside a string.
        # Since strings are simple (no escaped quotes usually), we can toggle a state.
        
        in_string = False
        string_char = None
        cleaned_line = []
        i = 0
        while i < len(line):
            char = line[i]
            if not in_string and (char == '"' or char == "'"):
                in_string = True
                string_char = char
                cleaned_line.append(char)
            elif in_string and char == string_char:
                in_string = False
                string_char = None
                cleaned_line.append(char)
            elif not in_string and char == '#':
                # Rest of line is comment
                break
            else:
                cleaned_line.append(char)
            i += 1
        
        cleaned.append(''.join(cleaned_line))
    dict_text = ''.join(cleaned)
    first_brace = dict_text.find('{')
    last_brace = dict_text.rfind('}') + 1
    dict_only = dict_text[first_brace:last_brace]
    # Debug: print first 200 chars of dict_only
    # print(f"DEBUG dict_only: {dict_only[:200]}...")
    
    try:
        sprite_defs = ast.literal_eval(dict_only)
    except SyntaxError as e:
        print(f"SyntaxError parsing sprite_definitions: {e}")
        sprite_defs = {}
    
    print(f"Parsed {len(sprite_defs)} sprite definitions")
    return sprite_defs

# ----------------------------------------------------------------------
# Parse ITEM_DEF from state.js
# ----------------------------------------------------------------------
def parse_item_def():
    with open('src/state.js', 'r', encoding='utf-8') as f:
        content = f.read()
    
    start = content.find('const ITEM_DEF = {')
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
    
    items = {}
    pattern = r'"([^"]+)"\s*:\s*\{'
    matches = re.findall(pattern, obj_only)
    
    for key in matches:
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
    andor_dir = Path('external/andors-trail/AndorsTrail/res/drawable')
    
    images = {'lpc': [], 'crawl': [], 'andor': []}
    
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
    
    if andor_dir.exists():
        for ext in ['*.png']:
            for img in andor_dir.rglob(ext):
                rel = img.relative_to(andor_dir)
                images['andor'].append(str(rel))
    
    return images

# ----------------------------------------------------------------------
# Matching logic
# ----------------------------------------------------------------------
def get_search_terms(key, config):
    terms = [key]
    if isinstance(config, dict) and 'name' in config:
        terms.append(config['name'].lower())
    
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
    }
    
    if key in synonyms:
        terms.extend(synonyms[key])
    
    seen = set()
    unique = []
    for t in terms:
        tl = t.lower()
        if tl not in seen:
            seen.add(tl)
            unique.append(tl)
    return unique

def get_semantic_suggestions(key, config, image_db, max_results=5):
    search_terms = get_search_terms(key, config)
    
    lpc_matches = []
    crawl_matches = []
    andor_matches = []
    
    for img in image_db['lpc']:
        img_lower = img.lower()
        if any(term in img_lower for term in search_terms):
            lpc_matches.append(img)
    
    for img in image_db['crawl']:
        img_lower = img.lower()
        if any(term in img_lower for term in search_terms):
            crawl_matches.append(img)
            
    for img in image_db['andor']:
        img_lower = img.lower()
        if any(term in img_lower for term in search_terms):
            andor_matches.append(img)
    
    # Fallback if empty
    if not lpc_matches:
        for img in image_db['lpc']:
            img_lower = img.lower()
            for term in search_terms:
                parts = img_lower.replace('/', ' ').replace('_', ' ').replace('-', ' ').split()
                if any(term in part for part in parts):
                    lpc_matches.append(img)
                    break
    
    if not crawl_matches:
        for img in image_db['crawl']:
            img_lower = img.lower()
            for term in search_terms:
                parts = img_lower.replace('/', ' ').replace('_', ' ').replace('-', ' ').split()
                if any(term in part for part in parts):
                    crawl_matches.append(img)
                    break

    if not andor_matches:
        for img in image_db['andor']:
            img_lower = img.lower()
            for term in search_terms:
                parts = img_lower.replace('/', ' ').replace('_', ' ').replace('-', ' ').split()
                if any(term in part for part in parts):
                    andor_matches.append(img)
                    break
    
    return lpc_matches[:max_results], crawl_matches[:max_results], andor_matches[:max_results]

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
    
    # Monsters from sprite_defs
    monster_list = []
    monster_keys = ['player', 'slime', 'skeleton', 'bat', 'ghost', 'robot', 'dragon', 'snake', 'troll', 'medusa', 'assassin', 'killer_rabbit', 'chipmunk', 'duck', 'shark', 'wet_rat', 'duck_hunt_dog']
    # Merge sprite_defs with monster_defs to get icons
    merged_defs = sprite_defs.copy()
    for key, config in monster_defs.items():
        if key in merged_defs:
            merged_defs[key].update(config) # Add icon, etc.
        else:
            merged_defs[key] = config
            
    for key, config in merged_defs.items():
        if key in monster_keys or 'detailed' in config or key == 'player':
            if 'name' not in config: config['name'] = key.title()
            monster_list.append((key, config, 'sprite'))
    categories['Monsters'] = monster_list
    
    # NPCs
    npc_list = []
    npc_keys = ['thief', 'fence', 'fence_flasher', 'cain', 'pirate', 'master', 'cat', 'genie', 'king', 'eagle', 'gurgi', 'erasmus', 'cow', 'black_knight', 'french_taunter', 'dennis', 'bridge_keeper']
    for key, config in sprite_defs.items():
        if key in npc_keys:
            if 'name' not in config: config['name'] = key.title()
            npc_list.append((key, config, 'sprite'))
    categories['NPCs'] = npc_list
    
    # Tiles
    tile_list = []
    tile_keys = ['wall', 'floor', 'water', 'sand', 'grass', 'tree', 'rock', 'chest_closed', 'chest_open', 'bookstore']
    for key, config in sprite_defs.items():
        if key in tile_keys:
            if 'name' not in config: config['name'] = key.title()
            tile_list.append((key, config, 'sprite'))
    categories['Tiles'] = tile_list
    
    # Items
    all_items_list = []
    for key, config in item_defs.items():
        all_items_list.append((key, config, 'item'))
    categories['All Items'] = all_items_list
    
    # Build HTML
    html = []
    html.append('<!DOCTYPE html>')
    html.append('<html><head><meta charset="UTF-8"><title>Roguelike Asset Selector v6</title>')
    html.append('<meta name="viewport" content="width=device-width, initial-scale=1">')
    html.append('<style>')
    html.append('* { box-sizing: border-box; }')
    html.append('body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; background: #1a1a2e; color: #e0e0e0; }')
    html.append('h1 { text-align: center; color: #f39c12; margin-bottom: 10px; }')
    html.append('.subtitle { text-align: center; color: #aaa; margin-bottom: 30px; }')
    html.append('.category { background: rgba(255,255,255,0.05); border-radius: 10px; padding: 20px; margin-bottom: 25px; }')
    html.append('.category h2 { margin-top: 0; color: #3498db; border-bottom: 2px solid #3498db; padding-bottom: 10px; }')
    html.append('table { width: 100%; border-collapse: collapse; table-layout: fixed; }')
    html.append('th, td { border: 1px solid #444; padding: 10px; text-align: center; vertical-align: middle; }')
    html.append('th { background: #2c3e50; position: sticky; top: 0; }')
    html.append('tr:nth-child(even) { background: rgba(255,255,255,0.02); }')
    html.append('.col-key { width: 10%; font-family: monospace; color: #f1c40f; word-break: break-all; font-size: 0.8em; }')
    html.append('.col-name { width: 15%; text-align: left; font-size: 0.9em; }')
    html.append('.col-current { width: 10%; }')
    html.append('.col-lpc { width: 20%; }')
    html.append('.col-andor { width: 20%; background: rgba(52, 152, 219, 0.1); }')
    html.append('.col-dcss { width: 15%; }')
    html.append('.col-selected { width: 10%; color: #2ecc71; font-size: 0.8em; word-break: break-all; }')
    html.append('.thumb { cursor: pointer; border: 2px solid transparent; border-radius: 4px; padding: 2px; transition: 0.1s; display: inline-block; }')
    html.append('.thumb:hover { transform: scale(1.1); border-color: #f39c12; }')
    html.append('.thumb.selected { border-color: #2ecc71; }')
    html.append('.thumb img { display: block; width: 32px; height: 32px; image-rendering: pixelated; }')
    html.append('.emoji-thumb { font-size: 28px; line-height: 32px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3); }')
    html.append('.color-thumb { width: 32px; height: 32px; border-radius: 4px; display: inline-block; }')
    html.append('.suggestions { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; min-height: 36px; align-items: center; }')
    html.append('#generate-btn { display: block; margin: 30px auto; padding: 15px 40px; font-size: 1.2em; background: #e74c3c; color: white; border: none; border-radius: 50px; cursor: pointer; }')
    html.append('#output { width: 100%; height: 150px; background: #1e1e1e; color: #00ff00; border: 1px solid #444; padding: 15px; font-family: monospace; border-radius: 5px; margin-top: 10px; resize: vertical; }')
    html.append('</style>')
    html.append('</head><body>')
    html.append('<h1>🎮 Roguelike Asset Selector v6</h1>')
    html.append('<p class="subtitle">Includes Andor\'s Trail assets (new column). Click to select sprites.</p>')
    
    for cat_name, cat_items in categories.items():
        if not cat_items: continue
        
        html.append(f'<div class="category">')
        html.append(f'<h2>{cat_name}</h2>')
        html.append('<table>')
        html.append('<thead><tr>')
        html.append('<th class="col-key">Key</th>')
        html.append('<th class="col-name">Name</th>')
        html.append('<th class="col-current">Current</th>')
        html.append('<th class="col-lpc">LPC</th>')
        html.append('<th class="col-andor">Andor\'s Trail</th>')
        html.append('<th class="col-dcss">DCSS</th>')
        html.append('<th class="col-selected">Selected</th>')
        html.append('</tr></thead><tbody>')
        
        for key, config, source_type in cat_items:
            name = config.get('name', key)
            if name == key: name = key.title()
            
            html.append(f'<tr data-key="{key}">')
            html.append(f'<td class="col-key" title="{key}"><code>{key}</code></td>')
            html.append(f'<td class="col-name">{name}</td>')
            
            # Current
            # Check for emoji icon first (from MONSTER_DEF or ITEM_DEF)
            icon = config.get('icon')
            if icon and any(ord(c) > 127 for c in icon):
                 html.append(f'<td class="col-current"><div class="thumb emoji-thumb" data-source="emoji" data-path="{icon}">{icon}</div></td>')
            elif any(ord(c) > 127 for c in key):
                html.append(f'<td class="col-current"><div class="thumb emoji-thumb" data-source="emoji" data-path="{key}">{key}</div></td>')
            else:
                color = config.get('color', '#888')
                html.append(f'<td class="col-current"><div class="thumb color-thumb" style="background: {color};" data-source="color" data-path="{color}"></div></td>')
            
            # Suggestions
            lpc_matches, crawl_matches, andor_matches = get_semantic_suggestions(key, config, image_db, max_results=3)
            
            lpc_html = ' '.join([f'<div class="thumb" data-source="lpc" data-path="{img}" title="{img}"><img src="external/lpc-spritesheet/{img}"></div>' for img in lpc_matches])
            andor_html = ' '.join([f'<div class="thumb" data-source="andor" data-path="{img}" title="{img}"><img src="external/andors-trail/AndorsTrail/res/drawable/{img}"></div>' for img in andor_matches])
            crawl_html = ' '.join([f'<div class="thumb" data-source="crawl" data-path="{img}" title="{img}"><img src="external/crawl/crawl-ref/source/rltiles/{img}"></div>' for img in crawl_matches])
            
            html.append(f'<td class="col-lpc"><div class="suggestions">{lpc_html if lpc_html else "No matches"}</div></td>')
            html.append(f'<td class="col-andor"><div class="suggestions">{andor_html if andor_html else "No matches"}</div></td>')
            html.append(f'<td class="col-dcss"><div class="suggestions">{crawl_html if crawl_html else "No matches"}</div></td>')
            html.append(f'<td class="col-selected" id="selected-{key}">-</td>')
            html.append('</tr>')
        
        html.append('</tbody></table></div>')
    
    html.append('<div style="text-align:center">')
    html.append('<button id="generate-btn">Generate Mapping JSON</button>')
    html.append('<textarea id="output"></textarea>')
    html.append('</div>')
    
    html.append('<script>')
    html.append('const selections = {};')
    html.append('document.querySelectorAll(".thumb").forEach(el => {')
    html.append('  el.addEventListener("click", function() {')
    html.append('    const row = this.closest("tr");')
    html.append('    const key = row.dataset.key;')
    html.append('    selections[key] = { source: this.dataset.source, path: this.dataset.path };')
    html.append('    row.querySelector(".col-selected").textContent = this.dataset.path || this.textContent;')
    html.append('    row.querySelectorAll(".thumb").forEach(t => t.classList.remove("selected"));')
    html.append('    this.classList.add("selected");')
    html.append('  });')
    html.append('});')
    html.append('document.getElementById("generate-btn").addEventListener("click", () => {')
    html.append('  document.getElementById("output").value = JSON.stringify(selections, null, 2);')
    html.append('});')
    html.append('</script></body></html>')
    
    return '\n'.join(html)

if __name__ == '__main__':
    html = generate_html()
    with open('asset_selector_v6.html', 'w') as f:
        f.write(html)
    print('Generated asset_selector_v6.html with Andor\'s Trail support')