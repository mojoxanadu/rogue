#!/usr/bin/env python3
"""
migrate_items.py — generate direct ItemDef calls from LEGACY_ITEM_DATA.

Reads src/state.js, extracts the LEGACY_ITEM_DATA table, and writes
ItemDefs.X = new ItemDef({...}) blocks to stdout. Replicates the
builder's _toCamelCase and _normalizeEquipGroups logic exactly.

Usage:
    python3 util/migrate_items.py > generated_block.js
"""

import re
import json
import sys
import os


_HERE = os.path.dirname(os.path.abspath(__file__))
SRC_STATE = os.path.join(_HERE, '..', 'src', 'state.js')


# ─── Replicate builder logic ──────────────────────────────

def to_camel_case(display_name):
    """Replicate items_registry.js _toCamelCase."""
    text = str(display_name).replace("'", "").replace("'", "")
    words = [w for w in re.split(r'[^A-Za-z0-9]+', text) if w]
    if not words:
        return ''
    head = words[0].lower()
    tail = ''.join(w[0].upper() + w[1:].lower() for w in words[1:])
    return head + tail


def normalize_equip_groups(spec):
    """Replicate items_registry.js _normalizeEquipGroups."""
    groups = []
    if isinstance(spec.get('equipTo'), list) and len(spec['equipTo']) > 0:
        groups.append(list(spec['equipTo']))
    if isinstance(spec.get('equipChoice'), list) and len(spec['equipChoice']) > 0:
        for s in spec['equipChoice']:
            groups.append([s])
    if len(groups) == 0 and isinstance(spec.get('slot'), str) and spec['slot']:
        groups.append([spec['slot']])
    if len(groups) == 0 and spec.get('type') == 'weapon':
        groups.append(['leftHand'])
    return groups if len(groups) > 0 else None


def js_value(v):
    """Convert a Python value to its JavaScript literal representation."""
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, str):
        # Use single quotes, escape internal single quotes and backslashes
        escaped = v.replace('\\', '\\\\').replace("'", "\\'")
        # Emoji and other non-ASCII chars should just pass through as-is
        return f"'{escaped}'"
    if isinstance(v, list):
        items = ', '.join(js_value(i) for i in v)
        return f'[{items}]'
    raise ValueError(f'Unsupported type: {type(v)}')


# ─── Parse LEGACY_ITEM_DATA from state.js ────────────────

# The JS object literal structure is simple enough to parse with regex.
# We extract entries of the form:
#   key: { prop1: val1, prop2: val2, ... },
# where key is either a quoted string like "🪙" or a bare JS identifier.
# Values are strings, numbers, booleans, null, or arrays.

# But to avoid parsing JS by hand, we use a trick: we let Node.js evaluate
# the LEGACY_ITEM_DATA and print it as JSON, then we load the JSON.

def extract_legacy_data_via_node():
    """Use Node.js to evaluate LEGACY_ITEM_DATA and print it as JSON."""
    # Find the LEGACY_ITEM_DATA block in state.js
    with open(SRC_STATE, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract the object literal between `const LEGACY_ITEM_DATA = {` and `};`
    # We need to be careful about brace depth
    start_marker = 'const LEGACY_ITEM_DATA = {'
    start_idx = content.find(start_marker)
    if start_idx == -1:
        sys.exit('Could not find LEGACY_ITEM_DATA in state.js')

    # Find the matching closing brace
    brace_start = start_idx + len(start_marker) - 1  # position of opening {
    depth = 0
    end_idx = -1
    in_string = False
    string_char = None
    i = brace_start
    while i < len(content):
        ch = content[i]
        if in_string:
            if ch == '\\':
                i += 2  # skip escaped char
                continue
            if ch == string_char:
                in_string = False
        else:
            if ch in '"\'':
                in_string = True
                string_char = ch
            elif ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    end_idx = i
                    break
        i += 1

    if end_idx == -1:
        sys.exit('Could not find closing brace of LEGACY_ITEM_DATA')

    # Extract the object literal text
    obj_text = content[brace_start:end_idx + 1]

    # Write a temp JS file that prints the data as JSON
    js_code = f'''
const vm = require('vm');
const ctx = {{}};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
const data = {obj_text};
// Convert to JSON-safe format
const result = {{}};
for (const [key, spec] of Object.entries(data)) {{
    // Handle the icon: prefer spec.icon, fall back to key
    const icon = (typeof spec.icon === 'string' && spec.icon) ? spec.icon : key;
    result[key] = {{...spec, _resolvedIcon: icon, _originalKey: key}};
}}
console.log(JSON.stringify(result, null, 2));
'''
    import tempfile
    import subprocess

    with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, encoding='utf-8') as f:
        f.write(js_code)
        tmp_path = f.name

    try:
        result = subprocess.run(
            ['node', tmp_path],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            print('Node stderr:', result.stderr, file=sys.stderr)
            sys.exit(f'Node exited with code {result.returncode}')
        return json.loads(result.stdout)
    finally:
        os.unlink(tmp_path)


def parse_value(v):
    """Convert JSON-parsed value to Python value, handling None explicitly."""
    if v is None:
        return None
    return v


def js_literal_dict(d):
    """Format a Python dict as a JS object literal, keyed by camelCase name."""
    pairs = []
    for k, v in d.items():
        if k.startswith('_'):
            continue  # skip internal keys
        if v is None:
            continue  # skip null values (they're just absent)
        pairs.append(f'  {k}: {js_value(v)}')
    return '{\n' + ',\n'.join(pairs) + '\n}'


def main():
    raw = extract_legacy_data_via_node()

    collisions = {}
    entries = []

    for key, spec in raw.items():
        name = to_camel_case(spec.get('name', ''))
        if not name:
            print(f'// Skipping {key}: no derivable name from "{spec.get("name")}"', file=sys.stderr)
            continue

        # Collision check (first-wins)
        if any(e['name'] == name for e in entries):
            collisions.setdefault(name, []).append(key)
            continue

        icon = spec.get('_resolvedIcon', key)
        # Build the ItemDef spec dict (order matches builder)
        item_spec = {
            'name': name,
            'displayName': spec.get('name', ''),
            'icon': icon,
        }

        # Add all remaining spec properties (sorted, excluding internal ones)
        skip_keys = {'name', 'icon', '_resolvedIcon', '_originalKey'}
        for prop_name in sorted(spec.keys()):
            if prop_name in skip_keys or prop_name.startswith('_'):
                continue
            val = spec[prop_name]
            if val is None:
                continue
            item_spec[prop_name] = val

        # Compute equipGroups
        equip_groups = normalize_equip_groups(spec)
        if equip_groups is not None:
            item_spec['equipGroups'] = equip_groups

        entries.append({'name': name, 'spec': item_spec})

    # Output the generated block
    print('// ─── Auto-generated from LEGACY_ITEM_DATA ──────────────────')
    print('// Do not edit manually — regenerate via util/migrate_items.py')
    print()

    for entry in entries:
        name = entry['name']
        spec = entry['spec']
        print(f"ItemDefs.{name} = new ItemDef({js_literal_dict(spec)});")
        print()

    # Collision warnings
    if collisions:
        print(f'// Collisions ({len(collisions)}):')
        for cname, keys in collisions.items():
            print(f'//   {cname}: first-wins over {", ".join(keys)}')
        print()

    print(f'// ─── End auto-generated ───────────────────────────────────')
    print(f'// Exported {len(entries)} ItemDefs')
    if collisions:
        print(f'// ({len(collisions)} camelCase collisions, first-wins)')


if __name__ == '__main__':
    main()
