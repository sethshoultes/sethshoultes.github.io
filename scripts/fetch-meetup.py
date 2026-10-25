#!/usr/bin/env python3
"""Write _data/meetup.json from the public Meetup group page.

Meetup's RSS feed is empty and its API needs a key, so this reads the events
the group page itself embeds. It fails loudly if that structure changes, so
the site never shows invented or stale-looking dates.
"""
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone

GROUP = "southern-utah-wordpress-meetup"
URL = f"https://www.meetup.com/{GROUP}/events/"


def fetch_events():
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        sys.exit("meetup page has no __NEXT_DATA__; its structure changed")
    state = json.loads(m.group(1))["props"]["pageProps"]["__APOLLO_STATE__"]
    events = [v for k, v in state.items() if k.startswith("Event:")]
    if not events:
        sys.exit("meetup page lists no events at all; refusing to write an empty file")
    return events


def main():
    now = datetime.now(timezone.utc)
    upcoming, past = [], []
    for e in fetch_events():
        if e.get("status") == "CANCELLED":
            continue
        url = e.get("eventUrl", "")
        if not url.startswith(f"https://www.meetup.com/{GROUP}/events/"):
            continue  # only this group's own event pages
        try:
            when = datetime.fromisoformat(e["dateTime"])
        except (KeyError, ValueError):
            continue
        item = {"title": e["title"].strip(), "date": e["dateTime"], "url": url}
        (upcoming if when > now and e.get("status") != "PAST" else past).append(item)
    upcoming.sort(key=lambda i: i["date"])
    past.sort(key=lambda i: i["date"], reverse=True)
    out = {"group_url": f"https://www.meetup.com/{GROUP}/", "upcoming": upcoming, "past": past}
    with open("_data/meetup.json", "w") as f:
        json.dump(out, f, indent=2)
        f.write("\n")
    print(f"{len(upcoming)} upcoming, {len(past)} past")


main()
