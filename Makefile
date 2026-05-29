# Build orchestration. See BUILDS.md for the 3-tier architecture.
#
# Targets:
#   make              fast dev build (default)
#   make dev          ditto, explicit
#   make assets       rebuild assets.json from raw/ (only if inputs changed)
#   make release      full integrated build (auto-rebuilds assets if stale)
#   make all          dev + release
#   make lint         node --check every <script> block in dev_build.html
#   make test         node:test runner against tests/*.test.js
#   make mobile       PWA bundle (mobile/dist/ — drop on any HTTPS host)
#   make clean        wipe artifacts (keeps raw/ and src/)

include config

SRC       := $(wildcard src/*.html) $(wildcard src/*.js)
RELEASE   := roguelike.html

PY_SHARED := config.py build_files.py

.PHONY: all dev assets dat release lint test mobile clean
.DEFAULT_GOAL := dev

dev: dev_build.html

assets: assets.json

all: dev release

dev_build.html: $(SRC) config $(PY_SHARED) build_html.py
	python3 build_html.py

assets.json: config config.py build_assets.py
	python3 build_assets.py

$(RELEASE): $(SRC) assets.json config $(PY_SHARED) build_release.py
	python3 build_release.py

# phony so we can delete assets.json after without breaking progressiveness.
# Inline timestamp check avoids rebuilding when nothing changed.
release: dat
	@if [ ! -f roguelike.html ]; then \
		python3 build_assets.py && python3 build_release.py; \
	else \
		rebuild=0; \
		for f in $(SRC) config config.py build_files.py build_release.py build_assets.py; do \
			if [ "$$f" -nt roguelike.html ]; then rebuild=1; break; fi; \
		done; \
		if [ $$rebuild -eq 1 ]; then \
			python3 build_assets.py && python3 build_release.py; \
		else \
			echo "  →  roguelike.html is up to date."; \
		fi; \
	fi; \
	rm -f assets.json

# .dat files from assets/. phony because Make can't handle spaces in prereq filenames.
# Timestamp check inside recipe is fast (~a few find calls).
dat:
	@if [ ! -f roguelike_assets.dat ] || \
	  find assets/gifs assets/movies assets/music assets/classes assets/astrochicken \
	    assets/midi assets/sounds/generated -type f -newer roguelike_assets.dat \
	    -print -quit 2>/dev/null | grep -q . || \
	  find assets -maxdepth 1 -type f -newer roguelike_assets.dat \
	    -print -quit 2>/dev/null | grep -q .; then \
		echo "  →  rebuilding .dat files..."; \
		cd assets && python3 build_complete_assets.py && \
		cp roguelike_assets.dat roguelike_assets_ambient_movies.dat roguelike_assets_arcade.dat ..; \
		echo "  →  done."; \
	else \
		echo "  →  .dat files are up to date."; \
	fi

lint: dev_build.html lint.py
	python3 lint.py dev_build.html

test:
	node --test tests/

# PWA bundle. Ensures dev_build.html is fresh, then delegates to the
# subdir Makefile that injects manifest+SW glue into dist/.
mobile: dev
	$(MAKE) -C mobile/pwa

clean:
	rm -f dev_build.html assets.json roguelike.html roguelike_build*.html roguelike_assets*.dat raw/title_rendered.png assets/title_rendered.png
