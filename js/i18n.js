/**
 * Translations with a user-selectable language.
 *
 * chrome.i18n always follows the browser language. This module reads the same
 * _locales/<lang>/messages.json files, so the user can pick a language in the
 * popup settings ('auto' = browser language). Shared by the service worker,
 * content script and popup.
 *
 *   await HC_I18N.init();          // once, and again after the language changes
 *   HC_I18N.t('callWithHipcall', ['0532 123 45 67']);
 */
// eslint-disable-next-line no-var
var HC_I18N = (() => {
  'use strict';

  const SUPPORTED = ['de', 'en', 'es', 'fr', 'it', 'nl', 'tr'];
  const FALLBACK = 'en';
  let language = 'auto';
  let messages = null; // null → fall back to chrome.i18n

  async function init() {
    try {
      ({ language = 'auto' } = await chrome.storage.sync.get('language'));
    } catch (_) {
      language = 'auto';
    }
    messages = SUPPORTED.includes(language) ? await loadMessages(language) : null;
    return current();
  }

  /**
   * Extension pages and the service worker read the file directly. Content
   * scripts cannot fetch extension files that are not web-accessible, so they
   * ask the service worker instead.
   */
  async function loadMessages(lang) {
    const isContentScript = typeof chrome.tabs === 'undefined';
    try {
      if (isContentScript) {
        const res = await chrome.runtime.sendMessage({ type: 'getMessages', lang });
        return res && res.messages ? res.messages : null;
      }
      return await fetchMessages(lang);
    } catch (_) {
      return null;
    }
  }

  async function fetchMessages(lang) {
    if (!SUPPORTED.includes(lang)) return null;
    const res = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
    return res.json();
  }

  /** Effective language code: the chosen one, else the browser's, else English. */
  function current() {
    if (SUPPORTED.includes(language)) return language;
    const browser = (chrome.i18n.getUILanguage() || '').toLowerCase().split('-')[0];
    return SUPPORTED.includes(browser) ? browser : FALLBACK;
  }

  /** Same contract as chrome.i18n.getMessage (named placeholders, $1..$9). */
  function t(key, subs) {
    const entry = messages && messages[key];
    if (!entry) return chrome.i18n.getMessage(key, subs);

    const args = subs == null ? [] : [].concat(subs).map(String);
    const placeholders = entry.placeholders || {};
    return entry.message
      .replace(/\$([A-Za-z0-9_@]+)\$/g, (m, name) => {
        const p = placeholders[name.toLowerCase()];
        return p ? p.content : m;
      })
      .replace(/\$(\d)/g, (m, n) => (args[n - 1] !== undefined ? args[n - 1] : ''))
      .replace(/\$\$/g, '$');
  }

  return { SUPPORTED, init, current, t, fetchMessages };
})();
