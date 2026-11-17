# radar

Cookieless page views for Foo's Radar (superintelligentfoo#94). Once the site key is set, every HTML page gets one small deferred
script that sends one beacon per page view to the site's own `/api/radar`; the site's edge passes it on, server to server, to
the site's Radar collector.
Nothing on the page talks to another website, and a query string never leaves the site: the page address is sent without its
query string, and the referrer as the referring site's name (its origin) only.

## Versions

- **0.3.0** (site-kit#429, for radar#51): campaign visits. A page visit (the same page rule as an AI referral, from a browser
  that has not sent `Sec-GPC: 1` or `DNT: 1`) whose URL carries `utm_source` sends one event `{"kind": "campaign", "source",
  "medium", "campaign", "path", "ts"}`. Only `utm_source`, `utm_medium` and `utm_campaign` are read, each lowercased and kept
  only as `[a-z0-9._-]{1,64}`, else `""`; a repeated one is dropped. No surviving `utm_source`, no event. Nothing else from the
  query string is read (no `utm_term`, `utm_content`, click id or email). A value that looks like a person (an email or mail
  provider, a phone or account number, a token, first.last, any dotted value that is not one bare domain or a known referrer
  host) sends the `(other)` campaign instead, Radar's own rule (radar#55), so the value never leaves the site. An AI referral
  or a crawler is counted as that, not as a campaign. No new setting.
- **0.2.2** (mi-dev-4 on radar#53): a page whose path Radar's ingest would refuse (a UTF-8 slug such as `/caf%C3%A9`, a
  path past 512 characters, or a `%` escaping a byte Radar refuses) is sent as `(other)`, so one page never makes Radar refuse
  the whole batch.
- **0.2.1** (Fable on radar#50): an ingest answer of 204, which is what Radar sends, no longer logs as a failure. Any 2xx
  is taken; anything else logs its status only.
- **0.2.0** (site-kit#426, for the Radar service, sethshoultes/radar M3): `ingest_url` and `ingest_key_var`. With both set,
  the edge counts a request from a known AI crawler (by its user agent), and a page visit referred by a known AI assistant's
  host from a browser that has not sent `Sec-GPC: 1` or `DNT: 1`, and sends the Radar service one event it builds itself:
  `{"kind", "bot" or "source", "path", "ts"}` and no other field (no IP address, user agent, cookie, query string or visitor
  id; `ALLOWED` in `edge.js`, pinned by a test). The path is sent only when the site served a shared page there (a 200 HTML
  page, or a 304 for a page path, whose `Cache-Control` says `public` and neither `private` nor `no-store`; a missing, empty or malformed
  header fails closed, so a member's own page is never sent by its path); anything else is `(other)`. Sent in `waitUntil`, never retried, dropped on any error, and the page is
  served exactly as it would be without it. `collect_url` is now optional: a config needs `collect_url`, `ingest_url` or both.
  The `collect_url` path is removed in its own release once no site uses it (the lead's ruling on #426).
- **0.1.2:** with the key set, only a page path (ending in `/` or `.html`, or with no file extension) (or a request a browser makes for a page: `Sec-Fetch-Dest: document` or an `Accept` with `text/html`) is asked without
  `If-None-Match` / `If-Modified-Since`, so images, CSS and JS keep their 304s instead of downloading in full on every visit
  (sethshoultes/site-kit#51, mi-dev-3's read). Also: a whitespace-only key counts as unset and a set one is trimmed; `DNT: yes`
  (and `navigator.msDoNotTrack`) opt out like `DNT: 1`; the User-Agent goes on capped at 512 characters, the collector's own cap;
  a body stream that errors gets 204 with nothing sent, never a throw.
- **0.1.1:** a true no-op until the site key exists. The build adds nothing to any page (no `body.end` hook any more); the edge
  adds the script to HTML pages, and only once the `RADAR_SITE_KEY` secret (or whatever `key_var` names) is set. Before that every
  page is served exactly as built, byte for byte.
- **0.1.0:** the first version: the beacon (the page's origin and path, the referrer's origin), the edge forward, the GPC/DNT
  opt-out.

## How it turns on

Nothing happens until `RADAR_SITE_KEY` (or the env var `key_var` names) is set. The key is a Pages secret: the edge sees it at
runtime, the build never does, so the build adds nothing to any page and the edge decides per request:

- **No key** (missing, empty or only whitespace): `edge.js` returns null for every page. The page is not even fetched by Radar and is served
  exactly as built, byte for byte; nothing is sent anywhere.
- **Key set**: for a `GET` whose response is `text/html` with status 200, the edge appends
  `<script defer src="/assets/plugins/radar/assets/radar.js"></script>` at the end of `<body>` (an HTMLRewriter end-tag handler),
  keeping the status and headers (but `Content-Length`, `ETag` and `Last-Modified`, which describe the page as built, so a
  copy cached before the key was set is never revalidated as current). For the same reason a page request reaches the origin
  without `If-None-Match` / `If-Modified-Since`: a page path (ending in `/` or `.html`, or with no extension) or a browser's
  request for a page (`Sec-Fetch-Dest: document`/`iframe`, or an `Accept` with `text/html`). Any other request, an image, CSS
  or JS, keeps them and its 304 (0.1.2). A page that already holds that tag does not
  get a second. Any other response (an image, JSON, CSS, `radar.js` itself, a 404, a redirect) comes back as it came, and
  `HEAD` or any other method is left alone (null). The key never appears in a page or a header.

`assets/radar.js` is still shipped with every build; it only runs on pages the edge has added the tag to.

## What it sends

- **From the browser** (`assets/radar.js`): one `POST /api/radar` per page view, by `navigator.sendBeacon` (or `fetch` with
  `keepalive` when that is missing or refuses), body `{"url": location.origin + location.pathname, "referrer": <the referrer's
  origin>}` as text/plain. The page address is sent without its query string or fragment
  (`https://site.example/join/thanks?email=x#y` goes as `https://site.example/join/thanks`), and the referrer as the referring
  site's name only (`https://news.example/story?id=1` goes as `https://news.example`; an empty or unreadable referrer goes as
  `""`). Nothing else is read from the browser: no cookie, no localStorage or sessionStorage, no identifier of any kind.
- **When the browser asks not to be tracked** (`navigator.globalPrivacyControl` is true, or Do Not Track is `"1"`; at the edge,
  a `Sec-GPC: 1` or `DNT: 1` request header), it sends
  nothing at all.
- **A prerendered page** (`document.prerendering`) sends nothing until the visitor actually sees it.
- **From the edge** (`edge.js`): never the body as it came. The edge reads `url` and `referrer` from the browser's JSON (at most
  4096 bytes; a larger one gets 413) and sends only a body it builds itself, `{"url": <origin + path>, "referrer": <the
  referrer's origin, or "">}`: any query string, fragment or other field is dropped. A page address on another origin than the
  site's own, or a body that is not a JSON object with a `url`, is dropped (204, nothing sent). It goes to `collect_url` and
  only there (no header or body field picks the target, and a redirect is never followed), with
  `X-Radar-Site-Key` (from the Pages secret), `X-Radar-Client-IP` (`CF-Connecting-IP`), `X-Radar-Client-UA` (the request's
  `User-Agent`) and `Content-Type: text/plain`. Nothing else: no cookie, no Origin. The forward runs in `waitUntil`, so the page
  never waits for it.
- **What the browser gets back**: always `204`, no body, no cookie, whatever the collector answers. Only `POST` from the site's
  own pages (the `Origin` header, or `Sec-Fetch-Site: same-origin` when a no-referrer page sends `Origin: null`); another origin
  gets 403, another method 405. Any other path is not Radar's: the edge returns null and the page or the next plugin answers.
- **Logs**: only the collector's status when it is not 202 (or "unreachable"). Never the key, the IP or the User-Agent.

The collector keeps the page address without its query string, the referring site's name only, and a device type worked out
from the User-Agent. It stores no IP address and nothing that identifies a visitor.

## Turning it on in a site

1. Copy `plugins/radar/` into the site's `plugins/` (or `plugin-sync.sh radar <tag>`). No template spot is needed: the edge adds
   the script before `</body>`.
2. Set `collect_url` in the site's plugin config, the full address of the collector:
   ```json
   {"radar": {"collect_url": "https://<foo api host>/api/v1/radar/collect"}}
   ```
   There is no default: the Foo API host is the site's choice. The build stops when it is missing, empty or not a plain
   `https://` address, so a half-configured Radar never ships.
3. **The site owner** sets the site key as a Pages secret named `RADAR_SITE_KEY` (or whatever `key_var` names). The plugin and
   the site's repo hold only that name, **never the key itself: never commit a key.** Until the secret is set Radar is off: no
   page gets the script, and a stray `POST /api/radar` gets 204 with nothing sent, so visitors never see an error.
4. The page's CSP needs `script-src 'self'` and `connect-src 'self'`; nothing else.

## Settings (`plugin.json` → `config`)

| setting | default | what |
|---|---|---|
| `collect_url` | (none) | Foo's collector's full https address, e.g. `https://<foo api host>/api/v1/radar/collect` |
| `key_var` | `RADAR_SITE_KEY` | the name of the env var (a Pages secret) holding the site key |
| `ingest_url` | (none) | the Radar service's ingest, e.g. `https://<radar host>/v1/ingest` (0.2) |
| `ingest_key_var` | `RADAR_INGEST_KEY` | the name of the Pages secret holding the site's ingest key, set from stdin and nowhere else |

A config needs `collect_url`, `ingest_url` or both; the build stops otherwise.

**Setting the ingest key** (never in a config file, a log or a commit): mint it in Radar, then pipe it straight into the
Pages secret, for example `<mint command> | wrangler pages secret put RADAR_INGEST_KEY --project-name <site>`.

## The collector it talks to

Foo's `POST /api/v1/radar/collect`: `X-Radar-Site-Key` required, `X-Radar-Client-IP` and `X-Radar-Client-UA` optional, body
`{"url"}` (or `{"path"}`) with an optional `"referrer"`, text/plain accepted, at most 4096 bytes. 202 on success, 401 for a
bad key, 404 when Radar is off for the site. The browser never sees any of those.

## Test

`node --test plugins/radar/tests/*.test.js`: the edge's page path (no key: null and the page never fetched; with the key: one
tag before `</body>` on an HTML 200 page, none on a page that has one, none on non-HTML, non-200, HEAD or `radar.js` itself), the
beacon path (headers, the body it builds, the fixed target, Sec-GPC and DNT, the
4096-byte cap, the bare 204, no key in the response or the
logs, nothing sent without a key, other paths null, other methods 405, cross-origin 403) and `radar.js` itself against a fake
window that throws on any read of cookies or storage (the exact body, the fetch fallback, GPC and DNT, prerender).
`tests/test_radar_plugin.py` (from the repo root) runs it through the theme loader (the build adds nothing to any page) and the
generated edge code in Node (no key: the served
page is byte-identical to the page with Radar absent).
