/**
 * Hipcall Webphone — toolbar popup
 *
 * NUMBERS tab
 *   The active tab is scanned as soon as the popup opens (first the page itself,
 *   shown immediately; then, if enabled, the site's contact/about pages).
 *   Phones can be called with Hipcall, e-mails copied or opened in the mail app.
 *
 * SETTINGS tab
 *   Account region (Türkiye / EU / UK / US → hipcall.com.tr or hipcall.com),
 *   language, auto-dial, and on which pages of the current site the call icons
 *   are shown (js/site_rules.js).
 */

const $ = (id) => document.getElementById(id);
const t = (key, subs) => HC_I18N.t(key, subs);

const ICON = {
  phone: '<svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v.5l8 5 8-5V6H4zm16 2.85-7.47 4.67a1 1 0 0 1-1.06 0L4 8.85V18h16V8.85z"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><path d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1zm3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16h-9V7h9v14z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
};

let activeTab = null;
let pageUrl = null; // URL object, or null if the tab cannot be scanned

init();

async function init() {
  await HC_I18N.init();
  localize();

  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const u = new URL(activeTab.url);
    if (/^https?:$/.test(u.protocol) && !HC_CONFIG.isWebphoneUrl(u.href)) pageUrl = u;
  } catch (_) { /* ignore */ }

  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });

  $('openWebphone').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'openWebphone' }, () => window.close());
  });

  // Numbers
  $('findSite').textContent = pageUrl ? pageUrl.hostname.replace(/^www\./, '') + pageUrl.pathname : '';
  $('rescan').addEventListener('click', () => scan());
  $('manual').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('manualNumber').value.trim();
    if (v) callNumber(v);
  });

  const { deepScan = true } = await chrome.storage.local.get('deepScan');
  $('deep').checked = deepScan;
  $('deep').addEventListener('change', () => {
    chrome.storage.local.set({ deepScan: $('deep').checked });
    if ($('deep').checked) scan();
  });

  initGeneralSettings();
  initSiteSettings();

  // Remember the last tab (e.g. reopen on Settings after a language change).
  const { popupTab } = await chrome.storage.session.get('popupTab').catch(() => ({}));
  if (popupTab === 'settings') showTab('settings');

  if (pageUrl) {
    scan();
  } else {
    $('scanArea').hidden = true;
    $('cannotScan').hidden = false;
  }
}

/** Fills elements marked with data-i18n / data-i18n-placeholder. */
function localize() {
  document.documentElement.lang = HC_I18N.current();
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  $('panel-find').hidden = name !== 'find';
  $('panel-settings').hidden = name !== 'settings';
  chrome.storage.session.set({ popupTab: name }).catch(() => {});
}

/** Wires a .segmented control: buttons with data-value, aria-checked marks the selection. */
function segmented(el, value, onChange) {
  const buttons = Array.from(el.querySelectorAll('button'));
  const mark = (v) => buttons.forEach((b) => b.setAttribute('aria-checked', b.dataset.value === v));
  mark(value);
  buttons.forEach((b) => b.addEventListener('click', () => {
    mark(b.dataset.value);
    onChange(b.dataset.value);
  }));
  return mark;
}

/* ==================================================================== */
/* NUMBERS                                                              */
/* ==================================================================== */

function setStatus(text, isError = false) {
  $('status').textContent = text;
  $('status').className = isError ? 'err' : '';
}

let scanId = 0;

async function scan() {
  if (!pageUrl) return;
  const id = ++scanId;

  $('rescan').disabled = true;
  setStatus(t('scanning'));
  try {
    // 1) Fast pass: the open page (+ iframes) → show right away.
    let result = await runScan(false);
    if (id !== scanId) return;
    render(result);

    // 2) Deep pass: contact / about pages as well.
    if ($('deep').checked) {
      setStatus(t('scanningContactPages'));
      result = await runScan(true);
      if (id !== scanId) return;
      render(result);
    }

    setStatus(result.phones.length || result.emails.length ? '' : t('nothingFound'));
  } catch (err) {
    if (id === scanId) setStatus(t('scanError', [err && err.message ? err.message : String(err)]), true);
  } finally {
    if (id === scanId) $('rescan').disabled = false;
  }
}

async function runScan(deep) {
  const { region } = await HC_CONFIG.getSettings();
  const target = { tabId: activeTab.id, allFrames: true };
  // Shared detection rules first (js/phone.js), then the scanner that uses them.
  await chrome.scripting.executeScript({ target, files: ['js/phone.js'] });
  const frames = await chrome.scripting.executeScript({
    target,
    func: scanPage,
    args: [{ deep, region }]
  });

  const phones = new Map();
  const emails = new Map();
  for (const f of frames) {
    const r = (f && f.result) || {};
    for (const item of r.phones || []) {
      const cur = phones.get(item.key);
      if (cur) cur.hits += item.hits; else phones.set(item.key, { ...item });
    }
    for (const item of r.emails || []) {
      const cur = emails.get(item.key);
      if (cur) cur.hits += item.hits; else emails.set(item.key, { ...item });
    }
  }
  const byHits = (a, b) => b.hits - a.hits;
  return {
    phones: Array.from(phones.values()).sort(byHits),
    emails: Array.from(emails.values()).sort(byHits)
  };
}

function render({ phones, emails }) {
  $('phoneCount').textContent = phones.length ? String(phones.length) : '';
  $('emailCount').textContent = emails.length ? String(emails.length) : '';

  const pl = $('phones');
  pl.innerHTML = '';
  if (!phones.length) pl.appendChild(emptyRow(t('noPhones')));
  for (const item of phones) {
    const btn = document.createElement('button');
    btn.className = 'round';
    btn.title = t('callWithHipcall', [item.display]);
    btn.setAttribute('aria-label', btn.title);
    btn.innerHTML = ICON.phone;
    btn.addEventListener('click', () => callNumber(item.dial));
    pl.appendChild(itemRow(item.display, 'num', item.dial, btn));
  }

  const el = $('emails');
  el.innerHTML = '';
  if (!emails.length) el.appendChild(emptyRow(t('noEmails')));
  for (const item of emails) {
    const a = document.createElement('a');
    a.className = 'round light';
    a.href = 'mailto:' + item.email;
    a.target = '_blank';
    a.title = t('writeEmail', [item.email]);
    a.setAttribute('aria-label', a.title);
    a.innerHTML = ICON.mail;
    el.appendChild(itemRow(item.email, 'mail', item.email, a));
  }
}

function itemRow(text, cls, copyValue, actionEl) {
  const li = document.createElement('li');
  li.className = 'item';
  const val = document.createElement('div');
  val.className = `val ${cls}`;
  val.textContent = text;
  val.title = text;

  const copy = document.createElement('button');
  copy.className = 'icon-btn';
  copy.title = t('copy');
  copy.setAttribute('aria-label', `${t('copy')}: ${text}`);
  copy.innerHTML = ICON.copy;
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(copyValue);
    copy.innerHTML = ICON.check;
    copy.classList.add('done');
    copy.title = t('copied');
    setTimeout(() => {
      copy.innerHTML = ICON.copy;
      copy.classList.remove('done');
      copy.title = t('copy');
    }, 1200);
  });

  li.append(val, copy, actionEl);
  return li;
}

function emptyRow(text) {
  const li = document.createElement('li');
  li.className = 'empty';
  li.textContent = text;
  return li;
}

function callNumber(number) {
  setStatus(t('toastCalling', [number]));
  chrome.runtime.sendMessage({ type: 'call', call: number }, (res) => {
    if (chrome.runtime.lastError || !res || !res.ok) {
      const reason = (chrome.runtime.lastError && chrome.runtime.lastError.message) || (res && res.error) || '';
      setStatus(t('toastCallFailed', [reason]), true);
      return;
    }
    window.close(); // the web phone comes to front anyway
  });
}

/* ==================================================================== */
/* SETTINGS — region, language, auto-dial                               */
/* ==================================================================== */

// Simplified national flags (public domain designs), drawn inline so they
// look the same on every OS (Windows has no emoji flags).
function starPoints(cx, cy, r, rotDeg = -90) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = (rotDeg + i * 36) * Math.PI / 180;
    const rr = i % 2 ? r * 0.382 : r;
    pts.push(`${(cx + rr * Math.cos(rad)).toFixed(2)},${(cy + rr * Math.sin(rad)).toFixed(2)}`);
  }
  return pts.join(' ');
}

const FLAGS = {
  tr: () => `<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#E30A17"/>
    <circle cx="11" cy="10" r="5" fill="#fff"/><circle cx="12.25" cy="10" r="4" fill="#E30A17"/>
    <polygon points="${starPoints(17.1, 10, 2.2, 180)}" fill="#fff"/></svg>`,
  eu: () => {
    let stars = '';
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 - 90) * Math.PI / 180;
      stars += `<polygon points="${starPoints(15 + 6 * Math.cos(a), 10 + 6 * Math.sin(a), 1)}" fill="#FFCC00"/>`;
    }
    return `<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#003399"/>${stars}</svg>`;
  },
  uk: () => `<svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice"><rect width="60" height="30" fill="#012169"/>
    <path d="M0,0 60,30M60,0 0,30" stroke="#fff" stroke-width="6"/>
    <path d="M0,0 60,30M60,0 0,30" stroke="#C8102E" stroke-width="2"/>
    <path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/>
    <path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></svg>`,
  us: () => {
    let stripes = '';
    for (let i = 0; i < 13; i += 2) stripes += `<rect y="${(i * 20 / 13).toFixed(2)}" width="30" height="${(20 / 13).toFixed(2)}" fill="#B22234"/>`;
    let dots = '';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) dots += `<circle cx="${1.3 + c * 2.4 + (r % 2) * 1.2}" cy="${1.4 + r * 2.4}" r=".45" fill="#fff"/>`;
    return `<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/>${stripes}
      <rect width="13" height="${(20 * 7 / 13).toFixed(2)}" fill="#3C3B6E"/>${dots}</svg>`;
  }
};

async function initGeneralSettings() {
  const settings = await HC_CONFIG.getSettings();

  // Account region
  const list = $('regionList');
  const buttons = HC_CONFIG.REGION_ORDER.map((id) => {
    const region = HC_CONFIG.region(id);
    const btn = document.createElement('button');
    btn.className = 'region';
    btn.setAttribute('role', 'radio');
    btn.dataset.value = id;
    btn.innerHTML = `<span class="flag">${FLAGS[id]()}</span>
      <span class="name"></span>${ICON.check.replace('<svg', '<svg class="check"')}`;
    btn.querySelector('.name').textContent = t(region.nameKey);
    // The server (hipcall.com.tr / hipcall.com) follows the region automatically.
    btn.title = new URL(region.webphoneUrl).hostname;
    btn.addEventListener('click', async () => {
      mark(id);
      await HC_CONFIG.setSettings({ region: id });
      chrome.runtime.sendMessage({ type: 'regionChanged' });
    });
    list.appendChild(btn);
    return btn;
  });
  const mark = (id) => buttons.forEach((b) => b.setAttribute('aria-checked', b.dataset.value === id));
  mark(settings.region);

  // Language → reopen the popup in the new language.
  $('language').value = settings.language || 'auto';
  $('language').addEventListener('change', async () => {
    await HC_CONFIG.setSettings({ language: $('language').value });
    location.reload();
  });

  // Auto-dial
  $('autoDial').checked = settings.autoDial;
  $('autoDial').addEventListener('change', () => {
    HC_CONFIG.setSettings({ autoDial: $('autoDial').checked });
  });
}

/* ==================================================================== */
/* SETTINGS — icons on this site                                        */
/* ==================================================================== */

let rule = null;
let markMode = null;

async function initSiteSettings() {
  if (!pageUrl) {
    $('siteSettings').hidden = true;
    return;
  }
  $('setSite').textContent = pageUrl.hostname.replace(/^www\./, '');
  rule = await HC_SITE_RULES.getRule(pageUrl.hostname);

  markMode = segmented($('modeSeg'), rule.mode, (mode) => {
    rule.mode = mode;
    saveRule();
  });

  // "Show on this page" switch: adds/removes the current page in the
  // include list (selected mode) or the exclude list (all pages mode).
  $('curToggle').addEventListener('change', () => {
    const path = HC_SITE_RULES.normPath(pageUrl.pathname);
    const on = $('curToggle').checked;
    if (rule.mode === 'all') setIn(rule.exclude, path, !on);
    else setIn(rule.include, path, on);
    saveRule();
  });

  $('addPageForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const path = HC_SITE_RULES.normPath($('addPageInput').value);
    if (!path) return;
    setIn(rule.mode === 'all' ? rule.exclude : rule.include, path, true);
    $('addPageInput').value = '';
    saveRule();
  });

  $('resetRule').addEventListener('click', async () => {
    await HC_SITE_RULES.resetRule(pageUrl.hostname);
    rule = await HC_SITE_RULES.getRule(pageUrl.hostname);
    markMode(rule.mode);
    renderSiteSettings();
  });

  renderSiteSettings();
}

function setIn(list, path, present) {
  const i = list.findIndex((p) => HC_SITE_RULES.normPath(p) === path);
  if (present && i < 0) list.push(path);
  if (!present && i >= 0) list.splice(i, 1);
}

async function saveRule() {
  renderSiteSettings();
  // The content script listens to storage changes → icons update live.
  await HC_SITE_RULES.setRule(pageUrl.hostname, rule);
}

function renderSiteSettings() {
  const all = rule.mode === 'all';
  const list = all ? rule.exclude : rule.include;
  $('modeHint').textContent = all ? t('modeAllHint') : t('modeSelectedHint');

  // Current page switch
  const path = HC_SITE_RULES.normPath(pageUrl.pathname);
  const enabled = HC_SITE_RULES.isEnabled(rule, path);
  const listed = list.some((p) => HC_SITE_RULES.normPath(p) === path);
  // Decided by another pattern (e.g. /blog/*) → the switch can't change it.
  const byPattern = all ? !enabled && !listed : enabled && !listed;
  $('curToggle').checked = enabled;
  $('curToggle').disabled = byPattern;
  const matching = byPattern ? list.find((p) => HC_SITE_RULES.matches(p, path)) : null;
  $('curPath').textContent = matching
    ? t('byPattern', [HC_SITE_RULES.label(path), matching])
    : HC_SITE_RULES.label(path);

  // Page list
  $('listTitle').textContent = all ? t('excludedPages') : t('includedPages');
  $('addPageInput').placeholder = all ? t('excludePlaceholder') : t('includePlaceholder');
  const box = $('pageList');
  box.innerHTML = '';
  for (const p of list) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const label = document.createElement('span');
    label.textContent = HC_SITE_RULES.label(p);
    label.title = p;
    const x = document.createElement('button');
    x.textContent = '×';
    x.title = t('remove');
    x.setAttribute('aria-label', `${t('remove')}: ${p}`);
    x.addEventListener('click', () => {
      list.splice(list.indexOf(p), 1);
      saveRule();
    });
    chip.append(label, x);
    box.appendChild(chip);
  }
  $('pageEmpty').textContent = list.length ? '' : (all ? t('noExcludedPages') : t('noIncludedPages'));
}

/* ==================================================================== */
/* Page scanner — injected into the page with chrome.scripting, so it   */
/* must be fully self-contained (no references to outer scope).         */
/* ==================================================================== */

async function scanPage(opts) {
  // Phone rules come from js/phone.js, injected right before this function.
  const PHONE = globalThis.HC_PHONE;
  const region = (opts && opts.region) || 'tr';
  const EMAIL_REGEX = /[a-z0-9._%+\-]+@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)*\.[a-z]{2,24}/gi;
  // Full-match check for a single address. NOT global: reusing the global
  // regex here would reset its lastIndex inside the scan loop.
  const EMAIL_EXACT = new RegExp('^' + EMAIL_REGEX.source + '$', 'i');
  const NOT_EMAIL_TLD = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|map|woff2?|ttf|mp4|webm)$/i;
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'IFRAME', 'HEAD', 'TITLE']);
  const CONTACT_LINK_RE =
    /(iletisim|iletişim|contact|kontakt|bize-?ula[sş]|ula[sş][iı]m|hakk[iı]m[iı]zda|about|[sş]ubeler|branches|magazalar|mağazalar|lokasyon|location|destek|support|musteri-?hizmet)/i;

  const phones = new Map();
  const emails = new Map();

  /** Adds a number. explicit: from a tel:/WhatsApp link or structured data. */
  function addPhone(raw, explicit = true) {
    const n = explicit ? PHONE.fromSelection(raw, region) : PHONE.normalize(raw, region);
    if (!n) return;
    const cur = phones.get(n.key);
    if (cur) cur.hits++; else phones.set(n.key, { ...n, hits: 1 });
  }

  function addEmail(raw) {
    let e = String(raw || '').trim().replace(/^mailto:/i, '').split('?')[0];
    try { e = decodeURIComponent(e); } catch (_) { /* ignore */ }
    e = e.toLowerCase().replace(/^[._\-]+|[._\-]+$/g, '');
    if (!EMAIL_EXACT.test(e) || NOT_EMAIL_TLD.test(e)) return;
    const cur = emails.get(e);
    if (cur) cur.hits++; else emails.set(e, { key: e, email: e, hits: 1 });
  }

  /** Decodes addresses hidden by Cloudflare e-mail protection. */
  function decodeCfEmail(hex) {
    try {
      const key = parseInt(hex.slice(0, 2), 16);
      let out = '';
      for (let i = 2; i < hex.length; i += 2) {
        out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
      }
      return out;
    } catch (_) {
      return '';
    }
  }

  /** Scans a whole document (the live page or a fetched page). */
  function scanDocument(doc) {
    const root = doc.body || doc.documentElement;
    if (!root) return;

    // 1) Links: tel:, callto:, sms:, WhatsApp, mailto:, Cloudflare-protected e-mail
    for (const a of root.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      let m;
      if ((m = href.match(/^\s*(?:tel|callto|sms):(.+)$/i))) {
        let v = m[1];
        try { v = decodeURIComponent(v); } catch (_) { /* ignore */ }
        addPhone(v.split(/[;,?]/)[0]);
      } else if ((m = href.match(/(?:wa\.me\/|whatsapp\.com\/send\/?\?(?:.*&)?phone=|whatsapp:\/\/send\?(?:.*&)?phone=)\+?(\d{8,15})/i))) {
        addPhone('+' + m[1]);
      } else if (/^\s*mailto:/i.test(href)) {
        href.replace(/^\s*mailto:/i, '').split('?')[0].split(/[,;]/).forEach(addEmail);
      } else if ((m = href.match(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/i))) {
        addEmail(decodeCfEmail(m[1]));
      }
    }
    for (const el of root.querySelectorAll('[data-cfemail]')) {
      addEmail(decodeCfEmail(el.getAttribute('data-cfemail')));
    }

    // 2) Attributes
    for (const el of root.querySelectorAll('[itemprop="telephone"], [data-phone], [data-tel], [data-telephone]')) {
      addPhone(el.getAttribute('content') || el.getAttribute('data-phone') ||
        el.getAttribute('data-tel') || el.getAttribute('data-telephone') || el.textContent);
    }
    for (const el of root.querySelectorAll('[itemprop="email"], [data-email]')) {
      addEmail(el.getAttribute('content') || el.getAttribute('data-email') || el.textContent);
    }

    // 3) JSON-LD (schema.org telephone / email)
    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const walk = (o) => {
          if (!o || typeof o !== 'object') return;
          if (Array.isArray(o)) return o.forEach(walk);
          for (const [k, v] of Object.entries(o)) {
            if (/^telephone$/i.test(k)) [].concat(v).forEach(addPhone);
            else if (/^email$/i.test(k)) [].concat(v).forEach(addEmail);
            else walk(v);
          }
        };
        walk(JSON.parse(s.textContent));
      } catch (_) { /* invalid JSON */ }
    }

    // 4) All text, hidden elements included (mobile menu, accordion, modal).
    //    Parts are joined with spaces so split numbers like
    //    "<span>0212</span> <span>123 45 67</span>" are found too.
    const parts = [];
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        for (let p = n.parentElement; p && p !== root; p = p.parentElement) {
          if (SKIP_TAGS.has(p.tagName.toUpperCase())) return NodeFilter.FILTER_REJECT;
        }
        return /\S/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    let n;
    while ((n = walker.nextNode())) parts.push(n.nodeValue.replace(/\s+/g, ' '));
    const text = parts.join(' ');

    for (const match of PHONE.findAll(text, region)) addPhone(match.raw, false);
    let m;
    EMAIL_REGEX.lastIndex = 0;
    while ((m = EMAIL_REGEX.exec(text)) !== null) addEmail(m[0]);
  }

  scanDocument(document);

  // 5) Contact / about / branches pages of the same site (top frame only).
  if (opts && opts.deep && window.top === window) {
    const here = location.origin + location.pathname;
    const urls = new Set();
    for (const a of document.querySelectorAll('a[href]')) {
      let u;
      try { u = new URL(a.href, location.href); } catch (_) { continue; }
      if (u.origin !== location.origin || !/^https?:$/.test(u.protocol)) continue;
      const key = u.origin + u.pathname;
      if (key === here || urls.has(key)) continue;
      // Pages are fetched with the user's cookies: never follow links that
      // could change something (sign out, delete, unsubscribe...).
      if (/(logout|log-out|signout|sign-out|cikis|çıkış|oturumu-kapat|delete|remove|unsubscribe|abonelik-iptal|\/sil\b|cancel|iptal)/i.test(u.pathname + u.search)) continue;
      if (u.search.length > 0) continue; // plain pages only
      let path = u.pathname;
      try { path = decodeURIComponent(path); } catch (_) { /* ignore */ }
      if (CONTACT_LINK_RE.test(path + ' ' + (a.textContent || '') + ' ' + (a.title || ''))) urls.add(key);
      if (urls.size >= 6) break;
    }

    await Promise.all(Array.from(urls).map(async (url) => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(url, { credentials: 'same-origin', signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok || !/html/i.test(res.headers.get('content-type') || '')) return;
        scanDocument(new DOMParser().parseFromString(await res.text(), 'text/html'));
      } catch (_) { /* unreachable */ }
    }));
  }

  return { phones: Array.from(phones.values()), emails: Array.from(emails.values()) };
}
