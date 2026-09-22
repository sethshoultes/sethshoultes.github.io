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

### Typing Invaders (arcade#46)

Source: `typing-games/typinginvaders.html`, one self-contained HTML file —
inline `<style>`, one inline `<script>` (game logic + Canvas rendering).
Grepping the file for `src=`, `href=`, `url(`, `fetch(`, `import`, `cdn.`,
`https?://` returns **zero matches** — no external assets or CDN calls of
any kind, not even the file's own `<style>`/`<script>` tag attributes.
Two `localStorage` reads/writes for high-score state, client-side only.

**No Jekyll front matter** — confirmed via `od -c` on the first bytes: the
file starts directly with `<!DOCTYPE html>`, no `---` block.

Fixed: the source file was missing `<meta charset="UTF-8">` in `<head>`,
which rendered the HUD's "♥" lives indicator as "â™¥" mojibake. Added the
tag directly to `typing-games/typinginvaders.html` (typo-class, visible to
players) and re-verified.

Build — no script changes needed, same single-file path as Typewrunner:

```bash
scripts/deploy-game.sh typinginvaders typing-games/typinginvaders.html
```

produces `build/typinginvaders/index.html` — the whole servable root, one
file.

Local verification: served `build/typinginvaders/` from a local static
server and loaded it with headless Playwright (chromium) — zero console
errors, zero page errors. HUD (Score/Lives/Level/Active) rendered correctly,
including the fixed "♥♥♥" lives indicator (was "â™¥â™¥â™¥" before the charset
fix above; re-checked post-fix and confirmed clean).

Target: `/home/typinginvaders/htdocs/typing-invaders.adventurebuildr.com`.
Site-user `typinginvaders` has no hyphen but the domain
`typing-invaders.adventurebuildr.com` does, so the script's default
`$SLUG.adventurebuildr.com` formula can't produce both from one slug —
needs the `GAME_DEPLOY_PATH` override, same as Speed Typing Adventure:

```bash
GAME_DEPLOY_PATH=/home/typinginvaders/htdocs/typing-invaders.adventurebuildr.com \
  scripts/deploy-game.sh typinginvaders typing-games/typinginvaders.html
```

### AI Typing Star Game (arcade#56)

Not a duplicate of Word Runner (arcade#55), despite the filename pairing
(`typing-game-1.html` beside `typing-game.html`, the shape of a saved
variant elsewhere in this repo, e.g. `flappybird-1.html`/`flappybird.html`).
Read both files side by side: Canvas rendering here vs. Word Runner's DOM
overlay; player is a drawn star that moves directly in canvas coordinates
vs. Word Runner's floating circle positioned in the DOM; words are
`FloatingWord` instances that drift with their own physics and trigger by
proximity collision vs. Word Runner's fixed word list spawned on a random
timer; word theme is AI/ML terms (`GPT`, `BERT`, `LLM`, model/company
names) vs. Word Runner's general programming terms; scoring formula and
scale also differ. Genuinely a separate game — hosted as its own game, not
folded into Word Runner's manifest.

Source: `typing-games/typing-game-1.html`, one self-contained HTML file —
inline `<style>`, one inline `<script>` (Canvas rendering, WASD movement,
proximity-based word collision). Grepping the file for `src=`, `href=`,
`url(`, `fetch(`, `import`, `cdn.`, `https?://` finds exactly one match,
the same CDN dependency as Word Runner:
`<script src="https://cdn.tailwindcss.com"></script>` — not a sibling-path
dependency, safe to serve standalone. No `localStorage` reads or writes.

**No Jekyll front matter** — confirmed via `od -c` on the first bytes: the
file starts directly with `<!DOCTYPE html>`, no `---` block.

Build — no script changes needed, same single-file path as the others:

```bash
scripts/deploy-game.sh ai-typing-star typing-games/typing-game-1.html
```

produces `build/ai-typing-star/index.html` — the whole servable root, one
file. Verified by replicating the script's build step directly (`build/`
output non-empty, 6952 bytes).

Local verification: served `build/ai-typing-star/` from a local static
server and loaded it with headless Playwright (chromium) — zero console
errors, zero page errors.

Target: `/home/ai-typing-star/htdocs/ai-typing-star.adventurebuildr.com` —
matches this script's default `$SLUG.adventurebuildr.com` formula exactly
for slug `ai-typing-star`, no `GAME_DEPLOY_PATH` override needed.
