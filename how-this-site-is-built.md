---
layout: post
permalink: /how-this-site-is-built/
date: 2026-11-07
label: "About this site"
title: How this site is built
description: "sethshoultes.com is a Jekyll site in a public GitHub repo, published as static pages on Cloudflare Pages."
---
The pages, posts and games are plain files in a public repository, [sethshoultes/sethshoultes.github.io](https://github.com/sethshoultes/sethshoultes.github.io). A Jekyll build turns them into static pages, and the result is served from Cloudflare Pages.

- Every address stays: old links keep working.
- Agents can read any page as Markdown (`Accept: text/markdown`), or start at [/llms.txt](/llms.txt) and [/sitemap.xml](/sitemap.xml).
- A new post is published by a scheduled workflow in the repository, which also deploys the site.
