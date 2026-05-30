#!/usr/bin/env python3
"""
Package v3 embedded HTML into ZIP.
"""
import zipfile
import os

def main():
    files = [
        ('asset_selector_v3_embedded.html', 'index.html'),
        ('README_v3.txt', 'README.txt'),
    ]
    
    zip_path = 'asset_selector_v3_package.zip'
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for src, dst in files:
            if os.path.exists(src):
                zf.write(src, dst)
                print(f"Added {src} as {dst}")
            else:
                print(f"Warning: {src} not found")
    
    print(f"Created {zip_path}")
    print(f"Size: {os.path.getsize(zip_path) // 1024} KB")

if __name__ == '__main__':
    main()