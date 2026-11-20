/**
 * Hipcall Webphone — service worker
 *
 * - Click to call goes through the Hipcall desktop (desktop.hipcall.com(.tr),
 *   as a browser tab or installed app). If it is not open, the web phone is
 *   opened in the extension's popup window instead (region → server, see
 *   js/config.js). If the number cannot be typed (e.g. not signed in), a
 *   notification tells the user.
 * - Click to call: receives { type: 'call', call: <number> } from content
 *   scripts / popup, brings the web phone to front and types the number into it.
 * - Shows a notification when the web phone window is closed (no incoming calls).
 *
 * Typing into the web phone: the web phone is a Flutter (canvas) app that
 * ignores synthetic DOM events. The bridge script (js/hipcall_bridge.js) finds
 * the number field / keypad, and this worker performs *trusted* clicks and
 * text input on it through chrome.debugger. If the debugger cannot attach
 * (e.g. DevTools is open on that tab) the bridge falls back to DOM events.
 */
importScripts('js/config.js', 'js/i18n.js', 'js/phone.js');

const DEBUGGER_VERSION = '1.3';
// Keep the debugger attached for a while after a call so consecutive calls are
// instant (no re-attach, no infobar flicker). 0 = detach right after each call.
const KEEP_ATTACHED_MS = 15000;

const t = (key, subs) => HC_I18N.t(key, subs);
const log = (...a) => console.log('[Hipcall]', ...a);

/* ------------------------------------------------------------------ */
/* Install / settings                                                  */
/* ------------------------------------------------------------------ */

chrome.runtime.onInstalled.addListener(async () => {
  // Resolve the region once so it stays stable even if the browser language changes.
  const { region } = await chrome.storage.sync.get('region');
  if (!HC_CONFIG.REGIONS[region]) {
    await HC_CONFIG.setSettings({ region: HC_CONFIG.defaultRegion() });
  }
  await createContextMenu();
});

/* ------------------------------------------------------------------ */
/* Right-click menu: "Call with Hipcall" on selected text              */
/* (fallback for numbers the page scan cannot detect)                  */
/* ------------------------------------------------------------------ */

const MENU_ID = 'hipcall-call-selection';   // on selected text: shows the selection
const MENU_ID_ANY = 'hipcall-call-here';     // anywhere else: number under the cursor

async function createContextMenu() {
  await HC_I18N.init();
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: t('menuCallSelection', ['%s']), // %s = the selected text (Chrome fills it in)
    contexts: ['selection']
  });
  // Numbers often cannot be selected (links, CSS-drawn numbers like on
  // sahibinden.com), so the item is also offered on links and the page.
  chrome.contextMenus.create({
    id: MENU_ID_ANY,
    title: t('menuCallHere'),
    contexts: ['page', 'link', 'frame', 'image', 'editable']
  });
}

// The menu must exist after every start (install, update, browser restart).
chrome.runtime.onStartup.addListener(() => { createContextMenu().catch(() => {}); });

// Menu title follows the language setting.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && 'language' in changes) createContextMenu().catch(() => {});
});

chrome.contextMenus.onClicked.addListener((info, tab) => { onMenuClicked(info, tab); });

/** Number from a tel:, WhatsApp or sms: link URL. */
function numberFromLink(url, region) {
  if (!url) return null;
  try { url = decodeURIComponent(url); } catch (_) { /* keep as is */ }
  let m = String(url).match(/^\s*(?:tel|callto|sms):([^;?,]+)/i);
  if (m) {
    let raw = m[1];
    try { raw = decodeURIComponent(raw); } catch (_) { /* keep raw */ }
    return HC_PHONE.fromSelection(raw, region);
  }
  m = String(url).match(/(?:wa\.me\/|whatsapp\.com\/send\/?\?(?:.*&)?phone=|whatsapp:\/\/send\?(?:.*&)?phone=)\s*\+?([\d\s().\-]{8,20})/i);
  return m ? HC_PHONE.fromSelection('+' + m[1].replace(/\D/g, ''), region) : null;
}

/**
 * Number under the cursor, remembered by the content script on right-click.
 * @returns {Promise<{number: string|null, noScript?: boolean}>}
 */
async function numberUnderCursor(tab, frameId) {
  if (!tab || tab.id == null) return { number: null, noScript: true };
  const ask = chrome.tabs.sendMessage(tab.id, { type: 'contextNumber' }, { frameId: frameId || 0 })
    .then((res) => ({ number: res && res.number ? res.number : null }))
    // No (live) content script: page opened before the extension was
    // installed/reloaded, or a page extensions cannot run on.
    .catch(() => ({ number: null, noScript: true }));
  const timeout = new Promise((resolve) => setTimeout(() => resolve({ number: null, noScript: true }), 1000));
  return Promise.race([ask, timeout]);
}

async function onMenuClicked(info, tab) {
  if (info.menuItemId !== MENU_ID && info.menuItemId !== MENU_ID_ANY) return;
  const { region } = await HC_CONFIG.getSettings();
  // Selection first, then the link, then whatever element was right-clicked.
  let found = info.selectionText ? HC_PHONE.fromSelection(info.selectionText, region) : null;
  if (!found) found = numberFromLink(info.linkUrl, region);
  let noScript = false;
  if (!found) {
    const res = await numberUnderCursor(tab, info.frameId);
    if (res.number) found = { dial: res.number };
    noScript = !!res.noScript;
  }
  const number = found && sanitizeNumber(found.dial);
  if (!number) {
    await HC_I18N.init();
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/logo.png',
      title: t('menuNoNumberTitle'),
      message: info.selectionText
        ? t('menuNoNumberText', [String(info.selectionText).slice(0, 40)])
        : noScript ? t('toastReloadPage') : t('menuNoNumberHere')
    });
    return;
  }
  const { tabId, created } = await openWebphone();
  runFill(tabId, number, created);
}

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request) return false;

  // Click to call (original message format of this extension).
  if (request.type === 'call') {
    const number = sanitizeNumber(request.call);
    if (!number) {
      sendResponse({ ok: false, error: 'invalid number' });
      return false;
    }
    openWebphone()
      .then(({ tabId, created }) => {
        sendResponse({ ok: true });
        return runFill(tabId, number, created);
      })
      .catch((err) => {
        console.error('[Hipcall] call failed:', err);
        sendResponse({ ok: false, error: errText(err) });
      });
    return true;
  }

  // Content script inside an iframe asks for the tab's URL (site rules apply
  // to the page the user sees, not to the embedded frame).
  if (request.type === 'tabUrl') {
    sendResponse({ url: sender.tab ? sender.tab.url : null });
    return false;
  }

  // Translations for content scripts (see js/i18n.js).
  if (request.type === 'getMessages') {
    HC_I18N.fetchMessages(request.lang)
      .then((messages) => sendResponse({ messages }))
      .catch(() => sendResponse({ messages: null }));
    return true;
  }

  // Popup button "Open web phone": always the extension's own window.
  if (request.type === 'openWebphone') {
    openPopupWindow()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: errText(err) }));
    return true;
  }

  // Region changed in settings: an open extension window is switched to the
  // new server the next time it is opened (see openPopupWindow).
  if (request.type === 'regionChanged') {
    sendResponse({ ok: true });
    return false;
  }

  // From js/hipcall_bridge.js: trusted input on the web phone tab.
  if (request.type === 'trustedTap' || request.type === 'trustedInput') {
    // Only the bridge running inside a Hipcall web phone page may ask for it.
    if (!sender.tab || !HC_CONFIG.isWebphoneUrl(sender.tab.url || '')) {
      sendResponse({ ok: false, error: 'not a web phone tab' });
      return false;
    }
    const tabId = sender.tab.id;
    const job = request.type === 'trustedTap'
      ? trustedClick(tabId, request.x, request.y)
      : trustedInput(tabId, request);
    job
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: errText(err) }));
    return true;
  }

  return false;
});

/* ------------------------------------------------------------------ */
/* Web phone window                                                    */
/* ------------------------------------------------------------------ */

// The service worker can be stopped at any time, so the popup window id is
// kept in session storage instead of a variable.
async function getPopupWindowId() {
  const { popupWindowId } = await chrome.storage.session.get('popupWindowId');
  return popupWindowId || null;
}

async function setPopupWindowId(id) {
  await chrome.storage.session.set({ popupWindowId: id });
}

async function clearPopupWindow() {
  await chrome.storage.session.remove('popupWindowId');
}

/**
 * Finds an open web phone of the current region. The Hipcall desktop (a
 * browser tab or the installed app window) wins over the extension's own
 * popup window; the popup is only used when the desktop is not open.
 */
async function findWebphoneTab(region) {
  const tabs = await chrome.tabs.query({ url: region.patterns });
  if (!tabs.length) return null;

  const popupId = await getPopupWindowId();
  const byRecent = (a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0);
  const desktop = tabs.filter((tab) => tab.windowId !== popupId).sort(byRecent)[0];
  return desktop || tabs.find((tab) => tab.windowId === popupId) || null;
}

/**
 * Opens the extension's web phone window (like the original extension's
 * toolbar button), or focuses it if it is already open.
 */
async function openPopupWindow() {
  const settings = await HC_CONFIG.getSettings();
  const region = HC_CONFIG.region(settings.region);

  const popupId = await getPopupWindowId();
  if (popupId != null) {
    try {
      const win = await chrome.windows.get(popupId, { populate: true });
      const tab = win.tabs && win.tabs[0];
      if (tab) {
        // Region changed since it was opened → load the new region's server.
        const url = tab.url || tab.pendingUrl || region.webphoneUrl;
        if (!HC_CONFIG.isWebphoneUrl(url, region)) await chrome.tabs.update(tab.id, { url: region.webphoneUrl });
        await chrome.windows.update(win.id, { focused: true });
        return { tabId: tab.id, created: false };
      }
    } catch (_) {
      await clearPopupWindow(); // window was closed
    }
  }

  const win = await chrome.windows.create({
    url: region.webphoneUrl,
    type: 'popup',
    width: HC_CONFIG.POPUP_WINDOW.width,
    height: HC_CONFIG.POPUP_WINDOW.height,
    focused: true
  });
  await setPopupWindowId(win.id);
  return { tabId: win.tabs[0].id, created: true };
}

/** Click to call: the Hipcall desktop if open, otherwise the extension's window. */
async function openWebphone() {
  const settings = await HC_CONFIG.getSettings();
  const region = HC_CONFIG.region(settings.region);

  const tab = await findWebphoneTab(region);
  if (tab) {
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
    return { tabId: tab.id, created: false };
  }

  return openPopupWindow();
}

chrome.windows.onRemoved.addListener(async (windowId) => {
  if (windowId !== (await getPopupWindowId())) return;
  await clearPopupWindow();
  await HC_I18N.init(); // the worker may have been restarted; load the chosen language
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/logo.png',
    title: t('warning'),
    message: t('closed')
  });
});

function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') done();
    };
    chrome.tabs.onUpdated.addListener(listener);
    const timer = setTimeout(done, timeoutMs);
    chrome.tabs.get(tabId).then((tab) => { if (tab.status === 'complete') done(); }).catch(done);
  });
}

/** Makes sure the bridge script is running in the web phone tab. */
async function ensureBridge(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'hipcallPing' });
    if (res && res.ok) return;
  } catch (_) { /* not injected yet */ }

  // E.g. the web phone was opened before the extension was installed/reloaded.
  log('Injecting bridge script...');
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['js/hipcall_bridge.js']
  });
}

/* ------------------------------------------------------------------ */
/* Typing the number                                                   */
/* ------------------------------------------------------------------ */

let fillQueue = Promise.resolve();

function runFill(tabId, number, created) {
  const run = () => doRunFill(tabId, number, created).catch(async (err) => {
    console.warn('[Hipcall] could not type the number:', err);
    // Most common cause: the web phone is not signed in (no dial pad on screen).
    await HC_I18N.init();
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/logo.png',
      title: t('callFailedTitle'),
      message: t('callFailedText', [number])
    });
  });
  fillQueue = fillQueue.then(run, run);
  return fillQueue;
}

async function doRunFill(tabId, number, created) {
  const t0 = Date.now();
  if (created) await waitForTabComplete(tabId);

  // Never attach the debugger to / type into anything but the web phone
  // (e.g. the user followed a link inside the web phone window).
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url || tab.pendingUrl || '';
  if (!HC_CONFIG.isWebphoneUrl(url)) {
    throw new Error('tab is not a Hipcall web phone: ' + url.split('?')[0]);
  }
  // On another screen (Home, Chats...)? Open the dialer first.
  if (!/^\/(calls|phone\/dialpad)(\/|$)/.test(new URL(url).pathname)) {
    const dialerUrl = new URL('/calls', url).href;
    log('Opening the dialer:', dialerUrl);
    // Navigate from inside the page: an installed Hipcall app could otherwise
    // "capture" an extension-initiated navigation into its own window.
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (target) => { location.assign(target); },
        args: [dialerUrl]
      });
    } catch (_) {
      await chrome.tabs.update(tabId, { url: dialerUrl });
    }
    await sleep(300);
    await waitForTabComplete(tabId);
  }
  await ensureBridge(tabId);

  const { autoDial } = await HC_CONFIG.getSettings();

  cancelDetach(tabId);
  const { trusted, attachedAt } = await attachDebugger(tabId);
  try {
    const send = (attached) => chrome.tabs.sendMessage(tabId, {
      type: 'fillDialer',
      data: { number, trusted, attachedAt: attached, autoDial }
    });
    let res = await send(attachedAt);

    // The web phone was on another screen and the side menu did not work:
    // load the dialer URL in the same tab, then type the number again.
    if (res && !res.ok && /NAVIGATE_TO_DIALER/.test(res.error || '')) {
      const current = await chrome.tabs.get(tabId);
      const dialerUrl = new URL('/calls', current.url).href;
      log('Loading the dialer:', dialerUrl);
      await chrome.tabs.update(tabId, { url: dialerUrl });
      await sleep(300);
      await waitForTabComplete(tabId);
      await ensureBridge(tabId);
      res = await send(null);
    }
    if (!res || !res.ok) throw new Error((res && res.error) || 'unknown error');
    log(`Done in ${Date.now() - t0} ms:`, res);
  } finally {
    if (trusted) scheduleDetach(tabId);
  }
}

/* ------------------------------------------------------------------ */
/* Trusted input through chrome.debugger                               */
/* ------------------------------------------------------------------ */

const attachedTabs = new Set();
const detachTimers = new Map();

/** @returns {{trusted: boolean, attachedAt: number|null}} attachedAt is set when freshly attached. */
async function attachDebugger(tabId) {
  await startupCleanup; // must not detach the session we are about to create
  if (attachedTabs.has(tabId)) return { trusted: true, attachedAt: null };
  try {
    await chrome.debugger.attach({ tabId }, DEBUGGER_VERSION);
    attachedTabs.add(tabId);
    return { trusted: true, attachedAt: Date.now() };
  } catch (err) {
    console.warn('[Hipcall] debugger not available, using fallback input:', errText(err));
    return { trusted: false, attachedAt: null };
  }
}

function cancelDetach(tabId) {
  clearTimeout(detachTimers.get(tabId));
  detachTimers.delete(tabId);
}

function scheduleDetach(tabId) {
  cancelDetach(tabId);
  if (KEEP_ATTACHED_MS <= 0) return void detachDebugger(tabId);
  detachTimers.set(tabId, setTimeout(() => {
    detachTimers.delete(tabId);
    detachDebugger(tabId);
  }, KEEP_ATTACHED_MS));
}

async function detachDebugger(tabId) {
  if (!attachedTabs.has(tabId)) return;
  attachedTabs.delete(tabId);
  try { await chrome.debugger.detach({ tabId }); } catch (_) { /* already detached */ }
}

// If the service worker was stopped while attached (timers are lost), the
// "is debugging this browser" bar would stay. Detach leftovers on startup;
// detach() only succeeds for sessions this extension owns.
const startupCleanup = (async () => {
  const tabs = await chrome.tabs.query({ url: HC_CONFIG.ALL_PATTERNS });
  for (const tab of tabs) {
    try { await chrome.debugger.detach({ tabId: tab.id }); } catch (_) { /* not ours / not attached */ }
  }
})().catch(() => {});

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId == null) return;
  attachedTabs.delete(source.tabId);
  cancelDetach(source.tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
  cancelDetach(tabId);
});

/**
 * Accepts digits with an optional leading "+" and * # (extensions / codes);
 * returns null for anything else (empty, too short/long, letters...).
 */
function sanitizeNumber(raw) {
  const s = String(raw || '').trim();
  const plus = s.startsWith('+');
  const cleaned = s.replace(/[^\d*#]/g, '');
  const digits = cleaned.replace(/\D/g, '').length;
  if (digits < 3 || digits > 16 || cleaned.length > 20) return null;
  return (plus ? '+' : '') + cleaned;
}

async function trustedClick(tabId, x, y) {
  if (tabId == null || !attachedTabs.has(tabId)) throw new Error('debugger not attached');
  const target = { tabId };
  const send = (params) => chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', params);

  await send({ type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await send({ type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(15);
  await send({ type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}

async function trustedInput(tabId, msg) {
  if (tabId == null || !attachedTabs.has(tabId)) throw new Error('debugger not attached');
  const target = { tabId };
  const key = (params) => chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', params);

  if (msg.op === 'selectAllDelete') {
    const a = { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: 2 };
    await key({ type: 'rawKeyDown', ...a, commands: ['selectAll'] });
    await key({ type: 'keyUp', ...a });
    const bs = { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 };
    await key({ type: 'rawKeyDown', ...bs });
    await key({ type: 'keyUp', ...bs });
    return;
  }

  if (msg.op === 'insertText') {
    // Same effect as typing or pasting with Ctrl+V.
    await chrome.debugger.sendCommand(target, 'Input.insertText', { text: String(msg.text || '') });
    return;
  }

  throw new Error('unknown op: ' + msg.op);
}

/* ------------------------------------------------------------------ */
/* SPA navigation (kept from the original extension)                   */
/* ------------------------------------------------------------------ */

const MessageType = {
  PAGE_RENDERED: 'pageRendered'
};

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  chrome.tabs.sendMessage(details.tabId, { type: MessageType.PAGE_RENDERED }).catch(() => {
    /* no content script in this tab */
  });
});

/* ------------------------------------------------------------------ */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errText(err) {
  return String(err && err.message ? err.message : err);
}
