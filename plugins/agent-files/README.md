# agent-files

This plugin gives an agent what it reads on a Cloudflare Pages site, under herdos `docs/standards/public-site.md`
rules 6 and 7 (site-kit#114):

- **Markdown twins.** `scripts/twins.mjs` writes `index.md` beside every built `index.html`. Each twin is the page's own
  `<main>`, under its h1, its address and its description. A request with `Accept: text/markdown` gets the twin, with
  `Vary: Accept`; a browser gets the page as before.
- **`/a2a`**, the `url` in the site's agent card, refuses plainly until the site has chat. A POST gets a JSON-RPC error
  (`-32004`); a GET gets one line of text naming `/llms.txt` and `/mcp`.
- **`/mcp`** is a read-only MCP (protocol `2025-06-18`, streamable HTTP, JSON answers, no auth) with two tools:
  - `list_pages`: the site's own paths in `/sitemap.xml` or `/sitemap-index.xml` (its host with or without `www.`, same
    scheme and port), one level of child sitemaps, at most 2000;
  - `get_page {path}`: one page's twin. Paths with `..`, `//` or `/.well-known/` are refused.

The plugin only reads the site's own built files through `ASSETS`. It writes nothing and calls no other host.

## Turning it on in a site

1. From the site's repo root, run `<kit>/scripts/plugin-sync.sh agent-files <tag>`.
2. **Build the twins** after the site's build, then run the checks:
   ```bash
   node plugins/agent-files/scripts/twins.mjs dist --origin https://example.com [--llms-full "Example: every page"] [--skip-no-main]
   ```
   - It needs `turndown` and `turndown-plugin-gfm` in the site's own `devDependencies`.
   - `--llms-full` also writes `dist/llms-full.txt` from the twins. Leave it off when the site builds its own.
   - A page marked `noindex`, or one whose canonical is another site's, gets no twin.
   - Every other page needs a `<main>`. A site with whole-document pages that have none (standalone games, say) adds
     `--skip-no-main`: those pages get no twin, and the run names them (site-kit#193).
   - If no page at all gets a twin, the build fails.
3. **The middleware.** A site with no `functions/_middleware.js` adds one line:
   ```js
   export { onRequest } from "../plugins/agent-files/functions/agent-files.js";
   ```
   A site that has one calls the plugin first and passes its own answer through `vary()`:
   ```js
   import { agentFiles, vary } from "../plugins/agent-files/functions/agent-files.js";
   // inside onRequest(context):
   const answer = await agentFiles(context);
   if (answer) return answer;
   return vary(await context.next());
   ```
   If the site's `_routes.json` lists `include` paths, they must cover `/*`, so that every page can be negotiated.
4. **Write the two cards** in the site's `public/.well-known/`, both served as `application/json`. Each carries the
   site's own why (rule 8):
   - `agent-card.json`: `url` is `https://<host>/a2a`, and `skills` are the ones the site will answer once it has chat.
   - `mcp.json`: `endpoints` is `{"public": "https://<host>/mcp"}`, and `tools_summary` names `list_pages` and `get_page`.
5. List `agent-files` in `.sitekit/features.json` with the issue number.

## What a site sets

Nothing: no binding beyond Pages' own `ASSETS`, no variable and no secret.
