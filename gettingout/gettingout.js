// gettingout.js — site-specific entrypoint for sso.gtlconnect.com / GettingOut.
//
// All the things that change per site live here:
//   - LOGIN_URL and credential-secret names
//   - the form fields the site expects
//   - the success heuristic
//   - (later) the post-login walkthrough steps
// Everything else — VPN-pinning, cookies, redirects, secrets, HTML helpers —
// is in ./vpnSession.js so future projects can reuse it.

import {
  VpnSession,
  getSecret,
  extractFormToken,
  extractTitle,
  extractFlash,
} from './vpnSession.js';
import { GOContactSearch } from './GOContactSearch.js';
import { GOMessaging }    from './GOMessaging.js';

// --- Site-specific config ---------------------------------------------------
const LOGIN_URL    = 'https://sso.gtlconnect.com/users/sign_in';
const GCP_PROJECT  = 'static-webbing-461904-c4';
const EMAIL_SECRET = 'gettingout-rosie-email';
const PWD_SECRET   = 'gettingout-rosie-password';

async function login(sess) {
  console.log(`[*] Loading credentials from Google Secret Manager (${GCP_PROJECT})`);
  const [email, password] = await Promise.all([
    getSecret(EMAIL_SECRET, GCP_PROJECT),
    getSecret(PWD_SECRET,   GCP_PROJECT),
  ]);
  console.log(`[+] email=${email}  password=<${password.length} chars>`);

  // Step A — GET login page (seeds session + AWSALB cookies, gives us CSRF).
  console.log(`\n[*] GET ${LOGIN_URL}`);
  const { res: getRes } = await sess.fetch(LOGIN_URL);
  const getHtml = await getRes.text();
  console.log(`[+] Status ${getRes.status}  cookies: [${sess.jar.names().join(', ')}]`);

  const token = extractFormToken(getHtml);
  if (!token) throw new Error('authenticity_token not found on login page');
  console.log(`[+] authenticity_token: ${token.slice(0, 24)}…`);

  // Step B — POST credentials.
  const form = new URLSearchParams();
  form.set('utf8', '✓');
  form.set('authenticity_token', token);
  form.set('user[email]', email);
  form.set('user[password]', password);

  console.log(`\n[*] POST ${LOGIN_URL}`);
  const postTrace = [];
  const { res: postRes, finalUrl } = await sess.fetch(LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://sso.gtlconnect.com',
      'Referer': LOGIN_URL,
    },
    body: form.toString(),
  }, postTrace);

  console.log('\n[*] Redirect chain:');
  for (const hop of postTrace) {
    const loc = hop.location ? `  → ${hop.location}` : '';
    console.log(`    ${hop.method} ${hop.status}  ${hop.url}${loc}  (+${hop.setCookieCount} cookies)`);
  }

  const finalHtml = await postRes.text();
  console.log(`\n[+] Final: ${postRes.status}  ${finalUrl}  bytes=${finalHtml.length}`);
  console.log(`[+] Title: ${extractTitle(finalHtml) ?? '(none)'}`);
  console.log(`[+] Cookies in jar: [${sess.jar.names().join(', ')}]`);

  const flashes = extractFlash(finalHtml);
  if (flashes.length) {
    console.log('[+] Flash / alert blocks:');
    for (const f of flashes) console.log(`     • ${f.slice(0, 200)}`);
  }

  const stillOnSignIn = /\/users\/sign_in/.test(finalUrl) ||
                        /name=["']user\[password\]["']/.test(finalHtml);
  const hasSessionCookie = sess.jar.names().includes('_usso_session');
  if (stillOnSignIn) throw new Error('LOGIN FAILED (still on sign-in page)');
  if (!hasSessionCookie) throw new Error('LOGIN UNKNOWN (no _usso_session cookie)');
  console.log('\n[+] Verdict: LOGIN LIKELY SUCCESS (session cookie present, redirected away)');

  return { finalUrl, finalHtml };
}

async function demoGOContactSearch(sess /*, postLogin */) {
  // Demo of GOContactSearch: list states, list Indiana facilities, run a
  // 3-character inmate-name search against the first facility, and print
  // a summary. The class talks to public pay.gettingout.com endpoints, so
  // the SSO login above isn't strictly required — it's left in as a smoke
  // test of the broader flow.
  const search = new GOContactSearch(sess);

  console.log('\n[*] GOContactSearch.getStates()');
  const states = await search.getStates();
  console.log(`[+] ${states.length} states`);
  console.log(`     first 3: ${JSON.stringify(states.slice(0, 3))}`);
  const indiana = states.find(s => s.value === 'IN');
  console.log(`     Indiana: ${JSON.stringify(indiana)}`);

  console.log(`\n[*] GOContactSearch.getFacilities('IN')`);
  const facilities = await search.getFacilities('IN');
  console.log(`[+] ${facilities.length} facilities in IN`);
  console.log(`     first 3: ${JSON.stringify(facilities.slice(0, 3), null, 2)}`);

  const fac = facilities[0];
  const query = 'smi';
  console.log(`\n[*] GOContactSearch.searchInmates('IN', ${fac.value} /* ${fac.label} */, '${query}')`);
  const inmates = await search.searchInmates('IN', fac.value, query);
  console.log(`[+] ${inmates.length} inmate(s) returned`);
  for (const i of inmates) {
    console.log(`     ${i.fullName.padEnd(24)} booking=${i.bookingNumber}  date=${i.bookingDate}  dob=${i.dob}`);
  }
}

async function demoGOMessaging(sess, _postLogin, { spendOk } = {}) {
  // Demo of GOMessaging: walkthrough of the message center.
  // Authenticates via OAuth-PKCE against sso.gtlconnect.com (which works
  // because the preceding SSO login already seeded _usso_session), then
  // hits messaging.gtlconnect.com for contacts, balance, and incoming
  // messages for the first contact. Send is gated behind --spend-ok.
  console.log(`[*] spend-ok: ${spendOk ? 'YES (sending may incur ~$0.05)' : 'no (read-only)'}`);
  const msg = new GOMessaging(sess);

  console.log('\n[*] GOMessaging.authenticate() (OAuth-PKCE)');
  await msg.authenticate();
  console.log(`[+] access_token acquired (${msg.accessToken.length} chars)`);

  console.log('\n[*] GOMessaging.getContacts()');
  const contacts = await msg.getContacts();
  console.log(`[+] ${contacts.length} contact(s)`);
  for (const c of contacts) {
    console.log(`     id=${c.contactId}  ${c.fullName.padEnd(24)} fac=${c.facilityId}  status=${c.status}  approvedMessaging=${c.approvedMessaging}`);
  }
  if (contacts.length === 0) {
    console.log('[!] no contacts; skipping balance + messages');
    return;
  }

  const first = contacts[0];
  console.log(`\n[*] GOMessaging.getBalance() (via ${first.fullName})`);
  const balance = await msg.getBalance({ contactId: first.contactId });
  console.log(`[+] balance: $${balance}`);

  console.log(`\n[*] GOMessaging.getIncomingMessages(${first.contactId} /* ${first.fullName} */)`);
  const incoming = await msg.getIncomingMessages(first.contactId);
  console.log(`[+] ${incoming.length} incoming message(s)`);
  for (const m of incoming) {
    const date = m.sentAt ? new Date(m.sentAt).toISOString().slice(0, 10) : '?';
    console.log(`     [${date}] ${m.sender}: ${m.body}`);
  }

  if (spendOk) {
    const text = 'The apple fell and Isaac knew thy fate.';
    console.log(`\n[*] GOMessaging.sendMessage(${first.contactId}, ${JSON.stringify(text)}) [SPENDING ~$0.05]`);
    const { sent, response } = await msg.sendMessage(first.contactId, text, { iAcceptCost: true });
    console.log(`[+] safeText: ${JSON.stringify(sent)}`);
    console.log(`[+] response: ${JSON.stringify(response).slice(0, 300)}`);
  } else {
    console.log('\n[*] sendMessage skipped (pass --spend-ok to enable)');
  }
}

const DEMOS = {
  GOContactSearch: demoGOContactSearch,
  GOMessaging:     demoGOMessaging,
};

function parseArgs(argv) {
  // Accepts: --demo GOMessaging   or   --demo=GOMessaging
  //          --spend-ok           (boolean, only meaningful with GOMessaging)
  //          --help / -h
  let demo = null;
  let spendOk = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--demo' || a === '-d') { demo = argv[i + 1] ?? null; i++; continue; }
    if (a.startsWith('--demo=')) { demo = a.slice('--demo='.length); continue; }
    if (a === '--spend-ok') { spendOk = true; continue; }
    if (a === '--help' || a === '-h') { help = true; continue; }
  }
  return { demo, spendOk, help };
}

function printHelp() {
  const names = Object.keys(DEMOS).join(' | ');
  console.log(`Usage: node gettingout.js --demo <${names}> [--spend-ok]`);
  console.log('');
  console.log('Demos:');
  console.log('  GOContactSearch  Public pay.gettingout.com search (states → facilities → inmates).');
  console.log('  GOMessaging      Authenticated message-center walkthrough');
  console.log('                   (contacts, balance, incoming messages; sends only with --spend-ok).');
  console.log('');
  console.log('Flags:');
  console.log('  --spend-ok       Enable cost-incurring calls (sendMessage charges ~$0.05/msg).');
  console.log('                   Only meaningful with --demo GOMessaging. Default: off.');
  console.log('');
  console.log('Both demos share the same SSO login + VPN-pinned session.');
}

async function main() {
  const { demo, spendOk, help } = parseArgs(process.argv.slice(2));
  if (help || demo === null) {
    printHelp();
    process.exit(help ? 0 : 1);
  }
  const demoFn = DEMOS[demo];
  if (!demoFn) {
    console.error(`Unknown --demo "${demo}". Available: ${Object.keys(DEMOS).join(', ')}`);
    printHelp();
    process.exit(1);
  }
  if (spendOk && demo !== 'GOMessaging') {
    console.error(`--spend-ok has no effect with --demo ${demo}; it only gates GOMessaging.sendMessage.`);
  }

  // my.viapath.com sends only the leaf cert and omits its DigiCert
  // intermediate; bundle it so Node can complete the chain.
  const sess = new VpnSession({
    extraCa: ['./certs/digicert-g2-intermediate.pem'],
  }).start();
  const egress = await sess.assertVpn();
  console.log(`[+] Egress IP confirmed: ${egress}`);

  const postLogin = await login(sess);
  console.log(`\n[*] Running demo: ${demo}${spendOk ? ' (--spend-ok)' : ''}`);
  await demoFn(sess, postLogin, { spendOk });

  sess.shutdown();
  if (sess.vpnDown) process.exit(2);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
