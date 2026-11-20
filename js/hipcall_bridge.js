/**
 * Hipcall Webphone — bridge script, runs inside the web phone tab only.
 *
 * The web phone is a Flutter Web (CanvasKit) app: the UI is drawn on a
 * <canvas> and synthetic DOM events are usually ignored. To type a number:
 *
 *   1) Flutter's accessibility (semantics) layer is enabled, which exposes the
 *      keys, the number field and the call button as <flt-semantics> elements
 *      with labels ("2 ABC", "0 +") and on-screen positions.
 *   2) Preferred: click the number field, clear it (Ctrl+A, Backspace) and
 *      insert the whole number at once — all as *trusted* input sent by the
 *      service worker through chrome.debugger.
 *   3) Fallback: press the keypad keys one by one. The first key press detects
 *      which method changes the screen and remembers it:
 *        trusted   : real mouse click through chrome.debugger
 *        semantics : click() on the <flt-semantics> node (SemanticsAction.tap)
 *        pointer   : pointerdown/pointerup at the key's coordinates
 *        keyboard  : keydown/keyup events
 *        input     : last resort, input.value + input/change events
 *   4) If autoDial is on and the number is verified, the call button is pressed.
 */
(() => {
  'use strict';

  // After the extension is reloaded the old instance is dead but its window
  // flag remains, so only bail out if a *live* instance exists.
  const isAlive = () => { try { return !!chrome.runtime.id; } catch (_) { return false; } };
  const prev = window.__hipcallDialerBridge;
  if (prev && typeof prev.alive === 'function' && prev.alive()) return;
  window.__hipcallDialerBridge = { alive: isAlive };


  // Dialer route of the web phone and UI labels in Turkish and English.
  const DIALER_PATH = /^\/(calls|phone\/dialpad)(\/|$)/;
  // Flutter may add more to a menu item's label ("Ara\nTab 3 of 7"), so only
  // the first word counts.
  const DIALER_MENU_LABEL = /^(ara|arama|call|calls|dial|dialer|dialpad|keypad)(\b|$)/i;
  const NUMBER_HINT_LABEL = /(telefon numaras|numara girin|phone number|enter (a )?number)/i;
  const CALL_BUTTON_LABEL = /^(ara|arama yap|call|dial)$/i;

  const WAIT_TIMEOUT_MS = 20000;   // max wait for the app to load
  const KEY_PRESS_DELAY_MS = 60;  // between two key presses (fallback)
  const SETTLE_MS = 250;           // for the screen to update after a press

  const log = (...args) => console.log('[Hipcall]', ...args);

  /** Can the service worker send trusted input (debugger attached)? */
  let trustedAvailable = false;
  /** Press the call button after the number is entered (popup setting). */
  let autoDial = true;
  /** Set when the debugger was freshly attached for this request (infobar → resize). */
  let debuggerAttachedAt = null;

  // Time of the last window resize. The debugger infobar resizes the page;
  // coordinates are only correct after that.
  let lastResizeAt = 0;
  window.addEventListener('resize', () => { lastResizeAt = Date.now(); });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || sender.id !== chrome.runtime.id) return false;

    if (message.type === 'hipcallPing') {
      sendResponse({ ok: true });
      return false;
    }
    if (message.type !== 'fillDialer') return false;

    const data = message.data || {};
    trustedAvailable = !!data.trusted;
    debuggerAttachedAt = data.attachedAt || null;
    autoDial = data.autoDial !== false;
    // The debugger may have been re-attached, so the remembered method may be stale.
    if (tapMode === 'trusted' && !trustedAvailable) tapMode = null;
    if (trustedAvailable && tapMode !== 'trusted') tapMode = null;

    fillDialer(data.number)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => {
        console.warn('[Hipcall] could not type the number:', err);
        dumpSemantics();
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
      });

    return true; // async response
  });

  // Queue requests so consecutive calls do not interleave.
  let queue = Promise.resolve();
  function fillDialer(number) {
    const run = () => doFillDialer(number);
    queue = queue.then(run, run);
    return queue;
  }

  // Warm-up: enable the semantics layer as soon as the web phone loads,
  // so the first call does not have to wait for it.
  setTimeout(() => {
    enableFlutterSemantics().catch(() => { /* ilk aramada tekrar denenir */ });
  }, 0);

  /** Press method detected as working (remembered until reload). */
  let tapMode = null;

  async function doFillDialer(rawNumber) {
    const number = normalizeNumber(rawNumber);   // digits only, for the keypad
    if (!number) throw new Error('Empty number.');
    // Typed into the field: keep "+" (works for every country, unlike "00",
    // e.g. the US uses 011). Turkish numbers arrive already national ("0532...").
    const typed = /^\s*\+/.test(String(rawNumber)) ? '+' + String(rawNumber).replace(/\D/g, '') : number;

    await enableFlutterSemantics();
    await ensureOnDialerPage();
    await waitForDebuggerLayout();

    const keypad = await waitFor(findKeypad, WAIT_TIMEOUT_MS);

    // 1st choice: click the field, clear it, insert the number at once.
    let pasted = false;
    if (trustedAvailable) {
      try {
        pasted = await pasteIntoField(typed, keypad);
      } catch (err) {
        log('Paste method failed:', err && err.message);
      }
    }

    // 2nd choice (fallback): press the keypad keys one by one.
    if (!pasted) {
      if (!keypad) {
        log('Keypad not found, trying input fallback.');
        await typeIntoInput(number);
      } else {
        await clearDisplay();
        log('Typing with keypad:', number);
        await typeWithKeypad(number);
      }
    }

    let verified = pasted;
    if (!verified) {
      verified = !!(await waitFor(() => displayContains(number), SETTLE_MS, 25));
    }
    log(verified ? 'Number verified on screen.' : 'Warning: number could not be verified on screen.');
    if (!verified) dumpSemantics();

    if (!autoDial) return { dialed: false, mode: tapMode, verified };
    // Never press "call" for a number we could not see on screen: a partial or
    // wrong number would be dialled. The user can still press the button.
    if (!verified) throw new Error('Number could not be verified on screen; call not started.');
    // Give the field one frame before pressing the call button.
    if (pasted) await nextFrames(1);

    const callButton = findCallButton();
    if (!callButton) throw new Error('Number entered but the call button was not found.');

    await tap(callButton, tapMode || (trustedAvailable ? 'trusted' : 'semantics'));
    log('Call started:', number, '| method:', tapMode);
    return { dialed: true, mode: tapMode, verified };
  }

  /* ------------------------------------------------------------------ */
  /* Paste method                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Center of the number field ("Enter phone number").
   * Uses the semantics input / hint text; otherwise the row right above the
   * keypad (above 1-2-3) is computed from the layout.
   */
  function findFieldPoint(keypad) {
    const rect = getDisplayRect();
    if (rect && rect.width > 0) {
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    if (keypad) {
      const two = keypad['2'].getBoundingClientRect();
      return { x: two.left + two.width / 2, y: two.top - two.height * 1.4 };
    }
    return null;
  }

  /** Alana odaklan → Ctrl+A + Backspace ile temizle → Input.insertText ile yaz. */
  async function pasteIntoField(number, keypad) {
    const point = findFieldPoint(keypad);
    if (!point) throw new Error('Number field not found.');

    log('Pasting into number field:', number);
    await trustedTap(point.x, point.y);
    // Continue as soon as the field is focused (no fixed delay).
    await waitFor(isTextInputFocused, 250, 15);

    // Debugger commands are processed in order; no delay needed between them.
    await trustedInput({ op: 'selectAllDelete' });
    await trustedInput({ op: 'insertText', text: number });

    // Continue as soon as the number is on screen (max 500 ms).
    if (await waitFor(() => displayContains(number), 500, 25)) {
      log('Paste succeeded.');
      return true;
    }

    // Not verified: maybe typed but unreadable, maybe not typed at all.
    // Clear the field again so the keypad fallback does not type it twice.
    log('Paste not verified; clearing field and falling back to keypad.');
    await trustedTap(point.x, point.y);
    await waitFor(isTextInputFocused, 250, 15);
    await trustedInput({ op: 'selectAllDelete' });
    await nextFrames(2);
    return false;
  }

  function isTextInputFocused() {
    const el = document.activeElement;
    return !!el && /^(INPUT|TEXTAREA)$/.test(el.tagName);
  }

  /** Waits for n animation frames (~16 ms each). */
  function nextFrames(n = 1) {
    return new Promise((resolve) => {
      const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    });
  }

  /**
   * A freshly attached debugger shows an infobar that shrinks the page.
   * If the resize already happened just wait 2 frames for Flutter to relayout,
   * otherwise wait for the resize (max 400 ms). No wait if already attached.
   */
  async function waitForDebuggerLayout() {
    if (!trustedAvailable || !debuggerAttachedAt) return;
    if (lastResizeAt < debuggerAttachedAt) {
      await waitFor(() => lastResizeAt >= debuggerAttachedAt, 400, 15);
    }
    await nextFrames(2);
  }

  async function trustedInput(payload) {
    const res = await chrome.runtime.sendMessage({ type: 'trustedInput', ...payload });
    if (!res || !res.ok) throw new Error('Trusted key input failed: ' + (res && res.error));
  }

  /* ------------------------------------------------------------------ */
  /* Numara normalizasyonu                                               */
  /* ------------------------------------------------------------------ */

  /**
   * The keypad has no "+" key, so the number is converted to digits:
   *   +90 532 123 45 67 → 05321234567, 5321234567 → 05321234567, +44... → 0044...
   */
  function normalizeNumber(raw) {
    const str = String(raw || '').trim();
    const hasPlus = str.startsWith('+');
    let digits = str.replace(/\D/g, '');
    if (!digits) return '';

    if (hasPlus) digits = '00' + digits;

    if (digits.startsWith('0090') && digits.length === 14) {
      digits = '0' + digits.slice(4);
    } else if (!hasPlus && digits.startsWith('90') && digits.length === 12) {
      digits = '0' + digits.slice(2);
    } else if (digits.length === 10 && /^[2-58]/.test(digits)) {
      digits = '0' + digits;
    }
    return digits;
  }

  /* ------------------------------------------------------------------ */
  /* Flutter semantics layer                                             */
  /* ------------------------------------------------------------------ */

  function semanticsReady() {
    const host = document.querySelector('flt-semantics-host');
    return !!(host && host.querySelector('flt-semantics'));
  }

  async function enableFlutterSemantics() {
    if (semanticsReady()) return;

    const placeholder = await waitFor(
      () => document.querySelector('flt-semantics-placeholder') || (semanticsReady() && 'ready'),
      WAIT_TIMEOUT_MS
    );
    if (placeholder === 'ready') return;
    if (!placeholder) throw new Error('Flutter app did not load.');

    log('Enabling Flutter semantics...');
    placeholder.click();
    if (await waitFor(semanticsReady, 3000)) return;

    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      placeholder.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true }));
    }
    if (await waitFor(semanticsReady, 3000)) return;

    throw new Error('Could not enable Flutter semantics.');
  }

  const TAPPABLE_SELECTOR =
    'flt-semantics[flt-tappable], flt-semantics[role="button"], flt-semantics[role="link"], ' +
    'flt-semantics[role="tab"], flt-semantics[role="menuitem"]';

  function allSemanticsNodes() {
    return Array.from(document.querySelectorAll('flt-semantics')).filter(isVisible);
  }

  function getTappables() {
    return Array.from(document.querySelectorAll(TAPPABLE_SELECTOR)).filter(isVisible);
  }

  function isTappable(el) {
    return !!el && el.matches(TAPPABLE_SELECTOR);
  }

  function getLabel(el) {
    const seen = new Set();
    const add = (val) => {
      const s = (val || '').replace(/\s+/g, ' ').trim();
      if (s && !seen.has(s)) seen.add(s);
    };
    add(el.getAttribute('aria-label'));
    el.querySelectorAll('[aria-label]').forEach((c) => add(c.getAttribute('aria-label')));
    if (seen.size === 0 && el.textContent) add(el.textContent);
    return Array.from(seen).join(' ').trim();
  }

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function center(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
  }

  /* ------------------------------------------------------------------ */
  /* Locating UI elements                                                */
  /* ------------------------------------------------------------------ */

  /**
   * The web phone may be on another screen (Home, Chats...). Switch to the
   * dialer through the side menu (keeps the app state). If that does not work
   * within a few seconds, ask the service worker to load the dialer URL.
   */
  async function ensureOnDialerPage() {
    if (DIALER_PATH.test(location.pathname)) return;

    const menuItem = await waitFor(findDialerMenuItem, 3000, 100);
    if (menuItem) {
      log('Switching to the dialer screen...');
      await tap(menuItem, tapMode || (trustedAvailable ? 'trusted' : 'semantics'));
      if (await waitFor(() => DIALER_PATH.test(location.pathname), 3000, 30)) {
        await waitFor(findKeypad, 3000, 50);
        return;
      }
    }
    log('Could not open the dialer from the menu; asking for a reload on the dialer URL.');
    throw new Error('NAVIGATE_TO_DIALER');
  }

  /** Side-menu entry of the dialer ("Ara" / "Call"), leftmost on screen. */
  function findDialerMenuItem() {
    const sideLimit = window.innerWidth * 0.35;
    const seen = new Set();
    const candidates = [];
    for (const node of [...getTappables(), ...allSemanticsNodes()]) {
      if (seen.has(node)) continue;
      seen.add(node);
      if (!DIALER_MENU_LABEL.test(getLabel(node))) continue;
      const c = center(node);
      if (c.x > sideLimit) continue; // not the keypad's call button etc.
      const el = isTappable(node) ? node : (node.closest(TAPPABLE_SELECTOR) || node);
      candidates.push({ el, x: c.x });
    }
    candidates.sort((a, b) => a.x - b.x);
    return candidates.length ? candidates[0].el : null;
  }

  /**
   * Keypad map: { '0': el, ..., '9': el, '*': el, '#': el }
   * Looks for nodes labelled like "2 ABC", "7 PQRS", "0 +". If a digit has
   * several candidates, the tappable / largest one wins.
   */
  function findKeypad() {
    const best = {};
    const keyPattern = /^([0-9*#])(?:\s*(?:ABC|DEF|GHI|JKL|MNO|PQRS|TUV|WXYZ|\+))?$/i;
    for (const node of allSemanticsNodes()) {
      const label = getLabel(node);
      if (!label || label.length > 10) continue;
      const m = label.match(keyPattern);
      if (!m) continue;

      const el = isTappable(node) ? node : (node.closest(TAPPABLE_SELECTOR) || node);
      const r = el.getBoundingClientRect();
      const score = (isTappable(el) ? 1e9 : 0) + r.width * r.height;
      if (!best[m[1]] || score > best[m[1]].score) best[m[1]] = { el, score };
    }

    const keys = {};
    for (const k of Object.keys(best)) keys[k] = best[k].el;
    for (let d = 0; d <= 9; d++) if (!keys[String(d)]) return null;
    return keys;
  }

  function findPhoneInputs() {
    return Array.from(document.querySelectorAll(
      'flt-semantics-host input, flt-semantics-host textarea, ' +
      'flt-text-editing-host input, flt-text-editing-host textarea'
    ));
  }

  /** The number display (row above the keypad). */
  function getDisplayRect() {
    const input = findPhoneInputs().find(isVisible);
    if (input) return input.getBoundingClientRect();

    const hint = allSemanticsNodes().find((n) => NUMBER_HINT_LABEL.test(getLabel(n)));
    return hint ? hint.getBoundingClientRect() : null;
  }

  /** All texts in the semantics tree. */
  function screenTexts() {
    const texts = [];
    for (const n of document.querySelectorAll('flt-semantics')) {
      const label = n.getAttribute('aria-label');
      if (label) texts.push(label);
    }
    for (const input of findPhoneInputs()) {
      if (input.value) texts.push(input.value);
      const label = input.getAttribute('aria-label');
      if (label) texts.push(label);
    }
    const host = document.querySelector('flt-semantics-host');
    if (host && host.textContent) texts.push(host.textContent);
    return texts;
  }

  function screenSignature() {
    const nodeCount = document.querySelectorAll('flt-semantics').length;
    return `${nodeCount}:${screenTexts().join('|')}`;
  }

  function displayContains(number) {
    const digits = String(number).replace(/\D/g, '');
    return screenTexts().some((t) => t.replace(/\D/g, '').includes(digits));
  }

  /** Digits currently shown in the number row (excluding key labels). */
  function readDisplayDigits() {
    const display = getDisplayRect();
    const keypad = findKeypad();
    if (!display || !keypad) return '';
    const keyTop = keypad['1'].getBoundingClientRect().top;

    let digits = '';
    for (const input of findPhoneInputs()) digits += (input.value || '').replace(/\D/g, '');
    for (const n of allSemanticsNodes()) {
      const r = n.getBoundingClientRect();
      if (r.bottom > keyTop) continue;
      if (r.bottom < display.top - 10 || r.top > display.bottom + 10) continue;
      const label = n.getAttribute('aria-label') || '';
      const d = label.replace(/\D/g, '');
      if (d.length > digits.length) digits = d;
    }
    return digits;
  }

  /** Backspace button on the right of the number row. */
  function findBackspaceButton() {
    const display = getDisplayRect();
    const keypad = findKeypad();
    if (!display || !keypad) return null;
    const keySet = new Set(Object.values(keypad));
    const displayMidY = display.top + display.height / 2;
    const keypadLeft = keypad['1'].getBoundingClientRect().left;

    return getTappables()
      .filter((el) => !keySet.has(el))
      .map((el) => ({ el, c: center(el) }))
      .filter(({ c }) =>
        Math.abs(c.y - displayMidY) < Math.max(30, display.height) &&
        c.x > keypadLeft)
      .sort((a, b) => b.c.x - a.c.x)
      .map(({ el }) => el)[0] || null;
  }

  /** Call button: the tappable element right below the "0" key. */
  function findCallButton() {
    const keypad = findKeypad();
    const tappables = getTappables();

    if (keypad) {
      const keySet = new Set(Object.values(keypad));
      const zero = center(keypad['0']);
      const candidate = tappables
        .filter((el) => !keySet.has(el))
        .map((el) => ({ el, c: center(el) }))
        .filter(({ c }) =>
          c.y > zero.rect.bottom - 2 && Math.abs(c.x - zero.x) < zero.rect.width * 0.75)
        .sort((a, b) => a.c.y - b.c.y)[0];
      if (candidate) return candidate.el;

      // Virtual target so it can still be pressed by coordinates.
      return {
        virtual: true,
        point: { x: zero.x, y: zero.rect.bottom + zero.rect.height * 0.9 }
      };
    }

    return tappables
      .filter((el) => CALL_BUTTON_LABEL.test(getLabel(el)))
      .filter((el) => center(el).x > window.innerWidth * 0.25)
      .sort((a, b) => center(b).y - center(a).y)[0] || null;
  }

  /* ------------------------------------------------------------------ */
  /* Press methods                                                       */
  /* ------------------------------------------------------------------ */

  async function tap(target, mode, char) {
    const point = target.virtual ? target.point : center(target);

    switch (mode) {
      case 'trusted':
        return trustedTap(point.x, point.y);
      case 'semantics':
        if (target.virtual) return pointerTap(point.x, point.y);
        target.click();
        return;
      case 'pointer':
        return pointerTap(point.x, point.y);
      case 'keyboard':
        if (char != null) return keyboardPress(char);
        return pointerTap(point.x, point.y);
      default:
        return pointerTap(point.x, point.y);
    }
  }

  /** Trusted (isTrusted) click via chrome.debugger in the service worker. */
  async function trustedTap(x, y) {
    const res = await chrome.runtime.sendMessage({
      type: 'trustedTap', x: Math.round(x), y: Math.round(y)
    });
    if (!res || !res.ok) throw new Error('Trusted click failed: ' + (res && res.error));
  }

  async function pointerTap(x, y) {
    const glass = document.querySelector('flt-glass-pane');
    const target = (glass && glass.shadowRoot && glass.shadowRoot.firstElementChild) ||
      glass ||
      document.querySelector('flutter-view') ||
      document.body;
    const base = {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: x, clientY: y, screenX: x, screenY: y,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0
    };
    target.dispatchEvent(new PointerEvent('pointermove', { ...base, buttons: 0 }));
    target.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1, pressure: 0.5 }));
    await sleep(20);
    target.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, pressure: 0 }));
  }

  function keyboardPress(char) {
    const target = document.activeElement && document.activeElement !== document.body
      ? document.activeElement
      : (document.querySelector('flutter-view') || document.body);
    const isDigit = /\d/.test(char);
    const init = {
      key: char,
      code: isDigit ? `Digit${char}` : '',
      keyCode: isDigit ? 48 + Number(char) : 0,
      which: isDigit ? 48 + Number(char) : 0,
      bubbles: true, cancelable: true, composed: true
    };
    target.dispatchEvent(new KeyboardEvent('keydown', init));
    target.dispatchEvent(new KeyboardEvent('keypress', init));
    target.dispatchEvent(new KeyboardEvent('keyup', init));
  }

  /**
   * Presses a target. If tapMode is unknown, tries the methods in order and
   * remembers the first one that changes the screen.
   */
  async function tapAndDetect(target, char) {
    if (tapMode) {
      await tap(target, tapMode, char);
      return true;
    }

    const modes = [];
    if (trustedAvailable) modes.push('trusted');
    if (!target.virtual && isTappable(target)) modes.push('semantics');
    modes.push('pointer');
    if (char != null) modes.push('keyboard');

    for (const mode of modes) {
      const before = screenSignature();
      try {
        await tap(target, mode, char);
      } catch (err) {
        log('Method failed:', mode, err && err.message);
        continue;
      }
      await sleep(SETTLE_MS);
      if (screenSignature() !== before) {
        tapMode = mode;
        log('Working press method:', mode);
        return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Yazma / silme                                                       */
  /* ------------------------------------------------------------------ */

  async function clearDisplay() {
    let existing = readDisplayDigits();
    if (!existing) return;

    const backspace = findBackspaceButton();
    if (!backspace) {
      log('Warning: old number on screen but no backspace button:', existing);
      return;
    }

    log('Clearing old number:', existing);
    if (!(await tapAndDetect(backspace))) return;

    for (let i = 0; i < 30; i++) {
      existing = readDisplayDigits();
      if (!existing) return;
      await tap(backspace, tapMode);
      await sleep(KEY_PRESS_DELAY_MS);
    }
  }

  async function typeWithKeypad(number) {
    const chars = number.split('');

    // First key: detect the working method.
    let keypad = findKeypad();
    if (!(await tapAndDetect(keypad[chars[0]], chars[0]))) {
      throw new Error('Could not press the keypad (no method changed the screen).');
    }

    for (const ch of chars.slice(1)) {
      await sleep(KEY_PRESS_DELAY_MS);
      if (!keypad[ch] || !keypad[ch].isConnected) keypad = findKeypad();
      if (!keypad || !keypad[ch]) throw new Error(`Key "${ch}" not found on keypad.`);
      await tap(keypad[ch], tapMode, ch);
    }
  }

  async function typeIntoInput(number) {
    const input = findPhoneInputs().find(isVisible) || findPhoneInputs()[0];
    if (!input) throw new Error('Neither number field nor keypad found.');

    input.focus();
    input.click();
    for (const delay of [0, 250, 500, 800]) {
      await sleep(delay);
      const el = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)
        ? document.activeElement
        : input;
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, number);
      try { el.setSelectionRange(number.length, number.length); } catch (_) { /* yoksay */ }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (displayContains(number)) tapMode = tapMode || 'semantics';
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitFor(fn, timeoutMs, intervalMs = 150) {
    const end = Date.now() + timeoutMs;
    while (true) {
      try {
        const result = fn();
        if (result) return result;
      } catch (_) { /* yoksay */ }
      if (Date.now() >= end) return null;
      await sleep(intervalMs);
    }
  }

  /** Dumps the semantics tree to the console for diagnostics. */
  function dumpSemantics() {
    const rows = allSemanticsNodes().map((el) => {
      const r = el.getBoundingClientRect();
      return {
        role: el.getAttribute('role') || '',
        tappable: el.hasAttribute('flt-tappable'),
        label: (el.getAttribute('aria-label') || '').slice(0, 50),
        text: getLabel(el).slice(0, 50),
        x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height)
      };
    });
    const inputs = findPhoneInputs().map((el) => ({
      tag: el.tagName,
      label: el.getAttribute('aria-label'),
      readOnly: el.readOnly,
      value: el.value
    }));

    console.groupCollapsed('[Hipcall] Diagnostics: semantics tree (send this to the developer)');
    console.log('URL:', location.href, '| tapMode:', tapMode,
      '| keypad:', !!findKeypad(), '| semantics node:', rows.length);
    console.table(rows);
    console.table(inputs);
    console.groupEnd();
  }
})();
