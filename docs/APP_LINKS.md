# How a call reaches the web phone (app links)

From v2.1.0 on `feat/app-links`, the extension no longer attaches `chrome.debugger` to type the number into the web phone and press the call button. It now hands the web phone a **link**: the app path `/dial?number=…`. The web phone (the Hipcall desktop web app) opens that link itself.

This document explains the new flow end to end, with code references on both sides. It is written for anyone who maintains the extension.

- Issue: hipcall/hq#5397 (click-to-call link standard).
- Desktop side: repo `hipcall/com.hipcall.desktop`, branch `feat/app-links`.
- Line numbers refer to that branch and to this repo's `feat/app-links` branch.

## Why it changed

The old flow attached the debugger to the web phone tab and sent trusted key and mouse events into the Flutter canvas. That worked, but it had four problems:

- Chrome shows the *"Hipcall is debugging this browser"* bar while the debugger is attached.
- The Web Store reviews the `debugger` permission strictly, and users are warned about it on install.
- It broke whenever the web phone's layout changed, because it clicked on positions in the canvas.
- When the web phone was not open, the old flow had to navigate a tab to the dialer. Reloading a tab that is on a call drops the call.

Now the web phone exposes a small, explicit API. The extension only says *"open this path"*, and the app decides what that means.

## The pieces

| Side | File | Role |
|---|---|---|
| Extension | `js/content_script.js` | Catches `tel:` clicks and call-icon clicks on ordinary websites and sends `{type:'call', call:<number>}` to the service worker. |
| Extension | `service_worker.js` | Finds or opens the web phone, then asks the bridge to deliver the link. Shows a notification on failure. |
| Extension | `js/hipcall_bridge.js` | Content script that runs *inside the web phone tab*. Posts the link to the page with `window.postMessage` and waits for an ack. |
| Extension | `js/config.js` | Regions, web phone URLs and patterns, and `isWebphoneUrl()`. |
| Desktop | `lib/services/app_link.dart` | Parses any carrier (URL, `hipcall://`, message) into an `AppLink` and decides whether it may place a call. |
| Desktop | `lib/services/app_link_web.dart` | `window` message listener, origin checks, ack, the `data-hipcall-links` flag, and the pending link in `sessionStorage`. |
| Desktop | `lib/services/app_link_service.dart` | Opens a link: navigates for screen paths; for `/dial`, prefills the dialpad or starts the call. |

## Flow

```
website (tel: click)          service worker                       web phone tab
─────────────────────         ──────────────                       ─────────────
content_script.js  ──{type:'call'}──►  dial(number)
                                       ├─ web phone tab open? ─ yes ─► focus it
                                       │                               hipcall_bridge.js
                                       │   sendLink ──{type:'dialLink'}──►  waitForSupport()
                                       │                                    window.postMessage(hipcall:link)
                                       │                                         │
                                       │                                         ▼  (Flutter app)
                                       │                                    AppLinkPlatform.listen
                                       │                                    → AppLinkService.open
                                       │   ◄────────── {ok} ◄────────────── hipcall:link-ack
                                       │
                                       └─ no tab ─ auto-dial off ─► open window on /dial?number=…
                                                 └ auto-dial on  ─► open window on /calls,
                                                                    wait for load, then sendLink
```

### 1. The click (`js/content_script.js`)

- **`tel:` links:** one delegated `click` listener on `document` catches them. `js/content_script.js:216` drops the event if `!e.isTrusted`.
- **Call icons:** `onCallButtonClick` drops untrusted clicks at `js/content_script.js:248`.
- **Why `isTrusted` matters:** the web phone may place the call without asking again (see *Auto-dial* below), so only a real user click may start it. A page script that calls `link.click()` makes an untrusted event, and that event is ignored.
- **No loop:** the content script does nothing on the web phone itself (`js/content_script.js:30`).
- **The hand-off:** `call()` (`js/content_script.js:149`) sends `{type:'call', call:<number>}` to the service worker at line 165. This message format is unchanged from the original extension.

The context menu (*right-click → Call with Hipcall*, `service_worker.js:103`) and the popup's *Discover* list also call `dial()`. They act on a real user action too.

### 2. Choosing the web phone (`service_worker.js`)

- `service_worker.js:139` checks the number with `sanitizeNumber` (line 375). It replies `{ok:true}` at once and calls `dial(number)`.
- `dial()` (line 313) queues the call: two quick clicks run one after the other. Any error becomes a notification:
  - `UNSUPPORTED` → `desktopOutdated` (*"Reload the Hipcall tab…"*).
  - Anything else → `callFailedText`.
- `doDial()` (line 329) builds `path = '/dial?number=' + encodeURIComponent(number)`. Then:
  1. **A web phone tab is open:** `findWebphoneTab()` (line 208) prefers the most recently used desktop tab or installed app window over the extension's own popup window. The tab is focused, then `sendLink(tab, path, autoDial)` runs. **The tab is never navigated**, so a call in it survives.
  2. **Nothing is open and auto-dial is off:** the popup window opens directly on `https://desktop…/dial?number=…`. The URL alone puts the number on the dialpad, and it also survives sign-in.
  3. **Nothing is open and auto-dial is on:** the window opens on `/calls`. The service worker waits for the load with `waitForTabComplete` (line 268), then calls `sendLink(…, true)`. The call request has to go in as a message, because a URL never places a call (see below).
- `sendLink()` (line 357):
  - It refuses any tab that is not a web phone URL. This covers the case where the user followed a link to another site inside the popup window.
  - It makes sure the bridge is injected (`ensureBridge`, line 288). Tabs opened before the extension was installed or reloaded do not have it yet, so it is injected with `chrome.scripting`.
  - It sends `{type:'dialLink', path, call}` to the bridge.

### 3. Inside the web phone tab (`js/hipcall_bridge.js`)

The manifest injects the bridge on the web phone patterns. `ensureBridge` injects it on demand otherwise.

- `waitForSupport()` (line 54) waits up to 20 s (`READY_TIMEOUT_MS`) for `<html data-hipcall-links="1">`. The app sets this attribute once its listener is up.
  - It is a cheap feature check: a web phone without the API never sets it, and the bridge reports `UNSUPPORTED`.
  - The 20 s budget covers a cold start of the Flutter app in a freshly opened window.
- `sendLink()` (line 71) posts the following message to the page's own origin and waits up to 3 s (`ACK_TIMEOUT_MS`) for the matching `hipcall:link-ack`:

  ```js
  window.postMessage({ type: 'hipcall:link', path, call, id, source: 'extension' }, location.origin)
  ```
- It reports errors back to the service worker:
  - `UNSUPPORTED`: there is no `data-hipcall-links` flag.
  - `NO_ACK`: the app did not answer within 3 s.
  - `REJECTED`: the app answered `ok:false`, for example because the path is not allowed.

The content script runs in an isolated world, but `window.postMessage` reaches the page's `message` listeners, with `event.source` set to the page's own window. That is exactly what the desktop checks for.

### 4. The web phone opens the link (desktop repo)

- **Listener:** `AppLinkPlatform.listen` (`lib/services/app_link_web.dart:75`) accepts a message only if all of these hold:
  - `event.origin` equals the page's own origin (line 86). Other sites, including a page that opened the web phone with `window.open`, cannot post a link.
  - `event.source` is the page's own window (line 88). Iframes and other windows are rejected.
  - `type` is `hipcall:link`.

  It then answers with `{type:'hipcall:link-ack', id, ok}`.
- **Parsing:** `AppLink.parse` (`lib/services/app_link.dart:86`):
  - `/dial` must carry a valid number (`sanitizeNumber`, line 162).
  - Other paths must start with one of `screenPrefixes` (line 66): `/home`, `/calls`, `/call/`, `/contacts`, `/history`, `/conversations`, `/tasks`, `/notification-center`, `/settings`.
  - `/login` and unknown paths are refused, so the ack is `ok:false`.
- **Opening:** `AppLinkService.open` → `_openDial` (`lib/services/app_link_service.dart:118`):
  1. **A call in this tab:** an orange warning appears (*"A call is in progress. Finish it to call …"*), and nothing is dialled.
  2. **Several web phone tabs:** this tab takes the SIP registration over from the other tab (`takeOver()`, line 135). If that tab is on a call, it refuses and shows *"A call is in progress in another Hipcall tab"*.
  3. **Otherwise:** it goes to `/calls`. If `autoCall` is set it calls `startCall(number)` (line 143); if not, it puts the number on the dialpad (`dialPrefillProvider`, line 145).
- **Signed out:** the link is kept in `sessionStorage` for up to 10 minutes and opened after sign-in, but as a dialpad prefill only. A call request does not survive the login redirect.

## Auto-dial: who may place a call

`AppLink.autoCall` is set only when **all** of these hold:

- the link came as a **message** (not a URL and not a PWA launch);
- the message asked for it (`call: true`);
- the number is valid.

A URL (`/dial?number=` typed in, opened from another app, and so on) **never** starts a call; it only fills the dialpad. `AppLink.urlLinksAutoCall` is `false` (`lib/services/app_link.dart:62`). Otherwise any website could make a signed-in user dial a number just by linking to it.

The extension sends `call: true` only when the user turned *Auto-dial* on in settings (the default), and only after a trusted click. That keeps one-click calling without the debugger.

## The message protocol (stable API)

Treat this as a contract. The desktop may add fields, but must not change these:

| Message | Direction | Fields |
|---|---|---|
| `hipcall:link` | extension → app | `path` (app path with query, e.g. `/dial?number=%2B905321234567`), `call` (bool, optional), `id` (any, echoed back), `source` (informational) |
| `hipcall:link-ack` | app → extension | `id`, `ok` (bool) |
| `hipcall:ready` | app → page | `links: 1` (protocol version), posted once when the listener starts |
| `data-hipcall-links="1"` | attribute on `<html>` | the protocol version the app supports |

New link types, such as opening a contact or a task, need **no protocol change**. Send the screen path (e.g. `/tasks?filter=myTasks`), and if it is a new screen, add it to `screenPrefixes` on the desktop. Mobile will accept the same paths (`hipcall://…` and https links), so one link format works everywhere.

## Release order

**The desktop must be deployed before the extension is published.**

An extension from this branch that talks to a web phone without the API waits 20 s, then shows *"Reload the Hipcall tab…"*. Reloading only helps once the new web phone is live.

## Local development

1. Run the desktop locally with `fvm flutter run -d web-server --web-port=19823`. See the desktop repo's `DEVELOPMENT.md`; port 19823 is the registered OAuth redirect.
2. In `chrome://extensions`, turn off the Web Store copy and **Load unpacked** this folder.
3. In the popup, go to Settings → Account region and choose **Local development (localhost:19823)**.

This region exists only in unpacked builds. `HC_CONFIG.IS_DEV` (`js/config.js:42`) is true when the manifest has no `update_url`, and Chrome always adds `update_url` to Web Store installs. Match patterns cannot name a port, so `isWebphoneUrl` (`js/config.js:110`) additionally requires port 19823 on `localhost`. Other local servers count as ordinary websites.

Test page and cases are in the mobile repo's notes: `notes/manual_tests/tel_links_test.html` and `MANUAL_TEST_DESKTOP_APP_LINKS.md` §7. The page must be served over http, because content scripts do not run on `file://`.

## Troubleshooting

| Symptom | Look at |
|---|---|
| *"Reload the Hipcall tab…"* | The web phone has no `data-hipcall-links` attribute: an old build, or the app did not start within 20 s. In the web phone's console, run `document.documentElement.dataset.hipcallLinks`. |
| *"Call could not be started"* | The service worker console (`chrome://extensions` → *service worker*) logs the reason: `NO_ACK`, `REJECTED`, or *tab is not the Hipcall desktop*. |
| Number on the dialpad, but no call | Auto-dial is off, or the user was signed out, which turns the request into a prefill. |
| Nothing at all on a `tel:` click | The click was scripted (`isTrusted` is false), or another copy of the extension (Web Store and unpacked both enabled) handled it. |
| Bridge log in the web phone tab | Look for `[Hipcall] Link accepted: …` in the web phone's DevTools console. |
