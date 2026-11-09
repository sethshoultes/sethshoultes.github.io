# comic: a story told in panels

A shared page type (site-kit#163). This README is its one definition: every site that uses `comic` builds its comics from the
fields below and is checked by `page-types.json` next to it. The kit renders nothing; each site's own build renders its comic
pages and its `/comics/` index. The first is Superintelligent Foo's "Foo and the $12,000 Website" (superintelligentfoo#149).

## Fields

Entries in the site's `data/types.json` shape (a name ending in `?` is optional):

```json
"comic": {
  "template": "comic.html",
  "nav": "comics",
  "parts": {
    "slug": "new-slug",
    "title": "text",
    "description": "text",
    "date": "date",
    "status": "status",
    "characters?": "texts",
    "panels": "panels",
    "video?": "video"
  },
  "min": { "panels": 1 }
}
```

- `slug`: the comic lives at `/comics/<slug>/`; lower-case letters, digits and hyphens.
- `title`: the comic's one heading.
- `description`: one line, shown under the title on `/comics/` and used as the page's description.
- `date`: the day it was first published, `YYYY-MM-DD`.
- `status`: `draft` or `published`. A draft is never built.
- `characters` (optional): the names of the people in it, shown under the title (for example `["Foo", "Bar", "Dana"]`).
- `panels`: one or more, in reading order. Each panel is `{"image": "<path>", "image_alt": "<words>", "caption": "<words>"}`,
  and all three are required:
  - `image`: the path of the panel's picture inside the site (no scheme, no leading `//`, no `..`).
  - `image_alt`: what the picture shows, for a reader who can't see it. It describes the picture; it does not repeat the
    caption.
  - `caption`: the panel's text, shown under it. When the art carries no lettering, the captions are the comic's only words.

- `video` (optional): the comic told as a short film, `{"file": "<path>.mp4", "captions": "<path>.vtt", "poster": "<path>"}`, all
  three required and all paths inside the site:
  - `file`: an H.264/AAC `.mp4` sized for the page (a 720p copy, not the master), with its index at the front so it streams;
  - `captions`: a WebVTT file of every spoken line. Captions are a track the viewer turns on, never burned into the picture;
  - `poster`: the still shown before it plays, the same aspect as the video.

The part kinds (`new-slug`, `text`, `date`, `status`, `texts`, `panels`, `video`) are the site build's own checks. Those field checks run
in the site, so the kit cannot enforce them.

## The page

Each comic is built at `/comics/<slug>/` with `<body data-page-type="comic">`, and it has:

- the title, the description, and the characters' names if any;
- with a `video`, a `<video controls preload="metadata" poster width height>` above the panels, holding a `<source
  type="video/mp4">` and a `<track kind="captions" srclang="en" label="English" default>`. It never autoplays;
- the panels in order, each a `<figure>` holding its `<img src alt>` (with `width` and `height`, so the page doesn't jump) and
  a `<figcaption>` with the caption;
- a `ComicStory` in its JSON-LD graph, with `headline`, `datePublished`, `description` and each panel as a `hasPart`
  `ImageObject` (its `contentUrl`, `caption` and `description` from `image_alt`), and with a `video` a `VideoObject` in the
  same graph (`name`, `description`, `contentUrl`, `thumbnailUrl` from the poster, `uploadDate`);
- its markdown twin at `/comics/<slug>.md`: the title, then each panel's caption and its alt text, in order, and with a
  `video` its spoken lines from the captions file as a transcript;
- a line in `llms.txt` and in `sitemap.xml`;
- a link from the `/comics/` index.

`page-types.json` checks these parts with `check/page-types.mjs` (kit-check's `"pageTypes"`). The `panel` part needs at least one
complete panel; three bans then hold every panel to it: any `<img>` in a `<figure>` without a non-empty `alt`, any `<figure>` without a
`<figcaption>`, and any empty `<figcaption>`. A fourth refuses a `<video>` without a `<track kind="captions" src="...">`. Both are read as real attributes of the track, so
`data-kind="captions"`, a `kind=` or `src=` quoted inside another attribute's value, and a captions track with no file all fail
(maint-review-2 and game-dev-3 on #176). So no panel ships without its picture's words and its caption (game-dev-3 on
#164). The `width` and `height` are the site build's to check. A page under `/comics/<slug>/` that does not
declare `data-page-type="comic"` fails too, which catches a page made by hand.

What the checks read, so a site's markup fits them:
- `alt` is read as a double-quoted attribute in any position. `alt=""` or `alt=" "` is refused wherever it sits in the tag.
  An unquoted or single-quoted `alt` is refused too, so write it double-quoted.
- In a panel, the `<img>` comes before the `<figcaption>`.
- A caption may open with markup (`<strong>Bar:</strong> Twelve thousand!`). A caption made only of tags and spaces counts as
  empty. `&nbsp;` counts as words, so the site build refuses a blank caption before it is written.
- The alt ban covers every `<img>` inside a `<figure>`. A decorative picture outside the panels (a header wordmark beside a
  badge that carries the name) may carry `alt=""`, as accessible markup should (game-dev-3 on Foo#225).
- These are regular expressions over the page's HTML, not a parser. A well-formed page is checked at once (132 KB in under
  1 ms). A page with an unclosed `<figure>` still fails, but its time grows with the square of its length: 0.25 s at 54 KB
  and 25 s at 540 KB, measured on v0.44.0's expressions.

## The /comics/ index

`/comics/` lists the published comics, newest first: each title linked to `/comics/<slug>/`, its date, its `description` and
its first panel as a small picture with that panel's alt text. Drafts are left out. The check confirms the index links every
built comic; the order is the site build's to test.

## Adopting it

1. The site-kit owner lists `"comic"` in the site's `page_types` in `catalog/sites.json` and regenerates the catalog.
2. The site re-syncs at that tag (`site_sync.py sync <tag>`). In `.sitekit/features.json`, `page_types_file` names the file
   holding its types, and that file gets the `comic` entry above.
3. Its build renders the comic pages and the index from those fields. If the site runs kit-check, it merges `types.comic` from
   `page-types.json` into its own page-type spec and points `reference` at its `/comics/`.
