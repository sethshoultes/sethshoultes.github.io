# Tests

Run everything with `node --test tests/*.test.mjs`. No install step; Node 20 or newer.

| File | Covers |
| --- | --- |
| `tools-server.test.mjs` | The Cloudflare Pages Function behind the server-side free tools (`workers/tools/`): the request guard (origin, honeypot, rate limit, daily cap), the safe fetch (private addresses, redirects), the robots.txt reader, and each tool's handler with its network stubbed. |
| `check-links.test.mjs` | The broken-link check (`scripts/check-links.mjs`) that CI runs on the built site: pages, folders, extensionless pages, anchors and external links, and the failure on a missing target. |
| `check-youtube.test.mjs` | The YouTube embed check (`scripts/check-youtube.mjs`): finds embedded ids, fails on oEmbed 401/403/404 (private, deleted) and names the page, only warns on network errors and 5xx, skips the sub-sites. |
| `ask-server.test.mjs` | The Ask Seth's AI and readiness-check functions (`workers/ask/`): JSON errors instead of a bare 502, a missing `GEMINI_API_KEY`, an unreachable site text, and a good answer, with the network stubbed; and `/talk` (cited answers, "nothing in the writing" without calling the model) plus the knowledge loaders, including the proof that a brain note without `public: true` never reaches the index. |

Add a tool's tests to that file. The network is stubbed in these tests only; no service code returns stubbed data.

After deploying `workers/ask/`, run `scripts/smoke-ask.sh` to check the live chat answers with real text (one Gemini call, so it is not in CI).
