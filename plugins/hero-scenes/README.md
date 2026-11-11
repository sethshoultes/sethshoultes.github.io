# hero-scenes

Canvas animations for the kit's `.hero-anim` slot: one small engine with no library, and six scenes.

| Scene | What it shows |
|---|---|
| `flow` | business info streams into a site window and out to AI answer cards (boxed, or full-bleed with `.flow-canvas`) |
| `orb` | particles assemble into an orb as the section scrolls in (or on arrival in a hero slot) |
| `answer` | a question flows into an AI answer card that cites the site |
| `blocks` | blocks drop in and assemble a page |
| `pins` | map pins land and the site's listing climbs the ranking |
| `page` | a wireframe page builds itself and scores 100 |

- **Decoration only:** the canvas is `aria-hidden`; the words stay in the page's HTML beside it.
- **The slot's rules:** a fixed 4:3 box, so nothing shifts; a scene runs only while on screen and the tab is visible; reduced
  motion gets one still frame, the same each time (each scene draws from a fixed seed); the device pixel ratio is capped; slow
  frames halve the particle count.
- **Content first:** the engine mounts after the page has loaded, so the largest paint is the page's own.

## In the page

`<div class="hero-anim" data-variant="answer"></div>` gets its canvas from the engine, or write it yourself:
`<figure class="hero-anim"><canvas data-anim="answer" aria-hidden="true"></canvas></figure>`. A full-bleed `flow` hero puts
`<canvas class="flow-canvas" data-anim="flow">` in the site's own positioned section, with the headline in a `.flow-copy` beside
it; the scene lays its cards in the site's `.wrap` column, below that headline.

Link the plugin's stylesheet before the site's own, so a site rule for its scenes (a phone layout, say) comes after it and wins.

## Colours

The engine reads the site's own tokens: `--accent`, `--surface`, `--surface-2`, `--border`, `--text`, `--muted`, and `--bg` for
the dark marks on the accent. A site restyles every scene with no code.

## Settings (config only)

| Setting | What it is | Default |
|---|---|---|
| `scenes` | Which scenes may run, comma-separated | flow, orb, answer, blocks, pins, page |
| `assistants` | The answer cards' names in `flow`, comma-separated | AI search, AI chat, AI answers |
| `sources` | The source cards in `flow` | Services, Reviews, Pages |
| `question` | The question in `answer` | Who is best near me? |
| `answer_label` | The answer card's label | AI answer |
| `citation` | The citation in `answer` | [1] yoursite.com |
| `cited` | The chip in `flow`: long text, then `\|` and a shorter one for narrow windows | yourbusiness.com: cited in the answer \| cited in the answer |
| `ranking_label` | The ranking's label in `pins` | Local ranking |
| `font` | The font stack the scenes draw with | system-ui, -apple-system, sans-serif |

## A site's own scene

A scene that tells one site's story stays in that site. Its module imports the engine and registers it before the page loads:

```js
import { register, clamp, ease, lerp, seg, sprite, roundRect, label } from '/assets/plugins/hero-scenes/assets/hero-scenes.js';
register('story', (ctx, cv, colours) => ({ resize(w, h) { /* ... */ }, frame(dt, now, still) { /* ... */ } }));
```

## What the page's CSP needs

The engine is a same-origin module, so `script-src 'self'` covers it. The settings are a JSON block, which CSP does not run.

## Tests

`tests/hero-scenes.test.js` runs the engine against a fake page whose canvases record every draw call: the same seed paints the
same still frame for every scene, reduced motion paints only the still frame and never starts the loop, the engine stops
off-screen, and the words come from the settings. `tests/test_hero_scenes_plugin.py` (in site-kit's tests) covers the build: the
settings block, that it can never close its own `<script>`, that the plugin names no brand, malformed settings, and the 25 KB
gzipped budget.
