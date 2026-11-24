// preview-feedback (site-kit plugin; garage-door-smores#206): click-to-comment pins on a site's PREVIEW deploys. A
// reviewer turns on comment mode, clicks a spot and writes a note; the pin is kept in D1 and posted as a comment on the
// open PR for that preview's branch, with the page, the element and a link to a screenshot of the spot.
//
// A site turns it on by calling previewFeedback(context) first in its functions/_middleware.js and returning its answer
// when it gives one. It answers ONLY on a branch-alias preview host, <branch>.<project>.pages.dev: never on the
// production hostname, the bare <project>.pages.dev, or a deployment's own <hash>.<project>.pages.dev (which a
// production deploy has too). On any other host it returns null and the site serves the request as before.
//
// Who may comment is the site agent's to say (site-agent#41): a reviewer signs in there by magic link, in a popup the
// client opens, and gets a short-lived session for this site that the client keeps in memory and sends as a bearer
// token. Every route but the screenshot checks it with the agent, and the agent posts the PR comment as its App, naming
// the person. No Access, no GitHub token and no secret on the site.
//
// A review link (site-kit#38) is the other way in: the page plus ?review=<token>, minted by the agent. Anyone holding it
// may comment, under a name they type, on a preview (the pin goes to the PR) or on the LIVE site (the pin becomes an
// idea job on the agent's board). The token only ever allows commenting, and the agent checks it on every route. On the
// live site the client is injected only when the URL carries ?review= or the page set the no-secret pf_review=1 cookie,
// so an ordinary visitor gets no comment code at all. The one other way in (0.13.0, site-agent#259): a live page loaded in
// a frame (Sec-Fetch-Dest: iframe), as the site agent's Studio frames the live site when no change is open. The client there
// shows no button until the Studio greets it from one of FEEDBACK_STUDIO's origins (acceptStudio), so a frame anywhere
// else holds an inert script. The live site keeps nothing: no D1 is bound there, and a pin and
// its screenshot go straight to the agent, which stores the picture. A ?review= page is served with
// Referrer-Policy: no-referrer, so the token cannot leave in a Referer before the client strips it from the URL.
//
// Bindings: FEEDBACK_DB (D1, schema.sql), FEEDBACK_PAGES_PROJECT (the Pages project name), FEEDBACK_SITE (the site's key
// at the site agent), FEEDBACK_AGENT (the site agent's origin, exactly https://<host>, e.g. https://agent.smartwebutah.com;
// site-kit#155), FEEDBACK_PRODUCTION_BRANCH (optional, default main: its alias serves production and is refused),
// FEEDBACK_STUDIO (optional: the site agent's studio origins, space-separated; default FEEDBACK_AGENT; site-agent#164).
// Without any of the required ones it answers 503 on its own routes and injects nothing, so a half-configured site shows
// no button that cannot work. FEEDBACK_AGENT is what every origin check here and in the client trusts, so it only ever
// comes from the site's own bindings, never from a request or a page: the edge serves client.js itself, from the site's
// ASSETS, with its settings baked in (site-kit#180), and ignores any query string on it.

const NEEDED = ["FEEDBACK_DB", "FEEDBACK_PAGES_PROJECT", "FEEDBACK_SITE", "FEEDBACK_AGENT"];
const NEEDED_LIVE = ["FEEDBACK_PAGES_PROJECT", "FEEDBACK_SITE", "FEEDBACK_AGENT"];   // the live site keeps no pins, so no D1
export const AGENT_ORIGIN = /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;   // no path, port, slash or capitals: origins compare exactly
const SITE_KEY = /^[a-z0-9][a-z0-9-]{0,39}$/;
const BEARER = /^Bearer ([A-Za-z0-9._~+\/=-]{16,512})$/;
const REVIEW = /^Review ([A-Za-z0-9_-]{43})$/;    // 32 random bytes, base64url
export const LIVE = "live";                       // the scope (D1 alias) of pins left on the live site
const NAME_CAP = 80;
const ROUTE = "/__feedback/";
const CLIENT = "/assets/plugins/preview-feedback/assets/client.js";   // where a site's plugin loader puts plugin.json's assets
export const SLOT = "/*pf-config*/null/*pf-config*/";   // client.js's settings slot, which only this edge fills
const MAX_BODY = 400_000;     // bytes: a note plus a screenshot of the spot
const MAX_SHOT = 300_000;     // bytes of PNG
const CAPS = { note: 2000, selector: 500, text: 300, path: 300, ua: 300 };
const HASH_HOST = /^[0-9a-f]{8}$/;
const PATH = /^\/[A-Za-z0-9\-._~%\/!$&'()*+,;=:@]*$/;   // RFC 3986 path characters only   // <hash>.<project>.pages.dev is one deployment, production's included

const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

// site-agent#67: with FEEDBACK_COMMENT_FRAME=1 the note is written in the site agent's own frame, which posts the comment
// itself; this edge then gets only single-use tickets from it (a pin to record, or a list), never a session.
export const FRAME = "FEEDBACK_COMMENT_FRAME";
const TICKET = /^Ticket ([A-Za-z0-9_-]{16,128})$/;
const frameCors = (agent) => ({ "Access-Control-Allow-Origin": agent, "Access-Control-Allow-Headers": "Authorization",
  "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Max-Age": "600", Vary: "Origin" });

// The branch alias when host is a branch preview of project, else null. The production branch's own alias
// (main.<project>.pages.dev) serves the production deploy, so it is refused like the bare project host.
export function previewAlias(host, project, productionBranch = "main") {
  if (!project) return null;
  const suffix = `.${project.toLowerCase()}.pages.dev`;
  const h = String(host || "").toLowerCase();
  if (!h.endsWith(suffix)) return null;
  const alias = h.slice(0, -suffix.length);
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(alias) || HASH_HOST.test(alias)) return null;
  if (alias === branchAlias(productionBranch || "main")) return null;
  return alias;
}

// Cloudflare Pages' alias for a branch: lowercased, every run of other characters a hyphen, trimmed, at most 28
// characters. A PR matches when its head branch gives the preview's alias.
export function branchAlias(branch) {
  return String(branch).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28).replace(/-+$/, "");
}

// ---- who is signed in: the reviewer's site-agent session for this site AND this preview (the agent binds a session to
// the one preview it signed in from, and says which alias), checked with the agent; else null.
export function bearer(request) {
  const m = BEARER.exec(request.headers.get("Authorization") || "");
  return m ? m[1] : null;
}

// The review token on a request, or null.
export function reviewToken(request) {
  const m = REVIEW.exec(request.headers.get("Authorization") || "");
  return m ? m[1] : null;
}

// The name a review-link holder typed (X-Review-Name, URI-encoded), as plain text, or "".
export function reviewName(request) {
  let raw = request.headers.get("X-Review-Name") || "";
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return "";
  }
  // NFKC folds lookalikes (the full-width ＠ and small ﹫ become "@", so the email check sees them), and format characters
  // (bidi marks, zero-width spaces) are dropped, so a typed name can't hide an address or reorder itself (site-kit#91).
  return plain(raw.normalize("NFKC").replace(/\p{Cf}/gu, ""), NAME_CAP);
}

// Who may comment here: { who, auth, review } when the agent confirms a session for this scope (a preview's, or the live
// site's: site-agent#259) or a review token (previews and live), { ended } when the agent says the review link expired or was revoked, { other } when it was
// minted for another site, else null.
export async function commenter(request, env, scope) {
  const review = reviewToken(request);
  if (review) {
    const who = reviewName(request);
    let res;
    try {
      // The typed name rides on the check already made, so the agent can say it is a team member's (site-agent#91).
      const query = who ? `?name=${encodeURIComponent(who)}` : "";
      res = await fetch(`${env.FEEDBACK_AGENT}/sites/${env.FEEDBACK_SITE}/review${query}`, { headers: { Authorization: `Review ${review}` } });
    } catch {
      return null;
    }
    if (res.status === 410) return { ended: true };
    if (res.status === 403) return { other: true };
    if (res.status !== 200) return null;
    // Only an explicit name_ok: false refuses; an agent from before site-agent#91 answers without it.
    const team = Boolean(who) && (await res.json().catch(() => null))?.name_ok === false;
    return { who, auth: `Review ${review}`, review: true, team };
  }
  // The live site takes review links, and (site-agent#259 part 2) a session the agent minted on the live site itself.
  const who = await agentUser(request, env, scope);
  return who ? { who, auth: `Bearer ${bearer(request)}`, review: false } : null;
}

export async function agentUser(request, env, alias) {
  const token = bearer(request);
  if (!token) return null;
  let res;
  try {
    res = await fetch(`${env.FEEDBACK_AGENT}/sites/${env.FEEDBACK_SITE}/session`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return null;
  }
  if (res.status !== 200) return null;
  const me = await res.json().catch(() => null);
  if (!me || me.alias !== alias) return null;
  // site-agent#259 (security read on #682): a live session is bound to the exact live origin it was signed in on, so it
  // is taken only on that host, never on a deployment's hash host or another of the site's addresses. An agent that does
  // not say the origin is refused (fails closed).
  if (alias === LIVE && me.origin !== new URL(request.url).origin) return null;
  const who = me.name || me.email;
  return typeof who === "string" && who ? who.slice(0, 200) : null;
}

// ---- the PR comment
const plain = (v, cap) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, cap) : "");
// Inline code that cannot be broken out of: backticks become a lookalike, so a note or selector never renders as markup,
// links or a mention.
const code = (s) => `\`${String(s).replace(/`/g, "ˋ").replace(/\n/g, " ")}\``;

export function commentBody(pin, origin) {
  const page = `${origin}${pin.path}`;
  const note = pin.note.replace(/```/g, "ˋˋˋ");
  return [
    `**Preview feedback** on ${code(pin.path)}`,   // the agent's own line names the person
    "",
    "```text",
    note,
    "```",
    "",
    `- Page: ${page}`,
    `- Element: ${code(pin.selector)} at ${Math.round(pin.x)}, ${Math.round(pin.y)} px in it; viewport ${pin.vw}×${pin.vh}`,
    pin.has_shot ? `- Screenshot of the spot: ${origin}${ROUTE}shot/${pin.id}` : "- Screenshot: none (the browser could not take one)",
    "",
    "Resolve it from the page's feedback list on the preview.",
    `<!-- preview-feedback:pin=${pin.id} -->`,
  ].join("\n");
}

// The agent posts the comment as its App on the one open PR from the site's repo whose branch gives this alias.
// Returns { url } or { why }: a pin is kept either way.
async function postComment(env, auth, alias, body, name) {
  let res;
  try {
    res = await fetch(`${env.FEEDBACK_AGENT}/sites/${env.FEEDBACK_SITE}/comment`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(name ? { alias, body, name } : { alias, body }),
    });
  } catch {
    return { why: "the site agent could not be reached" };
  }
  if (res.status === 200) {
    const out = await res.json().catch(() => null);
    return out && typeof out.url === "string" ? { url: out.url } : { why: "the site agent's answer had no comment link" };
  }
  if (res.status === 409) return { why: "no single open pull request for this preview's branch" };
  if (res.status === 429) return { why: "too many comments just now; try again in a minute" };
  if (res.status === 410) return { why: "this review link has ended" };
  if (res.status === 401) return { why: "your sign-in ended; sign in again to post it" };
  if (res.status === 403) return { why: "your sign-in is for another preview; sign in again here" };
  return { why: `the site agent answered HTTP ${res.status}` };
}

// A live-site pin becomes an idea job on the agent's board (site-kit#38). Returns { job } or { why }: kept either way.
async function postIdea(env, auth, pin) {
  let res;
  try {
    res = await fetch(`${env.FEEDBACK_AGENT}/sites/${env.FEEDBACK_SITE}/review-idea`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: pin.author,
        page: pin.page,
        selector: pin.selector,
        text: pin.text,
        note: pin.note,
        shot: pin.shot,   // a PNG data URL or null; the agent stores it
      }),
    });
  } catch {
    return { why: "the site agent could not be reached" };
  }
  if (res.status === 201 || res.status === 200) {
    const out = await res.json().catch(() => null);
    return out && out.id != null ? { job: String(out.id) } : { why: "the site agent's answer had no job id" };
  }
  if (res.status === 410) return { why: "this review link has ended" };
  if (res.status === 429) return { why: "this review link's comments for today are used up" };
  return { why: `the site agent answered HTTP ${res.status}` };
}

// ---- routes
async function readJson(request) {
  if (Number(request.headers.get("Content-Length")) > MAX_BODY) return null;
  if (!request.body) return null;
  const reader = request.body.getReader(), parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(all));
  } catch {
    return undefined;
  }
}

function shotBytes(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) return null;
  let bytes;
  try {
    bytes = Uint8Array.from(atob(dataUrl.slice(22)), (c) => c.charCodeAt(0));
  } catch {
    return null;   // not base64: a 400, never a 500
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length <= MAX_SHOT && png.every((b, i) => bytes[i] === b) ? bytes : null;
}

const open = (pin) => ({ id: pin.id, path: pin.path, selector: pin.selector, x: pin.x, y: pin.y, note: pin.note, author: pin.author, review: Boolean(pin.review), created_at: pin.created_at, comment_url: pin.comment_url });

// A page's open pins, each marked when it came through a review link (site-kit#67).
const PAGE_PINS = "SELECT p.*, r.id IS NOT NULL AS review FROM feedback_pins p LEFT JOIN feedback_review_pins r ON r.id = p.id WHERE p.alias = ? AND p.path = ? AND p.status = 'open' ORDER BY p.created_at";

// What is wrong with a pin before it is kept, or null.
function pinProblem(pin) {
  // A URL path and nothing else: no spaces, line breaks or brackets, so it cannot add lines or markup to the PR comment.
  if (!PATH.test(pin.path) || pin.path.startsWith("//")) return "path must be a page on this site";
  // A letter, so the agent's name rule (letters, digits, spaces, .'-) never refuses what the edge took.
  if (!/\p{L}/u.test(pin.author)) return "type your name first";
  // A review link's name is typed by whoever holds the link, so it may not pass for a signed-in person's address (site-kit#67).
  if (pin.review && pin.author.includes("@")) return "type your name, not an email address";
  // ...nor for a team member's name or address on this site, which only the agent knows (site-agent#91).
  if (pin.review && pin.team) return "type your name, not a team member's";
  if (!pin.note) return "write a note";
  if (!pin.selector) return "pick an element";
  if (![pin.x, pin.y, pin.vw, pin.vh].every(Number.isFinite)) return "x, y and the viewport must be numbers";
  return null;
}

// The agent's frame (site-agent#67) calls this from the agent's origin with a single-use ticket, which the agent redeems
// once for this site. A "pin" ticket records the pin the agent already posted, taken from the ticket, never from the
// request; a "list" ticket lists this page's open pins; a "resolve" ticket, at /pins/resolve, resolves the pin it names.
// The ticket must be for this preview's alias.
async function framePins(request, env, alias, url, rest = "pins") {
  const cors = frameCors(env.FEEDBACK_AGENT);
  const answer = (status, body) => json(status, body, cors);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Cache-Control": "no-store" } });
  if (request.headers.get("Origin") !== env.FEEDBACK_AGENT) return answer(403, { error: "only the site agent's frame sends tickets" });
  const ticket = TICKET.exec(request.headers.get("Authorization") || "")?.[1];
  if (!ticket) return answer(401, { error: "sign in to comment" });
  let got = null;
  try {
    const res = await fetch(`${env.FEEDBACK_AGENT}/sites/${env.FEEDBACK_SITE}/ticket`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket }),
    });
    if (res.status === 200) got = await res.json().catch(() => null);
  } catch {
    got = null;
  }
  if (!got) return answer(401, { error: "that ticket was used or has expired" });
  if (got.alias !== alias) return answer(403, { error: "that ticket is for another preview" });
  const who = plain(got.name, 200) || "a reviewer";
  if (request.method === "GET" && got.kind === "list") {
    const path = url.searchParams.get("path") || "/";
    const { results } = await env.FEEDBACK_DB.prepare(PAGE_PINS).bind(alias, path).all();
    return answer(200, { pins: results.map(open), who });
  }
  // A "resolve" ticket resolves the one pin it names (minted after a click in the frame); the id comes from the ticket.
  if (request.method === "POST" && rest === "pins/resolve" && got.kind === "resolve") {
    const id = String(got.pin?.id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) return answer(400, { error: "that ticket names no pin" });
    const r = await env.FEEDBACK_DB.prepare("UPDATE feedback_pins SET status = 'resolved', resolved_at = ?, resolved_by = ? WHERE id = ? AND alias = ? AND status = 'open'")
      .bind(Date.now(), who, id, alias).run();
    return answer(r.meta.changes === 1 ? 200 : 404, { resolved: r.meta.changes === 1, id });
  }
  if (request.method !== "POST" || rest !== "pins" || got.kind !== "pin" || !got.pin || typeof got.pin !== "object") return answer(400, { error: "that ticket is not for this" });
  const t = got.pin;
  const pin = {
    id: crypto.randomUUID(), created_at: Date.now(), alias,
    path: plain(t.path, CAPS.path), selector: plain(t.selector, CAPS.selector), note: plain(t.note, CAPS.note),
    x: Number(t.x), y: Number(t.y), vw: Math.round(Number(t.vw)), vh: Math.round(Number(t.vh)),
    ua: plain(request.headers.get("User-Agent") || "", CAPS.ua), author: who,
  };
  const problem = pinProblem(pin);
  if (problem) return answer(400, { error: problem });
  const posted = typeof got.url === "string" && /^https:\/\/github\.com\//.test(got.url) ? got.url : null;
  await env.FEEDBACK_DB.prepare(
    "INSERT INTO feedback_pins (id, created_at, alias, path, selector, x, y, vw, vh, ua, note, author, status, shot, comment_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, ?)",
  ).bind(pin.id, pin.created_at, alias, pin.path, pin.selector, pin.x, pin.y, pin.vw, pin.vh, pin.ua, pin.note, pin.author, posted).run();
  return answer(201, { pin: open({ ...pin, comment_url: posted }) });
}

async function create(request, env, alias, me) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return json(403, { error: "send it from the page itself" });
  const input = await readJson(request);
  if (input === null) return json(413, { error: `at most ${MAX_BODY} bytes` });
  if (!input || typeof input !== "object") return json(400, { error: "send JSON" });
  const pin = {
    id: crypto.randomUUID(),
    created_at: Date.now(),
    alias,
    path: plain(input.path, CAPS.path),
    selector: plain(input.selector, CAPS.selector),
    text: plain(input.text, CAPS.text),   // the element's own words (site-kit#689); a live note's job names it by them
    note: plain(input.note, CAPS.note),
    x: Number(input.x), y: Number(input.y), vw: Math.round(Number(input.vw)), vh: Math.round(Number(input.vh)),
    ua: plain(request.headers.get("User-Agent") || "", CAPS.ua),
    author: me.who,
    review: me.review,
    team: me.team,
  };
  const problem = pinProblem(pin);
  if (problem) return json(400, { error: problem });
  const shot = input.shot == null ? null : shotBytes(input.shot);
  if (input.shot != null && !shot) return json(400, { error: `the screenshot must be a PNG of at most ${MAX_SHOT} bytes` });
  pin.has_shot = Boolean(shot);
  const origin = new URL(request.url).origin;
  if (alias === LIVE) {
    const { job = null, why = null } = await postIdea(env, me.auth, { ...pin, page: `${origin}${pin.path}`, shot: shot ? input.shot : null });
    return json(201, { pin: open({ ...pin, comment_url: null }), posted: Boolean(job), job, why });
  }
  const keep = env.FEEDBACK_DB.prepare(
    "INSERT INTO feedback_pins (id, created_at, alias, path, selector, x, y, vw, vh, ua, note, author, status, shot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)",
  ).bind(pin.id, pin.created_at, alias, pin.path, pin.selector, pin.x, pin.y, pin.vw, pin.vh, pin.ua, pin.note, pin.author, shot);
  // A review-link pin and its mark are kept together or not at all, so one can never read as a signed-in person's (site-dev on #87).
  if (me.review) await env.FEEDBACK_DB.batch([keep, env.FEEDBACK_DB.prepare("INSERT INTO feedback_review_pins (id) VALUES (?)").bind(pin.id)]);
  else await keep.run();
  // The pin is kept even if the agent is down or there is no PR; the reply says which, so the reviewer is never told it
  // posted when it did not.
  const { url: posted = null, why = null } = await postComment(env, me.auth, alias, commentBody(pin, origin), me.review ? me.who : null);
  if (posted) await env.FEEDBACK_DB.prepare("UPDATE feedback_pins SET comment_url = ? WHERE id = ?").bind(posted, pin.id).run();
  return json(201, { pin: open({ ...pin, comment_url: posted }), posted: Boolean(posted), why });
}

// The site-kit edge contract (functions/_chain.js on the sites): handle(context, config, newRewriter) returns a Response or
// null. This plugin reads its bindings from env by fixed names (see the header), so it takes no config.
export function handle(context, config, newRewriter) {
  return previewFeedback({ ...context, env: settings(context.env, config) }, newRewriter);
}

// site-agent#259 part (a), 0.17.0: the four settings come from the plugin's data (feedback-data.json, written by plugin.py from
// the site's plugin config, which site_sync fills from the registry). A FEEDBACK_* variable that is set wins, so a site's own
// [vars] keep working; bindings (FEEDBACK_DB) and every other variable pass through untouched.
const FROM_DATA = { site: "FEEDBACK_SITE", agent: "FEEDBACK_AGENT", studio: "FEEDBACK_STUDIO", pages_project: "FEEDBACK_PAGES_PROJECT" };
export function settings(env = {}, data) {
  const config = (data && typeof data === "object" && data.config) || {};
  const out = { ...env };
  for (const [key, name] of Object.entries(FROM_DATA)) {
    if (!out[name] && typeof config[key] === "string" && config[key]) out[name] = config[key];
  }
  return out;
}

export async function previewFeedback(context, newRewriter = () => new HTMLRewriter()) {
  const { request, env } = context;
  const url = new URL(request.url);
  // A branch preview's pins are that branch's; every other host serves the live site, which takes review links only.
  const alias = previewAlias(url.hostname, env.FEEDBACK_PAGES_PROJECT, env.FEEDBACK_PRODUCTION_BRANCH) || LIVE;
  // FEEDBACK_SITE goes into the page's script tag and the agent's URLs, so a malformed key counts as not set up.
  const ready = (alias === LIVE ? NEEDED_LIVE : NEEDED).every((k) => env[k]) && SITE_KEY.test(env.FEEDBACK_SITE)
    && AGENT_ORIGIN.test(env.FEEDBACK_AGENT);
  // Every request for the client, whatever its query string, gets the copy this edge fills from the bindings (site-kit#180).
  if (url.pathname === CLIENT) return ready ? serveClient(context, alias === LIVE ? LIVE : "preview") : null;
  if (!url.pathname.startsWith(ROUTE)) {
    if (!ready) return null;
    const off = alias === LIVE && previewOff(url);
    let res;
    if (alias === LIVE && !reviewing(request, url) && !framed(request) && !previewing(request, url)) {
      if (!off) return null;   // an ordinary visitor: no comment code at all
      res = await context.next();
    } else res = await inject(context, newRewriter, alias);
    if (off) {
      res = new Response(res.body, res);
      res.headers.append("Set-Cookie", PREVIEW_COOKIE_CLEAR);
    }
    return res;
  }
  if (!ready) return alias === LIVE ? null : json(503, { error: "preview feedback isn't set up on this site" });
  const rest = url.pathname.slice(ROUTE.length);
  const db = env.FEEDBACK_DB;
  if (alias === LIVE) return live(request, env, rest);
  // The screenshot is linked from the PR comment, where the reader has no session here: it is served to anyone with
  // its id (a random UUID), on this branch's preview only.
  let m = /^shot\/([0-9a-f-]{36})$/.exec(rest);
  if (m && request.method === "GET") {
    const row = await db.prepare("SELECT shot FROM feedback_pins WHERE id = ? AND alias = ?").bind(m[1], alias).first();
    if (!row || !row.shot) return new Response("No screenshot.\n", { status: 404 });
    return new Response(new Uint8Array(row.shot), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  }
  if ((rest === "pins" || rest === "pins/resolve") && env[FRAME] === "1" && (request.method === "OPTIONS" || TICKET.test(request.headers.get("Authorization") || ""))) {
    return framePins(request, env, alias, url, rest);
  }
  const me = await commenter(request, env, alias);
  if (me && me.ended) return json(410, { error: "this review link has ended", ended: true });
  if (me && me.other) return json(403, { error: "this review link is for another site" });
  if (!me) return json(401, { error: alias === LIVE ? "open this page from a review link to comment" : "sign in to comment" });
  const who = me.who || "review link";
  // A review link only ever comments: it sees no one else's pins (their authors can be emails) and resolves nothing.
  if (rest === "pins" && request.method === "GET" && me.review) return json(200, { pins: [], who });
  if (rest === "pins" && request.method === "GET") {
    const path = url.searchParams.get("path") || "/";
    const { results } = await db.prepare(PAGE_PINS).bind(alias, path).all();
    return json(200, { pins: results.map(open), who });
  }
  if (rest === "pins" && request.method === "POST") return create(request, env, alias, me);
  m = /^pins\/([0-9a-f-]{36})\/resolve$/.exec(rest);
  if (m && request.method === "POST") {
    if (me.review) return json(403, { error: "a review link can leave notes, not resolve them" });
    if (request.headers.get("Origin") !== url.origin) return json(403, { error: "send it from the page itself" });
    const r = await db.prepare("UPDATE feedback_pins SET status = 'resolved', resolved_at = ?, resolved_by = ? WHERE id = ? AND alias = ? AND status = 'open'")
      .bind(Date.now(), who, m[1], alias).run();
    return json(r.meta.changes === 1 ? 200 : 404, { resolved: r.meta.changes === 1 });
  }
  return json(404, { error: "no such feedback route" });
}

// The live site's routes: a review link may post a pin (it becomes an idea job) and nothing else. It keeps no pins, so
// there is nothing to list, resolve or fetch a picture of.
async function live(request, env, rest) {
  const me = await commenter(request, env, LIVE);
  if (me && me.ended) return json(410, { error: "this review link has ended", ended: true });
  if (me && me.other) return json(403, { error: "this review link is for another site" });
  if (!me) return json(401, { error: "open this page from a review link to comment" });
  if (rest === "pins" && request.method === "GET") return json(200, { pins: [], who: me.who || "review link" });
  if (rest === "pins" && request.method === "POST") return create(request, env, LIVE, me);
  return json(404, { error: "no such feedback route" });
}

// A live-site visit that is reviewing: the review link itself, or a later page of the same visit (the client sets the
// no-secret pf_review=1 session cookie; the token stays in the tab's sessionStorage).
export function reviewing(request, url) {
  if (url.searchParams.has("review")) return true;
  return /(?:^|;\s*)pf_review=1(?:;|$)/.test(request.headers.get("Cookie") || "");
}

// site-agent#259 part 2 (Seth's design): any live page plus ?preview=true, or a later page of the same visit (the client
// sets the no-secret pf_preview=1 session cookie), loads the client. The flag only shows the button: a note needs the site
// agent's own sign-in, which the agent checks on every note (a session it minted on this live origin, for a person with a
// grant on the site).
export function previewing(request, url) {
  if (previewOff(url)) return false;
  if (url.searchParams.get("preview") === "true") return true;
  return /(?:^|;\s*)pf_preview=1(?:;|$)/.test(request.headers.get("Cookie") || "");
}

// site-agent#259 (the lead's ruling after Seth saw Feedback stay on): ?preview=false turns it off. The page then loads no
// client, so this edge clears the visit's cookie itself, with the same attributes the client sets it with.
export const PREVIEW_COOKIE_CLEAR = "pf_preview=; path=/; Max-Age=0; SameSite=Lax; Secure";
export const previewOff = (url) => url.searchParams.get("preview") === "false";

// site-agent#259: a page loaded in a frame, as the Studio loads the live site. Browsers set Sec-Fetch-Dest on every
// navigation and a page cannot set it, so only the visitor's own browser says the page is framed.
export function framed(request) {
  return request.headers.get("Sec-Fetch-Dest") === "iframe";
}

// The request without its conditional headers: a framed live page is fetched whole, so a copy the browser kept from an
// ordinary visit (no client in it) is never revalidated with a 304 into the Studio's frame.
export function unconditional(request) {
  const headers = new Headers(request.headers);
  for (const h of ["If-None-Match", "If-Modified-Since"]) headers.delete(h);
  return new Request(request, { headers });
}

const STRIP = { element(el) { el.remove(); } };

// The client's settings: the site's bindings, already checked (SITE_KEY, AGENT_ORIGIN), and the scope this host gives.
export function clientSettings(env, scope) {
  return { site: env.FEEDBACK_SITE, agent: env.FEEDBACK_AGENT, studio: studioOrigins(env), scope, frame: scope !== LIVE && env[FRAME] === "1" };
}

// site-agent#164: the origins the site agent's studio is served from, which may greet this page in its frame. The optional
// FEEDBACK_STUDIO lists them, space-separated (a site's branded agent host beside the shared one); unset, the studio is
// FEEDBACK_AGENT. Only well-formed origins are kept, at most four.
export function studioOrigins(env) {
  const named = typeof env.FEEDBACK_STUDIO === "string" ? env.FEEDBACK_STUDIO.split(/\s+/).filter((o) => AGENT_ORIGIN.test(o)) : [];
  return (named.length ? [...new Set(named)] : [env.FEEDBACK_AGENT]).slice(0, 4);
}

// The client's one tag. It carries no settings: the edge bakes them into the file it serves (site-kit#180).
export function clientTag() {
  return `<script src="${CLIENT}" type="module"></script>`;
}

// The file with its one slot replaced by the settings. A function replacement, so a $&, $1, $` or $' in a value is never read
// as a replacement pattern: that holds by construction, not by the settings' own patterns staying narrow.
export function fillSlot(src, settings) {
  return src.replace(SLOT, () => JSON.stringify(settings));
}

// client.js from the site's own assets, with its settings slot filled. The query string is never read, and the asset is
// fetched without the request's headers, so a conditional request can't get back a 304 with no body to fill. A file
// without the slot (an old vendored copy) is refused rather than served unfilled.
async function serveClient(context, scope) {
  const asset = await context.env.ASSETS.fetch(new Request(new URL(CLIENT, context.request.url)));
  if (asset.status !== 200) return asset;
  const src = await asset.text();
  if (src.split(SLOT).length !== 2) return new Response("client.js has no settings slot.\n", { status: 500, headers: { "Cache-Control": "no-store" } });
  return new Response(fillSlot(src, clientSettings(context.env, scope)), {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

// Adds the client script to an HTML page; anything else passes through untouched. The tag's scope tells the
// client whether its pins go to a pull request or to the board.
async function inject(context, newRewriter, alias) {
  const scope = alias === LIVE ? LIVE : "preview";
  let res = await context.next(scope === LIVE && framed(context.request) ? unconditional(context.request) : undefined);
  // The review token is in this URL until the client strips it: no Referer may carry it to a third party.
  if (new URL(context.request.url).searchParams.has("review")) {
    res = new Response(res.body, res);
    res.headers.set("Referrer-Policy", "no-referrer");
  }
  if (!(res.headers.get("Content-Type") || "").includes("text/html")) return res;
  // The live page differs by the pf_review cookie and by being framed, so no cache may hand the copy with the client to
  // an ordinary visit.
  if (scope === LIVE) {
    res = new Response(res.body, res);
    res.headers.append("Vary", "Cookie, Sec-Fetch-Dest");
  }
  return newRewriter()
    // A page's own copy of the client tag (in its markup, before or after </body>) is removed, so the page holds one tag.
    // Any copy still loads with the site's agent, which the edge bakes in (site-kit#180). HTMLRewriter runs no handler on
    // what this edge appends, so its own tag stays.
    .on(`script[src^="${CLIENT}"]`, STRIP)
    .on("script[data-preview-feedback-site]", STRIP)   // a 0.5.x-shaped tag, from a page that copied one
    .on("body", { element(el) { el.append(clientTag(), { html: true }); } })
    .transform(res);
}
