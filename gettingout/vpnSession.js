// vpnSession.js — Node v20 + undici v6
// Reusable scaffolding for VPN-pinned HTTP work with cookie/session handling.
//
// Exports:
//   class VpnSession  — owns dispatchers, kill-switch, jar, sessionFetch
//   class CookieJar   — minimal RFC-6265-ish jar (per-host, per-path)
//   getSecret(name, project)         — pulls a Google Secret Manager secret
//   extractFormToken(html, fieldName?) — Rails authenticity_token by default
//   extractMetaCsrf(html)             — <meta name="csrf-token" content="...">
//   extractTitle(html)
//   extractFlash(html)
//
// Guarantees (when start() is called):
//   - All TCP sockets bind to the configured tunnel local address.
//   - All DNS resolution rides DoH over the same bound dispatcher.
//   - If the tunnel interface drops or its IP disappears, every in-flight +
//     queued request aborts via the session's killSwitch.
//
// Usage:
//   import { VpnSession } from './vpnSession.js';
//   const sess = new VpnSession({ /* config — see DEFAULTS */ });
//   await sess.start();
//   await sess.assertVpn();
//   const { res, finalUrl } = await sess.fetch('https://example.com');

import { Agent, setGlobalDispatcher, request } from 'undici';
import { networkInterfaces } from 'node:os';
import { isIP } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { rootCertificates } from 'node:tls';

const runCmd = promisify(execFile); // execFile is shell-free; no injection risk

// ---------------------------------------------------------------------------
// Module-level guards — these wrappers attach process-wide handlers and call
// setGlobalDispatcher(); both must be installed at most once even if multiple
// VpnSessions are constructed in the same process.
// ---------------------------------------------------------------------------
let crashHandlerInstalled = false;
const sessionsForCrashHandler = new Set();

function installCrashHandlerOnce() {
  if (crashHandlerInstalled) return;
  crashHandlerInstalled = true;
  process.on('uncaughtException', (err) => {
    if (err && (err.code === 'EADDRNOTAVAIL' || err.code === 'ENETUNREACH')) {
      // Trip every active session — any of them might own the dead socket.
      for (const s of sessionsForCrashHandler) s._trip(`socket bind failed: ${err.code}`);
    } else {
      throw err;
    }
  });
}

// ---------------------------------------------------------------------------
// CookieJar — minimal jar suitable for scripted login flows on a small set
// of hosts. Not a public-suffix-aware general-purpose implementation.
// ---------------------------------------------------------------------------
export class CookieJar {
  constructor() { this.cookies = new Map(); }

  ingest(setCookieList, requestUrl) {
    const reqHost = new URL(requestUrl).hostname;
    for (const raw of setCookieList ?? []) {
      const parts = raw.split(';').map(s => s.trim());
      const [nameValue, ...attrs] = parts;
      const eq = nameValue.indexOf('=');
      if (eq < 0) continue;
      const name = nameValue.slice(0, eq).trim();
      const value = nameValue.slice(eq + 1).trim();
      let domain = reqHost, path = '/', expires = null, maxAge = null;
      for (const a of attrs) {
        const [k, v] = a.split('=').map(s => s && s.trim());
        const kl = (k || '').toLowerCase();
        if (kl === 'domain' && v) domain = v.replace(/^\./, '');
        else if (kl === 'path' && v) path = v;
        else if (kl === 'expires' && v) expires = Date.parse(v) || null;
        else if (kl === 'max-age' && v) maxAge = Number(v);
      }
      const expiresAt = maxAge != null ? Date.now() + maxAge * 1000 : expires;
      const key = `${domain}|${path}|${name}`;
      if (value === '' || (expiresAt && expiresAt < Date.now())) {
        this.cookies.delete(key);
      } else {
        this.cookies.set(key, { name, value, domain, path, expiresAt });
      }
    }
  }

  header(requestUrl) {
    const u = new URL(requestUrl);
    const now = Date.now();
    const out = [];
    for (const c of this.cookies.values()) {
      if (c.expiresAt && c.expiresAt < now) continue;
      const hostMatches = u.hostname === c.domain || u.hostname.endsWith('.' + c.domain);
      if (!hostMatches) continue;
      if (!u.pathname.startsWith(c.path)) continue;
      out.push(`${c.name}=${c.value}`);
    }
    return out.join('; ');
  }

  names() { return [...this.cookies.values()].map(c => c.name); }

  get(name, host) {
    for (const c of this.cookies.values()) {
      if (c.name !== name) continue;
      if (host && !(host === c.domain || host.endsWith('.' + c.domain))) continue;
      return c.value;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// VpnSession
// ---------------------------------------------------------------------------
const DEFAULTS = {
  protonIp:    '10.2.0.2',
  protonIface: 'proton',
  dohUrl:      'https://1.1.1.1/dns-query',
  hostEgress:  '172.245.182.122', // host eth0 public IP — must NEVER be the egress
  userAgent:   'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
               '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  maxRedirects: 8,
  connectTimeoutMs: 5000,
  bodyTimeoutMs:    15000,
  headersTimeoutMs: 15000,
  watchIntervalMs:  1000,
  setGlobalDispatcher: true, // overwrites the process-wide default fetch dispatcher
  // Extra CA certs to trust in addition to Node's bundled root store.
  // Pass an array of file paths to PEM files, or PEM strings directly.
  // Useful for servers that don't send their full intermediate chain (Node
  // doesn't do AIA fetching, so the chain must already be complete locally).
  extraCa: [],
};

export class VpnSession {
  constructor(config = {}) {
    this.config = { ...DEFAULTS, ...config };
    this.killSwitch = new AbortController();
    this.vpnDown = false;
    this.dnsCache = new Map();
    this.jar = new CookieJar();
    this._started = false;

    // Build the trusted-CA bundle. Providing `connect.ca` to undici/Node
    // REPLACES the default trust store, so we must explicitly include the
    // Node root certificates and append any extras.
    const extraPems = (this.config.extraCa ?? []).map(entry =>
      entry.includes('-----BEGIN') ? entry : readFileSync(entry, 'utf8')
    );
    const ca = extraPems.length ? [...rootCertificates, ...extraPems] : undefined;

    // NOTE: undici v6 silently ignores connect.localAddress.
    // The top-level Agent.localAddress is the option that pins the source IP.
    this.dohAgent = new Agent({
      localAddress: this.config.protonIp,
      connect: { timeout: this.config.connectTimeoutMs, ...(ca && { ca }) },
      connectTimeout: this.config.connectTimeoutMs,
    });
    this.agent = new Agent({
      localAddress: this.config.protonIp,
      connect: {
        lookup: this._tunnelLookup,
        timeout: this.config.connectTimeoutMs,
        ...(ca && { ca }),
      },
      connectTimeout: this.config.connectTimeoutMs,
      bodyTimeout:    this.config.bodyTimeoutMs,
      headersTimeout: this.config.headersTimeoutMs,
      pipelining: 1,
    });
  }

  // -------- lifecycle --------
  start() {
    if (this._started) return this;
    this._started = true;
    if (this.config.setGlobalDispatcher) setGlobalDispatcher(this.agent);
    sessionsForCrashHandler.add(this);
    installCrashHandlerOnce();
    this.vpnWatch = setInterval(() => {
      if (!this._tunnelHasIp()) {
        this._trip(`${this.config.protonIface} interface is down or lost its IP`);
      }
    }, this.config.watchIntervalMs).unref();
    return this;
  }

  shutdown() {
    if (!this._started) return;
    this._started = false;
    clearInterval(this.vpnWatch);
    sessionsForCrashHandler.delete(this);
    this.agent.destroy().catch(() => {});
    this.dohAgent.destroy().catch(() => {});
  }

  _trip(reason) {
    if (this.vpnDown) return;
    this.vpnDown = true;
    console.error(`\n[!!] KILL-SWITCH TRIPPED: ${reason}`);
    this.killSwitch.abort(new Error(reason));
    this.agent.destroy(new Error(reason)).catch(() => {});
    this.dohAgent.destroy(new Error(reason)).catch(() => {});
  }

  _tunnelHasIp() {
    const ifc = networkInterfaces()[this.config.protonIface];
    if (!ifc) return false;
    return ifc.some(a => a.address === this.config.protonIp && !a.internal);
  }

  // -------- DoH (arrow methods so undici can invoke as plain callbacks) --------
  _dohResolve = async (hostname, family) => {
    const types = family === 6 ? ['AAAA'] : family === 4 ? ['A'] : ['A', 'AAAA'];
    const out = [];
    let minTtl = 300;
    for (const type of types) {
      const u = `${this.config.dohUrl}?name=${encodeURIComponent(hostname)}&type=${type}`;
      const { body, statusCode } = await request(u, {
        dispatcher: this.dohAgent,
        headers: { accept: 'application/dns-json' },
      });
      if (statusCode !== 200) { body.dump(); continue; }
      const json = await body.json();
      for (const a of json.Answer ?? []) {
        if ((type === 'A' && a.type === 1) || (type === 'AAAA' && a.type === 28)) {
          out.push({ address: a.data, family: a.type === 1 ? 4 : 6 });
          if (a.TTL && a.TTL < minTtl) minTtl = a.TTL;
        }
      }
    }
    return { addrs: out, ttl: Math.max(30, minTtl) };
  };

  _tunnelLookup = (hostname, opts, cb) => {
    const lit = isIP(hostname);
    if (lit) return cb(null, hostname, lit);
    const family = opts?.family ?? 0;
    const key = `${hostname}|${family}`;
    const cached = this.dnsCache.get(key);
    if (cached && cached.expires > Date.now()) return this._deliverDns(cached.addrs, opts, cb);
    this._dohResolve(hostname, family).then(({ addrs, ttl }) => {
      if (!addrs.length) return cb(new Error(`DoH: no records for ${hostname}`));
      this.dnsCache.set(key, { addrs, expires: Date.now() + ttl * 1000 });
      this._deliverDns(addrs, opts, cb);
    }).catch(cb);
  };

  _deliverDns(addrs, opts, cb) {
    if (opts?.all) return cb(null, addrs);
    const a = addrs[0];
    cb(null, a.address, a.family);
  }

  // -------- preflight --------
  async assertVpn() {
    if (!this._tunnelHasIp()) {
      throw new Error(`${this.config.protonIface} interface not up at startup`);
    }
    const res = await fetch('https://ifconfig.me/ip', {
      headers: { 'User-Agent': 'curl/8.0' },
      signal: this.killSwitch.signal,
    });
    const ip = (await res.text()).trim();
    // RFC1918 v4 is 10/8, 192.168/16, 172.16/12 — NOT all 172.*.
    // The host's own eth0 IP is rejected too: if traffic egresses there,
    // the localAddress bind silently failed.
    const isRfc1918 =
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip);
    if (!ip || isRfc1918 || ip === this.config.hostEgress) {
      throw new Error(`Refusing to proceed — egress IP did not pin to tunnel: ${ip}`);
    }
    return ip;
  }

  // -------- cookie-aware fetch with manual redirect handling --------
  async fetch(url, opts = {}, trace = []) {
    let current = url;
    let method = opts.method || 'GET';
    let body = opts.body;
    let headersIn = { ...(opts.headers || {}) };

    for (let hop = 0; hop <= this.config.maxRedirects; hop++) {
      const headers = {
        'User-Agent': this.config.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headersIn,
      };
      const cookieHeader = this.jar.header(current);
      if (cookieHeader) headers['Cookie'] = cookieHeader;

      const res = await fetch(current, {
        method, headers, body,
        redirect: 'manual',
        signal: this.killSwitch.signal,
      });

      const setCookies = res.headers.getSetCookie?.() ?? [];
      this.jar.ingest(setCookies, current);

      trace.push({
        url: current,
        method,
        status: res.status,
        location: res.headers.get('location'),
        setCookieCount: setCookies.length,
      });

      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const next = new URL(res.headers.get('location'), current).toString();
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method !== 'GET')) {
          method = 'GET';
          body = undefined;
          delete headersIn['Content-Type'];
          delete headersIn['content-type'];
        }
        current = next;
        await res.arrayBuffer();
        continue;
      }
      return { res, finalUrl: current, trace };
    }
    throw new Error(`Too many redirects (>${this.config.maxRedirects}) starting at ${url}`);
  }
}

// ---------------------------------------------------------------------------
// Secrets — Google Secret Manager via gcloud CLI (no SDK dependency).
// runCmd uses execFile (shell-free); inputs are not interpreted by a shell.
// ---------------------------------------------------------------------------
export async function getSecret(name, project) {
  const { stdout } = await runCmd('gcloud', [
    'secrets', 'versions', 'access', 'latest',
    `--secret=${name}`, `--project=${project}`,
  ], { maxBuffer: 1024 * 1024 });
  // Strip a single trailing newline added by the terminal pipe but don't
  // touch other whitespace — passwords may legitimately contain spaces.
  return stdout.replace(/\r?\n$/, '');
}

// ---------------------------------------------------------------------------
// Stateless HTML helpers
// ---------------------------------------------------------------------------
export function extractFormToken(html, fieldName = 'authenticity_token') {
  const re = new RegExp(
    `<input[^>]+name=["']${fieldName.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}["'][^>]+value=["']([^"']+)["']`,
    'i'
  );
  return html.match(re)?.[1] ?? null;
}

export function extractMetaCsrf(html) {
  return html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;
}

export function extractTitle(html) {
  return html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
}

export function extractFlash(html) {
  const out = [];
  const re = /<div[^>]+class=["'][^"']*\b(?:alert|flash)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let m;
  while ((m = re.exec(html))) {
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) out.push(text);
  }
  return out;
}
