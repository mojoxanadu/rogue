// GOAuth.js — shared auth surface for the GettingOut / ViaPath stack.
//
// Owns two cooperating steps, both of which are session-scoped (i.e. tied
// to the VpnSession's cookie jar) and not specific to any one service:
//
//   1. SSO sign-in against sso.gtlconnect.com/users/sign_in (Devise form
//      with authenticity_token). Seeds the `_usso_session` cookie.
//
//   2. OAuth2 PKCE authorization-code flow against sso.gtlconnect.com,
//      gated by `_usso_session`. May redirect through the recurring
//      Terms-of-Service interstitial, which is session-scoped (not an
//      account-state change) and is auto-accepted transparently.
//
// Service classes (GOMessaging, GOContactList, …) take a GOAuth instance
// and call `await auth.getAccessToken()` whenever they need a Bearer
// token. They MUST NOT cache the result locally — re-asking lets GOAuth
// remain the single source of truth and the only place that refresh
// logic would ever need to live.
//
// Login is lazy. The first call to getAccessToken() that finds no token
// runs sign-in and PKCE end-to-end. Subsequent calls return the cached
// token. (Refresh-on-expiry hooks would slot in here; not implemented.)

import { createHash, randomBytes } from 'node:crypto';
import { extractFormToken, extractTitle, extractFlash } from './vpnSession.js';

const USSO_BASE     = 'https://sso.gtlconnect.com';
const LOGIN_URL     = `${USSO_BASE}/users/sign_in`;
const ORIGIN        = 'https://my.viapath.com';
const REDIRECT_URI  = 'https://my.viapath.com/home/usso';
const CLIENT_ID     = 'f0b2cd568cf335933ff567b7d6baf375bf38ccfc42a0fced1f25acaaa6c1c4b3';
const DEFAULT_LOCALE = 'en';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pkcePair() {
  const verifier  = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export class GOAuth {
  constructor(session, { credentials, locale = DEFAULT_LOCALE, verbose = true } = {}) {
    if (!session || typeof session.fetch !== 'function') {
      throw new TypeError('GOAuth requires a VpnSession (or compatible) instance');
    }
    if (!credentials || typeof credentials.email !== 'string' || typeof credentials.password !== 'string') {
      throw new TypeError('GOAuth requires {credentials: {email, password}}');
    }
    this.session = session;
    this.locale = locale;
    this.verbose = verbose;
    this._credentials = credentials;
    this._loggedIn = false;
    this._accessToken = null;
    this._inFlight = null;
  }

  // Single entry point for service classes. Lazy: runs SSO sign-in and
  // OAuth-PKCE on first call, returns the cached token thereafter.
  // Concurrent callers share one in-flight login (avoids double sign-in
  // when multiple service methods race on cold start).
  async getAccessToken() {
    if (this._accessToken) return this._accessToken;
    if (this._inFlight) return this._inFlight;
    this._inFlight = (async () => {
      try {
        if (!this._loggedIn) await this._login();
        this._accessToken = await this._oauthExchange();
        return this._accessToken;
      } finally {
        this._inFlight = null;
      }
    })();
    return this._inFlight;
  }

  _log(...args) { if (this.verbose) console.log(...args); }

  // --- SSO sign_in (Devise form) -------------------------------------------

  async _login() {
    const { email, password } = this._credentials;
    this._log(`\n[*] GET ${LOGIN_URL}`);
    const { res: getRes } = await this.session.fetch(LOGIN_URL);
    const getHtml = await getRes.text();
    this._log(`[+] Status ${getRes.status}  cookies: [${this.session.jar.names().join(', ')}]`);

    const token = extractFormToken(getHtml);
    if (!token) throw new Error('authenticity_token not found on login page');
    this._log(`[+] authenticity_token: ${token.slice(0, 24)}…`);

    const form = new URLSearchParams();
    form.set('utf8', '✓');
    form.set('authenticity_token', token);
    form.set('user[email]', email);
    form.set('user[password]', password);

    this._log(`\n[*] POST ${LOGIN_URL}`);
    const postTrace = [];
    const { res: postRes, finalUrl } = await this.session.fetch(LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': USSO_BASE,
        'Referer': LOGIN_URL,
      },
      body: form.toString(),
    }, postTrace);

    if (this.verbose) {
      this._log('\n[*] Redirect chain:');
      for (const hop of postTrace) {
        const loc = hop.location ? `  → ${hop.location}` : '';
        this._log(`    ${hop.method} ${hop.status}  ${hop.url}${loc}  (+${hop.setCookieCount} cookies)`);
      }
    }

    const finalHtml = await postRes.text();
    this._log(`\n[+] Final: ${postRes.status}  ${finalUrl}  bytes=${finalHtml.length}`);
    this._log(`[+] Title: ${extractTitle(finalHtml) ?? '(none)'}`);
    this._log(`[+] Cookies in jar: [${this.session.jar.names().join(', ')}]`);

    if (this.verbose) {
      const flashes = extractFlash(finalHtml);
      if (flashes.length) {
        this._log('[+] Flash / alert blocks:');
        for (const f of flashes) this._log(`     • ${f.slice(0, 200)}`);
      }
    }

    const stillOnSignIn = /\/users\/sign_in/.test(finalUrl) ||
                          /name=["']user\[password\]["']/.test(finalHtml);
    const hasSessionCookie = this.session.jar.names().includes('_usso_session');
    if (stillOnSignIn) throw new Error('LOGIN FAILED (still on sign-in page)');
    if (!hasSessionCookie) throw new Error('LOGIN UNKNOWN (no _usso_session cookie)');
    this._log('\n[+] Verdict: LOGIN LIKELY SUCCESS (session cookie present, redirected away)');

    this._loggedIn = true;
  }

  // --- OAuth-PKCE ----------------------------------------------------------

  async _oauthExchange() {
    const code = await this._authorizeForCode({ allowTermsAccept: true });
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
    return tok.access_token;
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
  // once per account.
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
}
