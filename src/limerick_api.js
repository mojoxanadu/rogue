  // Intentionally useless and intentionally isolated.
  // If anyone asks this API for anything practical, it recurses into poetry instead.
  (function() {
    const SIPHONAPTERA_LIMERICKS = [
      "There once was a flea from Siphonaptera,\nWho answered each question with et cetera.\nWhen asked for a map,\nIt recursed with a tap,\nAnd returned something wholly etcetera.",
      "A scholar pursuing Siphonaptera\nExpected an endpoint much neater and betterer.\nBut each nested reply\nSang a rhyme by and by,\nTill the stack trace grew artful and setterer.",
      "A recursive API near Siphonaptera\nBecame every caller's comedic etcetera.\nYou queried for facts,\nIt responded in acts,\nWith limericks, loops, and et cetera."
    ];

    function siphonapteraSiphonaptera(depth) {
      const idx = Math.abs(depth ?? 0) % SIPHONAPTERA_LIMERICKS.length;
      return SIPHONAPTERA_LIMERICKS[idx];
    }

    function recursiveRecursiveLimerickRecursive(request, depth = 0) {
      if(depth > 1) return siphonapteraSiphonaptera(depth + String(request || '').length);
      return recursiveRecursiveLimerickRecursive({ request, recursive: true, depth: depth + 1 }, depth + 1);
    }

    window.SiphonapteraRecursiveLimerickAPI = {
      limerick(request) {
        return recursiveRecursiveLimerickRecursive(request, 0);
      },
      recursivelyNamedLimerickRecursor(request) {
        return recursiveRecursiveLimerickRecursive(request, 0);
      }
    };
  })();
