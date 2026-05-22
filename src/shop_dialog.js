// === shop_dialog.js ===
/*
  New shop UI for Dialog-system NPCs.

  Replaces openShop()/openStore() for migrated shopkeepers. The Dialog
  engine's @shop sentinel routes to ShopDialog.open(type) instead of the
  legacy openShop. Un-migrated shop NPCs (Apu, blacksmith, Cain, etc.)
  still use the old openShop path — no regression for them.

  UI: no title bar; Buy + Sell tabs only; total GP bottom-left; Leave
  button bottom-right. Per the tier-1 spec.

  Item catalogs live in SHOP_CATALOGS, keyed by NPC type. Tier-1 ships
  only the barman; more shopkeepers join in tier-2 as they migrate.
  buy() and sell() from shop.js are reused as-is.

  All user-facing strings (item names, NPC types) pass through _esc()
  before innerHTML interpolation; payloads are author-controlled
  (CATALOG constants + inventory items the player already owns).
*/
(function() {
  'use strict';

  // ─── Per-NPC item catalog ────────────────────────────────────
  // Each entry mirrors the legacy shop.js items[] shape so the existing
  // buy(icon, cost, type, qty) function works without modification.
  const SHOP_CATALOGS = {
    'mended_drum_barman': [
      { icon: '🍺', name: 'Scumble (mainly apples)',       cost: 4   },
      { icon: '🍖', name: 'Dwarf Bread (also a weapon)',   cost: 6   },
      { icon: '🧀', name: 'Lancre Cheese (legally a weapon)', cost: 5 },
      { icon: '📜', name: 'Inn-Sewer-Ants Policy',         cost: 50  },
      { icon: '🗡️', name: 'Perfectly Ordinary Sword',     cost: 120 },
    ],
  };

  const ShopDialog = {
    _npcType: null,
    _tab: 'buy',

    open(npcType) {
      if (!SHOP_CATALOGS[npcType]) {
        console.warn(`[ShopDialog] no catalog for "${npcType}" — falling back to legacy openShop`);
        if (typeof openShop === 'function') openShop(npcType);
        return;
      }
      this._npcType = npcType;
      this._tab = 'buy';
      const el = document.getElementById('shop-dialog');
      if (el) el.style.display = 'flex';
      this._render();
    },

    tab(name) {
      this._tab = (name === 'sell') ? 'sell' : 'buy';
      this._render();
    },

    leave() {
      const el = document.getElementById('shop-dialog');
      if (el) el.style.display = 'none';
      this._npcType = null;
    },

    // Called from button onclick — runs the legacy buy() / sell() with the
    // suppressReopen flag (true) so they DON'T pop the old shop modal at
    // the end. We re-render the new ShopDialog ourselves to reflect the
    // change in GP / inventory.
    buyItem(icon, cost, qty) {
      if (typeof buy === 'function') buy(icon, cost, this._npcType, qty, true);
      this._render();
    },

    sellItem(idx) {
      if (typeof sell === 'function') sell(idx, this._npcType, true);
      this._render();
    },

    // ─── internals ─────────────────────────────────────────────
    // All dynamic content funneled through _esc() before interpolation
    // — see _renderBuy/_renderSell. No runtime/network input reaches DOM.
    _render() {
      this._updateTabs();
      this._updateBottom();
      const contentEl = document.getElementById('shop-dialog-content');
      if (!contentEl) return;
      contentEl.innerHTML = (this._tab === 'buy') ? this._renderBuy() : this._renderSell();
    },

    _updateTabs() {
      const buyEl = document.getElementById('shop-dialog-tab-buy');
      const sellEl = document.getElementById('shop-dialog-tab-sell');
      if (buyEl)  buyEl.style.background  = (this._tab === 'buy')  ? '#2D2B32' : '#1D1B20';
      if (buyEl)  buyEl.style.color       = (this._tab === 'buy')  ? '#fff'    : '#aaa';
      if (sellEl) sellEl.style.background = (this._tab === 'sell') ? '#2D2B32' : '#1D1B20';
      if (sellEl) sellEl.style.color      = (this._tab === 'sell') ? '#fff'    : '#aaa';
    },

    _updateBottom() {
      const gpEl = document.getElementById('shop-dialog-gp');
      if (gpEl) {
        const gp = (typeof player !== 'undefined' && typeof player.gp === 'number') ? player.gp : 0;
        gpEl.textContent = `${gp}g`;
      }
    },

    _renderBuy() {
      const catalog = SHOP_CATALOGS[this._npcType] || [];
      if (catalog.length === 0) {
        return '<p style="color:#aaa; font-style:italic;">Nothing for sale.</p>';
      }
      return '<div style="display:flex; flex-direction:column; gap:6px;">' +
        catalog.map(item => {
          const qty = item.qty != null ? item.qty : 1;
          const affordable = (typeof player !== 'undefined' && player.gp >= item.cost);
          // Args must be SINGLE-quoted so the onclick attribute's outer
          // double-quotes survive intact. Matches the legacy shop.js style.
          // Safe for our emoji icons (none contain a single quote); if a
          // future catalog adds icons with apostrophes, switch to HTML
          // entity encoding (&quot;) around a JSON.stringify wrapper.
          const callArgs = `'${item.icon}', ${item.cost}, ${qty}`;
          return `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; background:#2D2B32; border-radius:4px;">
            <span>${this._esc(item.icon)} ${this._esc(item.name)} <span style="color:var(--warning); margin-left:6px;">${item.cost}g</span></span>
            <button onclick="ShopDialog.buyItem(${callArgs})" ${affordable ? '' : 'disabled'} style="padding:4px 10px;">Buy</button>
          </div>`;
        }).join('') + '</div>';
    },

    _renderSell() {
      if (typeof inventory === 'undefined') return '<p style="color:#aaa;">No inventory.</p>';
      const rows = [];
      for (let idx = 0; idx < inventory.length; idx++) {
        const it = inventory[idx];
        if (!it) continue;
        const def = it.def;
        if (!def || !def.maxGP || def.maxGP <= 0) continue;
        const count = inventory.filter(i => i && i.itemName === it.itemName).length;
        const badge = count > 1 ? `<span style="background:var(--warning); color:#000; font-size:9px; padding:0 4px; border-radius:8px; margin-left:4px;">${count}</span>` : '';
        rows.push(`<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; background:#2D2B32; border-radius:4px;">
          <span>${this._esc(it.icon || '?')} ${this._esc(def.displayName || it.itemName)} <span style="color:var(--success); margin-left:6px;">+${def.maxGP}g</span>${badge}</span>
          <button onclick="ShopDialog.sellItem(${idx})" style="padding:4px 10px;">Sell</button>
        </div>`);
      }
      if (rows.length === 0) {
        return '<p style="color:#aaa; font-style:italic;">Nothing to sell.</p>';
      }
      return '<div style="display:flex; flex-direction:column; gap:6px;">' + rows.join('') + '</div>';
    },

    _esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    },
  };

  window.ShopDialog = ShopDialog;
})();
