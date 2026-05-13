# Build orchestration. See BUILDS.md for the 3-tier architecture.
#
# Targets:
#   make              fast dev build (default)
#   make dev          ditto, explicit
#   make assets       rebuild assets.json from raw/ (only if inputs changed)
#   make release      full integrated build (auto-rebuilds assets if stale)
#   make all          dev + release
#   make clean        wipe artifacts (keeps raw/ and src/)

BUILD     := $(shell cat VERSION)
SRC       := $(wildcard src/*.html) $(wildcard src/*.js)
RAW       := $(shell find raw -type f 2>/dev/null)
RELEASE   := roguelike_build$(BUILD).html

.PHONY: all dev assets release clean
.DEFAULT_GOAL := dev

dev: dev_build.html

assets: assets.json

release: $(RELEASE)

all: dev release

dev_build.html: $(SRC) VERSION build_html.py
	python3 build_html.py

assets.json: $(RAW) VERSION build_assets.py
	python3 build_assets.py

$(RELEASE): $(SRC) assets.json VERSION build_release.py
	python3 build_release.py

clean:
	rm -f dev_build.html assets.json roguelike_build*.html raw/title_rendered.png
