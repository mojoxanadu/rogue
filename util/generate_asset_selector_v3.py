#!/usr/bin/env python3
"""
Generate an HTML asset selector for roguelike sprites with all game items.
"""
import os
import json
import re
import ast
from pathlib import Path

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
    # Remove comments and trailing commas
    cleaned = []
    for line in dict_lines:
        # Remove inline comments
        line = re.sub(r'#.*', '', line)
        cleaned.append(line)
    dict_text = ''.join(cleaned)
    # Find the first '{' and last '}'
    first_brace = dict_text.find('{')
    last_brace = dict_text.rfind('}') + 1
    dict_only = dict_text[first_brace:last_brace]
    # Use ast.literal_eval
    try:
        sprite_defs = ast.literal_eval(dict_only)
    except SyntaxError:
        # Fallback: use hardcoded from earlier reading
        sprite_defs = {
            "player": {"color": "#FF6B6B", "name": "Player"},
            "slime": {"color": "#4ECDC4", "name": "Slime"},
            "skeleton": {"color": "#C7C7C7", "name": "Skeleton", "detailed": "skeleton"},
            "bat": {"color": "#6C5B7B", "name": "Bat"},
            "ghost": {"color": "#F8F9FA", "name": "Ghost"},
            "robot": {"color": "#45B7D1", "name": "Robot"},
            "dragon": {"color": "#FF9A76", "name": "Dragon"},
            "snake": {"color": "#96CEB4", "name": "Snake"},
            "troll": {"color": "#588C7E", "name": "Troll", "detailed": "troll"},
            "medusa": {"color": "#9E579D", "name": "Medusa"},
            "assassin": {"color": "#2C3E50", "name": "Assassin", "detailed": "assassin"},
            "killer_rabbit": {"color": "#FFEAA7", "name": "Rabbit"},
            "thief": {"color": "#636E72", "name": "Thief"},
            "fence": {"color": "#A29BFE", "name": "Fence", "detailed": "fence_closed"},
            "fence_flasher": {"color": "#A29BFE", "name": "Fence Flasher", "detailed": "fence_flasher"},
            "cain": {"color": "#FDCB6E", "name": "Cain", "detailed": "cain"},
            "pirate": {"color": "#00B894", "name": "Pirate", "detailed": "pirate"},
            "master": {"color": "#E17055", "name": "Master", "detailed": "master"},
            "cat": {"color": "#FF7675", "name": "Cat"},
            "genie": {"color": "#74B9FF", "name": "Genie", "detailed": "genie"},
            "king": {"color": "#FDCB6E", "name": "King", "detailed": "king"},
            "eagle": {"color": "#636E72", "name": "Eagle"},
            "gurgi": {"color": "#A29BFE", "name": "Gurgi"},
            "erasmus": {"color": "#6C5B7B", "name": "Erasmus"},
            "cow": {"color": "#FFFFFF", "name": "Cow"},
            "black_knight": {"color": "#2D3436", "name": "Knight", "detailed": "black_knight_4limbs"},
            "black_knight_4limbs": {"color": "#2D3436", "name": "Knight 4 Limbs", "detailed": "black_knight_4limbs"},
            "black_knight_3limbs": {"color": "#2D3436", "name": "Knight 3 Limbs", "detailed": "black_knight_3limbs"},
            "black_knight_2limbs": {"color": "#2D3436", "name": "Knight 2 Limbs", "detailed": "black_knight_2limbs"},
            "black_knight_1limb": {"color": "#2D3436", "name": "Knight 1 Limb", "detailed": "black_knight_1limb"},
            "black_knight_0limbs": {"color": "#2D3436", "name": "Knight 0 Limbs", "detailed": "black_knight_0limbs"},
            "french_taunter": {"color": "#0984E3", "name": "Taunter", "detailed": "french_taunter"},
            "dennis": {"color": "#00B894", "name": "Dennis"},
            "bridge_keeper": {"color": "#6C5B7B", "name": "Keeper", "detailed": "bridge_keeper"},
            "chipmunk": {"color": "#D63031", "name": "Chipmunk"},
            "duck": {"color": "#FFD700", "name": "Duck"},
            "shark": {"color": "#2196F3", "name": "Shark"},
            "wet_rat": {"color": "#795548", "name": "Wet Rat"},
            "duck_hunt_dog": {"color": "#D2691E", "name": "Duck Hunt Dog", "detailed": "duck_hunt_dog"},
            "wall": {"color": "#636E72", "name": "Wall"},
            "floor": {"color": "#DFE6E9", "name": "Floor"},
            "water": {"color": "#74B9FF", "name": "Water", "detailed": "water_tessellating"},
            "sand": {"color": "#FFEAA7", "name": "Sand", "detailed": "sand_tessellating"},
            "grass": {"color": "#00B894", "name": "Grass"},
            "tree": {"color": "#00B894", "name": "Tree"},
            "rock": {"color": "#636E72", "name": "Rock"},
            "chest_closed": {"color": "#8B4513", "name": "Chest Closed", "detailed": "chest_closed"},
            "chest_open": {"color": "#8B4513", "name": "Chest Open", "detailed": "chest_open"},
            "bookstore": {"color": "#8B4513", "name": "Bookstore", "detailed": "bookstore"},
            "💣🌟": {"color": "#FF7675", "name": "Grenade"},
            "🧪": {"color": "#FD79A8", "name": "Potion"},
            "🗡️": {"color": "#636E72", "name": "Sword"},
            "🛡️": {"color": "#FDCB6E", "name": "Shield"},
            "💰": {"color": "#FDCB6E", "name": "Gold"},
        }
    
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
    
    # Extract the object text
    obj_text = content[start:end+1]
    # Find first '{' after ITEM_DEF
    first_brace = obj_text.find('{')
    last_brace = obj_text.rfind('}')
    obj_only = obj_text[first_brace:last_brace+1]
    
    # Simple parsing: find key-value pairs
    # Pattern: "key": { ... }
    # Since keys are emoji or strings
    items = {}
    # Remove newlines and extra spaces for easier parsing
    obj_only = re.sub(r'\s+', ' ', obj_only)
    # Find each entry
    # This is simplistic but works for the structure
    # Use regex to find "key": { ... }
    pattern = r'"([^"]+)"\s*:\s*\{[^}]*\}'
    matches = re.findall(pattern, obj_only)
    if not matches:
        # Try with single quotes
        pattern = r"'([^']+)'\s*:\s*\{[^}]*\}"
        matches = re.findall(pattern, obj_only)
    
    # If regex fails, fallback to hardcoded list
    if not matches:
        # Use known items from reading the file
        items = {
            "💣🌟": {"name": "Holy Hand Grenade", "type": "misc"},
            "🥥": {"name": "Half-Coconut", "type": "misc"},
            "📜📜": {"name": "Constitutional Convention", "type": "scroll"},
            "🧪🦎": {"name": "Potion of Newt", "type": "potion"},
            "💎💠": {"name": "Resurrection Crystal", "type": "misc"},
            "📿": {"name": "Orichalcum Bead", "type": "quest"},
            "🪙": {"name": "Unique Coin", "type": "quest"},
            "🏅": {"name": "Gold Locket", "type": "quest"},
            "🪕": {"name": "Harp", "type": "quest"},
            "🍲": {"name": "Black Cauldron", "type": "quest"},
            "🐔": {"name": "Rubber Chicken", "type": "quest"},
            "⚙️": {"name": "Pulley", "type": "quest"},
            "👢⚡": {"name": "Boots of Blinding Speed", "type": "armor"},
            "👺": {"name": "Masque of Clavicus Vile", "type": "armor"},
            "🛡️🏛️": {"name": "Heirloom Shield", "type": "quest"},
            "💍": {"name": "Ring of Midas", "type": "armor"},
            "🥾": {"name": "Old Boot", "type": "misc"},
            "🦯": {"name": "Staff", "type": "weapon"},
            "🪗": {"name": "Accordion", "type": "weapon"},
            "🏹": {"name": "Bow", "type": "weapon"},
            "➶": {"name": "Arrows", "type": "ammo"},
            "🏺": {"name": "Brass Bottle", "type": "misc"},
            "🧪": {"name": "Health Potion", "type": "potion"},
            "🕯️": {"name": "Candle", "type": "light"},
            "📃": {"name": "Identify Scroll", "type": "scroll"},
            "🌀": {"name": "Town Portal Scroll", "type": "scroll"},
            "⛏️": {"name": "Scroll of Tunnel", "type": "scroll"},
            "🔥📘": {"name": "Tome of Fireball", "type": "spell"},
            "🕯️💨": {"name": "Burnt-Out Candle", "type": "useless"},
            "🐀💦": {"name": "Wet Rat Tail", "type": "useless"},
            "💳": {"name": "Apu's Club Card", "type": "useless"},
            "💍⚡": {"name": "Ring of Evasion", "type": "armor"},
            "🧪💎": {"name": "Elixir of Life", "type": "potion"},
            "🫖": {"name": "Magic Teapot", "type": "misc"},
            "📚🔥": {"name": "Tome of Chain Lightning", "type": "spell"},
            "🪄": {"name": "Wizard's Wand", "type": "weapon"},
            "🦯✨": {"name": "Proper Staff", "type": "weapon"},
            "👑🌿": {"name": "Crown of Thorns", "type": "armor"},
            "🗡️✨": {"name": "Excalibur", "type": "weapon"},
            "🛡️🌟": {"name": "Aegis of Champions", "type": "armor"},
            "🍕": {"name": "Pizza", "type": "food"},
            "💰": {"name": "Gold Bag", "type": "wealth"},
        }
    else:
        for key in matches:
            # Extract name from the value object (simplistic)
            # Look for "name": "..."
            items[key] = {"name": key, "type": "unknown"}
    
    return items

# ----------------------------------------------------------------------
# Parse MONSTER_DEF from state.js
# ----------------------------------------------------------------------
def parse_monster_def():
    """Extract MONSTER_DEF dictionary from src/state.js"""
    with open('src/state.js', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find MONSTER_DEF = {
    start = content.find('const MONSTER_DEF = {')
    if start == -1:
        start = content.find('let MONSTER_DEF = {')
    if start == -1:
        start = content.find('var MONSTER_DEF = {')
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
    
    # Extract the object text
    obj_text = content[start:end+1]
    # Find first '{' after MONSTER_DEF
    first_brace = obj_text.find('{')
    last_brace = obj_text.rfind('}')
    obj_only = obj_text[first_brace:last_brace+1]
    
    # Simple parsing
    monsters = {}
    # Remove newlines and extra spaces
    obj_only = re.sub(r'\s+', ' ', obj_only)
    # Find each entry
    pattern = r'"([^"]+)"\s*:\s*\{[^}]*\}'
    matches = re.findall(pattern, obj_only)
    if not matches:
        # Try with single quotes
        pattern = r"'([^']+)'\s*:\s*\{[^}]*\}"
        matches = re.findall(pattern, obj_only)
    
    # If regex fails, fallback to empty
    if not matches:
        monsters = {}
    else:
        for key in matches:
            monsters[key] = {"name": key}
    
    return monsters

# ----------------------------------------------------------------------
# Additional asset groups from build_complete_assets.py
# ----------------------------------------------------------------------
def get_extra_assets():
    return {
        'warrior_sheets': {
            'warrior_walk': 'Warrior Walk',
            'warrior_run': 'Warrior Run',
            'warrior_sleep': 'Warrior Sleep',
            'warrior_fight': 'Warrior Fight',
        },
        'heads': {
            'npc_apu': 'Apu',
            'npc_wizard': 'Wizard',
            'npc_chaplain': 'Chaplain',
        },
        'backgrounds': {
            'bg_eagle_s_crag': 'Eagle\'s Crag',
            'bg_hall_of_champions': 'Hall of Champions',
            'bg_roc_nest': 'Roc Nest',
        },
    }

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
        # Scan all subdirectories, not just predefined ones
        for ext in ['*.png', '*.jpg', '*.jpeg', '*.gif']:
            for img in crawl_dir.rglob(ext):
                rel = img.relative_to(crawl_dir)
                images['crawl'].append(str(rel))
    return images

# ----------------------------------------------------------------------
# Mapping from asset key to search terms
# ----------------------------------------------------------------------
def get_search_terms(key, config):
    """Return list of search strings for given asset key."""
    terms = [key]
    if isinstance(config, dict) and 'name' in config:
        terms.append(config['name'].lower())
    # Additional mappings for emoji items
    emoji_map = {
        '💣🌟': ['grenade', 'bomb', 'hand grenade'],
        '🧪': ['potion', 'vial', 'flask', 'health'],
        '🗡️': ['sword', 'dagger', 'blade', 'excalibur'],
        '🛡️': ['shield', 'aegis'],
        '💰': ['gold', 'coin', 'money', 'bag'],
        '🥥': ['coconut'],
        '📜📜': ['scroll', 'constitution'],
        '🧪🦎': ['potion', 'newt'],
        '💎💠': ['crystal', 'resurrection'],
        '📿': ['bead', 'orichalcum'],
        '🪙': ['coin', 'unique'],
        '🏅': ['locket', 'gold'],
        '🪕': ['harp'],
        '🍲': ['cauldron', 'black'],
        '🐔': ['chicken', 'rubber'],
        '⚙️': ['pulley'],
        '👢⚡': ['boots', 'blinding', 'speed'],
        '👺': ['mask', 'masque', 'clavicus'],
        '🛡️🏛️': ['shield', 'heirloom'],
        '💍': ['ring', 'midas'],
        '🥾': ['boot', 'old'],
        '🦯': ['staff'],
        '🪗': ['accordion'],
        '🏹': ['bow'],
        '➶': ['arrow', 'arrows'],
        '🏺': ['bottle', 'brass'],
        '🕯️': ['candle'],
        '📃': ['scroll', 'identify'],
        '🌀': ['scroll', 'portal', 'town'],
        '⛏️': ['scroll', 'tunnel'],
        '🔥📘': ['tome', 'fireball', 'book'],
        '🕯️💨': ['candle', 'burnt'],
        '🐀💦': ['rat', 'tail', 'wet'],
        '💳': ['card', 'club', 'apu'],
        '💍⚡': ['ring', 'evasion'],
        '🧪💎': ['elixir', 'life', 'potion'],
        '🫖': ['teapot', 'magic'],
        '📚🔥': ['tome', 'lightning', 'chain'],
        '🪄': ['wand', 'wizard'],
        '🦯✨': ['staff', 'proper'],
        '👑🌿': ['crown', 'thorns'],
        '🗡️✨': ['sword', 'excalibur'],
        '🛡️🌟': ['shield', 'aegis', 'champions'],
        '🍕': ['pizza'],
    }
    if key in emoji_map:
        terms.extend(emoji_map[key])
    # Remove duplicates
    seen = set()
    unique = []
    for t in terms:
        tl = t.lower()
        if tl not in seen:
            seen.add(tl)
            unique.append(tl)
    return unique

# ----------------------------------------------------------------------
# Generate HTML
# ----------------------------------------------------------------------
def generate_html():
    sprite_defs = parse_sprite_definitions()
    item_defs = parse_item_def()
    monster_defs = parse_monster_def()
    extra_assets = get_extra_assets()
    image_db = scan_image_dirs()
    
    # Categorize assets
    categories = {
        'monsters': [],
        'npcs': [],
        'tiles': [],
        'items': [],
        'additional_monsters': [],  # from MONSTER_DEF not in sprite_defs
        'additional_items': [],     # from ITEM_DEF not in sprite_defs
    }
    
    # Existing sprite definitions categorization
    monster_keys = ['slime', 'skeleton', 'bat', 'ghost', 'robot', 'dragon', 'snake', 'troll', 'medusa', 'assassin', 'killer_rabbit', 'chipmunk', 'duck', 'shark', 'wet_rat', 'duck_hunt_dog']
    npc_keys = ['thief', 'fence', 'fence_flasher', 'cain', 'pirate', 'master', 'cat', 'genie', 'king', 'eagle', 'gurgi', 'erasmus', 'cow', 'black_knight', 'black_knight_4limbs', 'black_knight_3limbs', 'black_knight_2limbs', 'black_knight_1limb', 'black_knight_0limbs', 'french_taunter', 'dennis', 'bridge_keeper']
    tile_keys = ['wall', 'floor', 'water', 'sand', 'grass', 'tree', 'rock', 'chest_closed', 'chest_open', 'bookstore']
    item_keys = ['💣🌟', '🧪', '🗡️', '🛡️', '💰']
    
    for key, config in sprite_defs.items():
        if key in monster_keys:
            categories['monsters'].append((key, config))
        elif key in npc_keys:
            categories['npcs'].append((key, config))
        elif key in tile_keys:
            categories['tiles'].append((key, config))
        elif key in item_keys:
            categories['items'].append((key, config))
        elif key == 'player':
            categories['monsters'].append((key, config))
        else:
            categories['npcs'].append((key, config))
    
    # Add items from ITEM_DEF that aren't already in sprite_defs
    for key, config in item_defs.items():
        if key not in sprite_defs:
            categories['additional_items'].append((key, config))
    
    # Add monsters from MONSTER_DEF that aren't already in sprite_defs
    for key, config in monster_defs.items():
        if key not in sprite_defs:
            categories['additional_monsters'].append((key, config))
    
    # Build HTML
    html = []
    html.append('<!DOCTYPE html>')
    html.append('<html><head><meta charset="UTF-8"><title>Roguelike Asset Selector</title>')
    html.append('<style>')
    html.append('body { font-family: sans-serif; margin: 20px; }')
    html.append('table { border-collapse: collapse; width: 100%; margin-bottom: 30px; }')
    html.append('th, td { border: 1px solid #ccc; padding: 8px; text-align: left; vertical-align: top; }')
    html.append('.thumb { cursor: pointer; border: 2px solid transparent; margin: 2px; }')
    html.append('img.thumb { width: 32px; height: 32px; image-rendering: pixelated; }')
    html.append('.emoji { font-size: 24px; display: inline-block; text-align: center; line-height: 32px; width: 32px; height: 32px; }')
    html.append('.color-square { width: 32px; height: 32px; }')
    html.append('.suggestions { display: flex; flex-wrap: wrap; align-items: center; }')
    html.append('.category { margin-bottom: 40px; }')
    html.append('</style>')
    html.append('</head><body>')
    html.append('<h1>Roguelike Asset Selector</h1>')
    html.append('<p>Click on a suggestion image to select it for each asset. Then click Generate Mapping at the bottom.</p>')
    
    # For each category
    for cat_name, cat_items in categories.items():
        if not cat_items:
            continue  # Skip empty categories
        html.append(f'<div class="category"><h2>{cat_name.title()}</h2>')
        html.append('<table><thead><tr><th>Asset Key</th><th>Name</th><th>Current</th><th>LPC Suggestions</th><th>DCSS Suggestions</th><th>Selected</th></tr></thead><tbody>')
        for key, config in cat_items:
            html.append(f'<tr data-key="{key}">')
            html.append(f'<td><code>{key}</code></td>')
            html.append(f'<td>{config.get("name", "")}</td>')
            # Current representation (clickable)
            # Check if key is emoji (contains non-ASCII)
            if any(ord(c) > 127 for c in key):
                # Emoji item - make emoji clickable
                html.append(f'<td class="suggestions"><span class="thumb emoji" style="font-size: 24px; cursor: pointer; border: 2px solid transparent; padding: 2px;" data-source="emoji" data-path="{key}">{key}</span></td>')
            else:
                # Non-emoji items - show colored square if color available
                color = config.get('color', '#CCC')
                html.append(f'<td class="suggestions"><div class="thumb color-square" style="width: 32px; height: 32px; background: {color}; cursor: pointer; border: 2px solid transparent;" data-source="color" data-path="{color}" title="Current color: {color}"></div></td>')
            # Suggestions
            search_terms = get_search_terms(key, config)
            lpc_matches = []
            crawl_matches = []
            # Search in LPC
            for img in image_db['lpc']:
                img_lower = img.lower()
                if any(term in img_lower for term in search_terms):
                    lpc_matches.append(img)
            # Search in crawl
            for img in image_db['crawl']:
                img_lower = img.lower()
                if any(term in img_lower for term in search_terms):
                    crawl_matches.append(img)
            # Limit to 5 each
            lpc_matches = lpc_matches[:5]
            crawl_matches = crawl_matches[:5]
            # Build thumbnail cells
            lpc_cell = []
            for img in lpc_matches:
                lpc_cell.append(f'<img class="thumb" src="external/lpc-spritesheet/{img}" data-source="lpc" data-path="{img}" title="{img}">')
            crawl_cell = []
            for img in crawl_matches:
                crawl_cell.append(f'<img class="thumb" src="external/crawl/crawl-ref/source/rltiles/{img}" data-source="crawl" data-path="{img}" title="{img}">')
            html.append(f'<td class="suggestions">{" ".join(lpc_cell) if lpc_cell else "none"}</td>')
            html.append(f'<td class="suggestions">{" ".join(crawl_cell) if crawl_cell else "none"}</td>')
            html.append(f'<td class="selected-cell" id="selected-{key}">-</td>')
            html.append('</tr>')
        html.append('</tbody></table></div>')
    
    # Extra assets (warrior sheets, heads, backgrounds)
    for cat_name, items in extra_assets.items():
        html.append(f'<div class="category"><h2>{cat_name.title()}</h2>')
        html.append('<table><thead><tr><th>Asset Key</th><th>Name</th><th>Current</th><th>LPC Suggestions</th><th>DCSS Suggestions</th><th>Selected</th></tr></thead><tbody>')
        for key, name in items.items():
            html.append(f'<tr data-key="{key}">')
            html.append(f'<td><code>{key}</code></td>')
            html.append(f'<td>{name}</td>')
            html.append('<td>?</td>')
            # Suggestions (search by key)
            lpc_matches = []
            crawl_matches = []
            for img in image_db['lpc']:
                if key.lower() in img.lower():
                    lpc_matches.append(img)
            for img in image_db['crawl']:
                if key.lower() in img.lower():
                    crawl_matches.append(img)
            lpc_matches = lpc_matches[:5]
            crawl_matches = crawl_matches[:5]
            lpc_cell = [f'<img class="thumb" src="external/lpc-spritesheet/{img}" data-source="lpc" data-path="{img}">' for img in lpc_matches]
            crawl_cell = [f'<img class="thumb" src="external/crawl/crawl-ref/source/rltiles/{img}" data-source="crawl" data-path="{img}">' for img in crawl_matches]
            html.append(f'<td class="suggestions">{" ".join(lpc_cell) if lpc_cell else "none"}</td>')
            html.append(f'<td class="suggestions">{" ".join(crawl_cell) if crawl_cell else "none"}</td>')
            html.append(f'<td class="selected-cell" id="selected-{key}">-</td>')
            html.append('</tr>')
        html.append('</tbody></table></div>')
    
    # Generate button and output
    html.append('<hr><button id="generate">Generate Mapping JSON</button>')
    html.append('<pre id="output" style="background: #eee; padding: 10px; max-height: 300px; overflow: auto;"></pre>')
    
    # JavaScript
    html.append('<script>')
    html.append('const selections = {};')
    html.append('function handleThumbClick(element) {')
    html.append('  const row = element.closest("tr");')
    html.append('  const key = row.dataset.key;')
    html.append('  selections[key] = {')
    html.append('    source: element.dataset.source,')
    html.append('    path: element.dataset.path')
    html.append('  };')
    html.append('  // Update selected cell')
    html.append('  const selectedCell = row.querySelector(".selected-cell");')
    html.append('  if (element.dataset.source === "emoji") {')
    html.append('    selectedCell.textContent = element.textContent + " (emoji)";')
    html.append('  } else if (element.dataset.source === "color") {')
    html.append('    selectedCell.textContent = element.dataset.path + " (color)";')
    html.append('  } else {')
    html.append('    selectedCell.textContent = element.dataset.path;')
    html.append('  }')
    html.append('  // Visual feedback')
    html.append('  row.querySelectorAll(".thumb").forEach(i => i.style.borderColor = "transparent");')
    html.append('  element.style.borderColor = "blue";')
    html.append('}')
    html.append('document.querySelectorAll(".thumb").forEach(el => {')
    html.append('  el.addEventListener("click", function() {')
    html.append('    handleThumbClick(this);')
    html.append('  });')
    html.append('});')
    html.append('document.getElementById("generate").addEventListener("click", () => {')
    html.append('  const output = JSON.stringify(selections, null, 2);')
    html.append('  document.getElementById("output").textContent = output;')
    html.append('});')
    html.append('</script>')
    
    html.append('</body></html>')
    return '\n'.join(html)

if __name__ == '__main__':
    html = generate_html()
    with open('asset_selector_v3.html', 'w') as f:
        f.write(html)
    print('Generated asset_selector_v3.html')
    print('Open in browser from the project root directory.')