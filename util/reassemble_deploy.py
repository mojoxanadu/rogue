#!/usr/bin/env python3
"""
reassemble_deploy.py — Reassemble multipart base64 JSON deployment files.

Supports both format versions:
  v1  format: 'roguelike_deploy'     method: deflate | rle   (Build ≤748)
  v2  format: 'roguelike_deploy_b64' method: base64           (Build 749+)

Usage:
  python3 reassemble_deploy.py 750              # looks for roguelike_deploy_750_part*.json
  python3 reassemble_deploy.py 750 --no-extract # write .tar only, don't extract
  python3 reassemble_deploy.py 750 --out /tmp/  # extract to specific directory
"""

import sys, os, json, base64, glob, tarfile, io, zlib, argparse

def main():
    ap = argparse.ArgumentParser(description='Reassemble roguelike deployment parts.')
    ap.add_argument('build',        help='Build number (e.g. 750)')
    ap.add_argument('--no-extract', action='store_true', help='Write .tar only, do not extract')
    ap.add_argument('--out',        default='.', help='Output directory (default: current dir)')
    args = ap.parse_args()

    build    = args.build
    out_dir  = args.out
    pattern  = f'roguelike_deploy_{build}_part*.json'

    # ── Find part files ──────────────────────────────────────────────
    parts = sorted(glob.glob(pattern))
    if not parts:
        # Also try script's own directory
        here    = os.path.dirname(os.path.abspath(__file__))
        parts   = sorted(glob.glob(os.path.join(here, pattern)))

    if not parts:
        print(f'ERROR: No files matching {pattern}', file=sys.stderr)
        sys.exit(1)

    print(f'Found {len(parts)} part file(s):')
    for p in parts:
        print(f'  {os.path.basename(p):50}  {os.path.getsize(p)//1024//1024:3} MB')

    # ── Read and validate first part ─────────────────────────────────
    print(f'\nReading part 1...', end=' ', flush=True)
    with open(parts[0], 'r', encoding='ascii') as f:
        first = json.load(f)
    print('OK')

    valid_formats = {'roguelike_deploy', 'roguelike_deploy_b64'}
    if first.get('format') not in valid_formats:
        print(f"ERROR: Unrecognised format '{first.get('format')}'", file=sys.stderr)
        sys.exit(1)

    fmt         = first['format']
    version     = first.get('version', 1)
    method      = first['method']
    orig_name   = first['original']
    orig_size   = first['original_size']
    total_parts = first['total_parts']

    print(f'  Format:   {fmt}  (v{version})')
    print(f'  Original: {orig_name}  ({orig_size/1024/1024:.1f} MB)')
    print(f'  Method:   {method}')
    print(f'  Parts:    {total_parts}')

    if len(parts) != total_parts:
        print(f'ERROR: Expected {total_parts} parts, found {len(parts)}', file=sys.stderr)
        sys.exit(1)

    # ── Reassemble base64 string ──────────────────────────────────────
    print('\nReassembling parts...')
    chunks = []
    for i, path in enumerate(parts):
        print(f'  Part {i+1}/{total_parts}...', end=' ', flush=True)
        with open(path, 'r', encoding='ascii') as f:
            part = json.load(f)
        if part['part'] != i + 1:
            print(f'WRONG ORDER (expected {i+1}, got {part["part"]})', file=sys.stderr)
            sys.exit(1)
        chunks.append(part['data'])
        print(f'OK  ({len(part["data"])/1024/1024:.1f} MB data)')

    b64 = ''.join(chunks)
    print(f'  Total base64: {len(b64)/1024/1024:.1f} MB')

    # ── Decode ───────────────────────────────────────────────────────
    print('\nDecoding base64...', end=' ', flush=True)
    raw = base64.b64decode(b64)
    print(f'OK  ({len(raw)/1024/1024:.1f} MB)')

    # ── Decompress if needed (v1 only) ────────────────────────────────
    if method == 'base64':
        tar_bytes = raw                      # v2: raw bytes are already the tar
        print('  (v2 format: no decompression step)')
    elif method == 'deflate':
        print('Decompressing (deflate)...', end=' ', flush=True)
        tar_bytes = zlib.decompress(raw, -15)
        print(f'OK  ({len(tar_bytes)/1024/1024:.1f} MB)')
    elif method == 'rle':
        print('Decompressing (RLE)...', end=' ', flush=True)
        decoded = bytearray()
        for i in range(0, len(raw), 2):
            decoded.extend([raw[i+1]] * raw[i])
        tar_bytes = bytes(decoded)
        print(f'OK  ({len(tar_bytes)/1024/1024:.1f} MB)')
    else:
        print(f"ERROR: Unknown method '{method}'", file=sys.stderr)
        sys.exit(1)

    # ── Verify size ───────────────────────────────────────────────────
    if len(tar_bytes) != orig_size:
        print(f'WARNING: Size mismatch — expected {orig_size:,} bytes, got {len(tar_bytes):,}')
    else:
        print(f'  Size verified: {len(tar_bytes):,} bytes ✓')

    # ── Write .tar ────────────────────────────────────────────────────
    os.makedirs(out_dir, exist_ok=True)
    tar_path = os.path.join(out_dir, orig_name)
    print(f'\nWriting {orig_name}...', end=' ', flush=True)
    with open(tar_path, 'wb') as f:
        f.write(tar_bytes)
    print(f'OK  ({os.path.getsize(tar_path)/1024/1024:.1f} MB)')

    if args.no_extract:
        print(f'\n✅ Done. Tar written to: {tar_path}')
        print(f'   To extract: tar xf "{tar_path}"')
        return

    # ── Extract tar ───────────────────────────────────────────────────
    print(f'\nExtracting to {out_dir}/ ...')
    with tarfile.open(tar_path, 'r') as tf:
        members = tf.getmembers()
        for m in members:
            tf.extract(m, path=out_dir, set_attrs=False)
            print(f'  {m.name}')

    print(f'\n✅ Extracted {len(members)} file(s) to: {out_dir}')

    # ── Summary of key files ──────────────────────────────────────────
    print('\nKey files:')
    key_patterns = [f'roguelike_build*.html', 'roguelike_assets*.dat',
                    'webgl_effects_demo.html', 'DEPLOYMENT_NOTES*.md']
    for pat in key_patterns:
        for fp in sorted(glob.glob(os.path.join(out_dir, pat))):
            print(f'  {os.path.basename(fp):50}  {os.path.getsize(fp)//1024//1024:3} MB')

if __name__ == '__main__':
    main()
