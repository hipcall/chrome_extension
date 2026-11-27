/**
 * Hipcall CRM features on top of HC_AUTH.api (service worker side).
 *
 *   find({ phones, emails, url })  → contacts and companies of the account that
 *       match the page: GET /api/v3/lookup/by_phone, /lookup/by_email, and a
 *       company name search for the site's domain (the API has no website
 *       search, so results are checked against website_url).
 *   activities({ cursor, limit })  → GET /api/v3/me/activities (newest first).
 */
// eslint-disable-next-line no-var
var HC_CRM = (() => {
  'use strict';

  const MAX_LOOKUPS = 8;   // per kind, to stay light on the API
  const PARALLEL = 4;

  /** Runs async jobs with limited parallelism; failures are collected, not thrown. */
  async function pool(items, worker) {
    const results = [];
    const errors = [];
    let i = 0;
    const run = async () => {
      while (i < items.length) {
        const item = items[i++];
        try { results.push(await worker(item)); } catch (e) { errors.push(e); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, run));
    return { results, errors };
  }

  /** "www.shop.example.co.uk" → { host: "example.co.uk", label: "example" } */
  function siteOf(url) {
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      const parts = host.split('.');
      const secondLevel = ['co', 'com', 'org', 'net', 'gov', 'edu', 'gen', 'web', 'av', 'bel', 'k12'];
      const cut = parts.length > 2 && secondLevel.includes(parts[parts.length - 2]) ? 3 : 2;
      const domain = parts.slice(-cut).join('.');
      return { host: domain, label: parts[parts.length - cut] };
    } catch (_) {
      return null;
    }
  }

  function sameSite(websiteUrl, site) {
    if (!websiteUrl || !site) return false;
    const w = siteOf(/^https?:\/\//i.test(websiteUrl) ? websiteUrl : 'https://' + websiteUrl);
    return !!w && w.host === site.host;
  }

  function summarizeContact(c) {
    return {
      id: c.id,
      name: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || '—',
      company: c.company ? c.company.name : '',
      phones: (c.phones || []).map((p) => p.number).filter(Boolean),
      emails: (c.emails || []).map((e) => e.email).filter(Boolean),
      owner: c.user ? (c.user.full_name || c.user.email || '') : '',
      lifeCycle: c.life_cycle ? c.life_cycle.name : ''
    };
  }

  function summarizeCompany(c) {
    return {
      id: c.id,
      name: c.name || '—',
      website: typeof c.website_url === 'string' ? c.website_url : '',
      linkedin: typeof c.linkedin_url === 'string' ? c.linkedin_url : '',
      phones: (c.phones || []).map((p) => p.number).filter(Boolean),
      emails: (c.emails || []).map((e) => e.email).filter(Boolean),
      owner: c.user ? (c.user.full_name || c.user.email || '') : '',
      lifeCycle: c.life_cycle ? c.life_cycle.name : '',
      contacts: Array.isArray(c.contacts) ? c.contacts.length : 0
    };
  }

  async function find({ phones = [], emails = [], url = '' }) {
    const contacts = new Map();
    const companies = new Map();
    const add = (map, record, summarize, reason) => {
      const cur = map.get(record.id);
      if (cur) { if (!cur.matchedBy.includes(reason)) cur.matchedBy.push(reason); return; }
      map.set(record.id, { ...summarize(record), matchedBy: [reason] });
    };
    const addLookup = (body, reason) => {
      const d = (body && body.data) || {};
      (d.contacts || []).forEach((c) => add(contacts, c, summarizeContact, reason));
      (d.companies || []).forEach((c) => add(companies, c, summarizeCompany, reason));
    };

    const phoneJobs = [...new Set(phones)].slice(0, MAX_LOOKUPS)
      .map((n) => () => HC_AUTH.api('/api/v3/lookup/by_phone', { number: n }).then((b) => addLookup(b, 'phone')));
    const emailJobs = [...new Set(emails.map((e) => e.toLowerCase()))].slice(0, MAX_LOOKUPS)
      .map((e) => () => HC_AUTH.api('/api/v3/lookup/by_email', { email: e }).then((b) => addLookup(b, 'email')));

    const site = siteOf(url);
    const siteJobs = site && site.label && site.label.length >= 3 ? [() =>
      HC_AUTH.api('/api/v3/companies', { q: site.label, limit: 50 }).then((body) => {
        for (const c of (body && body.data) || []) {
          if (sameSite(c.website_url, site)) add(companies, c, summarizeCompany, 'website');
        }
      })] : [];

    const allJobs = [...phoneJobs, ...emailJobs, ...siteJobs];
    const { errors } = await pool(allJobs, (job) => job());
    // Signed out / no permission → report instead of an empty "nothing found".
    const fatal = errors.find((e) => /SIGNED_OUT|FORBIDDEN|NEEDS_SCOPE/.test(e.message));
    if (fatal) throw fatal;
    // Every request failed (offline, server down): that is not "nothing found".
    if (allJobs.length && errors.length === allJobs.length) throw errors[0];

    const rank = (r) => r.matchedBy.length * 10 + (r.matchedBy.includes('phone') ? 2 : 0);
    return {
      contacts: [...contacts.values()].sort((a, b) => rank(b) - rank(a)),
      companies: [...companies.values()].sort((a, b) => rank(b) - rank(a)),
      searched: { phones: phoneJobs.length, emails: emailJobs.length, site: site ? site.host : '' },
      partialErrors: errors.length
    };
  }

  /* ---------------- LinkedIn profile / company page ---------------- */

  /** "Acme Yazılım A.Ş." → "acme yazilim" (case, Turkish letters, legal suffixes ignored). */
  function normName(s) {
    return String(s || '').toLocaleLowerCase('tr')
      .replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(a ?s|ltd|sti|san|tic|inc|llc|gmbh|corp|co|limited|sirketi|anonim|ve)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  // Words that do not make a different company: "Hipcall Türkiye" = "Hipcall".
  const GENERIC = new Set(['turkiye', 'turkey', 'tr', 'uk', 'global', 'international', 'group', 'grup', 'holding',
    'teknoloji', 'technology', 'technologies', 'yazilim', 'software', 'bilisim', 'iletisim', 'hizmetleri', 'official']);

  function similarName(a, b) {
    const x = normName(a);
    const y = normName(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const [short, long] = x.length <= y.length ? [x, y] : [y, x];
    if (short.length < 3 || !long.startsWith(short + ' ')) return false;
    return long.slice(short.length).trim().split(' ').every((w) => GENERIC.has(w));
  }

  /** Person: every word of the LinkedIn name is in the record's name. */
  function samePerson(a, b) {
    const x = normName(a).split(' ').filter(Boolean);
    const y = normName(b).split(' ').filter(Boolean);
    if (!x.length || !y.length) return false;
    const [few, many] = x.length <= y.length ? [x, y] : [y, x];
    return few.length >= 2 ? few.every((w) => many.includes(w)) : few[0] === many.join(' ');
  }

  /** "https://www.linkedin.com/company/hipcall/about/" → "company/hipcall" */
  function linkedinKey(url) {
    const m = String(url || '').match(/linkedin\.com\/(company|school|showcase|in)\/([^/?#]+)/i);
    return m ? (m[1] + '/' + decodeURIComponent(m[2])).toLowerCase() : '';
  }

  /**
   * Looks a LinkedIn person or company up in Hipcall.
   * person:  { kind:'person', name, emails, phones, company:{name, url, website} }
   * company: { kind:'company', name, website, linkedinUrl, phones }
   */
  async function linkedinLookup(input = {}) {
    const contacts = new Map();
    const companies = new Map();
    const add = (map, record, summarize, reason) => {
      if (!record || record.id == null) return;
      const cur = map.get(record.id);
      if (cur) { if (!cur.matchedBy.includes(reason)) cur.matchedBy.push(reason); return; }
      map.set(record.id, { ...summarize(record), matchedBy: [reason] });
    };
    const jobs = [];
    const lookups = (phones, emails) => {
      [...new Set(phones || [])].slice(0, MAX_LOOKUPS).forEach((n) => jobs.push(() =>
        HC_AUTH.api('/api/v3/lookup/by_phone', { number: n }).then((b) => {
          const d = (b && b.data) || {};
          (d.contacts || []).forEach((c) => add(contacts, c, summarizeContact, 'phone'));
          (d.companies || []).forEach((c) => add(companies, c, summarizeCompany, 'phone'));
        })));
      [...new Set((emails || []).map((e) => String(e).toLowerCase()))].slice(0, MAX_LOOKUPS).forEach((e) => jobs.push(() =>
        HC_AUTH.api('/api/v3/lookup/by_email', { email: e }).then((b) => {
          const d = (b && b.data) || {};
          (d.contacts || []).forEach((c) => add(contacts, c, summarizeContact, 'email'));
          (d.companies || []).forEach((c) => add(companies, c, summarizeCompany, 'email'));
        })));
    };
    // Company by name, website and LinkedIn page (one name search + one domain search).
    const companySearch = ({ name, website, linkedinUrl }) => {
      const site = website ? siteOf(/^https?:\/\//i.test(website) ? website : 'https://' + website) : null;
      const key = linkedinKey(linkedinUrl);
      const check = (c) => {
        if (key && linkedinKey(c.linkedin_url) === key) add(companies, c, summarizeCompany, 'linkedin');
        if (site && sameSite(c.website_url, site)) add(companies, c, summarizeCompany, 'website');
        if (name && similarName(c.name, name)) add(companies, c, summarizeCompany, 'name');
      };
      const terms = new Map(); // one search per distinct term (case-insensitive)
      const term = (q) => { if (q && !terms.has(q.toLocaleLowerCase('tr'))) terms.set(q.toLocaleLowerCase('tr'), q); };
      if (name && normName(name).length >= 2) term(String(name).trim().slice(0, 60));
      if (site && site.label && site.label.length >= 3) term(site.label);
      terms.forEach((q) => jobs.push(() =>
        HC_AUTH.api('/api/v3/companies', { q, limit: 50 }).then((b) => ((b && b.data) || []).forEach(check))));
    };

    if (input.kind === 'person') {
      lookups(input.phones, input.emails);
      if (input.name && normName(input.name).length >= 3) {
        jobs.push(() => HC_AUTH.api('/api/v3/contacts', { q: String(input.name).trim().slice(0, 80), limit: 50 }).then((b) => {
          ((b && b.data) || []).forEach((c) => {
            const full = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ');
            if (samePerson(full, input.name)) add(contacts, c, summarizeContact, 'name');
          });
        }));
      }
      if (input.company && (input.company.name || input.company.website)) {
        companySearch({ name: input.company.name, website: input.company.website, linkedinUrl: input.company.url });
      }
    } else {
      lookups(input.phones, []);
      companySearch({ name: input.name, website: input.website, linkedinUrl: input.linkedinUrl });
    }

    const { errors } = await pool(jobs, (job) => job());
    const fatal = errors.find((e) => /SIGNED_OUT|FORBIDDEN|NEEDS_SCOPE/.test(e.message));
    if (fatal) throw fatal;
    if (jobs.length && errors.length === jobs.length) throw errors[0];

    const rank = (r) => r.matchedBy.length * 10 + (r.matchedBy.includes('linkedin') ? 5 : 0) + (r.matchedBy.includes('website') ? 3 : 0);
    return {
      contacts: [...contacts.values()].sort((a, b) => rank(b) - rank(a)),
      companies: [...companies.values()].sort((a, b) => rank(b) - rank(a)),
      partialErrors: errors.length
    };
  }

  async function activities({ cursor, limit = 20 } = {}) {
    const body = await HC_AUTH.api('/api/v3/me/activities', { cursor, limit });
    const items = (body.data || []).map((a) => ({
      id: a.id,
      type: a.type || '',
      group: a.group || '',
      names: a.names || null,
      detail: a.detail || '',
      content: a.content || '',
      occurredAt: a.occurred_at || a.recorded_at || '',
      actor: a.actor && a.actor.user ? a.actor.user.name : (a.actor && a.actor.api_token ? a.actor.api_token.name : ''),
      contact: a.contact ? a.contact.name : '',
      company: a.company ? a.company.name : '',
      deal: a.deal ? a.deal.name : ''
    }));
    return { items, nextCursor: (body.meta && body.meta.next_cursor) || null };
  }

  /* ---------------- Create a company ---------------- */

  const EMPLOYEE_SIZES = ['1', '2_5', '6_10', '11_25', '26_50', '51_200', '201_1000', '1001_10000', '10001_more'];
  const MAX_ITEMS = 6; // API limit for phones and e-mails per company

  const clean = (v, max = 255) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const httpUrl = (v) => {
    const s = clean(v);
    if (!s) return null;
    try {
      const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
      return /^https?:$/.test(u.protocol) ? u.href.replace(/\/$/, '') : null;
    } catch (e) {
      return null;
    }
  };

  /**
   * POST /api/v3/companies, assigned to the signed-in user. Only the fields
   * the user kept in the form are sent; empty ones are left out.
   * Input: { name, websiteUrl, linkedinUrl, customUrl, description,
   *          employeeSize, phones: [{number, country}], emails: [string] }
   */
  async function createCompany(input) {
    const name = clean(input.name);
    if (name.length < 3) {
      const err = new Error('VALIDATION');
      err.fields = { name: ['min3'] };
      throw err;
    }
    const user = await HC_AUTH.currentUser();

    const body = { name };
    if (user && user.id != null) body.assign_to_user_id = user.id;
    const website = httpUrl(input.websiteUrl);
    const linkedin = httpUrl(input.linkedinUrl);
    const custom = httpUrl(input.customUrl);
    if (website) body.website_url = website;
    if (linkedin) body.linkedin_url = linkedin;
    if (custom) body.custom_url = custom;
    const description = clean(input.description, 2000);
    if (description) body.description = description;
    if (EMPLOYEE_SIZES.includes(input.employeeSize)) body.employee_size = input.employeeSize;

    const seenPhones = new Set();
    const phones = (input.phones || [])
      .map((p) => ({ number: clean(p && p.number, 40), country: clean(p && p.country, 2).toUpperCase() }))
      .filter((p) => {
        const key = p.number.replace(/\D/g, '');
        if (key.length < 3 || seenPhones.has(key)) return false;
        seenPhones.add(key);
        return true;
      })
      .slice(0, MAX_ITEMS)
      .map((p) => ({ number: p.number, country: /^[A-Z]{2}$/.test(p.country) ? p.country : 'TR' }));
    if (phones.length) body.phones = phones;

    const emails = [...new Set((input.emails || []).map((e) => clean(e, 254).toLowerCase()))]
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      .slice(0, MAX_ITEMS)
      .map((email) => ({ email }));
    if (emails.length) body.emails = emails;

    const customFields = cleanCustomFields(input.customFields);
    if (customFields) body.custom_fields = customFields;

    const res = await HC_AUTH.api('/api/v3/companies', null, { method: 'POST', body });
    return summarizeCompany((res && res.data) || {});
  }

  /** Account-defined company fields (GET /api/v3/companies/custom-fields), active ones in order. */
  async function companyCustomFields() {
    const res = await HC_AUTH.api('/api/v3/companies/custom-fields', { active: true });
    return (Array.isArray(res && res.data) ? res.data : [])
      .filter((f) => f && f.active !== false && typeof f.slug === 'string')
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map((f) => ({
        slug: f.slug,
        name: String(f.name || f.slug),
        type: f.field_type,
        numberType: f.number_type || null,
        options: Array.isArray(f.options) ? f.options.map(String) : null,
        required: !!f.required
      }));
  }

  /** Only plain values (text, number, boolean, list of text) keyed by slug. */
  function cleanCustomFields(values) {
    if (!values || typeof values !== 'object') return null;
    const out = {};
    for (const [slug, v] of Object.entries(values)) {
      if (!slug || slug.length > 100) continue;
      if (typeof v === 'string') { if (v.trim()) out[slug] = v.trim().slice(0, 2000); }
      else if (typeof v === 'number' && Number.isFinite(v)) out[slug] = v;
      else if (typeof v === 'boolean') out[slug] = v;
      else if (Array.isArray(v)) { const list = v.filter((x) => typeof x === 'string' && x); if (list.length) out[slug] = list; }
    }
    return Object.keys(out).length ? out : null;
  }

  return { find, linkedinLookup, activities, createCompany, companyCustomFields, siteOf, EMPLOYEE_SIZES, MAX_ITEMS };
})();
