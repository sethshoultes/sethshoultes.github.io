# Deploying standalone games off this site

arcade epic #41: several typing/arcade games live as single pages (or small
asset sets) inside this Jekyll repo, under `sethshoultes.com/<path>`. Each one
is being moved to its own subdomain on `hetzner-sites` — `<slug>.adventurebuildr.com`
— as a plain static site, off Jekyll and off this domain.

This covers the repo-side half only: build config and the shared deploy
script. The box side (nginx vhost, DNS, cert, first sync) is the arcade
lead's, per game.

## Shared deploy script

**One script for every game here**: `scripts/deploy-game.sh <slug> <source-path>`.
Do not write a second near-identical script for the next game — extend this
one's build step if a future game needs something this one doesn't (e.g. a
directory of assets instead of a single file).

```bash
scripts/deploy-game.sh typerunner typing-games/typerunner.html
```

- `slug` — short name. Becomes `build/<slug>/` locally and, by default, the
  CloudPanel site-user + domain: `/home/<slug>/htdocs/<slug>.adventurebuildr.com`.
  Override with `GAME_DEPLOY_PATH` if a game's slug doesn't match its
  site-user/domain 1:1.
- `source-path` — path (relative to repo root) to the game's file or
  directory.

**Build step**: no Jekyll processing. A source file becomes
`build/<slug>/index.html`; a source directory is copied whole into
`build/<slug>/` (and must already contain its own `index.html`). `build/` is
gitignored — it's regenerated from `source-path` every run, never committed.

This dev has no ssh access and doesn't run this script itself; the arcade
lead does, after the box side (nginx vhost, DNS, cert, first sync) is ready.
Reads `$HOME/.config/dev-secrets/arcade/secrets.env` if present, same as
every other arcade game's deploy script.

## Per-game notes

### Typewrunner (arcade#44)

Source: `typing-games/typerunner.html`, one self-contained HTML file — inline
`<style>`, one inline `<script>` (game logic + WASD movement + Canvas
rendering), no `<link>`/`<img>`/external `src=` of any kind, no CDN. Confirmed
by grepping the file for `src=`, `href=`, `url(`, `fetch(`, `import` — zero
matches outside the one inline `<script>` tag itself. Game state (high
scores, settings) is `localStorage`, client-side only — nothing server-side
to replicate.

**No Jekyll front matter** — the file starts directly with `<!DOCTYPE html>`,
no `---` block, so Jekyll would have copied it byte-for-byte anyway; this
confirms it's safe to lift out and serve standalone with zero translation.

Build:

```bash
scripts/deploy-game.sh typerunner typing-games/typerunner.html
```

produces `build/typerunner/index.html` — the whole servable root, one file.

Target: `/home/typerunner/htdocs/typerunner.adventurebuildr.com` (CloudPanel
layout, given directly for arcade#44 — matches this script's default for
slug `typerunner`, no override needed).
