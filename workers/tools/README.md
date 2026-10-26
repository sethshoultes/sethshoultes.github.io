# Tools API

The Cloudflare Pages Function behind the free tools that need a server
(sethshoultes.com/tools/). Live at `tools-api.sethshoultes.com`, Pages project
`sethshoultes-tools`, one file per tool in `functions/`.

Every request passes `functions/_lib/guard.js` first: the Origin must be
`https://sethshoultes.com`, the body must be JSON, a filled `website` field is
dropped as a bot, each IP gets a limited number of calls an hour, and each tool
has a daily cap (both in `LIMITS`). Counters live in the KV namespace
`sws-tools-limits` (binding `TOOLS_KV`). With no KV binding every call is
refused. Pages a visitor names are fetched through `_lib/safe-fetch.js`, which
refuses non-public addresses at every redirect and caps time and size.

Secrets (none yet) are Pages secrets, never in this repo.

Deploy, with the token sourced from `~/.config/dev-secrets/secrets.env`:

```bash
set -a; source ~/.config/dev-secrets/secrets.env; set +a
export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_ALL" CLOUDFLARE_ACCOUNT_ID=c28ea6353f4a578e429690ad3944c16b
cd workers/tools && wrangler pages deploy public --project-name sethshoultes-tools --branch main
```

Tests: `node --test tests/*.test.mjs` from the repo root.
