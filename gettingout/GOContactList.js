// GOContactList.js — GettingOut "Find a Contact" + contact-list mutation client.
//
// Combines two host families:
//   1. pay.gettingout.com  (public, unauthenticated) — search dropdowns.
//   2. messaging.gtlconnect.com (Bearer-auth) — addContact mutation.
//
// pay.gettingout.com is served from a host with an incomplete cert chain,
// so the caller's VpnSession must bundle the DigiCert intermediate via
// `extraCa`. messaging.gtlconnect.com works with the system trust store
// but its endpoints require an OAuth-PKCE access_token managed by GOAuth.
//
// Discovered by reverse-reading the bundle at
//   https://my.viapath.com/home/assets/index-*.js
// where the apiclient maps to:
//   getCountryStates(country='US') → /pay/get_state_list?country=...
//   getStateFacilities(state)      → /pay/get_fac_list?facility_state=...
//   searchInmate(facId, name_query) → /pay/search_inmates
//   addContact(n)                  → POST messagingApi/webapi/v1/users/
//                                     contacts/inmate_friend_request
//                                     { pay_inmate_id, facility_id }
//
// Usage:
//   const sess = new VpnSession({ extraCa: ['./certs/...'] }).start();
//   const auth = new GOAuth(sess, { credentials });
//   const list = new GOContactList(auth);
//   const inmates = await list.searchInmates('CA', 273921, 'kim');
//   await list.addContact(inmates[i], { iAcceptStateChange: true });

const PAY_BASE = 'https://pay.gettingout.com';
const MSG_BASE = 'https://messaging.gtlconnect.com';
const ORIGIN   = 'https://my.viapath.com';

export class GOContactList {
  constructor(auth, { country = 'US' } = {}) {
    if (!auth || typeof auth.getAccessToken !== 'function') {
      throw new TypeError('GOContactList requires a GOAuth (or compatible) instance');
    }
    this.auth = auth;
    this.country = country;
  }

  async _getJson(url) {
    const { res } = await this.auth.session.fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Origin': ORIGIN,
        'Referer': `${ORIGIN}/`,
      },
    });
    const body = await res.text();
    if (res.status !== 200) {
      throw new Error(`${url} → HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    try {
      return JSON.parse(body);
    } catch (e) {
      throw new Error(`${url} → non-JSON response: ${body.slice(0, 200)}`);
    }
  }

  // 1. List of states/territories. Returns [{ value, label }, ...].
  async getStates() {
    const url = `${PAY_BASE}/pay/get_state_list?country=${encodeURIComponent(this.country)}`;
    const rows = await this._getJson(url);
    return rows.map(r => ({ value: r.id, label: r.label }));
  }

  // 2. Facilities for a given state code. Returns [{ value, label }, ...].
  async getFacilities(stateValue) {
    if (!stateValue) throw new Error('getFacilities: stateValue is required');
    const url = `${PAY_BASE}/pay/get_fac_list?facility_state=${encodeURIComponent(stateValue)}`;
    const rows = await this._getJson(url);
    return rows.map(r => ({ value: r.id, label: r.label }));
  }

  // 3. Inmate search.
  // stateValue is part of the public signature but is not sent — the
  // facility id alone disambiguates. Returns
  // [{ contactId, facilityId, firstName, lastName, fullName,
  //    bookingNumber, bookingDate, dob }, ...].
  // contactId + facilityId are the inputs addContact expects.
  async searchInmates(stateValue, facilityValue, query) {
    if (!facilityValue) throw new Error('searchInmates: facilityValue is required');
    if (!query || query.length < 3) {
      throw new Error('searchInmates: query must be at least 3 characters');
    }
    const params = new URLSearchParams({
      facility_id: String(facilityValue),
      name_query: query,
    });
    const url = `${PAY_BASE}/pay/search_inmates?${params.toString()}`;
    const rows = await this._getJson(url);
    return rows.map(r => {
      const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ');
      // Spec format: "dob (age in parens)". When fields are missing we
      // return null rather than a misleading partial string.
      let dob = null;
      if (r.date_of_birth && r.age != null) dob = `${r.date_of_birth} (${r.age})`;
      else if (r.date_of_birth)             dob = r.date_of_birth;
      else if (r.age != null)               dob = `(${r.age})`;
      return {
        contactId:     r.id,
        facilityId:    r.facility_id,
        firstName:     r.first_name ?? null,
        lastName:      r.last_name ?? null,
        fullName,
        bookingNumber: r.booking_code ?? null,
        bookingDate:   r.book_date ?? null,
        dob,
      };
    });
  }

  // 4. Send an inmate-friend-request (a.k.a. "add contact").
  // CHANGES STATE on the user's account — adds the inmate to the user's
  // contact list pending facility approval. Caller MUST pass
  // { iAcceptStateChange: true } to confirm.
  //
  // `inmate` should be a search-result object (or anything with
  // .contactId + .facilityId).
  //
  // Returns the parsed server response (shape TBD).
  async addContact(inmate, { iAcceptStateChange = false } = {}) {
    if (iAcceptStateChange !== true) {
      throw new Error('addContact: refusing to mutate contact list; pass { iAcceptStateChange: true } to confirm');
    }
    if (!inmate || inmate.contactId == null || inmate.facilityId == null) {
      throw new Error('addContact: inmate must have contactId and facilityId');
    }
    const token = await this.auth.getAccessToken();
    const url = `${MSG_BASE}/webapi/v1/users/contacts/inmate_friend_request`;
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
        pay_inmate_id: inmate.contactId,
        facility_id:   inmate.facilityId,
      }),
    });
    const raw = await res.text();
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`${url} → HTTP ${res.status}: ${raw.slice(0, 300)}`);
    }
    try { return JSON.parse(raw); }
    catch { return { raw }; }
  }
}
