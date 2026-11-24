# post: a blog post, written by one of the site's writers

A shared page type (site-kit#153). This README is its one definition: every site that uses `post` builds its posts from the
fields below and is checked by `page-types.json` next to it. site-templates renders it for sites built from a layout; a site
with its own build renders its own posts, `/blog/` index and feed (site-kit#321). Posts are written with the `blog-writer`
skill, by the writers in the site's own roster.

## Fields

Entries in the site's `data/types.json` shape (a name ending in `?` is optional):

```json
"post": {
  "template": "post.html",
  "nav": "blog",
  "parts": {
    "slug": "new-slug",
    "title": "text",
    "description": "text",
    "date": "date",
    "updated?": "date",
    "author": "writer",
    "status": "status",
    "body": "texts",
    "image?": "image",
    "image_alt?": "text",
    "slides?": "slides"
  },
  "min": { "body": 1 }
}
```

- `slug`: the post lives at `/blog/<slug>/`; lower-case letters, digits and hyphens.
- `title`: the post's one heading.
- `description`: one line, shown under the title on `/blog/` and used as the feed entry's summary.
- `date`: the day it was first published, `YYYY-MM-DD`. `updated` (optional): the day its facts were last changed.
- `author`: a writer's `id` from the site's roster (`data/writers.json`, written for the `blog-writer` skill). The site's build
  refuses an id the roster doesn't have.
- `status`: `draft` or `published`. A draft is never built.
- `body`: one or more paragraphs or sections. A line that starts `## ` is a section heading, not a paragraph, and is plain words with no tags or links (site-kit#679).
- `image`: the post's featured image, the path of a picture inside the site (no scheme, no leading `//`, no `..`), shown at
  the top of the post and used as the `BlogPosting`'s `image` and the page's `og:image`. **Every post has one, unless the site
  turns featured images off** (site-kit#214, Seth: "posts always need a featured image unless the site has them turned off"):
  `"post_images": false` in the site's `.sitekit/features.json`. It's on by default. With it on, the `blog-writer` skill makes
  the picture in the site's own image style, its gate refuses a post without one, `site_check` fails a post in `data/blog.json`
  without one, and `page-types.json`'s `image` part fails a post page whose `BlogPosting` image, `og:image` and picture on the
  page are not one image. The field stays `image?` in the shape above only because a site with images off leaves it out.
- `image_alt`: the words that describe the picture, for a reader who can't see it. A published post with an `image` must
  have one; the site's build refuses it otherwise, as S'mores' build does for its own pages (`part "image" needs
  "image_alt"`). A purely decorative picture has no place on a post, so there is no empty alt.

- `slides` (optional, site-kit#679): a numbered strip of pictures with words, for a post that walks through steps.
  `{"title": "How it works, in five steps", "after": 4, "items": [{"image", "image_alt", "title", "text"}, ...]}`: `after` is
  how many body lines, paragraphs and `## ` headings alike, come before it (0 puts it first), 2 to 8 items, each picture a path inside the site with its
  `image_alt`, a one-line `title` and a one-line `text` of 200 characters or fewer. It is shown as an ordered list under its
  own heading, and the markdown twin lists the steps in order with each picture's words. Its words are published text, so
  blog-writer's gate holds them to the same deny-list, authorship-label and price checks as the body.

The part kinds (`new-slug`, `text`, `date`, `writer`, `status`, `texts`, `image`, `slides`) and the `image_alt` rule are the site build's own checks. Those field
checks run in the site's build. For a site built from a layout that build is site-templates' `build.py`, which stops on an
author not in `data/writers.json`, a bad slug, a published image without `image_alt`, and a post without an image while
`post_images` is on.

## The page

Each post is built at `/blog/<slug>/` with `<body data-page-type="post">`, and it has:

- a byline naming its writer, linked to the writer's bio;
- a `BlogPosting` in its JSON-LD graph, with `headline`, `datePublished`, `dateModified` (the `updated` date, else `date`) and
  `author` as a `Person` (the writer's name and bio page);
- `<link rel="alternate" type="application/atom+xml" href="/blog/feed.xml">` in its `<head>`;
- its markdown twin at `/blog/<slug>.md`;
- a line in `llms.txt` and in `sitemap.xml`;
- a link from the `/blog/` index, and an entry in the feed.

`page-types.json` checks these parts with `check/page-types.mjs` (kit-check's `"pageTypes"`). A page under `/blog/<slug>/` that
does not declare `data-page-type="post"` fails too, which catches a page made by hand. The byline and the Person are the site
standard's to check.

## The /blog/ index and the feed

`/blog/` lists the published posts, newest first: each title linked to `/blog/<slug>/`, then its date, writer and
`description`. It names the feed with the same `<link rel="alternate">`.

`/blog/feed.xml` is an Atom 1.0 feed of the same posts, newest first. The feed has a `<title>`, an `<id>` and a
`<link rel="self">` with the site's address, and `<updated>` set to its newest entry. Each `<entry>` has:

- `<title>`;
- `<link href="<site>/blog/<slug>/"/>` (the check looks for exactly this address);
- `<id>`, the same address;
- `<updated>`;
- `<summary>`, the `description`;
- `<author><name>`, the writer's byline name.

Drafts are left out of both. The check confirms that the index links every built post and that an `<entry>` in the feed links it (an address on the feed's own `<link rel="self">` doesn't count).
The kit does not check the order, so the site's own build tests it.

## Adopting it

1. The site-kit owner lists `"post"` in the site's `page_types` in `catalog/sites.json` and regenerates the catalog.
2. The site re-syncs at that tag (`site_sync.py sync <tag>`, with `--skills=blog-writer` once that skill is released). In
   `.sitekit/features.json`, `page_types_file` names the file holding its types, and that file gets the `post` entry above.
   `post` is in the catalog, so the site does not list it under `site_only`.
3. Its build renders the posts, the index and the feed from those fields (site-templates does it for a layout-built site,
   with `--root` at the site's folder and the featured images in `--assets`). If the site runs kit-check, it merges `types.post`
   from `page-types.json` into its own page-type spec and points `reference` at its `/blog/`.
