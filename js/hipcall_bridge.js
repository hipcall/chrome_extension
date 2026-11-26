/**
 * Hipcall Webphone — bridge script, runs inside the Hipcall desktop web tab only.
 *
 * Hands a link to the desktop web app through its link API (hipcall/hq#5397):
 *
 *   window.postMessage({ type: 'hipcall:link', path, call, id }, location.origin)
 *   → the app answers { type: 'hipcall:link-ack', id, ok }
 *
 * The app accepts these messages only from its own window and origin, which is
 * exactly what a content script posts with; other sites cannot send them.
 * `call: true` asks the app to place the call directly (auto-dial); without it
 * the number is only put on the dialpad. The page is never reloaded, so an
 * active call in this tab is never dropped.
 *
 * The app marks support with <html data-hipcall-links="1">. A desktop build
 * from before the link API never sets it; the bridge then answers
 * UNSUPPORTED and the service worker asks the user to reload the tab.
 */
(() => {
  'use strict';

  // After the extension is reloaded the old instance is dead but its window
  // flag remains, so only bail out if a *live* instance exists.
  const isAlive = () => { try { return !!chrome.runtime.id; } catch (_) { return false; } };
  const prev = window.__hipcallDialerBridge;
  if (prev && typeof prev.alive === 'function' && prev.alive()) return;
  window.__hipcallDialerBridge = { alive: isAlive };

  const LINK = 'hipcall:link';
  const ACK = 'hipcall:link-ack';

  // The app sets the marker while it starts up; a freshly opened window may
  // still be loading Flutter.
  const READY_TIMEOUT_MS = 20000;
  const ACK_TIMEOUT_MS = 3000;

  const log = (...args) => console.log('[Hipcall]', ...args);

  const pending = new Map(); // id → resolve(ok)
  let nextId = 1;

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.type !== ACK) return;
    const resolve = pending.get(data.id);
    if (!resolve) return;
    pending.delete(data.id);
    resolve(data.ok === true);
  });

  const supportsLinks = () => !!document.documentElement.dataset.hipcallLinks;

  function waitForSupport() {
    if (supportsLinks()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (!supportsLinks()) return;
        observer.disconnect();
        clearTimeout(timer);
        resolve(true);
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hipcall-links'] });
      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(supportsLinks());
      }, READY_TIMEOUT_MS);
    });
  }

  async function sendLink(path, call) {
    if (!(await waitForSupport())) {
      throw new Error('UNSUPPORTED');
    }
    const id = `ext-${Date.now()}-${nextId++}`;
    const acked = new Promise((resolve) => {
      pending.set(id, resolve);
      setTimeout(() => {
        if (pending.delete(id)) resolve(null);
      }, ACK_TIMEOUT_MS);
    });
    window.postMessage({ type: LINK, path, call: !!call, id, source: 'extension' }, location.origin);
    const ok = await acked;
    if (ok === null) throw new Error('NO_ACK');
    if (!ok) throw new Error('REJECTED');
    log('Link accepted:', path, call ? '(call)' : '(dialpad)');
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || sender.id !== chrome.runtime.id) return false;

    if (message.type === 'hipcallPing') {
      sendResponse({ ok: true });
      return false;
    }
    if (message.type !== 'dialLink') return false;

    sendLink(message.path, message.call)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
    return true; // async response
  });
})();
