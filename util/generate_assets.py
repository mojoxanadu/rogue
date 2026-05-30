import json
import base64
import os
import shutil

def generate_assets():
    assets = {
        "sprites": {},
        "sounds": {},
        "midi": {}
    }

    # Internal name to SVG path mapping based on the search results
    svg_map = {
        "player": "temp_icons/icons/ffffff/transparent/1x1/delapouite/character.svg",
        "wall": "temp_icons/icons/ffffff/transparent/1x1/delapouite/stone-wall.svg",
        "floor": "temp_icons/icons/ffffff/transparent/1x1/delapouite/flat-platform.svg",
        "slime": "temp_icons/icons/ffffff/transparent/1x1/delapouite/slime.svg",
        "skeleton": "temp_icons/icons/ffffff/transparent/1x1/lorc/rogue.svg", # fallback
        "bat": "temp_icons/icons/ffffff/transparent/1x1/lorc/apple-maggot.svg", # fallback
        "ghost": "temp_icons/icons/ffffff/transparent/1x1/delapouite/person.svg",
        "dragon": "temp_icons/icons/ffffff/transparent/1x1/delapouite/chicken.svg", # fallback
        "chest": "temp_icons/icons/ffffff/transparent/1x1/skoll/open-chest.svg",
        "sword": "temp_icons/icons/ffffff/transparent/1x1/lorc/broadsword.svg",
        "shield": "temp_icons/icons/ffffff/transparent/1x1/sbed/shield.svg",
        "potion": "temp_icons/icons/ffffff/transparent/1x1/delapouite/magic-potion.svg",
        "scroll": "temp_icons/icons/ffffff/transparent/1x1/lorc/scroll-unfurled.svg",
        "coin": "temp_icons/icons/ffffff/transparent/1x1/delapouite/coins.svg",
        "black_knight": "temp_icons/icons/ffffff/transparent/1x1/delapouite/black-knight-helm.svg",
        "rabbit": "temp_icons/icons/ffffff/transparent/1x1/delapouite/rabbit.svg",
        "wizard": "temp_icons/icons/ffffff/transparent/1x1/delapouite/wizard-face.svg",
        "witch": "temp_icons/icons/ffffff/transparent/1x1/cathelineau/witch-face.svg",
        "store": "temp_icons/icons/ffffff/transparent/1x1/delapouite/shop.svg",
        "portal": "temp_icons/icons/ffffff/transparent/1x1/delapouite/chestnut-leaf.svg", # fallback
        "cow": "temp_icons/icons/ffffff/transparent/1x1/delapouite/cow.svg",
        "chicken": "temp_icons/icons/ffffff/transparent/1x1/delapouite/chicken.svg",
        "grenade": "temp_icons/icons/ffffff/transparent/1x1/delapouite/holy-hand-grenade.svg"
    }

    # Process SVGs
    for name, path in svg_map.items():
        if os.path.exists(path):
            with open(path, 'rb') as f:
                b64 = base64.b64encode(f.read()).decode('utf-8')
                assets['sprites'][name] = f"data:image/svg+xml;base64,{b64}"
        else:
            print(f"Warning: Missing SVG for {name} at {path}")

    # Process local Sounds (if any remain)
    if os.path.exists('sounds'):
        for filename in os.listdir('sounds'):
            if filename.endswith(('.opus', '.ogg', '.wav', '.mp3')):
                name = os.path.splitext(filename)[0]
                with open(os.path.join('sounds', filename), 'rb') as f:
                    b64 = base64.b64encode(f.read()).decode('utf-8')
                    ext = os.path.splitext(filename)[1][1:]
                    assets['sounds'][name] = f"data:audio/{ext};base64,{b64}"

    with open('roguelike_assets.dat', 'w') as f:
        json.dump(assets, f)
    
    print(f"Asset generation complete. Final file size: {os.path.getsize('roguelike_assets.dat')} bytes")

if __name__ == "__main__":
    generate_assets()
