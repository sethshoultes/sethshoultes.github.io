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

### Speed Typing Adventure (arcade#45)

Source: `advanced-typing-games/typing-games-v1/` (`index.html` + `config/`,
`css/`, `js/`) — a directory target, not a single file. This required
identifying which file in the repo actually *is* "Speed Typing Adventure"
first: the page live at `sethshoultes.com/typing-games/index.html` named in
the issue turned out to be a generic games-listing page with dead `href="#"`
links, not the game itself, and the homepage's own "Speed Typing Adventure"
card points off-repo to `adventurebuildr.com/arcade/typing-game.html`. The
arcade lead identified `typing-games-v1` as the best content match (WASD
movement + word-typing, matches the card's description) — flagged as an
inference, not a confirmed name, in case Seth says otherwise later.

**No Jekyll front matter** — `index.html` starts directly with
`<!DOCTYPE html>`. All CSS/JS is loaded by relative path
(`css/main.css`, `js/core/game.js`, etc.) and `config/*.json` is loaded by
relative `fetch()` calls (`js/utils/config-loader.js`,
`js/utils/resource-manager.js`) — no CDN, no absolute paths, confirmed by
grepping the whole directory for `https?://` and `cdn.`. Self-contained,
safe to copy the directory as-is.

Verified locally with a static file server (`python3 -m http.server`,
127.0.0.1 only, no deploy script run) rather than assumed:

- `index.html` and a sample `config/games/default.json` both served 200.
- **Found a real bug, not fixed here** (out of scope for this branch —
  repo-side hosting changes stay confined to `scripts/` and `docs/`):
  `index.html` loads `js/core/particle-system.js`, which 404s — the actual
  file on disk is `js/core/particles-system.js` (has an `s`). `game.js`
  calls `new ParticleSystem(...)` during init (line 44) and uses it every
  frame after, so the missing script very likely throws
  `ReferenceError: ParticleSystem is not defined` and breaks the game on
  load, not just the particle effects. Needs a one-line fix
  (`particle-system.js` → `particles-system.js` in `index.html`) in a
  follow-up issue before this is truly playable at the new subdomain.
- Also noticed: `js/utils/audio-manager.js` references `assets/sounds/*.mp3`
  files that don't exist anywhere in `typing-games-v1/`. This one **is**
  handled gracefully — `AudioManager.init()` wraps the loads in
  try/catch and only `console.warn`s — so it degrades to no sound effects
  rather than crashing. Matches `advanced-typing-games/PROJECT-SPEC.md`,
  which lists the sound system as "⏳ Pending Implementation."

Build — a directory source, so this uses the shared script's existing
multi-file/directory-copy path (`cp -R "$SOURCE"/. "$BUILD_DIR"/`); no
script changes were needed:

```bash
GAME_DEPLOY_PATH=/home/speedtyping/htdocs/speed-typing.adventurebuildr.com \
  scripts/deploy-game.sh speedtyping advanced-typing-games/typing-games-v1
```

produces `build/speedtyping/` — `index.html`, `config/`, `css/`, `js/`
copied whole, the servable root.

Target: `/home/speedtyping/htdocs/speed-typing.adventurebuildr.com` — an
explicit `GAME_DEPLOY_PATH` override, since the domain has a hyphen
(`speed-typing`) but the CloudPanel site-user given in the issue doesn't
(`speedtyping`); the script's default (`$SLUG.adventurebuildr.com`) can't
produce both from one slug.
