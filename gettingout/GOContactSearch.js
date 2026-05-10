// GOContactSearch.js — GettingOut "Find a Contact" data API client.
//
// Wraps the three pay.gettingout.com endpoints the SPA at
// my.viapath.com/home/find-contact uses to populate its dropdowns and
// search results. The endpoints are public — no SSO/login required —
// but they are served from a host with an incomplete cert chain, so
// callers should pass a VpnSession that has the DigiCert intermediate
// added via `extraCa`.
//
// Discovered by reverse-reading the bundle at
//   https://my.viapath.com/home/assets/index-*.js
// where the apiclient maps to:
//   getCountryStates(country='US') → /pay/get_state_list?country=...
//   getStateFacilities(state)      → /pay/get_fac_list?facility_state=...
//   searchInmate(facId, type, name_query, booking_code, last_name)
//                                  → /pay/search_inmates  (or _special)
//
// Usage:
//   import { VpnSession } from './vpnSession.js';
//   import { GOContactSearch } from './GOContactSearch.js';
//   const sess = new VpnSession({ extraCa: ['./certs/digicert-g2-intermediate.pem'] }).start();
//   await sess.assertVpn();
//   const search = new GOContactSearch(sess);
//   const states     = await search.getStates();
//   const facilities = await search.getFacilities('IN');
//   const inmates    = await search.searchInmates('IN', 208811, 'smi');

const PAY_BASE = 'https://pay.gettingout.com';
const ORIGIN   = 'https://my.viapath.com';

export class GOContactSearch {
  constructor(session, { country = 'US' } = {}) {
    if (!session || typeof session.fetch !== 'function') {
      throw new TypeError('GOContactSearch requires a VpnSession (or compatible) instance');
    }
    this.session = session;
    this.country = country;
  }

  async _getJson(url) {
    const { res } = await this.session.fetch(url, {
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
  // [{ fullName, bookingNumber, bookingDate, dob }, ...].
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
        fullName,
        bookingNumber: r.booking_code ?? null,
        bookingDate:   r.book_date ?? null,
        dob,
      };
    });
  }
}
