# Component markup and rules

Canonical markup for each kit component. Adapters (`jekyll/_includes/kit/`, later `astro/`, `react/`) must render exactly this.

## link-card
```html
<a class="link-card" href="/city/">
  <img src="/photo.webp" alt="Describe the place" width="720" height="480" loading="lazy" decoding="async">
  <span class="link-card-body"><h3>Title</h3><p>One short line.</p></span>
</a>
```
One `<a>`, one `<h3>`, no links inside. Photo needs alt, width, height, lazy. Service variant: an SVG icon (`class="link-card-icon" aria-hidden="true"`) in place of the photo. Put cards in `<ul class="link-grid">` (works anywhere, no `.hub` needed) (add `cols-4` for four across); the grid is 3 across, 2 on tablet, 1 on phone.

## post (layout: post)
`<article class="post">` with `.post-label`, one `<h1>`, `.subtitle`, `.byline`, then `<div class="post-content">`. Images inside a post are capped at the column. A featured image uses `class="post-img post-img-lead"` with width/height. Related reading is `.post-related`. Page needs Article-type metadata (title, description, og:*).

## page-head, cards, prose, faq, footer, nav, video-embed
Same classes as in `css/components.css`. FAQ is `<div class="faq"><details><summary>…</summary><p>…</p></details></div>` and the page carries FAQPage JSON-LD. Video embeds use `.video-embed` with an iframe `loading="lazy"` and a title.

## Rules every component keeps
No inline styles. Colors and fonts only through tokens/brand. Every `<img>` has alt; images that are not above the fold are lazy. Focus state is the global `:focus-visible` ring.

## photo-fig
```html
<figure class="photo-fig">
  <img src="/photo.webp" alt="Describe the place" width="1200" height="800" loading="lazy">
  <figcaption>Caption. Photo: <a href="https://commons.wikimedia.org/wiki/File:X">Author</a>, CC BY-SA 3.0, via Wikimedia Commons.</figcaption>
</figure>
```
Real photos only. Alt, width, height, and the credit (author, license, source link) are required. The first image on a page is not lazy.
