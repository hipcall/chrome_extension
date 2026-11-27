/**
 * Hipcall sign-in (OAuth 2.1 authorization code + PKCE) and API client.
 * Runs in the service worker (importScripts) — the popup talks to it through
 * messages, so tokens never live in a page.
 *
 * Flow:
 *   1. login(): random code_verifier + state, S256 code_challenge; Chrome's
 *      sign-in window (chrome.identity.launchWebAuthFlow) opens /oauth/authorize
 *      on the region's server.
 *   2. Hipcall redirects to https://<extension-id>.chromiumapp.org/<tr|global>;
 *      Chrome catches it and returns the URL (code + state).
 *   3. The code is exchanged at /oauth/token with the code_verifier (public
 *      client, no secret).
 *   4. api() adds the Bearer token and refreshes it when it expires.
 *
 * Token storage: chrome.storage.session only — kept in memory, never written
 * to disk, and readable only by the extension's own pages and service worker
 * (not by content scripts or websites). Closing the browser ends the session.
 * The client_id is public by design (it is visible in the sign-in URL);
 * security rests on the registered redirect_uri and PKCE, not on hiding it.
 */
// eslint-disable-next-line no-var
var HC_AUTH = (() => {
  'use strict';

  const STORE_KEY = 'auth';          // { server, accessToken, refreshToken, expiresAt, scope, user }

  /* ---------------- PKCE helpers ---------------- */

  function base64url(bytes) {
    let s = '';
    for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function randomString(byteLength = 32) {
    return base64url(crypto.getRandomValues(new Uint8Array(byteLength)));
  }

  async function challengeFor(verifier) {
    return base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  }

  /* ---------------- State ---------------- */

  // Session storage: memory only, trusted contexts only (set explicitly, it is
  // also Chrome's default). Earlier builds kept tokens on disk: remove them.
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
  chrome.storage.local.remove(STORE_KEY).catch(() => {});

  async function getAuth() {
    const { [STORE_KEY]: auth } = await chrome.storage.session.get(STORE_KEY);
    return auth || null;
  }

  async function setAuth(auth) {
    if (auth) await chrome.storage.session.set({ [STORE_KEY]: auth });
    else await chrome.storage.session.remove(STORE_KEY);
  }

  async function serverFor(regionId) {
    const region = HC_CONFIG.region(regionId || (await HC_CONFIG.getSettings()).region);
    return {
      id: region.server,
      apiBase: region.apiBase,
      clientId: HC_CONFIG.OAUTH.clients[region.server] || null
    };
  }

  /** Public status for the popup (no tokens). */
  async function status() {
    const auth = await getAuth();
    const server = await serverFor();
    return {
      available: !!server.clientId,
      signedIn: !!(auth && auth.server === server.id && auth.accessToken),
      user: auth && auth.server === server.id ? auth.user || null : null,
      // The address Hipcall must have registered for this client (shown on errors).
      redirectUri: server.clientId ? chrome.identity.getRedirectURL(server.id) : '',
      // Only a hint: the API decides (a missing scope comes back as NEEDS_SCOPE).
      canWrite: !!(auth && auth.server === server.id && scopeHas(auth, 'contacts:write')),
      // Why the last sign-in failed (shown even if the popup was closed meanwhile).
      lastError: (await chrome.storage.session.get(ERROR_KEY))[ERROR_KEY] || null
    };
  }

  /* ---------------- Sign-in ---------------- */

  const ERROR_KEY = 'authError';

  // Chrome allows one sign-in window at a time: a second click (e.g. after the
  // popup was closed and reopened) brings the open window to the front instead.
  let loginRunning = null;

  /** Focuses an open Hipcall sign-in window, if there is one. */
  async function focusSigninWindow() {
    const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['popup'] }).catch(() => []);
    const win = wins.find((w) => (w.tabs || []).some((t) => /\/oauth\/(authorize|login)|\/portal\/oauth/.test(t.pendingUrl || t.url || '')));
    if (!win) return false;
    await chrome.windows.update(win.id, { focused: true, state: 'normal' }).catch(() => {});
    return true;
  }

  /** Sign-in; the outcome is also kept for a popup opened later. */
  function login() {
    if (loginRunning) {
      focusSigninWindow();
      return loginRunning;
    }
    loginRunning = runLogin().finally(() => { loginRunning = null; });
    return loginRunning;
  }

  async function runLogin() {
    try {
      const result = await startLogin();
      await chrome.storage.session.remove(ERROR_KEY);
      return result;
    } catch (e) {
      const code = String((e && e.message) || e);
      if (code !== 'SIGNIN_CANCELLED' && code !== 'SIGNIN_ALREADY_OPEN') await chrome.storage.session.set({ [ERROR_KEY]: code });
      throw e;
    }
  }

  /**
   * Sign-in window: chrome.identity.launchWebAuthFlow. Chrome itself catches
   * the redirect to https://<extension-id>.chromiumapp.org/<server>/ — an
   * address only this extension can receive — and hands us the final URL.
   * The page at that address is never loaded.
   */
  function redirectUri(serverId) {
    return chrome.identity.getRedirectURL(serverId);
  }

  /**
   * Chrome opens the sign-in window at its own (often full-screen) size and
   * launchWebAuthFlow has no size option. While signing in, a new popup window
   * showing this server's /oauth/authorize page is resized to a compact
   * window centred on the current one, like the sign-in page itself.
   */
  const SIGNIN_WINDOW = { width: 480, height: 720 };

  function sizeSigninWindow(apiBase) {
    const onCreated = async (win) => {
      if (win.type !== 'popup') return;
      try {
        // The tab's URL may not be set yet right after the window is created.
        let url = '';
        for (let i = 0; i < 20 && !url; i++) {
          const [tab] = await chrome.tabs.query({ windowId: win.id });
          url = (tab && (tab.pendingUrl || tab.url)) || '';
          if (!url) await new Promise((r) => setTimeout(r, 50));
        }
        if (!url.startsWith(apiBase + '/oauth/authorize')) return;
        const ref = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
        const box = { ...SIGNIN_WINDOW, state: 'normal' };
        if (ref && ref.width && ref.height) {
          box.height = Math.min(box.height, ref.height);
          box.left = Math.max(0, Math.round(ref.left + (ref.width - box.width) / 2));
          box.top = Math.max(0, Math.round(ref.top + (ref.height - box.height) / 2));
        }
        if (win.state !== 'normal') await chrome.windows.update(win.id, { state: 'normal' });
        await chrome.windows.update(win.id, box);
      } catch (e) {
        /* the window keeps Chrome's size */
      }
    };
    chrome.windows.onCreated.addListener(onCreated);
    return () => chrome.windows.onCreated.removeListener(onCreated);
  }

  async function startLogin() {
    const server = await serverFor();
    if (!server.clientId) throw new Error('SIGNIN_NOT_AVAILABLE');

    const verifier = randomString(48);
    const state = randomString(16);
    const redirect = redirectUri(server.id);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: server.clientId,
      redirect_uri: redirect,
      scope: HC_CONFIG.OAUTH.scope,
      state,
      code_challenge: await challengeFor(verifier),
      code_challenge_method: 'S256'
    });

    let finalUrl;
    const stopSizing = sizeSigninWindow(server.apiBase);
    try {
      finalUrl = await chrome.identity.launchWebAuthFlow({
        url: `${server.apiBase}/oauth/authorize?${params}`,
        interactive: true
      });
    } catch (e) {
      // A sign-in window left open from before (e.g. the service worker restarted).
      if (/only one web auth flow/i.test(String(e && e.message))) {
        await focusSigninWindow();
        throw new Error('SIGNIN_ALREADY_OPEN');
      }
      // Closed by the user, or the server did not redirect back (e.g. the
      // redirect address is not registered: Hipcall shows its own error page).
      throw new Error(/did not approve|cancel|closed/i.test(String(e && e.message)) ? 'SIGNIN_CANCELLED' : 'SIGNIN_ERROR: ' + (e && e.message));
    } finally {
      stopSizing();
    }

    const url = new URL(finalUrl);
    const error = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    if (error) {
      // Keep Hipcall's own explanation (error_description) for the message.
      const why = url.searchParams.get('error_description') || '';
      throw new Error((error === 'access_denied' ? 'SIGNIN_DENIED' : 'SIGNIN_ERROR: ' + error) + (why ? ' | ' + why : ''));
    }
    if (!code || url.searchParams.get('state') !== state) throw new Error('SIGNIN_STATE_MISMATCH');

    const token = await tokenRequest(server, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect,
      client_id: server.clientId,
      code_verifier: verifier
    });
    const auth = { server: server.id, ...tokenFields(token) };
    await setAuth(auth);
    auth.user = await loadUser().catch(() => null);
    await setAuth(auth);
    return status();
  }

  async function logout() {
    const auth = await getAuth();
    await setAuth(null);
    // Forget the saved search results of the signed-out account.
    const saved = await chrome.storage.session.get(null).catch(() => ({}));
    const keys = Object.keys(saved).filter((k) => k.startsWith('find:') || k.startsWith('li:'));
    if (keys.length) await chrome.storage.session.remove(keys).catch(() => {});
    if (!auth || !auth.refreshToken) return;
    // Best effort: the server may require client authentication for revocation.
    const server = await serverFor();
    fetch(`${server.apiBase}/oauth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: auth.refreshToken, client_id: server.clientId || '' })
    }).catch(() => {});
  }

  /* ---------------- Tokens ---------------- */

  function tokenFields(token) {
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      expiresAt: Date.now() + (Number(token.expires_in) || 3600) * 1000,
      scope: token.scope || HC_CONFIG.OAUTH.scope
    };
  }

  async function tokenRequest(server, fields) {
    const res = await fetch(`${server.apiBase}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(fields)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      throw new Error('TOKEN_ERROR: ' + (body.error_description || body.error || res.status));
    }
    return body;
  }

  let refreshing = null;

  async function refresh(auth) {
    if (!auth.refreshToken) throw new Error('SIGNED_OUT');
    // One refresh at a time (several API calls may hit an expired token together).
    refreshing = refreshing || (async () => {
      try {
        const server = await serverFor();
        const token = await tokenRequest(server, {
          grant_type: 'refresh_token',
          refresh_token: auth.refreshToken,
          client_id: server.clientId
        });
        const next = { ...auth, ...tokenFields(token) };
        if (!token.refresh_token) next.refreshToken = auth.refreshToken;
        await setAuth(next);
        return next;
      } catch (e) {
        await setAuth(null); // refresh token no longer valid → signed out
        throw new Error('SIGNED_OUT');
      } finally {
        setTimeout(() => { refreshing = null; }, 0);
      }
    })();
    return refreshing;
  }

  async function accessToken() {
    let auth = await getAuth();
    const server = await serverFor();
    if (!auth || auth.server !== server.id) throw new Error('SIGNED_OUT');
    if (Date.now() > auth.expiresAt - 60 * 1000) auth = await refresh(auth);
    return auth;
  }

  /* ---------------- API ---------------- */

  /** GET helper: api('/api/v3/profile') or api('/api/v3/companies', { q: 'acme' }). */
  /**
   * Hipcall API call with the signed-in user's token.
   * opts: { method, body } — body is sent as JSON.
   * Errors: SIGNED_OUT, FORBIDDEN, VALIDATION (err.fields = API "errors"), API_ERROR.
   */
  async function api(path, query, opts = {}) {
    const server = await serverFor();
    const url = new URL(path, server.apiBase);
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
    let auth = await accessToken();
    // No connection / blocked request → NETWORK (fetch only rejects for those).
    const call = (token) => fetch(url, {
      method: opts.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {})
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).catch(() => { throw new Error('NETWORK'); });

    let res = await call(auth.accessToken);
    if (res.status === 401) {
      auth = await refresh(auth);
      res = await call(auth.accessToken);
    }
    const body = await res.json().catch(() => ({}));
    // A valid token without the needed scope: keep the session, ask to sign in again.
    if (res.status === 401 || res.status === 403) {
      const why = (res.headers.get('www-authenticate') || '') + ' ' + JSON.stringify(body || {});
      if (/insufficient_scope|scope/i.test(why)) throw new Error('NEEDS_SCOPE');
    }
    if (res.status === 401) { await setAuth(null); throw new Error('SIGNED_OUT'); }
    if (res.status === 403) throw new Error('FORBIDDEN');
    if (res.status === 422 || res.status === 400) {
      const err = new Error('VALIDATION');
      const e = body && body.errors;
      err.fields = e && typeof e === 'object' ? e : { _: [String(e || (body && body.message) || res.status)] };
      if (err.fields.detail && Object.keys(err.fields).length === 1) err.fields = { _: [].concat(err.fields.detail) };
      throw err;
    }
    if (res.status === 429) throw new Error('RATE_LIMITED');
    if (res.status === 404) throw new Error('NOT_FOUND');
    if (res.status >= 500) throw new Error('SERVER_ERROR: ' + res.status);
    if (!res.ok) throw new Error('API_ERROR: ' + ((body && body.errors && body.errors.detail) || (body && body.message) || res.status));
    return body;
  }

  async function loadUser() {
    const body = await api('/api/v3/profile');
    const d = body.data || {};
    const u = d.user || {};
    return {
      id: u.id != null ? u.id : null,
      name: u.full_name || [u.first_name, u.last_name].filter(Boolean).join(' '),
      email: u.email || '',
      avatarUrl: u.avatar_url || '',
      account: (d.account && d.account.name) || ''
    };
  }

  /** The signed-in user (with id, loaded again for sessions saved before ids were kept). */
  async function currentUser() {
    const auth = await getAuth();
    if (!auth || !auth.accessToken) throw new Error('SIGNED_OUT');
    if (auth.user && auth.user.id != null) return auth.user;
    const user = await loadUser();
    const fresh = await getAuth();
    if (fresh) await setAuth({ ...fresh, user });
    return user;
  }

  /** Was the token granted this scope? ("contacts" covers "contacts:write".) */
  function scopeHas(auth, scope) {
    const granted = String((auth && auth.scope) || '').split(/\s+/);
    return granted.includes(scope) || granted.includes(scope.split(':')[0]);
  }

  return { status, login, logout, api, currentUser, randomString, challengeFor };
})();
