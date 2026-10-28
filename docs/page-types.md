# Page types

The machine-readable spec is `_data/page-types.json`; CI runs it through the kit check (`assets/vendor/site-kit/check/kit-check.mjs`, `kit.json` → `pageTypes`). This file is the human version. **A new page starts from its type, not from a brief:** say "a new city page per page-types: city" and build the parts below. The check fails any page missing a part, any page whose URL looks like a type but does not declare it, and any page carrying an AI disclaimer.

A page declares its type with `<body data-page-type="...">`. The site layout sets it: `city` and `service` from the data-driven layouts, `post` from the post layout, `hub` from `page_type: hub` in a page's front matter.

## city (reference: /st-george-utah/)
Data file in `_data/cities/<slug>.yml` and a page folder plus markdown twin. Required, in order:
1. Flyover hero: `clip:` and `poster_alt:` in the data (assets `assets/lab/<clip>.webm`, `.mp4`, `-poster.webp`), then the scenes (one H1).
2. Sections, "by the numbers" stats block with its source line.
3. FAQ (3 or more questions) with FAQPage schema.
4. Service cards ("What else I offer"), then the Book a call CTA, then Sources and the not-affiliated line.
5. Schema: ProfessionalService (`areaServed`), BreadcrumbList. A neighborhood sets `parent` and `place_name` for the Place-in-City schema and the 4-level breadcrumb.
6. Markdown twin, llms.txt entry, sitemap entry, a card on /southern-utah/ (automatic from the data), and a link from its parent city page.
No AI disclaimer, no "not a photo of" note.

## service (reference: /ai-services/)
Data in `_data/services/<slug>.yml`. Hero, sections, FAQ (3+) with FAQPage, Service and BreadcrumbList schema, service cards ("What else I do"), city photo cards under "Where I work" unless the service is national, Book a call, markdown twin, llms.txt entry, sitemap entry, linked from /services/. Hero animation: required once #152 ships.

## hub (reference: /southern-utah/; also /services/)
Heading, card grid (photo cards for places, icon cards for services; never a bulleted list of links), photo credits under photo cards, Book a call, markdown twin, llms.txt entry, sitemap entry.

## post (reference: /blog/merged-is-not-live.html)
`layout: post`: article with one H1, byline, canonical, Open Graph title and description, sitemap entry, featured image classed `post-img post-img-lead` with width and height, no inline styles.

## Adding a type
Add it to `_data/page-types.json` with a reference page and its parts, set `data-page-type` in the layout, and list it here.
