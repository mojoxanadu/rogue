#!/usr/bin/env node
// Fetch Proxies.sx peer earnings and email a status report to jc22q@proton.me.
// SMTP creds come from Google Secret Manager (project rosie-portal-2026),
// matching the rosie3 convention; mail is sent through the local
// Proton Mail Bridge on 127.0.0.1:1025.

const fs = require('fs');
const { execFileSync } = require('child_process');
const nodemailer = require('nodemailer');

const STATE_FILE   = __dirname + '/register_response.json';
const API          = 'https://api.proxies.sx';
// Both recipients in To: (not BCC) — daily report goes to both inboxes.
// Sender (smtpUser, jc24q@pm.me) is included so that account also keeps
// a record in its own Inbox, not just in Sent.
const RECIPIENTS   = ['jc22q@proton.me', 'jc24q@pm.me'];
const SMTP_HOST    = '127.0.0.1';
const SMTP_PORT    = 1025;
const GSM_PROJECT  = 'rosie-portal-2026';

function gsm(name) {
  return execFileSync('gcloud', [
    'secrets', 'versions', 'access', 'latest',
    `--secret=${name}`, `--project=${GSM_PROJECT}`,
  ], { encoding: 'utf8' }).replace(/\s+$/, '');
}

// Returns seconds until the JWT in `state` expires, or -Infinity if we
// can't decode it. proxies.sx tokens are unsigned-payload JWTs whose
// middle segment is base64url JSON with iat/exp.
function jwtSecondsLeft(state) {
  try {
    const parts = (state.jwt || '').split('.');
    if (parts.length < 2) return -Infinity;
    const pad = parts[1] + '='.repeat((4 - parts[1].length % 4) % 4);
    const payload = JSON.parse(Buffer.from(pad, 'base64').toString('utf8'));
    return (payload.exp || 0) - Math.floor(Date.now() / 1000);
  } catch { return -Infinity; }
}

async function refreshJwt(state) {
  const res = await fetch(`${API}/v1/peer/agents/${state.deviceId}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: state.refreshToken }),
  });
  if (!res.ok) throw new Error(`refresh ${res.status}: ${await res.text()}`);
  const j = await res.json();
  state.jwt = j.jwt;
  if (j.refreshToken) state.refreshToken = j.refreshToken;
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function fetchEarnings(jwt, deviceId) {
  const res = await fetch(`${API}/v1/peer/agents/${deviceId}/earnings`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error(`earnings ${res.status}: ${await res.text()}`);
  return res.json();
}

function dollars(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatBody(e, deviceId) {
  return [
    `Proxies.sx peer earnings status`,
    ``,
    `Device:           ${deviceId}`,
    `Wallet:           ${e.walletAddress}`,
    `IP classification: ${e.ipType}`,
    ``,
    `Pending payout:   ${dollars(e.pendingPayoutCents)}`,
    `Total earned:     ${dollars(e.totalEarnedCents)}`,
    `Total paid out:   ${dollars(e.totalPaidOutCents)}`,
    `Minimum payout:   ${dollars(e.minimumPayoutCents)}`,
    `Can request now:  ${e.canRequestPayout ? 'YES — run withdraw' : 'no'}`,
    ``,
    `Traffic:          ${e.totalTrafficGB.toFixed(3)} GB (${e.totalTrafficMB.toFixed(1)} MB)`,
    ``,
    `Rates per GB:     mobile $${e.earningsPerGB.mobile}, residential $${e.earningsPerGB.residential}, datacenter $${e.earningsPerGB.datacenter}`,
    ``,
    `Withdraw command (when canRequestPayout=true):`,
    `  JWT=$(jq -r .jwt /home/projects/wallets/proxies_sx/register_response.json)`,
    `  curl -X POST -H "Authorization: Bearer $JWT" \\`,
    `    ${API}/v1/peer/agents/${deviceId}/withdraw`,
  ].join('\n');
}

(async () => {
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  // proxies.sx throttles /refresh per-token, so we only refresh when the
  // current JWT is actually near expiry (<5 min left). Otherwise we use
  // the cached one — it's the same one peer.js is using right now.
  const secsLeft = jwtSecondsLeft(state);
  if (secsLeft < 300) {
    try {
      await refreshJwt(state);
      console.log(new Date().toISOString(), `refreshed (was ${secsLeft}s from expiry)`);
    } catch (e) {
      console.log(new Date().toISOString(), 'refresh failed, trying cached jwt:', e.message);
    }
  } else {
    console.log(new Date().toISOString(), `using cached jwt (${secsLeft}s left)`);
  }
  const earnings = await fetchEarnings(state.jwt, state.deviceId);

  const smtpUser = gsm('rosie-smtp-user');
  const smtpPass = gsm('rosie-smtp-pass');

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,           // STARTTLS upgrade
    requireTLS: true,
    auth: { user: smtpUser, pass: smtpPass },
    tls: { rejectUnauthorized: false },  // Proton Bridge uses a self-signed cert
  });

  const flag = earnings.canRequestPayout ? '[READY] ' : '';
  const subject = `${flag}Proxies.sx peer: ${dollars(earnings.pendingPayoutCents)} pending, ${earnings.totalTrafficGB.toFixed(3)} GB`;

  const info = await transporter.sendMail({
    from: smtpUser,
    to: RECIPIENTS,
    subject,
    text: formatBody(earnings, state.deviceId),
  });

  console.log(new Date().toISOString(), 'sent:', subject, 'messageId=', info.messageId);
})().catch((e) => {
  console.error(new Date().toISOString(), 'ERROR:', e.message);
  process.exit(1);
});
