# sitemap-check

A build check for a site that deploys a built folder to Cloudflare Pages (site-kit#262, herdos#3769). Every URL the
sitemap lists must be one Pages serves as listed, with a 200 and no noindex. A search engine that meets a redirect, a
noindex page or a 404 in a sitemap drops the URL and trusts the sitemap less.

`scripts/sitemap-check.mjs` reads `<dir>/sitemap.xml`, or `<dir>/sitemap-index.xml` when there is none. When the file
it reads is a sitemap index (`<sitemapindex>`), it reads each child sitemap the index names, from the built folder. Each `<loc>` (XML entities and percent-encoding decoded) is resolved the way
Pages serves the folder:

| URL | Passes when | Fails with |
| --- | --- | --- |
| another origin | never | `other origin` |
| `/` | `index.html` exists | `missing` |
| `/a/` | `a/index.html` exists | `redirects (Pages serves /a)` when only `a.html` exists, else `missing` |
| `/a` (no extension) | `a.html` exists | `redirects to /a/` when only `a/index.html` exists, else `missing` |
| `/a.html`, `/a/index.html` | never | `redirects to the clean URL` |
| `/a.pdf` (any other extension) | the file exists | `missing` |
| a source in `_redirects`, with or without a trailing slash (`*` matches any rest of the path, an empty one too; `:name` one segment). A `200` rule is a rewrite and is skipped | never | `redirect rule` |
| an HTML page with `<meta name="robots">` or `<meta name="googlebot">` whose content holds `noindex` or `none` (either attribute order, any case) | never | `noindex` |

A child sitemap on another origin, or one not in the folder, fails the same way (`other origin`, `missing`). No sitemap,
or a sitemap with no URLs, fails too.

Not modelled: Pages Functions routes (`functions/`, `_routes.json`) and `_headers`, so an `X-Robots-Tag: noindex` header
or a Function that answers a listed URL is not seen.

It prints one line per problem, `<url>: <reason>`, and exits 1. On success it prints one line,
`sitemap-check: <n> URLs, each served as listed`, and exits 0. Plain Node, no dependencies, no network.

## Turning it on in a site

1. From the site's repo root, run `<kit>/scripts/plugin-sync.sh sitemap-check <tag>`.
2. Run it after the build, in the site's build script or CI, so a failure stops the deploy:
   ```bash
   node plugins/sitemap-check/scripts/sitemap-check.mjs _site --origin https://example.com   # Jekyll
   node plugins/sitemap-check/scripts/sitemap-check.mjs dist --origin https://example.com    # Astro
   ```
   `--origin` is the site's canonical origin, the one its sitemap uses (a trailing slash is ignored).
3. List `sitemap-check` in `.sitekit/features.json` with the issue number.

## What a site sets

Nothing: no binding, no variable and no secret. The built folder and `--origin` are its only inputs.

## Testing

```bash
node --test plugins/sitemap-check/tests/*.test.js
```

Each rule has a passing and a failing case, on a built folder made in a temp dir, plus the sitemap-index path and the
CLI's output and exit codes.
