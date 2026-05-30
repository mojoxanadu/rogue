#!/usr/bin/env python3
"""
pack_deploy.py — Pack a .tar into multipart JSON for Zscaler-safe transfer.

Uses raw deflate compression (RFC 1951) + base64 encoding + JSON envelope.
Split into parts under a configurable size limit.

Usage:
    python3 pack_deploy.py roguelike_deploy_746.tar
    python3 pack_deploy.py roguelike_deploy_746.tar --max-part-mb 80
"""
import argparse
import base64
import json
import math
import os
import sys
import zlib


def rle_compress(data: bytes) -> bytes:
    """Byte-level RLE: [count(1), byte(1)] pairs for repeated runs.
    Non-repeated bytes stored as [1, byte]."""
    out = bytearray()
    i = 0
    n = len(data)
    while i < n:
        byte = data[i]
        count = 1
        while i + count < n and data[i + count] == byte and count < 255:
            count += 1
        out.append(count)
        out.append(byte)
        i += count
    return bytes(out)


def deflate_compress(data: bytes) -> bytes:
    """Raw deflate (RFC 1951) — strip zlib wrapper for PowerShell DeflateStream."""
    compressed = zlib.compress(data, 9)
    # zlib format: [2-byte header][deflate data][4-byte Adler-32]
    # Strip to get raw deflate
    return compressed[2:-4]


def pack(tar_path: str, max_part_mb: int = 100, use_rle: bool = False):
    tar_size = os.path.getsize(tar_path)
    tar_name = os.path.basename(tar_path)

    with open(tar_path, 'rb') as f:
        raw = f.read()

    # Compress
    if use_rle:
        method = 'rle'
        compressed = rle_compress(raw)
    else:
        method = 'deflate'
        compressed = deflate_compress(raw)

    ratio = len(compressed) / tar_size * 100
    print(f"Input:     {tar_size:,} bytes ({tar_size / 1048576:.1f} MB)")
    print(f"Method:    {method}")
    print(f"Compressed: {len(compressed):,} bytes ({len(compressed) / 1048576:.1f} MB, {ratio:.1f}%)")

    # Base64 encode
    b64 = base64.b64encode(compressed).decode('ascii')
    b64_size = len(b64)
    print(f"Base64:    {b64_size:,} bytes ({b64_size / 1048576:.1f} MB)")

    # Split into parts
    max_part_bytes = max_part_mb * 1048576
    # Reserve 2KB per part for JSON envelope overhead
    max_b64_per_part = max_part_bytes - 2048
    num_parts = math.ceil(b64_size / max_b64_per_part)

    if num_parts == 0:
        num_parts = 1

    print(f"Parts:     {num_parts} (max {max_part_mb} MB each)")

    base_name = os.path.splitext(tar_name)[0]
    part_files = []

    for part_idx in range(num_parts):
        start = part_idx * max_b64_per_part
        end = min(start + max_b64_per_part, b64_size)
        chunk = b64[start:end]

        envelope = {
            'format': 'roguelike_deploy',
            'version': 1,
            'original': tar_name,
            'original_size': tar_size,
            'method': method,
            'part': part_idx + 1,
            'total_parts': num_parts,
            'data': chunk
        }

        part_filename = f'{base_name}_part{part_idx + 1}.json'
        with open(part_filename, 'w') as f:
            json.dump(envelope, f)

        part_size = os.path.getsize(part_filename)
        part_files.append(part_filename)
        print(f"  {part_filename}: {part_size:,} bytes ({part_size / 1048576:.1f} MB)")

    print(f"\nDone. Send all {num_parts} parts + extract.ps1 to Kelch.")
    return part_files


def main():
    parser = argparse.ArgumentParser(description='Pack tar into multipart JSON')
    parser.add_argument('tar_file', help='Path to .tar file')
    parser.add_argument('--max-part-mb', type=int, default=100,
                        help='Max size per part in MB (default: 100)')
    parser.add_argument('--rle', action='store_true',
                        help='Use RLE instead of deflate (worse compression)')
    args = parser.parse_args()

    if not os.path.exists(args.tar_file):
        print(f"Error: {args.tar_file} not found")
        sys.exit(1)

    pack(args.tar_file, args.max_part_mb, args.rle)


if __name__ == '__main__':
    main()
