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
  check: '<svg viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zM8.34 17.34V10.1H5.93v7.24h2.41zM7.13 9.11a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zm11.21 8.23v-3.97c0-2.13-1.14-3.12-2.66-3.12a2.3 2.3 0 0 0-2.09 1.15V10.1h-2.41v7.24h2.41v-3.83c0-1 .19-1.98 1.44-1.98 1.23 0 1.25 1.15 1.25 2.05v3.76h2.06z"/></svg>',
  web: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.93 6h-2.95a15.65 15.65 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.93 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14a8.2 8.2 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4H4.26zm.81 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.99 7.99 0 0 1 5.07 16zm2.95-8H5.07a7.99 7.99 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.02 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14a16.5 16.5 0 0 0 0-4h3.38a8.2 8.2 0 0 1 0 4h-3.38z"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>',
  open: '<svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>',
  person: '<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
  building: '<svg viewBox="0 0 24 24"><path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>',
  task: '<svg viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  dot: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg>'
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
  initAccount();
  initFind();
  initActivities();
  initCompanyForm();

  $('openSettings').addEventListener('click', () => openSettings());
  $('closeSettings').addEventListener('click', () => closeSettings());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('panel-company').hidden) closeCompanyForm();
    else if (!$('panel-settings').hidden) closeSettings();
  });

  // Reopen where the user left (kept across browser restarts).
  const { popupTab, popupSettingsOpen } = await chrome.storage.local.get(['popupTab', 'popupSettingsOpen']).catch(() => ({}));
  showTab(popupTab === 'activities' ? 'activities' : 'find');
  if (popupSettingsOpen) openSettings();

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
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
    el.setAttribute('aria-label', el.title);
  });
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  $('panel-find').hidden = name !== 'find';
  $('panel-activities').hidden = name !== 'activities';
  if (name === 'activities') loadActivities(false);
  chrome.storage.local.set({ popupTab: name }).catch(() => {});
}

/** Settings open as a sheet over the tabs (gear button), remembered too. */
function openSettings() {
  $('panel-settings').hidden = false;
  $('closeSettings').focus();
  chrome.storage.local.set({ popupSettingsOpen: true }).catch(() => {});
}

function closeSettings() {
  $('panel-settings').hidden = true;
  $('openSettings').focus();
  chrome.storage.local.set({ popupSettingsOpen: false }).catch(() => {});
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
  if (linkedinKind(pageUrl)) return scanLinkedin();
  const id = ++scanId;

  $('rescan').disabled = true;
  setStatus(t('scanning'));
  try {
    // 1) Fast pass: the open page (+ iframes) → show right away.
    let result = await runScan(false);
    if (id !== scanId) return;
    render(result);
    if (id === 1) { restoreFind(); restoreDraft(); }

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

let lastScan = { phones: [], emails: [] };

function render({ phones, emails }) {
  lastScan = { phones, emails };
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
  },
  // Unpacked builds only (HC_CONFIG.IS_DEV): the desktop on localhost.
  local: () => `<svg viewBox="0 0 30 20"><rect width="30" height="20" rx="2" fill="#37474F"/>
    <path d="M11 6 7 10l4 4M19 6l4 4-4 4" stroke="#fff" stroke-width="1.8" fill="none"
      stroke-linecap="round" stroke-linejoin="round"/></svg>`
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
    btn.innerHTML = `<span class="flag">${FLAGS[id] ? FLAGS[id]() : ''}</span>
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
  if (HC_CONFIG.isHipcallSite(pageUrl.hostname)) {
    // No icons on Hipcall's own pages: nothing to set here.
    const box = $('siteSettings');
    if (box.querySelector('.hipcall-note')) return;
    [...box.children].forEach((c) => { if (c.tagName !== 'H2' && !c.classList.contains('site-name')) c.style.display = 'none'; });
    const note = document.createElement('p');
    note.classList.add('hipcall-note');
    note.className = 'sub';
    note.textContent = t('hipcallSiteNoIcons');
    box.appendChild(note);
    return;
  }
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

/* ==================================================================== */
/* HIPCALL ACCOUNT (OAuth sign-in, done by the service worker)          */
/* ==================================================================== */

let account = { available: false, signedIn: false, user: null };

function bg(type, data) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, data }, (res) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(res || { ok: false, error: 'no response' });
    });
  });
}

/** Turns a service-worker error code into a message for the user. */
function errorText(error) {
  const e = String(error || '');
  if (/SIGNED_OUT/.test(e)) return t('errSignedOut');
  if (/FORBIDDEN/.test(e)) return t('errForbidden');
  if (/SIGNIN_NOT_AVAILABLE/.test(e)) return t('signinNotAvailable');
  if (/SIGNIN_CANCELLED/.test(e)) return t('signinCancelled');
  if (/SIGNIN_DENIED/.test(e)) return t('signinDenied');
  if (/NEEDS_SCOPE/.test(e)) return t('needsWriteAccess');
  if (/invalid_scope/.test(e)) return t('errInvalidScope');
  if (/SIGNIN_TIMEOUT/.test(e)) return t('signinTimeout');
  if (/SIGNIN_STATE_MISMATCH/.test(e)) return t('errSigninState');
  if (/TOKEN_ERROR/.test(e)) return t('errToken', [detailOf(e, 'TOKEN_ERROR')]);
  if (/SIGNIN_ERROR/.test(e)) return t('errSignin', [detailOf(e, 'SIGNIN_ERROR')]);
  if (/NETWORK|Failed to fetch/.test(e)) return t('errNetwork');
  if (/RATE_LIMITED/.test(e)) return t('errRateLimited');
  if (/NOT_FOUND/.test(e)) return t('errNotFound');
  if (/SERVER_ERROR/.test(e)) return t('errServer');
  if (/API_ERROR/.test(e)) return t('errApi', [humanMessage(detailOf(e, 'API_ERROR'))]);
  return t('errGeneric', [e.replace(/^Error:\s*/, '')]);
}

function detailOf(e, code) {
  return e.slice(e.indexOf(code) + code.length).replace(/^[:\s]+/, '') || '—';
}

/**
 * Hipcall answers validation errors in English (Ecto wording); say them in
 * the user's language. Unknown messages are shown as they are, never cut.
 */
const API_MESSAGES = [
  [/^can'?t be blank$/i, 'vBlank'],
  [/^has already been taken$/i, 'vTaken'],
  [/^is invalid$/i, 'vInvalid'],
  [/^has invalid format$/i, 'vFormat'],
  [/^is not a valid (phone|number)/i, 'vPhone'],
  [/^is not a valid e-?mail/i, 'vEmail'],
  [/^should be at least (\d+) character/i, 'vMinLen'],
  [/^should be at most (\d+) character/i, 'vMaxLen'],
  [/^should have at most (\d+) item/i, 'vMaxItems'],
  [/^should have at least (\d+) item/i, 'vMinItems'],
  [/^is not included in the list$/i, 'vNotInList'],
  [/^does not exist$/i, 'vNotExist'],
  [/^is reserved$/i, 'vReserved'],
  [/^must be (?:greater than|less than|equal to)/i, 'vRange'],
  [/^(unknown|invalid) (custom field|slug)/i, 'vUnknownField'],
  [/^(is )?inactive/i, 'vInactive']
];

function humanMessage(m) {
  if (m === 'min3') return t('errNameShort');
  if (Array.isArray(m)) return m.map(humanMessage).join(' ');
  if (m && typeof m === 'object') return Object.values(m).map(humanMessage).join(' ');
  const s = String(m == null ? '' : m).trim();
  for (const [re, key] of API_MESSAGES) {
    const hit = s.match(re);
    if (hit) return t(key, hit.slice(1).filter((x) => /^\d+$/.test(x)));
  }
  return s ? s.charAt(0).toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? '' : '.') : t('vInvalid');
}

/**
 * Validation errors → [{ path: ['phones', 0, 'number'], messages: [...] }].
 * Accepts { field: [msg] }, { phones: [{}, { number: [msg] }] },
 * { "phones.0.number": [msg] } and { custom_fields: { slug: [msg] } }.
 */
function flattenErrors(errors, path = [], out = []) {
  if (errors == null) return out;
  if (typeof errors === 'string') { out.push({ path, messages: [errors] }); return out; }
  if (Array.isArray(errors)) {
    if (errors.every((x) => typeof x === 'string')) { if (errors.length) out.push({ path, messages: errors }); return out; }
    errors.forEach((x, i) => flattenErrors(x, path.concat(i), out));
    return out;
  }
  if (typeof errors === 'object') {
    for (const [k, v] of Object.entries(errors)) {
      const parts = k.split(/[.[\]]+/).filter(Boolean).map((p) => (/^\d+$/.test(p) ? Number(p) : p));
      flattenErrors(v, path.concat(parts), out);
    }
  }
  return out;
}

async function initAccount() {
  await refreshAccount();
  // Sign-in finishes in the service worker (the popup may be closed meanwhile).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'auth' in changes) refreshAccount();
    if (area === 'sync' && 'region' in changes) refreshAccount();
  });
}

async function refreshAccount() {
  const res = await bg('authStatus');
  account = res.ok ? res.data : { available: false, signedIn: false, user: null };
  renderAccount();
  renderActivitiesGate();
  // LinkedIn view: search Hipcall as soon as we know the user is signed in.
  if (linkedinData) {
    if (account.signedIn && !linkedinHipcall) lookupLinkedin();
    else renderLinkedinHipcall();
  }
}

/** Sign-in button; onSuccess runs after a successful sign-in (e.g. retry the action). */
function signinButton(label = t('signIn'), onSuccess, before) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'primary signin-btn';
  btn.textContent = label;
  btn.addEventListener('click', async () => {
    const old = btn.nextElementSibling;
    if (old && old.classList.contains('err')) old.remove();
    btn.disabled = true;
    btn.textContent = t('signingIn');
    if (before) await before();
    const res = await bg('authLogin');
    btn.disabled = false;
    btn.textContent = label;
    if (!res.ok) {
      const err = document.createElement('div');
      err.className = 'err';
      err.textContent = errorText(res.error);
      btn.after(err);
    } else {
      btn.remove();
    }
    await refreshAccount();
    if (res.ok && onSuccess) onSuccess();
  });
  return btn;
}

function renderAccount() {
  const card = $('accountCard');
  card.innerHTML = '';
  card.className = 'card account';

  if (!account.signedIn) {
    card.classList.add('signed-out');
    const p = document.createElement('p');
    p.textContent = account.available ? t('signinHint') : t('signinNotAvailable');
    card.appendChild(p);
    if (account.available) card.appendChild(signinButton());
    if (account.lastError) card.appendChild(errLine(account.lastError));
    return;
  }

  const u = account.user || {};
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  if (u.avatarUrl && /^https:\/\//.test(u.avatarUrl)) {
    const img = document.createElement('img');
    img.src = u.avatarUrl;
    img.alt = '';
    img.onerror = () => { img.remove(); avatar.textContent = initials(u.name || u.email); };
    avatar.appendChild(img);
  } else {
    avatar.textContent = initials(u.name || u.email);
  }
  const who = document.createElement('div');
  who.className = 'who';
  const b = document.createElement('b');
  b.textContent = u.name || t('signedIn');
  const small = document.createElement('small');
  small.textContent = [u.email, u.account].filter(Boolean).join(' · ');
  who.append(b, small);

  const out = document.createElement('button');
  out.className = 'danger-link';
  out.textContent = t('signOut');
  out.addEventListener('click', async () => {
    await bg('authLogout');
    refreshAccount();
  });
  card.append(avatar, who, out);
  if (account.lastError) {
    card.classList.add('wrap');
    card.appendChild(errLine(account.lastError));
  }
}

function errLine(error) {
  const d = document.createElement('div');
  d.className = 'err';
  d.textContent = errorText(error);
  return d;
}

function initials(s) {
  return String(s || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

/* ==================================================================== */
/* FIND — look the page's numbers, e-mails and website up in Hipcall    */
/* ==================================================================== */

function initFind() {
  $('findBtn').addEventListener('click', runFind);
}

async function runFind() {
  const status = $('findStatus');
  const box = $('findResults');
  box.innerHTML = '';

  if (!account.signedIn) {
    status.textContent = account.available ? t('findNeedsSignin') : t('signinNotAvailable');
    if (account.available) box.appendChild(signinButton());
    return;
  }

  $('findBtn').disabled = true;
  status.classList.remove('is-error');
  status.textContent = t('findSearching');
  const res = await bg('crmFind', {
    phones: lastScan.phones.map((p) => p.dial),
    emails: lastScan.emails.map((e) => e.email),
    url: pageUrl ? pageUrl.href : ''
  });
  $('findBtn').disabled = false;

  if (!res.ok) {
    status.textContent = errorText(res.error);
    status.classList.add('is-error');
    if (/SIGNED_OUT/.test(res.error)) refreshAccount();
    return;
  }

  // Keep the result for this site while the browser is open (shown again next time).
  if (pageUrl) chrome.storage.session.set({ [findKey()]: { at: Date.now(), data: res.data } }).catch(() => {});
  renderFindResults(res.data);
}

function findKey() {
  return 'find:' + pageUrl.hostname.replace(/^www\./, '');
}

/** Shows the last search for this site when the popup opens again. */
async function restoreFind() {
  if (!pageUrl) return;
  const key = findKey();
  const { [key]: saved } = await chrome.storage.session.get(key).catch(() => ({}));
  if (!saved || !saved.data) return;
  const st = await bg('authStatus');
  if (!st.ok || !st.data.signedIn) return; // signed out meanwhile: nothing to show
  renderFindResults(saved.data, saved.at);
}

function renderFindResults(data, at) {
  const status = $('findStatus');
  const box = $('findResults');
  box.innerHTML = '';
  status.classList.remove('is-error');
  const { contacts, companies, searched } = data;
  status.textContent = t('findSearched', [String(searched.phones), String(searched.emails), searched.site || '—']) +
    (at ? ' ' + t('findSavedAt', [relativeTime(new Date(at).toISOString())]) : '');
  const siteKnown = companies.some((c) => c.matchedBy.includes('website'));
  if (!contacts.length && !companies.length) {
    const nf = document.createElement('div');
    nf.className = 'not-found';
    nf.textContent = t('findNothing');
    box.appendChild(nf);
    box.appendChild(addCompanyAction(false));
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'records';
  if (companies.length) {
    wrap.appendChild(heading(t('findCompanies', [String(companies.length)])));
    companies.forEach((c) => wrap.appendChild(recordCard(c, 'company')));
  }
  if (contacts.length) {
    wrap.appendChild(heading(t('findContacts', [String(contacts.length)])));
    contacts.forEach((c) => wrap.appendChild(recordCard(c, 'contact')));
  }
  box.appendChild(wrap);
  // A company is already in Hipcall → no "add" button.
  if (!companies.length) box.appendChild(addCompanyAction(siteKnown));
}

/** "Add as a company" under the FIND results (soft when the site is already known). */
function addCompanyAction(siteKnown) {
  const row = document.createElement('div');
  row.className = 'find-actions';
  const btn = document.createElement('button');
  btn.className = siteKnown ? 'soft' : 'primary';
  btn.id = 'addCompanyBtn';
  btn.textContent = siteKnown ? t('addCompanyAnyway') : t('addCompany');
  btn.addEventListener('click', openCompanyForm);
  row.appendChild(btn);
  return row;
}

function heading(text) {
  const h = document.createElement('h3');
  h.textContent = text;
  return h;
}

function recordCard(r, kind) {
  const el = document.createElement('div');
  el.className = 'record';

  const top = document.createElement('div');
  top.className = 'top';
  const icon = document.createElement('div');
  icon.className = 'kind';
  icon.innerHTML = kind === 'company' ? ICON.building : ICON.person;
  const title = document.createElement('div');
  title.className = 'title';
  const b = document.createElement('b');
  b.textContent = r.name;
  const small = document.createElement('small');
  small.textContent = [kind === 'contact' ? r.company : String(r.website || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), r.owner && t('findOwner', [r.owner]), r.lifeCycle]
    .filter(Boolean).join(' · ');
  title.append(b, small);
  top.append(icon, title);
  el.appendChild(top);

  const lines = document.createElement('div');
  lines.className = 'lines';
  r.phones.slice(0, 3).forEach((n) => {
    const line = document.createElement('div');
    line.className = 'line';
    const s = document.createElement('span');
    s.textContent = n;
    const call = document.createElement('button');
    call.className = 'round';
    call.title = t('callWithHipcall', [n]);
    call.setAttribute('aria-label', call.title);
    call.innerHTML = ICON.phone;
    call.addEventListener('click', () => callNumber(n));
    line.append(s, call);
    lines.appendChild(line);
  });
  r.emails.slice(0, 2).forEach((m) => {
    const line = document.createElement('div');
    line.className = 'line';
    const s = document.createElement('span');
    s.textContent = m;
    line.appendChild(s);
    lines.appendChild(line);
  });
  if (lines.children.length) el.appendChild(lines);

  const tags = document.createElement('div');
  tags.className = 'tags';
  r.matchedBy.forEach((why) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = t('match_' + why);
    tags.appendChild(tag);
  });
  el.appendChild(tags);
  return el;
}

/* ==================================================================== */
/* ACTIVITIES — GET /api/v3/me/activities                               */
/* ==================================================================== */

let activitiesCursor = null;
let activitiesLoaded = false;
let activitiesLoading = false;

function initActivities() {
  $('activitiesRefresh').addEventListener('click', () => loadActivities(true));
  $('activitiesMore').addEventListener('click', () => loadActivities(false, true));
}

function renderActivitiesGate() {
  const gate = $('activitiesSignin');
  $('activitiesArea').hidden = !account.signedIn;
  gate.hidden = account.signedIn;
  if (account.signedIn) {
    if (!$('panel-activities').hidden) loadActivities(false);
    return;
  }
  activitiesLoaded = false;
  $('activitiesList').innerHTML = '';
  gate.innerHTML = '';
  const h = document.createElement('h3');
  h.textContent = t('activitiesTitle');
  const p = document.createElement('p');
  p.textContent = account.available ? t('activitiesNeedsSignin') : t('signinNotAvailable');
  gate.append(h, p);
  if (account.available) gate.appendChild(signinButton());
}

async function loadActivities(reset, more = false) {
  if (!account.signedIn || activitiesLoading) return;
  if (activitiesLoaded && !reset && !more) return;
  if (reset) { activitiesCursor = null; $('activitiesList').innerHTML = ''; }
  activitiesLoading = true;
  $('activitiesStatus').classList.remove('is-error');
  $('activitiesStatus').textContent = t('loading');
  const res = await bg('crmActivities', { cursor: more ? activitiesCursor : undefined, limit: 20 });
  activitiesLoading = false;

  if (!res.ok) {
    $('activitiesStatus').classList.add('is-error');
    $('activitiesStatus').textContent = errorText(res.error);
    if (/SIGNED_OUT/.test(res.error)) refreshAccount();
    return;
  }
  activitiesLoaded = true;
  activitiesCursor = res.data.nextCursor;
  $('activitiesMore').hidden = !activitiesCursor;
  const list = $('activitiesList');
  res.data.items.forEach((a) => list.appendChild(activityRow(a)));
  $('activitiesStatus').textContent = list.children.length ? '' : t('activitiesEmpty');
}

function activityTitle(a) {
  const lang = HC_I18N.current();
  if (a.names && typeof a.names === 'object') {
    const n = a.names[lang] || a.names.en || a.names.tr;
    if (typeof n === 'string' && n) return n;
  }
  const key = 'act_' + a.type.replace(/[^a-z0-9]+/gi, '_');
  const known = t(key);
  if (known) return known;
  return a.type.replace(/[._]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) || t('activity');
}

function activityIcon(a) {
  const type = a.type + ' ' + a.group;
  if (/call/.test(type)) return { svg: ICON.phone, cls: /missed|no_answer|unanswered|failed/.test(type) ? 'missed' : 'call' };
  if (/note|comment/.test(type)) return { svg: ICON.note, cls: '' };
  if (/conversation|message|chat|sms|whatsapp/.test(type)) return { svg: ICON.chat, cls: '' };
  if (/task/.test(type)) return { svg: ICON.task, cls: '' };
  if (/company/.test(type)) return { svg: ICON.building, cls: '' };
  if (/contact/.test(type)) return { svg: ICON.person, cls: '' };
  return { svg: ICON.dot, cls: '' };
}

function relativeTime(iso) {
  const time = Date.parse(iso);
  if (!time) return '';
  const rtf = new Intl.RelativeTimeFormat(HC_I18N.current(), { numeric: 'auto' });
  const diff = (time - Date.now()) / 1000;
  const steps = [[60, 'second'], [3600, 'minute'], [86400, 'hour'], [604800, 'day'], [2629800, 'week'], [31557600, 'month']];
  for (const [limit, unit] of steps) {
    if (Math.abs(diff) < limit) {
      const size = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2629800 }[unit];
      return rtf.format(Math.round(diff / size), unit);
    }
  }
  return new Date(time).toLocaleDateString(HC_I18N.current());
}

function activityRow(a) {
  const li = document.createElement('li');
  const { svg, cls } = activityIcon(a);
  const dot = document.createElement('div');
  dot.className = 'dot ' + cls;
  dot.innerHTML = svg;

  const body = document.createElement('div');
  body.className = 'body';
  const b = document.createElement('b');
  b.textContent = activityTitle(a);
  body.appendChild(b);
  const about = [a.contact, a.company, a.deal].filter(Boolean).join(' · ');
  if (about) {
    const s = document.createElement('div');
    s.className = 'about';
    s.textContent = about;
    body.appendChild(s);
  }
  const text = a.content || a.detail;
  if (text) {
    const p = document.createElement('p');
    p.textContent = text;
    body.appendChild(p);
  }

  const when = document.createElement('div');
  when.className = 'when';
  when.textContent = relativeTime(a.occurredAt);
  when.title = a.occurredAt ? new Date(a.occurredAt).toLocaleString(HC_I18N.current()) : '';
  if (a.actor) when.title += (when.title ? ' · ' : '') + a.actor;
  li.append(dot, body, when);
  return li;
}

/* ==================================================================== */
/* ADD COMPANY — POST /api/v3/companies, prefilled from the page        */
/* ==================================================================== */

const MAX_ITEMS = 6; // Hipcall accepts at most 6 phones and 6 e-mails per company
const EMPLOYEE_SIZES = ['1', '2_5', '6_10', '11_25', '26_50', '51_200', '201_1000', '1001_10000', '10001_more'];
const ICON_REMOVE = '<svg viewBox="0 0 24 24"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

// Calling codes → ISO country (longest prefix wins). Hipcall needs a country per phone.
const CALLING_CODES = {
  1: 'US', 7: 'RU', 20: 'EG', 27: 'ZA', 30: 'GR', 31: 'NL', 32: 'BE', 33: 'FR', 34: 'ES', 36: 'HU', 39: 'IT',
  40: 'RO', 41: 'CH', 43: 'AT', 44: 'GB', 45: 'DK', 46: 'SE', 47: 'NO', 48: 'PL', 49: 'DE', 52: 'MX', 55: 'BR',
  61: 'AU', 81: 'JP', 82: 'KR', 86: 'CN', 90: 'TR', 91: 'IN', 92: 'PK', 98: 'IR', 212: 'MA', 213: 'DZ', 216: 'TN',
  351: 'PT', 352: 'LU', 353: 'IE', 354: 'IS', 356: 'MT', 357: 'CY', 358: 'FI', 359: 'BG', 370: 'LT', 371: 'LV',
  372: 'EE', 373: 'MD', 380: 'UA', 381: 'RS', 382: 'ME', 383: 'XK', 385: 'HR', 386: 'SI', 387: 'BA', 389: 'MK',
  355: 'AL', 420: 'CZ', 421: 'SK', 961: 'LB', 962: 'JO', 963: 'SY', 964: 'IQ', 965: 'KW', 966: 'SA', 968: 'OM',
  971: 'AE', 972: 'IL', 973: 'BH', 974: 'QA', 993: 'TM', 994: 'AZ', 995: 'GE', 996: 'KG', 998: 'UZ'
};
const REGION_COUNTRY = { tr: 'TR', uk: 'GB', us: 'US', eu: '' };

function countryFor(number, region) {
  const s = String(number).trim();
  let d = s.replace(/\D/g, '');
  if (s.startsWith('+') || s.startsWith('00')) {
    if (s.startsWith('00')) d = d.slice(2);
    for (const len of [3, 2, 1]) {
      const cc = CALLING_CODES[d.slice(0, len)];
      if (cc) return cc;
    }
    return '';
  }
  return REGION_COUNTRY[region] || 'TR';
}

let companyRegion = 'tr';

function initCompanyForm() {
  $('closeCompany').addEventListener('click', closeCompanyForm);
  $('cancelCompany').addEventListener('click', closeCompanyForm);
  $('cAddPhone').addEventListener('click', () => { addPhoneRow({ number: '', country: REGION_COUNTRY[companyRegion] || 'TR' }, true); });
  $('cAddEmail').addEventListener('click', () => { addEmailRow('', true); });
  $('companyForm').addEventListener('submit', (e) => { e.preventDefault(); saveCompany(); });
  // Typing in a field clears its error.
  $('companyForm').addEventListener('input', (e) => {
    const field = e.target.closest('.field');
    if (!field) return;
    field.querySelectorAll('.field-err').forEach((x) => { x.textContent = ''; });
    e.target.classList.remove('invalid');
  });

  const sel = $('cEmployees');
  const none = document.createElement('option');
  none.value = '';
  none.textContent = t('employeesUnknown');
  sel.appendChild(none);
  EMPLOYEE_SIZES.forEach((v) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = t('employees_' + v);
    sel.appendChild(o);
  });
}

/** Runs in the page: name, description, LinkedIn, phones and e-mails it declares. */
function collectCompanyInfo() {
  const out = { name: '', description: '', linkedin: '', phones: [], emails: [], origin: location.origin };
  const meta = (sel) => {
    const el = document.querySelector(sel);
    return el ? String(el.getAttribute('content') || '').trim() : '';
  };
  const isLinkedin = (u) => /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(company|school|showcase)\/[^/?#]+/i.test(u || '');

  // schema.org Organization in JSON-LD (most company sites have one)
  const orgs = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const type = [].concat(node['@type'] || []).join(' ');
    if (/Organi[sz]ation|Corporation|Business|Company|Store|Agency|Service|Hotel|Restaurant|School|Clinic|Hospital/i.test(type)) orgs.push(node);
    if (node['@graph']) visit(node['@graph']);
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try { visit(JSON.parse(s.textContent)); } catch (e) { /* invalid JSON-LD */ }
  });
  for (const o of orgs) {
    if (!out.name && typeof o.name === 'string') out.name = o.name.trim();
    if (!out.description && typeof o.description === 'string') out.description = o.description.trim();
    [].concat(o.sameAs || []).forEach((u) => { if (!out.linkedin && isLinkedin(u)) out.linkedin = u; });
    [].concat(o.telephone || []).forEach((p) => { if (typeof p === 'string') out.phones.push(p.trim()); });
    [].concat(o.contactPoint || []).forEach((c) => {
      if (c && typeof c.telephone === 'string') out.phones.push(c.telephone.trim());
      if (c && typeof c.email === 'string') out.emails.push(c.email.replace(/^mailto:/i, '').trim());
    });
    [].concat(o.email || []).forEach((m) => { if (typeof m === 'string') out.emails.push(m.replace(/^mailto:/i, '').trim()); });
  }

  if (!out.name) out.name = meta('meta[property="og:site_name"]') || meta('meta[name="application-name"]');
  if (!out.name) {
    // "Contact | Acme Ltd" → the part that looks like the domain, else the shortest part
    const parts = document.title.split(/\s+[|–—·:-]\s+/).map((p) => p.trim()).filter(Boolean);
    const label = location.hostname.replace(/^www\./, '').split('.')[0].toLowerCase();
    const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]/g, '');
    out.name = parts.find((p) => plain(p).includes(label) || label.includes(plain(p))) ||
      parts.slice().sort((a, b) => a.length - b.length)[0] || '';
  }
  if (!out.description) out.description = meta('meta[name="description"]') || meta('meta[property="og:description"]');
  if (!out.linkedin) {
    const a = Array.from(document.querySelectorAll('a[href*="linkedin.com/"]')).find((x) => isLinkedin(x.href));
    if (a) out.linkedin = a.href.split(/[?#]/)[0];
  }
  return out;
}

async function openCompanyForm() {
  try {
    await refreshAccount();
    if (!account.signedIn) { runFind(); return; }
    await fillCompanyForm();
  } catch (e) {
    console.error('[Hipcall] add company form:', e);
    $('findStatus').textContent = errorText(e && e.message);
  }
}

/** Opens the form filled from the page, or from a saved draft (after a sign-in). */
async function fillCompanyForm(draft) {
  ({ region: companyRegion } = await HC_CONFIG.getSettings());
  if (draft) {
    clearCompanyErrors();
    $('companyStatus').textContent = '';
    $('companyStatus').className = 'form-status';
    $('cName').value = draft.name || '';
    $('cWebsite').value = draft.websiteUrl || '';
    $('cLinkedin').value = draft.linkedinUrl || '';
    $('cCustomUrl').value = draft.customUrl || '';
    $('cEmployees').value = draft.employeeSize || '';
    $('cDescription').value = draft.description || '';
    $('cPhones').innerHTML = '';
    (draft.phones || []).forEach((p) => addPhoneRow(p));
    $('cEmails').innerHTML = '';
    (draft.emails || []).forEach((m) => addEmailRow(m));
    refreshLimits();
    await renderCustomFields(draft.customFields || {});
    showCompanySheet();
    return;
  }

  let info = { name: '', description: '', linkedin: '', phones: [], emails: [], origin: pageUrl ? pageUrl.origin : '' };
  try {
    const [frame] = await chrome.scripting.executeScript({ target: { tabId: activeTab.id }, func: collectCompanyInfo });
    if (frame && frame.result) info = frame.result;
  } catch (e) {
    console.warn('[Hipcall] page details not available:', e);
  }

  clearCompanyErrors();
  $('companyStatus').textContent = '';
  $('companyStatus').className = 'form-status';
  $('cName').value = info.name.slice(0, 255);
  $('cWebsite').value = info.origin || '';
  $('cLinkedin').value = info.linkedin || '';
  $('cCustomUrl').value = '';
  $('cEmployees').value = '';
  $('cDescription').value = (info.description || '').slice(0, 2000);

  // Every number and e-mail found on the page (scan + structured data), no duplicates.
  $('cPhones').innerHTML = '';
  const seen = new Set();
  [...lastScan.phones.map((p) => p.dial), ...info.phones].forEach((n) => {
    const key = String(n).replace(/\D/g, '').replace(/^(00|0)/, '');
    if (key.length < 3 || [...seen].some((k) => k.endsWith(key) || key.endsWith(k))) return;
    seen.add(key);
    // Turkish national numbers (0212…) go to Hipcall as E.164 (+90212…).
    const tr = String(n).replace(/[^\d+]/g, '');
    const number = /^0[2-58]\d{9}$/.test(tr) ? '+90' + tr.slice(1) : n;
    addPhoneRow({ number, country: countryFor(number, companyRegion) });
  });
  $('cEmails').innerHTML = '';
  const seenMail = new Set();
  [...lastScan.emails.map((e) => e.email), ...info.emails].forEach((m) => {
    const v = String(m).trim().toLowerCase();
    if (!v || seenMail.has(v)) return;
    seenMail.add(v);
    addEmailRow(v);
  });
  refreshLimits();
  await renderCustomFields({});
  showCompanySheet();
}

/* ---- Account-defined fields: required ones must be filled on create ---- */

let customDefs = null; // loaded once per popup

async function renderCustomFields(values) {
  const box = $('cCustom');
  box.innerHTML = '';
  if (!customDefs) {
    const res = await bg('crmCompanyFields');
    if (!res.ok) {
      // Not fatal: a required field the API names on save is added to the form then.
      console.warn('[Hipcall] custom fields not available:', res.error);
      const note = document.createElement('p');
      note.className = 'cf-note';
      note.textContent = t('customFieldsUnavailable', [errorText(res.error)]);
      box.appendChild(note);
      customDefs = [];
      return;
    }
    customDefs = res.data;
  }
  if (!customDefs.length) return;

  const required = customDefs.filter((f) => f.required);
  const optional = customDefs.filter((f) => !f.required);
  required.forEach((f) => box.appendChild(customFieldInput(f, values[f.slug])));
  if (optional.length) {
    const more = document.createElement('details');
    more.className = 'more-fields';
    if (optional.some((f) => values[f.slug] != null && values[f.slug] !== '')) more.open = true;
    const sum = document.createElement('summary');
    sum.textContent = t('moreFields', [String(optional.length)]);
    more.appendChild(sum);
    optional.forEach((f) => more.appendChild(customFieldInput(f, values[f.slug])));
    box.appendChild(more);
  }
}

function customFieldInput(f, value) {
  const wrap = document.createElement(f.type === 'boolean' || f.type === 'multi_select' ? 'div' : 'label');
  wrap.className = 'field custom';
  wrap.dataset.slug = f.slug;
  wrap.dataset.type = f.type;
  const label = document.createElement('span');
  label.textContent = f.name + (f.required ? ' *' : '');
  wrap.appendChild(label);

  let input;
  if (f.type === 'dropdown') {
    input = document.createElement('select');
    const none = document.createElement('option');
    none.value = '';
    none.textContent = t('choose');
    input.appendChild(none);
    (f.options || []).forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      input.appendChild(opt);
    });
    input.value = typeof value === 'string' ? value : '';
    const sw = document.createElement('div');
    sw.className = 'select-wrap';
    sw.appendChild(input);
    wrap.appendChild(sw);
  } else if (f.type === 'multi_select') {
    const list = document.createElement('div');
    list.className = 'checks';
    const chosen = Array.isArray(value) ? value : [];
    (f.options || []).forEach((o) => {
      const l = document.createElement('label');
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.value = o;
      c.checked = chosen.includes(o);
      l.append(c, document.createTextNode(' ' + o));
      list.appendChild(l);
    });
    wrap.appendChild(list);
  } else if (f.type === 'boolean') {
    const l = document.createElement('label');
    l.className = 'check-line';
    input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value === true;
    l.append(input, document.createTextNode(' ' + t('yes')));
    wrap.appendChild(l);
  } else {
    input = document.createElement('input');
    input.type = f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime-local' : 'text';
    if (f.type === 'number') input.inputMode = f.numberType === 'integer' ? 'numeric' : 'decimal';
    input.value = value == null ? '' : String(value);
    wrap.appendChild(input);
  }
  if (input) input.classList.add('cf-input');

  const err = document.createElement('em');
  err.className = 'field-err';
  err.dataset.for = 'cf:' + f.slug;
  wrap.appendChild(err);
  return wrap;
}

/** Raw form values (for a draft). */
function customRawValues() {
  const out = {};
  document.querySelectorAll('#cCustom .field.custom').forEach((w) => {
    const slug = w.dataset.slug;
    if (w.dataset.type === 'multi_select') out[slug] = Array.from(w.querySelectorAll('input:checked')).map((c) => c.value);
    else if (w.dataset.type === 'boolean') out[slug] = w.querySelector('input').checked;
    else out[slug] = w.querySelector('.cf-input').value;
  });
  return out;
}

/** Values in the API's types; also checks required ones. Returns { values, missing }. */
function customValues() {
  const values = {};
  const missing = [];
  document.querySelectorAll('#cCustom .field.custom').forEach((w) => {
    const def = (customDefs || []).find((f) => f.slug === w.dataset.slug);
    if (!def) return;
    let v;
    if (def.type === 'multi_select') {
      v = Array.from(w.querySelectorAll('input:checked')).map((c) => c.value);
      if (!v.length) v = undefined;
    } else if (def.type === 'boolean') {
      v = w.querySelector('input').checked;
    } else {
      const raw = w.querySelector('.cf-input').value.trim();
      if (!raw) v = undefined;
      else if (def.type === 'number') {
        const n = Number(raw.replace(',', '.'));
        if (!Number.isFinite(n)) { missing.push({ slug: def.slug, msg: t('errNumber') }); return; }
        v = def.numberType === 'decimal' ? String(n) : n;
      } else if (def.type === 'datetime') {
        const d = new Date(raw);
        v = isNaN(d) ? raw : d.toISOString();
      } else v = raw;
    }
    if (v === undefined) { if (def.required) missing.push({ slug: def.slug, msg: t('errRequired') }); return; }
    values[def.slug] = v;
  });
  return { values, missing };
}

function showCompanySheet() {
  const owner = $('cOwner');
  owner.innerHTML = '';
  const av = document.createElement('div');
  av.className = 'avatar';
  av.textContent = initials((account.user && (account.user.name || account.user.email)) || '');
  const nm = document.createElement('span');
  nm.textContent = (account.user && account.user.name) || t('signedIn');
  owner.append(av, nm);

  $('panel-company').hidden = false;
  $('panel-company').querySelector('.sheet-body').scrollTop = 0;
  $('cName').focus();
}

function closeCompanyForm() {
  $('panel-company').hidden = true;
  const btn = $('addCompanyBtn');
  if (btn) btn.focus();
}

function removeButton(li) {
  const rm = document.createElement('button');
  rm.type = 'button';
  rm.className = 'rm';
  rm.title = t('remove');
  rm.setAttribute('aria-label', rm.title);
  rm.innerHTML = ICON_REMOVE;
  rm.addEventListener('click', () => { li.remove(); refreshLimits(); });
  return rm;
}

function addPhoneRow({ number, country }, focus) {
  const li = document.createElement('li');
  const num = document.createElement('input');
  num.type = 'text';
  num.className = 'num';
  num.value = number;
  num.maxLength = 40;
  num.inputMode = 'tel';
  num.setAttribute('aria-label', t('phones'));
  const cc = document.createElement('input');
  cc.type = 'text';
  cc.className = 'cc';
  cc.value = country || '';
  cc.maxLength = 2;
  cc.placeholder = 'TR';
  cc.title = t('countryCode');
  cc.setAttribute('aria-label', cc.title);
  li.append(num, cc, removeButton(li));
  $('cPhones').appendChild(li);
  refreshLimits();
  if (focus) num.focus();
}

function addEmailRow(email, focus) {
  const li = document.createElement('li');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'mail';
  input.value = email;
  input.maxLength = 254;
  input.inputMode = 'email';
  input.setAttribute('aria-label', t('emails'));
  li.append(input, removeButton(li));
  $('cEmails').appendChild(li);
  refreshLimits();
  if (focus) input.focus();
}

/** Only the first 6 rows are sent; the rest are shown struck through. */
function refreshLimits() {
  [['cPhones', 'cPhonesCount', 'cAddPhone'], ['cEmails', 'cEmailsCount', 'cAddEmail']].forEach(([listId, countId, addId]) => {
    const rows = Array.from($(listId).children);
    rows.forEach((li, i) => {
      li.classList.toggle('off', i >= MAX_ITEMS);
      li.title = i >= MAX_ITEMS ? t('overLimit', [String(MAX_ITEMS)]) : '';
    });
    $(countId).textContent = rows.length > MAX_ITEMS
      ? t('limitOver', [String(rows.length), String(MAX_ITEMS)])
      : rows.length ? `${rows.length}/${MAX_ITEMS}` : '';
    $(addId).disabled = rows.length >= MAX_ITEMS;
  });
}

function clearCompanyErrors() {
  document.querySelectorAll('#companyForm .field-err').forEach((e) => { e.textContent = ''; });
  document.querySelectorAll('#companyForm .invalid').forEach((e) => e.classList.remove('invalid'));
}

const FIELD_INPUTS = { name: 'cName', website_url: 'cWebsite', linkedin_url: 'cLinkedin', custom_url: 'cCustomUrl', employee_size: 'cEmployees', description: 'cDescription' };
const FIELD_LABELS = { name: 'fieldName', website_url: 'fieldWebsite', linkedin_url: 'fieldLinkedin', custom_url: 'fieldCustomUrl', employee_size: 'fieldEmployees', description: 'fieldDescription', phones: 'fieldPhones', emails: 'fieldEmails', assign_to_user_id: 'fieldOwner' };

/** Plain-language name of the field an error belongs to. */
function fieldLabel(path) {
  const [base, index] = path;
  if (base === 'custom_fields') {
    const def = (customDefs || []).find((f) => f.slug === String(index));
    return def ? def.name : t('customField', [String(index)]);
  }
  if ((base === 'phones' || base === 'emails') && typeof index === 'number') {
    const li = $(base === 'phones' ? 'cPhones' : 'cEmails').children[index];
    const value = li ? li.querySelector('input').value.trim() : '';
    return t(base === 'phones' ? 'phoneN' : 'emailN', [String(index + 1)]) + (value ? ` (${value})` : '');
  }
  if (base === '_' || base === 'detail' || base == null) return '';
  return FIELD_LABELS[base] ? t(FIELD_LABELS[base]).replace(/\s*\*$/, '') : String(base).replace(/_/g, ' ');
}

/**
 * Shows each error under its field (and marks the input) and returns the
 * list for the summary box: [{ label, text }].
 */
function showFieldErrors(fields) {
  const list = [];
  for (const { path, messages } of flattenErrors(fields)) {
    const text = humanMessage(messages);
    const [base, index] = path;
    list.push({ label: fieldLabel(path), text });

    let slot = null;
    if (base === 'custom_fields') {
      slot = document.querySelector(`#companyForm .field-err[data-for="cf:${CSS.escape(String(index))}"]`);
      if (!slot && index != null) {
        // A required field Hipcall did not list: let the user fill it in anyway.
        const def = { slug: String(index), name: t('customField', [String(index)]), type: 'text', required: true, options: null };
        customDefs = (customDefs || []).concat(def);
        $('cCustom').prepend(customFieldInput(def, ''));
        slot = document.querySelector(`#companyForm .field-err[data-for="cf:${CSS.escape(def.slug)}"]`);
      }
      const input = slot && slot.closest('.field').querySelector('.cf-input');
      if (input) input.classList.add('invalid');
    } else if (base === 'phones' || base === 'emails') {
      slot = document.querySelector(`#companyForm .field-err[data-for="${base}"]`);
      const li = typeof index === 'number' && $(base === 'phones' ? 'cPhones' : 'cEmails').children[index];
      if (li) li.querySelectorAll('input').forEach((x) => x.classList.add('invalid'));
    } else {
      slot = document.querySelector(`#companyForm .field-err[data-for="${base}"]`);
      if (FIELD_INPUTS[base]) $(FIELD_INPUTS[base]).classList.add('invalid');
    }
    if (slot) {
      const label = (base === 'phones' || base === 'emails') && typeof index === 'number' ? fieldLabel(path) + ': ' : '';
      slot.textContent = (slot.textContent ? slot.textContent + ' ' : '') + label + text;
      const det = slot.closest('details');
      if (det) det.open = true;
    }
  }
  return list;
}

/** Red box above the buttons: what went wrong, one line per field. */
function showErrorBox(title, items) {
  const status = $('companyStatus');
  status.className = 'form-status err';
  status.innerHTML = '';
  const b = document.createElement('b');
  b.textContent = title;
  status.appendChild(b);
  if (items && items.length) {
    const ul = document.createElement('ul');
    items.forEach(({ label, text }) => {
      const li = document.createElement('li');
      if (label) {
        const strong = document.createElement('strong');
        strong.textContent = label + ': ';
        li.appendChild(strong);
      }
      li.appendChild(document.createTextNode(text));
      ul.appendChild(li);
    });
    status.appendChild(ul);
  }
}

/** Everything in the form, all rows included (for a draft). */
function companyFormData() {
  return {
    name: $('cName').value,
    websiteUrl: $('cWebsite').value,
    linkedinUrl: $('cLinkedin').value,
    customUrl: $('cCustomUrl').value,
    description: $('cDescription').value,
    employeeSize: $('cEmployees').value,
    phones: Array.from($('cPhones').children).map((li) => ({ number: li.querySelector('.num').value, country: li.querySelector('.cc').value })),
    emails: Array.from($('cEmails').children).map((li) => li.querySelector('.mail').value),
    customFields: customRawValues()
  };
}

// The toolbar popup closes when the sign-in window takes focus, so the form is
// kept as a draft (session storage, this page only) and reopened next time.
const DRAFT_KEY = 'companyDraft';

async function saveDraft() {
  if (!pageUrl) return;
  await chrome.storage.session.set({ [DRAFT_KEY]: { url: pageUrl.href, at: Date.now(), data: companyFormData() } }).catch(() => {});
}

async function restoreDraft() {
  const { [DRAFT_KEY]: draft } = await chrome.storage.session.get(DRAFT_KEY).catch(() => ({}));
  if (!draft || !pageUrl || draft.url !== pageUrl.href || Date.now() - draft.at > 30 * 60 * 1000) return;
  await refreshAccount();
  if (!account.signedIn) return;
  await chrome.storage.session.remove(DRAFT_KEY).catch(() => {});
  await fillCompanyForm(draft.data);
  $('companyStatus').textContent = t('draftRestored');
}

async function saveCompany() {
  clearCompanyErrors();
  const status = $('companyStatus');
  const name = $('cName').value.trim();
  if (name.length < 3) {
    showErrorBox(t('errValidation'), showFieldErrors({ name: ['min3'] }));
    $('cName').focus();
    return;
  }

  const phones = Array.from($('cPhones').children).slice(0, MAX_ITEMS)
    .map((li) => ({ number: li.querySelector('.num').value.trim(), country: li.querySelector('.cc').value.trim().toUpperCase() }))
    .filter((p) => p.number);
  const emails = Array.from($('cEmails').children).slice(0, MAX_ITEMS)
    .map((li) => li.querySelector('.mail').value.trim())
    .filter(Boolean);

  const custom = customValues();
  if (custom.missing.length) {
    custom.missing.forEach(({ slug, msg }) => {
      const slot = document.querySelector(`#companyForm .field-err[data-for="cf:${CSS.escape(slug)}"]`);
      if (slot) slot.textContent = msg;
      const det = slot && slot.closest('details');
      if (det) det.open = true;
    });
    showErrorBox(t('errValidation'), custom.missing.map(({ slug, msg }) => ({ label: fieldLabel(['custom_fields', slug]), text: msg })));
    const first = document.querySelector('#companyForm .field-err:not(:empty)');
    if (first) first.closest('.field').scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }

  const save = $('saveCompany');
  save.disabled = true;
  status.className = 'form-status';
  status.innerHTML = '';
  status.textContent = t('saving');
  const res = await bg('crmCreateCompany', {
    name,
    websiteUrl: $('cWebsite').value,
    linkedinUrl: $('cLinkedin').value,
    customUrl: $('cCustomUrl').value,
    description: $('cDescription').value,
    employeeSize: $('cEmployees').value,
    phones,
    emails,
    customFields: custom.values
  });
  save.disabled = false;

  if (!res.ok) {
    status.className = 'form-status err';
    if (/VALIDATION/.test(res.error)) {
      showErrorBox(t('errNotAdded'), showFieldErrors(res.fields));
      const first = document.querySelector('#companyForm .field-err:not(:empty)');
      if (first) first.closest('.field').scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      showErrorBox(t('errNotAddedShort'), [{ label: '', text: errorText(res.error) }]);
      if (/SIGNED_OUT/.test(res.error)) refreshAccount();
      // Token without "contacts:write" (session from before it was asked):
      // sign in again right here and save once more, the form is kept.
      if (/NEEDS_SCOPE|FORBIDDEN|SIGNED_OUT/.test(res.error)) {
        status.appendChild(document.createElement('br'));
        status.appendChild(signinButton(t('signInAgain'), saveCompany, saveDraft));
      }
    }
    return;
  }

  chrome.storage.session.remove(DRAFT_KEY).catch(() => {});
  closeCompanyForm();
  // Search again so the new record shows up, then say it was added.
  if (linkedinData) {
    await lookupLinkedin();
    setStatus(t('companyAdded', [res.data.name]));
    return;
  }
  await runFind();
  $('findStatus').textContent = t('companyAdded', [res.data.name]);
}

/* ==================================================================== */
/* LINKEDIN — profile and company pages get their own Discover view     */
/* ==================================================================== */
// On LinkedIn the page footer's numbers mean nothing; what matters is the
// person or company on screen: its contact info, its company, and whether
// Hipcall already knows them.

function linkedinKind(u) {
  if (!u || !/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
  if (/^\/in\/[^/]+/.test(u.pathname)) return 'person';
  if (/^\/(company|school|showcase)\/[^/]+/.test(u.pathname)) return 'company';
  return null;
}

/**
 * Runs in the LinkedIn tab. LinkedIn's class names change often, so it reads
 * structure and labels (TR/EN) instead and has fallbacks for each value.
 * opts.openContact: open the "Contact info" dialog, read it, close it again.
 */
async function collectLinkedIn(opts) {
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const txt = (el) => (el ? clean(el.innerText || el.textContent) : '');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const unwrap = (h) => {
    try {
      const u = new URL(h, location.href);
      if (/linkedin\.com$/.test(u.hostname) && /redir/.test(u.pathname)) return u.searchParams.get('url') || u.href;
      return u.href;
    } catch (e) { return ''; }
  };
  const isExternal = (h) => /^https?:\/\//i.test(h) && !/(^|\.)(linkedin\.com|lnkd\.in|licdn\.com)(\/|$)/i.test(new URL(h).hostname + '/');
  const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const PHONE = /(?:\+|00)?\d[\d\s().\-/]{6,}\d/g;

  const m = location.pathname.match(/^\/(in|company|school|showcase)\/([^/?#]+)/);
  if (!m) return null;
  const kind = m[1] === 'in' ? 'person' : 'company';
  const out = { kind, url: `https://www.linkedin.com/${m[1]}/${m[2]}/` };
  const main = document.querySelector('main') || document.body;
  const h1 = main.querySelector('h1');
  const titleName = clean(document.title.replace(/^\(\d+\+?\)\s*/, '').split('|')[0]);
  const top = (h1 && (h1.closest('section') || h1.parentElement)) || main;
  out.name = txt(h1) || titleName;

  /** Lines of the element's text (no empty ones, no duplicates); also for parsed, unrendered HTML. */
  const BLOCK = /^(BR|DIV|P|LI|UL|OL|DD|DT|H[1-6]|SECTION|HEADER|TR|TABLE)$/;
  const blockText = (node) => {
    if (!node) return '';
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeType !== 1 || /^(SCRIPT|STYLE|CODE|TEMPLATE)$/.test(node.nodeName)) return '';
    const inner = [...node.childNodes].map(blockText).join('');
    return BLOCK.test(node.nodeName) ? '\n' + inner + '\n' : inner;
  };
  const lines = (el) => [...new Set(String((el && (el.ownerDocument === document && el.isConnected ? el.innerText : blockText(el))) || '').split('\n').map(clean).filter(Boolean))];

  if (kind === 'person') {
    const slug = decodeURIComponent(m[2]).toLowerCase();
    const contactLink = () => main.querySelector('a[href*="/overlay/contact-info"], #top-card-text-details-contact-info');

    const head = top.querySelector('.text-body-medium');
    out.headline = txt(head) || (lines(top).find((l) => l !== out.name && l.length > 8 && !/derece|degree|bağlantı|connection|takipçi|follower/i.test(l)) || '');

    // Location: the text next to the "Contact info" link ("Londra, Birleşik Krallık · İletişim bilgileri").
    const cl = contactLink();
    let loc = '';
    for (let box = cl && cl.parentElement, i = 0; box && i < 3 && !loc; box = box.parentElement, i++) {
      loc = lines(box).map((l) => l.replace(txt(cl), '').replace(/[·•]/g, ' ').trim())
        .find((l) => l && l.length < 80 && !/bağlantı|connection|takipçi|follower|derece|degree/i.test(l) && l !== out.name && l !== out.headline) || '';
    }
    if (!loc) {
      loc = [...top.querySelectorAll('.text-body-small')].map(txt)
        .find((l) => l && l.length < 80 && !/bağlantı|connection|takipçi|follower|iletişim|contact|derece|degree/i.test(l)) || '';
    }
    out.location = loc.replace(/\s*(İletişim bilgileri|Contact info).*$/i, '').trim();

    // Current company: what LinkedIn shows to the right of the name (logo + name).
    // Found by position, since the markup changes; then by label; then experience.
    let company = null;
    const cleanCo = (sv) => clean(String(sv || '').replace(/\s*(logo|logosu)$/i, ''));
    if (h1) {
      const hr = h1.getBoundingClientRect();
      const cands = [...top.querySelectorAll('a, button, li')].filter((e) => {
        if (!e.querySelector('img') || e.closest('[role="dialog"]')) return false;
        const t = txt(e);
        if (!t || t.length > 70 || t === out.name) return false;
        if (e.querySelector('a[href*="/in/"]') || (e.href && /\/in\//.test(e.href))) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.left >= hr.right - 4 && r.top < hr.bottom + 140 && r.bottom > hr.top - 60;
      }).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      // Skip the school (second item) — first one is the current company.
      const first = cands.find((e) => !/eğitim|education|üniversite|university|okul|school/i.test(e.getAttribute('aria-label') || ''));
      if (first) {
        const label = clean((first.getAttribute('aria-label') || '').split(/[:：]/).slice(1).join(':'))
          .replace(/\.\s*(Deneyim.*|Click to skip.*|Go to .*|Skip to .*)$/i, '');
        company = { name: cleanCo(lines(first)[0] || label || (first.querySelector('img[alt]') || {}).alt) };
        const a = first.closest('a[href*="/company/"]') || first.querySelector('a[href*="/company/"]');
        if (a) company.url = a.href;
      }
    }
    if (!company || !company.name) {
      const cur = top.querySelector('[aria-label*="şirket:" i], [aria-label*="company:" i]');
      if (cur) {
        const label = clean((cur.getAttribute('aria-label') || '').split(/[:：]/).slice(1).join(':'))
          .replace(/\.\s*(Deneyim.*|Click to skip.*|Go to .*|Skip to .*)$/i, '');
        company = { name: cleanCo(lines(cur)[0] || label) };
      }
    }
    // Experience section: the entry whose company has that name gives the link.
    const exp = [...main.querySelectorAll('section')].find((sec) => /^(Deneyim|Experience)(\s|$)/i.test(txt(sec.querySelector('h2'))));
    const expLinks = exp ? [...exp.querySelectorAll('a[href*="/company/"]')] : [];
    const nameOf = (a) => cleanCo((a.querySelector('img[alt]') || {}).alt || lines(a)[0] || '');
    if (company && company.name && !company.url) {
      const want = company.name.toLocaleLowerCase('tr');
      const hit = expLinks.find((a) => nameOf(a).toLocaleLowerCase('tr') === want || lines(a).some((l) => l.toLocaleLowerCase('tr') === want));
      if (hit) company.url = hit.href;
    }
    if ((!company || !company.name) && expLinks.length) company = { url: expLinks[0].href, name: nameOf(expLinks[0]) };
    if ((!company || !company.name) && out.headline) {
      const hm = out.headline.match(/\b(?:at|@)\s+([^|·,•]+)/i) || out.headline.match(/([^|·,•]+?)\s+(?:şirketinde|firmasında)/i);
      if (hm) company = { name: clean(hm[1]) };
    }
    if (company && company.url) company.url = company.url.split(/[?#]/)[0];
    out.company = company && company.name ? company : null;

    /* ---- Contact info dialog (/overlay/contact-info/) ---- */
    // LinkedIn may render dialogs inside a shadow root (#interop-outlet), so search those too.
    const deepAll = (sel) => {
      const found = [];
      const walk = (root) => {
        root.querySelectorAll(sel).forEach((e) => found.push(e));
        root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); });
      };
      walk(document);
      return found;
    };
    const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const TITLE = /^(İletişim bilgileri|Contact info)$/i;
    const CONTENT = /profili|profile|web ?sitesi|website|telefon|phone|e-?posta|e-?mail|adres|address|doğum|birthday/i;
    const up = (e) => e.parentElement || (e.getRootNode && e.getRootNode().host) || null;
    // The visible "Contact info" title, then its nearest ancestor that also holds the content.
    // (Structure-independent: LinkedIn changes markup and may use shadow roots.)
    const findDialog = () => {
      const heads = deepAll('h1, h2, h3, header, [role="heading"]').filter((h) => TITLE.test(txt(h)) && visible(h));
      for (const h of heads) {
        let box = h;
        for (let i = 0; i < 12 && (box = up(box)); i++) {
          const t = txt(box);
          if (t.length > 5000) break;
          if (CONTENT.test(t.replace(TITLE, '').replace(/^(İletişim bilgileri|Contact info)/i, ''))) return box;
        }
      }
      // Older markup: a visible dialog with the title or a link to this profile
      return deepAll('[role="dialog"], .artdeco-modal, dialog').filter(visible).find((d) =>
        /İletişim bilgileri|Contact info/i.test(txt(d).slice(0, 200)) ||
        [...d.querySelectorAll('a[href*="/in/"]')].some((a) => a.href.toLowerCase().includes('/in/' + slug))) || null;
    };
    const closeButton = (box) => {
      for (let e = box, i = 0; e && i < 6; e = up(e), i++) {
        const b = e.querySelector && e.querySelector('button[aria-label*="Kapat" i], button[aria-label*="Dismiss" i], button[aria-label*="Close" i], .artdeco-modal__dismiss');
        if (b) return b;
      }
      return null;
    };
    const contact = { websites: [], emails: [], phones: [], other: [], read: false };
    if (opts && opts.openContact) {
      let dlg = findDialog();
      let opened = false;
      if (!dlg) {
        const link = contactLink();
        if (link) {
          link.click();
          opened = true;
          for (let i = 0; i < 50 && !(dlg = findDialog()); i++) await sleep(120);
        }
      }
      if (dlg) {
        // Wait until the content has loaded and stopped changing (at most ~3 s).
        let before = -1;
        for (let i = 0; i < 25; i++) {
          const now = txt(dlg).length;
          if (lines(dlg).length > 2 && now === before) break;
          before = now;
          await sleep(120);
        }
        contact.read = true;
        const anchors = [...dlg.querySelectorAll('a[href]')];
        anchors.forEach((a) => {
          const href = a.getAttribute('href') || '';
          if (/^mailto:/i.test(href)) { contact.emails.push(href.slice(7).split('?')[0]); return; }
          if (/^tel:/i.test(href)) { contact.phones.push({ number: clean(decodeURIComponent(href.slice(4))), label: '' }); return; }
          const url = unwrap(a.href);
          if (!url || !isExternal(url)) {
            if (/twitter\.com|x\.com/i.test(url)) contact.other.push({ type: 'twitter', url });
            return;
          }
          const row = a.closest('li') || a.parentElement;
          const label = clean(txt(row).replace(txt(a), '').replace(/[()]/g, ''));
          contact.websites.push({ url, label: label.length < 30 ? label : '' });
        });
        // Everything again from the text, under its heading — works whatever
        // the markup is (links may be buttons or plain text).
        const DOMAIN = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s()]*)?)/i;
        let section = '';
        lines(dlg).forEach((l) => {
          if (/^(telefon|phone)/i.test(l)) { section = 'phone'; return; }
          if (/^(e-?posta|e-?mail)/i.test(l)) { section = 'email'; return; }
          if (/^(web ?sitesi|web ?siteleri|websites?)$/i.test(l)) { section = 'web'; return; }
          if (/^(adres|address|doğum|birthday|bağlantı|connected|twitter|anlık|im\b|profil|profile)/i.test(l) || /profili$|profile$/i.test(l)) { section = ''; return; }
          (l.match(EMAIL) || []).forEach((e) => contact.emails.push(e));
          // "(Kişisel)" on its own line belongs to the site above it
          if (section === 'web' && /^\([^()]{1,30}\)$/.test(l) && contact.websites.length) {
            const last = contact.websites[contact.websites.length - 1];
            if (!last.label) last.label = l.replace(/[()]/g, '').trim();
            return;
          }
          if (section === 'web' && !/@/.test(l)) {
            const dm = l.match(DOMAIN);
            if (dm && !/linkedin\.com|lnkd\.in/i.test(dm[1])) {
              const url = /^https?:/i.test(dm[1]) ? dm[1] : 'https://' + dm[1];
              const label = clean(l.replace(dm[1], '').replace(/[()]/g, ''));
              const host = (u) => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').toLowerCase();
              const known = contact.websites.find((w) => host(w.url) === host(url));
              if (known) { if (!known.label && label.length < 30) known.label = label; }
              else contact.websites.push({ url, label: label.length < 30 ? label : '' });
            }
          }
          EMAIL.lastIndex = 0;
          if (section === 'phone') {
            const num = (l.match(PHONE) || [])[0];
            if (num && !contact.phones.some((p) => p.number.replace(/\D/g, '') === num.replace(/\D/g, ''))) {
              contact.phones.push({ number: clean(num), label: clean(l.replace(num, '').replace(/[()]/g, '')) });
            }
          }
        });
        // What was read, to send to support if nothing was found
        contact.debug = { tag: dlg.tagName, role: dlg.getAttribute('role'), lines: lines(dlg).slice(0, 30),
          links: [...dlg.querySelectorAll('a[href]')].slice(0, 15).map((x) => x.getAttribute('href')) };
        if (opened) {
          const close = closeButton(dlg);
          if (close) close.click();
          else if (/\/overlay\//.test(location.pathname)) history.back();
        }
      }
    }
    contact.emails = [...new Set(contact.emails.map((e) => e.toLowerCase()))];
    const seenSite = new Set();
    contact.websites = contact.websites.filter((w) => !seenSite.has(w.url) && seenSite.add(w.url));
    out.contact = contact;
    out.canOpenContact = !!contactLink() || !!findDialog();
    return out;
  }

  /* ---- company / school / showcase page ---- */
  const topLines = lines(top);
  const iName = topLines.indexOf(out.name);
  const tagEl = top.querySelector('.org-top-card-summary__tagline');
  out.tagline = txt(tagEl) || (iName >= 0 && topLines[iName + 1] && !/·/.test(topLines[iName + 1]) ? topLines[iName + 1] : '');

  // "Telekomünikasyon · London · 1 bin takipçi · 2-10 çalışan"
  let items = [...top.querySelectorAll('.org-top-card-summary-info-list__info-item')].map(txt).filter(Boolean);
  if (!items.length) {
    const line = topLines.find((l) => /·/.test(l) && /(takipçi|follower|çalışan|employee)/i.test(l)) || '';
    items = line.split('·').map(clean).filter(Boolean);
  }
  items.forEach((it) => {
    if (/takipçi|follower/i.test(it)) out.followers = it;
    else if (/çalışan|employee/i.test(it)) out.employees = it;
    else if (!out.industry) out.industry = it;
    else if (!out.location) out.location = it;
  });

  // "Visit website" button / any external link in the top card
  const site = [...top.querySelectorAll('a[href]')].map((a) => unwrap(a.href)).find((h) => h && isExternal(h));
  if (site) out.website = site;

  // Overview / About text
  const about = [...main.querySelectorAll('section')].find((s) => /^(Genel Bakış|Overview|Hakkında|About)(\s|$)/i.test(txt(s.querySelector('h2'))));
  if (about) {
    const p = [...about.querySelectorAll('p')].map(txt).sort((a, b) => b.length - a.length)[0];
    if (p) out.description = p;
  }

  // About tab details (dt/dd), present on /about/
  const readDl = (root) => {
    const info = {};
    root.querySelectorAll('dt').forEach((dt) => {
      const label = txt(dt);
      const dd = dt.nextElementSibling;
      if (!dd) return;
      const a = dd.querySelector('a[href]');
      const value = lines(dd)[0] || '';
      if (/web/i.test(label)) info.website = a ? unwrap(a.href) : value;
      else if (/telefon|phone/i.test(label)) info.phone = (value.match(PHONE) || [value])[0];
      else if (/sektör|industry/i.test(label)) info.industry = value;
      else if (/büyüklü|size/i.test(label)) info.employees = value;
      else if (/merkez|headquarters/i.test(label)) info.location = value;
      else if (/kuruluş|founded/i.test(label)) info.founded = value;
      else if (/uzmanlık|specialt/i.test(label)) info.specialties = value;
    });
    return info;
  };
  let info = readDl(main);

  // Not on /about/: load it in the background (same session, nothing shown).
  if (!info.website || !info.phone) {
    try {
      const html = await Promise.race([
        fetch(`/${m[1]}/${m[2]}/about/`, { credentials: 'include' }).then((r) => (r.ok ? r.text() : '')),
        sleep(5000).then(() => '')
      ]);
      if (html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const more = readDl(doc);
        // Server-rendered data blocks (<code>…</code> JSON) when the dl is not there
        const raw = [...doc.querySelectorAll('code')].map((c) => c.textContent).join('\n')
          .replace(/&quot;/g, '"').replace(/\\u002F/g, '/');
        const grab = (re) => { const x = raw.match(re); return x ? x[1] : ''; };
        if (!more.website) more.website = grab(/"(?:websiteUrl|companyPageUrl)"\s*:\s*"(https?:[^"]+)"/);
        if (!more.phone) more.phone = grab(/"phone"\s*:\s*\{[^{}]*?"number"\s*:\s*"([^"]+)"/);
        if (!more.employees) {
          const sc = raw.match(/"staffCountRange"\s*:\s*\{[^{}]*?"start"\s*:\s*(\d+)(?:\s*,\s*"end"\s*:\s*(\d+))?/);
          if (sc) more.employees = sc[2] ? `${sc[1]}-${sc[2]}` : `${sc[1]}+`;
        }
        info = { ...more, ...info };
      }
    } catch (e) { /* the page details stay as they are */ }
  }
  out.website = info.website || out.website || '';
  out.phone = info.phone || '';
  out.industry = info.industry || out.industry || '';
  out.employees = info.employees || out.employees || '';
  out.location = info.location || out.location || '';
  out.founded = info.founded || '';
  out.specialties = info.specialties || '';
  return out;
}

/* ---- popup side ---- */

let linkedinData = null;
let linkedinHipcall = null;

/** LinkedIn size band → Hipcall employee_size (by the band's upper end). */
function employeeSizeFrom(text) {
  const s = String(text || '').replace(/(\d)[.,](\d{3})/g, '$1$2');
  const m = s.match(/(\d+)\s*[-–]\s*(\d+)/) || s.match(/(\d+)\s*\+/) || s.match(/^(\d+)\b/);
  if (!m) return '';
  const hi = m[2] ? Number(m[2]) : /\+/.test(m[0]) ? Number(m[1]) + 1 : Number(m[1]);
  if (hi <= 1) return '1';
  if (hi <= 5) return '2_5';
  if (hi <= 10) return '6_10';
  if (hi <= 25) return '11_25';
  if (hi <= 50) return '26_50';
  if (hi <= 200) return '51_200';
  if (hi <= 1000) return '201_1000';
  if (hi <= 10000) return '1001_10000';
  return '10001_more';
}

let liContactLoading = false;

async function runCollect(openContact) {
  const [frame] = await chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
    func: collectLinkedIn,
    args: [{ openContact }]
  });
  return frame && frame.result;
}

/**
 * 1) Read the page right away (fast) → show it and search Hipcall.
 * 2) Person: then open the "Contact info" dialog in the background (slow),
 *    show what it has and search again with the e-mails / phones.
 */
async function scanLinkedin(opts = {}) {
  const kind = linkedinKind(pageUrl);
  $('genericResults').hidden = true;
  $('deepOpt').hidden = true;
  const area = $('linkedinArea');
  area.hidden = false;
  $('rescan').disabled = true;
  setStatus(kind === 'person' ? t('liReadingPerson') : t('liReadingCompany'));

  const cacheKey = 'li:' + pageUrl.pathname.split('/').slice(0, 3).join('/');
  const { [cacheKey]: stored } = await chrome.storage.session.get(cacheKey).catch(() => ({}));
  // Only a read that found something counts (an empty one is tried again).
  const cached = stored && ((stored.emails || []).length + (stored.phones || []).length + (stored.websites || []).length) ? stored : null;

  let data = null;
  try {
    data = await runCollect(false);
  } catch (e) {
    console.warn('[Hipcall] LinkedIn page not readable:', e);
  }
  $('rescan').disabled = false;
  if (!data || !data.name) {
    setStatus(t('liNotReadable'), true);
    area.innerHTML = '';
    return;
  }
  setStatus('');

  const needContact = kind === 'person' && (opts.forceContact || !cached);
  if (kind === 'person' && cached && !opts.forceContact) data.contact = { ...cached, read: true };
  liContactLoading = needContact && data.canOpenContact;
  linkedinData = data;
  linkedinHipcall = null;
  renderLinkedin();
  restoreDraft();
  lookupLinkedin();

  if (!liContactLoading) return;
  let more = null;
  try {
    more = await runCollect(true);
  } catch (e) {
    console.warn('[Hipcall] contact info not readable:', e);
  }
  liContactLoading = false;
  if (more && more.contact && more.contact.read) {
    linkedinData.contact = more.contact;
    const found = more.contact.emails.length + more.contact.phones.length + more.contact.websites.length;
    if (found) chrome.storage.session.set({ [cacheKey]: more.contact }).catch(() => {});
    renderLinkedin();
    const c = more.contact;
    if (c.emails.length || c.phones.length || c.websites.length) lookupLinkedin(); // more to search with
  } else {
    linkedinData.contact = { websites: [], emails: [], phones: [], read: false, failed: true };
    renderLinkedin();
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function infoRow(icon, text, href) {
  const row = el('div', 'li-row');
  const i = el('span', 'li-ico');
  i.innerHTML = icon;
  row.appendChild(i);
  if (href) {
    const a = el('a', '', text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    row.appendChild(a);
  } else {
    row.appendChild(el('span', '', text));
  }
  return row;
}

function renderLinkedin() {
  const d = linkedinData;
  const area = $('linkedinArea');
  area.innerHTML = '';

  /* --- what LinkedIn shows --- */
  const card = el('div', 'card li-card');
  const badge = el('div', 'li-badge');
  badge.innerHTML = ICON.linkedin;
  badge.appendChild(el('span', '', d.kind === 'person' ? t('liPerson') : t('liCompany')));
  card.appendChild(badge);

  const head = el('div', 'li-head');
  const av = el('div', 'avatar' + (d.kind === 'company' ? ' square' : ''), initials(d.name));
  const who = el('div', 'who');
  who.appendChild(el('b', '', d.name));
  const sub = d.kind === 'person' ? d.headline : d.tagline;
  if (sub) who.appendChild(el('small', '', sub));
  head.append(av, who);
  card.appendChild(head);

  if (d.kind === 'person') {
    if (d.location) card.appendChild(infoRow(ICON.pin, d.location));
    if (d.company) {
      const row = infoRow(ICON.building, d.company.name, d.company.url || null);
      card.appendChild(row);
    }
  } else {
    const chips = el('div', 'tags li-chips');
    [d.industry, d.location, d.employees, d.followers, d.founded && t('liFounded', [d.founded])].filter(Boolean)
      .forEach((c) => chips.appendChild(el('span', 'tag gray', c)));
    if (chips.children.length) card.appendChild(chips);
    if (d.website) card.appendChild(infoRow(ICON.web, d.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), d.website));
  }

  /* --- contact details --- */
  const list = el('ul', 'li-list');
  const phones = d.kind === 'person' ? (d.contact ? d.contact.phones : []) : (d.phone ? [{ number: d.phone, label: '' }] : []);
  phones.forEach((p) => {
    const btn = el('button', 'round');
    btn.title = t('callWithHipcall', [p.number]);
    btn.setAttribute('aria-label', btn.title);
    btn.innerHTML = ICON.phone;
    btn.addEventListener('click', () => callNumber(p.number));
    list.appendChild(itemRow(p.number + (p.label ? ` · ${p.label}` : ''), 'num', p.number, btn));
  });
  (d.kind === 'person' && d.contact ? d.contact.emails : []).forEach((m) => {
    const a = el('a', 'round light');
    a.href = 'mailto:' + m;
    a.target = '_blank';
    a.title = t('writeEmail', [m]);
    a.innerHTML = ICON.mail;
    list.appendChild(itemRow(m, 'mail', m, a));
  });
  (d.kind === 'person' && d.contact ? d.contact.websites : []).forEach((w) => {
    const a = el('a', 'round light');
    a.href = w.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = w.url;
    a.innerHTML = ICON.open;
    list.appendChild(itemRow(w.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') + (w.label ? ` · ${w.label}` : ''), 'mail', w.url, a));
  });

  const contactBox = el('div', 'li-contact');
  contactBox.appendChild(el('h3', '', t('liContactInfo')));
  if (list.children.length) contactBox.appendChild(list);
  else {
    const none = d.kind === 'person'
      ? (liContactLoading ? t('liContactLoading')
        : d.contact && d.contact.read ? t('liNoContactShared')
        : d.contact && d.contact.failed ? t('liContactFailed') : t('liContactNotRead'))
      : t('liNoCompanyContact');
    contactBox.appendChild(el('p', 'muted', none));
  }
  // Nothing found although the dialog was read: let the user copy what was seen (for support).
  if (d.kind === 'person' && !list.children.length && d.contact && d.contact.debug) {
    const dbg = el('button', 'link-btn muted-link', t('liCopyDebug'));
    dbg.type = 'button';
    dbg.addEventListener('click', async () => {
      await navigator.clipboard.writeText(JSON.stringify({ url: pageUrl.href, read: d.contact.debug }, null, 1));
      dbg.textContent = t('copied');
    });
    contactBox.appendChild(dbg);
  }
  if (d.kind === 'person' && d.canOpenContact && !liContactLoading) {
    const again = el('button', 'link-btn', d.contact && d.contact.read ? t('liReloadContact') : t('liReadContact'));
    again.type = 'button';
    again.addEventListener('click', () => scanLinkedin({ forceContact: true }));
    contactBox.appendChild(again);
  }
  card.appendChild(contactBox);
  area.appendChild(card);

  /* --- Hipcall --- */
  const hc = el('div', 'card li-hipcall');
  hc.id = 'liHipcall';
  area.appendChild(hc);
  renderLinkedinHipcall();
}

function lookupInput() {
  const d = linkedinData;
  if (d.kind === 'person') {
    const websites = (d.contact && d.contact.websites) || [];
    const companySite = websites.find((w) => /^(şirket|company|iş|work)$/i.test(String(w.label).trim())) || null;
    return {
      kind: 'person',
      name: d.name,
      emails: (d.contact && d.contact.emails) || [],
      phones: ((d.contact && d.contact.phones) || []).map((p) => p.number),
      company: d.company ? { name: d.company.name, url: d.company.url || '', website: companySite ? companySite.url : '' } : null
    };
  }
  return { kind: 'company', name: d.name, website: d.website, linkedinUrl: d.url, phones: d.phone ? [d.phone] : [] };
}

let liLookupSeq = 0;

async function lookupLinkedin() {
  if (!account.signedIn) { renderLinkedinHipcall(); return; }
  const seq = ++liLookupSeq;
  linkedinHipcall = { loading: true };
  renderLinkedinHipcall();
  const res = await bg('crmLinkedin', lookupInput());
  if (seq !== liLookupSeq) return; // a newer search (with contact info) is running
  linkedinHipcall = res.ok ? res.data : { error: res.error };
  if (!res.ok && /SIGNED_OUT/.test(res.error)) refreshAccount();
  renderLinkedinHipcall();
}

function renderLinkedinHipcall() {
  const hc = $('liHipcall');
  if (!hc || !linkedinData) return;
  const d = linkedinData;
  hc.innerHTML = '';
  const h = el('div', 'find-head');
  const ht = el('div');
  ht.appendChild(el('b', '', t('liInHipcall')));
  ht.appendChild(el('small', '', d.kind === 'person' ? t('liPersonHint') : t('liCompanyHint')));
  h.appendChild(ht);
  if (account.signedIn) {
    const again = el('button', 'ghost');
    again.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
    again.title = t('refresh');
    again.setAttribute('aria-label', again.title);
    again.addEventListener('click', lookupLinkedin);
    h.appendChild(again);
  }
  hc.appendChild(h);

  if (!account.signedIn) {
    hc.appendChild(el('p', 'muted', account.available ? t('findNeedsSignin') : t('signinNotAvailable')));
    if (account.available) hc.appendChild(signinButton(t('signIn'), lookupLinkedin));
    return;
  }
  const r = linkedinHipcall;
  if (!r || r.loading) { hc.appendChild(el('p', 'muted', t('findSearching'))); return; }
  if (r.error) { hc.appendChild(el('p', 'is-error', errorText(r.error))); return; }

  const wrap = el('div', 'records');
  if (d.kind === 'person') {
    // The person
    wrap.appendChild(heading(t('liPersonSection')));
    if (r.contacts.length) r.contacts.forEach((c) => wrap.appendChild(recordCard(c, 'contact')));
    else wrap.appendChild(statusLine('no', t('liPersonMissing', [d.name])));
    // Their company
    wrap.appendChild(heading(t('liCompanySection')));
    if (!d.company) {
      wrap.appendChild(statusLine('info', t('liNoCompanyOnProfile')));
    } else if (r.companies.length) {
      r.companies.forEach((c) => wrap.appendChild(recordCard(c, 'company')));
    } else {
      wrap.appendChild(statusLine('no', t('liCompanyMissing', [d.company.name])));
      if (d.company.url) {
        const go = el('button', 'soft wide', t('liOpenCompanyPage', [d.company.name]));
        go.type = 'button';
        go.addEventListener('click', () => { chrome.tabs.update(activeTab.id, { url: d.company.url }); window.close(); });
        wrap.appendChild(go);
        wrap.appendChild(el('p', 'muted small', t('liOpenCompanyHint')));
      }
    }
  } else {
    if (r.companies.length) {
      wrap.appendChild(statusLine('yes', t('liCompanyFound', [String(r.companies.length)])));
      r.companies.forEach((c) => wrap.appendChild(recordCard(c, 'company')));
    } else {
      wrap.appendChild(statusLine('no', t('liCompanyMissing', [d.name])));
    }
    if (r.contacts.length) {
      wrap.appendChild(heading(t('findContacts', [String(r.contacts.length)])));
      r.contacts.forEach((c) => wrap.appendChild(recordCard(c, 'contact')));
    }
    // Already in Hipcall → nothing to add.
    if (!r.companies.length) {
      const add = el('button', 'primary wide', t('addCompany'));
      add.type = 'button';
      add.id = 'addCompanyBtn';
      add.addEventListener('click', openCompanyFromLinkedin);
      wrap.appendChild(add);
    }
  }
  hc.appendChild(wrap);
}

function statusLine(kind, text) {
  const p = el('div', 'li-status ' + kind);
  const i = el('span', 'mark', kind === 'yes' ? '✓' : kind === 'no' ? '✕' : 'i');
  p.append(i, el('span', '', text));
  return p;
}

/** Add-company form filled from the LinkedIn company page. */
async function openCompanyFromLinkedin() {
  const d = linkedinData;
  await refreshAccount();
  if (!account.signedIn) { renderLinkedinHipcall(); return; }
  ({ region: companyRegion } = await HC_CONFIG.getSettings());
  const phones = d.phone ? [{ number: d.phone, country: countryFor(d.phone, companyRegion) }] : [];
  await fillCompanyForm({
    name: d.name,
    websiteUrl: d.website || '',
    linkedinUrl: d.url,
    customUrl: '',
    description: (d.description || d.tagline || '').slice(0, 2000),
    employeeSize: employeeSizeFrom(d.employees),
    phones,
    emails: [],
    customFields: {}
  });
  $('companyStatus').className = 'form-status';
  $('companyStatus').textContent = t('liFormFilled') + (d.employees ? ' ' + t('liEmployeesHint', [d.employees]) : '');
}
