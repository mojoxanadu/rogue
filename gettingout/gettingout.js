// gettingout.js — site-specific entrypoint for sso.gtlconnect.com / GettingOut.
//
// All the things that change per site live here:
//   - credential-secret names + GCP project
//   - which demos exist
// SSO sign-in + OAuth-PKCE live in GOAuth; per-service surfaces live in
// GOMessaging / GOContactList. VPN-pinning, cookies, redirects, secrets,
// and HTML helpers live in ./vpnSession.js.
//
// Login is lazy. main() builds the GOAuth instance but does NOT pre-call
// it; the first service method that needs a Bearer token triggers SSO
// sign-in + PKCE end-to-end. That keeps the wiring in main() short and
// puts auth right next to the call site that needs it.

import { VpnSession, getSecret } from './vpnSession.js';
import { GOAuth }        from './GOAuth.js';
import { GOContactList } from './GOContactList.js';
import { GOMessaging }   from './GOMessaging.js';

// --- Site-specific config ---------------------------------------------------
const GCP_PROJECT  = 'static-webbing-461904-c4';
const EMAIL_SECRET = 'gettingout-rosie-email';
const PWD_SECRET   = 'gettingout-rosie-password';

async function demoGOContactList(auth /*, opts */) {
  // Demo of GOContactList: find KENNETH KIMES at Richard J Donovan
  // Correctional Facility (RJD, CA, id 273921) and add him to Rosie's
  // contact list if he isn't already there. Search hits the public
  // pay.gettingout.com endpoints (unauthenticated); addContact and the
  // idempotency check both go through GOAuth for a Bearer token.
  const list = new GOContactList(auth);
  const msg  = new GOMessaging(auth);

  console.log('\n[*] GOContactList.getFacilities(\'CA\')');
  const facilities = await list.getFacilities('CA');
  const rjd = facilities.find(f => /donovan|RJD/i.test(f.label));
  if (!rjd) throw new Error('RJD facility not found in CA list');
  console.log(`[+] ${JSON.stringify(rjd)}`);

  const query = 'kim';
  console.log(`\n[*] GOContactList.searchInmates('CA', ${rjd.value}, '${query}')`);
  const inmates = await list.searchInmates('CA', rjd.value, query);
  console.log(`[+] ${inmates.length} inmate(s) returned`);
  const target = inmates.find(i =>
    i.lastName === 'KIMES' && /^KEN(NETH)?$/i.test(i.firstName ?? '')
  );
  if (!target) {
    console.log('[!] no KENNETH KIMES in result set — aborting');
    return;
  }
  console.log(`     match: ${target.fullName.padEnd(24)} id=${target.contactId} fac=${target.facilityId} booking=${target.bookingNumber} dob=${target.dob}`);

  // Idempotency: skip add if Kenneth is already on the contact list.
  // We match by name, NOT by id — search-side `contactId` (pay.gettingout.com)
  // and contact-list-side `contactId` (messaging.gtlconnect.com) live in
  // different numeric universes. Names are stable across both APIs (both
  // return uppercase first_name/last_name).
  console.log('\n[*] GOMessaging.getContacts() (idempotency check; triggers lazy auth)');
  const existing = await msg.getContacts();
  const already = existing.find(c =>
    (c.firstName ?? '').toUpperCase() === (target.firstName ?? '').toUpperCase() &&
    (c.lastName  ?? '').toUpperCase() === (target.lastName  ?? '').toUpperCase()
  );
  if (already) {
    console.log(`[=] already on contact list: ${JSON.stringify(already)}`);
    return;
  }

  console.log(`\n[*] GOContactList.addContact(${target.fullName}) [STATE CHANGE]`);
  const result = await list.addContact(target, { iAcceptStateChange: true });
  console.log(`[+] addContact response: ${JSON.stringify(result).slice(0, 400)}`);
}

async function demoGOMessaging(auth, { spendOk } = {}) {
  // Demo of GOMessaging: walkthrough of the message center.
  // Auth is lazy — the first call (getContacts) triggers SSO sign-in
  // and the OAuth-PKCE exchange inside GOAuth. Send is gated behind
  // --spend-ok.
  console.log(`[*] spend-ok: ${spendOk ? 'YES (sending may incur ~$0.05)' : 'no (read-only)'}`);
  const msg = new GOMessaging(auth);

  console.log('\n[*] GOMessaging.getContacts() (triggers lazy auth)');
  const contacts = await msg.getContacts();
  console.log(`[+] ${contacts.length} contact(s)`);
  for (const c of contacts) {
    console.log(`     id=${c.contactId}  ${c.fullName.padEnd(24)} fac=${c.facilityId}  status=${c.status}  approvedMessaging=${c.approvedMessaging}`);
  }
  if (contacts.length === 0) {
    console.log('[!] no contacts; skipping balance + messages');
    return;
  }

  // Target the demo at JARED YAFFE explicitly. Earlier this was just
  // `contacts[0]`, which worked while Jared was the only contact —
  // adding more contacts (e.g. KENNETH KIMES) reordered the list and
  // broke that assumption. Name-matching keeps the recipient stable.
  const target = contacts.find(c => c.lastName === 'YAFFE' && /^JARED$/i.test(c.firstName ?? ''));
  if (!target) {
    console.log('[!] JARED YAFFE not on contact list; skipping balance + messages');
    return;
  }
  console.log(`\n[*] GOMessaging.getBalance() (via ${target.fullName})`);
  const balance = await msg.getBalance({ contactId: target.contactId });
  console.log(`[+] balance: $${balance}`);

  console.log(`\n[*] GOMessaging.getIncomingMessages(${target.contactId} /* ${target.fullName} */)`);
  const incoming = await msg.getIncomingMessages(target.contactId);
  console.log(`[+] ${incoming.length} incoming message(s)`);
  for (const m of incoming) {
    const date = m.sentAt ? new Date(m.sentAt).toISOString().slice(0, 10) : '?';
    console.log(`     [${date}] ${m.sender}: ${m.body}`);
  }

  if (spendOk) {
    const text = 'The apple fell and Isaac knew thy fate.';
    console.log(`\n[*] GOMessaging.sendMessage(${target.contactId}, ${JSON.stringify(text)}) [SPENDING ~$0.05]`);
    const { sent, response } = await msg.sendMessage(target.contactId, text, { iAcceptCost: true });
    console.log(`[+] safeText: ${JSON.stringify(sent)}`);
    console.log(`[+] response: ${JSON.stringify(response).slice(0, 300)}`);
  } else {
    console.log('\n[*] sendMessage skipped (pass --spend-ok to enable)');
  }
}

const DEMOS = {
  GOContactList: demoGOContactList,
  GOMessaging:   demoGOMessaging,
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
  console.log('  GOContactList    Search inmates and add to contact list');
  console.log('                   (finds Kenneth Kimes at RJD and adds him if not already present).');
  console.log('  GOMessaging      Authenticated message-center walkthrough');
  console.log('                   (contacts, balance, incoming messages; sends only with --spend-ok).');
  console.log('');
  console.log('Flags:');
  console.log('  --spend-ok       Enable cost-incurring calls (sendMessage charges ~$0.05/msg).');
  console.log('                   Only meaningful with --demo GOMessaging. Default: off.');
  console.log('');
  console.log('Both demos share the same lazy GOAuth (SSO sign-in + OAuth-PKCE) over a VPN-pinned session.');
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

  console.log(`[*] Loading credentials from Google Secret Manager (${GCP_PROJECT})`);
  const [email, password] = await Promise.all([
    getSecret(EMAIL_SECRET, GCP_PROJECT),
    getSecret(PWD_SECRET,   GCP_PROJECT),
  ]);
  console.log(`[+] email=${email}  password=<${password.length} chars>`);

  // Auth is lazy — built here, but sign-in + PKCE don't run until the
  // first service method asks for a token.
  const auth = new GOAuth(sess, { credentials: { email, password } });

  console.log(`\n[*] Running demo: ${demo}${spendOk ? ' (--spend-ok)' : ''}`);
  await demoFn(auth, { spendOk });

  sess.shutdown();
  if (sess.vpnDown) process.exit(2);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
