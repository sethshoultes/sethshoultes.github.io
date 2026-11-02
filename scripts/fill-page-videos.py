#!/usr/bin/env python3
"""Fill _data/page_videos.json from the YouTube ids the video pane writes.

Reads video-ids.tsv (slug, youtube-id, page-url; a header row and extra columns are fine), then for each slug takes the
title and description from <media>/<slug>/{title,description}.txt, the duration from the mp4 named in README.txt, and the
poster from YouTube (i.ytimg.com), saved as a self-hosted 1280x720 WebP. Run from the repo root:
  scripts/fill-page-videos.py [video-ids.tsv]
"""
import csv, json, re, subprocess, sys, urllib.request, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
MEDIA = pathlib.Path("/Users/sethshoultes/work/page-video-scores-20261031/youtube")
TSV = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else MEDIA / "video-ids.tsv"
OUT = ROOT / "_data" / "page_videos.json"
IMG = ROOT / "assets" / "img" / "videos"


def iso_duration(path):
    secs = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], text=True))
    s = round(secs)
    return f"PT{s // 60}M{s % 60}S"


# Pages whose YouTube auto frame says the wrong thing: take a chosen frame from the mp4 instead (seconds, or a fraction of the length).
FRAMES = {"ai-search-optimization": 0.35, "hurricane-utah": 1.5, "learn-ai": 0.35}


def frame_poster(slug, vid, mp4, at):
    IMG.mkdir(parents=True, exist_ok=True)
    secs = at if at >= 1 else at * float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4], text=True))
    subprocess.check_call(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(secs), "-i", mp4, "-frames:v", "1", "-vf", "scale=1280:720", str(IMG / f"{vid}.jpg")])
    subprocess.check_call(["convert", str(IMG / f"{vid}.jpg"), "-quality", "82", str(IMG / f"{vid}.webp")])
    (IMG / f"{vid}.jpg").unlink()


def poster(vid):
    IMG.mkdir(parents=True, exist_ok=True)
    for name in ("maxresdefault", "hqdefault"):
        try:
            data = urllib.request.urlopen(f"https://i.ytimg.com/vi/{vid}/{name}.jpg", timeout=30).read()
            break
        except Exception:
            data = None
    if not data:
        raise SystemExit(f"no thumbnail for {vid}")
    tmp = IMG / f"{vid}.jpg"
    tmp.write_bytes(data)
    subprocess.check_call(["convert", str(tmp), "-resize", "1280x720^", "-gravity", "center", "-extent", "1280x720", "-quality", "80", str(IMG / f"{vid}.webp")])
    tmp.unlink()


def upload_date(vid):
    """The date YouTube itself reports for the video (ISO 8601 with offset)."""
    html = urllib.request.urlopen(urllib.request.Request(f"https://www.youtube.com/watch?v={vid}", headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read().decode("utf-8", "replace")
    m = re.search(r'itemprop="uploadDate" content="([^"]+)"', html)
    if not m:
        raise SystemExit(f"no upload date for {vid}")
    return m.group(1)


def main():
    data = json.loads(OUT.read_text()) if OUT.exists() else {}
    for row in csv.reader(TSV.open(), delimiter="\t"):
        if len(row) < 2 or not re.fullmatch(r"[\w-]{11}", row[1].strip()):
            continue  # header or an id that has not landed yet
        slug, vid = row[0].strip(), row[1].strip()
        d = MEDIA / slug
        mp4 = re.search(r"Video file: (.+\.mp4)", (d / "README.txt").read_text()).group(1)
        desc = (d / "description.txt").read_text().split("\n\nChapters")[0].strip()
        if len(desc.split("\n\n")[0]) < 40:  # the city descriptions are chapter lists; use the page's own description
            page = (ROOT / slug / "index.html").read_text()
            desc = re.search(r'^description: "(.*)"$', page, re.M).group(1) + "\n\nThe page: https://sethshoultes.com/" + slug + "/"
        old = data.get(slug, {})
        data[slug] = {
            "id": vid,
            "title": (d / "title.txt").read_text().strip().split(" | ")[0],
            "description": desc,
            "duration": iso_duration(mp4),
            "uploadDate": old.get("uploadDate") or upload_date(vid),
        }
        if slug in FRAMES:
            frame_poster(slug, vid, mp4, FRAMES[slug])
        elif not (IMG / f"{vid}.webp").exists() or "--refresh" in sys.argv:
            poster(vid)
        print("filled", slug, vid)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


main()
