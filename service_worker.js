/**
 * Hipcall Webphone — service worker
 *
 * - Click to call goes through the Hipcall desktop (desktop.hipcall.com(.tr),
 *   as a browser tab or installed app). If it is not open, the web phone is
 *   opened in the extension's popup window instead (region → server, see
 *   js/config.js). If the number cannot be handed over, a notification tells
 *   the user.
 * - Click to call: receives { type: 'call', call: <number> } from content
 *   scripts / popup / context menu — always after a real user action — and
 *   hands `/dial?number=…` to the desktop.
 * - Shows a notification when the web phone window is closed (no incoming calls).
 *
 * Handing the number over (hipcall/hq#5397): an open desktop tab gets it as a
 * message through the bridge script (js/hipcall_bridge.js → window.postMessage),
 * so the page is not reloaded and an active call is not dropped. With auto-dial
 * on, the message asks the desktop to place the call. With no desktop open, the
 * window opens on `/dial?number=…`, which puts the number on the dialpad and
 * survives the sign-in redirect.
 */
// OAuth client ids (generated at build time, git-ignored); without it sign-in is off.
try {
  importScripts('js/oauth_clients.js');
} catch (e) {
  console.warn('[Hipcall] js/oauth_clients.js missing: Hipcall sign-in is disabled.');
}
importScripts('js/config.js', 'js/i18n.js', 'js/phone.js', 'js/auth.js', 'js/crm.js');

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
  dial(number);
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
    // Failures after this point arrive as a notification (see dial()).
    sendResponse({ ok: true });
    dial(number);
    return false;
  }

  // Hipcall account (OAuth) and CRM — only from the extension's own pages
  // (popup), never from content scripts running on websites.
  const fromExtensionPage = sender.id === chrome.runtime.id &&
    typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''));
  if (/^(auth|crm)/.test(request.type || '') && fromExtensionPage) {
    const jobs = {
      authStatus: () => HC_AUTH.status(),
      authLogin: () => HC_AUTH.login(),
      authLogout: () => HC_AUTH.logout().then(() => HC_AUTH.status()),
      crmFind: () => HC_CRM.find(request.data || {}),
      crmActivities: () => HC_CRM.activities(request.data || {}),
      crmCreateCompany: () => HC_CRM.createCompany(request.data || {}),
      crmCompanyFields: () => HC_CRM.companyCustomFields(),
      crmLinkedin: () => HC_CRM.linkedinLookup(request.data || {})
    };
    const job = jobs[request.type];
    if (!job) return false;
    job()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: errText(err), fields: err.fields || null }));
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
  const tabs = (await chrome.tabs.query({ url: region.patterns }))
    .filter((tab) => HC_CONFIG.isWebphoneUrl(tab.url || tab.pendingUrl || '', region));
  if (!tabs.length) return null;

  const popupId = await getPopupWindowId();
  const byRecent = (a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0);
  const desktop = tabs.filter((tab) => tab.windowId !== popupId).sort(byRecent)[0];
  return desktop || tabs.find((tab) => tab.windowId === popupId) || null;
}

/**
 * Opens the extension's web phone window (like the original extension's
 * toolbar button), or focuses it if it is already open. [url] is where a
 * newly created window starts (default: the region's dialer).
 */
async function openPopupWindow(url) {
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
    url: url || region.webphoneUrl,
    type: 'popup',
    width: HC_CONFIG.POPUP_WINDOW.width,
    height: HC_CONFIG.POPUP_WINDOW.height,
    focused: true
  });
  await setPopupWindowId(win.id);
  return { tabId: win.tabs[0].id, created: true };
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
/* Handing the number to the desktop                                   */
/* ------------------------------------------------------------------ */

let dialQueue = Promise.resolve();

/**
 * Click to call. Every caller acts on a real user action (a trusted click,
 * the context menu, the popup), which is what lets auto-dial place the call
 * without asking again (hipcall/hq#5397).
 */
function dial(number) {
  const run = () => doDial(number).catch(async (err) => {
    console.warn('[Hipcall] could not hand the number over:', err);
    await HC_I18N.init();
    const outdated = /UNSUPPORTED/.test(errText(err));
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/logo.png',
      title: t('callFailedTitle'),
      message: outdated ? t('desktopOutdated') : t('callFailedText', [number])
    });
  });
  dialQueue = dialQueue.then(run, run);
  return dialQueue;
}

async function doDial(number) {
  const settings = await HC_CONFIG.getSettings();
  const region = HC_CONFIG.region(settings.region);
  const path = '/dial?number=' + encodeURIComponent(number);

  // Desktop already open (tab, installed app or our window): hand the link to
  // the running app. Never navigate it — a reload would drop an active call.
  const tab = await findWebphoneTab(region);
  if (tab) {
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
    return sendLink(tab.id, path, settings.autoDial);
  }

  // Nothing open. Without auto-dial the URL alone does it: /dial puts the
  // number on the dialpad and keeps it through sign-in. With auto-dial the
  // window opens on the dialer and the call request goes in as a message,
  // because a URL never places a call by itself.
  const origin = new URL(region.webphoneUrl).origin;
  if (!settings.autoDial) {
    await openPopupWindow(origin + path);
    return;
  }
  const { tabId } = await openPopupWindow();
  await waitForTabComplete(tabId);
  return sendLink(tabId, path, true);
}

async function sendLink(tabId, path, call) {
  // Only ever talk to the desktop (e.g. not a page the user followed a link
  // to inside the web phone window).
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url || tab.pendingUrl || '';
  if (!HC_CONFIG.isWebphoneUrl(url)) {
    throw new Error('tab is not the Hipcall desktop: ' + url.split('?')[0]);
  }
  await ensureBridge(tabId);
  const res = await chrome.tabs.sendMessage(tabId, { type: 'dialLink', path, call: !!call });
  if (!res || !res.ok) throw new Error((res && res.error) || 'no answer from the desktop');
  log('Handed over:', path, call ? '(call)' : '(dialpad)');
}

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

function errText(err) {
  return String(err && err.message ? err.message : err);
}
