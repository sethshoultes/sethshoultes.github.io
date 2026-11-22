"""Site templates: events (site-kit#532, eventbuildr#1). A site's events, kept in its own data file, become pages of the
record: a list, a page per event and a month calendar, in the site's own design, with a hand-off to a ticket host.

  .sitekit/events.json  the site's config: {"title", "notice", "demo_only", "ticket_hosts": [host], "waitlist_url",
                        "week_starts": "monday" | "sunday", "hero": {"image", "alt", "caption"}}; only "title" is required
  data/events.json      {"events": [...]}, each event: slug, title, summary, starts_at, ends_at, venue_timezone,
                        venue {name, address}, host, image, image_alt, tickets [{name, price}] or rsvp, status, ticket_url, demo

  /events/              upcoming events, soonest first, then past ones, latest first
  /events/<slug>/       one event: the hero, when and where in the venue's own time zone, the tickets and the button
  /events/<yyyy>/<mm>/  a month calendar for each month with an event, with links to the months before and after that have one
  /events/events.css    the events pages' own styles, linked only from them

The site never handles money or a person's details: a ticket or sign-up button goes to `ticket_url`, an https address on
one of the config's ticket hosts. Past is computed from the build's clock (layout.build_time, the date gate's), never
typed. With "demo_only" every event must say "demo": true, each shows a DEMO stamp and the site's notice, no Event
structured data is written, and the pages are "index": false: noindex, and out of the sitemap, llms.txt and the twins.
Times come from zoneinfo; a zone it can't load stops the build. Every field is plain text, escaped; a site with no
.sitekit/events.json builds as before. Standard library only.
"""
import datetime
import json
import pathlib
import re
import urllib.parse
import zoneinfo

import docs as doclib
import layout
import serialize

CONFIG = ".sitekit/events.json"
DATA = "data/events.json"
INDEX = "/events/"
CSS = "events/events.css"
MOST = 500
SPAN = 36   # months from the first event's month to the last's: a longer span is a mistyped year (maint-review-2 on #536)
SLUG = re.compile(r"[a-z0-9][a-z0-9-]{0,63}\Z")
HOST = re.compile(r"[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+\Z")
IMAGE = re.compile(r"/[a-z0-9][a-z0-9/_-]{0,190}\.(webp|png|jpe?g)\Z")
STAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})\Z")
MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November",
          "December")   # fixed, not %B: the build machine's locale never changes a page
DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
EVENT_KEYS = {"slug", "title", "summary", "starts_at", "ends_at", "venue_timezone", "venue", "host", "image", "image_alt",
              "tickets", "rsvp", "status", "ticket_url", "demo"}
REQUIRED = {"slug", "title", "summary", "starts_at", "ends_at", "venue_timezone", "venue", "host", "image", "image_alt", "status"}
CONFIG_KEYS = {"title", "notice", "demo_only", "ticket_hosts", "waitlist_url", "week_starts", "hero"}


def _text(name, value, most, field, empty=False):
    """A plain-text field: a string of at most `most` characters, with no HTML (no < or >) and no control character."""
    if not isinstance(value, str) or (not empty and not value.strip()) or len(value) > most:
        raise layout.LayoutError(f"{name}: {field} must be text of {'0' if empty else '1'} to {most} characters")
    if re.search(r"[<>\x00-\x1f\x7f]", value):
        raise layout.LayoutError(f"{name}: {field} is plain text: no HTML and no control characters")
    return value


def _https(name, value, hosts, field):
    """An https address on one of `hosts`, or "" for none. A backslash, a space or a control character is refused first."""
    if value == "":
        return value
    # A quote or angle bracket could only ever break out of the href it goes in (mi-dev-3 on #536), so refuse it here too.
    if not isinstance(value, str) or re.search(r"[\\\s\x00-\x1f\x7f\"'<>`]", value):
        raise layout.LayoutError(f"{name}: {field} must be an https address")
    u = urllib.parse.urlsplit(value)
    if u.scheme != "https" or u.username or u.password or u.port is not None or (u.hostname or "") not in hosts:
        raise layout.LayoutError(f"{name}: {field} must be https on one of the config's ticket_hosts ({', '.join(hosts) or 'none'}), "
                                 "with no port or sign-in")
    return value


def _when(name, value, field):
    if not isinstance(value, str) or not STAMP.fullmatch(value):
        raise layout.LayoutError(f"{name}: {field} must be an ISO 8601 time with Z or an offset, like 2026-12-05T02:30:00Z")
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(datetime.timezone.utc)
    except (ValueError, OverflowError):   # an offset that pushes the year past 1 or 9999 (mi-dev-3 on #536)
        raise layout.LayoutError(f"{name}: {field} is not a real time: {value}") from None


MACHINE_ZONES = {"localtime", "factory", "posixrules"}   # these follow the build machine, never the venue (mi-dev-3 on #536)


def _zone(name, value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}\Z", value) or value.lower() in MACHINE_ZONES:
        raise layout.LayoutError(f"{name}: venue_timezone must be an IANA name, like America/Denver")
    try:
        return zoneinfo.ZoneInfo(value)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        raise layout.LayoutError(f"{name}: venue_timezone {value} is not a time zone this build knows (no fallback to UTC)") from None


def _config(root):
    cfg = doclib.strict(CONFIG, (root / CONFIG).read_text(encoding="utf-8"))
    if not isinstance(cfg, dict) or not set(cfg) <= CONFIG_KEYS or "title" not in cfg:
        raise layout.LayoutError(f"{CONFIG} must be an object with a title, and only {', '.join(sorted(CONFIG_KEYS))}")
    _text(CONFIG, cfg["title"], 60, "title")
    demo = cfg.get("demo_only", False)
    if not isinstance(demo, bool):
        raise layout.LayoutError(f"{CONFIG}: demo_only is true or false")
    notice = _text(CONFIG, cfg.get("notice", ""), 200, "notice", empty=True)
    if demo and not notice.strip():
        raise layout.LayoutError(f"{CONFIG}: a demo_only site needs its test notice, shown on every events page")
    hosts = cfg.get("ticket_hosts", [])
    if not (isinstance(hosts, list) and len(hosts) <= 10 and all(isinstance(h, str) and HOST.fullmatch(h) for h in hosts)
            and len(set(hosts)) == len(hosts)):
        raise layout.LayoutError(f"{CONFIG}: ticket_hosts is a list of host names, like tickets.example.com, each once")
    week = cfg.get("week_starts", "monday")
    if week not in ("monday", "sunday"):
        raise layout.LayoutError(f"{CONFIG}: week_starts is monday or sunday")
    hero = cfg.get("hero")
    if hero is not None:
        if not (isinstance(hero, dict) and {"image", "alt"} <= set(hero) <= {"image", "alt", "caption"}
                and isinstance(hero["image"], str) and IMAGE.fullmatch(hero["image"])):
            raise layout.LayoutError(f'{CONFIG}: hero is {{"image": a site path to a .webp, .png or .jpg, "alt", "caption"}}')
        _text(CONFIG, hero["alt"], 160, "the hero's alt")
        _text(CONFIG, hero.get("caption", ""), 120, "the hero's caption", empty=True)
    return {"title": cfg["title"], "demo_only": demo, "notice": notice, "ticket_hosts": hosts,
            "waitlist_url": _https(CONFIG, cfg.get("waitlist_url", ""), hosts, "waitlist_url"),
            "monday": week == "monday", "hero": hero}


def _event(n, ev, cfg, now):
    name = f"{DATA}: event {n + 1}"
    if not isinstance(ev, dict):
        raise layout.LayoutError(f"{name} must be an object")
    if not REQUIRED <= set(ev) or not set(ev) <= EVENT_KEYS:
        raise layout.LayoutError(f"{name} needs {', '.join(sorted(REQUIRED - set(ev))) or 'nothing more'}; unknown: "
                                 f"{', '.join(sorted(set(ev) - EVENT_KEYS)) or 'none'}")
    if not isinstance(ev["slug"], str) or not SLUG.fullmatch(ev["slug"]):
        raise layout.LayoutError(f"{name}: slug must be lowercase letters, digits and hyphens")
    name = f"{DATA}: {ev['slug']}"
    if cfg["demo_only"] and ev.get("demo") is not True:
        raise layout.LayoutError(f'{name}: this is a demo-only site, so every event must say "demo": true')
    if "demo" in ev and not isinstance(ev["demo"], bool):
        raise layout.LayoutError(f"{name}: demo is true or false")
    zone = _zone(name, ev["venue_timezone"])
    starts, ends = _when(name, ev["starts_at"], "starts_at"), _when(name, ev["ends_at"], "ends_at")
    if ends <= starts:
        raise layout.LayoutError(f"{name}: ends_at must be after starts_at")
    v = ev["venue"]
    if not (isinstance(v, dict) and set(v) == {"name", "address"}):
        raise layout.LayoutError(f'{name}: venue is {{"name", "address"}}')
    if not isinstance(ev["image"], str) or not IMAGE.fullmatch(ev["image"]):
        raise layout.LayoutError(f"{name}: image must be a site path to a .webp, .png or .jpg, like /img/events/{ev['slug']}.webp")
    if ev["status"] not in ("open", "full"):   # past is the build clock's to say, never the file's
        raise layout.LayoutError(f"{name}: status is open or full (an event is past when its ends_at is before the build)")
    if ("tickets" in ev) == bool(ev.get("rsvp")):
        raise layout.LayoutError(f"{name}: an event has tickets or rsvp: true, one of the two")
    if "rsvp" in ev and ev["rsvp"] is not True:
        raise layout.LayoutError(f"{name}: rsvp is true, or left out")
    tickets = []
    if "tickets" in ev:
        if not (isinstance(ev["tickets"], list) and 1 <= len(ev["tickets"]) <= 10):
            raise layout.LayoutError(f"{name}: tickets is a list of 1 to 10")
        for t in ev["tickets"]:
            if not (isinstance(t, dict) and set(t) == {"name", "price"}):
                raise layout.LayoutError(f'{name}: each ticket is {{"name", "price"}}')
            tickets.append({"name": _text(name, t["name"], 60, "a ticket's name"), "price": _text(name, t["price"], 24, "a ticket's price")})
    return {"slug": ev["slug"], "title": _text(name, ev["title"], 90, "title"), "summary": _text(name, ev["summary"], 170, "summary"),
            "starts": starts, "ends": ends, "zone": zone, "venue": {"name": _text(name, v["name"], 90, "the venue's name"),
            "address": _text(name, v["address"], 160, "the venue's address")}, "host": _text(name, ev["host"], 90, "host"),
            "image": ev["image"], "image_alt": _text(name, ev["image_alt"], 200, "image_alt"), "tickets": tickets,
            "rsvp": bool(ev.get("rsvp")), "status": ev["status"], "past": ends <= now,
            "ticket_url": _https(name, ev.get("ticket_url", ""), cfg["ticket_hosts"], "ticket_url"), "demo": ev.get("demo") is True}


def load(root, now):
    """{"config", "events", "now"}, or None for a site with no .sitekit/events.json. Every refusal comes before anything is
    written. `now` is the build's clock, so a build is the same bytes for the same `now` on any day."""
    root = pathlib.Path(root)
    for p in (root / CONFIG, root / DATA, (root / DATA).parent):
        if p.is_symlink():
            raise layout.LayoutError(f"{p.relative_to(root)} is a symlink: the events live only in the site's own folder")
    if (root / CONFIG).is_dir():
        raise layout.LayoutError(f"{CONFIG} is a folder: the events config is a file")
    if not (root / CONFIG).is_file():
        if (root / DATA).exists():
            raise layout.LayoutError(f"{DATA} needs {CONFIG} (its title, and the ticket hosts): add it, or remove {DATA}")
        return None
    cfg = _config(root)
    if not (root / DATA).is_file():
        raise layout.LayoutError(f"{CONFIG} names events, but {DATA} is missing")
    data = doclib.strict(DATA, (root / DATA).read_text(encoding="utf-8"))
    if not (isinstance(data, dict) and set(data) == {"events"} and isinstance(data["events"], list) and 1 <= len(data["events"]) <= MOST):
        raise layout.LayoutError(f'{DATA} must be {{"events": [...]}}, with 1 to {MOST} events')
    events = [_event(n, ev, cfg, now) for n, ev in enumerate(data["events"])]
    slugs = [e["slug"] for e in events]
    if len(set(slugs)) != len(slugs):
        raise layout.LayoutError(f"{DATA}: a slug is used twice: {sorted({s for s in slugs if slugs.count(s) > 1})[0]}")
    lib = {"config": cfg, "events": events, "now": now}
    all_months = months(lib)
    first, last = all_months[0], all_months[-1]
    span = (last[0] - first[0]) * 12 + last[1] - first[1] + 1
    if span > SPAN:
        raise layout.LayoutError(f"{DATA}: the events span {span} months, {first[0]:04d}-{first[1]:02d} to {last[0]:04d}-{last[1]:02d}, "
                                 f"and the calendar holds at most {SPAN}: check for a mistyped year")
    return lib


def url(ev):
    return f"{INDEX}{ev['slug']}/"


def month_url(y, m):
    return f"{INDEX}{y:04d}/{m:02d}/"


def months(lib):
    """Each (year, month) that holds an event's start, in the venue's own time, oldest first: an empty month gets no page
    (mi-dev-3 on #558: empty months filled the sitemap and llms.txt)."""
    return sorted({(e["starts"].astimezone(e["zone"]).year, e["starts"].astimezone(e["zone"]).month) for e in lib["events"]})


def local_time(ev, at):
    """'Fri 4 December 2026, 7:30 pm MST': the venue's zone and its abbreviation, with fixed names (never the locale)."""
    t = at.astimezone(ev["zone"])
    hour = t.hour % 12 or 12
    return f"{DAYS[t.weekday()][:3]} {t.day} {MONTHS[t.month - 1]} {t.year}, {hour}:{t.minute:02d} {'am' if t.hour < 12 else 'pm'} {t.tzname()}"


def stamp(at):
    return at.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def upcoming(lib):
    return sorted((e for e in lib["events"] if not e["past"]), key=lambda e: e["starts"])


def past(lib):
    return sorted((e for e in lib["events"] if e["past"]), key=lambda e: e["starts"], reverse=True)


def _hero(heading, lead, image, alt, caption, key):
    props = {"heading": heading, "lead": lead, "image": {"src": image, "alt": alt}}
    if caption:
        props["caption"] = caption
    return [{"id": key, "block": "hero@1", "props": props}]


def with_pages(record, lib):
    """The record with /events/ (unless it has one), a page per event and a page per month, in no menu. On a demo_only
    site every one is "index": false, so search engines never list a pretend event."""
    if not lib:
        return record
    cfg, pages = lib["config"], list(record["pages"])
    hide = {"index": False} if cfg["demo_only"] else {}
    if cfg["demo_only"] and any(isinstance(p, dict) and p.get("path") == INDEX for p in pages):
        # The made-up listing would land on the site's own, indexed /events/ page (mi-dev-3 on #536).
        raise layout.LayoutError(f"the record has its own {INDEX} page, but the events config is demo_only, so its pretend listing "
                                 f"would be indexed there: remove the record's {INDEX} page (the events make their own); nothing was built")
    hero = cfg["hero"]
    page_hero = (lambda heading, lead, key: _hero(heading, lead, hero["image"], hero["alt"], hero.get("caption", ""), key)) if hero else (lambda *_: [])
    if not any(isinstance(p, dict) and p.get("path") == INDEX for p in pages):
        pages.append({"path": INDEX, "type": "page", "title": cfg["title"], "menu": "none", **hide,
                      "description": f"{cfg['title']}: what's coming up, and what has been.",
                      "sections": page_hero(cfg["title"], cfg["notice"], "events-index")})
    for ev in lib["events"]:
        pages.append({"path": url(ev), "type": "page", "title": ev["title"], "description": ev["summary"], "menu": "none", **hide,
                      "sections": _hero(ev["title"], ev["summary"], ev["image"], ev["image_alt"], "", f"event-{ev['slug']}")})
    for y, m in months(lib):
        title = f"{MONTHS[m - 1]} {y}"
        pages.append({"path": month_url(y, m), "type": "page", "title": f"{cfg['title']}: {title}", "menu": "none", **hide,
                      "description": f"{cfg['title']} in {title}, on a calendar.", "sections": page_hero(title, cfg["notice"], f"events-{y}-{m:02d}")})
    return {**record, "pages": pages}


def _notice(lib):
    cfg, e = lib["config"], serialize.escape
    return f'<p class="events-notice">{e(cfg["notice"])}</p>' if cfg["notice"] else ""


def _demo(lib):
    return '<span class="events-stamp">DEMO</span> ' if lib["config"]["demo_only"] else ""


def _card(lib, ev):
    e = serialize.escape
    return (f'<li class="events-card"><h3 class="wp-block-heading">{_demo(lib)}<a href="{url(ev)}">{e(ev["title"])}</a></h3>'
            f'<p><time datetime="{stamp(ev["starts"])}">{e(local_time(ev, ev["starts"]))}</time><br>{e(ev["venue"]["name"])}</p></li>')


def _button(lib, ev):
    """The hand-off: a past event has none; a full one says so, with the site's waitlist if it has one; else the ticket host."""
    e = serialize.escape
    if ev["past"]:
        return '<p class="events-state">This event has ended.</p>'
    if ev["status"] == "full":
        wait = lib["config"]["waitlist_url"]
        return '<p class="events-state">Full.</p>' + (f'<p><a class="wp-element-button" href="{e(wait)}">Join the waitlist</a></p>' if wait else "")
    if not ev["ticket_url"]:
        return ""
    return f'<p><a class="wp-element-button" href="{e(ev["ticket_url"])}">{"Sign up" if ev["rsvp"] else "Get tickets"}</a></p>'


def _event_main(lib, ev):
    e = serialize.escape
    tickets = ("<ul class=\"events-tickets\">" + "".join(f"<li>{e(t['name'])}: {e(t['price'])}</li>" for t in ev["tickets"]) + "</ul>"
               if ev["tickets"] else "<p>Free, with a sign-up.</p>")
    demo = f'<p>{_demo(lib)}event: made up, for trying the site</p>' if lib["config"]["demo_only"] else ""
    return (f'<article class="wp-block-group events-event">{_notice(lib)}{demo}'
            f'<ul class="events-facts"><li><strong>When:</strong> <time datetime="{stamp(ev["starts"])}">{e(local_time(ev, ev["starts"]))}</time>'
            f' to <time datetime="{stamp(ev["ends"])}">{e(local_time(ev, ev["ends"]))}</time></li>'
            f'<li><strong>Where:</strong> {e(ev["venue"]["name"])}, {e(ev["venue"]["address"])}</li>'
            f'<li><strong>Host:</strong> {e(ev["host"])}</li></ul>{tickets}{_button(lib, ev)}'
            f'<p><a href="{INDEX}">All the events</a></p></article>')


def _month_main(lib, y, m, all_months):
    e, cfg = serialize.escape, lib["config"]
    first = datetime.date(y, m, 1)
    days = (datetime.date(y + (m == 12), m % 12 + 1, 1) - first).days
    order = list(range(7)) if cfg["monday"] else [6, 0, 1, 2, 3, 4, 5]
    lead = order.index(first.weekday())
    on = {}
    for ev in sorted(lib["events"], key=lambda x: x["starts"]):
        t = ev["starts"].astimezone(ev["zone"])
        if (t.year, t.month) == (y, m):
            on.setdefault(t.day, []).append(ev)
    cells = "".join(f'<li class="events-wd" aria-hidden="true">{DAYS[d][:3]}</li>' for d in order)
    cells += '<li class="events-blank" aria-hidden="true"></li>' * lead
    for d in range(1, days + 1):
        evs = "".join(f'<a href="{url(ev)}">{e(ev["title"])}</a>' for ev in on.get(d, []))
        cells += f'<li class="events-day{" events-on" if d in on else ""}"><span>{d}</span>{evs}</li>'
    i = all_months.index((y, m))
    prev = all_months[i - 1] if i else None
    nxt = all_months[i + 1] if i + 1 < len(all_months) else None
    pager = "".join([f'<a href="{month_url(*prev)}">Earlier: {MONTHS[prev[1] - 1]} {prev[0]}</a>' if prev else "",
                     f'<a href="{month_url(*nxt)}">Later: {MONTHS[nxt[1] - 1]} {nxt[0]}</a>' if nxt else ""])
    return (f'<section class="wp-block-group events-month">{_notice(lib)}<ol class="events-grid">{cells}</ol>'
            + (f'<nav class="events-pager" aria-label="Other months">{pager}</nav>' if pager else "")
            + f'<p><a href="{INDEX}">All the events</a></p></section>')


def home_row(lib):
    """Whether the home page shows the upcoming row: something is coming up, off a demo_only site. The home page is always
    indexed (layout.py), so on a demo_only site its twin and llms-full.txt would carry the pretend events (site-dev on #536)."""
    return bool(upcoming(lib)) and not lib["config"]["demo_only"]


def main(lib, home=True):
    """{page path: the HTML the events add to that page's main}: the list, each event, each month, and the home page's
    upcoming row (see home_row), as a card list in card-gallery's marker."""
    if not lib:
        return {}
    out, all_months = {}, months(lib)
    soon, gone = upcoming(lib), past(lib)
    listing = _notice(lib)
    if soon:
        listing += '<section class="wp-block-group events-list"><h2 class="wp-block-heading">Coming up</h2><ul>' + "".join(_card(lib, ev) for ev in soon) + "</ul></section>"
    if gone:
        listing += '<section class="wp-block-group events-list"><h2 class="wp-block-heading">Past events</h2><ul>' + "".join(_card(lib, ev) for ev in gone) + "</ul></section>"
    cal = "".join(f'<li><a href="{month_url(y, m)}">{MONTHS[m - 1]} {y}</a></li>' for y, m in all_months)
    out[INDEX] = listing + f'<section class="wp-block-group events-months"><h2 class="wp-block-heading">By month</h2><ul>{cal}</ul></section>'
    for ev in lib["events"]:
        out[url(ev)] = _event_main(lib, ev)
    for y, m in all_months:
        out[month_url(y, m)] = _month_main(lib, y, m, all_months)
    if home and home_row(lib):
        out["/"] = (f'<section class="wp-block-group events-upcoming"><h2 class="wp-block-heading">{serialize.escape(lib["config"]["title"])}</h2>'
                    '<div data-card-gallery="events"><ul class="events-cards">' + "".join(_card(lib, ev) for ev in soon) + "</ul></div>"
                    f'<p><a href="{INDEX}">All the events</a></p></section>')
    return out


STYLE = """/* Events (site-kit#532): linked only from the events pages and the home page that shows the upcoming row. */
.events-notice { font-weight: 700; padding: .5rem .75rem; border: 2px solid var(--st-ink); background: var(--st-ground); }
.events-stamp { display: inline-block; font-size: .8em; padding: 0 .35rem; border: 2px solid currentColor; transform: rotate(-4deg); }
.events-list ul, .events-cards, .events-facts, .events-months ul { list-style: none; padding: 0; }
.events-card { margin-bottom: 1rem; }
.events-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); list-style: none; padding: 0; border: 2px solid var(--st-ink); }
.events-grid li { min-height: 3.5rem; padding: .25rem; border: 1px solid var(--st-ink); min-width: 0; overflow-wrap: anywhere; }
.events-grid .events-wd { min-height: 0; font-weight: 700; text-align: center; }
.events-grid .events-on a { display: block; font-size: .8rem; }
.events-pager { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
"""


def head(lib, path, origin):
    """The events stylesheet on their pages and the home page's row, and, off a demo_only site, each event's Event data."""
    if not lib:
        return []
    paths = {INDEX, *(url(ev) for ev in lib["events"]), *(month_url(y, m) for y, m in months(lib))}
    out = []
    if path in paths or (path == "/" and home_row(lib)):
        out.append(f'<link rel="stylesheet" href="/{CSS}">')
    if not lib["config"]["demo_only"]:
        for ev in lib["events"]:
            if path == url(ev):
                data = {"@context": "https://schema.org", "@type": "Event", "name": ev["title"], "description": ev["summary"],
                        "startDate": stamp(ev["starts"]), "endDate": stamp(ev["ends"]), "url": origin + url(ev),
                        "image": origin + ev["image"], "eventStatus": "https://schema.org/EventScheduled",
                        "location": {"@type": "Place", "name": ev["venue"]["name"], "address": ev["venue"]["address"]},
                        "organizer": {"@type": "Organization", "name": ev["host"]}}
                text = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
                out.append(f'<script type="application/ld+json">{text}</script>')
    return out


def files(lib):
    """{site path: text}: the events stylesheet."""
    return {CSS: STYLE} if lib else {}
