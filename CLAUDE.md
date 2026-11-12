# sethshoultes.com: rules for Claude

## Reuse first (site-kit#6)

Seth (2026-11-05): "the rules would tell the builder what plugins and hooks are available and always use these instead of building new ones, if it has a new type of content or features, they should be reviewed prior to building to see if they fit as a reusable hook or plugin."

- **Check site-kit's catalog first:** `CATALOG.md` in sethshoultes/site-kit. If something there does the job, vendor it and configure it, as `assets/vendor/site-kit/` already holds the kit's CSS, JS and checks. Never copy its code or build a second version.
- **Anything new** (a content type, a feature, a hook) that another of Seth's sites could use starts as a "Plugin proposal" issue in sethshoultes/site-kit, before any code. The site-kit owner (site-dev) rules within the day.
- CI enforces it: the `site-check` workflow runs site-kit's reuse-first check (`.sitekit/`, vendored by `site_sync.py sync <tag>`). A plugin folder must match the catalog, and a function must be approved in site-kit's `catalog/sites.json`. Never switch the check off; a new feature starts as a proposal.
