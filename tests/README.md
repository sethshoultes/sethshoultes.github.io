# Tests

Run everything with `node --test tests/*.test.mjs`. No install step; Node 20 or newer.

| File | Covers |
| --- | --- |
| `tools-server.test.mjs` | The Cloudflare Pages Function behind the server-side free tools (`workers/tools/`): the request guard (origin, honeypot, rate limit, daily cap), the safe fetch (private addresses, redirects), the robots.txt reader, and each tool's handler with its network stubbed. |
| `check-links.test.mjs` | The broken-link check (`scripts/check-links.mjs`) that `.github/ci/site-check.sh` runs on the built site: pages, folders, extensionless pages, anchors and external links, and the failure on a missing target. |
| `check-youtube.test.mjs` | The YouTube embed check (`scripts/check-youtube.mjs`): finds embedded ids, fails on oEmbed 401/403/404 (private, deleted) and names the page, only warns on network errors and 5xx, skips the sub-sites. |
| `ask-server.test.mjs` | The Ask Seth's AI and readiness-check functions (`workers/ask/`): JSON errors instead of a bare 502, a missing `GEMINI_API_KEY`, an unreachable site text, and a good answer, with the network stubbed; and `/talk` (cited answers, "nothing in the writing" without calling the model) plus the knowledge loaders, including the proof that a brain note without `public: true` never reaches the index. |
| `news-server.test.mjs` | The newsletter worker (`workers/news/`): signed links, the double opt-in end to end (subscribe, confirm, download, unsubscribe) on a real SQLite schema with Resend stubbed, repeat sign-ups, fresh consent after unsubscribing, rate limits, the admin count, and the library data agreeing with the worker. |
| `agent-discovery.test.mjs` | The agent discovery files (herdos#3873): runs the vendored `assets/vendor/site-kit/scripts/discovery.py` with `--offline` on `_data/agents.json` and fails when a committed `.well-known` file it owns differs from what it writes, is missing, or is one it no longer writes, or when the `/` Link in `_headers` is not the one it prints. After changing `agents.json`, run `python3 assets/vendor/site-kit/scripts/discovery.py build _data/agents.json . --root .` (online, so it checks the endpoints answer). |
| `meals.test.mjs` | The family meal planner (`assets/meals.js`): the grocery list groups by store, merges the same item from two meals, ignores typed meals, honours store choices and extras, drops checked items from the text, and the shipped meals only carry what Seth and their sources gave. |

Add a tool's tests to that file. The network is stubbed in these tests only; no service code returns stubbed data.

After deploying `workers/ask/`, run `scripts/smoke-ask.sh` to check the live chat answers with real text (one Gemini call, so it is not in CI).
