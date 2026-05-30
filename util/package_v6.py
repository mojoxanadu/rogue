#!/usr/bin/env python3
import zipfile, os

zip_path = 'asset_selector_v6_package.zip'
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.write('asset_selector_v6_embedded.html', 'index.html')
    zf.write('README_v6.txt', 'README.txt')

print(f"Created {zip_path} ({os.path.getsize(zip_path)//1024} KB)")