// === shop_dialog.js ===
/*
  New shop UI for Dialog-system NPCs.

  Replaces openShop()/openStore() for migrated shopkeepers. The Dialog
  engine's @shop sentinel routes to ShopDialog.open(type) instead of the
  legacy openShop. Un-migrated shop NPCs (e.g. champion, cain)
  still use the old openShop path — no regression for them.

  UI: no title bar; Buy + Sell tabs only; total GP bottom-left; Leave
  button bottom-right. Per the tier-1 spec.

  Item catalogs live in window.SHOP_ITEM_CATALOGS (items_registry.js),
  keyed by NPC type. Icon/name/price resolved from ItemDefs at runtime.

  All user-facing strings funnel through _esc() before innerHTML
  interpolation; payloads are author-controlled constants + inventory
  the player already owns.
*/
(function() {
  'use strict';

  const ShopDialog = {
    _npcType: null,
    _tab: 'buy',

    open(npcType) {
      if (!window.SHOP_ITEM_CATALOGS[npcType]) {
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

    // Called from button onclick — places item in inventory using the
    // catalog's camelCase ID so icon conflicts are never an issue.
    buyItem(id, cost, qty) {
      if (typeof player === 'undefined' || player.gp < cost) return;
      const def = typeof ItemDefs !== 'undefined' && ItemDefs[id];
      if (!def) {
        if (typeof logMsg === 'function') logMsg(`<span style='color:var(--error)'>Unknown item: ${id}</span>`);
        return;
      }
      const stack = new ItemStack(id, qty);
      if (typeof tryPlaceInInventory === 'function' && tryPlaceInInventory(stack)) {
        if (typeof changeGold === 'function') changeGold(-cost);
        if (typeof logMsg === 'function') {
          logMsg(`<span style="color:var(--success)">Bought ${def.icon} ${this._esc(def.displayName)} for ${cost} gp.</span>`);
        }
      } else {
        if (typeof logMsg === 'function') logMsg("Inventory full!");
      }
      this._render();
      if (typeof renderQuickslots === 'function') renderQuickslots();
    },

    sellItem(idx) {
      const it = (typeof inventory !== 'undefined' && inventory[idx]) || null;
      let icon, name, gp;
      if (it) {
        icon = it.icon || '?';
        name = (it.def && it.def.displayName) || it.itemName || 'unknown';
        gp = (it.def && it.def.maxGP) || 0;
      }
      if (typeof sell === 'function') sell(idx, this._npcType, true);
      if (it && typeof logMsg === 'function') {
        logMsg(`<span style="color:var(--success)">Sold ${icon} ${this._esc(name)} for ${gp} gp.</span>`);
      }
      this._render();
      if (typeof renderQuickslots === 'function') renderQuickslots();
    },

    // ─── internals ─────────────────────────────────────────────
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
      const catalog = window.SHOP_ITEM_CATALOGS[this._npcType] || [];
      if (catalog.length === 0) {
        return '<p style="color:#aaa; font-style:italic;">Nothing for sale.</p>';
      }
      return '<div style="display:flex; flex-direction:column; gap:6px;">' +
        catalog.map(item => {
          const def = typeof ItemDefs !== 'undefined' && ItemDefs[item.id];
          const displayName = def ? def.displayName : item.id;
          const icon = def ? def.icon : '?';
          const qty = item.qty != null ? item.qty : 1;
          const affordable = (typeof player !== 'undefined' && player.gp >= item.cost);
          // Args single-quoted so the onclick attribute's outer double-quotes survive.
          const callArgs = `'${item.id}', ${item.cost}, ${qty}`;
          const btnStyle = affordable
            ? 'padding:4px 10px;'
            : 'padding:4px 10px; opacity:0.4; cursor:not-allowed; filter:grayscale(60%);';
          return `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; background:#2D2B32; border-radius:4px;">
            <span>${this._esc(icon)} ${this._esc(displayName)} <span style="color:var(--warning); margin-left:6px;">${item.cost}g</span></span>
            <button onclick="ShopDialog.buyItem(${callArgs})" ${affordable ? '' : 'disabled'} style="${btnStyle}">Buy</button>
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
