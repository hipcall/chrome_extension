/**
 * OAuth client ids of the Hipcall servers (public PKCE clients, no secret).
 *
 * Development: copy this file to js/oauth_clients.js (git-ignored) and fill
 * in the ids. Releases: scripts/package.sh writes js/oauth_clients.js from the
 * HC_OAUTH_CLIENT_TR and HC_OAUTH_CLIENT_GLOBAL GitHub Actions variables.
 */
// eslint-disable-next-line no-var
var HC_OAUTH_CLIENTS = {
  tr: '',     // use.hipcall.com.tr
  global: ''  // use.hipcall.com
};
