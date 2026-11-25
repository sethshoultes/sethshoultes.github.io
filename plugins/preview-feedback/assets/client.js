// preview-feedback's client (site-kit plugin; garage-door-smores#206). Loaded only on a preview deploy, by the plugin's
// Function. A "Feedback" button turns comment mode on; a click on the page drops a pin there and asks for a note; the
// note, the element and a picture of it go to /__feedback/pins, which keeps them and posts them on the branch's PR.
// Open pins reload for the next reviewer and can be resolved. Everything shown is set as text, and styles are set as
// properties, so a site's strict CSP (no inline style or script) still lets it work.
//
// Who may comment is the site agent's to say (site-agent#41): "Sign in to comment" opens its magic-link sign-in in a
// popup, which hands this page a short-lived session for this site by postMessage. The session lives in memory only
// and goes to this site's own routes as a bearer token; the edge checks it with the agent.
//
// A review link (site-kit#38) is the page plus ?review=<token>: the token goes to this tab's sessionStorage, leaves the
// URL bar, and the page sets the no-secret pf_review=1 cookie so the edge injects this client on the visit's later pages
// too. The reviewer types a name once and comments with no sign-in. On the live site the pins become jobs on the board.
//
// Styles come from --pf-* custom properties when the site sets them (as it maps --talk-*), else the defaults here.
const API = "/__feedback/";
const MAX_SHOT = 300_000;
const Z = "2147483000";
const REVIEW_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const T = {
  accent: "var(--pf-accent, #222)", onAccent: "var(--pf-on-accent, #fff)", bg: "var(--pf-bg, #fff)",
  ink: "var(--pf-ink, #222)", line: "var(--pf-line, #999)", muted: "var(--pf-muted, #555)",
  font: "var(--pf-font, system-ui, sans-serif)", radius: "var(--pf-radius, 8px)",
};

// Who left a pin. One left through a review link carries a name its holder typed, and says so (site-kit#67).
export const byline = (pin) => (pin.review ? `${pin.author} (review link)` : String(pin.author));

const el = (tag, style = {}, text = "") => {
  const n = document.createElement(tag);
  Object.assign(n.style, style);
  if (text) n.textContent = text;
  return n;
};

// A selector that finds this element again: its id when unique, else tag:nth-of-type steps up to an ancestor with a
// unique id (or the body). Kept short enough to read in a PR comment.
export function selectorFor(node) {
  const steps = [];
  for (let n = node; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
    if (n.id && document.querySelectorAll(`#${CSS.escape(n.id)}`).length === 1) {
      steps.unshift(`#${CSS.escape(n.id)}`);
      return steps.join(" > ");
    }
    let i = 1;
    for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) i += 1;
    steps.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${i})`);
  }
  steps.unshift("body");
  return steps.join(" > ").slice(0, 500);
}

// The review token in a URL and the URL without it, or null when it has none (or a malformed one, which is dropped).
export function takeReviewToken(href) {
  const url = new URL(href);
  if (!url.searchParams.has("review")) return null;
  const token = url.searchParams.get("review");
  url.searchParams.delete("review");
  return { token: REVIEW_TOKEN.test(token || "") ? token : null, clean: url.pathname + url.search + url.hash };
}

const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* private mode: this page only */ } },
  drop(k) { try { sessionStorage.removeItem(k); } catch { /* nothing kept */ } },
};
let review = null;   // the review token, from this tab's sessionStorage
let reviewer = "";   // the name the review-link holder typed

function endReview(text) {
  review = null;
  store.drop("pf-review");
  document.cookie = "pf_review=; path=/; max-age=0; SameSite=Lax; Secure";
  commenting = false;
  document.documentElement.style.cursor = "";
  ui.button.hidden = true;
  status(text);
}

const ui = {};
let commenting = false;
let session = null;   // { token, expires }, from the agent's sign-in popup; never stored
let previewing = false;   // site-agent#259 part 2: this live visit opened Feedback with ?preview=true
// The client's settings are baked into this file by the edge, which serves it (site-kit#180): it fills the slot below from
// the site's bindings (site, agent, frame) and the scope its host gives, whatever query string the request carried. So
// every copy a page loads, by any tag or import(), names the same agent, and it doesn't matter which copy runs first.
// Nothing is read from this file's URL or from the page. Served raw, without the edge, the slot is null and the client
// does nothing (site-kit#155, #156: a URL, a DOM attribute or a tag's position is the page's to change).
export const AGENT_ORIGIN = /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const BAKED = /*pf-config*/null/*pf-config*/;
export function clientConfig(baked) {
  const c = baked && typeof baked === "object" ? baked : {};
  const live = c.scope === "live";
  const agent = typeof c.agent === "string" ? c.agent : "";
  return {
    site: typeof c.site === "string" ? c.site : "",
    live,
    // The site agent's origin: every postMessage and every message the client accepts is checked against it. Without a
    // well-formed one the client does nothing.
    agent: AGENT_ORIGIN.test(agent) ? agent : "",
    // site-agent#164: the studio's origins, which may greet this page (the edge defaults them to the agent).
    studio: Array.isArray(c.studio) ? c.studio.filter((o) => typeof o === "string" && AGENT_ORIGIN.test(o)) : [],
    // site-agent#67: the note is written and sent in the site agent's own frame, which signs in and posts by itself. This
    // page only tells it what was clicked; it never holds a session, so a script on the branch cannot post as the reviewer.
    framed: c.frame === true && !live,
  };
}
const CONFIG = clientConfig(BAKED);
const SITE = CONFIG.site;
const LIVE = CONFIG.live;
const AGENT = CONFIG.agent;
const STUDIOS = CONFIG.studio;
const FRAMED = CONFIG.framed;
let frame = null;   // the open compose frame: { card, win, el }
let lister = null;  // a hidden frame that lists this page's pins (pf-list): { el, win }

const signedIn = () => Boolean(session && (!session.expires || Date.parse(session.expires) > Date.now()));

// The agent's popup posts { type, site, token, expires } to this page's origin. Only that origin, for this site, is
// taken; anything else is ignored.
export function acceptSession(event, site = SITE, agent = AGENT) {
  const d = event && event.data;
  if (!agent || event.origin !== agent || !d || d.type !== "site-agent-comment-session" || d.site !== site) return null;
  if (typeof d.token !== "string" || !d.token) return null;
  return { token: d.token, expires: typeof d.expires === "string" ? d.expires : null };
}

// site-agent#164, #259: this page in the site agent's editing studio. The studio greets its frame with { type: "pf-studio",
// site }; only a message from one of the studio's origins (STUDIOS), for this site, sent by the window this page is framed
// in, is taken, and the note goes back to that window at that origin. Feedback works as on any preview: a click opens the
// same card, and its note goes to the studio's chat with what was clicked (frameContext), ready to send there, where the
// person is signed in. This page never holds a session, and the studio treats what it sends as data: it is the branch's
// own code.
let studio = null;
export function acceptStudio(event, site = SITE, studios = STUDIOS, parent = typeof window === "undefined" ? null : window.parent) {
  const d = event?.data;
  if (!site || !studios.includes(event?.origin) || !d || d.type !== "pf-studio" || d.site !== site) return null;
  if (!parent || event.source !== parent || (typeof window !== "undefined" && parent === window)) return null;   // framed, and by that window
  // 0.9.0 (site-agent#164): a greeting may name text the studio just added, for this page to show (showChange)
  const show = typeof d.show === "string" ? d.show.replace(/\s+/g, " ").trim() : "";
  return { win: event.source, origin: event.origin, show: show.length >= 2 && show.length <= TEXT_CAP ? show : null };
}

// 0.9.0 (site-agent#164): which of the page's blocks holds the text a change added: the first whose words, with spaces
// collapsed, contain it. -1 when none does.
export function holding(texts, text) {
  const want = String(text).replace(/\s+/g, " ").trim();
  if (!want) return -1;
  return texts.findIndex((t) => String(t ?? "").replace(/\s+/g, " ").includes(want));
}

// The block that holds it, scrolled to the middle and outlined in the site's accent for a few seconds. It only reads and
// scrolls: a greeting can't make the page do anything else.
const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, td, th, dd, dt, figcaption, blockquote";
// One highlight at a time: a second call first puts the last block's own outline back and cancels its timer, so what it
// saves is always the page's own, never a highlight (game-review on site-kit#196: two calls within four seconds left it on).
let lit = null;   // { at, was, timer }
function unlight() {
  if (!lit) return;
  clearTimeout(lit.timer);
  [lit.at.style.outline, lit.at.style.outlineOffset] = lit.was;
  lit = null;
}
export function showChange(text) {
  const blocks = [...document.querySelectorAll(BLOCKS)];
  const at = blocks[holding(blocks.map((b) => b.textContent), text)];
  if (!at) return;
  unlight();
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  at.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
  lit = { at, was: [at.style.outline, at.style.outlineOffset], timer: setTimeout(unlight, 4000) };
  at.style.outline = `3px solid ${T.accent}`;
  at.style.outlineOffset = "4px";
}

function status(text) {
  ui.status.textContent = text;
  ui.status.hidden = !text;   // an empty pill is a stray blob beside the button
}

// The client's one network call, to this site's own routes; a site's guard may allow exactly this line (S'mores' does).
const send = (path, init) => fetch(API + path, { credentials: "same-origin", ...init });

async function api(path, init = {}) {
  const auth = review
    ? { Authorization: `Review ${review}`, "X-Review-Name": encodeURIComponent(reviewer) }
    : signedIn() ? { Authorization: `Bearer ${session.token}` } : {};
  const headers = { ...(init.headers || {}), ...auth };
  const res = await send(path, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (res.status === 410) {
    endReview("This review link has ended. Ask for a new one.");
    throw new Error("this review link has ended");
  }
  if (res.status === 401 && !review) signedOut();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

// The sign-in opens in a popup that hands the session back. A blocked popup opens it in this tab instead (site-agent#302),
// with `return` (this page) and `nonce`: the agent then mints no session, only a one-time code, and sends the person back
// here with it, which takeCode picks up. The code is swapped only with the nonce this tab keeps, so a code from someone
// else's sign-in signs nobody in.
export function signInUrl(agent, site, href, nonce = "") {
  const u = new URL(href);
  const back = nonce ? `&return=${encodeURIComponent(u.pathname + u.search)}&nonce=${encodeURIComponent(nonce)}` : "";
  return `${agent}/comment-sign-in?site=${encodeURIComponent(site)}&origin=${encodeURIComponent(u.origin)}${back}`;
}
// It is kept in this tab's sessionStorage, which the same-tab sign-in comes back to; with no storage the popup still works.
export function newNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// The kept nonce, once: it is removed as it is read.
function takeNonce() {
  const nonce = store.get("pf-nonce") || "";
  store.drop("pf-nonce");
  return nonce;
}
function signIn() {
  if (window.open(signInUrl(AGENT, SITE, location.href), "preview-feedback-sign-in", "width=480,height=640")) return status("Finish signing in in the window that just opened.");
  const nonce = newNonce();
  store.set("pf-nonce", nonce);
  location.assign(signInUrl(AGENT, SITE, location.href, nonce));
}

// site-agent#302: the agent's way back puts a one-time code in the fragment, "#pf-code=<code>". It is taken once: the
// address is cleaned of it before anything else runs, and only then swapped. { code, clean } or null.
export function takeCode(href) {
  const u = new URL(href);
  const m = /^#pf-code=([A-Za-z0-9_-]{16,200})$/.exec(u.hash);
  if (!m) return null;
  u.hash = "";
  return { code: m[1], clean: u.href };   // the whole URL, as exitPreview: a path like //x stays on this origin
}
// The page's own edge swaps the code for a session (POST /__feedback/code); the session stays in this page's memory only.
export async function swapCode(code, nonce, post = (body) => send("code", { method: "POST", headers: { "Content-Type": "application/json" }, body })) {
  try {
    if (!nonce) return null;
    const res = await post(JSON.stringify({ code, nonce }));
    const d = res.ok ? await res.json() : null;
    return d && typeof d.token === "string" && d.token ? { token: d.token, expires: typeof d.expires === "string" ? d.expires : null } : null;
  } catch {
    return null;
  }
}

function signedOut() {
  session = null;
  commenting = false;
  document.documentElement.style.cursor = "";
  ui.button.textContent = "Sign in to comment";
  ui.button.setAttribute("aria-pressed", "false");
}

// site-agent#119: redrawing the pins removes only the pin markers. The open card lives in the same layer, and a pin list
// that comes back after a click opened one (the frame lists them on its own clock) used to wipe the card away.
const clearMarkers = () => ui.layer.querySelectorAll("button[data-pin]").forEach((b) => b.remove());

async function loadPins() {
  clearMarkers();
  try {
    const { pins } = await api(`pins?path=${encodeURIComponent(location.pathname)}`);
    ui.pins = pins;
    pins.forEach((p, i) => marker(i + 1, p));
    status("");
  } catch (e) {
    ui.pins = [];
    status(`Feedback is off here: ${e.message}`);
  }
}

// The element a stored pin points at. A selector the browser rejects is logged and the pin skipped, so one bad pin
// cannot stop the others drawing (site-kit#29). { ok: false } for a rejected selector; target null when nothing matches.
export function pinTarget(selector, doc = document) {
  try {
    return { ok: true, target: doc.querySelector(selector) };
  } catch (e) {
    console.warn("preview-feedback: skipped a pin with a selector the browser rejects", selector, e);
    return { ok: false, target: null };
  }
}

function marker(n, pin) {
  const { ok, target } = pinTarget(pin.selector);
  if (!ok) return;
  const box = target ? target.getBoundingClientRect() : null;
  const m = el("button", {
    position: "absolute", left: `${(box ? box.left + scrollX : 8) + pin.x - 12}px`, top: `${(box ? box.top + scrollY : 8) + pin.y - 12}px`,
    width: "24px", height: "24px", borderRadius: "50%", background: T.accent, color: T.onAccent, border: "2px solid #fff",
    fontFamily: T.font, fontSize: "12px", fontWeight: "700", cursor: "pointer", zIndex: Z, boxShadow: "0 1px 4px rgba(0,0,0,.4)",
  }, String(n));
  m.type = "button";
  m.dataset.pin = String(pin.id || "");
  m.title = `${byline(pin)}: ${pin.note}`;
  m.setAttribute("aria-label", `Feedback ${n} from ${byline(pin)}`);
  m.addEventListener("click", (e) => {
    e.stopPropagation();
    showPin(n, pin, m);
  });
  ui.layer.appendChild(m);
}

function card(left, top) {
  ui.card?.remove();
  const c = el("div", {
    position: "absolute", left: `${Math.max(8, Math.min(left, scrollX + innerWidth - 300))}px`, top: `${top}px`, width: "280px",
    background: T.bg, color: T.ink, border: `1px solid ${T.line}`, borderRadius: T.radius, padding: "12px", zIndex: Z,
    fontFamily: T.font, fontSize: "14px", lineHeight: "1.4", boxShadow: "0 8px 28px rgba(0,0,0,.18)", boxSizing: "border-box",
  });
  c.className = "pf-card";
  ui.status.hidden = true;   // superintelligentfoo#619's second read: "Click anywhere…" is the wrong instruction once a card is open
  c.addEventListener("click", (e) => e.stopPropagation());
  // site-agent#117 (Seth: "theres no way to close these if you want to do something else"): every card has an ×.
  const x = el("button", {
    display: "block", marginLeft: "auto", marginTop: "-6px", marginRight: "-6px", width: "36px", height: "36px", padding: "0",
    border: "0", borderRadius: "50%", background: "transparent", color: T.ink, fontFamily: T.font, fontSize: "22px", lineHeight: "1", cursor: "pointer",
  }, "\u00d7");
  x.type = "button";
  x.title = "Close";
  x.setAttribute("aria-label", "Close");
  x.addEventListener("click", closeCard);
  c.appendChild(x);
  ui.layer.appendChild(c);
  ui.card = c;
  return c;
}

// A button in the site's colours: the main action filled with the accent, the other outlined.
function button(text, primary) {
  const b = el("button", {
    fontFamily: T.font, fontSize: "14px", fontWeight: "600", padding: "10px 18px", minHeight: "44px", cursor: "pointer",
    borderRadius: "999px", border: `1px solid ${primary ? T.accent : T.line}`,
    background: primary ? T.accent : "transparent", color: primary ? T.onAccent : T.ink,
  }, text);
  b.type = "button";
  return b;
}

const actions = (...buttons) => {
  const row = el("div", { display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" });
  row.append(...buttons);
  return row;
};

function showPin(n, pin, m) {
  const c = card(parseFloat(m.style.left), parseFloat(m.style.top) + 28);
  c.appendChild(el("strong", {}, `${n}. ${byline(pin)}`));
  c.appendChild(el("p", { margin: "6px 0", whiteSpace: "pre-wrap" }, pin.note));
  if (pin.comment_url) {
    const a = el("a", {}, "On the pull request");
    a.href = pin.comment_url;
    a.target = "_blank";
    a.rel = "noopener";
    c.appendChild(a);
  }
  if (review) return;   // a review link leaves notes; resolving is the team's
  if (FRAMED) {
    // Resolving is asked and clicked inside the agent's frame (pf-resolve), which holds the session.
    const done = button("Mark resolved", false);
    done.addEventListener("click", () => openFrame(c, (win) => win.postMessage({ type: "pf-resolve", id: pin.id }, AGENT)));
    c.appendChild(actions(done));
    return;
  }
  const done = button("Mark resolved", false);
  done.addEventListener("click", async () => {
    try {
      await api(`pins/${pin.id}/resolve`, { method: "POST" });
      c.remove();
      m.remove();
      status("Resolved.");
    } catch (e) {
      status(`Couldn't resolve: ${e.message}`);
    }
  });
  c.appendChild(actions(done));
}

async function picture(target) {
  try {
    const { domToPng } = await import("./modern-screenshot.mjs");
    const url = await domToPng(target, { scale: 1, backgroundColor: "#ffffff" });
    return url.length * 0.75 <= MAX_SHOT ? url : null;   // base64 is 4 characters per 3 bytes
  } catch {
    return null;
  }
}

// Cards sit above the bar (bottom 12px, 44px tall) so a phone's short window never stacks them.
const BAR_CLEAR = 68;
// site-kit#296: the room kept at the page's end for the bar is a spacer in the colour of the page's last section (the
// third Trenz read: as body padding it showed as a black strip under a white footer); a transparent one adds no colour.
export const footColour = (bg) => (!bg || bg === "transparent" || /^rgba\(.*,\s*0\)$/.test(bg) ? "" : bg);
function lastSection() {
  return [...document.body.children].reverse().find((e) => !/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|LINK)$/.test(e.tagName)
    && !["fixed", "absolute"].includes(getComputedStyle(e).position) && getComputedStyle(e).display !== "none");
}

// The card a click opens: "What should change here?", a note and one action, `label`. `send` gets the note and the card,
// and answers false to keep the card open with its action ready again.
function noteCard(pageX, pageY, label, send) {
  const c = card(pageX + 8, Math.min(pageY + 8, scrollY + innerHeight - BAR_CLEAR - 220));
  c.appendChild(el("strong", {}, "What should change here?"));
  const box = el("textarea", {
    display: "block", width: "100%", minHeight: "80px", margin: "6px 0", font: "inherit", color: T.ink, background: T.bg,
    border: `1px solid ${T.line}`, borderRadius: T.radius, padding: "6px 8px", boxSizing: "border-box",
  });
  box.maxLength = 2000;
  c.appendChild(box);
  const go = button(label, true);
  const cancel = button("Cancel", false);
  cancel.addEventListener("click", closeCard);
  go.addEventListener("click", async () => {
    const note = box.value.trim();
    if (!note) return box.focus();
    go.disabled = true;
    if ((await send(note, c)) === false) go.disabled = false;
  });
  c.appendChild(actions(go, cancel));
  box.focus();
}

// The Save step on its own, so a test runs it: the spot (frameContext: path, selector, the element's words, x, y, viewport)
// and the note go up as a pin. A saved note closes its card and ends comment mode, so the next click follows the link
// (site-kit#689); a refused one keeps the card, words and all, and comment mode, so nothing typed is lost. io holds the
// page's own api, closeCard, mark and status, so the test passes stand-ins (the same pattern as exitPreview).
// The job a live note became, as the edge returns it (site-kit#701): shown only when it is a plain short id.
export const JOB_ID = /^[A-Za-z0-9_-]{1,40}$/;
export function sentText(out) {
  if (!out.posted) return `Not sent: ${out.why}.`;
  return typeof out.job === "string" && JOB_ID.test(out.job) ? `Sent to the team as job ${out.job}. Thank you.` : "Sent to the team. Thank you.";
}
export async function savePin(note, spot, shot, live, io) {
  try {
    const out = await io.api("pins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...spot, note, shot }),
    });
    io.closeCard();
    io.mark(out.pin);
    if (live) io.status(sentText(out));
    else io.status(out.posted ? "Saved and posted on the pull request." : `Saved here, not posted: ${out.why}.`);
    return true;
  } catch (e) {
    io.status(`Not saved: ${e.message}`);
    return false;
  }
}

// On a preview, or live: the note is saved as a pin, with a picture of the spot.
function ask(target, x, y, pageX, pageY) {
  noteCard(pageX, pageY, "Save", async (note) => {
    status("Saving...");
    const shot = await picture(target);
    return savePin(note, frameContext(target, x, y), shot, LIVE, {
      api, closeCard, status, mark: (pin) => { ui.pins.push(pin); marker(ui.pins.length, pin); },
    });
  });
}

// site-agent#259 (0.12.0): in the studio, this page only says where the person pointed: the element (its selector and
// words) and its box in the frame's viewport. The studio draws the conversation card itself, over the frame at that box,
// where the person types and sends and the answer is shown. Nothing is typed here, and nothing comes back: this page is
// the branch's own code, which the studio never lets drive a turn or read one (the lead's CHANGE on site-agent#269).
export function studioPoint(target, x, y, path = location.pathname, vw = innerWidth, vh = innerHeight) {
  const r = target?.getBoundingClientRect?.() ?? { left: x, top: y, width: 0, height: 0 };
  const box = { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  return { type: "pf-studio-point", site: SITE, ...frameContext(target, x, y, path, vw, vh), box };
}
// The note goes to the window that greeted this page, at that greeting's origin, never "*": only that studio may read it.
export function postNote(s, msg) {
  s.win.postMessage(msg, s.origin);
}
function askStudio(target, x, y) {
  postNote(studio, studioPoint(target, x, y));
  status("Say what to change in the card beside it.");
}

// The context the frame needs, and nothing else: the frame shows it, and the reviewer types the note there. text is the
// clicked element's words as shown (innerText, so hidden text and <script>/<style> contents stay out; an SVG element has no
// innerText, so its textContent), trimmed and capped (site-kit#25: what "Make this change" asks the agent to change); it
// comes from this page, which is the branch's own code, so the agent treats it as data.
export const TEXT_CAP = 300;
// #619, foo's read: a tap on a box of buttons read "See a day with it Read the questions". When the element has no words
// of its own, its children's texts are joined with " · ", so each one reads as its own.
const words = (n) => String(n?.innerText ?? n?.textContent ?? "").replace(/\s+/g, " ").trim();
// The children's words when the element has none of its own and more than one child has some, else null.
function joinedParts(target) {
  const own = [...(target?.childNodes ?? [])].some((n) => n.nodeType === 3 && n.textContent.trim());
  const parts = [...(target?.children ?? [])].map(words).filter(Boolean);
  return !own && parts.length > 1 ? parts : null;
}
export function labelFor(target) {
  return joinedParts(target)?.join(" · ") ?? words(target);
}

// site-kit#296, the fourth Trenz read: a tap on the footer headed the card with all of its links run together. A label
// joined from several children and longer than LABEL_CAP names the landmark it sits in ("the footer"), else the box's
// first heading. An element with words of its own (a link, a button, an address line in the footer) keeps them, up to
// TEXT_CAP, since "Make this change" asks the agent to change those words (site-kit#25; dev-2's read on #300).
export const LABEL_CAP = 60;
const LANDMARKS = [["footer, [role=contentinfo]", "the footer"], ["header, [role=banner]", "the header"],
  ["nav, [role=navigation]", "the menu"], ["aside, [role=complementary]", "the sidebar"]];
export function shortLabel(target) {
  const full = labelFor(target);
  if (full.length <= LABEL_CAP || !joinedParts(target)) return full;
  for (const [sel, name] of LANDMARKS) if (target?.closest?.(sel)) return name;
  const heading = words(target?.querySelector?.("h1, h2, h3, h4, h5, h6"));
  return heading && heading.length <= LABEL_CAP ? heading : full;
}

export function frameContext(target, x, y, path = location.pathname, vw = innerWidth, vh = innerHeight) {
  const text = shortLabel(target).slice(0, TEXT_CAP);
  return { path, selector: selectorFor(target), text, x, y, vw, vh };
}

function closeFrame() {
  clearTimeout(frame?.wait);
  frame?.card.remove();
  frame = null;
}

// site-agent#117: × , Esc, Cancel and a click away all close the open card and end comment mode, so the page is usable
// again at once; Feedback turns commenting back on.
function closeCard() {
  closeFrame();
  ui.card?.remove();
  ui.card = null;
  if (commenting) toggle();
  unlift();
}

// What a key or a click does while a card is open. Esc, and a click outside the card (and off the bar), close an empty
// card and keep one with words typed in it, so neither loses a note (site-agent#119); the × and Cancel always close.
// The agent's frame alone knows whether its note is empty, so it is asked ("away") and closes itself if so.
export function closeOn(e, { open, framed, typed, inCard, inBar }) {
  if (!open) return null;
  if (e.type === "keydown" ? e.key !== "Escape" : e.type !== "click" || inCard || inBar) return null;
  return framed ? "away" : typed ? "keep" : "close";
}

// The frame's own height (pf-size), so its first line never scrolls out of a fixed box: at least 120px, and at most the
// window less the bar, beyond which the frame scrolls inside.
export function frameHeight(h, vh = innerHeight) {
  const n = Number(h);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.max(120, Math.min(n, vh - BAR_CLEAR - 40)));
}

// site-kit#296 (the Trenz design read: the card was a blank box): how long a card waits for the agent's frame to answer,
// and whether a CSP report is this page refusing that frame (no frame-src for the agent, so default-src applies).
export const FRAME_WAIT_MS = 8000;
export function frameBlocked(e, agent = AGENT) {
  if (!e || !agent) return false;
  const uri = String(e.blockedURI || "");
  return /^(frame-src|child-src|default-src)\b/.test(String(e.effectiveDirective || e.violatedDirective || ""))
    && (uri === agent || uri.startsWith(`${agent}/`));
}
// The words a card shows in place of a frame that can't open (blocked) or never answered: never a blank box.
export function frameTrouble(kind) {
  return kind === "blocked"
    ? "Comments can't open on this preview: the page's security settings block the comment frame. Ask the site's developer to allow the site agent in frame-src."
    : "The comment frame didn't answer. Close this and try again in a moment.";
}
function frameFailed(kind) {
  if (!frame || frame.alive || frame.failed) return;
  frame.failed = kind;
  clearTimeout(frame.wait);
  const say = el("p", { margin: "8px 36px 8px 8px", color: T.ink, fontFamily: T.font, fontSize: "15px", lineHeight: "1.45" }, frameTrouble(kind));
  say.setAttribute("role", "alert");
  frame.waitLine?.remove();
  frame.el.replaceWith(say);
  keepInView();   // the sheet is shorter now
}

// #619: the frame writes in the page's font, ink and --pf-* colours. site-kit#296 (mkt-dev's re-read): the hidden list
// frame is greeted the same way, so no frame of ours is left unthemed.
function hello() {
  const s = getComputedStyle(document.body);
  return { type: "pf-hello", font: s.fontFamily.slice(0, 200), ink: s.color, ...pfColours(s) };
}

// The agent's frame in card c; once it loads, it is greeted and then() tells it what to do.
function openFrame(c, then) {
  if (frame && frame.card !== c) closeFrame();
  // The third Trenz read: until the frame first answers, the card says so instead of showing an empty box; it stays
  // hidden (no height) until then, and "didn't answer" replaces the line after FRAME_WAIT_MS.
  const f = el("iframe", { display: "block", width: "100%", height: "0", border: "0" });
  f.src = `${AGENT}/comment-frame?site=${encodeURIComponent(SITE)}`;
  f.title = "Comment, sent by the site agent";
  const wait = el("p", { margin: "8px 36px 8px 8px", color: T.ink, fontFamily: T.font, fontSize: "15px", lineHeight: "1.45" }, "Loading comments…");
  wait.setAttribute("role", "status");
  c.append(wait, f);
  frame = { card: c, win: null, el: f, waitLine: wait };
  frame.wait = setTimeout(() => { if (frame?.el === f) frameFailed("silent"); }, FRAME_WAIT_MS);
  f.addEventListener("load", () => {
    if (!frame || frame.card !== c) return;
    frame.win = f.contentWindow;
    frame.win.postMessage(hello(), AGENT);
    then(frame.win);
  });
}

// site-kit#265 (the frame's design read on fartranker, superintelligentfoo#619: the card covered what was clicked):
// where the frame's card goes for an element whose viewport box is r. Wider than PHONE: beside it, on the side with room,
// else below or above it. A phone gets a bottom sheet ({sheet: true}), and the page scrolls the element above it.
export const PHONE = 600;
export const HINT_MS = 4000;   // how long the comment-mode hint stays up on a phone
// Every spot that fits beside the element, in order: right, left, below, above (the last always, as a fallback).
// #619, foo's first read: the frame wears the site's own --pf-* colours, as the card does (the frame takes hex only).
// Only the ones the site sets, as computed (a var() is resolved), capped.
export function pfColours(style) {
  const out = {};
  for (const [k, prop] of [["accent", "--pf-accent"], ["onAccent", "--pf-on-accent"], ["line", "--pf-line"], ["bg", "--pf-bg"]]) {
    const v = String(style.getPropertyValue(prop) || "").trim();
    if (v) out[k] = v.slice(0, 40);
  }
  return out;
}

export function cardCandidates(r, { vw = innerWidth, vh = innerHeight, sx = scrollX, sy = scrollY, w = 280, h = 340, gap = 8 } = {}) {
  if (vw < PHONE) return [{ sheet: true }];
  const top = sy + Math.max(gap, Math.min(r.top, vh - BAR_CLEAR - h));
  const out = [];
  if (r.right + gap + w <= vw - 20) out.push({ left: sx + r.right + gap, top });   // card() keeps 300px from the right edge
  if (r.left - gap - w >= gap) out.push({ left: sx + r.left - gap - w, top });
  const left = sx + Math.max(gap, Math.min(r.left, vw - 20 - w));
  if (r.bottom + gap + h <= vh - BAR_CLEAR) out.push({ left, top: sy + r.bottom + gap });
  out.push({ left, top: sy + Math.max(gap, r.top - gap - h) });
  return out;
}
export const cardSpot = (r, view) => cardCandidates(r, view)[0];

// site-kit#296 (the Trenz design read: on a phone the sheet covered what sat under the clicked element): how far to
// scroll so the element sits in the middle of the window above the sheet, with room around it; one taller than that
// room starts at its top. Small moves are skipped, so the page does not twitch.
export function sheetScroll(r, sheetTop, gap = 16) {
  const room = sheetTop - 2 * gap;
  const want = r.height >= room ? gap : gap + (room - r.height) / 2;
  const by = Math.round(r.top - want);
  return Math.abs(by) < 8 ? 0 : by;
}
// site-kit#296 (mkt-dev's re-read: at 1280 a footer link's card covered the address and the Call button above it): how
// far to scroll the page up so a card h tall fits beside an element whose viewport box is r, top to top, above the bar.
// 0 when it already fits, or when the window is too short for any card to.
export function liftFor(r, { vh = innerHeight, h = 340, gap = 8 } = {}) {
  const room = vh - BAR_CLEAR - h;
  return room < gap || r.top <= room ? 0 : Math.round(r.top - room);
}
// The page's foot can't scroll up, so it gets the room it lacks for as long as the card is open.
let liftPad = 0;
const padBy = (n) => { ui.foot.style.height = `${(parseFloat(ui.foot.style.height) || 0) + n}px`; };
function liftPage(by) {
  const short = Math.ceil(scrollY + by - (document.documentElement.scrollHeight - innerHeight));
  if (short > 0) { padBy(short); liftPad += short; }
  scrollBy({ top: by, behavior: "instant" });
}
function unlift() {
  if (liftPad) padBy(-liftPad);
  liftPad = 0;
}
function keepInView() {
  if (!frame?.sheetFor) return;
  const by = sheetScroll(frame.sheetFor.getBoundingClientRect(), frame.card.getBoundingClientRect().top);
  if (by) liftPage(by);   // the third Trenz read: a footer link at the page's end gets the room it lacks, as on a wide screen
}

// #619's fourth read: beside "Continue Reading" the first spot sat on the headline. Of the spots that fit, the card takes
// the one whose box covers the least text (cover(spot) -> a count); the first of the least wins, so the order still decides.
export function pickSpot(spots, cover) {
  let best = spots[0], least = Infinity;
  for (const s of spots) {
    if (s.sheet) return s;
    const n = cover(s);
    if (n < least) { least = n; best = s; }
  }
  return best;
}

// How much of the page's text a card at page spot s would cover: of a 5x5 grid of points in its box, how many land on an
// element with words of its own (an image, a blank box or our own UI count as nothing).
function textCover(s, w = 280, h = 340) {
  let n = 0;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const e = document.elementFromPoint(s.left - scrollX + (w * (i + 0.5)) / 5, s.top - scrollY + (h * (j + 0.5)) / 5);
    if (e && !ui.layer.contains(e) && !ui.bar.contains(e) && [...e.childNodes].some((c) => c.nodeType === 3 && /\S/.test(c.textContent))) n++;
  }
  return n;
}

function askInFrame(target, x, y, pageX, pageY) {
  closeFrame();
  let r = target.getBoundingClientRect();
  let spot = pickSpot(cardCandidates(r), (s) => textCover(s));
  const by = spot.sheet ? 0 : liftFor(r);
  if (by && textCover(spot)) {   // every spot covers words: lift the element so the card sits beside it
    liftPage(by);
    r = target.getBoundingClientRect();
    spot = pickSpot(cardCandidates(r), (s) => textCover(s));
  }
  const c = card(spot.left ?? 0, spot.top ?? 0);
  c.style.padding = "6px";   // the frame draws no box of its own (site-agent#190), so the card is the only one
  // #619's third read: the × sat in a band of its own above the frame's first line; it sits in the card's corner instead,
  // and the frame's first line leaves room for it (site-agent).
  Object.assign(c.firstChild.style, { position: "absolute", top: "4px", right: "4px", margin: "0", width: "32px", height: "32px", zIndex: "1" });
  if (spot.sheet) {
    Object.assign(c.style, { position: "fixed", left: "8px", right: "8px", width: "auto", top: "auto", bottom: `${BAR_CLEAR}px` });
  }
  openFrame(c, (win) => win.postMessage({ type: "pf-compose", context: frameContext(target, x, y) }, AGENT));
  if (spot.sheet) {
    frame.sheetFor = target;
    keepInView();
  }
}

// What the frame says back, only from the open frame and the agent's origin. A posted pin is drawn from the frame's reply.
export function frameMessage(event, win = frame?.win, agent = AGENT) {
  if (!win || !agent || event.source !== win || event.origin !== agent) return null;
  const d = event.data;
  return d && typeof d.type === "string" ? d : null;
}

// The page's pins, from the agent's frame: it signs the list request with its own session, so this page never holds one.
function listInFrame() {
  if (lister) {
    lister.win?.postMessage({ type: "pf-list", path: location.pathname }, AGENT);
    return;
  }
  const f = el("iframe", { display: "none" });
  f.src = `${AGENT}/comment-frame?site=${encodeURIComponent(SITE)}`;
  f.title = "Earlier notes, listed by the site agent";
  f.setAttribute("aria-hidden", "true");
  f.tabIndex = -1;
  lister = { el: f, win: null };
  f.addEventListener("load", () => {
    lister.win = f.contentWindow;
    lister.win.postMessage(hello(), AGENT);
    lister.win.postMessage({ type: "pf-list", path: location.pathname }, AGENT);
  });
  document.body.appendChild(f);
}

// The pins the frame listed, for this page only, drawn as the session path draws them.
export function framePins(d, path = location.pathname) {
  if (!d || d.type !== "pf-pins" || d.path !== path || !Array.isArray(d.pins)) return null;
  return d.pins.filter((p) => p && typeof p === "object" && typeof p.selector === "string");
}

function onFrame(event) {
  const listed = framePins(frameMessage(event, lister?.win));
  if (listed) {
    clearMarkers();
    ui.pins = listed;
    listed.forEach((p, i) => marker(i + 1, p));
    return;
  }
  const d = frameMessage(event);
  if (!d) return;
  if (frame.failed) return;   // its card already says it couldn't open
  frame.alive = true;   // it has answered, so Esc and a click away can be left to it ("away")
  clearTimeout(frame.wait);
  if (frame.waitLine) {   // its first word: the frame takes the loading line's place
    frame.waitLine.remove();
    frame.waitLine = null;
    frame.el.style.height = "300px";
  }
  if (d.type === "pf-cancelled") closeCard();
  if (d.type === "pf-size") {
    const h = frameHeight(d.h);
    if (h) frame.el.style.height = `${h}px`;
    keepInView();   // the sheet's top moved with its height
  }
  // site-kit#25: the frame asked the site agent to make the change; the job edits this preview's own branch.
  if (d.type === "pf-changed") {
    closeFrame();
    const job = typeof d.job === "string" ? d.job.slice(0, 40) : "";
    status(job ? `Change requested (job ${job}). The preview updates when it's done.` : "Change requested. The preview updates when it's done.");
  }
  if (d.type === "pf-resolved") {
    closeFrame();
    if (d.ok && typeof d.id === "string") {
      [...ui.layer.querySelectorAll("button")].filter((b) => b.dataset.pin === d.id).forEach((b) => b.remove());
      ui.pins = ui.pins.filter((p) => p.id !== d.id);
      status("Resolved.");
    }
  }
  if (d.type === "pf-posted") {
    closeFrame();
    if (d.pin && typeof d.pin === "object") {
      ui.pins.push(d.pin);
      marker(ui.pins.length, d.pin);
    }
    if (lister) listInFrame();   // now signed in, the list can hold everyone's pins
    status(d.pin ? "Posted on the pull request." : "Posted on the pull request; the pin was not saved here.");
  }
}

// A review-link holder types a name once; it stays in this tab.
function askName(then) {
  const c = card(scrollX + 12, scrollY + innerHeight - 220);
  c.style.position = "fixed";
  c.style.left = "12px";
  c.style.top = "auto";
  c.style.bottom = `${BAR_CLEAR}px`;
  c.appendChild(el("strong", {}, "Your name, so the team knows who left the note"));
  const input = el("input", {
    display: "block", width: "100%", margin: "6px 0", font: "inherit", color: T.ink, background: T.bg,
    border: `1px solid ${T.line}`, borderRadius: T.radius, padding: "6px 8px", boxSizing: "border-box",
  });
  input.maxLength = 80;
  input.autocomplete = "name";
  c.appendChild(input);
  const go = button("Start commenting", true);
  const done = () => {
    const name = input.value.trim();
    if (!/\p{L}/u.test(name)) return input.focus();   // a name with a letter in it, as the agent requires
    reviewer = name;
    store.set("pf-review-name", name);
    c.remove();
    then();
  };
  go.addEventListener("click", done);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") done(); });
  c.appendChild(actions(go));
  input.focus();
}

function toggle() {
  commenting = !commenting;
  ui.button.textContent = commenting ? "Done" : "Feedback";
  ui.button.setAttribute("aria-pressed", String(commenting));
  document.documentElement.style.cursor = commenting ? "crosshair" : "";
  const verb = matchMedia("(pointer: coarse)").matches ? "Tap" : "Click";   // #619 read 4: "Click" on a phone
  status(commenting ? `${verb} anywhere on the page to leave a note.` : "");
  // superintelligentfoo#619's third read: on a phone the hint sat over the page's call to action. It lets taps through
  // (pointer-events, in start()) and, on a phone, goes after a few seconds; the Done button still says comment mode is on.
  const hint = ui.status.textContent;
  if (commenting && innerWidth < PHONE) setTimeout(() => { if (commenting && ui.status.textContent === hint) ui.status.hidden = true; }, HINT_MS);
  if (commenting && FRAMED && !review) listInFrame();
}

// site-agent#259 part 2: ?preview=true on a live page turns Feedback on for this visit. The flag is no secret and grants
// nothing: the no-secret pf_preview=1 session cookie only tells the edge to load this client on the visit's later pages, and
// a note still needs the agent's sign-in. The session stays in memory, as on a preview: a later page signs in again with
// one click (the popup's "Continue as", from the agent's own day cookie).
export function previewFlag(href, cookie) {
  const asked = new URL(href).searchParams.get("preview");
  if (asked === "false") return false;   // ?preview=false turns it off (the edge clears the cookie)
  if (asked === "true") return true;
  return /(?:^|;\s*)pf_preview=1(?:;|$)/.test(cookie || "");
}
// The whole gate, as one tested decision (mi-dev-5 on site-kit#682): Feedback through the agent's sign-in only on the live
// site and only with the flag. A live page that got this client another way (a review visit's new tab, the Studio's frame)
// sets no cookie and shows no button. Answers { on, set }: whether Feedback is on, and the cookie to write, which only an
// actual ?preview=true writes. The cookie lasts two hours from that link (the lead's ruling after Seth saw it stay on for
// the whole browser session), so a later page of the visit reads it and never pushes its end back.
export const PREVIEW_COOKIE = "pf_preview=1; path=/; Max-Age=7200; SameSite=Lax; Secure";
export function previewState(live, href, cookie) {
  if (!live || !previewFlag(href, cookie)) return { on: false, set: null };
  return { on: true, set: new URL(href).searchParams.get("preview") === "true" ? PREVIEW_COOKIE : null };
}
// The button's "Exit feedback" (x): the visit's cookie is cleared and the page reloads without ?preview, so the edge loads
// no client. write and go are the page's (document.cookie and location.replace), so a test calls the same function.
// go gets the whole URL: a bare path that starts with two slashes would be read as another host.
export const PREVIEW_COOKIE_CLEAR = "pf_preview=; path=/; Max-Age=0; SameSite=Lax; Secure";
export function exitPreview(href, write = (c) => { document.cookie = c; }, go = (u) => location.replace(u)) {
  write(PREVIEW_COOKIE_CLEAR);
  const u = new URL(href);
  u.searchParams.delete("preview");
  go(u.href);
}
// The page's own call takes its inputs here, so a test calls the very function start() runs (mi-dev-5's second read on
// #682): it sets the visit's cookie and turns Feedback on only when previewState says so. Answers whether it did.
export function takePreview(live = LIVE, href = location.href, cookie = document.cookie, write = (c) => { document.cookie = c; }) {
  const { on, set } = previewState(live, href, cookie);
  if (!on) return false;
  previewing = true;
  if (set) write(set);
  return true;
}

function takeReview() {
  const found = takeReviewToken(location.href);
  if (found) {
    history.replaceState(history.state, "", found.clean);   // the token leaves the URL bar at once
    if (found.token) store.set("pf-review", found.token);
  }
  review = store.get("pf-review");
  reviewer = store.get("pf-review-name") || "";
  if (review) document.cookie = "pf_review=1; path=/; SameSite=Lax; Secure";
}

// Inline styles cannot reach :focus-visible, so one rule, scoped to the plugin's cards, gives fields and buttons a ring
// in the site's ink instead of the browser's blue. A stylesheet object, not a <style> tag, so a strict CSP allows it.
function focusRing() {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(".pf-card :focus-visible{outline:3px solid var(--pf-ink,#222);outline-offset:2px}");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  } catch {
    /* an old browser keeps its own ring */
  }
}

// The small "Exit feedback" control beside the button on a ?preview=true visit (site-agent#259).
function exitControl() {
  const x = el("button", { pointerEvents: "auto", width: "32px", height: "32px", minWidth: "32px", borderRadius: "16px", border: `1px solid ${T.line}`, background: T.bg, color: T.ink, fontFamily: T.font, fontSize: "18px", lineHeight: "1", cursor: "pointer" }, "\u00d7");
  x.type = "button";
  x.title = "Exit feedback";
  x.setAttribute("aria-label", "Exit feedback");
  x.addEventListener("click", (e) => { e.stopPropagation(); exitPreview(location.href); });
  return x;
}

// What the button starts as on a load: "Feedback" for a review link or the agent's frame; on the live site, the sign-in
// and the exit control only when this visit opened Feedback with ?preview=true, else hidden (nothing to comment with).
// A code return (site-agent#302) and the agent's messages change it after.
export function startState({ review = false, framed = false, live = false, previewing = false, signedIn = false } = {}) {
  if (review || framed) return { text: "Feedback", hidden: false, exit: false };
  if (live && previewing) return { text: signedIn ? "Feedback" : "Sign in to comment", hidden: false, exit: true };
  return { text: "Sign in to comment", hidden: live, exit: false };
}

async function start() {
  focusRing();
  takeReview();
  takePreview();
  ui.layer = el("div", { position: "absolute", left: "0", top: "0", width: "0", height: "0", zIndex: Z });
  // site-kit#265: bottom right, in the site's font, the button outermost, so a page's own bottom-left call to action stays clear.
  // --pf-bar-right moves it left of anything else fixed there, as S'mores does past Talk's campfire bubble.
  ui.bar = el("div", { position: "fixed", right: "var(--pf-bar-right, 12px)", bottom: "12px", zIndex: Z, display: "flex", flexDirection: "row-reverse", gap: "8px", alignItems: "center", fontFamily: T.font, fontSize: "14px", pointerEvents: "none" });   // #619 read 4: only the button catches taps
  ui.button = el("button", { pointerEvents: "auto", padding: "10px 14px", minHeight: "44px", borderRadius: "22px", border: "0", background: T.accent, color: T.onAccent, fontFamily: T.font, fontWeight: "600", cursor: "pointer" }, "Sign in to comment");
  ui.button.type = "button";
  ui.button.setAttribute("aria-pressed", "false");
  ui.status = el("span", { background: T.bg, color: T.ink, padding: "6px 12px", borderRadius: "999px", border: `1px solid ${T.line}`, boxShadow: "0 4px 14px rgba(0,0,0,.15)", fontFamily: T.font, maxWidth: "min(55vw, 280px)", pointerEvents: "none" });   // #619 read 4: a chip, not bare text
  ui.status.setAttribute("role", "status");
  ui.status.hidden = true;
  ui.bar.append(ui.button, ui.status);
  // site-kit#296 (the Trenz design read: the bar sat on the footer's last links): the page keeps room at its end for the
  // bar, so its last lines scroll clear of it. Previews only, like everything here.
  const last = lastSection();
  ui.foot = el("div", { height: `${BAR_CLEAR}px`, background: footColour(last && getComputedStyle(last).backgroundColor) });
  ui.foot.setAttribute("aria-hidden", "true");
  document.body.append(ui.foot, ui.layer, ui.bar);
  ui.button.addEventListener("click", (e) => {
    e.stopPropagation();
    if (review && !reviewer) askName(toggle);
    else if (review || signedIn() || FRAMED || studio) toggle();
    else signIn();
  });
  const first = startState({ review: Boolean(review), framed: FRAMED, live: LIVE, previewing, signedIn: signedIn() });
  ui.button.textContent = first.text;
  ui.button.hidden = first.hidden;
  if (first.exit) {
    ui.exit = exitControl();
    ui.bar.append(ui.exit);
  }
  if (review) loadPins();
  else if (FRAMED) window.addEventListener("message", onFrame);
  // site-agent#302: back from a sign-in that had no opener: clean the address, swap the code, and open Feedback.
  const back = !review && !FRAMED ? takeCode(location.href) : null;
  if (back) {
    history.replaceState(history.state, "", back.clean);
    swapCode(back.code, takeNonce()).then((s) => {
      if (!s) return status("That sign-in didn't finish. Click Feedback to sign in again.");
      session = s;
      ui.button.hidden = false;
      ui.button.textContent = "Feedback";
      loadPins();
      if (!commenting) toggle();
    });
  }
  window.addEventListener("message", (e) => {
    const w = acceptStudio(e);
    if (!w) return;
    studio = w;
    if (w.show) showChange(w.show);
    ui.button.hidden = false;
    if (!commenting) ui.button.textContent = "Feedback";
  });
  window.addEventListener("message", (e) => {
    const s = acceptSession(e);
    if (!s) return;
    session = s;
    ui.button.textContent = "Feedback";
    loadPins();
  });
  const closer = (e) => {
    const act = closeOn(e, {
      open: Boolean(ui.card?.isConnected), framed: Boolean(frame && frame.card === ui.card && frame.alive),   // a frame that never answered can't close itself
      typed: [...(ui.card?.querySelectorAll("textarea, input") ?? [])].some((i) => i.value.trim()),
      inCard: Boolean(ui.card?.contains(e.target)), inBar: ui.bar.contains(e.target),
    });
    if (!act) return false;
    if (e.type === "click") {
      e.preventDefault();
      e.stopPropagation();
    }
    if (act === "keep") status("Your note is kept. Save it, or Cancel to close.");
    else if (act === "away" && frame.win) frame.win.postMessage({ type: "pf-away" }, AGENT);
    else closeCard();
    return true;
  };
  document.addEventListener("keydown", closer);
  // site-kit#296: a page whose CSP refuses the agent's frame gets words in the card at once, not after the wait.
  document.addEventListener("securitypolicyviolation", (e) => { if (frameBlocked(e)) frameFailed("blocked"); });
  document.addEventListener("click", (e) => {
    if (closer(e)) return;
    if (!commenting || ui.bar.contains(e.target) || ui.layer.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    const box = e.target.getBoundingClientRect();
    const at = [e.target, e.clientX - box.left, e.clientY - box.top, e.pageX, e.pageY];
    if (studio && !review) askStudio(...at);
    else if (FRAMED && !review) askInFrame(...at);
    else ask(...at);
  }, true);
  ui.pins = [];
}

if (typeof document !== "undefined" && AGENT && !window.__previewFeedback) {
  window.__previewFeedback = true;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}
