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

  // Loaded unpacked (chrome://extensions → Load unpacked): a Web Store install
  // always has update_url in its manifest. Only then is the desktop web app
  // run locally (`flutter run -d web-server --web-port=19823`, see the desktop
  // repo's DEVELOPMENT.md) offered, so it can never reach a published build.
  const IS_DEV = !('update_url' in chrome.runtime.getManifest());
  // The port the desktop's OAuth app accepts for local runs.
  const LOCAL_PORT = '19823';
  if (IS_DEV) {
    SERVERS.local = {
      webphoneUrl: `http://localhost:${LOCAL_PORT}/calls`,
      // Match patterns cannot name a port; any localhost page counts.
      patterns: ['*://localhost/*']
    };
    REGIONS.local = { id: 'local', server: 'local', nameKey: 'regionLocal' };
    REGION_ORDER.push('local');
  }

  const ALL_PATTERNS = Object.values(SERVERS).flatMap((s) => s.patterns);

  // Browser languages mapped to the EU region on first install.
  const EU_LANGS = ['bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'ga', 'hr', 'hu', 'it',
    'lt', 'lv', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'sl', 'sv'];

  /** Size of the web phone popup window (same as the original extension). */
  const POPUP_WINDOW = { width: 400, height: 780 };

  const DEFAULTS = {
    region: null,   // resolved on first run by defaultRegion()
    autoDial: true,  // press the call button after the number is entered
    language: 'auto' // 'auto' (browser language, English fallback) or a code from HC_I18N.SUPPORTED
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
    if (!(region ? region.patterns : ALL_PATTERNS).some((p) => matchesPattern(url, p))) return false;
    // The local pattern covers every localhost port; only the desktop's
    // development port is the desktop.
    try {
      const u = new URL(url);
      if (u.hostname === 'localhost') return u.port === LOCAL_PORT;
    } catch (_) {
      return false;
    }
    return true;
  }

  return { REGIONS, REGION_ORDER, SERVERS, ALL_PATTERNS, POPUP_WINDOW, IS_DEV, defaultRegion, getSettings, setSettings, region, isWebphoneUrl };
})();
