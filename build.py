import os
import datetime

BUILD_NUMBER = 762
GAME_NAME = "NotAName"

def render_title_image(game_name, build_number):
    """Render game name + build onto title.png using Pixelify Sans."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("  ⚠ Pillow not installed, skipping title render")
        return
    
    font_path = 'fonts/static/PixelifySans-Bold.ttf'
    src_path = 'title.png'
    out_path = 'title_rendered.png'
    
    if not os.path.exists(src_path):
        print(f"  ⚠ {src_path} not found, skipping title render")
        return
    if not os.path.exists(font_path):
        print(f"  ⚠ {font_path} not found, skipping title render")
        return
    
    img = Image.open(src_path).convert('RGBA')
    w, h = img.size
    
    overlay = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    font_size = int(w * 0.06)  # 6% of image width
    font = ImageFont.truetype(font_path, font_size)
    
    title_text = game_name.upper()
    build_text = f"BUILD\n{build_number}"

    bbox = draw.textbbox((0, 0), title_text, font=font)
    tw = bbox[2] - bbox[0]
    tx = (w - tw) // 2
    ty = int(h * 0.04)

    build_font_size = max(18, int(font_size * 0.58))
    build_font = ImageFont.truetype(font_path, build_font_size)
    bb = draw.multiline_textbbox((0, 0), build_text, font=build_font, spacing=max(2, build_font_size // 10), align='center')
    bw = bb[2] - bb[0]
    bx = (w - bw) // 2
    by = ty + font_size + max(8, font_size // 8)
    
    shadow_offset = max(2, font_size // 20)
    draw.text((tx + shadow_offset, ty + shadow_offset), title_text, font=font, fill=(0, 0, 0, 180))
    draw.text((tx, ty), title_text, font=font, fill=(255, 220, 100, 255))
    draw.multiline_text((bx + shadow_offset, by + shadow_offset), build_text, font=build_font,
                        fill=(0, 0, 0, 170), spacing=max(2, build_font_size // 10), align='center')
    draw.multiline_text((bx, by), build_text, font=build_font,
                        fill=(245, 230, 170, 245), spacing=max(2, build_font_size // 10), align='center')
    
    result = Image.alpha_composite(img, overlay).convert('RGB')
    result.save(out_path)
    print(f"  ✓ Title rendered: \"{title_text} / BUILD {build_number}\" on {w}x{h} (font size {font_size})")

def build():
    src_dir = 'src'
    output_file = f'roguelike_build{BUILD_NUMBER}.html'

    # Render title image with game name
    render_title_image(GAME_NAME, BUILD_NUMBER)

    # Encode title image as base64 for embedding in HTML
    title_b64 = ''
    title_path = 'title_rendered.png' if os.path.exists('title_rendered.png') else 'title.png'
    if os.path.exists(title_path):
        import base64
        with open(title_path, 'rb') as f:
            title_b64 = base64.b64encode(f.read()).decode('utf-8')
        print(f"  ✓ Title image encoded: {os.path.getsize(title_path) // 1024} KB")

    # BUILD ORDER MATTERS!
    # ┌────────────────────────────────────────────────────────────────────┐
    # │ LESSON: Script loading order in a single-HTML-file game.          │
    # │                                                                    │
    # │ 1. HTML structure (header, ui_layout) — DOM must exist first      │
    # │ 2. Audio system — no dependencies                                 │
    # │ 3. State definitions — constants, MONSTER_DEF, ITEM_DEF, etc.    │
    # │ 4. Quest pack files — register themselves into _questPacks[]      │
    # │    (must load BEFORE quest_engine so the engine can collect them) │
    # │ 5. Quest engine — collects quest packs, wires auto-triggers      │
    # │ 6. Game logic — engine, shop, mechanics (emit quest events)      │
    # │ 7. Rendering — reads state, never mutates it                     │
    # │ 8. Input — kicks off the game loop                               │
    # └────────────────────────────────────────────────────────────────────┘
    files = [
        'header.html',
        'ui_layout.html',
        'audio.js',
        'music_data.js',
        'state.js',
        'player.js',
        'limerick_api.js',
        'ui_logic.js',
        # Quest packs BEFORE quest engine (registration pattern)
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
        # Quest engine collects all registered packs
        'quest_engine.js',
        'boundary_data.js',
        'map.js',
        'mechanics.js',
        'engine.js',
        'shop.js',
        'webgl_fx.js',
        'render.js',
        'input.js'
    ]

    build_time = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    # Collect file metadata for build summary
    file_entries = []
    for filename in files:
        filepath = os.path.join(src_dir, filename)
        if os.path.exists(filepath):
            mtime = os.path.getmtime(filepath)
            mod_date = datetime.datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M')
            file_entries.append((filename, filepath, mod_date))
        else:
            file_entries.append((filename, filepath, 'MISSING'))

    with open(output_file, 'w', encoding='utf-8') as outfile:
        # ── Build Summary Header ──
        outfile.write(f"<!--\n")
        outfile.write(f"  ╔══════════════════════════════════════════════════════════════╗\n")
        outfile.write(f"  ║  ROGUELIKE: THE ULTIMATE QUEST — Build {BUILD_NUMBER:<22} ║\n")
        outfile.write(f"  ╠══════════════════════════════════════════════════════════════╣\n")
        outfile.write(f"  ║  Built: {build_time:<51} ║\n")
        outfile.write(f"  ║  Files: {len(file_entries):<51} ║\n")
        outfile.write(f"  ╠══════════════════════════════════════════════════════════════╣\n")
        outfile.write(f"  ║  Source Files:                                              ║\n")
        for filename, filepath, mod_date in file_entries:
            entry_line = f"    {filename} ({filepath}, modified: {mod_date})"
            outfile.write(f"  ║{entry_line:<62}║\n")
        outfile.write(f"  ╚══════════════════════════════════════════════════════════════╝\n")
        outfile.write(f"-->\n")

        for filename in files:
            filepath = os.path.join(src_dir, filename)
            if not os.path.exists(filepath):
                print(f"Warning: {filepath} not found.")
                continue

            ext = os.path.splitext(filename)[1]
            mtime = os.path.getmtime(filepath)
            mod_date = datetime.datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M')

            # Section begin marker
            if ext == '.html':
                outfile.write(f"\n<!-- ═══ BEGIN: {filename} ({filepath}, modified: {mod_date}) ═══ -->\n")
            else:
                outfile.write(f"\n// ═══ BEGIN: {filename} ({filepath}, modified: {mod_date}) ═══\n")

            with open(filepath, 'r', encoding='utf-8') as infile:
                content = infile.read()
                content = content.replace('{{GAME_NAME}}', GAME_NAME)
                content = content.replace('{{BUILD_NUMBER}}', str(BUILD_NUMBER))
                if title_b64:
                    content = content.replace('{{TITLE_IMAGE}}', f'data:image/png;base64,{title_b64}')
                # Also expose GAME_NAME as a JS variable for runtime use
                if ext == '.html':
                    content = content.replace('</head>', f'<script>window.GAME_NAME = "{GAME_NAME}";</script>\n</head>', 1)
                outfile.write(content)
                outfile.write("\n")

            # Section end marker
            if ext == '.html':
                outfile.write(f"<!-- ═══ END: {filename} ═══ -->\n")
            else:
                outfile.write(f"// ═══ END: {filename} ═══\n")

        outfile.write("</script>\n</body>\n</html>\n")

    print(f"Successfully built {output_file} (Build {BUILD_NUMBER})")
    print(f"  {len(file_entries)} source files included")
    print(f"  Build time: {build_time}")

    # Patch build number into standalone HTML files (asset_viewer, boundary_editor)
    import re
    standalone_files = ['asset_viewer.html', 'boundary_editor.html']
    for fname in standalone_files:
        if not os.path.exists(fname):
            continue
        with open(fname, 'r', encoding='utf-8') as f:
            src = f.read()
        # Update <title> build references
        patched = re.sub(r'(Build\s*)\d+', lambda m: m.group(1) + str(BUILD_NUMBER), src)
        if patched != src:
            with open(fname, 'w', encoding='utf-8') as f:
                f.write(patched)
            print(f"  Patched build number in {fname}")

if __name__ == "__main__":
    build()
