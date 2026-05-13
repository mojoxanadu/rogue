#!/usr/bin/env python3
"""check.py — diff the current release build against a reference snapshot.

Filters out fields that legitimately differ between runs (build timestamp,
source file mtimes, the 'Assets: N' header line) before comparing.

Exit 0 if equivalent, 1 otherwise. Used by `make check`.

Usage: check.py <release.html> <reference.html>
"""
import os
import re
import sys
import difflib

# Lines/patterns that legitimately differ between builds — strip before diff.
LINE_DROPS = [
    re.compile(r'^\s*║\s*Built:.*║\s*$'),
    re.compile(r'^\s*║\s*Assets:.*║\s*$'),
]
INLINE_STRIPS = [
    re.compile(r', modified: \d{4}-\d{2}-\d{2} \d{2}:\d{2}'),
]


def normalize(text):
    out = []
    for line in text.splitlines():
        if any(p.match(line) for p in LINE_DROPS):
            continue
        for p in INLINE_STRIPS:
            line = p.sub('', line)
        out.append(line)
    return out


def main():
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    a_path, b_path = sys.argv[1], sys.argv[2]
    for p in (a_path, b_path):
        if not os.path.exists(p):
            print(f"✗ missing: {p}", file=sys.stderr)
            return 2

    with open(a_path, encoding='utf-8') as f:
        a = normalize(f.read())
    with open(b_path, encoding='utf-8') as f:
        b = normalize(f.read())

    diff = list(difflib.unified_diff(b, a, fromfile=b_path, tofile=a_path, lineterm=''))
    if not diff:
        print(f"✓ {a_path} matches {b_path} (modulo filtered fields)")
        return 0

    # Show first ~40 lines of diff for triage
    print(f"✗ {a_path} diverges from {b_path}", file=sys.stderr)
    for line in diff[:40]:
        print(line)
    if len(diff) > 40:
        print(f"... ({len(diff) - 40} more lines)")
    return 1


if __name__ == '__main__':
    sys.exit(main())
