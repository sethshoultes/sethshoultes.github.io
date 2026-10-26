# Tests

Run everything with `node --test tests/*.test.mjs`. No install step; Node 20 or newer.

| File | Covers |
| --- | --- |
| `tools-server.test.mjs` | The Cloudflare Pages Function behind the server-side free tools (`workers/tools/`): the request guard (origin, honeypot, rate limit, daily cap), the safe fetch (private addresses, redirects), the robots.txt reader, and each tool's handler with its network stubbed. |
| `check-links.test.mjs` | The broken-link check (`scripts/check-links.mjs`) that CI runs on the built site: pages, folders, extensionless pages, anchors and external links, and the failure on a missing target. |

Add a tool's tests to that file. The network is stubbed in these tests only; no service code returns stubbed data.
