# sethshoultes.com: rules for Claude

## Reuse first (site-kit#6)

Seth (2026-11-05): "the rules would tell the builder what plugins and hooks are available and always use these instead of building new ones, if it has a new type of content or features, they should be reviewed prior to building to see if they fit as a reusable hook or plugin."

- **Check site-kit's catalog first:** `CATALOG.md` in sethshoultes/site-kit. If something there does the job, vendor it and configure it, as `assets/vendor/site-kit/` already holds the kit's CSS, JS and checks. Never copy its code or build a second version.
- **Anything new** (a content type, a feature, a hook) that another of Seth's sites could use starts as a "Plugin proposal" issue in sethshoultes/site-kit, before any code. The site-kit owner (site-dev) rules within the day.
- This repo doesn't run site-kit's `site-check` yet, so no CI enforces the rule here. The rule still applies.
