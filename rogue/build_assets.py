#!/usr/bin/env python3
"""build_assets.py — tier 2: asset packaging.

Reads raw/ binary assets, renders the title overlay, and emits assets.json
which build_release.py (forthcoming) consumes.

raw/ is gitignored — design team copies current assets into a local raw/
manually. See BUILDS.md.

To add a new build-time asset: drop the file in raw/, add an entry to ASSETS,
and reference its `token` from src/ HTML. No code change needed in tier 1 or
tier 3 to pick it up.
"""
import os
import json
import base64
import hashlib
import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(_HERE, 'raw')
OUT_PATH = os.path.join(_HERE, 'assets.json')

with open(os.path.join(_HERE, 'VERSION'), 'r', encoding='utf-8') as _vf:
    BUILD_NUMBER = int(_vf.read().strip())
GAME_NAME = "NotAName"

# One entry per build-time-embedded asset. `source_path` is relative to raw/.
ASSETS = [
    {
        'id': 'title_splash',
        'role': 'image',
        'token': '{{TITLE_IMAGE}}',
        'source_path': 'title_rendered.png',  # produced by render_title()
        'mime': 'image/png',
    },
]


def render_title():
    """Composite GAME_NAME + BUILD_NUMBER onto raw/title.png.

    Output raw/title_rendered.png is what gets base64-embedded as {{TITLE_IMAGE}}.
    Logic ported verbatim from the original build.py render_title_image().
    """
    from PIL import Image, ImageDraw, ImageFont

    src_path = os.path.join(RAW_DIR, 'title.png')
    font_path = os.path.join(RAW_DIR, 'fonts', 'PixelifySans-Bold.ttf')
    out_path = os.path.join(RAW_DIR, 'title_rendered.png')

    for p in (src_path, font_path):
        if not os.path.exists(p):
            raise FileNotFoundError(f"{p} (required for title overlay)")

    img = Image.open(src_path).convert('RGBA')
    w, h = img.size
    overlay = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    font_size = int(w * 0.06)
    font = ImageFont.truetype(font_path, font_size)
    title_text = GAME_NAME.upper()
    build_text = f"BUILD\n{BUILD_NUMBER}"

    bbox = draw.textbbox((0, 0), title_text, font=font)
    tw = bbox[2] - bbox[0]
    tx = (w - tw) // 2
    ty = int(h * 0.04)

    build_font_size = max(18, int(font_size * 0.58))
    build_font = ImageFont.truetype(font_path, build_font_size)
    bb = draw.multiline_textbbox((0, 0), build_text, font=build_font,
                                 spacing=max(2, build_font_size // 10), align='center')
    bw = bb[2] - bb[0]
    bx = (w - bw) // 2
    by = ty + font_size + max(8, font_size // 8)

    shadow = max(2, font_size // 20)
    draw.text((tx + shadow, ty + shadow), title_text, font=font, fill=(0, 0, 0, 180))
    draw.text((tx, ty), title_text, font=font, fill=(255, 220, 100, 255))
    draw.multiline_text((bx + shadow, by + shadow), build_text, font=build_font,
                        fill=(0, 0, 0, 170), spacing=max(2, build_font_size // 10), align='center')
    draw.multiline_text((bx, by), build_text, font=build_font,
                        fill=(245, 230, 170, 245), spacing=max(2, build_font_size // 10), align='center')

    Image.alpha_composite(img, overlay).convert('RGB').save(out_path)
    print(f"  ✓ title rendered: \"{title_text} / BUILD {BUILD_NUMBER}\" on {w}x{h}")


def embed_one(spec):
    src = os.path.join(RAW_DIR, spec['source_path'])
    if not os.path.exists(src):
        raise FileNotFoundError(f"{src} (asset '{spec['id']}')")
    with open(src, 'rb') as f:
        data = f.read()
    return {
        'id': spec['id'],
        'role': spec['role'],
        'token': spec['token'],
        'source_path': f"raw/{spec['source_path']}",
        'mime': spec['mime'],
        'embed': 'base64',
        'data': base64.b64encode(data).decode('ascii'),
        'bytes': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
    }


def build():
    if not os.path.isdir(RAW_DIR):
        raise FileNotFoundError(
            f"{RAW_DIR} not found. Copy current assets from the design team "
            "into raw/ before running this script."
        )

    render_title()
    entries = [embed_one(spec) for spec in ASSETS]

    manifest = {
        'schema_version': 1,
        'build_number': BUILD_NUMBER,
        'generated_at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'generator': 'build_assets.py',
        'assets': entries,
    }
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    total_kb = sum(e['bytes'] for e in entries) // 1024
    print(f"✓ {OUT_PATH} ({len(entries)} assets, {total_kb} KB raw)")


if __name__ == '__main__':
    build()
