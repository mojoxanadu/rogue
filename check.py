#!/usr/bin/env python3
"""check.py — diff the current release build against a reference snapshot.

Filters out fields that legitimately differ between runs (build timestamp,
source file mtimes, the 'Assets: N' header line) before comparing.

Exit 0 if equivalent, 1 otherwise. Used by `make check`.

Usage: check.py <release.html> <reference>
  <reference> is either a file path, or `@<git-ref>:<repo-path>` to fetch
  from git history. Example: `@HEAD:rogue/roguelike.html`.
"""
import os
import re
import sys
import difflib
import subprocess

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


def load(spec):
    """Return (text, display_label) for either a file path or @<ref>:<path>."""
    if spec.startswith('@'):
        ref_path = spec[1:]
        try:
            text = subprocess.check_output(
                ['git', 'show', ref_path], text=True, stderr=subprocess.PIPE,
            )
        except subprocess.CalledProcessError as e:
            raise FileNotFoundError(f"git show {ref_path}: {e.stderr.strip()}")
        return text, f"git:{ref_path}"
    if not os.path.exists(spec):
        raise FileNotFoundError(spec)
    with open(spec, encoding='utf-8') as f:
        return f.read(), spec


def main():
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    a_spec, b_spec = sys.argv[1], sys.argv[2]
    try:
        a_text, a_label = load(a_spec)
        b_text, b_label = load(b_spec)
    except FileNotFoundError as e:
        print(f"✗ {e}", file=sys.stderr)
        return 2

    a = normalize(a_text)
    b = normalize(b_text)

    diff = list(difflib.unified_diff(b, a, fromfile=b_label, tofile=a_label, lineterm=''))
    if not diff:
        print(f"✓ {a_label} matches {b_label} (modulo filtered fields)")
        return 0

    # Show first ~40 lines of diff for triage
    print(f"✗ {a_label} diverges from {b_label}", file=sys.stderr)
    for line in diff[:40]:
        print(line)
    if len(diff) > 40:
        print(f"... ({len(diff) - 40} more lines)")
    return 1


if __name__ == '__main__':
    sys.exit(main())
