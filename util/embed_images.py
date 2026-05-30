#!/usr/bin/env python3
"""
Embed referenced images as data URLs into HTML.
"""
import re
import base64
import mimetypes
from pathlib import Path

def get_data_url(image_path):
    """Return data URL for given image file."""
    if not Path(image_path).exists():
        print(f"Warning: {image_path} not found")
        return None
    mime_type, _ = mimetypes.guess_type(image_path)
    if not mime_type:
        # default to png
        mime_type = 'image/png'
    with open(image_path, 'rb') as f:
        data = f.read()
    b64 = base64.b64encode(data).decode('ascii')
    return f"data:{mime_type};base64,{b64}"

def embed_images(html_file):
    """Return HTML with embedded images."""
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Pattern for src="..."
    pattern = r'src="([^"]+)"'
    
    def replace(match):
        src = match.group(1)
        # Skip if already data URL
        if src.startswith('data:'):
            return match.group(0)
        data_url = get_data_url(src)
        if data_url is None:
            # keep original src
            return match.group(0)
        return f'src="{data_url}"'
    
    new_content = re.sub(pattern, replace, content)
    return new_content

def main():
    html_file = Path('asset_selector_v2.html')
    if not html_file.exists():
        print("Error: HTML file not found")
        return
    
    print("Embedding images...")
    embedded = embed_images(html_file)
    
    out_file = Path('asset_selector_embedded.html')
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(embedded)
    print(f"Created embedded HTML: {out_file}")
    
    # Compute size
    size = out_file.stat().st_size
    print(f"Size: {size // 1024} KB")

if __name__ == '__main__':
    main()