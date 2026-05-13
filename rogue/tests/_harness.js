// _harness.js — load src/*.js into a sandboxed VM context for testing.
//
// The game's source files do top-level `class Foo {}` declarations and
// then `window.Foo = Foo;` to expose them to the concat scope. The
// harness creates a context where `window === ctx`, runs the requested
// source files in it, and returns the context. After `loadSrc('items.js')`
// the test can access `ctx.ItemDef`, `ctx.ItemStack`, etc.
//
// This keeps src/ pristine — no CommonJS shims, no test-only code paths.

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');

/**
 * Load the given src files (relative to src/) into a fresh VM context.
 * Returns the context object; declared globals (via window.X = X) are
 * accessible as ctx.X.
 *
 * Files are executed in argument order. Use this to compose dependencies
 * (e.g., loadSrc('items.js', 'items_registry.js')) — but most unit
 * tests should load only the file under test and stub the rest.
 */
function loadSrc(...files) {
  const ctx = {
    console,
    Object, Array, Map, Set, Date, Math, JSON, RegExp, Error, Symbol,
    Number, String, Boolean, Promise, Proxy, Reflect,
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  ctx.window     = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  for (const file of files) {
    const code = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
    try {
      vm.runInContext(code, ctx, { filename: file });
    } catch (e) {
      throw new Error(`loadSrc('${file}') failed: ${e.message}\n${e.stack}`);
    }
  }
  return ctx;
}

module.exports = { loadSrc, SRC_DIR };
