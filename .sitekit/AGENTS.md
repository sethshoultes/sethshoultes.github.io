# How to work on this site

These are the rules every site-kit site shares (site-kit#484). Any agent working in this repo follows them: Claude Code,
Codex, Cursor or another. `site_sync.py` vendors this file as `.sitekit/AGENTS.md`, so edit it in site-kit, never here.
The site's own notes go in the `AGENTS.md` at the repo root.

## Before you change anything

1. **Read the site's brain.**
   - `SOUL.md`: what the site is, who it's for and how it should feel.
   - The style guide: how the site sounds. Its path is `style_guide` in `.sitekit/features.json`.
   - The newest files in `.agent/memory/`: what changed lately, and the decisions behind it.
2. **Follow it.** If a request goes against the soul or the style guide, say so before you change anything.

## After you make a decision

A merged pull request writes its own one-line memory, so you do nothing for a plain change. A decision also needs its
**why**: a ruling from the owner, a choice between two ways, or a "never do X on this site". Add one file in the same pull
request, `.agent/memory/<YYYY-MM>/<YYYY-MM-DD>-<HHMM>-<8 hex>.md`, with one line saying what was decided and why. The
8 hex must be lowercase. Through the site agent, `remember` does the same.

## What not to edit here

- `.sitekit/`, `skills/` and any plugin folder named in `plugins.lock` are site-kit's. `site_sync.py verify` fails a hand
  edit. Change them in site-kit and sync.
- Before you build something new (a content type, a feature, a hook), check site-kit's `CATALOG.md`. If it isn't there and
  another site could use it, propose it on sethshoultes/site-kit first.

The full process is in site-kit's `docs/site-memory.md`.
