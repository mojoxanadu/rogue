#!/usr/bin/env python3
"""build_html.py — tier 1: fast dev build.

Concatenates src/*.html + src/*.js into dev_build.html. Skips all binary
asset embedding. Unresolved {{TOKEN}} placeholders are blanked, and a CSS
rule hides empty-src <img> tags so Chrome shows no broken-image icons.

For the full integrated build, see build_release.py (forthcoming).
"""
import os
import re
import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(_HERE, 'VERSION'), 'r', encoding='utf-8') as _vf:
    BUILD_NUMBER = int(_vf.read().strip())
GAME_NAME = "NotAName"

# Build order MUST match build.py / future build_release.py. See BUILDS.md.
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

# Injected so <img> tags with blanked-out src don't render broken-image icons.
DEV_STUB_CSS = (
    '<style id="dev-build-asset-stubs">'
    'img[src=""],img:not([src]){display:none}'
    '</style>'
)

TOKEN_RE = re.compile(r'\{\{[A-Z0-9_]+\}\}')


def build():
    src_dir = os.path.join(_HERE, 'src')
    out_path = os.path.join(_HERE, 'dev_build.html')
    build_time = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    missing = []
    with open(out_path, 'w', encoding='utf-8') as out:
        out.write(f"<!-- dev build {BUILD_NUMBER} @ {build_time} — no binary assets -->\n")

        for filename in FILES:
            filepath = os.path.join(src_dir, filename)
            if not os.path.exists(filepath):
                missing.append(filename)
                continue

            ext = os.path.splitext(filename)[1]
            marker_open = f"<!-- === {filename} === -->" if ext == '.html' else f"// === {filename} ==="
            out.write(f"\n{marker_open}\n")

            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            content = content.replace('{{GAME_NAME}}', GAME_NAME)
            content = content.replace('{{BUILD_NUMBER}}', str(BUILD_NUMBER))
            content = TOKEN_RE.sub('', content)

            if ext == '.html':
                content = content.replace(
                    '</head>',
                    f'<script>window.GAME_NAME = "{GAME_NAME}";</script>{DEV_STUB_CSS}</head>',
                    1,
                )

            out.write(content)
            out.write('\n')

        out.write('</script>\n</body>\n</html>\n')

    size_kb = os.path.getsize(out_path) // 1024
    print(f"✓ {out_path} ({size_kb} KB, build {BUILD_NUMBER}, {len(FILES) - len(missing)}/{len(FILES)} files)")
    if missing:
        print(f"  ⚠ missing: {', '.join(missing)}")


if __name__ == '__main__':
    build()
