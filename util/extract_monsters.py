#!/usr/bin/env python3
"""
Extract monster definitions with icons from state.js
"""
import re

with open('src/state.js', 'r') as f:
    content = f.read()

# Find MONSTER_DEF section
start = content.find('const MONSTER_DEF = {')
if start == -1:
    print("MONSTER_DEF not found")
    exit()

brace = 0
for i in range(start, len(content)):
    if content[i] == '{':
        brace += 1
    elif content[i] == '}':
        brace -= 1
        if brace == 0:
            end = i
            break

monster_section = content[start:end+1]

# Extract all monster keys and their icons
# Pattern: "key": { icon: '...', ... }
pattern = r'"([^"]+)":\s*\{[^}]*icon:\s*\'([^\']+)\''
matches = re.findall(pattern, monster_section)

print(f"Found {len(matches)} monsters with icons:")
for key, icon in matches:
    print(f'  "{key}": "{icon}"')

# Also check for any emoji keys in MONSTER_DEF
print("\nChecking for emoji keys...")
emoji_pattern = r'"([^"]*)[\u0080-\U0010FFFF]+[^"]*":'
emoji_matches = re.findall(emoji_pattern, monster_section)
if emoji_matches:
    print(f"Found {len(emoji_matches)} emoji keys in MONSTER_DEF:")
    for key in emoji_matches:
        print(f'  "{key}"')
else:
    print("No emoji keys found in MONSTER_DEF")