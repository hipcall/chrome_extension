/**
 * Shared configuration (service worker, content scripts and popup).
 *
 * One extension for every Hipcall region. The account region (Türkiye, EU, UK,
 * US) decides which web phone is opened: Türkiye → hipcall.com.tr, the rest →
 * hipcall.com. It is guessed from the browser language on first install and
 * can be changed in the popup settings.
 */
// eslint-disable-next-line no-var
var HC_CONFIG = (() => {
  'use strict';

  // Web phone servers. Türkiye accounts live on hipcall.com.tr, every other
  // region on hipcall.com — the user only picks a region, the server follows.
  const SERVERS = {
    tr: {
      webphoneUrl: 'https://desktop.hipcall.com.tr/calls',
      // Pages that ARE the web phone. use.hipcall.com.tr also hosts other
      // pages (e.g. /api-docs) that must not be mistaken for it; its old
      // /phone/dialpad/ address redirects to desktop.hipcall.com.tr.
      patterns: ['*://desktop.hipcall.com.tr/*', '*://use.hipcall.com.tr/phone/*', '*://phone.hipcall.com.tr/*']
    },
    global: {
      webphoneUrl: 'https://desktop.hipcall.com/calls',
      patterns: ['*://desktop.hipcall.com/*', '*://use.hipcall.com/phone/*', '*://phone.hipcall.com/*']
    }
  };

  // Account regions, same as the Hipcall apps' "Account region" picker.
  const REGIONS = {
    tr: { id: 'tr', server: 'tr', nameKey: 'regionTR' },
    eu: { id: 'eu', server: 'global', nameKey: 'regionEU' },
    uk: { id: 'uk', server: 'global', nameKey: 'regionUK' },
    us: { id: 'us', server: 'global', nameKey: 'regionUS' }
  };
  const REGION_ORDER = ['tr', 'eu', 'uk', 'us'];

  const ALL_PATTERNS = [...SERVERS.tr.patterns, ...SERVERS.global.patterns];

  // Browser languages mapped to the EU region on first install.
  const EU_LANGS = ['bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'ga', 'hr', 'hu', 'it',
    'lt', 'lv', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'sl', 'sv'];

  /** Size of the web phone popup window (same as the original extension). */
  const POPUP_WINDOW = { width: 400, height: 780 };

  const DEFAULTS = {
    region: null,   // resolved on first run by defaultRegion()
    autoDial: true,  // press the call button after the number is entered
    language: 'auto' // 'auto' (browser language), 'tr' or 'en'
  };

  /** First-install guess from the browser language; the user can change it. */
  function defaultRegion() {
    const lang = (chrome.i18n.getUILanguage() || '').toLowerCase();
    if (lang.startsWith('tr')) return 'tr';
    if (lang === 'en-gb') return 'uk';
    if (EU_LANGS.includes(lang.split('-')[0])) return 'eu';
    return 'us';
  }

  async function getSettings() {
    const stored = await chrome.storage.sync.get(['region', 'autoDial', 'language']);
    const settings = { ...DEFAULTS, ...stored };
    if (!REGIONS[settings.region]) settings.region = defaultRegion();
    return settings;
  }

  async function setSettings(patch) {
    await chrome.storage.sync.set(patch);
  }

  /** Region with its server details merged in: { id, server, nameKey, webphoneUrl, patterns }. */
  function region(id) {
    const r = REGIONS[id] || REGIONS[defaultRegion()];
    return { ...r, ...SERVERS[r.server] };
  }

  /** Does the URL match a match pattern like '*://use.hipcall.com.tr/phone/*'? */
  function matchesPattern(url, pattern) {
    const m = pattern.match(/^\*:\/\/([^/]+)(\/.*)$/);
    if (!m) return false;
    const path = m[2].replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    try {
      const u = new URL(url);
      return /^https?:$/.test(u.protocol) && u.hostname === m[1] && new RegExp(`^${path}$`).test(u.pathname);
    } catch (_) {
      return false;
    }
  }

  /** Is the URL a Hipcall web phone page (any region, or the given region)? */
  function isWebphoneUrl(url, region) {
    return (region ? region.patterns : ALL_PATTERNS).some((p) => matchesPattern(url, p));
  }

  return { REGIONS, REGION_ORDER, SERVERS, ALL_PATTERNS, POPUP_WINDOW, defaultRegion, getSettings, setSettings, region, isWebphoneUrl };
})();
