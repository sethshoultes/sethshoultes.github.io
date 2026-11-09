# doc: a page that answers the questions a person asks about a product

A shared page type (superintelligentfoo#126). This README is its one definition: every site that uses `doc` builds its pages from
the fields below and is checked by `page-types.json` next to it. The kit renders nothing; each site's own build renders its doc
pages and its `/docs/` index.

## Fields

Entries in the site's `data/types.json` shape (as S'mores declares its types; a name ending in `?` is optional):

```json
"doc": {
  "template": "doc.html",
  "nav": "docs",
  "parts": {
    "slug": "new-slug",
    "title": "text",
    "description": "text",
    "updated": "date",
    "order": "number",
    "status": "status",
    "body": "sections",
    "related?": "slugs",
    "faq?": "faqs"
  },
  "min": { "body": 1 }
}
```

- `slug`: the page lives at `/docs/<slug>/`; lower-case letters, digits and hyphens.
- `title`: the page's one heading.
- `description`: the one line the `/docs/` index shows under the title.
- `updated`: the date the page's facts were last checked, `YYYY-MM-DD`.
- `order`: a whole number; the index lists docs from the lowest up.
- `status`: `draft` or `published`. A draft is never built.
- `body`: one or more sections, each headed by a question a person asks ("Who can read my feedback?"), answered below it.
- `related` (optional): the slugs of other docs, linked at the end of the page.
- `faq` (optional): question and answer pairs; when there is one, it is the last section in `<main>`.

The part kinds (`new-slug`, `text`, `date`, `number`, `status`, `sections`, `slugs`, `faqs`) are the site build's own checks.
Those field checks run in the site, so the kit cannot enforce them.

## The page

Each doc page is built at `/docs/<slug>/` with `<body data-page-type="doc">`, and it has:

- its markdown twin at `/docs/<slug>.md`;
- a line in `llms.txt` and in `sitemap.xml`;
- a link from the `/docs/` index.

`page-types.json` checks these parts with `check/page-types.mjs` (kit-check's `"pageTypes"`). A page under `/docs/<slug>/` that
does not declare `data-page-type="doc"` fails too, which catches a page made by hand.

## The /docs/ index

`/docs/` lists the published docs only, sorted by `order`. Each entry is the doc's title, linked to `/docs/<slug>/`, then its
`description`. Drafts are left out. The check confirms that the index links every built doc. The kit does not check the sort
order or the description lines, so the site's own build tests them.

## Adopting it

1. The site-kit owner adds `"doc"` to the site's `page_types` in `catalog/sites.json` and regenerates the catalog. Once a second
   site lists it, the catalog shows `doc` as shared.
2. The site re-syncs the reuse-first check at that site-kit tag (`site_sync.py sync <tag>`), so its vendored `catalog.json` lists `doc`
   for it. In `.sitekit/features.json` it sets `page_types_file` to the file holding its types (`data/types.json`), and puts the
   `doc` entry above in that file. `doc` is in the catalog, so the site does not list it under `site_only`.
3. Its build renders the doc pages and the index from those fields. If the site runs kit-check, it merges `types.doc` from
   `page-types.json` into its own page-type spec and points `reference` at one of its published docs.
