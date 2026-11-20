/**
 * Phone number detection and normalization, per account region.
 * Shared by the content script (call icons) and the popup scanner.
 *
 * Every region detects:
 *   - international numbers with "+" or "00" (+44 20 7946 0958, 0090 532...)
 *   - its own national format:
 *       tr : 0532 123 45 67, (0212) 123 45 67, 532 123 4567, 444 1 234
 *       uk : 020 7946 0958, (020) 7946 0958, 07700 900123, 01632 960123
 *       us : (555) 123-4567, 555-123-4567, 555.123.4567, 1-555-123-4567
 *       eu : international format only (national formats differ per country)
 *
 * normalize() returns { key, dial, display }:
 *   dial    — what is sent to the web phone: E.164 ("+442079460958"), except
 *             Turkish numbers in the tr region which stay national ("05321234567")
 *   display — human-friendly form for the popup list
 */
// eslint-disable-next-line no-var
var HC_PHONE = (() => {
  'use strict';

  const S = '[\\s.\\-]?';          // optional separator
  const NATIONAL = {
    tr: [
      `(?<tr>(?:(?:\\+|00)\\s?90${S}|0${S})?\\(?0?[2-589]\\d{2}\\)?${S}\\d{3}${S}(?:\\d{2}${S}\\d{2}|\\d{4}))`,
      `(?<short>444${S}\\d(?:${S}\\d){3})`
    ],
    uk: [
      `(?<uk>(?:(?:\\+|00)\\s?44\\s?(?:\\(0\\)\\s?)?|\\(?0)\\d{2,4}\\)?[\\s\\-]?\\d{3,4}[\\s\\-]?\\d{3,4})`
    ],
    us: [
      `(?<us>(?:\\+?1${S})?\\(?[2-9]\\d{2}\\)?${S}[2-9]\\d{2}${S}\\d{4})`
    ],
    eu: []
  };
  const INTL = `(?<intl>(?:\\+|00)[1-9]\\d{0,2}(?:${S}\\(?\\d{1,4}\\)?){2,5})`;

  const cache = {};

  /** Global regex for a region (named groups tell which rule matched). */
  function regex(region) {
    const id = NATIONAL[region] ? region : 'tr';
    if (!cache[id]) {
      const alternatives = [...NATIONAL[id], INTL].join('|');
      cache[id] = new RegExp(`(?<![\\w+])(?:${alternatives})(?!\\d)`, 'g');
    }
    cache[id].lastIndex = 0;
    return cache[id];
  }

  /** Cheap pre-filter: at least 7 digits. */
  const MIN_DIGITS = /(?:\d\D{0,3}){7}/;

  function digitsOf(s) {
    return String(s || '').replace(/\D/g, '');
  }

  /** Is a regex match plausible? (length checks per rule) */
  function isValid(groups, raw) {
    const len = digitsOf(raw).length;
    if (groups.tr) return len >= 10 && len <= 14;
    if (groups.short) return len === 7;
    if (groups.uk) return len >= 10 && len <= 13;
    // US numbers are written with separators; a bare 10-digit run is more
    // likely an order or account number.
    if (groups.us) return (len === 10 || len === 11) && (/^\+/.test(raw) || /[\s().\-]/.test(raw));
    if (groups.intl) return len >= 8 && len <= 15;
    return false;
  }

  function formatTr(d) {
    if (/^0[2-58]\d{9}$/.test(d)) return d.replace(/^(\d{4})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4');
    if (/^444\d{4}$/.test(d)) return d.replace(/^(444)(\d)(\d{3})$/, '$1 $2 $3');
    return d;
  }

  /** "+44 20 7946 0958" keeps the page's grouping; "+442079460958" stays compact. */
  function formatIntl(s, intl) {
    const grouped = s.replace(/^00\s?/, '+').replace(/[\s.\-]+/g, ' ').trim();
    return /\s/.test(grouped) && grouped.startsWith('+') ? grouped : '+' + intl;
  }

  /**
   * Normalizes a raw number for a region.
   * @returns {{key: string, dial: string, display: string}|null}
   */
  function normalize(raw, region) {
    // "+44 (0)20 ..." — the "(0)" is the national trunk prefix, not part of the number.
    const s = String(raw || '').trim().replace(/\(0\)/g, '');
    let d = digitsOf(s);
    if (!d) return null;

    // International prefix "+" or "00" → country code + national number.
    let intl = null;
    if (s.startsWith('+')) intl = d;
    else if (d.startsWith('00')) intl = d.slice(2);

    if (intl !== null) {
      if (!/^[1-9]\d{6,14}$/.test(intl)) return null;
      // Turkish numbers stay national in the Türkiye region (as before).
      if (region === 'tr' && intl.startsWith('90') && intl.length === 12) {
        const n = '0' + intl.slice(2);
        return { key: n, dial: n, display: formatTr(n) };
      }
      return { key: '+' + intl, dial: '+' + intl, display: formatIntl(s, intl) };
    }

    switch (region) {
      case 'uk':
        if (/^0\d{9,10}$/.test(d)) {
          return { key: '+44' + d.slice(1), dial: '+44' + d.slice(1), display: s.replace(/\s+/g, ' ') };
        }
        return null;
      case 'us':
        if (/^1[2-9]\d{9}$/.test(d)) d = d.slice(1);
        if (/^[2-9]\d{9}$/.test(d)) {
          return { key: '+1' + d, dial: '+1' + d, display: d.replace(/^(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3') };
        }
        return null;
      case 'eu':
        return null; // only international numbers are unambiguous
      case 'tr':
      default:
        if (!s.startsWith('+') && d.startsWith('90') && d.length === 12) d = '0' + d.slice(2);
        else if (d.length === 10 && /^[2-58]/.test(d)) d = '0' + d;
        if (/^0[2-58]\d{9}$/.test(d) || /^444\d{4}$/.test(d)) return { key: d, dial: d, display: formatTr(d) };
        return null;
    }
  }

  /** All valid numbers in a text: [{ raw, index, number: {key, dial, display} }]. */
  function findAll(text, region) {
    const out = [];
    if (!text || !MIN_DIGITS.test(text)) return out;
    const re = regex(region);
    let m;
    while ((m = re.exec(text)) !== null) {
      if (!isValid(m.groups, m[0])) continue;
      const number = normalize(m[0], region);
      if (number) out.push({ raw: m[0], index: m.index, number });
    }
    return out;
  }

  /** First valid number in a text, or null. */
  function findFirst(text, region) {
    const all = findAll(text, region);
    return all.length ? all[0].number : null;
  }

  /** Number from a free selection / tel: value (user explicitly chose it). */
  function fromSelection(text, region) {
    const found = findFirst(text, region);
    if (found) return found;
    // Fall back to the selected digits as they are (e.g. an unusual format).
    const s = String(text || '').trim();
    const d = digitsOf(s);
    if (d.length < 3 || d.length > 16) return null;
    const dial = (s.startsWith('+') ? '+' : '') + d;
    return { key: dial, dial, display: dial };
  }

  return { regex, isValid, normalize, findAll, findFirst, fromSelection, MIN_DIGITS };
})();
