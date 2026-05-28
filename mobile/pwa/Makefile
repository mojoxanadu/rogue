# PWA build — wraps ../dev_build.html with a manifest + service worker.
# Output: dist/ contains a self-contained drop-in for any HTTPS host
# (or localhost for dev). On Android Chrome, "Add to Home Screen"
# installs as a standalone PWA.
#
# Targets:
#   make            build dist/ (default)
#   make serve      run a local HTTP dev server on :8000
#                   (PWA install requires HTTPS; localhost is exempt)
#   make clean      wipe dist/

DIST    := dist
SOURCE  := ../../dev_build.html
ASSETS  := manifest.json sw.js icon.svg icon-192.png icon-512.png

# PWA glue injected into the source HTML's <head>:
#   - link to the manifest
#   - theme-color hint for Android's status bar
#   - service worker registration (silently no-ops on file:// origins,
#     which is what dev_build.html opens as when launched locally)
# Hashes in the hex color are escaped with \# — Make treats an
# unescaped # as a comment-start everywhere except inside a recipe.
INJECT := <link rel="manifest" href="manifest.json"><meta name="theme-color" content="\#1d1b20"><script>if("serviceWorker" in navigator)window.addEventListener("load",function(){navigator.serviceWorker.register("sw.js")});</script>

.PHONY: all serve clean
.DEFAULT_GOAL := all

all: $(DIST)/index.html $(addprefix $(DIST)/,$(ASSETS))

$(DIST)/index.html: $(SOURCE) Makefile
	@mkdir -p $(DIST)
	sed 's|<head>|<head>$(INJECT)|' $(SOURCE) > $@

$(DIST)/%: %
	@mkdir -p $(DIST)
	cp $< $@

serve: all
	@echo "Serving on http://localhost:8000 — Ctrl+C to stop"
	cd $(DIST) && python3 -m http.server 8000

clean:
	rm -rf $(DIST)
