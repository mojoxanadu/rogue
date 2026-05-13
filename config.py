"""Parse the flat KEY=VALUE `config` file. Single source of truth for build
settings shared between Python scripts and the Makefile (which uses `include
config` to consume the same file).

Add a new setting: edit `config`, then add a typed assignment below.
"""
import os

_HERE = os.path.dirname(os.path.abspath(__file__))

_raw = {}
with open(os.path.join(_HERE, 'config'), 'r', encoding='utf-8') as _f:
    for _line in _f:
        _line = _line.strip()
        if not _line or _line.startswith('#'):
            continue
        _k, _, _v = _line.partition('=')
        _raw[_k.strip()] = _v.strip()

BUILD = int(_raw['BUILD'])
GAME_NAME = _raw['GAME_NAME']
