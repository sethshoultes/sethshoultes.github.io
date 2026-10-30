# sethshoultes.com

![Seth Shoultes Profile](https://github.com/user-attachments/assets/3665e4c5-936f-4264-baa1-f8115540386a)

The source of [sethshoultes.com](https://sethshoultes.com): AI consulting for small businesses, from a product
leader with 25 years in WordPress. It is a static Jekyll site on GitHub Pages, with a few Cloudflare Workers
for the parts that need a server, and every page is written to be read by people and by AI agents alike.

## What's on the site

- **Services:** consulting, AI services, AI readiness, AI search optimization, SEO, Google Ads, web and WordPress
  development, field service software, and animation, artwork and video. Each service page has an animated
  hero scene.
- **Southern Utah:** city and neighborhood pages (St. George, Cedar City, Hurricane, Springdale, Washington City,
  Ivins and Santa Clara, Little Valley, Coral Canyon), built from data in `_data/cities/`.
- **Writing:** the blog (`_posts/`, served at `/blog/<slug>.html`), case studies, and the library of
  downloadable guides behind the newsletter.
- **Talk:** chat with Seth's AI, with answers cited from the blog and public brain notes, plus a phone slot and
  one contact form (`/talk/`, `/ask/`).
- **Free tools:** AI crawler access check, llms.txt generator, local business schema generator, local SEO
  quick audit, "does AI know your business", and an AI time-saved calculator (`/tools/`).
- **Projects and play:** the projects page, the arcade and typing games, Claude Academy, recipes and the lab.
  Standalone games are moving to their own `<slug>.adventurebuildr.com` sites (see `docs/DEPLOY.md`).
- **Meetup:** upcoming AI meetup events, refreshed daily.

## Built for AI agents too

- Every page has a **markdown twin** (`<page>-md.html`) with the same content as plain text.
- `llms.txt` and `llms-full.txt` list the site for language models, and `robots.txt` welcomes AI crawlers.
- `.well-known/mcp.json` advertises the site's agent endpoints.
- Pages carry schema.org markup, and **page types** (`_data/page-types.json`, explained in `docs/page-types.md`)
  set the required parts of each kind of page: city, service, post, hub. CI fails a page that is missing a part.

## How it's built

| Piece | Where | What it does |
| --- | --- | --- |
| Site | Jekyll (`github-pages` gem), `_layouts/`, `_includes/`, `assets/` | The static site, deployed by GitHub Pages from `main`. |
| Site kit | `assets/vendor/site-kit/`, `kit.json`, `kit.lock` | Shared CSS and JS, and the page-type check. |
| Ask and Talk | `workers/ask/` (Cloudflare Pages Functions, Gemini and Workers AI) | The site's AI chat and the readiness check, with cited answers. |
| Newsletter | `workers/news/` (D1 database, Resend) | Double opt-in sign-up, signed PDF links for the library, unsubscribe. |
| Tools API | `workers/tools/` (KV) | The server side of the free tools, at `tools-api.sethshoultes.com`. |
| Contact | `workers/contact/` | The contact form. |
| Daily blog | `scripts/daily_blog.py`, `ops/*.plist` | Drafts the daily post on Seth's Mac (launchd), plus a LinkedIn share. |

## Run it locally

```bash
bundle install
bundle exec jekyll serve      # http://localhost:4000
node --test tests/*.test.mjs  # Workers and checks (Node 20+, no install)
```

## Checks (CI)

`.github/workflows/check-source.yml` runs on every push and pull request:

- no inline styles (`scripts/check-inline-styles.sh`);
- a full Jekyll build;
- every link on the built site resolves (`scripts/check-links.mjs`);
- every YouTube embed is public and live (`scripts/check-youtube.mjs`).

Two other workflows run on their own: `meetup.yml` refreshes events daily, and `sync-rag.yml` adds new posts to
Seth's Clone knowledge base.

## Writing and adding pages

- **New page:** start from its page type (`docs/page-types.md`), never from a blank file. Add its markdown twin,
  its `llms.txt` line and its sitemap entry.
- **New post:** add it to `_posts/` with front matter. Future-dated posts publish (`future: true`).
- **Tests:** they live in `tests/`, and `tests/README.md` says which file covers what.
- **The voice:** plain words, for one person across the table. No AI disclaimers, and no burned-in subtitles
  on video.

## Contact

[sethshoultes.com/talk](https://sethshoultes.com/talk/)
