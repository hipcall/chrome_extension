/**
 * Hipcall Webphone — content script (every website except the web phone itself)
 *
 * 1) tel: links: clicking a tel: link calls the number with Hipcall instead of
 *    the system dialer (original behaviour of this extension).
 * 2) Call icons: phone numbers on the page (tel: links and plain text) get a
 *    small Hipcall icon; clicking it calls the number. Icons are only shown on
 *    the pages allowed in popup → Settings (default: home page only) and are
 *    added/removed live when the setting changes.
 * 3) Content loaded later (SPA navigation, infinite scroll...) is picked up by
 *    a MutationObserver.
 *
 * Calls are sent to the service worker as { type: 'call', call: <number> }.
 */
(() => {
  'use strict';

  // After the extension is reloaded the old instance is dead but its window
  // flag remains, so only bail out if a *live* instance exists.
  const isAlive = () => { try { return !!chrome.runtime.id; } catch (_) { return false; } };
  const prev = window.__hipcallClickToCall;
  if (prev && typeof prev.alive === 'function' && prev.alive()) return;
  window.__hipcallClickToCall = { alive: isAlive };

  if (!document.body) return;

  const t = (key, subs) => HC_I18N.t(key, subs);

  const PREFIX = 'hc-c2c';
  const WRAP_CLASS = `${PREFIX}-number`;
  const BTN_CLASS = `${PREFIX}-btn`;
  const STYLE_ID = `${PREFIX}-style`;
  const TOAST_ID = `${PREFIX}-toast`;
  const MARK_ATTR = 'data-hc-c2c';  // element already has an icon (element-level matches)
  // Hipcall icon (icons/hipcall-icon.svg) inlined: an <img> pointing to the
  // extension can be blocked by a site's Content-Security-Policy.
  const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false"><path fill="#025196" transform="matrix(1.3333316,0,0,-1.3334178,672.36712,202.749)" d="m 0,0 c -170.44,46.056 -347.124,-56.008 -393.145,-226.345 l -33.533,-124.512 c -5.088,-16.202 -2.544,-33.559 6.244,-48.603 8.788,-15.043 22.433,-24.995 38.621,-29.854 l 93.43,-24.996 c 16.188,-5.091 33.532,-2.545 48.565,6.248 15.032,8.795 24.976,22.45 29.832,38.651 l 24.977,93.268 c 5.088,16.202 2.544,33.559 -6.244,48.602 -8.789,15.044 -22.433,24.995 -38.621,29.855 l -90.886,24.996 c 43.246,108.081 156.333,172.883 272.195,156.682 l -24.976,-90.722 c -5.088,-16.202 -2.544,-33.559 6.244,-48.602 8.787,-15.044 22.432,-24.996 38.62,-29.855 l 93.43,-24.996 c 16.188,-5.091 33.533,-2.546 48.565,6.248 15.032,8.795 24.976,22.451 29.832,38.651 l 24.977,93.268 c 5.088,16.202 2.544,33.559 -6.244,48.602 -8.788,15.044 -22.433,24.995 -38.621,29.855 z m -246.525,-299.941 -24.976,-93.27 -93.43,24.995 24.976,93.27 z m 328.623,112.014 -93.43,24.995 24.977,93.27 93.429,-24.995 z"/></svg>';
  const TEL_LINK = 'a[href^="tel:" i]';

  // Text inside these elements is never scanned.
  const SKIP_SELECTOR = [
    'script', 'style', 'noscript', 'template', 'textarea', 'input', 'select',
    'option', 'button', 'code', 'pre', 'svg', 'canvas', 'iframe', 'head', 'title',
    '[contenteditable=""]', '[contenteditable="true"]', '[role="textbox"]',
    TEL_LINK, `.${WRAP_CLASS}`, `.${BTN_CLASS}`
  ].join(',');

  // Account region (js/config.js) decides which national formats are detected
  // (js/phone.js). Loaded in init() and updated when the setting changes.
  let region = 'tr';
  const MIN_DIGITS_REGEX = HC_PHONE.MIN_DIGITS;

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  /** Number from a tel: href ("tel:+90%20212...;ext=1" → "+90212..."). */
  function numberFromTelHref(href) {
    let raw = String(href || '').replace(/^\s*tel:/i, '');
    try { raw = decodeURIComponent(raw); } catch (_) { /* malformed: use raw */ }
    const n = HC_PHONE.fromSelection(raw.split(/[;,?]/)[0], region);
    return n ? n.dial : '';
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${WRAP_CLASS} { white-space: nowrap !important; }
      .${BTN_CLASS} {
        all: unset;
        box-sizing: border-box !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 18px !important;
        height: 18px !important;
        min-width: 18px !important;
        margin: 0 0 0 4px !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 4px !important;
        background: transparent !important;
        vertical-align: middle !important;
        line-height: 1 !important;
        cursor: pointer !important;
        opacity: 0.85;
        transition: transform .15s ease, opacity .15s ease, box-shadow .15s ease !important;
        position: relative !important;
        top: -1px !important;
      }
      .${BTN_CLASS}:hover {
        opacity: 1;
        transform: scale(1.15);
        box-shadow: 0 0 0 3px rgba(11, 79, 156, .18) !important;
      }
      .${BTN_CLASS}:active { transform: scale(.95); }
      .${BTN_CLASS}.${PREFIX}-pin-left,
      .${BTN_CLASS}.${PREFIX}-pin-right,
      .${BTN_CLASS}.${PREFIX}-pin-at {
        position: absolute !important;
        top: 50% !important;
        margin: 0 !important;
        transform: translateY(-50%);
      }
      .${BTN_CLASS}.${PREFIX}-pin-left { right: 100% !important; left: auto !important; margin-right: 6px !important; }
      .${BTN_CLASS}.${PREFIX}-pin-right { left: 100% !important; right: auto !important; margin-left: 6px !important; }
      .${BTN_CLASS}.${PREFIX}-pin-left:hover,
      .${BTN_CLASS}.${PREFIX}-pin-right:hover,
      .${BTN_CLASS}.${PREFIX}-pin-at:hover { transform: translateY(-50%) scale(1.15); }
      .${BTN_CLASS}:focus-visible {
        outline: 2px solid #0b4f9c !important;
        outline-offset: 2px !important;
      }
      .${BTN_CLASS} > svg {
        all: unset;
        display: block !important;
        width: 16px !important;
        height: 16px !important;
        max-width: none !important;
        pointer-events: none !important;
      }
      .${BTN_CLASS}.${PREFIX}-sent {
        opacity: 1;
        box-shadow: 0 0 0 3px rgba(22, 163, 74, .45) !important;
      }
      .${BTN_CLASS}.${PREFIX}-error {
        opacity: 1;
        box-shadow: 0 0 0 3px rgba(220, 38, 38, .45) !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ------------------------------------------------------------------ */
  /* Calling                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Sends the number to the service worker.
   * @param {HTMLElement} [btn] icon button to flash green/red
   */
  function call(number, btn) {
    const flash = (cls) => {
      if (!btn) return;
      btn.classList.remove(`${PREFIX}-sent`, `${PREFIX}-error`);
      btn.classList.add(cls);
      setTimeout(() => btn.classList.remove(cls), 1200);
    };

    // The extension was updated/reloaded: this page still runs the old script.
    if (!isAlive()) {
      flash(`${PREFIX}-error`);
      showToast(t('toastReloadPage'));
      return;
    }

    try {
      chrome.runtime.sendMessage({ type: 'call', call: number }, (response) => {
        if (chrome.runtime.lastError || (response && response.ok === false)) {
          const reason = (chrome.runtime.lastError && chrome.runtime.lastError.message) ||
            (response && response.error) || '';
          console.warn('[Hipcall] call failed:', reason);
          flash(`${PREFIX}-error`);
          showToast(t('toastCallFailed', [reason]));
          return;
        }
        flash(`${PREFIX}-sent`);
        showToast(t('toastCalling', [number]));
      });
    } catch (err) {
      console.warn('[Hipcall] extension context invalidated, reload the page.', err);
      flash(`${PREFIX}-error`);
      showToast(t('toastReloadPage'));
    }
  }

  let toastTimer = null;
  function showToast(text) {
    let el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = TOAST_ID;
      el.setAttribute('role', 'status');
      el.style.cssText = [
        'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
        'background:#0b4f9c', 'color:#fff', 'font:13px/1.4 system-ui,sans-serif',
        'padding:10px 14px', 'border-radius:8px', 'box-shadow:0 4px 14px rgba(0,0,0,.25)',
        'max-width:320px', 'pointer-events:none'
      ].join(';');
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
  }

  /* ------------------------------------------------------------------ */
  /* 1) tel: links → Hipcall (always on, like the original extension)    */
  /* ------------------------------------------------------------------ */

  // One delegated listener instead of one per link: also covers links added
  // later and clicks on elements *inside* a link (icon, <span>...).
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const link = e.target instanceof Element ? e.target.closest(TEL_LINK) : null;
    if (!link) return;
    const number = numberFromTelHref(link.getAttribute('href'));
    if (!number) return;
    e.preventDefault();
    call(number);
  }, true);

  /* ------------------------------------------------------------------ */
  /* 2) Call icons                                                       */
  /* ------------------------------------------------------------------ */

  function createCallButton(number) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = BTN_CLASS;
    btn.dataset.number = number;
    btn.title = t('callWithHipcall', [number]);
    btn.setAttribute('aria-label', t('callWithHipcall', [number]));

    btn.innerHTML = ICON_SVG;

    btn.addEventListener('click', onCallButtonClick, true);
    return btn;
  }

  function onCallButtonClick(event) {
    // Do not trigger the surrounding link/form.
    event.preventDefault();
    event.stopPropagation();
    const btn = event.currentTarget;
    const number = btn.dataset.number;
    if (number) call(number, btn);
  }

  function processTelLinks(root) {
    const links = [];
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (root.matches(TEL_LINK)) links.push(root);
      links.push(...root.querySelectorAll(TEL_LINK));
    }

    for (const link of links) {
      const next = link.nextElementSibling;
      if (next && next.classList.contains(BTN_CLASS)) continue; // already added
      const number = numberFromTelHref(link.getAttribute('href'));
      if (number) link.insertAdjacentElement('afterend', createCallButton(number));
    }
  }

  function isScannableTextNode(node) {
    const value = node.nodeValue;
    if (!value || value.length < 7 || !MIN_DIGITS_REGEX.test(value)) return false;
    const parent = node.parentElement;
    return !!parent && !parent.closest(SKIP_SELECTOR);
  }

  function collectTextNodes(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      return isScannableTextNode(root) ? [root] : [];
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return [];
    if (root.closest(SKIP_SELECTOR)) return [];

    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        isScannableTextNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    let current;
    while ((current = walker.nextNode())) nodes.push(current);
    return nodes;
  }

  /** Wraps every phone number of a text node in a <span> followed by an icon. */
  function processTextNode(textNode) {
    if (!textNode.isConnected || !textNode.parentNode) return;

    const text = textNode.nodeValue;
    let fragment = null;
    let lastIndex = 0;

    for (const match of HC_PHONE.findAll(text, region)) {
      const raw = match.raw;
      const number = match.number.dial;

      if (!fragment) fragment = document.createDocumentFragment();
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const wrapper = document.createElement('span');
      wrapper.className = WRAP_CLASS;
      wrapper.appendChild(document.createTextNode(raw));
      wrapper.appendChild(createCallButton(number));
      fragment.appendChild(wrapper);

      lastIndex = match.index + raw.length;
    }

    if (!fragment) return;
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    textNode.parentNode.replaceChild(fragment, textNode);
  }

  /* ---- Element-level matches ------------------------------------- */
  // Some sites (classified ads, CRMs...) make numbers hard to scrape:
  //   - split into several elements: <span>0 (532)</span><span>572 26 06</span>
  //   - kept in an attribute:        <span data-content="0532..."></span>
  //   - drawn with CSS:              span::before { content: attr(data-content) }
  // The text-node pass cannot see these, so elements are checked as a whole.

  const ATTRS = ['data-content', 'data-phone', 'data-tel', 'data-telephone', 'data-number', 'aria-label', 'title'];
  const MAX_ELEMENT_TEXT = 80;

  /** First valid phone number in a string, or null. */
  function findPhone(text) {
    const n = HC_PHONE.findFirst(text, region);
    return n ? n.dial : null;
  }


  function pseudoText(el) {
    let out = '';
    for (const pseudo of ['::before', '::after']) {
      const c = getComputedStyle(el, pseudo).content;
      if (c && c !== 'none' && c !== 'normal') out += ' ' + c.replace(/^["']|["']$/g, '');
    }
    return out;
  }

  function hasIcon(el) {
    if (el.hasAttribute(MARK_ATTR) || el.querySelector(`.${BTN_CLASS}, [${MARK_ATTR}]`)) return true;
    const next = el.nextElementSibling;
    return !!(next && next.classList.contains(BTN_CLASS));
  }

  /** Text of an element with its parts separated by spaces ("Cep" + "0 (532)…" → "Cep 0 (532)…"). */
  function joinedText(el) {
    const parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) parts.push(n.nodeValue);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Number shown by an element, from its whole text, attributes or CSS.
   * @returns {{number: string, hidden: boolean}|null} hidden: the number is not
   *          in the element's text (attribute / CSS-drawn).
   */
  function elementPhone(el) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length <= MAX_ELEMENT_TEXT) {
      const fromText = findPhone(joinedText(el));
      if (fromText) return { number: fromText, hidden: false };
    }
    if (/\d/.test(text)) return null; // has its own digits but no number → not ours
    for (const a of ATTRS) {
      const fromAttr = findPhone(el.getAttribute(a));
      if (fromAttr) return { number: fromAttr, hidden: true };
    }
    // CSS-drawn text: only for (nearly) empty leaf elements, computed styles are costly.
    if (text.length < 3 && !el.firstElementChild) {
      const fromCss = findPhone(pseudoText(el));
      if (fromCss) return { number: fromCss, hidden: true };
    }
    return null;
  }

  function addElementIcon(el, { number, hidden }) {
    el.setAttribute(MARK_ATTR, '');
    const btn = createCallButton(number);
    // Hidden numbers are drawn by the element itself (::before / attr()), so the
    // icon goes inside it: right after the number, inside the same box. Placing
    // it after the element could push it out of fixed-size contact boxes.
    if (hidden) {
      el.appendChild(btn);
      fixWrappedIcon(el, btn);
      return;
    }
    const display = getComputedStyle(el).display;
    if (display.startsWith('inline') || el.matches('a, span, b, strong, em, i, small, label')) {
      el.insertAdjacentElement('afterend', btn);
    } else {
      el.appendChild(btn);
    }
  }

  /**
   * If the site draws the number as a block (e.g. display:block ::before), the
   * appended icon falls onto a new line below it. In that case pin the icon
   * vertically centred next to the number, on the side that has free space.
   */
  function fixWrappedIcon(el, btn) {
    const er = el.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    if (!er.height || br.top - er.top <= 8) return; // same line as the number: fine

    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const parent = el.parentElement ? el.parentElement.getBoundingClientRect() : er;
    const need = br.width + 8;
    const spaceLeft = er.left - parent.left;
    const spaceRight = parent.right - er.right;
    const rightAligned = /right|end/.test(getComputedStyle(el).textAlign);

    if (spaceLeft >= need && (rightAligned || spaceRight < need)) {
      btn.classList.add(`${PREFIX}-pin-left`);   // ⟨icon⟩ 0 (554) 464 60 60
    } else if (spaceRight >= need) {
      btn.classList.add(`${PREFIX}-pin-right`);  // 0 (554) 464 60 60 ⟨icon⟩
    } else {
      // The element spans the whole box: place the icon right after the drawn text.
      const text = pseudoText(el).trim();
      const style = getComputedStyle(el, '::before');
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const width = ctx.measureText(text).width;
      btn.classList.add(`${PREFIX}-pin-at`);
      if (rightAligned) btn.style.setProperty('right', `${Math.round(width + 6)}px`, 'important');
      else btn.style.setProperty('left', `${Math.round(width + 6)}px`, 'important');
    }
  }

  function processElements(root) {
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const candidates = [root, ...root.querySelectorAll('*')].filter((el) =>
      !el.closest(SKIP_SELECTOR) && !el.closest(`[${MARK_ATTR}]`) && !hasIcon(el));

    const found = new Map();
    for (const el of candidates) {
      const match = elementPhone(el);
      if (match) found.set(el, match);
    }
    // Keep the innermost element that shows the whole number.
    for (const [el, match] of found) {
      const inner = Array.from(found.keys()).some((other) => other !== el && el.contains(other));
      if (!inner && el.isConnected && !hasIcon(el)) addElementIcon(el, match);
    }
  }

  function scan(root) {
    if (!root || !root.isConnected) return;
    processTelLinks(root);
    collectTextNodes(root).forEach(processTextNode);
    processElements(root.nodeType === Node.TEXT_NODE ? root.parentElement : root);
  }

  /* ------------------------------------------------------------------ */
  /* 3) Dynamic content                                                  */
  /* ------------------------------------------------------------------ */

  const pendingRoots = new Set();
  let flushScheduled = false;
  const OBSERVER_OPTIONS = {
    childList: true, subtree: true, characterData: true,
    // A number revealed by setting an attribute (e.g. "show phone" buttons).
    attributes: true, attributeFilter: ATTRS
  };

  function isOwnNode(node) {
    return (
      node.nodeType === Node.ELEMENT_NODE &&
      (node.classList.contains(BTN_CLASS) ||
        node.classList.contains(WRAP_CLASS) ||
        node.id === STYLE_ID ||
        node.id === TOAST_ID)
    );
  }

  function collectMutations(mutations) {
    for (const m of mutations) {
      if (m.type === 'characterData' || m.type === 'attributes') {
        if (!isOwnNode(m.target)) pendingRoots.add(m.target);
      } else {
        m.addedNodes.forEach((n) => { if (!isOwnNode(n)) pendingRoots.add(n); });
      }
    }
  }

  function scheduleFlush() {
    if (flushScheduled || pendingRoots.size === 0) return;
    flushScheduled = true;
    const run = () => {
      flushScheduled = false;
      flush();
    };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 500 });
    else setTimeout(run, 200);
  }

  function flush() {
    if (!active) { pendingRoots.clear(); return; }
    // Collect queued records first so nothing is lost, then pause observing
    // so our own DOM changes do not trigger another round.
    collectMutations(observer.takeRecords());
    observer.disconnect();

    const roots = Array.from(pendingRoots);
    pendingRoots.clear();
    try {
      roots.forEach(scan);
    } finally {
      if (active) observer.observe(document.body, OBSERVER_OPTIONS);
    }
  }

  const observer = new MutationObserver((mutations) => {
    collectMutations(mutations);
    scheduleFlush();
  });

  /* ------------------------------------------------------------------ */
  /* On/off per page (popup → Settings)                                  */
  /* ------------------------------------------------------------------ */

  let active = false;

  function activate() {
    if (active) return;
    active = true;
    injectStyles();
    scan(document.body);
    observer.observe(document.body, OBSERVER_OPTIONS);
  }

  /** Removes the icons and turns the wrapped numbers back into plain text. */
  function deactivate() {
    if (!active) return;
    active = false;
    observer.disconnect();
    pendingRoots.clear();
    document.querySelectorAll(`.${BTN_CLASS}`).forEach((b) => b.remove());
    document.querySelectorAll(`[${MARK_ATTR}]`).forEach((el) => el.removeAttribute(MARK_ATTR));
    const parents = new Set();
    document.querySelectorAll(`.${WRAP_CLASS}`).forEach((w) => {
      if (w.parentNode) parents.add(w.parentNode);
      w.replaceWith(document.createTextNode(w.textContent));
    });
    parents.forEach((p) => p.normalize());
  }

  const IS_TOP = window === window.top;
  let pageHost = location.hostname;

  /**
   * The page the user sees. Inside an iframe (CRMs, embedded panels...) the
   * site rules of the *tab* apply, so the frame asks the service worker for
   * the tab URL (a cross-origin frame cannot read window.top.location).
   */
  async function pageLocation() {
    if (IS_TOP) return location;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'tabUrl' });
      if (res && res.url) return new URL(res.url);
    } catch (_) { /* fall back to the frame's own URL */ }
    return location;
  }

  async function evaluate() {
    if (!isAlive()) return;
    const page = await pageLocation();
    pageHost = page.hostname;
    const rule = await HC_SITE_RULES.getRule(page.hostname);
    if (HC_SITE_RULES.isEnabled(rule, page.pathname)) activate();
    else deactivate();
  }

  /** Re-creates all icons (language or region changed). */
  function refresh() {
    if (active) { deactivate(); activate(); }
  }

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync') return;
    if ('language' in changes) {
      // Re-create the icons so their tooltips use the new language.
      await HC_I18N.init();
      refresh();
    }
    if ('region' in changes) {
      // Other national number formats → detect again.
      region = (await HC_CONFIG.getSettings()).region;
      refresh();
    }
    if (HC_SITE_RULES.hostKey(pageHost) in changes) evaluate();
  });

  // SPA navigation: the service worker sends PAGE_RENDERED on history changes.
  let lastPath = location.pathname;
  const onNavigate = () => {
    // Frames cannot see the tab's path change, so they always re-check.
    if (IS_TOP && location.pathname === lastPath) return;
    lastPath = location.pathname;
    evaluate();
  };
  /* ---- Right-click menu: remember the number under the cursor ---- */
  let contextNumber = null;

  // Only small elements count as "the thing that was right-clicked": climbing
  // into a big container would pick some other number on the page.
  const CONTEXT_MAX_TEXT = 40;

  /** Number shown by the right-clicked element or its immediate parents. */
  function numberAt(target) {
    let el = target instanceof Element ? target : target && target.parentElement;
    if (!el) return null;
    const link = el.closest(TEL_LINK);
    if (link) return numberFromTelHref(link.getAttribute('href'));
    const wa = el.closest('a[href*="wa.me/"], a[href*="whatsapp.com/send"], a[href^="whatsapp:"], a[href^="sms:" i], a[href^="callto:" i]');
    if (wa) {
      let href = wa.getAttribute('href') || '';
      try { href = decodeURIComponent(href); } catch (_) { /* keep as is */ }
      const m = href.match(/(?:wa\.me\/|phone=|sms:|callto:)\s*\+?([\d\s().\-]{7,})/i);
      if (m) {
        const raw = /^(sms|callto):/i.test(href) ? m[1] : '+' + m[1].replace(/\D/g, '');
        const n = HC_PHONE.fromSelection(raw, region);
        if (n) return n.dial;
      }
    }
    // Typed into a form field, or the alt text of a number shown as an image.
    if (el.matches('input, textarea')) return findPhone(el.value) || null;
    if (el.matches('img, [role="img"]')) {
      return findPhone(el.getAttribute('alt')) || findPhone(el.getAttribute('title')) ||
        findPhone(el.getAttribute('aria-label')) || null;
    }

    for (let depth = 0; el && depth < 3; depth++, el = el.parentElement) {
      if (el === document.body || el === document.documentElement) break;
      if (el.classList.contains(BTN_CLASS)) return el.dataset.number;
      if ((el.textContent || '').trim().length > CONTEXT_MAX_TEXT) break;
      const icon = el.querySelector(`.${BTN_CLASS}`);
      if (icon) return icon.dataset.number;
      const match = elementPhone(el);
      if (match) return match.number;
      // e.g. right-click beside a CSS-drawn number inside the same small box
      for (const child of el.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) {
        const inner = elementPhone(child);
        if (inner) return inner.number;
      }
    }
    return null;
  }

  /** Elements under a point, top to bottom, including inside open shadow roots. */
  function elementsAt(x, y) {
    const out = [];
    const visit = (root) => {
      for (const el of root.elementsFromPoint(x, y)) {
        if (out.includes(el)) continue;
        out.push(el);
        if (el.shadowRoot && el.shadowRoot !== root) visit(el.shadowRoot);
      }
    };
    try { visit(document); } catch (_) { /* ignore */ }
    return out;
  }

  /**
   * Number under the cursor. Not only the event target: sites often put a
   * transparent layer over phone numbers (anti-copy) or block selection, so
   * every element under the cursor is checked, topmost first.
   */
  function numberAtPoint(e) {
    const candidates = [e.target, ...(e.composedPath ? e.composedPath().slice(0, 3) : []),
      ...elementsAt(e.clientX, e.clientY).slice(0, 12)];
    for (const el of candidates) {
      if (!(el instanceof Element) || el === document.body || el === document.documentElement) continue;
      const n = numberAt(el);
      if (n) return n;
    }
    return null;
  }

  // Captured as early as possible: some sites stop the "contextmenu" event,
  // but rarely the right-button "pointerdown"/"mousedown" before it.
  const rememberContext = (e) => {
    if (e.type !== 'contextmenu' && e.button !== 2) return;
    try { contextNumber = numberAtPoint(e); } catch (_) { contextNumber = null; }
  };
  for (const type of ['pointerdown', 'mousedown', 'contextmenu']) {
    window.addEventListener(type, rememberContext, true);
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request) return false;
    if (request.type === 'pageRendered') onNavigate();
    if (request.type === 'contextNumber') sendResponse({ number: contextNumber });
    return false;
  });
  window.addEventListener('popstate', onNavigate);

  Promise.all([
    HC_I18N.init(),
    HC_CONFIG.getSettings().then((settings) => { region = settings.region; })
  ]).catch(() => {}).finally(evaluate);
})();
