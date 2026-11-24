# preview-feedback

Click-to-comment pins on a site's **preview** deploys (garage-door-smores#206). A reviewer taps **Feedback**, clicks the
spot that needs work and types a note. The pin is kept in D1, posted as a comment on the open pull request for that
preview's branch (the page, the element, a link to a picture of the spot), and shown again to the next reviewer until
someone marks it resolved.

It runs only on a branch preview, `<branch>.<project>.pages.dev`. On the production hostname, the bare
`<project>.pages.dev`, the production branch's alias (`main.<project>.pages.dev`, or `FEEDBACK_PRODUCTION_BRANCH`'s) and a
deployment's own `<hash>.<project>.pages.dev` an ordinary visit gets nothing at all: only a review link (site-kit#38) or
the Studio's frame (below) loads it there.

## Settings from the plugin config and the registry (0.17.0 and 0.18.0, site-agent#259 part a)

The four settings can come from the site's plugin config instead of hand-set variables: `site` (FEEDBACK_SITE), `agent`
(FEEDBACK_AGENT), `studio` (FEEDBACK_STUDIO, at most four origins, space-separated) and `pages_project` (FEEDBACK_PAGES_PROJECT).
`plugin.py` checks them and writes `feedback-data.json`, and the edge reads that data first. A FEEDBACK_* variable that is set
still wins, so a site's own `[vars]` keep working, and a site with neither stays off. FEEDBACK_DB and FEEDBACK_COMMENT_FRAME
stay bindings and variables.

**From the registry (0.18.0).** A setting the config leaves empty comes from the site's row in its vendored
`.sitekit/catalog.json`, found by the repository its git origin names: the row's key and `studio.pagesProject`, its studio
platform's `agent` and `studio` hosts (catalog/sites.json `platforms`), then the row's own `studio.hosts`, four origins at most.
A site with no row, or a row with no `studio`, gets nothing from it.

## Turning it off (0.15.0, site-agent#259)

Seth saw Feedback stay on after a `?preview=true` visit, for as long as the browser stayed open. Now:

- **Two hours:** the `pf_preview=1` cookie carries `Max-Age=7200`, written only by an actual `?preview=true` link, so a later
  page of the visit reads it and never pushes its end back.
- **Exit feedback:** on a `?preview=true` visit, a small × beside the button clears the cookie (`Max-Age=0`) and reloads the
  page without `?preview`, so the edge loads no client.
- **`?preview=false`:** loads no client, and the edge answers with a `Set-Cookie` that clears the visit's cookie.

## Feedback on the live site with ?preview=true (0.14.0, site-agent#259 part 2)

Any live page plus `?preview=true` loads the client, and the visit keeps it on page to page with the no-secret
`pf_preview=1` session cookie. The flag only shows the button. A note needs the site agent's own sign-in (Google, GitHub
or an email link) by a person with a grant on the site: the popup opens from the live origin, and the session it mints is
the live site's (the agent's `/session` answers `alias: "live"`, set by the origin it was signed in on). The edge asks the
agent about that session on every note and forwards the note to `/sites/<site>/review-idea`, where it becomes an idea on
the site's job board under the person's name. The session stays in memory, as on a preview: a later page signs in again with
one click (the popup's "Continue as"). A live session is bound to the exact live origin it was signed in on (the agent's
`/session` says it), so the edge refuses it on the site's other addresses, and refuses one whose origin the agent doesn't
say. The gate itself is `previewState(live, href, cookie)`: only on the live site, only with the flag. Without the flag or the cookie a
visitor gets no script.

## The Studio on the live site (0.13.0, site-agent#259)

With no change open, the Studio frames the live site, so Feedback works there too. On the live host the edge injects the
client into a page loaded in a frame (`Sec-Fetch-Dest: iframe`, which only the browser sets), besides a review link. That
page is fetched whole, without the browser's conditional headers, so an ordinary visit's cached copy is never revalidated
into the frame, and it is served with `Vary: Cookie, Sec-Fetch-Dest`. The client shows no button until the Studio greets it
(below); a frame anywhere else holds an inert script. Cloudflare's edge cache honours few `Vary` values, so if a cache rule ever
caches the live HTML, an ordinary visitor could be handed the framed copy; that copy's client is inert outside the
Studio, so nothing shows and nothing can be sent. An ordinary visit still gets no comment code at all. The live site
needs `FEEDBACK_PAGES_PROJECT`, `FEEDBACK_SITE`, `FEEDBACK_AGENT` and, for a branded studio host, `FEEDBACK_STUDIO` in its
production settings; no D1.

## In the site agent's studio (0.12.0, site-agent#259)

The studio shows the same **Feedback** button as any preview. Click it, then click the spot. In the studio this page opens
**no card of its own**: it only tells the studio where the person pointed, as `{ type: "pf-studio-point", site, path,
selector, text, x, y, vw, vh, box }`. The studio draws the conversation card itself, over the frame at that box. The person
types and sends there, and the agent's answer appears there (Seth: "a chat right on the page"). The framed page is the
branch's own code, so it never drives a turn and never reads one; nothing comes back to it (the lead's CHANGE on
site-agent#269). 0.8.0's "Point at something" and 0.11.0's note-to-chat are gone: one way, everywhere.

How: the studio greets the page with `{ type: "pf-studio", site }`. The client takes that only from one of the studio's
origins, for its own site, and only from the window it is framed in (`acceptStudio`). A click is then posted back to that
window at that origin as `pf-studio-point` (`studioPoint`: the same `frameContext` a pin gets, plus the element's box). The
page holds no session, and what it sends is data to the studio (where the person pointed, never what to do), since it is
the branch's own code. Outside the studio nothing changes.

**Showing a change (0.9.0).** A greeting may carry `show`, the text the studio just added (2 to 300 characters). The page
finds the first paragraph, list item, heading, table cell, caption or quote whose words contain it, scrolls it to the middle
(at once under reduced motion), and outlines it in the site's accent for four seconds. It only reads and scrolls.

The studio's origins are `FEEDBACK_AGENT` unless the optional variable `FEEDBACK_STUDIO` names them, separated by
spaces: a site whose studio also runs on its own branded agent host lists both, e.g.
`FEEDBACK_STUDIO = "https://agent.garagedoorsmores.com https://agent.smartwebutah.com"`. Only well-formed origins are
kept (as for `FEEDBACK_AGENT`), at most four; the edge bakes them into `client.js` with the other settings.

## Turning it on in a site

1. From the site's repo root: `<kit>/scripts/plugin-sync.sh preview-feedback <tag>`. That copies this folder to the
   site's `plugins/preview-feedback/`, where its plugin loader reads `plugin.json`: the client goes to
   `/assets/plugins/preview-feedback/assets/`, and the edge module (`handle(context, config, newRewriter)`) joins
   `functions/_chain.js`.
2. A site without a plugin loader calls it first in `functions/_middleware.js`, for every request, and serves the client
   at the same path. The plugin answers the client's own path itself (0.7.0, below), so that path must reach it too:
   ```js
   import { previewFeedback } from "../plugins/preview-feedback/functions/preview-feedback.js";
   // inside onRequest(context):
   const feedback = await previewFeedback(context);
   if (feedback) return feedback;
   ```
3. The site's CSP must allow `script-src 'self'`, `connect-src 'self'` and `img-src 'self' data:` on previews.

## What a site sets

- **D1:** a database bound as `FEEDBACK_DB` with `schema.sql` applied (a site's preview job can find or create it and
  bind it on every deploy, as the publish job in site-agent's `docs/agent-preview.yml` does).
- **Variables** (not secret): `FEEDBACK_PAGES_PROJECT` (the Pages project name), `FEEDBACK_SITE` (the site's key at
  the site agent, lowercase letters, digits and hyphens) and `FEEDBACK_AGENT` (the site agent's origin, exactly
  `https://<host>`: no path, port, trailing slash or capitals, e.g. `https://agent.smartwebutah.com`; 0.6.0, site-kit#155).
  Every origin check trusts `FEEDBACK_AGENT`: the sign-in popup's message, the frame's messages, the frame's CORS and
  the ticket route. So it comes only from the site's own bindings. The edge serves `client.js` itself (0.7.0,
  site-kit#180): it fetches the file from the site's `ASSETS` and fills its one settings slot with the site key, the agent
  and the scope from the bindings and the host. It never reads the request's query string, so every copy a page loads,
  by any tag or `import()`, names the same agent. Served raw, without the edge, the slot is empty and the client does
  nothing. The edge also strips any client tag the page itself carries.

**What this guards, and what it doesn't.** On a preview, the page, `client.js` and the edge function are all the branch's
own build, so a branch can replace any of them. The edge's and the client's checks keep an honest client from being
steered by stray or copied markup. They are not a wall against the branch's own code. The boundary is the site agent:
- it issues a session only to a person with a grant on the site, for that site's preview origin;
- the sign-in and the comment frame are served from its own origin;
- it posts the comment itself, naming the person.

On the live site the page and the client are the production build.

No secret and no Access. Who may comment is the site agent's to say (site-agent#41): **Sign in to comment** opens its
sign-in in a popup (Continue with Google or GitHub, or an emailed link), which hands the page a short-lived session for that site, kept in memory only. The
edge checks the session with the agent (`GET /sites/<site>/session`) on every route but the screenshot, and the agent
posts the comment as its App on the one open PR from the site's repo for that branch alias, naming the person
(`POST /sites/<site>/comment`). A reviewer with no grant on the site gets no session.

Until the bindings are set, with a well-formed `FEEDBACK_SITE` and `FEEDBACK_AGENT`, the plugin injects no button and its
routes answer 503. Upgrading from 0.5.x: set `FEEDBACK_AGENT` (the agent you already use is `https://agent.smartwebutah.com`)
before or with the sync, or comments switch off until it is set.

Upgrading to 0.7.0 (site-kit#180): the client's settings no longer ride in its URL, so the plugin must see requests for
`/assets/plugins/preview-feedback/assets/client.js`. A site whose middleware hands the plugin only pages and `/__feedback/`,
or whose `_routes.json` excludes `/assets/*`, gets the raw client, which shows no button. Route that path to the plugin
with the sync.

## The comment frame (site-agent#67, 0.4.0)

With `FEEDBACK_COMMENT_FRAME = "1"` (a preview variable, off by default), the note is written in the site agent's own
frame, not in the page. A click opens `<FEEDBACK_AGENT>/comment-frame?site=<site>` in the card, and the page
sends it only what was clicked (path, selector, position, viewport). The reviewer signs in inside the frame (an emailed
code), types the note there and clicks Send there, and the agent posts the comment itself. The page never holds a
session, so a script on the branch can't post as the reviewer.

- **The edge gets tickets, not sessions.** The frame then calls `/__feedback/pins` from the agent's origin with
  `Authorization: Ticket <t>`. The edge redeems it once with the agent (`POST /sites/<site>/ticket`), and keeps the pin
  from the ticket, never from the request. A ticket for another preview, from any other origin, or used twice is refused.
- **Earlier pins** are listed through a hidden copy of the frame (`pf-list` → `pf-pins`) once comment mode is on, and
  again after a post, using the frame's sign-in. Signed out, the list is empty.
- **Resolving** opens the frame on the pin's card (`pf-resolve`). The reviewer confirms with a click inside the frame, which
  sends `/__feedback/pins/resolve` a resolve ticket naming the pin; the edge takes the id from the ticket.
- **Make this change** (site-kit#25, 0.4.1): `pf-compose`'s context also carries the clicked element's text as shown (`innerText` since 0.4.2, so hidden
  text stays out; trimmed, at most 300 characters) for the frame's change request. The page shows `pf-changed {job}` as "Change requested". The text comes from
  the branch's own page, so the agent treats it as data.
- **Closing (site-agent#117, 0.5.3; site-agent#119, 0.5.4):** every card has an × in its top corner. Cancel, the × and
  the frame's own Cancel (`pf-cancelled`) close the card and end comment mode, so the page is usable again at once. Esc
  and a click outside a card close it only while it is empty: the page asks the frame (`pf-away`), which alone sees its
  note, and a typed note stays (0.5.4: Esc too, which closed it before).
  A pin list that comes back while a card is open redraws only the markers; it used to wipe the open card (0.5.4). The frame posts its height (`pf-size {h}`) and the card fits it, up to the window less
  the bar, so the frame's first line is never scrolled out of view. An agent from before site-agent#117 sends neither,
  and the card stays 300px.
- **Where the card opens (site-kit#265, 0.10.0):** beside the clicked element, not on it: to its right, else its left, else
  below or above it, unless the element fills most of the screen, when nothing fits beside it. Under 600px wide it is a bottom sheet, and the page scrolls the element above it. The frame draws
  no box of its own (site-agent#190), so the card is the only one. The comment frame's design read on fartranker
  (superintelligentfoo#619) failed on the card covering the heading and the call to action.
- **0.10.1:** an open card hides the "Click anywhere" hint, and until the frame has answered, Esc and a click away close
  the card themselves, so a frame that never loads can't leave it stuck open (the second read on #619).
- **0.10.2 (the third read on #619):** the hint lets taps through, and on a phone it goes after 4 seconds (the Done
  button still shows comment mode is on). The card has a thin line and a soft shadow, with corners from `--pf-radius`.
  A frame card's × sits in its corner. `pf-hello` carries `font`, the page's own `font-family`, for the frame to
  write in. The frame can't load the page's font files, so it gets the name and the site's own fallbacks.
- **0.10.3 (the fourth read on #619):** of the spots that fit (right, left, below, above), the card takes the one that
  covers the least text, sampled with `elementFromPoint`, so a click beside a headline no longer lands the card on it. Only
  the bar's button catches taps. The hint is a chip, says "Tap" on a touch screen, and `pf-hello` also carries `ink`, the
  page's text color.
- **0.10.4 (foo's first read on #619):** `pf-hello` also carries the site's own `--pf-accent`, `--pf-on-accent`,
  `--pf-line` and `--pf-bg`, only those it sets, so the frame's buttons, lines and fields wear the site's colours, not
  the agent host's brand. The frame takes them as hex only.
- **0.10.5 (foo's read on #619):** an element with no words of its own, such as a box of buttons, is labelled by its
  children joined with " · " ("See a day with it · Read the questions"), not run together. A test pins `pfColours`
  to exactly its four `--pf-*` names.
- **0.10.6 (site-kit#296, the Trenz design read):** a card whose frame can't open says why in words instead of a blank
  box. A page whose CSP has no `frame-src` for the agent gets "the page's security settings block the comment frame" at
  once (the `securitypolicyviolation` report), and a frame that never answers gets "didn't answer" after
  `FRAME_WAIT_MS` (8s). The page keeps room at its end for the bar (`padding-bottom` plus 68px), so its last lines scroll
  clear of it. On a phone the page scrolls the clicked element to the middle of the window above the sheet, again when
  the frame sets its height, so what sits around it stays in view. Comment mode's click listener (capture phase, and
  `preventDefault`) is pinned by a test: a footer link tapped in comment mode stays on the page.
  On a wide screen, an element too low for a card beside it (a footer link) is scrolled up until the card fits there,
  instead of the card landing on the lines above it; the page gets any room it lacks at its foot until the card closes.
  The hidden frame that lists earlier notes is greeted with the page's font, ink and `--pf-*` colours too.
- **0.10.7 (site-kit#296, the third Trenz design read):** a card says "Loading comments…" until its frame first
  answers, so it is never an empty box (the "didn't answer" line still follows after `FRAME_WAIT_MS`). On a phone the
  sheet's scroll gets the room it lacks at the page's foot, so a footer link clears the sheet as it does on a wide
  screen. The room kept for the bar is a spacer in the colour of the page's last section, not body padding.
- **0.10.8 (site-kit#296, the fourth Trenz design read):** a tap on a big region no longer heads the card with all its
  words run together. A label joined from several children and longer than 60 characters names the landmark it sits in
  ("the footer", "the header", "the menu", "the sidebar"), else the region's first heading. Anything with words of its
  own (a link, a button, an address line in the footer) keeps them, since "Make this change" asks the agent to change them.
- **0.12.0 (site-agent#259, Seth; the lead's CHANGE on site-agent#269):** in the Studio a click reports only the pointed
  element and its box (`pf-studio-point`); the Studio draws the conversation card over the frame there, and the person types,
  sends and reads the answer in it. The frame opens no card, sends no note and receives nothing. A Studio older than
  site-agent#269 ignores the point.
- **0.11.0 (site-agent#259, Seth):** the Studio gets the same Feedback button and card as a preview. The card's note goes into
  the Studio's chat with the element named (`pf-studio-note`), ready to Send. 0.8.0's "Point at something" and its
  `pf-studio-pin` message are gone: one way to give feedback, everywhere. A Studio still on 0.10.x pages gets no note
  until the site is synced to 0.11.0.
- **Not in frame mode:** the screenshot.
- **The site's CSP** must also allow `frame-src <FEEDBACK_AGENT>` on previews.

## What it keeps and checks

- Who left a pin comes only from the site agent's answer for the reviewer's session.
- A note is plain text, at most 2,000 characters. In the PR comment it sits in a fenced block it cannot close, so it
  never becomes markup, a link or a mention.
- The picture is a PNG of the clicked element, at most 300 KB, taken in the browser with the vendored
  `modern-screenshot` (MIT; `scripts/vendor.sh` rebuilds it, and a test checks its sha256). It is served at
  `/__feedback/shot/<id>` on that branch's preview only, to anyone with its id (a random UUID), because the PR comment
  links it and its reader has no session there. It is never sent anywhere else.
- A pin is kept even when there is no open PR or GitHub fails; the reviewer is told it was saved but not posted, and why.
- A pin belongs to its branch: another preview can neither list, resolve nor fetch its picture.

Routes, on a branch preview, each needing the reviewer's session (`Authorization: Bearer`) but the screenshot:
`GET /__feedback/pins?path=`, `POST /__feedback/pins`, `POST /__feedback/pins/<id>/resolve`, `GET /__feedback/shot/<id>`.

## Review links (site-kit#38)

The site agent mints a review link: the live page plus `?review=<token>`, where the token is 43 base64url characters,
stored hashed, scoped to one site, and good for 7 days unless revoked. Anyone holding it types a name once and comments,
with no sign-in. The edge checks the token with the agent (`GET /sites/<site>/review`) on every route.

- **On a preview:** the pin goes to the branch's PR, as a signed-in reviewer's does, labelled "(review link)". A review
  link sees no one else's pins and can't resolve them.
- **On the live site:** the pin and its screenshot go straight to the agent (`POST /sites/<site>/review-idea`) as an
  `idea` job. The live site keeps nothing, and needs only `FEEDBACK_PAGES_PROJECT`, `FEEDBACK_SITE` and `FEEDBACK_AGENT` (no D1). The
  client is injected only when the URL has `?review=` or the no-secret `pf_review=1` cookie the client sets, so an
  ordinary visitor loads no comment code.
- The client moves the token to the tab's sessionStorage and out of the URL bar. A `?review=` page is served with
  `Referrer-Policy: no-referrer`, so the token never reaches a third party in a Referer.
- An expired or revoked link answers 410 and reads "This review link has ended".
- **Marked as a review link where it's kept** (0.5.0, site-kit#67). The name is whatever the link's holder typed, so it is
  never stored as if a signed-in person wrote it:
  - a preview pin from a review link gets a row in `feedback_review_pins`, which the server writes and no request can set;
  - the pins list returns `review: true` for it, and the panel shows "Blair (review link)";
  - a typed name containing `@` is refused with a 400 ("type your name, not an email address"), so a link can't sign as
    someone's address. A signed-in person's name may still be their address, since the agent vouched for them.
  - the name is NFKC-normalised and stripped of format characters first (0.5.1, site-kit#91), so a full-width ＠, a small ﹫
    or a bidi mark can't slip an address past that check or reorder the name.
  - the typed name goes on the review check the edge already makes (`GET /sites/<key>/review?name=`), and when the agent
    answers `name_ok: false` (it matches a team member's name or address on this site) the pin is refused with a 400
    ("type your name, not a team member's"). An agent from before site-agent#91 never answers `name_ok`, and nothing changes
    (0.5.2).
- **Sites:** nothing to do beyond the usual deploy. `feedback_review_pins` is created `IF NOT EXISTS` by `schema.sql`, which
  the site applies on every deploy (site-agent's `docs/agent-preview.yml`). Pins kept before 0.5.0 read as signed-in.

## Matching the site's look

The popup, its fields and its buttons read `--pf-accent`, `--pf-on-accent`, `--pf-bg`, `--pf-ink`, `--pf-line`,
`--pf-muted`, `--pf-font` and `--pf-radius`, with the plugin's own colours as the fallback (0.10.0: a neutral ink, not
orange, so a site that maps nothing doesn't clash). The Feedback bar sits bottom right in `--pf-font` (0.10.0), `--pf-bar-right` from the right edge (default 12px):
a site with another fixed button there sets it past that, as S'mores does past Talk's campfire bubble. A site maps them to its
tokens on `:root`, the same way it maps the Talk plugin's `--talk-*`. For S'mores:
`--pf-accent:var(--toast);--pf-on-accent:var(--on-toast);--pf-bg:var(--marshmallow);--pf-ink:var(--ink);--pf-line:var(--graham);--pf-muted:var(--text);--pf-radius:14px;--pf-font:Barlow,Barlow-fallback,system-ui,sans-serif`.
