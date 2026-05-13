# Build orchestration. See BUILDS.md for the 3-tier architecture.
#
# Targets:
#   make              fast dev build (default)
#   make dev          ditto, explicit
#   make assets       rebuild assets.json from raw/ (only if inputs changed)
#   make release      full integrated build (auto-rebuilds assets if stale)
#   make all          dev + release
#   make check        diff release against $(SNAPSHOT) modulo timestamps
#   make lint         node --check every <script> block in dev_build.html
#   make clean        wipe artifacts (keeps raw/ and src/)

include config

SRC       := $(wildcard src/*.html) $(wildcard src/*.js)
RAW       := $(shell find raw -type f 2>/dev/null)
RELEASE   := roguelike.html
SNAPSHOT  ?= @HEAD:rogue/roguelike.html

PY_SHARED := config.py build_files.py

.PHONY: all dev assets release check lint clean
.DEFAULT_GOAL := dev

dev: dev_build.html

assets: assets.json

release: $(RELEASE)

all: dev release

dev_build.html: $(SRC) config $(PY_SHARED) build_html.py
	python3 build_html.py

assets.json: $(RAW) config config.py build_assets.py
	python3 build_assets.py

$(RELEASE): $(SRC) assets.json config $(PY_SHARED) build_release.py
	python3 build_release.py

check: $(RELEASE) check.py
	python3 check.py $(RELEASE) $(SNAPSHOT)

lint: dev_build.html lint.py
	python3 lint.py dev_build.html

clean:
	rm -f dev_build.html assets.json roguelike.html roguelike_build*.html raw/title_rendered.png
