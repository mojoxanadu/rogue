#!/usr/bin/env python3
"""lint.py — lightweight syntax check for built HTML.

Extracts every inline <script> block from the target HTML, runs
`node --check` on each, and reports any JS syntax errors with enough
context (section marker preceding the offending line) to locate the
source file.

Exit 0 if all blocks parse, 1 if any errors. Used by `make lint`.

Usage: lint.py <built.html>
"""
import os
import re
import sys
import subprocess
import tempfile

SCRIPT_RE = re.compile(r'<script(?P<attrs>\s[^>]*)?>(?P<body>.*?)</script>', re.DOTALL)
SECTION_RE = re.compile(r'//\s*===\s*(?:BEGIN:\s*)?(\S+\.js)')


def find_section(script_text, line_no):
    """Return the most recent '// === ... .js ===' marker before line_no."""
    lines = script_text.split('\n')
    seen = None
    for i, line in enumerate(lines[:line_no], start=1):
        m = SECTION_RE.search(line)
        if m:
            seen = (m.group(1), i)
    return seen


def main():
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    path = sys.argv[1]
    if not os.path.exists(path):
        print(f"✗ {path} not found", file=sys.stderr)
        return 2

    html = open(path, encoding='utf-8').read()
    blocks = [(m.group('attrs') or '', m.group('body')) for m in SCRIPT_RE.finditer(html)]

    errors = 0
    checked = 0
    for i, (attrs, body) in enumerate(blocks):
        # Skip external <script src="..."> — nothing inline to check.
        if 'src=' in attrs:
            continue
        # Skip empty bodies.
        if not body.strip():
            continue
        checked += 1
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f:
            f.write(body)
            tmp = f.name
        try:
            r = subprocess.run(
                ['node', '--check', tmp],
                capture_output=True, text=True,
            )
            if r.returncode != 0:
                errors += 1
                # Parse `tmp:LINE` from stderr to locate the section.
                line_no = None
                m = re.search(rf'{re.escape(tmp)}:(\d+)', r.stderr)
                if m:
                    line_no = int(m.group(1))
                section = find_section(body, line_no) if line_no else None
                print(f"✗ block {i} ({len(body)} bytes): syntax error")
                if section:
                    file_name, marker_line = section
                    rel = line_no - marker_line if line_no else None
                    print(f"  near section: {file_name} (~line {rel} after marker)")
                # Echo node's error (strip the tmp path noise).
                cleaned = r.stderr.replace(tmp, '<script-block>')
                for line in cleaned.strip().split('\n')[:8]:
                    print(f"  {line}")
        finally:
            os.unlink(tmp)

    if errors:
        print(f"\n{errors} of {checked} blocks failed.")
        return 1
    print(f"✓ {checked} <script> blocks parsed cleanly")
    return 0


if __name__ == '__main__':
    sys.exit(main())
