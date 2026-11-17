---
name: site-templates
description: Build a site from a template, a layout record of blocks made only of WordPress core-block parts, checked whole by layout.py, so one source renders as a static site and exports as a block theme. Includes a design gallery (site-kit#387): candidate homepages at /designs/, hidden from search, and the owner's pick through the site agent (promote-page). A brand's looks give the site a style switch through theme-picker, the plugin Foo's era picker uses (site-kit#413).
scope: shared
---

# site-templates: blocks and the layout record (step 1)

Seth (2026-11-06, superintelligentfoo#175): site templates for people with no site, which an agent customizes and whose
blocks can be moved around, and which "could also be turned into WordPress themes easily and quickly". The plugin
proposal (site-kit#119) was approved by game-dev-3 on the amended design. Step 1 (v0.28.0) is the blocks, the layout
record, the ops, the serializer, the static build and the local-trades starter. Step 2 (dev) is the op vectors that hold
site-agent's port to this code (v0.33.0); the studio's moves are in site-agent. Step 3 is the WordPress export (v0.31.0,
proven by pixel in v0.32.0). Step 4 is the creator and small-shop starters (v0.35.0, v0.36.0). Step 5, the picker in
Foo's sign-up, is mkt-dev's.

## Blocks

`blocks/<name>/block.json`:

```json
{"name": "cta", "version": "1.0", "title": "Call to action: one line and one button",
 "props": {"heading": {"type": "text", "required": true, "max": 90}, "button": {"type": "link", "required": true}},
 "tree": {"part": "group", "tag": "section", "children": [
   {"part": "heading", "level": 2, "text": "{heading}"},
   {"part": "buttons", "children": [{"part": "button", "text": "{button.text}", "href": "{button.href}"}]}]}}
```

**The tree is built only from these parts,** each one WordPress core block. Anything else fails, `core/html` included.
- **Static:** group, columns, column, heading, paragraph, image, buttons, button, list, list-item, details, quote, gallery.
- **Dynamic:** site-title, site-logo, navigation, query. These render from data, so they are accepted, named differences between the two outputs.

**Nesting follows core.** For example, columns hold only column, buttons hold only button, and a heading holds nothing.

**Each field takes one kind of value:**
- **Words** (`text`, `summary`, `cite`): literal text and word slots, meaning a text prop used whole, a link's `.text` or an image's `.alt`.
- **`href`:** exactly one link's `{x.href}`, or a literal safe address. Never a text prop, so a record can't turn a heading into a `javascript:` button.
- **`src`:** exactly one image's `{x.src}`, or a site path or `https:` address.
- **`tag`, `level`, `kind` and `count`:** a literal from core's own values, never a slot:
  - `tag`: div, header, main, section, article, aside or footer;
  - `level`: 1 to 6;
  - `kind`: posts;
  - `count`: 1 to 24.

**Any `{` or `}` that isn't a valid slot fails.** The one exception is `{{placeholder:…}}`.

**Prop types:**
- `text`, used whole: `{heading}`;
- `link`, used by its parts: `{cta.text}` and `{cta.href}`;
- `image`, used the same way: `{image.src}` and `{image.alt}`;
- `items`, a repeat: a node with `"each": "reach"` uses `{item.<field>…}`. Each field is text, link or image, held to a prop's own rules. The prop's `max` is the most items it holds: each shipped block names one (contact reach 4, services 12, proof 12, faq 20, work 24, menu 30), and a block that names none gets `MAX_ITEMS`, 50.

Every slot must name a declared prop, used the right way.

**Versions** are `major.minor`. A minor version may only add optional props. A new required prop is a new major version, shipped with its migration.

## The layout record

`.sitekit/layout.json` is the only thing a person or an agent edits:

```json
{"template": "local-trades", "pages": [
  {"path": "/", "type": "home", "sections": [{"id": "s1", "block": "hero@1", "props": {"heading": "..."}}]}]}
```

**Into a site:** run `python3 <kit>/scripts/site_sync.py sync <tag> --skills=brand,site-templates` in the site's root. It vendors these skills to `skills/` beside the reuse-first check and locks every file in `.sitekit/kit.lock`. A later `sync <tag>` brings the same skills to the new tag, and CI's `verify` fails if one is edited by hand. `verify` allows the site's own `.sitekit/layout.json` and `.sitekit/brand.json`.

Then give the new site its brain, once: `python3 <kit>/scripts/brain.py new --root . --intake ../intake.json --ref <tag>` writes `SOUL.md`, `canon/STYLEGUIDE.md` and the first `.agent/memory/` line from a short intake (`name`, `who` and `act` are required; brain.py's docstring lists the rest). The intake sits beside the site, never in it, as Foo's does. Edit the drafts, and `site_check.py` passes the brain from then on (site-kit#255). Foo's onboarding runs the same step.

`page-types.json` names each page type's required blocks. For example, a `contact` page needs a `contact` block, a `work` page a `work` block, and a `menu` page a `menu` block.

## The check

```bash
python3 skills/site-templates/layout.py --blocks                       # every block.json is allowed
python3 skills/site-templates/layout.py .sitekit/layout.json           # in CI, on every commit
python3 skills/site-templates/layout.py .sitekit/layout.json --publish --require /contact/
```

It checks the **whole record**, however it was made: ops, a hand edit, a merge or a starter.
- Each section's `block@major` matches the block.
- Every prop meets its schema, and **required props are not empty**. So a contact block with no way to reach you fails.
- **Links go somewhere:** a page path (an `#anchor` is allowed), `https://` plus a host, `mailto:` plus an address, `tel:` plus digits, or `#name`. Images are site paths or `https:` addresses, with alt text. Text made only of spaces or zero-width characters counts as empty.
- **An items prop can need a kind of address.** For example, `contact`'s `reach` has `"needs": ["tel:", "mailto:"]`, so it fails without a phone or an email.
- Each page type has its required blocks.
- Section ids are unique across the site.
- There's a home page, plus each `--require`d route.
- **Every internal link in a prop points at a page that exists.** So `remove-page` can't leave a dead button.
- With `--publish`, any `{{placeholder:…}}` left anywhere fails.

## Moving blocks: ops

The studio's drag handles and the agent both send a short op list. `ops.py` applies it to a copy of the record, then
checks the **whole result** once, so a list is atomic. A move across pages, written as `remove` then `add`, may pass through a
state that would fail on its own; it's committed or refused as a whole. **Nothing is written unless the result is
valid,** and the file is replaced in one step, keeping its own mode.

```json
[{"op": "move", "page": "/", "id": "s3", "before": "s1"},
 {"op": "add", "page": "/", "block": "cta@1", "after": "s3", "props": {"heading": "Call today", "button": {"text": "Call", "href": "tel:+18015550100"}}},
 {"op": "set", "page": "/", "id": "s1", "props": {"heading": "New headline", "lead": null}},
 {"op": "remove", "page": "/", "id": "s5"},
 {"op": "add-page", "path": "/about/", "type": "about", "after": "/"},
 {"op": "remove-page", "path": "/old/"}]
```

- **`move`:** takes `before` or `after` an id, never a position, so two edits can't race on an index.
- **`add`:** without an `id`, it takes a new random `s<hex>`, almost never a removed section's id (32 random bits), so a stale op can't act on the new block. The studio and the agent leave `id` out; an explicit one is the caller's own choice.
- **`set`:** merges props, and a `null` drops an optional prop.
- **`promote-page`:** makes a candidate design the home page (site-kit#387; see "Candidate designs" below).
- **Limits:** a list holds 1 to 100 ops, and any unknown key or op fails.

```bash
python3 skills/site-templates/ops.py .sitekit/layout.json ops.json [--require /contact/]
```

### The op vectors (superintelligentfoo#175, step 2)

The site agent's Worker is JavaScript, so its tool and the studio's drag handles use a port of `ops.apply` and
`layout.problems`, which refuses a bad op list at once. `ops-vectors.json` holds that port to this code. Each case is an
op list on the local-trades starter, with the exact result or the exact refusal that `ops.apply` gives here.
`python3 vectors.py` writes the file, and a test fails when it's stale. So a change here that changes any answer also
changes what the port is tested against. Malformed input (wrong types) is pinned only as refused. `layout.py` in the
site's own CI stays the backstop.

## One serializer, two outputs

`serialize.py` turns a **valid** record's page into WordPress core-block markup, such as
`<!-- wp:heading {"level":1} --><h1 class="wp-block-heading">…</h1><!-- /wp:heading -->`. The static HTML is
**the same markup with the block comments taken out**, which is how WordPress itself renders a static block. So the
static site and the block theme are one text and can't drift apart.

- **Escaping:** every value goes through one `escape()`, the same for both outputs. A heading of `<img onerror=…>` shows as text.
- **Comment attributes** are written the way WordPress writes them, with `<`, `>`, `&` and `--` escaped, so a value can't close the comment.
- **Empty parts are left out:** an optional lead not given, a button with no address, an image with no `src`. A container left with nothing is left out too.
- **Dynamic parts** (site-title, site-logo, navigation, query) are refused until the page shell, which brings the site's data.

```bash
python3 skills/site-templates/serialize.py .sitekit/layout.json /          # block markup
python3 skills/site-templates/serialize.py .sitekit/layout.json / --html   # static HTML
```

## The page shell

`render.py` turns one page of a valid record into a whole static document:
- **The head:**
  - the page's `title` (the home page's alone, any other as "Title | Site name") and `description`;
  - the canonical address and Open Graph;
  - the brand record's icons and share image.
- **Colours:** the brand's colours become theme.json's own variables, `--wp--preset--color--<role>`, so one stylesheet serves both outputs.
- **The site's look (site-kit#243):** read from `.sitekit/brand.json`, all optional, so a record that sets none builds byte for byte as before (proved on the club and local-trades starters). The rules go in a second `<style>` after the stylesheet link, only when something is set; `assets/blocks.css` is unchanged.
  - `fonts`: each role becomes `--sk-font-<role>` (family plus fallback), and each face file an `@font-face` (`font-display: swap`) served from `/fonts/<role>-<n>.<ext>` (fixed names, copied from inside the root, type-checked by their first bytes). Headings, the site's name and the menu use `display`; the body uses `text`. A system stack (`faces: []`) ships no file.
  - `colours.heading`: `h1`-`h6` take it, except inside the closing CTA band. Unset, they take `ink`.
  - `header`: `image` + `image_alt` (a full-width banner in place of the logo and name, `/header.<ext>`, sized when it is a PNG or JPEG; the alt is required), `align: "center"` (logo and name above the menu, centred) and `nav_case: "upper"` (uppercase menu labels). A closed set; any other key is refused.
  - `colours.surface` (a colour role only: it styles nothing alone), `main: "card"` (`<main>` becomes one 68rem card on `surface`; refused without it), `text_align: "center"`, `header.logo_size: "large"` and `bands` (site-kit#243 follow-up): main-area text centred; the logo at 96px (ignored with `header.image`); and band colours. A section in `layout.json` may carry an optional `"band": "light" | "dark" | "card"` beside `block` (not inside `props`), for every block: it adds one class, `sk-band-<band>`, to that section only, so a page with no `band` is unchanged. `light`/`dark` use the brand's `bands`; `card` puts the section on the `surface` card (its rule is written only on a page with such a section). `layout.problems(..., brand=brand_rec)` refuses a band the brand does not define and `card` without `colours.surface` (without `brand` only the value is checked); `build` passes the brand. Their rules go in the same second `<style>`. Unset, nothing changes.
  - **Block props (round 3):** two new prop types, `choice` (one of its `values`) and `flag` (true or false). `hero@1.1` takes `layout: "stacked"` (one centred column: logo, headline, text, actions) and `logo: true` (the brand logo large at the top of the hero; the header leaves its logo out on that page only, no header key). `cta@1.1` takes `style: "link"` (the call as bold accent underlined text, the block's own text and address, `tel:` works; default is the button). A set prop adds one class (`sk-layout-stacked`, `sk-logo`, `sk-style-link`) and the rules for it are written only on a page that uses it. The props reach the exported block markup as classes; the styles and the per-page header logo are static-only.
  - **Round 3b:** `hero@1.2`'s `logo` takes `true` or `"large"` (large: about 22rem wide, capped by the width on a phone) and a new hero prop `title_size: "small"` steps the hero's heading down one step (the same fixed scale as `headings.size`); both reach the exported markup as classes. `layout.json` takes an optional top-level `menu`: 1 to 8 entries, each exactly `{"label", "href"}`, `href` a page path (an optional `#anchor` must name a section of a page that exists) or an `https://` address, anything else refused (a starter's entry may hold a `{{placeholder:…}}` address until publish, shown as a menu link with no address, `aria-disabled="true"`, as a placeholder button is, site-kit#349; `--publish` refuses a placeholder anywhere in the menu, and a footer column's link may not wait); it replaces the pages-derived menu in the header (the footer menu is unchanged). Static-only: the exported theme keeps the pages menu.
  - **Round 5:** when a page's hero shows the logo (`logo: true` or `"large"`) the header leaves out its logo and its site title on that page only; the footer keeps its site title. `text@1.1` items take an optional `size: "medium"` (a new `choice` item field): that item's image is at most 34rem (about half the content width), centred, and full width on a phone; it adds the class `sk-size-medium` to the item's group, which reaches the exported markup, and its rule is written only on a page that uses it. Any other value is refused. `hero` `logo: "large"` sizes the logo's wrapper (which `blocks.css` makes `fit-content`), so a small logo file still shows 22rem wide.
  - **Round 6:** `hero@1.3` takes `cta_style: "link"` (its call as bold accent underlined text, the same look as the cta block's `style: "link"`; unset is the button; a class that reaches exported markup). An item image `size` is now one shape on `text@1.1` and `work@1.1` items: `"small"` (about a quarter of the 68rem content width, 17rem) or `"medium"` (about half, 34rem), centred, full width on a phone; it replaces round 4's text-only `medium` and keeps the class names `sk-size-small` / `sk-size-medium` (on the item's group for text, its column for work); any other value is refused. Consecutive `band: "card"` sections share one card: the first carries `sk-card-open`, the last `sk-card-close` (a lone card section both); see the brand skill for the strip `bands.card`.
  - **Footer band:** `footer: {"band": "light"|"dark"}` in `brand.json` paints the footer in that band's colours (its top rule goes transparent); unset, the footer is unchanged. Static-only; the band colours already reach the palette.
  - **Round 7:** a new prop type `count` (a whole number between its `min` and `max`; refuses a non-integer, `true` and `"5"`), used by `proof@1.1`'s review `stars` (1 to 5: `aria-hidden` star glyphs plus screen-reader text "Rated N out of 5") and its `style: "quote"` (quote in the display font, italic, centred). `hero@1.4` takes `menu: true`: the hero shows the site menu under its tagline and the header leaves its menu out on that page; with `logo: true` too the header renders nothing on that page (the footer is unaffected). `cta@1.2`'s `style` is `"link"` or `"dark"` (the button in `ink`, its text in `ground`). `layout.json` takes an optional top-level `footer`: `{"columns": [1 to 3 of {"heading", "links": [1 to 6 {"label", "href"}]}]}` with the same href rules as `menu`; it replaces the footer menu on the static site (it does not clash with `brand.json`'s `footer.band`). It may also take `"note"` (site-kit#424): one line of small print after the links, plain text of 1 to 200 characters with no line break and no `<` or `>`, written as `<p class="sk-footer-note">` in the band's own ink at a smaller size; no note writes nothing new. Block props reach the exported markup as classes; the footer columns and the styles are static-only.
  - **WordPress export:** `export.py` carries the colours (the palette, including `heading`, `surface` and the bands' colours) and the font families (named with their fallback, no files) into theme.json. The header knobs and the font files are static-only for now.
  - **site-kit#301 (Trenz):** `layout.json` takes an optional `business`: `{"@type"` (a LocalBusiness subtype, such as `BarberShop`), `"addressLocality", "addressRegion"}` and, if known, `streetAddress`, `postalCode`, `addressCountry` (two letters), `telephone`, `areaServed` (towns), `sameAs` (https addresses) and `openingHours` (like `"Mo-Fr 09:00-18:00"`, only when given, never guessed). It renders one LocalBusiness JSON-LD block on home, `@id` `#business`, under the `#organization`. It takes an optional `email` too, the site's only public address: without it no file names an email. llms.txt keeps its Help link, and security.txt and mcp.json give the brand's https help page. The brand's `support.email` is never published on a site (the lead's ruling). `footer` takes `"layout": "row"`: every link in one centred row that wraps on a phone, with no headings (`"columns"`, the default, is unchanged).
  - **site-kit#303:** a slot plugin's `plugin.json` may name `"slot_assets": {"css": [...], "js": [...]}`, each one of its `"assets"`. The build copies every asset to `/assets/plugins/<plugin>/` (each a plain path inside the plugin's folder, or the build stops) and links the slot assets on the pages that hold that plugin's slot, and only there. `map` 0.3.0 is the first: a one-place map with directions on a static site.
  - **site-kit#413, looks:** a brand with `looks` (`{"label": ..., "variants": [...]}`, the variants in theme-picker's own shape, the default first) gets a style switch, the same `theme-picker` plugin Foo's era picker uses, vendored in `plugins/theme-picker`. The build runs the plugin's `head.styles` and `page.html` on every page, puts its menu at the end of the header and copies its script. A look's `vars` that name a brand colour role (`ground`, `ink`, `accent`...) or `display-font` also set `--wp--preset--color--<role>` or `--sk-font-display` under `html[data-variant]`, so one look recolours every block with no site stylesheet. Images swap by path: each `<img>` showing the default look's `images` path for a slot is marked with that slot; every other look's image for it must be in `--assets`. A brand with no `looks` builds as before. Static-only: the WordPress export ignores looks.
  - **site-kit#415, comic panels:** a brand with `panels: {"style": "comic", "shadow": <a colour role>}` gets Foo's family look on pictures, service cards, buttons and questions: a 3px `ink` border, a hard `6px 6px 0` shadow in that role, and square corners. A look can recolour the shadow role (#414). A brand without `panels` builds as before. Static-only.
- **The page itself:** the `header` and `footer` template parts around the page's sections. The site title, logo and menu come from the brand record and the pages, and the current page is marked `aria-current`.

```bash
python3 skills/site-templates/render.py .sitekit/layout.json .sitekit/brand.json / --origin https://example.com --css /assets/blocks.css
```

**Pages and anchors:**
- Every page has a `title` (at most 70 characters) and may have a `description` (at most 170). `add-page` needs the title, and `set-page` changes either one.
- A page may say which menu it's in: `"menu": "both"` (the default), `"footer"` (the footer's menu only, as
  a site's legal pages might be), or `"none"`: in no menu, but still in the sitemap, llms.txt and the twins. That's for a
  page people reach from somewhere else, such as PayPal's return pages after a dues payment (site-kit#223). Only a
  record edit sets it, never an op.
- A page may stay out of search: `"index": false` gives it `<meta name="robots" content="noindex">` and leaves it out of `sitemap.xml`, `llms.txt` and `llms-full.txt`, with no markdown twin (site-kit#249), for a thank-you or cancelled page reached only by its link (site-kit#246). The home page is always indexed. Left out, the page builds as before. The WordPress theme doesn't carry it yet (a block template has no head); add it there by hand until it does.
- Each section's id is its anchor: the section's outer group gets `id="<id>"`, as WordPress's `anchor` attribute does. A link to `/page/#id` must name a section on that page.

**The stylesheet:** `blocks.css` is our own small stylesheet for the `wp-block-*` classes the serializer writes. Seth ruled out vendoring WordPress's block-library code. The step-3 pixel diff decides whether it's close enough.

## Starters and the build

A starter is a folder in `starters/`:
- **`layout.json`:** every page and section, with its words as `{{placeholder:…}}`. Its pictures, where it has any, are plain generated tiles in `sample-assets/`, with their alt text still a placeholder, so nothing invented passes for real or publishes.
- **`template.json`:** its name and the routes a site made from it must keep, for example `/contact/` and `/services/`. A record must name a starter that exists, and that starter's routes apply in every check, on the ops path and in the build. So neither dropping `template` nor an op list can remove `/contact/`.
- **`sample-brand/`:** a neutral brand for the preview. Its contact details use `example.com`, the domain reserved for documentation.

A starter's button address may itself be a placeholder until publish. It renders as a button with no link (`aria-disabled="true"`), and `contact`'s need for a phone or email waits for it.

```bash
python3 skills/site-templates/build.py starters/local-trades/layout.json starters/local-trades/sample-brand/brand.json \
  --origin https://example.com --out dist [--publish] [--assets your-images-folder]
# creator's preview: starters/creator/layout.json with --assets starters/creator/sample-assets
```

`build.py` checks the whole record, with its template's routes, then writes every page to `<out>/<path>/index.html`, the stylesheet to `assets/blocks.css`, and the brand's icons and share image to the root. **With `--publish`, any placeholder left fails, and nothing is written.** Every target, pages and brand files alike, is checked to stay inside `--out` before the first file is written. Brand files are written under fixed names (`icon-<size>.png`, `favicon.ico`, `share.<ext>`), and only the brand's own icon keys are allowed. **`--assets DIR`** copies the site's own images (a portfolio's work, a hero's picture) to the site's root as they sit in the folder, so `/images/a.png` in the record is `images/a.png` there. It is checked before anything is written:
- each file must be a real png, jpg or webp, by its first bytes;
- it must be a plain file inside the folder (a linked file or folder is refused);
- names are compared casefolded, so nothing can overwrite a file the build writes on a case-insensitive disk, and two assets can't differ only in case;
- every site-path image the pages show must be there.

Dotfiles (`.DS_Store`, `.git`) are skipped.

**The starters** (superintelligentfoo#175):

| starter | for | pages | required routes | its own block |
|---|---|---|---|---|
| `local-trades` | a repair or service business that people call | /, /services/, /about/, /contact/ | /contact/, /services/ | none |
| `creator` | a maker, artist or designer who shows their work | /, /work/, /about/, /contact/ | /work/, /contact/ | `work@1`: a picture, a title, a line and an optional link per piece |
| `small-shop` | a café, bakery, store or market stall people visit | /, /menu/, /visit/, /about/ | /menu/, /visit/ | `menu@1`: one menu section, each item a name, a price as plain text and a line; no cart |
| `club` | a guild, club or association with members and meetings | /, /about/, /membership/, /meetings/, /contact/ | /membership/ | none (it uses `text@1`, `list@1` and `faq@1`) |
| `product` | a software service people sign up to (site-kit#349) | /, /how-it-works/, /pricing/, /faq/ | /how-it-works/, /pricing/ | none (it uses `hero`, `list@1`, `text@1`, `faq@1` and `cta`); out of the picker until the designer reads its preview at 8 or more |

None has a /how-this-site-is-built/ page: a client's site carries no page about how we built it (Seth, 2026-11-08). Seth's own sites keep theirs in their own records. **`club` is out of Foo's sign-up picker** (`"picker": false` in its `template.json`, carried in the catalog's `starters`) until the lead says otherwise (site-kit#223). A club with dues adds `/dues/` with a `slot@1` its `slots` maps to `paypal-button`. **`product`** (mywebsitememory.com first) is out of the picker too (`"picker": false`) until the designer reads its preview at 8 or more. Its plans are `list@1` sections in plain text, with no cart. Sign-in is the last entry of its `menu`, a link to the app's own sign-in page (a placeholder until publish, shown with no address), not a page here. It has no address field of its own: a slot needs its plugin, so an empty one is refused rather than shown as a field that goes nowhere. A product with the field adds `{"id": "address", "block": "slot@1", "props": {"name": "address"}}` under the home page's hero and maps it in `slots` to the plugin that fills it. Each one before `product` passes `site-standard-check --client` with 0 fail on its preview, matches its WordPress export at 0.00% of pixels, and was read by the designer at 8 or more. `product` has these three still to do, on its preview.

## The Super Intelligent family: `footer.family` (site-kit#428)

Seth's own product sites link to each other from one list: site-kit's `catalog/family.json` (each site's `name`, `url`,
one-line `purpose` and `mark`), vendored by `site_sync` as `.sitekit/family.json`, so no site keeps its own copy. A family
site turns it on with `"family": true` in `layout.json`'s `footer`. Its footer then gets a "Family" row after its links, in
either layout: a lighter "Family:" label, then every family site by name, with the one it is on in bold and not linked
(`aria-current="true"`: it names this site, not the page). Its `llms.txt` gets a
"## Family" section naming the others, and its home page's JSON-LD a `WebPage` whose `relatedLink` lists them. A missing or
wrong list stops the build with nothing written. Only a site with `"family": true` gets the file from the sync, and its next
sync deletes it once the site turns the row off. A family site with its own builder (Foo's `tools/www`) says `"family": true`
in `features.json` instead, and gets `.sitekit/family.py` too, to check the list and mark itself with `load` and `marked`. Adding a family site is one entry in `catalog/family.json`, and each family
site's next sync and build picks it up. Never a client, tenant or Caseproof site. Static-only.

## Edge code: `--functions` (site-kit#298)

A site whose plugins run at the edge (a `members` gate, a `waitlist`) builds them with `--functions functions`. The settings
are `.sitekit/plugins.json`, `{"<plugin>": {"<setting>": value}}`, checked against each plugin's own schema the way a theme
site's `site.json` is. The theme loader and the chain are the kit's, vendored by `site_sync` as `.sitekit/theme.py` and
`.sitekit/chain.js`. The build owns and rewrites `functions/_plugins.js`, `functions/plugins/<name>/`, `functions/_chain.js`
and `functions/_middleware.js`. The middleware is the kit's recipe: `runRequired`, then agent-files when the site has it, then
`runEdge`, then the page. A plugin "behind" a gate (`"edge": {"behind": "members"}`, site-kit#432, e.g. dues-admin) runs
only from inside that gate's pass, never in `runEdge`; the build refuses it on a site without that gate. It writes only those files. A file under `functions/plugins/` it doesn't make, whether the
site's own or one a removed plugin left, is never deleted: the build refuses and names it, and it refuses a symlink on any
path it would write.

`--functions functions --check` writes nothing and fails when the committed `functions/` differs from what the build would
write, so the copy `site_check` reads is the one that deploys. Bad settings, or a missing kit file, stop the build with
nothing written.

## Running words: `text@1` and `list@1` (site-kit#223)

For a site whose pages are mostly words, such as a club's bylaws, an agenda or a policy (redrockmqg.com first,
superintelligentfoo#459):
- **`text@1`:** an optional `heading` and a `body` of up to 60 items. Each item may have a `subheading` (an `h3`), a
  `paragraph` and an `image`, and renders only the parts it has, in that order. An item with none of the three is
  refused, not left out. A paragraph keeps its line breaks (an address on its own lines): the stylesheet's
  `white-space: pre-line` applies to `.text p` only, the same in WordPress.
- **`list@1`:** an optional `heading` and up to 40 `points`, a bulleted list as its own section. A list can't sit inside a
  text item, because an item field is text, a link or an image. Long rules come out as `text@1` and `list@1` sections in turn.

## A plugin's output on a page: `slot@1` (site-kit#223)

A page can carry markup that isn't made of core blocks, such as a PayPal button's form, only through a slot:
- **`slot@1`:** one prop, `name` (1 to 40 lowercase letters, digits and hyphens), at most once per page. It renders as
  an empty group whose class names it, `site-kit-slot-<name>`. That's WordPress's own `className`, so the theme export
  keeps it as a plain group.
- **The record's `slots`** says which plugin fills each slot and with which committed config file:
  `"slots": {"dues-2027": {"plugin": "paypal-button", "config": "plugins-config/paypal-dues-2027.json"}}`. It's set in
  the record, never by an op, and never on the command line, so every build of a commit gives the same page.
- **The check fails both ways:** a slot on a page that `slots` doesn't map, and a mapping whose slot is on no page.
- **The build** imports `plugins/<plugin>/plugin.py` and puts its `render(config)` inside the slot's group. That's the
  same function the plugin's own `render` command prints, so there's one source. Only a plugin whose `plugin.json`
  says `"fills_slots": true` may fill a slot. A missing plugin or config, or the plugin's refusal (shown in its own
  words), stops the build before anything is written. The markdown twins and llms.txt are made from the record, so
  they don't carry the plugin's markup.

## A section from a date, or until one (site-kit#383)

A section may carry `"from"` and `"until"` beside `block` (not inside `props`): full times with their offset, like
`"from": "2027-01-01T00:00:00-07:00"`. A bare date or a time with no offset is refused, so the time zone is never
guessed, and `until` must come after `from`.
- **The build decides.** A section is built only from its `from` (that second included) and before its `until`. Outside
  that window it isn't in the HTML, the twin or llms.txt, and a slot only it carried isn't filled, so its
  plugin's form or script ships nowhere. The theme export decides the same way when it runs. Nothing is hidden on the
  client: before `from`, the section doesn't exist in what's served.
- **The check** still reads the whole record. A slot carried only by a dated section still counts as carried, so the
  record is valid on both sides of the date.
- **The clock** is the build machine's. `SITEKIT_BUILD_AT` (the same format) gives a dry run of another day, but only
  without `--publish`: a publish build and the theme export refuse it, so a value left in a build's environment can never
  ship a dated form early. A dry run is `SITEKIT_BUILD_AT=2027-01-01T00:05:00-07:00 python3 skills/site-templates/build.py
  .sitekit/layout.json .sitekit/brand.json --origin https://example.com --out /tmp/dry --assets assets` (no `--publish`).
  The build prints the time it decided at when any section is dated.
- **A static site can't wait for a date,** so the site needs a build after it. Add a `schedule:` to the site's deploy
  workflow, on the site's own runner, a few minutes after the time: `cron: "5 7 1 1 *"` for 2027-01-01T00:00:00-07:00,
  since cron runs in UTC. A note that should go when the button comes, such as "opens January 1", is a section with
  the same time as its `until`.

## Candidate designs: a gallery, then the owner's pick (site-kit#387)

When an owner wants to choose between whole homepage designs (different layouts, not just colours, which is
theme-picker's job), each candidate is an ordinary page in the record. Nothing new renders it, and no plugin is involved.

- **The marker:** every gallery page carries `"gallery": true`, with `"index": false` and `"menu": "none"`, under `/designs/`. `add-page` sets all three with `"gallery": true`, so the site agent can build a gallery through `edit_layout`. Marked pages stay out of search, `sitemap.xml`, both llms files and the twins.
- **The candidates:** one marked page per design at `/designs/<slug>/`, with `"type": "home"` and the design's own sections.
- **The gallery:** a marked page at `/designs/`, made of the kit's blocks (a `text@1` intro, then a `cta@1` per design linking to its page). Send the owner its link; it's in no menu.
- **Public by address:** the pages are hidden, not locked. Anyone given or guessing `/designs/` can read them, so a design the owner's client must not see before the pick doesn't go here.
- **The pick:** one op through the site agent's `edit_layout`, never a public link:

```json
[{"op": "promote-page", "path": "/designs/<slug>/"}]
```

  The home page takes the picked candidate's sections and keeps its own type, title and description. Every marked page goes in the same op, with any slot mapping only they carried.
  - The pick is refused when:
    - the page isn't marked;
    - an unmarked page sits under `/designs/` (a kitchen designer's real `/designs/kitchen/` is never dropped, so it has to move first);
    - a page outside the gallery links into it. The whole result is checked, as with any op list.
- **Afterwards:** the next build has no `/designs/` at all. To run the gallery again, add new candidate pages.

## Analytics (site-kit#240)

The brand record's optional `analytics` object (see the brand skill) puts the site's analytics tags in every page's head, through `render.document`: Cloudflare's beacon (`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=...>`), GA4's loader, both, or nothing (the page is then unchanged). The site still owns its Content-Security-Policy, so it must allow what it chose.
- **Cloudflare:** `static.cloudflareinsights.com` in `script-src` and `cloudflareinsights.com` in `connect-src`.
- **GA4**, from Google's own guide for Google Analytics without Ads features ([Content Security Policy for Google tags](https://developers.google.com/tag-platform/security/guides/csp), read 2026-11-09): `https://www.googletagmanager.com` in `script-src-elem`; `https://www.googletagmanager.com` and `https://*.google-analytics.com` in `img-src`; `https://www.googletagmanager.com`, `https://*.google-analytics.com` and `https://*.google.com` in `connect-src`. With Google's Ads features on, that guide lists more hosts (`*.g.doubleclick.net`, each `*.google.<TLD>`, `pagead2.googlesyndication.com`, and `frame-src` for the tag manager host), so read it again before turning them on. The one inline `gtag` call needs a nonce or a hash of it in `script-src-elem`, or `'unsafe-inline'` as the weaker fallback. That is ordinary CSP practice: Google's guide gives those three options for Tag Manager's inline snippet, not for this `gtag` config call, and calls `'unsafe-inline'` discouraged. (The guide is written for Google Tag Manager and lists the hosts above for Analytics; Google's separate gtag.js developer page has no CSP list.)

Cloudflare's own auto-install is the other way to get the beacon. On Trenz's Pages site behind a custom domain, a beacon from a zone-based Web Analytics entry (`auto_install` on, no host) loaded but its report was refused and no page load was recorded (2026-11-09, superintelligentfoo#495); the cause is not established, and it may not hold for every site. The setting does not care which entry a token came from, so after setting one, load a page and confirm it appears in Cloudflare Web Analytics before relying on it.
GA4 is optional everywhere (herdos#3748); a client site that opts out of it simply omits the key.

## The blog (site-kit#321)

A site built from a layout gets its blog from the kit, never from a build step of its own. When `data/blog.json` (written
by the `blog-writer` skill) is in `--root`, `build.py` builds it to the `post` page type's contract
(`markup/page-types/post/README.md`), with S'mores' build as the reference (`blog.py`):
- **Each published post** is a page of the record at `/blog/<slug>/`, type `post`, in no menu, so the sitemap, llms.txt
  and the `.md` twins carry it like any page; its twin is at `/blog/<slug>.md` too. The page has `<body
  data-page-type="post">`, a byline linked to the writer's bio, a `BlogPosting` (headline, dates, the writer as a
  `Person`), the Atom `<link rel="alternate">`, and the featured image as the picture, `og:image` and the `BlogPosting`'s
  `image`. The image is one of `--assets`' files, like any other picture. The article ends with a plain "Back to the
  blog" link to `/blog/` (site-kit#327). After the article comes `/blog/`'s closing call to action (its last `cta`
  section), rendered and styled as a section of the post, so a short post doesn't end in empty space; with no `cta` on
  `/blog/` nothing is added. A draft is never built.
- **`/blog/`** is the record's own page if it has one (its title, words and menu place stay the site's), else a plain page
  titled Blog. The posts are listed newest first, above any FAQ or closing call to action, then each writer's name and
  bio at `/blog/#writer-<id>`, where the bylines link. A writer's `beat` is blog-writer's routing slug, so it is not shown.
  The post's byline and the date-and-writer line under each card on `/blog/` are one `<span class="post-byline">` in a
  plain `<p>`, so a site's theme styles both as one line.
- **`/blog/feed.xml`**: Atom 1.0, the same posts.
- **The build stops**, writing nothing, on an author not in `data/writers.json`, a bad slug, a published image without
  `image_alt`, or a post without an image while `post_images` is on (`.sitekit/features.json`, on by default). The field
  rules are `blog-writer`'s own functions. A post's title may run to 120 characters, `blog-writer`'s limit.

Without `data/blog.json` a site builds exactly as before, and it needs no `blog-writer` skill vendored. A site with a blog
vendors it (`site_sync.py sync <tag> --skills=<its skills>,blog-writer`), or the build stops and says so (site-kit#337).

## What agents and search engines read

`build.py` also writes, from the same record and brand (`agents.py`):
- **robots.txt and sitemap.xml:** robots.txt names every AI crawler the standard lists, plus a `Sitemap:` line. The sitemap has no `lastmod`.
- **Content-Signal** (herdos#3872): every robots.txt group carries `Content-Signal: search=yes, ai-input=yes, ai-train=no` by default, so a client's content is never offered for training without their say. The record's `"content_signal"` changes any of the three, each `"yes"` or `"no"`: Seth's own sites set `{"ai-train": "yes"}`.
- **Skills** (herdos#3873, the standard's `agent-skills`): the record's optional `"skills"` lists the site's own agent skills, each `{"name", "description", "path"}` (and optional `"queries"`), as discovery.py takes them. `path` is a SKILL.md inside the site's folder (`--root`), never a link. The build publishes each at `/.well-known/agent-skills/<name>/SKILL.md` with the 0.2.0 index and its sha256 digest, and lists it in the AI catalog. The skills' `queries` must add up to at least 2 (the AI catalog's entry for the index needs 2 to 5), and the layout check says so. List only a skill the site really offers.
- **llms.txt:** the H1, the `> why` line, key facts, key pages and contact.
- **Markdown twins and llms-full.txt:** an `index.md` beside each page, made from that page's own HTML, plus `llms-full.txt`, which joins them.
- **The `.well-known` files:** `security.txt` (its Expires is 180 days after the build), `agent-card.json` and `mcp.json`.
- **Agent discovery** (site-kit#314): `discovery.py` writes the MCP server card (`mcp/server-card.json`), `mcp.json`, the A2A card (with `supportedInterfaces`), the RFC 9727 `api-catalog`, the skills index (`agent-skills/index.json`, each `SKILL.md` with its sha256 digest) and the AI Catalog (one document at `ard.json`, ARD's current name, and `ai-catalog.json`, its predecessor, which the isitagentready scanner reads; herdos#3873), from one config. A template site's config is made from its record, since agent-files serves its `/mcp` and `/a2a`. A site that isn't built from templates (sethshoultes.com, MemberLock) keeps its config where the host never publishes it and outside `.sitekit/`, which `site_sync verify` keeps to the kit's locked files: on a Jekyll site that's `_data/agents.json`. It runs `python3 assets/vendor/site-kit/scripts/discovery.py build _data/agents.json <site dir> --root .` (kit-sync vendors the script there), which also prints the home page's `Link` header. Each block is optional, so a site lists only what it really has: a block left out writes nothing, and an endpoint that answers 404 or doesn't answer stops the build (`--offline` skips that check). `api-catalog` has no extension: on a template site agent-files serves it as `application/linkset+json` and adds the home page's `Link` header, and any other site's host does the same (sethshoultes.com through its `_headers`). The catalog is AI Catalog 1.0, and each entry is a valid ARD entry: `specVersion`, a `host` object and an entry per card, each with a `urn:air:<domain>:<namespace>:<name>` identifier, a `displayName`, an IANA `type`, a `url` and 2 to 5 `representativeQueries`. Each block (and each skill) may give its own `queries` list; without one, they are the first sentences of the block's own words (the MCP's description and its tools', the A2A skills' names and the site's description, each skill's description), and a block that yields fewer than 2 must give its own. The `mcp` block may also give `access` and `rate_limits`, the sentences `mcp.json` says on who may call it and its limits; left out, they describe agent-files' page MCP (no sign-in, public pages only; Cloudflare's own limits), so an MCP that does more, like Foo's `check_site`, names its own (site-kit#345). A site not built from templates may give a top-level `contact` (an https URL or a `mailto:` address) for `mcp.json`; left out, it is the home page. A key the `mcp` or `a2a` block doesn't know is refused by name, so a misspelling never ships a default in silence. The host serves both paths as `application/json` with `Access-Control-Allow-Origin: *` (agent-files does on a template site; any other site's host through its `_headers`), the home `Link` header names each with its own rel (`rel="ard"` and `rel="ai-catalog"`), and each page's head carries `<link rel="ard" href="/.well-known/ard.json">` and `<link rel="ai-catalog" href="/.well-known/ai-catalog.json">` (a template build adds them; a site with its own layout adds them there).
- **Agent sign-up on the card** (superintelligentfoo#1048): the `a2a` block may give `"security_schemes"`, A2A 0.3's `securitySchemes` for a sign-up the site really has: 1 to 5 named schemes, each `oauth2` (with its `flows`) or `openIdConnect` (with its `openIdConnectUrl`), every `*Url` https. The card gets them as `securitySchemes`, plus a `security` list naming each. herdos public-site.md's `agent-auth` check reads them: a site that publishes `/auth.md` or OAuth metadata must declare its sign-up here.
- **auth.md** (site-kit#361): an optional `"auth_md"` is the text of `/auth.md`: how an agent signs in today, true and nothing more (at most 20000 characters). discovery.py writes no OAuth metadata. RFC 8414's authorization-server document and RFC 9728's protected-resource document each name the address they're served from, so a site whose MCP sits behind another host's OAuth (Foo's www, whose MCP is on its API) redirects `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` to that host's own documents, in its own `_redirects`. It never serves a copy.
- **DNS-AID records** (herdos#3980): `python3 discovery.py dns-aid <agents.json>` prints the site's records from the same config, one per line as `<hostname> HTTPS '<rdata>'`, the form herdos `ops/cloudflare.sh dns-record add` takes. `_index._agents.<host>` is always printed; `_mcp._agents` and `_a2a._agents` only for a block the config has. Each is ServiceMode (priority 1) at that service's own host, with `alpn="h3,h2" port=443`, and the MCP and A2A records add `mandatory=alpn,port`. Every host must be a plain lowercase DNS name (no port, userinfo, quote or trailing dot), or nothing prints and the command fails, naming the URL. DNSSEC is the zone's, not the config's: without it the records don't validate.
- **JSON-LD on every page:** BreadcrumbList; Organization and WebSite on home; FAQPage where a page has questions.

The record carries the site's **`why`** once: who it helps and why, at most 300 characters. At publish it must be at least 120 characters with no placeholder. llms.txt, both cards and the Organization all reuse it.

Each section's outer group carries its block's name as a class (WordPress's `className`). So a page's FAQ is `class="… faq"` and its closing call to action `class="… cta"`, which is how the site standard's `faq-last` check finds them.

**Serving it:** markdown negotiation, `/a2a` and `/mcp` come from site-kit's `agent-files` plugin. Deploy the build with a `functions/_middleware.js` of `export { onRequest } from "../plugins/agent-files/functions/agent-files.js";` beside a vendored `plugins/agent-files/`. The local-trades preview at https://local-trades.site-templates-1xc.pages.dev/ passes `site-standard-check --skip ga4,gsc` with 0 fails. GA4 and Search Console belong to each real site, set at publish.

## WordPress: a block theme from the same record

`export.py` writes a block theme from the record, its blocks and the brand record. The lead's ruling (2026-11-06) is a
theme only: the pages' sections sit in its templates, and nothing is imported as posts.

```bash
python3 skills/site-templates/export.py .sitekit/layout.json .sitekit/brand.json --out theme [--slug my-business]
```

- **The files:**
  - `style.css` (the header, `Requires at least: 6.3`) and `theme.json` (the brand's colours as the palette, `blocks.css` as its `styles.css`);
  - `parts/header.html` and `parts/footer.html`;
  - `templates/front-page.html` for the home page, and `templates/page-<slug>.html` for each other page, keyed by the last part of its path;
  - `templates/page.html` and `templates/index.html` as fallbacks;
  - `patterns/<id>.php`, one per section, so it can be inserted again.
- **One source:** a template's main is the very markup `serialize.page` gives the static site, comments and all. The stylesheet is the same file on both outputs, with colours read from `--wp--preset--color--<role>`.
- **Checked as for publishing,** so a `{{placeholder:…}}` is refused. Images need an https address. Two pages that would share a `page-<slug>.html` are refused, and so is any value that could open or close PHP (`<?`, `?>`, `*/`) or break a header line.
- **A one-way fork:** from install onward WordPress is the source, and re-exporting is only for a fresh install.
- **Menus are written out:** each navigation in the theme's parts carries its links from the record's pages, so WordPress shows the static site's menus (home left out, footer-only pages in the footer only, `"none"` pages in neither), not its fallback list of every page. Its title is a paragraph (`level: 0`), the logo is 48px, and the menu never folds into a hamburger.
- **A root install:** the theme assumes WordPress at the domain's root. Its menu links, its 404 link home and the current-page marker are root-relative (`/services/`), like the static site's, so a WordPress in a subdirectory would need them rewritten.
- **Named differences:** WordPress renders the site title and logo itself (the logo is the site's own Site Logo setting). It marks only page-id menu links as current, so the theme's `functions.php` (fixed code, the same in every export) marks the custom link to the page being shown with `aria-current`, as the static page does. A page needs a WordPress page whose slug matches for its template to apply. llms.txt, the twins and the cards are agent-files on Pages; a theme carries none of them.

### Checking the theme against the static site, by pixel

`parity.mjs` screenshots each page of both at 1280 and 390 wide, writes the pairs and a diff image (red where they differ), and prints the share of pixels that differ:

```bash
NODE_PATH=<node_modules with playwright> node skills/site-templates/parity.mjs http://static-origin http://wp-origin out-dir / /about/ ...
```

**Step 3b's run (2026-11-06):** the local-trades starter, filled with sample text, on WordPress Playground (latest WordPress, PHP 8.3). It came out with the same page heights on every page, and 0.00% of pixels different once `functions.php` marked the current menu link (0.00–0.17% before that, all of it the missing underline). Three CSS rules got it there, each matching only WordPress's markup, so the static site renders byte for byte as before:
- the columns' bottom margin (WordPress's core 1.75em);
- the menu link's display (WordPress's core rule outranked ours);
- the `.wp-site-blocks` frame.

**The reference install** (the lead, 2026-11-06): https://templates-proof.wpbuildr.com is a real WordPress on the box, plain and noindex, with no MemberPress. It runs the local-trades sample theme (`sample-door-co`, v0.32.0). On 2026-11-06 it matched the static build at 0.00% on all 5 pages at 1280 and 390, and the designer approved it at 9/8/8 (superintelligentfoo#175).

The lead's ruling, quoted: "keep templates-proof.wpbuildr.com as the reference (noindex, no MemberPress). The next theme change re-runs the parity check against it."
- **What counts as a theme change:** anything that changes the markup or the styles a theme ships. That's `export.py`, any of `serialize.py`, any block's `tree` in `blocks/`, `page-types.json` and `blocks.css`.
- **The order, before the tag:**
  1. Run `parity.mjs` on Playground while the PR is open.
  2. site-dev hands the lead the PR head's sample theme zip and its sha256.
  3. The lead or server-manager installs it on the reference.
  4. `parity.mjs` runs against the reference, with the static build of the same record at that head.
  5. The result goes on the PR before the merge ask, and the release is tagged only after that.
- **If a tested PR doesn't merge,** the last released sample zip goes back on the reference, so the next run compares against a released theme (game-dev-3 on #146).
- **Only the lead or server-manager installs on the box.**
