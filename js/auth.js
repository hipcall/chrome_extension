/**
 * Hipcall sign-in (OAuth 2.1 authorization code + PKCE) and API client.
 * Runs in the service worker (importScripts) — the popup talks to it through
 * messages, so tokens never live in a page.
 *
 * Flow:
 *   1. login(): random code_verifier + state, S256 code_challenge; a small
 *      window opens /oauth/authorize on the region's server.
 *   2. When that window is about to open redirect_uri, the navigation is read
 *      (code + state) and blocked (declarativeNetRequest), the window closes.
 *   3. The code is exchanged at /oauth/token with the code_verifier (public
 *      client, no secret). Access/refresh tokens go to chrome.storage.local.
 *   4. api() adds the Bearer token and refreshes it when it expires.
 */
// eslint-disable-next-line no-var
var HC_AUTH = (() => {
  'use strict';

  const STORE_KEY = 'auth';          // { server, accessToken, refreshToken, expiresAt, scope, user }
  const PENDING_KEY = 'authPending'; // { state, verifier, server, windowId } (session only)
  const BLOCK_RULE_ID = 4711;
  const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

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

  async function getAuth() {
    const { [STORE_KEY]: auth } = await chrome.storage.local.get(STORE_KEY);
    return auth || null;
  }

  async function setAuth(auth) {
    if (auth) await chrome.storage.local.set({ [STORE_KEY]: auth });
    else await chrome.storage.local.remove(STORE_KEY);
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
      // Only a hint: the API decides (a missing scope comes back as NEEDS_SCOPE).
      canWrite: !!(auth && auth.server === server.id && scopeHas(auth, 'contacts:write')),
      // Why the last sign-in failed (shown even if the popup was closed meanwhile).
      lastError: (await chrome.storage.session.get(ERROR_KEY))[ERROR_KEY] || null
    };
  }

  /* ---------------- Sign-in ---------------- */

  let pendingResolve = null;
  const ERROR_KEY = 'authError';

  /** Sign-in; the outcome is also kept for a popup opened later. */
  async function login() {
    try {
      const result = await startLogin();
      await chrome.storage.session.remove(ERROR_KEY);
      return result;
    } catch (e) {
      const code = String((e && e.message) || e);
      if (code !== 'SIGNIN_CANCELLED') await chrome.storage.session.set({ [ERROR_KEY]: code });
      throw e;
    }
  }

  async function startLogin() {
    const server = await serverFor();
    if (!server.clientId) throw new Error('SIGNIN_NOT_AVAILABLE');

    const verifier = randomString(48);
    const state = randomString(16);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: server.clientId,
      redirect_uri: HC_CONFIG.OAUTH.redirectUri,
      scope: HC_CONFIG.OAUTH.scope,
      state,
      code_challenge: await challengeFor(verifier),
      code_challenge_method: 'S256'
    });

    await blockRedirect(true);
    const win = await chrome.windows.create({
      url: `${server.apiBase}/oauth/authorize?${params}`,
      type: 'popup',
      width: 520,
      height: 720,
      focused: true
    });
    await chrome.storage.session.set({ [PENDING_KEY]: { state, verifier, server: server.id, windowId: win.id } });

    // Resolved by onRedirect() / onWindowClosed() below.
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('SIGNIN_TIMEOUT')), LOGIN_TIMEOUT_MS);
      pendingResolve = (err, value) => {
        clearTimeout(timer);
        pendingResolve = null;
        if (err) reject(err); else resolve(value);
      };
    });
  }

  function finish(err, value) {
    if (pendingResolve) pendingResolve(err, value);
  }

  /** Blocks the redirect_uri page itself: the extension only needs its URL. */
  async function blockRedirect(on) {
    const removeRuleIds = [BLOCK_RULE_ID];
    const addRules = on ? [{
      id: BLOCK_RULE_ID,
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: '|' + HC_CONFIG.OAUTH.redirectUri, resourceTypes: ['main_frame'] }
    }] : [];
    try {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds, addRules });
    } catch (e) {
      console.warn('[Hipcall] could not (un)block the redirect page:', e);
    }
  }

  /**
   * The sign-in window reached redirect_uri. Called from several listeners
   * (webNavigation before/error — Hipcall gets there with a server redirect,
   * which onBeforeNavigate does not report — and tabs.onUpdated); the first
   * one wins.
   */
  let handlingRedirect = false;
  async function onRedirect(details) {
    if (details.frameId !== 0 || typeof details.url !== 'string' ||
        !details.url.startsWith(HC_CONFIG.OAUTH.redirectUri) || handlingRedirect) return;
    handlingRedirect = true;
    let pending;
    try {
      ({ [PENDING_KEY]: pending } = await chrome.storage.session.get(PENDING_KEY));
      if (!pending || (details.windowId != null && details.windowId !== pending.windowId)) return;
      await chrome.storage.session.remove(PENDING_KEY);
    } finally {
      handlingRedirect = false;
    }

    await blockRedirect(false);
    chrome.windows.remove(pending.windowId).catch(() => {});


    const url = new URL(details.url);
    const error = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    if (error) return finish(new Error(error === 'access_denied' ? 'SIGNIN_DENIED' : 'SIGNIN_ERROR: ' + error));
    if (!code || url.searchParams.get('state') !== pending.state) return finish(new Error('SIGNIN_STATE_MISMATCH'));

    try {
      const server = await serverFor();
      const token = await tokenRequest(server, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: HC_CONFIG.OAUTH.redirectUri,
        client_id: server.clientId,
        code_verifier: pending.verifier
      });
      const auth = { server: server.id, ...tokenFields(token) };
      await setAuth(auth);
      auth.user = await loadUser().catch(() => null);
      await setAuth(auth);
      finish(null, await status());
    } catch (e) {
      finish(e);
    }
  }

  /** The user closed the sign-in window. */
  async function onWindowClosed(windowId) {
    const { [PENDING_KEY]: pending } = await chrome.storage.session.get(PENDING_KEY);
    if (!pending || pending.windowId !== windowId) return;
    await chrome.storage.session.remove(PENDING_KEY);
    await blockRedirect(false);
    finish(new Error('SIGNIN_CANCELLED'));
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

  return { status, login, logout, api, currentUser, onRedirect, onWindowClosed, randomString, challengeFor };
})();
