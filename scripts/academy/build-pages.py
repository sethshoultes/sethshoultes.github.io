"""Build the academy pages from the WordPress export. Run from the repo root:

    scripts/academy/export-courses.sh > scripts/academy/source/export.json   (once, read-only against WordPress)
    python3 -I scripts/academy/build-pages.py

Writes academy/index.html (the hub) and academy-md.html (its markdown twin), a page per course and per lesson,
the images into assets/academy/, and scripts/academy/redirects.tsv (old smartwebutah.com address, new address).
Safe to re-run: it deletes and rewrites everything it owns.
"""
import html, json, os, re, shutil, subprocess, sys, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "scripts/academy/source/export.json"
OUT = ROOT / "academy"
IMG = ROOT / "assets/academy"
SITE = "https://sethshoultes.com"

# Alt text for the images WordPress stored with none. Keyed by file name.
ALT = {
    "color-wheel-1015x1024.png": "A colour wheel showing primary, secondary and tertiary colours",
    "Bob-Ross-Colours-1.jpg": "The Bob Ross oil paint colours in a row",
    "THROTTLE-AND-PITCH-Want-to-jump-higher-Push-up-on-the-joystick-for-more-throttle-683x1024.png": "Throttle and pitch: push the left stick up for more throttle",
    "Leonardo_Phoenix_Throttle_and_Pitch_Just_like_moving_a_charact_0-1024x1024.jpg": "An illustration of throttle and pitch controls on a drone remote",
    "ReadyLaunch-1024x998.webp": "The MemberPress ReadyLaunch template",
}
THIRD_PARTY = ("artsupplies.co.uk",)  # another company's photos: not copied, see the PR

# One plain sentence for the hub card, and a short intro for the course page. Hand-written: the WordPress intros were
# sales copy ("Unlock the power of...") and are not used. Keyed by course slug. No double quotes (they go into an include).
BLURBS = {
    "painting-like-bob-ross-for-beginners": (
        "Painting the way Bob Ross taught it: wet-on-wet oils, brushes, mixing colour, then trees, water, mountains and cabins.",
        "Start with materials and the wet-on-wet technique, then work through brushes, colour and landscapes one subject at a time. You do not need any painting experience."),
    "html-css-basics-introduction-for-beginners": (
        "Start here if you have never made a web page: HTML tags, then CSS to style them.",
        "You learn how a page is structured, how to add headings, links, images and forms, and how CSS changes how it all looks."),
    "intermediate-level-html-and-css": (
        "Bigger pages, better CSS: semantic HTML, forms, Flexbox, Grid and responsive layouts.",
        "For when the basics feel comfortable. The lessons cover page structure, forms, layout with Flexbox and Grid, and making a page work on a phone."),
    "advanced-level-html-and-css": (
        "Faster, tidier front ends: advanced Grid, CSS variables, Sass, performance and how to organise your CSS.",
        "For people who already build pages with HTML and CSS and want the code to hold up as a site grows."),
    "drone-flying-for-beginners-a-basic-guide": (
        "What a drone is, how its parts work, how to fly one, and what drones are used for.",
        "A first course in flying drones, from the parts and the controller to real uses in film, farming, rescue and delivery."),
    "drone-piloting": (
        "The basic skills of flying a drone, plus the rules and safety habits that go with them.",
        "Take this after Drone Flying for Beginners. It covers basic piloting, flight dynamics, regulations and safety."),
    "drone-piloting-advanced-techniques": (
        "Acro mode, tuning your drone and the manoeuvres that racing and freestyle pilots use.",
        "For pilots who are past the basics. It covers legal rules, manual control, setting up a drone for hard flying and what professional pilots do."),
    "advanced-drone-pilot-maneuvers": (
        "Freestyle FPV moves taken one at a time: power loops, the Immelmann, the Split-S and more.",
        "Each lesson breaks one manoeuvre into its mechanics, with tips for getting it right."),
    "fundamental-concepts-of-membership-websites": (
        "How membership sites work, then step-by-step builds with WordPress and MemberPress: courses, coaching, hiking and dating sites.",
        "Start with the ideas: tiers, subscriptions, restricting content. Then follow worked examples that set up each kind of site."),
    "mastering-the-memberpress-rest-api": (
        "Use the MemberPress REST API to connect other tools, automate member tasks and add your own endpoints.",
        "For developers. The lessons cover use cases, worked examples, testing requests in Postman, OAuth and payment automation."),
    "memberpress-event-espresso-for-non-profit-organizations": (
        "Run memberships, events and donations for a non-profit with MemberPress and Event Espresso.",
        "The lessons start with the ideas, then go through automations for discounts, event sign-ups, donors, volunteers and reporting."),
    "business-startup-essentials": (
        "A short introduction to starting a business: how to get started, plan and market.",
        "Three written lessons so far, on getting started, planning and marketing a new business."),
}


def ascii_slug(s):
    s = urllib.parse.unquote(s).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")


def plain_title(s):
    return re.sub(r"\s+", " ", re.sub(r"[^\x00-\x7f]", "", html.unescape(s))).strip()


def lesson_title(s):
    """Lesson titles in the export carry their own "3." numbers, which restart in every section: drop them, the page numbers the list."""
    return re.sub(r"^\d+\.\s*", "", plain_title(s))


def fetch_image(url):
    """Copy a smartwebutah.com upload into assets/academy/ and return (site path, width, height)."""
    name = urllib.parse.unquote(url.rsplit("/", 1)[1])
    safe = ascii_slug(name.rsplit(".", 1)[0]) + "." + name.rsplit(".", 1)[1].lower()
    dest = IMG / safe
    if not dest.exists():
        req = urllib.request.Request(urllib.parse.quote(url, safe=":/%"), headers={"User-Agent": "academy-export"})
        dest.write_bytes(urllib.request.urlopen(req, timeout=60).read())
    assert dest.stat().st_size > 0, url
    info = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(dest)], capture_output=True, text=True).stdout
    w, h = (int(re.search(rf"{k}: (\d+)", info).group(1)) for k in ("pixelWidth", "pixelHeight"))
    return f"/assets/academy/{safe}", w, h, name


def clean(content, report):
    """WordPress block HTML -> plain article HTML that satisfies the site's checks (no inline styles, alt on images)."""
    h = re.sub(r"<!--\s*/?wp:.*?-->\s*", "", content, flags=re.S)
    h = re.sub(r'\sstyle="[^"]*"', "", h)
    h = re.sub(r'\sclass="(?:wp-block-[^"]*|wp-image-\d+)"', "", h)

    def img(m):
        tag = m.group(0)
        src = re.search(r'src="([^"]+)"', tag).group(1)
        if any(t in src for t in THIRD_PARTY):
            report["dropped_third_party"] += 1
            return ""
        path, w, hgt, name = fetch_image(src)
        report["images"].add(path)
        return f'<img src="{path}" alt="{html.escape(ALT.get(name, ""), quote=True)}" width="{w}" height="{hgt}" loading="lazy" decoding="async">'

    h = re.sub(r"<img\b[^>]*>", img, h)
    # placeholder links left in the original lessons (broken on WordPress too): keep the words, lose the link
    h, n = re.subn(r'<a\b[^>]*href="actual-working-url"[^>]*>(.*?)</a>', r"\1", h, flags=re.S)
    report["placeholder_links"] += n
    # quotes inside code samples are written as &quot; so the link check does not read `src="image.jpg"` as a real image
    h = re.sub(r"(<code\b[^>]*>)(.*?)(</code>)", lambda m: m.group(1) + m.group(2).replace('"', "&quot;") + m.group(3), h, flags=re.S)
    # emoji were lost from the WordPress database long ago and became a lone "?" at the start of a heading or item
    h, n = re.subn(r"(<(?:h[1-6]|p|li|strong)\b[^>]*>)\?\s+", r"\1", h)
    report["lost_emoji"] += n
    # YouTube embeds were stored as a bare address inside a figure: make them a real link (the video is not ours to host)
    h = re.sub(r'<figure[^>]*>\s*<div[^>]*>\s*(https://youtu\.be/[^\s<]+)\s*</div>(.*?)</figure>',
               lambda m: f'<p><a href="{m.group(1)}">Watch the video on YouTube</a></p>' + re.sub(r'<figcaption[^>]*>(.*?)</figcaption>', r"<p>\1</p>", m.group(2), flags=re.S), h, flags=re.S)
    h = re.sub(r"<figure>\s*</figure>", "", h)
    h = re.sub(r"<figure>\s*(<figure>|</figure>)", r"\1", h)
    # the page already has an H1: shift headings up so the lesson starts at H2
    levels = [int(x) for x in re.findall(r"<h([1-6])\b", h)]
    if levels and min(levels) > 2:
        shift = min(levels) - 2
        h = re.sub(r"<(/?)h([1-6])\b", lambda m: f"<{m.group(1)}h{int(m.group(2)) - shift}", h)
    elif levels and min(levels) == 1:
        h = re.sub(r"<(/?)h([1-5])\b", lambda m: f"<{m.group(1)}h{int(m.group(2)) + 1}", h)
    return h.strip()


def summary(h, n=155):
    t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"<(pre|code)\b.*?</\1>", "", h, flags=re.S)))).strip()
    t = re.sub(r"^(Overview|Introduction)\s*", "", t)
    t = re.sub(r"^[\s:.,;-]+", "", t)
    return (t[:n].rsplit(" ", 1)[0] + "...") if len(t) > n else t


def front(**kv):
    lines = ["---"] + [f"{k}: {json.dumps(v, ensure_ascii=False)}" if isinstance(v, str) else f"{k}: {v}" for k, v in kv.items()] + ["---"]
    return "\n".join(lines) + "\n"


def jsonld(*objs):
    return "".join(f'<script type="application/ld+json">{json.dumps(o, ensure_ascii=False)}</script>\n' for o in objs)


def crumbs(*items):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": SITE + p} for i, (n, p) in enumerate(items)]}


def main():
    data = json.loads(SRC.read_text())
    for p in (OUT, IMG):
        shutil.rmtree(p, ignore_errors=True)
        p.mkdir(parents=True)
    report = {"images": set(), "dropped_third_party": 0, "placeholder_links": 0, "lost_emoji": 0, "empty": [], "lessons": 0}
    redirects = [("/courses/", "/academy/")]
    cards = []

    for c in data:
        cslug = ascii_slug(c["slug"])
        ctitle = plain_title(c["title"])
        cpath = f"/academy/{cslug}/"
        lessons = [(s, l) for s in c["sections"] for l in s["lessons"]]
        used, flat = set(), []
        for s, l in lessons:
            if len(re.sub(r"<[^>]+>|\s", "", clean(l["content"], dict(report, images=set())))) < 80:
                # a lesson that was published with no text: no page, and the old address goes to the course
                report["empty"].append(f"{cslug}/{ascii_slug(l['slug'])}")
                redirects.append((urllib.parse.urlparse(l["link"]).path, cpath))
                continue
            slug = ascii_slug(l["slug"]) or f"lesson-{l['id']}"
            base, n = slug, 2
            while slug in used:
                slug, n = f"{base}-{n}", n + 1
            used.add(slug)
            flat.append((s, l, slug))
        card, intro_text = BLURBS[cslug]
        cimg = None
        if c["image"]:
            path, w, hgt, _ = fetch_image(c["image"])
            cimg = (path, w, hgt)

        # lesson pages
        for i, (s, l, slug) in enumerate(flat):
            body = clean(l["content"], report)
            lpath = f"{cpath}{slug}/"
            ltitle = lesson_title(l["title"])
            prev = flat[i - 1] if i else None
            nxt = flat[i + 1] if i + 1 < len(flat) else None
            nav = ['<nav class="lesson-nav" aria-label="Lessons">']
            nav.append(f'<a class="prev" href="{cpath}{prev[2]}/"><span>Previous</span>{html.escape(lesson_title(prev[1]["title"]))}</a>' if prev else "<span></span>")
            nav.append(f'<a class="next" href="{cpath}{nxt[2]}/"><span>Next</span>{html.escape(lesson_title(nxt[1]["title"]))}</a>' if nxt else f'<a class="next" href="{cpath}"><span>Finished</span>Back to the course</a>')
            nav.append("</nav>")
            page = front(layout="site", page_type="lesson", title=f"{ltitle} – {ctitle}", description=summary(body), permalink=lpath)
            page += jsonld(crumbs(("Academy", "/academy/"), (ctitle, cpath), (ltitle, lpath)))
            page += f"""<div class="wrap academy">
  <article class="prose lesson">
    <p class="crumbs"><a href="/academy/">Academy</a> / <a href="{cpath}">{html.escape(ctitle)}</a></p>
    <p class="eyebrow">{html.escape(plain_title(s["title"]))}</p>
    <h1>{html.escape(ltitle)}</h1>
{{% raw %}}
{body}
{{% endraw %}}
  </article>
  {"".join(nav)}
</div>
"""
            d = OUT / cslug / slug
            d.mkdir(parents=True)
            (d / "index.html").write_text(page)
            report["lessons"] += 1
            old = urllib.parse.urlparse(l["link"]).path
            redirects.append((old, lpath))

        # course page
        sections_html = []
        n = 0
        for s in c["sections"]:
            items = []
            for _s, l, slug in [f for f in flat if f[0] is s]:
                n += 1
                items.append(f'<li><a href="{cpath}{slug}/">{html.escape(lesson_title(l["title"]))}</a></li>')
            if items:
                sections_html.append(f'<h2>{html.escape(plain_title(s["title"]))}</h2>\n<ol class="syllabus" start="{n - len(items) + 1}">\n' + "\n".join(items) + "\n</ol>")
        first = f"{cpath}{flat[0][2]}/" if flat else cpath
        lead = card
        course_ld = {"@context": "https://schema.org", "@type": "Course", "name": ctitle, "description": lead,
                     "url": SITE + cpath, "provider": {"@type": "Person", "name": "Seth Shoultes", "url": SITE + "/"},
                     "isAccessibleForFree": True}
        page = front(layout="site", page_type="course", title=f"{ctitle} – Academy", description=lead, permalink=cpath)
        page += jsonld(crumbs(("Academy", "/academy/"), (ctitle, cpath)), course_ld)
        hero = f'\n    <img class="course-img" src="{cimg[0]}" alt="" width="{cimg[1]}" height="{cimg[2]}" decoding="async">' if cimg else ""
        page += f"""<div class="wrap academy">
  <section class="prose course">
    <p class="crumbs"><a href="/academy/">Academy</a></p>
    <p class="eyebrow">{len(flat)} lessons · free</p>
    <h1>{html.escape(ctitle)}</h1>{hero}
    <p>{html.escape(intro_text)}</p>
    <p class="btn-row"><a class="btn" href="{first}">Start the first lesson</a></p>
    {chr(10).join(sections_html)}
  </section>
</div>
"""
        d = OUT / cslug
        (d / "index.html").write_text(page)
        redirects.append((urllib.parse.urlparse(c["link"]).path, cpath))
        cards.append((cslug, ctitle, lead, cimg, len(flat)))

    # hub + markdown twin
    card_html = []
    assert set(BLURBS) == {c[0] for c in cards}, "every course needs a hand-written blurb"
    for cslug, ctitle, lead, cimg, n in cards:
        img = f' img="{cimg[0]}" alt=""' if cimg else ""
        card_html.append(f'  <li>{{% include kit/link-card.html href="/academy/{cslug}/" title="{html.escape(ctitle, quote=True)}" line="{html.escape(lead, quote=True)} ({n} lessons)"{img} %}}</li>')
    hub = front(layout="site", page_type="hub", title="Academy: free courses you can read right now",
                description="Free courses on HTML and CSS, drone piloting, membership websites, the MemberPress REST API and more. No sign-in.",
                permalink="/academy/")
    hub += jsonld(crumbs(("Academy", "/academy/")))
    hub += f"""<div class="wrap hub">
  <section>
    <p class="eyebrow">Academy</p>
    <h1>Free courses you can read right now</h1>
    <p class="lead">{len(cards)} courses and {report["lessons"]} lessons, free to read, with no sign-in. Pick a course and start at the first lesson.</p>
    <div class="prose">
      <h2>Courses</h2>
      <ul class="link-grid">
{chr(10).join(card_html)}
      </ul>
      <p class="hub-note">Looking for the Claude Academy? It lives at <a href="https://myclaudeacademy.com/">myclaudeacademy.com</a>.</p>
      <p class="hub-note">Stuck on something? <a href="/consulting/#contact">Talk to me</a>.</p>
    </div>
  </section>
</div>
"""
    (OUT / "index.html").write_text(hub)
    twin = "---\nlayout: null\npermalink: /academy.md\nsitemap: false\n---\n"
    twin += f"# Free courses you can read right now\n\n{len(cards)} courses and {report['lessons']} lessons, free to read, with no sign-in.\n\nPage: {{{{ site.url }}}}/academy/\n\n## Courses\n"
    for cslug, ctitle, lead, cimg, n in cards:
        twin += f"- [{ctitle}]({SITE}/academy/{cslug}/): {lead} ({n} lessons)\n"
    (ROOT / "academy-md.html").write_text(twin)

    (ROOT / "scripts/academy/redirects.tsv").write_text("".join(f"{a}\t{b}\n" for a, b in redirects))
    print(f"courses {len(cards)}, lessons {report['lessons']}, images {len(report['images'])}, "
          f"third-party images dropped {report['dropped_third_party']}, placeholder links unlinked {report['placeholder_links']}, stray ? before headings removed {report['lost_emoji']}, near-empty lessons {len(report['empty'])}")
    for e in report["empty"]:
        print("  near-empty:", e)


if __name__ == "__main__":
    main()
