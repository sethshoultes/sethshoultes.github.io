"""Site templates, step 1f (site-kit#119, superintelligentfoo#175): the files an agent or a search engine reads, all made
from the same layout record and brand record as the pages (herdos docs/standards/public-site.md rules 3, 5, 6, 7, 8).

  robots.txt                      every named AI crawler allowed, a Content-Signal line in each group, one Sitemap line
  sitemap.xml                     every page; no lastmod (a build time would be a made-up freshness signal)
  llms.txt                        an H1, the "> why" line, key pages, contact
  <page>/index.md, llms-full.txt  each page's twin, made from that page's own static HTML, so its words are the page's
  .well-known/security.txt        RFC 9116; Expires 180 days from the build, so each build renews it
  .well-known/agent-card.json     the A2A card (agent-files answers its /a2a with a plain refusal until there is chat)
  .well-known/mcp.json            the read-only MCP that agent-files serves at /mcp
  .well-known/mcp/server-card.json, api-catalog, ard.json and ai-catalog.json (one document)
                                  discovery.py writes these and the two above, from one config (site-kit#314)
  JSON-LD (per page, in render)   BreadcrumbList; Organization, WebSite and (with a record "business") LocalBusiness on
                                  home; FAQPage where a page has questions

The why is written once, in the record ("why"), and reused in llms.txt, both cards and the Organization (rule 8).
Standard library only.
"""
import datetime
import html
import json
import re
import urllib.parse

import discovery
import serialize
from layout import SIGNALS

CRAWLERS = ("GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai",
            "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot", "Bytespider", "Amazonbot",
            "Meta-ExternalAgent")


def content_signal(record):
    """The Content-Signal value (herdos#3872): the record's choices over the defaults, in the spec's order."""
    chosen = {**SIGNALS, **record.get("content_signal", {})}
    return ", ".join(f"{k}={chosen[k]}" for k in SIGNALS)


def robots(origin, signal):
    # In every group: a crawler that matches its own group never reads the * group's lines.
    groups = [f"User-agent: {c}\nContent-Signal: {signal}\nAllow: /" for c in ("*", *CRAWLERS)]
    return "\n\n".join(groups) + f"\n\nSitemap: {origin}/sitemap.xml\n"


def listed(record):
    """The pages search and agents are pointed at: all but those with "index": false (site-kit#246)."""
    return [p for p in record["pages"] if p.get("index") is not False]


def sitemap(record, origin):
    urls = "".join(f"<url><loc>{html.escape(origin + p['path'])}</loc></url>" for p in listed(record))
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n'


# ---- markdown twins, from the page's own static HTML (the serializer writes a closed set of tags, so this stays small)

MD_SPECIAL = re.compile(r"([\\`*_\[\]<>#|])")


def _text(fragment):
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


def esc(text):
    """Any value written into markdown (a title, a description, the why, a name): markdown's own characters escaped."""
    return MD_SPECIAL.sub(r"\\\1", text)


def _md(fragment):
    """A page's text for a twin: its words exactly, with markdown's own characters escaped, so a markdown reader shows
    the words and never turns them into a heading, link, image or HTML (game-review on #126)."""
    return MD_SPECIAL.sub(r"\\\1", _text(fragment))


def _dest(href):
    """A link address for markdown's <destination>: anything outside a URL's own characters is percent-encoded, so a
    '>', '<', '\\' or '`' in an address the serializer allowed can't end the link early (security review on #126)."""
    return urllib.parse.quote(href, safe=":/?#@!$&'*+,;=%~.-_()")


def to_markdown(page_html):
    """Markdown from the static HTML of a page's sections."""
    out = []
    for m in re.finditer(r"<(h[1-6])[^>]*>(.*?)</\1>|<summary>(.*?)</summary>|<p>(.*?)</p>|<li>(.*?)</li>"
                         r'|<a class="wp-block-button__link[^"]*"(?: href="([^"]*)")?[^>]*>(.*?)</a>|<cite>(.*?)</cite>'
                         r'|<img src="([^"]*)" alt="([^"]*)"', page_html, re.S):
        h, htext, summary, p, li, href, btn, cite, src, alt = m.groups()
        if h:
            out.append("#" * int(h[1]) + " " + _md(htext))
        elif summary is not None:
            out.append("### " + _md(summary))
        elif p is not None:
            out.append(_md(p))
        elif li is not None:
            out.append("- " + _md(li))
        elif btn is not None:   # a safe scheme (the serializer checked), percent-encoded so it can't close the <link>
            out.append(f"[{_md(btn)}](<{_dest(html.unescape(href))}>)" if href else _md(btn))
        elif cite is not None:
            out.append("— " + _md(cite))
        elif src is not None:
            out.append(f"*{_md(alt)}*")
    return "\n\n".join(x for x in out if x.strip()) + "\n"


def twin(record, page, body_html, origin):
    lead = [origin + page["path"]] + ([esc(page["description"])] if page.get("description") else [])
    return f"# {esc(page['title'])}\n\n" + "\n\n".join(lead) + "\n\n" + to_markdown(body_html)


def llms(record, brand_rec, origin, family=None):
    # Every value is escaped: game-dev-3 on #126 re-pointed the home link with a title of "Home](https://evil.test/) [x".
    pages = "\n".join(f"- [{esc(p['title'])}](<{origin}{p['path']}>)" + (f": {esc(p['description'])}" if p.get("description") else "")
                      for p in listed(record))
    return (f"# {esc(brand_rec['name'])}\n\n> {esc(record['why'])}\n\n## Key facts\n\n- Website: <{origin}/>\n"
            f"- Made from the site-kit template \"{esc(record.get('template', ''))}\"\n\n## Key pages\n\n{pages}\n\n"
            "## Contact\n\n" + (f"- Email: <mailto:{_dest(record['email'])}>\n" if record.get("email") else "")
            + f"- Help: <{_dest(brand_rec['support']['url'])}>\n"
            + ("\n## Family\n\n" + "".join(f"- [{esc(s['name'])}](<{_dest(s['url'])}>): {esc(s['purpose'])}\n" for s in family if not s.get("current"))
               if family else ""))


def llms_full(record, brand_rec, origin, twins, family=None):
    return llms(record, brand_rec, origin, family) + "".join(f"\n---\n\n<!-- {origin}{path} -->\n\n{md}" for path, md in twins.items())


def contact(record, brand_rec):
    """Where to reach the site (the lead on site-kit#301): the record's own email, else the brand's https help page. The
    brand's support address is never published on a site, so a client's site never carries its maker's address."""
    return f"mailto:{record['email']}" if record.get("email") else brand_rec["support"]["url"]


def security_txt(record, brand_rec, origin, now):
    expires = (now + datetime.timedelta(days=180)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return (f"Contact: {contact(record, brand_rec)}\nExpires: {expires}\nPreferred-Languages: en\n"
            f"Canonical: {origin}/.well-known/security.txt\n")


def _docs(record, origin):
    """Where an agent reads how the site works: its /how-this-site-is-built/ page when it has one (Seth's own sites do),
    else its llms.txt. A client's site carries no page about how we built it (Seth, 2026-11-08)."""
    has = any(p.get("path") == "/how-this-site-is-built/" for p in record["pages"])
    return f"{origin}/how-this-site-is-built/" if has else f"{origin}/llms.txt"


def card_name(origin):
    """The MCP server card's name: the site's host reversed as its namespace, then "site" (eventpresser-dev-2 on #317)."""
    host = urllib.parse.urlsplit(origin).hostname or "site.invalid"
    return ".".join(reversed(host.split("."))) + "/site"


def discovery_config(record, brand_rec, origin):
    """The agent-discovery config a template site has (site-kit#314): agent-files serves its /mcp and /a2a, so both are real."""
    return {"origin": origin, "name": brand_rec["name"], "docs": _docs(record, origin).removeprefix(origin),
            "description": f"{record['why']} There is no assistant here yet: its endpoint says so, and the pages are at {origin}/llms.txt.",
            "mcp": {"name": card_name(origin), "title": brand_rec["name"], "version": "1.0.0", "url": f"{origin}/mcp", "protocol_versions": ["2025-06-18"],
                    "description": f"{record['why']} This read-only server lists the site's pages and returns any one of them as Markdown.",
                    "tools": [{"name": "list_pages", "description": "List the site's public pages, from its sitemap."},
                              {"name": "get_page", "description": "Get one public page as Markdown, by its path."}]},
            # The skill names what a template site really has: its /a2a refuses until the site has chat (site-kit#338).
            "a2a": {"url": f"{origin}/a2a", "skills": [{"id": "read-the-site", "name": f"Read {brand_rec['name']}'s pages",
                                                      "description": f"There is no assistant here yet, so this endpoint refuses. The pages are at {origin}/llms.txt, and the read-only MCP at {origin}/mcp returns any one as Markdown.",
                                                      "tags": ["site"]}]},
            # A site's own skills (herdos#3873's agent-skills): each SKILL.md is read from the site's folder at build time.
            **({"skills": record["skills"]} if record.get("skills") else {})}


def agent_card(record, brand_rec, origin):
    return discovery.agent_card(discovery_config(record, brand_rec, origin))


def mcp_json(record, brand_rec, origin):
    return discovery.mcp_json(discovery_config(record, brand_rec, origin), contact(record, brand_rec))


def jsonld(record, page, brand_rec, origin, logo, body_html, family=None):
    """The page's JSON-LD blocks, one per concern, with stable @ids."""
    org = f"{origin}/#organization"
    crumbs = [{"@type": "ListItem", "position": 1, "name": brand_rec["name"], "item": f"{origin}/"}]
    if page["path"] != "/":
        crumbs.append({"@type": "ListItem", "position": 2, "name": page["title"], "item": origin + page["path"]})
    blocks = [{"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": crumbs}]
    if page["path"] == "/":
        blocks += [{"@context": "https://schema.org", "@type": "Organization", "@id": org, "name": brand_rec["name"],
                    "url": f"{origin}/", "logo": origin + logo, "description": record["why"],
                    **({"email": record["email"]} if record.get("email") else {})},
                   {"@context": "https://schema.org", "@type": "WebSite", "@id": f"{origin}/#website",
                    "name": brand_rec["name"], "url": f"{origin}/", "publisher": {"@id": org}}]
        if record.get("business"):
            blocks.append(business(record["business"], brand_rec, origin, logo, org))
        related = [s["url"] for s in (family or []) if not s.get("current")]
        if related:   # site-kit#428: the family's other sites, as the home page's related links
            blocks.append({"@context": "https://schema.org", "@type": "WebPage", "@id": f"{origin}/#webpage", "url": f"{origin}/",
                           "isPartOf": {"@id": f"{origin}/#website"}, "relatedLink": related})
    qa = re.findall(r"<summary>(.*?)</summary><p>(.*?)</p>", body_html, re.S)
    if qa:
        blocks.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": _text(q), "acceptedAnswer": {"@type": "Answer", "text": _text(a)}} for q, a in qa]})
    return blocks


def business(b, brand_rec, origin, logo, org):
    """site-kit#301: the record's business as one LocalBusiness block, under the Organization. Only the fields given."""
    addr = {"@type": "PostalAddress", **{k: b[k] for k in ("streetAddress", "addressLocality", "addressRegion", "postalCode",
                                                          "addressCountry") if k in b}}
    out = {"@context": "https://schema.org", "@type": b["@type"], "@id": f"{origin}/#business", "name": brand_rec["name"],
           "url": f"{origin}/", "image": origin + logo, "parentOrganization": {"@id": org}, "address": addr}
    if "telephone" in b:
        out["telephone"] = b["telephone"]
    if "areaServed" in b:
        out["areaServed"] = [{"@type": "City", "name": n} for n in b["areaServed"]]
    for k in ("sameAs", "openingHours"):
        if k in b:
            out[k] = list(b[k])
    return out


def script(data):
    """One ld+json block, written so no value can close the script element."""
    s = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return '<script type="application/ld+json">' + s.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026") + "</script>"


def files(record, brand_rec, origin, bodies, now=None, root=".", family=None):
    """{site path: text} for every agent-facing file; `bodies` is {page path: that page's static HTML of its sections}."""
    now = now or datetime.datetime.now(datetime.timezone.utc)
    twins = {p["path"]: twin(record, p, bodies[p["path"]], origin) for p in listed(record)}   # none for "index": false (#249)
    out = {"robots.txt": robots(origin, content_signal(record)), "sitemap.xml": sitemap(record, origin), "llms.txt": llms(record, brand_rec, origin, family),
           "llms-full.txt": llms_full(record, brand_rec, origin, twins, family),
           ".well-known/security.txt": security_txt(record, brand_rec, origin, now)}
    # The agent cards, the MCP server card, the api-catalog, ard.json and ai-catalog.json, through the one writer (site-kit#314).
    disc, _ = discovery.build(discovery_config(record, brand_rec, origin), root, contact(record, brand_rec))
    out.update({k: v.decode() for k, v in disc.items()})
    for path, md in twins.items():
        out[(path.strip("/") + "/index.md").lstrip("/")] = md
    return out
