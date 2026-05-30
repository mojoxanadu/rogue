import json
import base64
import os
import urllib.request
import re
from pathlib import Path

def generate_assets():
    assets = {
        "sprites": {},
        "sounds": {},
        "midi": {}
    }

    for d in ['sprites', 'sounds', 'midi']:
        if not os.path.exists(d):
            os.makedirs(d)

    # Adding an Ogg Vorbis file (fetch an example CC0 sound if possible)
    sounds_to_dl = {
        "sword": "https://raw.githubusercontent.com/rse/soundfx/master/dist/audio/hit-sword-1.mp3",
        "step": "https://raw.githubusercontent.com/rse/soundfx/master/dist/audio/step-1.mp3",
        "grunt": "https://raw.githubusercontent.com/rse/soundfx/master/dist/audio/grunt-1.mp3",
        "oof": "https://raw.githubusercontent.com/rse/soundfx/master/dist/audio/hit-1.mp3",
        # Adding some generic OGG Vorbis sound and MIDI for completion:
        "ambient": "https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg",
        "soundfont": "https://raw.githubusercontent.com/urish/c-sf2/master/test/test.sf2"
    }
    for name, url in sounds_to_dl.items():
        ext = url.split('.')[-1]
        if ext == 'sf2': dest = f"midi/{name}.sf2"
        elif ext == 'ogg': dest = f"sounds/{name}.ogg"
        else: dest = f"sounds/{name}.mp3"
        if not os.path.exists(dest):
            os.system(f"curl -s -L -o {dest} {url}")

    all_svgs = list(Path('temp_icons').rglob('*.svg'))
    
    # Map entities to SVG names
    svg_map = {
        "player": "character", "wall": "stone-wall", "floor": "flat-platform",
        "slime": "slime", "skeleton": "skeleton-inside", "bat": "bat", "ghost": "ghost",
        "dragon": "dragon-head", "chest": "open-chest", "sword": "broadsword", "shield": "shield",
        "potion": "magic-potion", "scroll": "scroll-unfurled", "coin": "coins", "black_knight": "black-knight-helm",
        "rabbit": "rabbit", "wizard": "wizard-face", "witch": "witch-face", "store": "shop",
        "portal": "magic-portal", "cow": "cow", "chicken": "chicken", "grenade": "holy-hand-grenade",
        "thief": "robber", "fence": "pouch", "cain": "beard", "snake": "snake", "troll": "troll",
        "medusa": "medusa-head", "pirate": "pirate-captain", "master": "fencer", "cat": "cat",
        "genie": "genie-lamp", "king": "crown", "eagle": "eagle-head", "gurgi": "monkey",
        "erasmus": "warlock-hood", "assassin": "ninja-head", "french_taunter": "castle", "dennis": "peasant",
        "bridge_keeper": "bridge", "chipmunk": "squirrel", "robot": "robot-golem", "water": "water-drop",
        "deep_water": "water-splash", "sand": "sand-castle", "grass": "high-grass", "tree": "tree-branch",
        "bush": "berry-bush", "rock": "rock", "moat": "moat", "bridge": "wooden-bridge", "willow": "willow-tree",
        "nest": "bird-nest", "pit": "pitfall", "boulder": "boulder-dash", "tightrope": "rope-coil",
        "arcade": "arcade", "boat": "sailboat", "hut": "hut", "castle_door": "wooden-door", "blade": "spinning-blades",
        "letter": "spell-book", "forge": "anvil", "chasm": "abyss",
        
        # Items via Emojis:
        "💣🌟": "holy-hand-grenade", "🥥": "coconut", "📜📜": "scroll-unfurled", "🧪🦎": "flask",
        "💎💠": "gem-pendant", "📿": "necklace-display", "🪙": "coin", "🏅": "medal", "🪕": "banjo",
        "🍲": "cauldron", "🐔": "chicken", "⚙️": "gears", "👢⚡": "boots", "👺": "tengu",
        "🛡️🏛️": "shield", "💍": "ring", "🥾": "boot-stomp", "🦯": "walking-boot", "🏺": "amphora",
        "🧪": "potion-ball", "🕯️": "candle-light", "📃": "scroll-unfurled", "🌀": "spiral-thrust",
        "🍕": "pizza-slice", "💰": "money-bag", "🗡️": "broadsword", "🛡️": "shield", "🎽": "shirt",
        "𩲩": "underwear", "🩴": "sandal", "🦴": "bone", "💩": "poop", "📎": "paper-clip", "🧶": "yarn",
        "🧵": "spool", "📰": "newspaper", "🧤": "gloves", "🧱": "brick-wall", "🧼": "soap",
        "🗝️": "key"
    }

    # Process SVGs
    for sprite_key, search_name in svg_map.items():
        matched_path = None
        for p in all_svgs:
            if p.stem == search_name:
                matched_path = p
                break
        if not matched_path:
            for p in all_svgs:
                if search_name in p.stem:
                    matched_path = p
                    break
        if matched_path:
            with open(matched_path, 'rb') as f:
                b64 = base64.b64encode(f.read()).decode('utf-8')
                assets['sprites'][sprite_key] = f"data:image/svg+xml;base64,{b64}"

    # Process Sounds
    for filename in os.listdir('sounds'):
        if filename.endswith(('.opus', '.ogg', '.wav', '.mp3')):
            name = os.path.splitext(filename)[0]
            with open(os.path.join('sounds', filename), 'rb') as f:
                b64 = base64.b64encode(f.read()).decode('utf-8')
                ext = os.path.splitext(filename)[1][1:]
                assets['sounds'][name] = f"data:audio/{ext};base64,{b64}"

    # Process MIDI
    for filename in os.listdir('midi'):
        if filename.endswith(('.sf2', '.mid', '.midi')):
            name = os.path.splitext(filename)[0]
            with open(os.path.join('midi', filename), 'rb') as f:
                b64 = base64.b64encode(f.read()).decode('utf-8')
                assets['midi'][name] = f"data:audio/midi;base64,{b64}"

    with open('roguelike_assets.dat', 'w') as f:
        json.dump(assets, f)
    
    print(f"Asset generation complete. Final file size: {os.path.getsize('roguelike_assets.dat')} bytes")

if __name__ == "__main__":
    generate_assets()
