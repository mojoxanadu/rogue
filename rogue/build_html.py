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

from config import BUILD, GAME_NAME
from build_files import FILES

_HERE = os.path.dirname(os.path.abspath(__file__))

# Injected so <img> tags with blanked-out src don't render broken-image icons.
DEV_STUB_CSS = (
    '<style id="dev-build-asset-stubs">'
    'img[src=""],img:not([src]){display:none}'
    '</style>'
)

TOKEN_RE = re.compile(r'\{\{[A-Z0-9_]+\}\}')

# Chrome shows alt text alongside the broken-image icon when src is missing,
# even with display:none on some paths (JS may set src to '' later). Stripping
# alt="..." in the dev build avoids the "Class selection backdrop"-style text
# leaks. Production keeps alt for accessibility.
ALT_RE = re.compile(r'\s+alt="[^"]*"')


def build():
    src_dir = os.path.join(_HERE, 'src')
    out_path = os.path.join(_HERE, 'dev_build.html')
    build_time = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    missing = []
    with open(out_path, 'w', encoding='utf-8') as out:
        out.write(f"<!-- dev build {BUILD} @ {build_time} — no binary assets -->\n")

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
            content = content.replace('{{BUILD_NUMBER}}', str(BUILD))
            content = TOKEN_RE.sub('', content)

            if ext == '.html':
                content = ALT_RE.sub('', content)
                content = content.replace(
                    '</head>',
                    f'<script>window.GAME_NAME = "{GAME_NAME}";</script>{DEV_STUB_CSS}</head>',
                    1,
                )

            out.write(content)
            out.write('\n')

        out.write('</script>\n</body>\n</html>\n')

    size_kb = os.path.getsize(out_path) // 1024
    print(f"✓ {out_path} ({size_kb} KB, build {BUILD}, {len(FILES) - len(missing)}/{len(FILES)} files)")
    if missing:
        print(f"  ⚠ missing: {', '.join(missing)}")


if __name__ == '__main__':
    build()
