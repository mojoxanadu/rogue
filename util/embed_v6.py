#!/usr/bin/env python3
import re, base64, mimetypes
from pathlib import Path

def get_data_url(path):
    if not Path(path).exists():
        print(f"Missing: {path}")
        return None
    mime, _ = mimetypes.guess_type(path)
    mime = mime or 'image/png'
    with open(path, 'rb') as f:
        data = f.read()
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"

def embed():
    with open('asset_selector_v6.html', 'r') as f:
        content = f.read()
    
    # Match external paths
    pattern = r'<img src="([^"]+)"'
    
    def replace(m):
        src = m.group(1)
        if src.startswith('data:'): return m.group(0)
        url = get_data_url(src)
        return f'<img src="{url}"' if url else m.group(0)
    
    embedded = re.sub(pattern, replace, content)
    
    with open('asset_selector_v6_embedded.html', 'w') as f:
        f.write(embedded)
    
    print(f"Embedded {embedded.count('data:image')} images")
    print(f"Size: {Path('asset_selector_v6_embedded.html').stat().st_size // 1024} KB")

if __name__ == '__main__': embed()