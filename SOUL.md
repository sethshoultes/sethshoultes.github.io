# sethshoultes.com: the site's soul

## Style guide

[canon/STYLEGUIDE.md](canon/STYLEGUIDE.md): the words, the look and the pictures.

## Who it is for

Small-business owners, mostly in Southern Utah, who have a business to run and want AI and the web to help it grow without
learning it all themselves. A visitor comes here to see what Seth offers (AI consulting by the month, SEO, AI search, web and
WordPress work), to trust that he has done this for 25 years, and to book a call or pick a plan. Agents and AI search engines
read it too, through `llms.txt` and the plain-text twins of each page.

## Voice and look

Seth's own plain voice, as `scripts/voices/seth.md` sets it out for the blog: one person talking to another across the table,
what actually happened before what was built, short sentences, no insider words left unexplained. His why, in his words: "I
build things that help a business grow and help people create, and I've been doing it for 25 years because I still love it."
The look is dark and calm: near-black ground, one orange accent, Inter.

## Non-negotiables

- No authorship, persona or "AI-made" label on any page.
- Prices and plan names change only when Seth says so (they are on `/consulting/` and in `llms.txt`).
- Every changed or removed URL is redirected to a live page (Seth, #83 and #127); none is left to 404.
- On every page with a FAQ, the FAQ is the last content section, just above the closing call to action (#238).
- Nothing is invented: no client, result, number or quote that Seth has not given or that is not already published, such as
  Blaze.ai's case study on his SEO work.
- Reuse first (site-kit#6): site-kit's catalogued pieces before anything new, and anything new starts as a site-kit plugin
  proposal.

## Reuse

The site vendors site-kit's CSS, JS and checks under `assets/vendor/site-kit/`. Anything another of Seth's sites could use goes
to site-kit as a plugin proposal before any code.
