# Tests

Run everything with `node --test tests/*.test.mjs`. No install step; Node 20 or newer.

| File | Covers |
| --- | --- |
| `tools-server.test.mjs` | The Cloudflare Pages Function behind the server-side free tools (`workers/tools/`): the request guard (origin, honeypot, rate limit, daily cap), the safe fetch (private addresses, redirects), the robots.txt reader, and each tool's handler with its network stubbed. |
| `ask-server.test.mjs` | The Ask Seth's AI and readiness-check functions (`workers/ask/`): JSON errors instead of a bare 502, a missing `GEMINI_API_KEY`, an unreachable site text, and a good answer, with the network stubbed. |

Add a tool's tests to that file. The network is stubbed in these tests only; no service code returns stubbed data.

After deploying `workers/ask/`, run `scripts/smoke-ask.sh` to check the live chat answers with real text (one Gemini call, so it is not in CI).
