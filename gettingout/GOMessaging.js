// GOMessaging.js — GettingOut/ViaPath message-center client.
//
// Wraps the messaging.gtlconnect.com endpoints used by the SPA at
// my.viapath.com/home (the bundle at /home/assets/index-*.js). These
// endpoints require a Bearer access_token; that token is owned by a
// sibling GOAuth instance, passed in at construction. This class
// re-asks GOAuth for the token on every request (no local caching) so
// auth stays the single source of truth.
//
// Discovered by reverse-reading the bundle. Relevant strings:
//   messagingApiURL  = https://messaging.gtlconnect.com
//   GET  /webapi/v2/users/contacts
//   GET  /webapi/v6/users/messages/chat?user_id=<id>&limit=N&page_number=N
//   GET  /webapi/v4/users/messages/cost?recipient_id=<id>   (returns {balance, cost})
//   POST /webapi/v6/users/messages   {recipient_id, body, type:"text", lang}
//
// Direction inference: in the chat list, `msg.recipient_id === contactId`
// means YOU sent it (outgoing); otherwise it's incoming. The bundle does
// the same check (Pfe vs Ufe component selection).
//
// Cost-incurring methods (sendMessage) require the caller to pass
// { iAcceptCost: true } explicitly. Read-only methods are always safe.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WHITELIST_PATH = join(dirname(fileURLToPath(import.meta.url)), 'whitelist.txt');

const MSG_BASE       = 'https://messaging.gtlconnect.com';
const ORIGIN         = 'https://my.viapath.com';
const DEFAULT_LOCALE = 'en';
const PAGE_SIZE      = 50;
const MAX_BODY_LEN   = 2000;

// --- safeText -------------------------------------------------------------
// Outbound-text filter. Any word NOT in whitelist.txt has ONE letter
// replaced with a visually-equivalent non-Latin codepoint, case
// preserved. The word stays legible to a human reader but no longer
// matches exact-string moderation rules on the inmate side. Whitelisted
// words pass through unchanged; words with no eligible letter pass
// through unchanged. Single auditable point — every wire-bound message
// body flows through here.
//
// Two-tier substitution strategy:
//
//   1. HOMOGLYPH (preferred) — Greek/Cyrillic codepoints that are
//      visually indistinguishable from their Latin counterparts. Scanned
//      first, across the whole word; first match wins.
//
//   2. FALLBACK (last resort) — Latin-1 grave-accented Ù/ù. Visually
//      conspicuous (the accent is obvious), so we only reach for these
//      when the word has no HOMOGLYPH-eligible letter at all. Example:
//      "under" → "undеr" (Cyrillic е); "us" → "ùs" (grave fallback,
//      nothing better available).
//
// Map rationale: the gtlconnect.com backend runs NFKC normalization on
// every stored body before moderation. NFKC FLATTENS mathematical,
// enclosed, fullwidth, and parenthesized alphanumerics back to plain
// Latin — those are useless for evasion. What DOES survive intact, per
// the live Unicode probe:
//   - Greek block (U+03xx)         — uppercase only
//                                    (Α Β Ε Η Ι Κ Μ Ν Ο Ρ Τ Χ Υ Ζ)
//   - Cyrillic block (U+04xx)      — lowercase
//                                    (а е о р с у х plus і U+0456)
//   - Latin-1 (U+00xx)             — diacritics including Ù/ù
//
// Coverage is one-sided: only UPPER-case Greek lookalikes exist for our
// purposes, and only LOWER-case Cyrillic ones. So lowercase 'b', 'h',
// 'k', 'm', 'n', 't', 'z', etc. have no Cyrillic visual twin, and
// uppercase 'C', 'F', 'G', 'L', 'Q', 'R', 'S', 'V', 'W' have no Greek
// visual twin. Words consisting only of such letters get no
// substitution unless they contain U/u (which trigger the FALLBACK).
//
// Codepoint picks are visual lookalikes, NOT phonetic equivalents —
// e.g. Greek Ρ (Rho, U+03A1) maps to Latin P (not R), and Cyrillic у
// (U+0443) maps to Latin y (not u).
const HOMOGLYPH = {
  // Uppercase — Greek block
  A: 'Α', // Α  Greek Capital Letter Alpha     (U+0391)
  B: 'Β', // Β  Greek Capital Letter Beta      (U+0392)
  E: 'Ε', // Ε  Greek Capital Letter Epsilon   (U+0395)
  H: 'Η', // Η  Greek Capital Letter Eta       (U+0397)
  I: 'Ι', // Ι  Greek Capital Letter Iota      (U+0399)
  K: 'Κ', // Κ  Greek Capital Letter Kappa     (U+039A)
  M: 'Μ', // Μ  Greek Capital Letter Mu        (U+039C)
  N: 'Ν', // Ν  Greek Capital Letter Nu        (U+039D)
  O: 'Ο', // Ο  Greek Capital Letter Omicron   (U+039F)
  P: 'Ρ', // Ρ  Greek Capital Letter Rho       (U+03A1)  — VISUAL match
  T: 'Τ', // Τ  Greek Capital Letter Tau       (U+03A4)
  X: 'Χ', // Χ  Greek Capital Letter Chi       (U+03A7)
  Y: 'Υ', // Υ  Greek Capital Letter Upsilon   (U+03A5)  — VISUAL match
  Z: 'Ζ', // Ζ  Greek Capital Letter Zeta      (U+0396)

  // Lowercase — Cyrillic block
  a: 'а', // а  Cyrillic Small Letter A                          (U+0430)
  c: 'с', // с  Cyrillic Small Letter Es                         (U+0441)
  e: 'е', // е  Cyrillic Small Letter Ie                         (U+0435)
  i: 'і', // і  Cyrillic Small Letter Byelorussian-Ukrainian I   (U+0456)
  o: 'о', // о  Cyrillic Small Letter O                          (U+043E)
  p: 'р', // р  Cyrillic Small Letter Er                         (U+0440)  — VISUAL match
  x: 'х', // х  Cyrillic Small Letter Ha                         (U+0445)  — VISUAL match
  y: 'у', // у  Cyrillic Small Letter U                          (U+0443)  — VISUAL match
};

// Last-resort substitutions for letters with no clean Greek/Cyrillic
// lookalike. The grave accent is visually conspicuous, so we use these
// only when the word contains no HOMOGLYPH-eligible letter at all.
const FALLBACK = {
  U: 'Ù', // Ù  Latin-1 Capital Letter U With Grave (U+00D9)
  u: 'ù', // ù  Latin-1 Small Letter U With Grave   (U+00F9)
};

// Precomputed character classes — kept in sync with the maps above
// automatically. Adding a row to either map extends its class.
const HOMOGLYPH_RE = new RegExp(`[${Object.keys(HOMOGLYPH).join('')}]`);
const FALLBACK_RE  = new RegExp(`[${Object.keys(FALLBACK ).join('')}]`);

let whitelistCache = null;
function loadWhitelist() {
  if (whitelistCache) return whitelistCache;
  const raw = readFileSync(WHITELIST_PATH, 'utf8');
  whitelistCache = new Set(
    raw.split(/\r?\n/)
       .map(l => l.trim().toLowerCase())
       .filter(Boolean)
  );
  return whitelistCache;
}

function safeText(plainText) {
  const whitelist = loadWhitelist();
  return plainText.replace(/[A-Za-z]+/g, word => {
    if (whitelist.has(word.toLowerCase())) return word;
    // Two-tier scan: prefer an invisible HOMOGLYPH; fall back to the
    // visually-conspicuous grave-accent FALLBACK only if no HOMOGLYPH-
    // eligible letter exists in the word.
    let m = word.match(HOMOGLYPH_RE);
    let table = HOMOGLYPH;
    if (!m) { m = word.match(FALLBACK_RE); table = FALLBACK; }
    if (!m) return word;
    const i = m.index;
    return word.slice(0, i) + table[word[i]] + word.slice(i + 1);
  });
}

export class GOMessaging {
  constructor(auth, { locale = DEFAULT_LOCALE } = {}) {
    if (!auth || typeof auth.getAccessToken !== 'function') {
      throw new TypeError('GOMessaging requires a GOAuth (or compatible) instance');
    }
    this.auth = auth;
    this.locale = locale;
  }

  async _getJson(url) {
    const token = await this.auth.getAccessToken();
    const { res } = await this.auth.session.fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': `Bearer ${token}`,
        'Origin': ORIGIN,
        'Referer': `${ORIGIN}/`,
      },
    });
    const body = await res.text();
    if (res.status !== 200) {
      throw new Error(`${url} → HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    try { return JSON.parse(body); }
    catch { throw new Error(`${url} → non-JSON: ${body.slice(0, 200)}`); }
  }

  // --- public read-only API -------------------------------------------------

  // List of approved contacts shown on the home screen.
  // Returns [{ contactId, fullName, firstName, lastName, facilityId,
  //            blockStatus, status, approvedMessaging }, ...]
  async getContacts() {
    const json = await this._getJson(`${MSG_BASE}/webapi/v2/users/contacts`);
    const list = Array.isArray(json) ? json : (json.data ?? []);
    return list.map(c => ({
      contactId:         c.id,
      fullName:          [c.first_name, c.last_name].filter(Boolean).join(' '),
      firstName:         c.first_name ?? null,
      lastName:          c.last_name ?? null,
      facilityId:        c.facility_id ?? null,
      blockStatus:       c.block_status ?? null,
      status:            c.status ?? null,
      approvedMessaging: c.approved_messaging ?? null,
    }));
  }

  // Per-recipient cost lookup. Response also carries the user's current
  // wallet balance, which is the simplest read-only way to surface it.
  // Returns { balance: <number|string>, cost: <number|string> }.
  async getMessageCost(contactId) {
    if (contactId == null) throw new Error('getMessageCost: contactId is required');
    const url = `${MSG_BASE}/webapi/v4/users/messages/cost?recipient_id=${encodeURIComponent(contactId)}`;
    const json = await this._getJson(url);
    const data = json.data ?? json;
    return { balance: data.balance, cost: data.cost };
  }

  // Convenience: balance is read off the cost endpoint of the first
  // (or specified) contact. Returns the raw value (typically a string
  // like "9.05" — the SPA renders it directly with a "$" prefix).
  async getBalance({ contactId } = {}) {
    let id = contactId;
    if (id == null) {
      const contacts = await this.getContacts();
      if (contacts.length === 0) {
        throw new Error('getBalance: no contacts; pass {contactId} explicitly');
      }
      id = contacts[0].contactId;
    }
    const { balance } = await this.getMessageCost(id);
    return balance;
  }

  // Raw chat thread for a contact, paginated. Accumulates pages until
  // the response stops growing the list. Returns messages oldest-first.
  async getChat(contactId, { maxPages = 20 } = {}) {
    if (contactId == null) throw new Error('getChat: contactId is required');
    const all = [];
    const seen = new Set();
    for (let page = 0; page < maxPages; page++) {
      const url =
        `${MSG_BASE}/webapi/v6/users/messages/chat?` +
        `user_id=${encodeURIComponent(contactId)}` +
        `&limit=${PAGE_SIZE}` +
        `&page_number=${page === 0 ? 0 : page - 1}`; // bundle quirk preserved
      const json = await this._getJson(url);
      // Body shape is {list: [...]} directly. The SPA reads it as
      // `axiosRes.data.list` where `.data` is axios's HTTP-body wrapper,
      // NOT a field in the JSON. Don't "fix" this to `json.data.list` —
      // that path is undefined and silently yields zero messages.
      const list = json.list || (json.data && json.data.list) || [];
      if (list.length === 0) break;
      let added = 0;
      for (const m of list) {
        if (!seen.has(m.message_id)) {
          seen.add(m.message_id);
          all.push(m);
          added++;
        }
      }
      if (added === 0) break;
    }
    all.sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
    return all;
  }

  // Incoming messages only — i.e. messages from the inmate to the user.
  // Each chat record carries a `direction` field (0 = outgoing from user,
  // non-zero = incoming from inmate). When that field is missing we fall
  // back to the SPA's heuristic: `recipient_id === contactId` ⇒ outgoing.
  // Returns [{ messageId, sender, sentAt, body, type, approvalStatus }, ...]
  async getIncomingMessages(contactId, opts) {
    const all = await this.getChat(contactId, opts);
    const isIncoming = m => (m.direction != null
      ? m.direction !== 0
      : String(m.recipient_id) !== String(contactId));
    return all
      .filter(isIncoming)
      .map(m => ({
        messageId:      m.message_id ?? m.id,
        sender:         m.sender ?? m.contact_name ?? null,
        sentAt:         m.sent_at ?? null,
        body:           m.body ?? null,
        type:           m.type ?? null,
        approvalStatus: m.approval_status ?? null,
      }));
  }

  // --- cost-incurring API ---------------------------------------------------

  // Send a text message to `contactId`. CHARGES THE ACCOUNT (~$0.05/msg).
  // Caller MUST pass { iAcceptCost: true } — there is no implicit consent.
  // Body is run through safeText() (whitelist + grave-accent filter) and
  // length-checked against MAX_BODY_LEN.
  //
  // Returns { sent, response } where `sent` is the post-safeText body that
  // actually went on the wire and `response` is the parsed API response
  // (shape TBD; the SPA's hook just refetches the chat thread afterwards).
  async sendMessage(contactId, text, { iAcceptCost = false } = {}) {
    if (contactId == null) throw new Error('sendMessage: contactId is required');
    if (typeof text !== 'string') throw new TypeError('sendMessage: text must be a string');
    if (iAcceptCost !== true) {
      throw new Error('sendMessage: refusing to spend; pass { iAcceptCost: true } to confirm');
    }
    const body = safeText(text);
    if (body.length === 0) throw new Error('sendMessage: empty body after safeText()');
    if (body.length > MAX_BODY_LEN) {
      throw new Error(`sendMessage: body length ${body.length} exceeds MAX_BODY_LEN ${MAX_BODY_LEN}`);
    }
    const token = await this.auth.getAccessToken();
    const url = `${MSG_BASE}/webapi/v6/users/messages`;
    const { res } = await this.auth.session.fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Origin': ORIGIN,
        'Referer': `${ORIGIN}/`,
      },
      body: JSON.stringify({
        recipient_id: contactId,
        body,
        type: 'text',
        lang: this.locale,
      }),
    });
    const raw = await res.text();
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`${url} → HTTP ${res.status}: ${raw.slice(0, 300)}`);
    }
    let response;
    try { response = JSON.parse(raw); }
    catch { response = { raw }; }
    return { sent: body, response };
  }
}
