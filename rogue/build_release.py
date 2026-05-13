#!/usr/bin/env python3
"""build_release.py — tier 3: integrated release build.

Inputs:  src/*.html, src/*.js, VERSION, assets.json
Output:  roguelike_build<N>.html (single self-contained file)

Pure string substitution — no image processing, no asset walking. Tier 2
(build_assets.py) handles those. If you find yourself adding PIL or os.walk
here, it belongs in tier 2 instead.

Fails hard if assets.json is missing, schema is unknown, or its build_number
disagrees with VERSION (catches a stale manifest before it ships).
"""
import os
import json
import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(_HERE, 'VERSION'), 'r', encoding='utf-8') as _vf:
    BUILD_NUMBER = int(_vf.read().strip())
GAME_NAME = "NotAName"

SUPPORTED_SCHEMA = 1

# Build order MUST match build_html.py / build.py. See BUILDS.md.
FILES = [
    'header.html',
    'ui_layout.html',
    'audio.js',
    'music_data.js',
    'state.js',
    'player.js',
    'limerick_api.js',
    'ui_logic.js',
    'quests_base.js',
    'quests_monkey_island.js',
    'quests_monty_python.js',
    'quests_black_cauldron.js',
    'quests_indiana_jones.js',
    'quests_kq5.js',
    'quests_zork.js',
    'quests_elder_scrolls.js',
    'quests_larry.js',
    'quests_space_quest.js',
    'quests_qfg.js',
    'quest_engine.js',
    'boundary_data.js',
    'map.js',
    'mechanics.js',
    'engine.js',
    'shop.js',
    'webgl_fx.js',
    'render.js',
    'input.js',
]


def load_manifest():
    path = os.path.join(_HERE, 'assets.json')
    if not os.path.exists(path):
        raise FileNotFoundError(
            "assets.json not found. Run build_assets.py first to produce it."
        )
    with open(path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    if manifest.get('schema_version') != SUPPORTED_SCHEMA:
        raise ValueError(
            f"assets.json schema_version={manifest.get('schema_version')!r}, "
            f"this script supports {SUPPORTED_SCHEMA}"
        )
    if manifest.get('build_number') != BUILD_NUMBER:
        raise ValueError(
            f"VERSION says {BUILD_NUMBER} but assets.json says "
            f"{manifest.get('build_number')}. Re-run build_assets.py."
        )
    return manifest


def token_substitutions(manifest):
    """Map each manifest entry's token to its substituted string."""
    subs = {}
    for entry in manifest['assets']:
        token = entry['token']
        embed = entry.get('embed', 'base64')
        if embed == 'base64':
            subs[token] = f"data:{entry['mime']};base64,{entry['data']}"
        elif embed == 'external_url':
            subs[token] = entry['url']
        else:
            raise ValueError(f"asset {entry['id']}: unknown embed mode {embed!r}")
    return subs


def build():
    manifest = load_manifest()
    asset_subs = token_substitutions(manifest)

    src_dir = os.path.join(_HERE, 'src')
    output_file = os.path.join(_HERE, f'roguelike_build{BUILD_NUMBER}.html')
    build_time = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    file_entries = []
    for filename in FILES:
        filepath = os.path.join(src_dir, filename)
        if os.path.exists(filepath):
            mtime = os.path.getmtime(filepath)
            mod_date = datetime.datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M')
            file_entries.append((filename, filepath, mod_date))
        else:
            file_entries.append((filename, filepath, 'MISSING'))

    with open(output_file, 'w', encoding='utf-8') as out:
        # ── Build summary header (matches legacy build.py format) ──
        out.write("<!--\n")
        out.write("  ╔══════════════════════════════════════════════════════════════╗\n")
        out.write(f"  ║  ROGUELIKE: THE ULTIMATE QUEST — Build {BUILD_NUMBER:<22} ║\n")
        out.write("  ╠══════════════════════════════════════════════════════════════╣\n")
        out.write(f"  ║  Built: {build_time:<51} ║\n")
        out.write(f"  ║  Files: {len(file_entries):<51} ║\n")
        out.write(f"  ║  Assets: {len(manifest['assets']):<50} ║\n")
        out.write("  ╠══════════════════════════════════════════════════════════════╣\n")
        out.write("  ║  Source Files:                                              ║\n")
        for filename, filepath, mod_date in file_entries:
            entry_line = f"    {filename} (src/{filename}, modified: {mod_date})"
            out.write(f"  ║{entry_line:<62}║\n")
        out.write("  ╚══════════════════════════════════════════════════════════════╝\n")
        out.write("-->\n")

        for filename in FILES:
            filepath = os.path.join(src_dir, filename)
            if not os.path.exists(filepath):
                print(f"Warning: {filepath} not found.")
                continue

            ext = os.path.splitext(filename)[1]
            mtime = os.path.getmtime(filepath)
            mod_date = datetime.datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M')

            if ext == '.html':
                out.write(f"\n<!-- ═══ BEGIN: {filename} (src/{filename}, modified: {mod_date}) ═══ -->\n")
            else:
                out.write(f"\n// ═══ BEGIN: {filename} (src/{filename}, modified: {mod_date}) ═══\n")

            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            content = content.replace('{{GAME_NAME}}', GAME_NAME)
            content = content.replace('{{BUILD_NUMBER}}', str(BUILD_NUMBER))
            for token, value in asset_subs.items():
                content = content.replace(token, value)

            if ext == '.html':
                content = content.replace(
                    '</head>',
                    f'<script>window.GAME_NAME = "{GAME_NAME}";</script>\n</head>',
                    1,
                )

            out.write(content)
            out.write("\n")

            if ext == '.html':
                out.write(f"<!-- ═══ END: {filename} ═══ -->\n")
            else:
                out.write(f"// ═══ END: {filename} ═══\n")

        out.write("</script>\n</body>\n</html>\n")

    size_kb = os.path.getsize(output_file) // 1024
    print(f"✓ {output_file} ({size_kb} KB, build {BUILD_NUMBER}, "
          f"{len(file_entries)} files, {len(manifest['assets'])} assets)")


if __name__ == '__main__':
    build()
