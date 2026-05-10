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

async function walkthrough(sess /*, postLogin */) {
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

async function main() {
  // my.viapath.com sends only the leaf cert and omits its DigiCert
  // intermediate; bundle it so Node can complete the chain.
  const sess = new VpnSession({
    extraCa: ['./certs/digicert-g2-intermediate.pem'],
  }).start();
  const egress = await sess.assertVpn();
  console.log(`[+] Egress IP confirmed: ${egress}`);

  const postLogin = await login(sess);
  await walkthrough(sess, postLogin);

  sess.shutdown();
  if (sess.vpnDown) process.exit(2);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
