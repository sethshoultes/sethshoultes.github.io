"""The Super Intelligent family (site-kit#428): Seth's own product sites linking to each other. The one list is site-kit's
catalog/family.json, vendored by site_sync as .sitekit/family.json. A site turns it on with "family": true in layout.json's
footer: its footer gets a "Family" row, the site it is on is marked as current and not linked, its llms.txt names the
others, and its home page's JSON-LD lists them as related links. No site keeps its own copy. Standard library only."""
import json
import pathlib
import re

PATH = ".sitekit/family.json"
KEYS = {"name", "url", "purpose", "mark"}
ORIGIN = re.compile(r"https://[a-z0-9.-]+\.[a-z]{2,}/\Z")
HTTPS = re.compile(r"https://[a-z0-9.-]+\.[a-z]{2,}/[A-Za-z0-9._~/-]*\Z")


class FamilyError(Exception):
    pass


def problems(data):
    """What is wrong with a family list, or []: {"about": text, "sites": [2 to 20 of {"name", "url", "purpose", "mark"}]}."""
    if not isinstance(data, dict) or set(data) - {"about", "sites"} or not isinstance(data.get("sites"), list):
        return ['the family list is {"about": text, "sites": [entries]}']
    if not 2 <= len(data["sites"]) <= 20:
        return ["the family list holds 2 to 20 sites"]
    out, seen = [], set()
    for i, s in enumerate(data["sites"]):
        w = f"sites[{i}]"
        if not isinstance(s, dict) or set(s) != KEYS or not all(isinstance(s[k], str) for k in KEYS):
            out.append(f'{w}: an entry is exactly {{"name", "url", "purpose", "mark"}}, each text')
            continue
        if not s["name"].strip() or len(s["name"]) > 60 or "\n" in s["name"] or "<" in s["name"] or ">" in s["name"]:
            out.append(f"{w}: name is plain words on one line, at most 60 characters")
        if not ORIGIN.fullmatch(s["url"]):
            out.append(f"{w}: url is a site's home, https://host/ (lowercase, with the trailing slash)")
        elif s["url"] in seen:
            out.append(f"{w}: {s['url']} is listed twice")
        seen.add(s["url"])
        if not s["purpose"].strip() or len(s["purpose"]) > 120 or "\n" in s["purpose"] or "<" in s["purpose"] or ">" in s["purpose"]:
            out.append(f"{w}: purpose is one plain line, at most 120 characters")
        if not HTTPS.fullmatch(s["mark"]):
            out.append(f"{w}: mark is an https:// address of the site's mark image")
    return out


def load(root="."):
    """The checked family list from the site's .sitekit/family.json. FamilyError when it is missing or wrong."""
    p = pathlib.Path(root) / PATH
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise FamilyError(f'footer.family is on but {PATH} is missing: run site_sync.py sync') from None
    except ValueError as e:
        raise FamilyError(f"{PATH} is not JSON ({e})") from None
    found = problems(data)
    if found:
        raise FamilyError(f"{PATH}: " + "; ".join(found))
    return data["sites"]


def marked(sites, origin):
    """The family as this site shows it: each entry with "current" true for the site at `origin`, which the footer marks
    and doesn't link. A site that isn't in the list sees every entry linked."""
    home = origin.rstrip("/") + "/"
    return [dict(s, current=(s["url"] == home)) for s in sites]

