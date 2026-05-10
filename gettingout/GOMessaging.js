// GOMessaging.js — GettingOut/ViaPath message-center client (read-only).
//
// Wraps the messaging.gtlconnect.com endpoints used by the SPA at
// my.viapath.com/home (the bundle at /home/assets/index-*.js). Unlike
// GOContactSearch, these endpoints require a Bearer access_token, which
// is obtained via an OAuth2 PKCE authorization-code flow against
// sso.gtlconnect.com. The flow only succeeds once the caller has already
// signed in to /users/sign_in (i.e. the session must carry _usso_session).
//
// Discovered by reverse-reading the bundle. Relevant strings:
//   ussoApiURL       = https://sso.gtlconnect.com
//   messagingApiURL  = https://messaging.gtlconnect.com
//   ussoClientId     = f0b2cd56…1c4b3
//   redirectUri      = https://my.viapath.com/home/usso
//   GET  /webapi/v2/users/contacts
//   GET  /webapi/v6/users/messages/chat?user_id=<id>&limit=N&page_number=N
//   GET  /webapi/v4/users/messages/cost?recipient_id=<id>   (returns {balance, cost})
//
// Direction inference: in the chat list, `msg.recipient_id === contactId`
// means YOU sent it (outgoing); otherwise it's incoming. The bundle does
// the same check (Pfe vs Ufe component selection).
//
// Read-only by design — no send / block / friend-request methods, even
// though the bundle exposes them.

import { createHash, randomBytes } from 'node:crypto';
import { extractFormToken } from './vpnSession.js';

const USSO_BASE      = 'https://sso.gtlconnect.com';
const MSG_BASE       = 'https://messaging.gtlconnect.com';
const ORIGIN         = 'https://my.viapath.com';
const REDIRECT_URI   = 'https://my.viapath.com/home/usso';
const CLIENT_ID      = 'f0b2cd568cf335933ff567b7d6baf375bf38ccfc42a0fced1f25acaaa6c1c4b3';
const DEFAULT_LOCALE = 'en';
const PAGE_SIZE      = 50;

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pkcePair() {
  const verifier  = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export class GOMessaging {
  constructor(session, { locale = DEFAULT_LOCALE } = {}) {
    if (!session || typeof session.fetch !== 'function') {
      throw new TypeError('GOMessaging requires a VpnSession (or compatible) instance');
    }
    this.session = session;
    this.locale = locale;
    this.accessToken = null;
  }

  // --- auth -----------------------------------------------------------------

  async authenticate() {
    if (this.accessToken) return this.accessToken;

    const code = await this._authorizeForCode({ allowTermsAccept: true });

    // 2. /oauth/token — exchange code + verifier for access_token.
    const { res } = await this.session.fetch(`${USSO_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Origin': ORIGIN,
        'Referer': `${ORIGIN}/`,
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
        code,
        code_verifier: this._verifier,
      }),
    });
    const body = await res.text();
    if (res.status !== 200) {
      throw new Error(`/oauth/token → HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    let tok;
    try { tok = JSON.parse(body); }
    catch { throw new Error(`/oauth/token → non-JSON: ${body.slice(0, 200)}`); }
    if (!tok.access_token) throw new Error(`/oauth/token → no access_token in response`);
    this.accessToken = tok.access_token;
    return this.accessToken;
  }

  // Runs /oauth/authorize. If the server diverts to the recurring SSO
  // Terms-of-Service interstitial (shown every session — not a persisted
  // account-state change), accept it once and retry the authorize call.
  async _authorizeForCode({ allowTermsAccept }) {
    const { verifier, challenge } = pkcePair();
    const authUrl =
      `${USSO_BASE}/oauth/authorize?` +
      `client_id=${encodeURIComponent(CLIENT_ID)}` +
      `&scope=` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&code_challenge=${encodeURIComponent(challenge)}` +
      `&code_challenge_method=S256` +
      `&locale=${encodeURIComponent(this.locale)}`;

    const trace = [];
    const { res, finalUrl } = await this.session.fetch(authUrl, {
      headers: { 'Accept': 'text/html,*/*', 'Referer': `${ORIGIN}/` },
    }, trace);

    const finalUrlObj = new URL(finalUrl);
    const code = finalUrlObj.searchParams.get('code');
    if (code) {
      this._verifier = verifier;
      return code;
    }

    if (allowTermsAccept && finalUrlObj.pathname === '/users/terms') {
      const html = await res.text();
      await this._acceptTerms(html, finalUrl);
      return await this._authorizeForCode({ allowTermsAccept: false });
    }

    const hops = trace.map(h => `${h.status} ${h.url}`).join('\n  ');
    throw new Error(`OAuth authorize did not yield a code. Trace:\n  ${hops}`);
  }

  // Submit the recurring TOS-acceptance form. The server posts back a
  // 302 to the original /oauth/authorize, which the caller re-issues.
  // NOTE: this looks state-changing but isn't — the SSO shows this
  // interstitial on every new _usso_session (i.e. once per login), not
  // once per account. Don't "harden" this by removing it; OAuth will
  // dead-end on /users/terms if you do.
  async _acceptTerms(html, refererUrl) {
    const token = extractFormToken(html);
    if (!token) throw new Error('TOS interstitial: authenticity_token not found');
    const form = new URLSearchParams();
    form.set('utf8', '✓');
    form.set('authenticity_token', token);
    form.set('locale', this.locale);
    form.set('tos-pp', '1');
    form.set('communications', '1');
    const acceptUrl = `${USSO_BASE}/users/terms/accept`;
    const { res } = await this.session.fetch(acceptUrl, {
      method: 'POST',
      headers: {
        'Accept': 'text/html,*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': USSO_BASE,
        'Referer': refererUrl,
      },
      body: form.toString(),
    });
    if (res.status >= 400) {
      const body = await res.text();
      throw new Error(`/users/terms/accept → HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    await res.arrayBuffer();
  }

  async _getJson(url) {
    if (!this.accessToken) await this.authenticate();
    const { res } = await this.session.fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': `Bearer ${this.accessToken}`,
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
}
