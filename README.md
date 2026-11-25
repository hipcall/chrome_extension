# Hipcall Webphone — Chrome extension

One extension for every Hipcall account region — **Türkiye** (hipcall.com.tr), **European Union**, **United Kingdom** and **United States** (hipcall.com) — in English, German, Spanish, French, Italian, Dutch and Turkish.

## Features

- **Web phone window** — opens the Hipcall web phone in a separate popup window (popup → *Open web phone*) and warns when it is closed (no incoming calls while closed).
- **Click to call** — clicking a `tel:` link or a call icon calls the number through the **Hipcall desktop** (desktop.hipcall.com(.tr) as a browser tab or installed app). If the desktop is not open, the web phone is opened in the extension's popup window; if the number cannot be handed over, a notification says so. Only real clicks count: a page cannot trigger a call by scripting a click.
- **Right-click → Call with Hipcall** — select any number on a page (also ones the scan does not detect) and call it from the context menu.
- **Local number formats per region** — besides international numbers (+/00), each account region detects its national format: Türkiye `0532 123 45 67`, UK `020 7946 0958`, US `(212) 555-0123` (`js/phone.js`). EU regions detect international numbers only.
- **Works inside iframes** — call icons also appear in embedded frames (CRMs, panels); the site rules of the tab apply.
- **Call icons** — phone numbers on web pages (links and plain text) get a Hipcall icon; one click calls the number. Per site you choose where icons appear: only selected pages (default: home page) or all pages except excluded ones (`/blog/*` patterns supported).
- **Discover** — the popup scans the current page as soon as it opens (header, footer, menus, hidden elements, `tel:`/`mailto:`/WhatsApp links, schema.org data, Cloudflare-protected e-mails) and optionally the site's contact/about pages. Call or copy any result.
- **Account region** — Türkiye, EU, UK or US, like the Hipcall apps. Guessed from the browser language on install and changeable in *Settings*; the web phone server (hipcall.com.tr / hipcall.com) follows the region automatically.
- **Language** — Automatic (browser language, English if it is not supported), Deutsch, English, Español, Français, Italiano, Nederlands or Türkçe, selectable in *Settings* (`_locales/<code>`, loaded by `js/i18n.js`).
- **Auto-dial** — optionally press the call button automatically after the number is entered.

## How a call reaches the web phone

```
content_script.js / popup / menu ──{type:'call'}──▶ service_worker.js ──{type:'dialLink'}──▶ hipcall_bridge.js
                                                                                                  │
                     desktop web app ◀── window.postMessage({type:'hipcall:link', path:'/dial?number=…', call}) ──┘
                                     ──▶ {type:'hipcall:link-ack', id, ok}
```

The desktop web app accepts links (hipcall/hq#5397): `/dial?number=%2B90…` as a URL puts the number on
the dialpad, and the same path sent as a `hipcall:link` message from the page's own origin does it without
reloading the page, so an active call is never dropped. `call: true` (the *Auto-dial* setting) asks the desktop
to place the call. The desktop marks support with `<html data-hipcall-links="1">`; an older desktop tab gets a
"reload the Hipcall tab" notification.

- **Desktop open** (tab, installed app or the extension's window): the link goes in as a message.
- **Nothing open**: auto-dial off → the window opens on `/dial?number=…` (survives sign-in); auto-dial on →
  the window opens on the dialer and the call request goes in as a message once the app is ready.

## Security & privacy

- No data leaves the browser except to the Hipcall web phone the user calls through; no analytics, no third-party requests.
- No `debugger` permission: numbers reach the desktop through its link API, never as simulated input.
- Calls start only from a real user action (`isTrusted` click, context menu, popup). A page cannot place a call by scripting a click on a `tel:` link or an icon.
- Numbers are sanitized (digits, leading `+`, `*`/`#`, 3–16 digits) before they reach the web phone, and again by the desktop.
- Page text is inserted with `textContent` only; the contact-page scan fetches plain same-origin pages and skips links that could change state (logout, delete, unsubscribe...).

## Files

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest, permissions, localized name/description |
| `service_worker.js` | Web phone window, click-to-call: hands `/dial` links to the desktop |
| `js/config.js` | Account regions → web phone servers, user settings |
| `js/phone.js` | Phone number detection and normalization per region (shared by content script and popup) |
| `js/i18n.js` | Translations with a user-selectable language |
| `js/content_script.js` | `tel:` link handling and call icons on websites |
| `js/site_rules.js` | Per-site icon rules (shared by content script and popup) |
| `js/hipcall_bridge.js` | Runs in the desktop tab; posts the link to the app and waits for its ack |
| `src/browser_action/*` | Toolbar popup: numbers/e-mails and settings |
| `_locales/{de,en,es,fr,it,nl,tr}/messages.json` | Translations — add a folder, an `<option>` in the popup and the code in `HC_I18N.SUPPORTED` to add a language |
| `scripts/*.sh`, `.github/workflows/release.yml` | Packaging and release (see *Release*) |
| `icons/hipcall-*.svg`, `fonts/` | Brand assets from the [Hipcall brand guide](https://www.hipcall.com/brand-guide/); fonts are OFL-1.1 (licenses in `fonts/`) |

## Development

1. `chrome://extensions` → enable *Developer mode* → *Load unpacked* → select this folder.
2. After changing files click *Reload* on the extension and refresh open pages.
3. Web phone URLs per region are in `js/config.js`. Unpacked builds also offer **Local development** in
   *Settings → Account region*: the desktop web app run with
   `fvm flutter run -d web-server --web-port=19823` (desktop repo, DEVELOPMENT.md). Web Store installs never show it.
4. `scripts/package.sh` checks the JSON files and builds `dist/hipcall-webphone-<version>.zip` (needs `jq`).

## Release

```
git checkout main && git pull
scripts/release.sh
```

The script asks for the next version (patch/minor/major), writes it to `manifest.json`, commits, tags
`vX.Y.Z` and pushes. The tag starts [`.github/workflows/release.yml`](.github/workflows/release.yml):

1. **build** — checks that the tag matches `manifest.json`, builds the ZIP and creates a GitHub release with it.
2. **publish** — waits for approval of the `chrome-web-store` environment (Actions → the run → *Review deployments*),
   then uploads the ZIP to the Chrome Web Store and submits it for review (`scripts/publish-cws.sh`, Chrome Web Store API v2).
   Google's review usually takes from a few hours to a few days; the status is in the developer dashboard.

The publish job signs in to Google with GitHub OIDC (Workload Identity Federation), so no key or token is stored in GitHub.
It is skipped until the setup below is done; until then, upload the ZIP from the GitHub release in the dashboard by hand.

### One-time setup

1. **Google Cloud** — in [Cloud Shell](https://shell.cloud.google.com), as a user who can create service accounts in the project, upload `scripts/setup-google.sh` and run
   `bash setup-google.sh <gcp-project-id>`. It enables the Chrome Web Store API and creates a service account and a
   workload identity provider that only accepts `v*` tags of this repository running in the `chrome-web-store` environment.
2. **Chrome Web Store** — [developer dashboard](https://chrome.google.com/webstore/devconsole) → *Account*: add the service account e-mail printed by the script (one per publisher). Note the publisher ID and the item ID (32 letters, item → *Package*).
3. **GitHub** — *Settings → Environments*: create `chrome-web-store`, add required reviewers and allow only tags `v*`.
   *Settings → Secrets and variables → Actions → Variables*: `CWS_WIF_PROVIDER`, `CWS_SERVICE_ACCOUNT` (printed by the script), `CWS_PUBLISHER_ID`, `CWS_ITEM_ID`.

To check the credentials without uploading, run `CWS_DRY_RUN=1 scripts/publish-cws.sh <zip>` with a `CWS_ACCESS_TOKEN`.
