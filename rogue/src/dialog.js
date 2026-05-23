// === dialog.js ===
/*
  Dialog engine — Andor's-Trail-style conversation system.

  Data model (mirrors AT's model.conversation package):
    Phrase   = { message, replies[], scriptEffects[], speaker? }
               message may be a string, an array (random pick), or a function (called at render time).
    Reply    = { text, nextPhrase, requires[], scriptEffects[] }
    Requirement = { type, ...typeSpecificFields, negate? }
                  Supported in tier-1: 'questStage' {questId, minProgress}, 'playerStat' {stat, min}.
    ScriptEffect= { type, ... }
                  Supported in tier-1: 'advanceQuest' {questId, stage}, 'giveItem' {itemName, qty},
                                       'die' {cause}, 'log' {text}.

  Special nextPhrase sentinels (namespaced, see plan #3):
    @close   — close the dialog modal
    @shop    — close dialog, open the existing shop UI for the current NPC's type
    @fight   — close dialog, flip NPC to hostile (combat resumes on next bump)
    @remove  — close dialog, despawn the NPC
    @next    — pick the first selectable reply automatically (auto-advance)

  Coexistence: NPCs opt into this system by carrying a `phraseId` field. The
  bump handler in engine.js checks for that field; if absent the legacy path runs.

  All user-facing strings (NPC names, messages, reply text) pass through
  _escape() before being interpolated into innerHTML — see _render and
  _renderLogEntry. Content origin is the source-controlled dialog packs and
  MONSTER_DEF.dialog arrays; no runtime/network input ever reaches the DOM.
*/
(function() {
  'use strict';

  const SENTINELS = {
    CLOSE: '@close', SHOP: '@shop', FIGHT: '@fight', REMOVE: '@remove', NEXT: '@next',
  };

  const Dialog = {
    _phrases: {},        // id -> Phrase
    currentNpc: null,
    currentPhrase: null,
    currentPhraseId: null,
    _log: [],            // [{kind:'speaker'|'self'|'system', icon?, name?, text}]
    _selectedReplyIdx: null,  // index into _visibleReplies(); null = nothing picked yet

    // ─── public registration API ──────────────────────────────
    registerPhrases(map) {
      for (const [id, phrase] of Object.entries(map)) {
        if (this._phrases[id]) {
          console.warn(`[Dialog] phrase id collision: "${id}" — first wins`);
          continue;
        }
        this._phrases[id] = phrase;
      }
    },

    injectReply(intoPhraseId, reply) {
      const p = this._phrases[intoPhraseId];
      if (!p) {
        console.warn(`[Dialog] injectReply: unknown phrase "${intoPhraseId}"`);
        return;
      }
      if (!p.replies) p.replies = [];
      p.replies.push(reply);
    },

    // ─── public flow API ──────────────────────────────────────
    startWith(npc, phraseId) {
      this.currentNpc = npc;
      this._log = [];
      this._selectedReplyIdx = null;
      this._goto(phraseId);
      this._show();
    },

    // Two-step selection (Andor's-Trail style): click a reply to MARK it
    // (checkmark + lighter background), then click the Next button to
    // commit. Lets the player change their pick before committing.
    selectReply(idx) {
      if (!this.currentPhrase) return;
      const visible = this._visibleReplies();
      if (!visible[idx]) return;
      this._selectedReplyIdx = idx;
      this._render();
    },

    next() {
      // Commits the currently-selected reply. No-op if nothing picked.
      if (this._selectedReplyIdx == null) return;
      const visible = this._visibleReplies();
      const r = visible[this._selectedReplyIdx];
      if (!r) return;
      this._selectedReplyIdx = null;
      this._log.push({ kind: 'self', text: r.text });
      this._applyEffects(r.scriptEffects);
      this._goto(r.nextPhrase);
      this._render();
    },

    leave() {
      this._hide();
      this.currentNpc = null;
      this.currentPhrase = null;
      this.currentPhraseId = null;
      this._selectedReplyIdx = null;
    },

    // ─── internals ────────────────────────────────────────────
    _goto(phraseId) {
      // Sentinel routing
      if (phraseId === SENTINELS.CLOSE) { this.leave(); return; }
      if (phraseId === SENTINELS.SHOP) {
        const type = (this.currentNpc && this.currentNpc.type) || null;
        this._hide();
        // Prefer the new tab-only ShopDialog; fall back to legacy openShop
        // for any NPC type that hasn't been migrated to a SHOP_CATALOGS entry yet.
        if (type && typeof ShopDialog !== 'undefined' && ShopDialog.open) {
          ShopDialog.open(type);
        } else if (type && typeof openShop === 'function') {
          openShop(type);
        }
        return;
      }
      if (phraseId === SENTINELS.FIGHT) {
        const npc = this.currentNpc;
        this._hide();
        if (npc) {
          if (npc.stats) { npc.stats.passive = false; npc.stats.quest = false; }
          npc.isQuestNPC = false;
          if (typeof NPC_ATTITUDE !== 'undefined' && typeof npc.setAttitude === 'function') {
            npc.setAttitude(NPC_ATTITUDE.HOSTILE);
          }
        }
        return;
      }
      if (phraseId === SENTINELS.REMOVE) {
        const npc = this.currentNpc;
        this._hide();
        if (npc && typeof zone !== 'undefined' && zone.removeNpcs) zone.removeNpcs(e => e === npc);
        return;
      }
      // Real phrase
      const phrase = this._phrases[phraseId];
      if (!phrase) {
        console.warn(`[Dialog] unknown phrase "${phraseId}"`);
        this.leave();
        return;
      }
      this.currentPhrase = phrase;
      this.currentPhraseId = phraseId;
      this._selectedReplyIdx = null;  // fresh phrase, no pick yet
      this._applyEffects(phrase.scriptEffects);
      const message = this._resolveMessage(phrase.message);
      if (message) {
        const npc = this.currentNpc;
        this._log.push({
          kind: 'speaker',
          icon: (npc && npc.stats && npc.stats.icon) || '🗣',
          // Resolution order: explicit phrase.speaker > NPC stats.name >
          // prettified npc.type ('mended_drum_barman' → 'Mended Drum Barman')
          // > 'NPC'. The prettifier exists so a NEW spawn site that forgets
          // to set a name doesn't leak underscores into the UI.
          name: phrase.speaker
            || (npc && npc.stats && npc.stats.name)
            || (npc && this._prettyType(npc.type))
            || 'NPC',
          text: message,
        });
      }
    },

    _resolveMessage(raw) {
      if (raw == null) return null;
      if (typeof raw === 'function') {
        try { return String(raw()); } catch (e) { console.warn('[Dialog] message fn threw', e); return null; }
      }
      if (Array.isArray(raw)) {
        if (raw.length === 0) return null;
        return String(raw[Math.floor(Math.random() * raw.length)]);
      }
      return String(raw);
    },

    _visibleReplies() {
      if (!this.currentPhrase || !this.currentPhrase.replies) return [];
      return this.currentPhrase.replies.filter(r => this._canSelectReply(r));
    },

    _canSelectReply(reply) {
      if (!reply.requires) return true;
      for (const req of reply.requires) {
        if (!this._checkRequirement(req)) return false;
      }
      return true;
    },

    _checkRequirement(req) {
      let met = false;
      if (req.type === 'questStage') {
        const state = (typeof QuestEngine !== 'undefined') && QuestEngine._questState && QuestEngine._questState[req.questId];
        const current = state ? (state.current || 0) : 0;
        met = current >= (req.minProgress || 0);
      } else if (req.type === 'playerStat') {
        const v = (typeof player !== 'undefined' && player.stats && typeof player.stats[req.stat] === 'number') ? player.stats[req.stat] : 0;
        met = v >= (req.min || 0);
      } else {
        console.warn(`[Dialog] unsupported requirement type "${req.type}"`);
        met = false;
      }
      return req.negate ? !met : met;
    },

    _applyEffects(effects) {
      if (!effects) return;
      for (const eff of effects) this._applyEffect(eff);
    },

    _applyEffect(eff) {
      switch (eff.type) {
        case 'advanceQuest':
          if (typeof QuestEngine !== 'undefined' && QuestEngine.advance) {
            QuestEngine.advance(eff.questId, eff.stage);
            this._log.push({ kind: 'system', text: `[Quest updated]` });
          }
          break;
        case 'giveItem':
          if (typeof ItemStack !== 'undefined' && typeof inventory !== 'undefined') {
            const slot = inventory.findIndex(s => s === null);
            if (slot >= 0) {
              inventory[slot] = new ItemStack(eff.itemName, eff.qty || 1);
              this._log.push({ kind: 'system', text: `[Received: ${eff.itemName} ×${eff.qty || 1}]` });
              if (typeof renderQuickslots === 'function') renderQuickslots();
            } else {
              this._log.push({ kind: 'system', text: `[Inventory full — couldn't accept ${eff.itemName}]` });
            }
          }
          break;
        case 'die':
          if (typeof die === 'function') {
            const cause = eff.cause || 'dialogue';
            this._hide();
            setTimeout(() => die(cause), 0);
          }
          break;
        case 'log':
          if (typeof logMsg === 'function') logMsg(eff.text || '');
          break;
        default:
          console.warn(`[Dialog] unsupported effect type "${eff.type}"`);
      }
    },

    // ─── DOM ──────────────────────────────────────────────────
    _show() {
      const el = document.getElementById('dialog-modal');
      if (el) el.style.display = 'flex';
      this._render();
    },

    _hide() {
      const el = document.getElementById('dialog-modal');
      if (el) el.style.display = 'none';
    },

    _render() {
      const logEl = document.getElementById('dialog-log');
      const repliesEl = document.getElementById('dialog-replies');
      if (!logEl || !repliesEl) return;
      // All dynamic text is funneled through _escape() before interpolation.
      logEl.innerHTML = this._log.map(e => this._renderLogEntry(e)).join('');
      logEl.scrollTop = logEl.scrollHeight;
      const visible = this._visibleReplies();
      if (visible.length === 0) {
        // No replies → empty reply area (bottom Leave button still works).
        // Collapse the replies div completely so its border-top doesn't
        // stack against the buttons div's border-top into a double line.
        repliesEl.innerHTML = '';
        repliesEl.style.borderTop = 'none';
        repliesEl.style.padding = '0';
      } else {
        // Restore the divider + padding for the populated state.
        repliesEl.style.borderTop = '1px solid #4A4458';
        repliesEl.style.padding = '8px 12px';
        // Two-step selection: checkmark slot on the left, lighter bg when
        // selected. The slot is always rendered (placeholder when unpicked)
        // so text doesn't jump as the user moves between options.
        repliesEl.innerHTML = visible.map((r, i) => {
          const picked = (i === this._selectedReplyIdx);
          const bg = picked ? '#3D3B45' : '#2D2B32';
          const border = picked ? '#9cf' : '#4A4458';
          const mark = picked
            ? '<span style="color:#9cf; font-weight:bold;">✓</span>'
            : '<span style="color:transparent;">✓</span>';
          return `<button onclick="Dialog.selectReply(${i})" style="display:flex; align-items:center; gap:8px; width:100%; margin:4px 0; padding:8px; text-align:left; background:${bg}; border:1px solid ${border}; color:#fff; border-radius:4px; cursor:pointer;">${mark}<span style="flex:1;">${this._escape(r.text)}</span></button>`;
        }).join('');
      }
      // Next button visibility & enabled-state:
      //   no replies         → hidden (visibility:hidden so Leave stays put)
      //   replies, no pick   → visible but FADED + cursor:not-allowed + disabled attr
      //   replies, picked    → visible, full opacity, normal cursor
      const nextBtn = document.querySelector('#dialog-buttons button[onclick*="Dialog.next"]');
      if (nextBtn) {
        if (visible.length === 0) {
          nextBtn.style.visibility = 'hidden';
          nextBtn.disabled = true;
        } else {
          nextBtn.style.visibility = 'visible';
          const picked = (this._selectedReplyIdx != null);
          nextBtn.disabled = !picked;
          // Inline-style overrides so the change is unmistakable across
          // browsers (default :disabled styling is too subtle).
          nextBtn.style.opacity     = picked ? '1'        : '0.4';
          nextBtn.style.cursor      = picked ? 'pointer'  : 'not-allowed';
          nextBtn.style.filter      = picked ? 'none'     : 'grayscale(60%)';
        }
      }
    },

    _renderLogEntry(entry) {
      if (entry.kind === 'speaker') {
        // Multi-paragraph support: split the message on a blank line and
        // render each paragraph as a separate <p>. First paragraph carries
        // the speaker prefix "Name: …"; subsequent paragraphs indent under.
        const paras = String(entry.text || '').split(/\n\s*\n/);
        const first = paras.shift() || '';
        const firstHtml = `<p style="margin:0 0 6px;"><strong style="color:#fc9;">${this._escape(entry.name)}:</strong> ${this._escape(first)}</p>`;
        const restHtml = paras.map(p => `<p style="margin:6px 0 0;">${this._escape(p)}</p>`).join('');
        return `<div style="display:flex; gap:8px; margin:8px 0; align-items:flex-start;">
          <span style="font-size:28px; line-height:1; flex-shrink:0;">${this._escape(entry.icon)}</span>
          <div style="flex:1;">${firstHtml}${restHtml}</div>
        </div>`;
      }
      if (entry.kind === 'self') {
        return `<div style="margin:6px 0 6px 36px; color:#9cf;">› ${this._escape(entry.text)}</div>`;
      }
      // system
      return `<div style="margin:6px 0; color:#fc9; text-align:center; font-size:11px; font-style:italic;">${this._escape(entry.text)}</div>`;
    },

    _prettyType(type) {
      if (!type) return null;
      return String(type).split('_').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ').trim();
    },

    _escape(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    },
  };

  window.Dialog = Dialog;
})();
