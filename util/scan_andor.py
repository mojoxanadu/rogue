#!/usr/bin/env python3
import os

root = "external/andors-trail/AndorsTrail/res/drawable"
pngs = []
for f in os.listdir(root):
    if f.endswith(".png"):
        pngs.append(f)

print(f"Total PNGs: {len(pngs)}")

# Look for patterns
monsters = [p for p in pngs if "monster" in p.lower() or "enemy" in p.lower() or "orc" in p.lower() or "rat" in p.lower() or "goblin" in p.lower()]
items = [p for p in pngs if "item" in p.lower() or "weapon" in p.lower() or "armor" in p.lower() or "potion" in p.lower() or "scroll" in p.lower()]
tiles = [p for p in pngs if "tile" in p.lower() or "floor" in p.lower() or "wall" in p.lower() or "ground" in p.lower()]

print(f"Monsters: {len(monsters)} (first 10: {monsters[:10]})")
print(f"Items: {len(items)} (first 10: {items[:10]})")
print(f"Tiles: {len(tiles)} (first 10: {tiles[:10]})")