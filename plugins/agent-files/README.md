# agent-files

This plugin gives an agent what it reads on a Cloudflare Pages site, under herdos `docs/standards/public-site.md`
rules 6 and 7 (site-kit#114):

- **Markdown twins.** `scripts/twins.mjs` writes `index.md` beside every built `index.html`. Each twin is the page's own
  `<main>`, under its h1, its address and its description. A request with `Accept: text/markdown` gets the twin, with
  `Vary: Accept`; a browser gets the page as before.
- **`/a2a`**, the `url` in the site's agent card, refuses plainly until the site has chat. A POST gets a JSON-RPC error
  (`-32004`); a GET gets one line of text naming `/llms.txt` and `/mcp`. A site that keeps its own `/mcp` and twins (S'mores)
  imports `a2aRefusal(request, origin)` from `functions/agent-files.js` and calls it on `/a2a` itself (site-kit#360).
- **`/mcp`** is a read-only MCP (protocol `2025-06-18`, streamable HTTP, JSON answers, no auth) with two tools:
  - `list_pages`: the site's own paths in `/sitemap.xml` or `/sitemap-index.xml` (its host with or without `www.`, same
    scheme and port), one level of child sitemaps, at most 2000;
  - `get_page {path}`: one page's twin. Paths with `..`, `//` or `/.well-known/` are refused.
- **`POST /api/page`** (site-kit#561) is `get_page` as plain JSON, for a browser agent: send `{"path": "/a-page/"}` and nothing
  else, and get the twin as `text/markdown`. Both call the one gate, `getPage(context, path)`, so they answer the same pages
  and refuse the same paths (400). A page with no twin is 404, a body over 64 KB is 413, a GET is 405, and members pages get
  the same 503 as `/mcp` when the site's gate isn't wired. No cookie, no CORS, no sign-in. A template site carrying webmcp
  registers it as the WebMCP tool `get_page` on its home page (the site-templates build does it).

- **`GET /.well-known/search?q=`** (site-kit#715) is Cloudflare's [Search for Agents](https://developers.cloudflare.com/ai-search/how-to/search-for-agents/)
  for the site's own pages. It reads `/llms-full.txt` (the twins joined, each section opened by `<!-- <address> -->`), so
  there is no second index to build. It returns `text/markdown`: `# Search results for: "<words>"`, then up to 10
  `## <address> (score: <n>)` sections, best first, each with the page's title and a short excerpt. A word in the title
  counts 3, each time it appears in the text counts 1 (at most 5), and the best result scores 1.
  - With no `q`, it returns a short how-to. A POST is 405.
  - A site whose `llms-full.txt` has no `<!-- <address> -->` sections (its own builder, not the twins) gets 404. Foo's www and
    S'mores do today.
  - The members gate drops a gated page, through the same `gated()` the twins use. A missing gate matcher is a 503, as for `/mcp`.
  - No query is kept or logged, and the answer is `Cache-Control: no-store`.
  - Every twin served on `Accept: text/markdown` opens with the `agent:` front-matter (instructions, the endpoint with
    `{query}`, `GET` and the documentation link) that advertises the search. `/mcp`'s `get_page` and `/api/page` return the
    twin without it.

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
     `--skip-no-main`: those pages get no twin, and the run names them (site-kit#193). The MCP's `get_page` then answers
     "no markdown version" for them, not "no page" (0.1.3).
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
   A site with the members gate passes `{ members: true }` (`agentFiles(context, { members: true })`, as site-templates'
   recipe does). Then, if the gate's matcher is missing from `context.data`, `/mcp` and every markdown read answer 503
   rather than serve a gated page's words (site-kit#418).
   If the site's `_routes.json` lists `include` paths, they must cover `/*`, so that every page can be negotiated.
4. **Write the two cards** in the site's `public/.well-known/`, both served as `application/json`. Each carries the
   site's own why (rule 8):
   - `agent-card.json`: `url` is `https://<host>/a2a`, and `skills` are the ones the site will answer once it has chat.
   - `mcp.json`: `endpoints` is `{"public": "https://<host>/mcp"}`, and `tools_summary` names `list_pages` and `get_page`.
5. List `agent-files` in `.sitekit/features.json` with the issue number.

## What a site sets

Nothing: no binding beyond Pages' own `ASSETS`, no variable and no secret.
