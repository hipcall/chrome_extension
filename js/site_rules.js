/**
 * Per-site rules: on which pages of a site the call icons are shown.
 * Shared by the content script and the popup.
 *
 * One rule per site, stored in chrome.storage.sync under "rule:<domain>":
 *   { mode: 'selected', include: ['/'], exclude: [] }      → only the listed pages
 *   { mode: 'all',      include: [...], exclude: ['/cart'] } → every page except the excluded ones
 *
 * Without a rule the default applies: home page only ('/').
 * A pattern like "/blog/*" matches /blog and every page below it.
 */
// eslint-disable-next-line no-var
var HC_SITE_RULES = (() => {
  'use strict';

  const DEFAULT_RULE = Object.freeze({ mode: 'selected', include: ['/'], exclude: [] });

  function hostKey(host) {
    return 'rule:' + String(host || '').toLowerCase().replace(/^www\./, '');
  }

  /** "/Contact/?a=1#x" → "/contact". Also accepts a full URL. A trailing "/*" is kept. */
  function normPath(input) {
    let p = String(input || '').trim();
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) {
      try { p = new URL(p).pathname; } catch (_) { /* ignore */ }
    }
    p = p.split(/[?#]/)[0];
    try { p = decodeURI(p); } catch (_) { /* ignore */ }
    p = p.replace(/İ/g, 'i').toLowerCase(); // Turkish dotted İ would become "i̇" otherwise
    if (!p.startsWith('/')) p = '/' + p;
    p = p.replace(/\/{2,}/g, '/');
    if (p.length > 1 && !p.endsWith('/*')) p = p.replace(/\/+$/, '');
    return p || '/';
  }

  function matches(pattern, path) {
    const pat = normPath(pattern);
    const p = normPath(path);
    if (pat === '/*') return true;
    if (pat.endsWith('/*')) {
      const base = pat.slice(0, -2);
      return p === base || p.startsWith(base + '/');
    }
    return pat === p;
  }

  function isEnabled(rule, path) {
    const r = rule || DEFAULT_RULE;
    if (r.mode === 'all') return !(r.exclude || []).some((pat) => matches(pat, path));
    return (r.include || []).some((pat) => matches(pat, path));
  }

  function clone(rule) {
    return {
      mode: rule.mode === 'all' ? 'all' : 'selected',
      include: Array.from(rule.include || []),
      exclude: Array.from(rule.exclude || [])
    };
  }

  async function getRule(host) {
    const key = hostKey(host);
    try {
      const data = await chrome.storage.sync.get(key);
      return clone(data[key] || DEFAULT_RULE);
    } catch (_) {
      return clone(DEFAULT_RULE);
    }
  }

  async function setRule(host, rule) {
    await chrome.storage.sync.set({ [hostKey(host)]: clone(rule) });
  }

  async function resetRule(host) {
    await chrome.storage.sync.remove(hostKey(host));
  }

  function label(path) {
    return normPath(path) === '/' ? chrome.i18n.getMessage('homePage') : normPath(path);
  }

  return { DEFAULT_RULE, hostKey, normPath, matches, isEnabled, getRule, setRule, resetRule, label };
})();
