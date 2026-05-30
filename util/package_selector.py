#!/usr/bin/env python3
"""
Package asset selector HTML and referenced images into a portable ZIP.
"""
import os
import re
import shutil
import zipfile
from pathlib import Path

def extract_image_paths(html_file):
    """Return list of unique image src paths from HTML."""
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()
    # Find all src="..."
    pattern = r'src="([^"]+)"'
    matches = re.findall(pattern, content)
    # Filter out non-image paths (if any) and keep unique
    image_exts = {'.png', '.jpg', '.jpeg', '.gif', '.bmp'}
    image_paths = []
    for m in matches:
        if any(m.lower().endswith(ext) for ext in image_exts):
            image_paths.append(m)
    return list(set(image_paths))

def copy_images(image_paths, source_root, dest_root):
    """Copy images from source_root to dest_root preserving relative paths."""
    for src_rel in image_paths:
        src_abs = source_root / src_rel
        if not src_abs.exists():
            print(f"Warning: {src_abs} does not exist, skipping")
            continue
        dest_abs = dest_root / src_rel
        dest_abs.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_abs, dest_abs)
        print(f"Copied {src_rel}")

def main():
    project_dir = Path.cwd()
    html_file = project_dir / 'asset_selector_v2.html'
    if not html_file.exists():
        print("Error: HTML file not found")
        return
    
    # Extract image paths
    image_paths = extract_image_paths(html_file)
    print(f"Found {len(image_paths)} unique image references")
    
    # Create package directory
    package_dir = project_dir / 'selector_package'
    if package_dir.exists():
        shutil.rmtree(package_dir)
    package_dir.mkdir()
    
    # Copy HTML to package root (rename to index.html for convenience)
    shutil.copy2(html_file, package_dir / 'index.html')
    
    # Copy README
    readme_src = project_dir / 'README_selector.txt'
    if readme_src.exists():
        shutil.copy2(readme_src, package_dir / 'README.txt')
    
    # Copy images relative to package root (they are already relative to project root)
    copy_images(image_paths, project_dir, package_dir)
    
    # Create ZIP
    zip_path = project_dir / 'asset_selector_package.zip'
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Add all files in package_dir recursively
        for root, dirs, files in os.walk(package_dir):
            for file in files:
                abs_path = os.path.join(root, file)
                rel_path = os.path.relpath(abs_path, package_dir)
                zf.write(abs_path, rel_path)
    
    print(f"Created package ZIP: {zip_path}")
    print(f"Size: {os.path.getsize(zip_path) // 1024} KB")
    
    # Cleanup package directory (optional)
    shutil.rmtree(package_dir)
    print("Cleaned up temporary directory")

if __name__ == '__main__':
    main()