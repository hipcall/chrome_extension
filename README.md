# Hipcall Webphone — Chrome extension

One extension for every Hipcall account region — **Türkiye** (hipcall.com.tr), **European Union**, **United Kingdom** and **United States** (hipcall.com) — in Turkish and English.

## Features

- **Web phone window** — opens the Hipcall web phone in a separate popup window (popup → *Open web phone*) and warns when it is closed (no incoming calls while closed).
- **Click to call** — clicking a `tel:` link or a call icon calls the number through the **Hipcall desktop** (desktop.hipcall.com(.tr) as a browser tab or installed app). If the desktop is not open, the web phone is opened in the extension's popup window; if the number cannot be entered (e.g. not signed in), a notification says so.
- **Right-click → Call with Hipcall** — select any number on a page (also ones the scan does not detect) and call it from the context menu.
- **Local number formats per region** — besides international numbers (+/00), each account region detects its national format: Türkiye `0532 123 45 67`, UK `020 7946 0958`, US `(212) 555-0123` (`js/phone.js`). EU regions detect international numbers only.
- **Works inside iframes** — call icons also appear in embedded frames (CRMs, panels); the site rules of the tab apply.
- **Call icons** — phone numbers on web pages (links and plain text) get a Hipcall icon; one click calls the number. Per site you choose where icons appear: only selected pages (default: home page) or all pages except excluded ones (`/blog/*` patterns supported).
- **Discover** — the popup scans the current page as soon as it opens (header, footer, menus, hidden elements, `tel:`/`mailto:`/WhatsApp links, schema.org data, Cloudflare-protected e-mails) and optionally the site's contact/about pages. Call or copy any result.
- **Account region** — Türkiye, EU, UK or US, like the Hipcall apps. Guessed from the browser language on install and changeable in *Settings*; the web phone server (hipcall.com.tr / hipcall.com) follows the region automatically.
- **Language** — Automatic (browser language), Türkçe or English, selectable in *Settings* (`_locales/tr`, `_locales/en`, loaded by `js/i18n.js`).
- **Auto-dial** — optionally press the call button automatically after the number is entered.

## How a call reaches the web phone

```
content_script.js / popup ──{type:'call'}──▶ service_worker.js ──{type:'fillDialer'}──▶ hipcall_bridge.js
                                               ▲                                            │
                                               └──── trustedTap / trustedInput ─────────────┘
```

The web phone is a Flutter (canvas) app that ignores synthetic DOM events. The bridge enables Flutter's
semantics layer to locate the number field and keypad; the service worker then clicks the field and inserts
the number as **trusted input via `chrome.debugger`** (Chrome shows a short "is debugging this browser" bar).
If the debugger cannot attach (e.g. DevTools open on that tab), the bridge falls back to pressing the keypad
with DOM events.

## Security & privacy

- No data leaves the browser except to the Hipcall web phone the user calls through; no analytics, no third-party requests.
- `chrome.debugger` is attached **only** to Hipcall web phone pages (checked before attaching and on every input request), for a few seconds per call, and detached afterwards (leftover sessions are detached on service-worker start).
- Numbers are sanitized (digits, leading `+`, `*`/`#`, 3–16 digits) before they reach the web phone; auto-dial only presses *call* when the number is verified on screen.
- Page text is inserted with `textContent` only; the contact-page scan fetches plain same-origin pages and skips links that could change state (logout, delete, unsubscribe...).

## Files

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest, permissions, localized name/description |
| `service_worker.js` | Web phone window, click-to-call, trusted input via `chrome.debugger` |
| `js/config.js` | Account regions → web phone servers, user settings |
| `js/phone.js` | Phone number detection and normalization per region (shared by content script and popup) |
| `js/i18n.js` | Translations with a user-selectable language |
| `js/content_script.js` | `tel:` link handling and call icons on websites |
| `js/site_rules.js` | Per-site icon rules (shared by content script and popup) |
| `js/hipcall_bridge.js` | Runs in the web phone; types the number and starts the call |
| `src/browser_action/*` | Toolbar popup: numbers/e-mails and settings |
| `_locales/{tr,en}/messages.json` | Translations — add a folder to add a language |
| `icons/hipcall-*.svg`, `fonts/` | Brand assets from the [Hipcall brand guide](https://www.hipcall.com/brand-guide/); fonts are OFL-1.1 (licenses in `fonts/`) |

## Development

1. `chrome://extensions` → enable *Developer mode* → *Load unpacked* → select this folder.
2. After changing files click *Reload* on the extension and refresh open pages.
3. Web phone URLs per region are in `js/config.js`.
