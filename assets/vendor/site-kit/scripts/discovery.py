"""Agent discovery (site-kit#314, herdos#3873): every agent-facing well-known file a site publishes, from one config.

A site lists only what it really has. Each block of the config is optional, and a block left out writes nothing:

  {"origin": "https://example.com", "name": "...", "description": "...", "docs": "/how-this-site-is-built/", "contact": "mailto:...",
   "mcp":    {"name": "com.example/site", "title": "...", "description": "...", "version": "1.0.0",
              "url": "https://example.com/mcp", "protocol_versions": ["2025-06-18"],
              "tools": [{"name": "...", "description": "..."}], "queries": ["...", "..."],
              "access": "...", "rate_limits": "..."},
   "a2a":    {"url": "https://example.com/a2a", "protocol_version": "0.3",
              "skills": [{"id": "...", "name": "...", "description": "...", "tags": ["..."]}], "queries": ["...", "..."]},
   "skills": [{"name": "my-skill", "description": "...", "path": "skills/my-skill/SKILL.md", "queries": ["..."]}]}

  "contact" is optional: mcp.json's contact, an https URL or a mailto: address. Left out, it is the origin's home page (a
  template site's build passes its own, from the brand record).

  "access" and "rate_limits" are optional: mcp.json's sentences on who may call the MCP and its limits. Left out, they say
  what agent-files' page MCP is (no sign-in, public pages only; Cloudflare's own limits), so an MCP that reads anything
  else or keeps its own limit names them (site-kit#345).

  "queries" is optional everywhere: 2 to 5 questions an agent's user might ask that the block answers (1 to 5 on a skill).
  Left out, the ai-catalog entry's representativeQueries are made from the block's own words: the MCP's description and
  its tools' descriptions, the A2A skills' names and the site's description, each skill's description. Each is a first
  sentence with no parenthetical, so nothing is made up; a block that gives fewer than 2 needs its own "queries".

  .well-known/mcp/server-card.json   the MCP Server Card (SEP-2127, schema v1)            from "mcp"
  .well-known/mcp.json               the older summary agents already read                from "mcp"
  .well-known/agent-card.json        A2A: supportedInterfaces, plus the 0.3 url fields    from "a2a"
  .well-known/agent-skills/index.json  the skills index (discovery 0.2.0), with each skill's
                                     SKILL.md beside it and its sha256 digest              from "skills"
  .well-known/api-catalog            RFC 9727 linkset of every endpoint above
  auth.md                            how an agent signs in, as the site writes it           from "auth_md"
                                     (site-kit#361). No OAuth metadata is written here: RFC 8414 and RFC 9728 both want
                                     a document to name the address it is served from, so a site whose MCP is behind
                                     another host's OAuth redirects those paths to that host's own documents.
  .well-known/ard.json               one AI Catalog 1.0 document, written at both paths: ard.json is ARD's current name
  .well-known/ai-catalog.json        (spec/ard.md 5.1), ai-catalog.json its predecessor, which the isitagentready scanner
                                     reads. The host and an entry for each card and the index, each a valid ARD entry
                                     with 2 to 5 representativeQueries
  .well-known/poppy.json             Poppy, the Personal Agent Protocol 1.0 (site-kit#410, #411):  from "mcp", signed out
                                     protocol_version, organization (name, domain) and apis: [the public MCP]. Written only
                                     for an MCP on 2025-06-18 or later (Poppy's floor) and a site with no sign-in (no
                                     "auth_md"): a site that signs people in needs Poppy's auth block and an issuer that names
                                     it, which come with Key's side (doorman#102). The MCP uses no Session claims, so it may
                                     take Poppy's Session header without verifying it (spec 5.2). A2A isn't a Poppy type.
  link_header()                      the home page's Link header: the api-catalog, the agent card, llms.txt, ard, ai-catalog
  HEAD_LINKS                         the page head's <link rel="ard"> and <link rel="ai-catalog">, for a site whose build
                                     wrote the catalog

site-templates' agents.py writes its agent card and mcp.json through agent_card() and mcp_json() here: one writer.
Standard library only.

  The config lives outside .sitekit/, which site_sync verify keeps to the kit's locked files (a Jekyll site: _data/agents.json).

  python3 discovery.py dns-aid <agents.json>
    prints the site's DNS-AID records (herdos#3980), one per line as `<hostname> HTTPS '<rdata>'`, the form herdos
    ops/cloudflare.sh dns-record add takes: _index._agents always, _mcp._agents and _a2a._agents only for a block the
    config has. Each is ServiceMode (priority 1) at the service's own host, alpn h3,h2 on port 443.

  python3 discovery.py build <agents.json> <out dir> [--root DIR] [--offline]
    writes the files under <out dir> and prints the Link header line; --root is where "skills" paths are read from
    (default: the config's folder's parent). It refuses an endpoint that answers 404 or does not answer, unless --offline.
"""
import argparse
import hashlib
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

SERVER_CARD_SCHEMA = "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json"
SKILLS_SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json"
SKILL_NAME = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
# The server card's name is a reverse-DNS namespace and a name, as the MCP registry's server.json has it: com.example/site.
CARD_NAME = re.compile(r"^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$")
# "webmcp" belongs to site-kit's webmcp plugin (site-kit#330), which reads it from the same config; nothing here reads it.
TOP = {"origin", "name", "description", "docs", "contact", "mcp", "a2a", "skills", "webmcp", "auth_md"}
# Each block's keys: a misspelled one (rate_limit) is refused, not left to ship a default in silence (maint-review-2 on #346).
MCP_KEYS = {"name", "title", "description", "version", "url", "protocol_versions", "tools", "queries", "access", "rate_limits"}
A2A_KEYS = {"url", "protocol_version", "version", "skills", "queries", "security_schemes"}
# a2a.security_schemes (superintelligentfoo#1048): how an agent signs in to the site, as A2A 0.3's securitySchemes. Only for
# a sign-up the site really has (herdos public-site.md's agent-auth rule reads it); OAuth 2.0 or OpenID Connect, https only.
SCHEME_TYPES = {"oauth2", "openIdConnect"}
# Only A2A 0.3's own keys reach the public card (0.3 exactly: deviceCode is newer, so it is refused) (mi-dev-3 on site-kit#568): any other key could carry a secret.
SCHEME_KEYS = {"oauth2": {"type", "description", "flows", "oauth2MetadataUrl"}, "openIdConnect": {"type", "description", "openIdConnectUrl"}}
FLOW_KEYS = {"authorizationCode": {"authorizationUrl", "tokenUrl", "refreshUrl", "scopes"},
             "clientCredentials": {"tokenUrl", "refreshUrl", "scopes"}, "implicit": {"authorizationUrl", "refreshUrl", "scopes"},
             "password": {"tokenUrl", "refreshUrl", "scopes"}}
SCHEME_MAX = 4096   # bytes of one scheme as JSON; a card has at most 5
# A value that looks like a key: a Stripe-style sk_/rk_/pk_ prefix anywhere, or, outside a URL, a run of 32+ letters and
# digits holding both. A URL keeps its tenant GUIDs, key ids and base64url segments (mi-dev-3 on #568: Entra's issuer).
SECRET_PREFIX = re.compile(r"(?<![A-Za-z0-9])(?:sk|rk|pk)_[A-Za-z0-9_]{8,}")
SECRET_RUN = re.compile(r"(?=[A-Za-z0-9_-]{32,})(?=[A-Za-z_-]*[0-9])(?=[0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}")
SCHEME_NAME = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
# One document at both names, each with its own link relation (herdos#3873).
CATALOGS = {".well-known/ard.json": "ard", ".well-known/ai-catalog.json": "ai-catalog"}
CATALOG_SPEC = "1.0"
HEAD_LINKS = tuple(f'<link rel="{rel}" href="/{path}">' for path, rel in CATALOGS.items())


def _texts(v, least, most):
    return isinstance(v, list) and least <= len(v) <= most and all(isinstance(q, str) and q.strip() for q in v)


def problems(cfg):
    """Every problem with a config; an empty list is a config build() can write."""
    if not isinstance(cfg, dict):
        return ["the config is a JSON object"]
    out = [f"unknown key {k!r}" for k in sorted(set(cfg) - TOP)]
    for k in ("origin", "name", "description"):
        if not isinstance(cfg.get(k), str) or not cfg.get(k).strip():
            out.append(f"{k} must be text")
    if isinstance(cfg.get("origin"), str) and not re.fullmatch(r"https://[a-z0-9.-]+", cfg["origin"]):
        out.append("origin must be https://host, with no path or trailing slash")
    if "docs" in cfg and not (isinstance(cfg["docs"], str) and cfg["docs"].startswith("/")):
        out.append("docs must be a path on the site, like /how-this-site-is-built/")
    if "contact" in cfg and not (isinstance(cfg["contact"], str) and re.fullmatch(r"(https://|mailto:)\S+", cfg["contact"])):
        out.append("contact must be an https URL or a mailto: address")
    for k in ("mcp", "a2a"):
        if k in cfg and not isinstance(cfg[k], dict):
            out.append(f"{k} is an object")
    if "skills" in cfg and not isinstance(cfg["skills"], list):
        out.append("skills is a list")
    m = cfg.get("mcp") if isinstance(cfg.get("mcp"), dict) else None
    if m is not None:
        out += [f"unknown key mcp.{k}" for k in sorted(set(m) - MCP_KEYS)]
        for k in ("name", "description", "version", "url"):
            if not isinstance(m.get(k), str) or not m.get(k):
                out.append(f"mcp.{k} must be text")
        if isinstance(m.get("name"), str) and not CARD_NAME.fullmatch(m["name"]):
            out.append("mcp.name is a reverse-DNS namespace and a name, like com.example/site")
        if isinstance(m.get("url"), str) and not m["url"].startswith("https://"):
            out.append("mcp.url must be https")
        if not (isinstance(m.get("protocol_versions"), list) and m["protocol_versions"]):
            out.append("mcp.protocol_versions must list at least one MCP protocol version")
        if "queries" in m and not _texts(m["queries"], 2, 5):
            out.append("mcp.queries lists 2 to 5 questions")
        for k in ("access", "rate_limits"):
            if k in m and not (isinstance(m[k], str) and m[k].strip()):
                out.append(f"mcp.{k} must be text")
    a = cfg.get("a2a") if isinstance(cfg.get("a2a"), dict) else None
    if a is not None:
        out += [f"unknown key a2a.{k}" for k in sorted(set(a) - A2A_KEYS)]
        if not (isinstance(a.get("url"), str) and a["url"].startswith("https://")):
            out.append("a2a.url must be https")
        if not isinstance(a.get("skills"), list) or not a["skills"]:
            out.append("a2a.skills must list at least one skill")
        if "security_schemes" in a:
            out += scheme_problems(a["security_schemes"])
        if "queries" in a and not _texts(a["queries"], 2, 5):
            out.append("a2a.queries lists 2 to 5 questions")
    if "auth_md" in cfg and not auth_md_ok(cfg["auth_md"]):
        out.append(AUTH_MD_RULE)
    seen = set()
    for i, s in enumerate(cfg.get("skills") if isinstance(cfg.get("skills"), list) else []):
        w = f"skills[{i}]"
        if not (isinstance(s, dict) and isinstance(s.get("name"), str) and SKILL_NAME.fullmatch(s["name"])
                and len(s["name"]) <= 64):
            out.append(f"{w}: name is 1-64 lowercase letters, digits and single hyphens")
            continue
        if s["name"] in seen:
            out.append(f"{w}: {s['name']} is listed twice")
        seen.add(s["name"])
        if not isinstance(s.get("description"), str) or not s["description"] or len(s["description"]) > 1024:
            out.append(f"{w}: description is text, at most 1024 characters")
        # Exactly skills/<name>/SKILL.md (site-kit#357's security read): a record the site agent can edit must never name
        # another repo file (an env file, private data) to be published as a "skill".
        if s.get("path") != f"skills/{s['name']}/SKILL.md":
            out.append(f"{w}: path is exactly skills/{s['name']}/SKILL.md")
        if "queries" in s and not _texts(s["queries"], 1, 5):
            out.append(f"{w}: queries lists 1 to 5 questions")
    if not out:
        for e in catalog_entries(cfg):
            if len(e["representativeQueries"]) < 2:
                out.append(f"{e['identifier']}: fewer than 2 representativeQueries can be made from its own words; "
                           "give its block a queries list")
    return out


def scheme_problems(ss):
    if not (isinstance(ss, dict) and 1 <= len(ss) <= 5):
        return ["a2a.security_schemes is an object of 1 to 5 named schemes"]
    out = []
    for name, sc in ss.items():
        w = f"a2a.security_schemes.{name}"
        if not SCHEME_NAME.fullmatch(name):
            out.append(f"{w}: a scheme name is 1-64 letters, digits, _ or -")
        if not (isinstance(sc, dict) and sc.get("type") in SCHEME_TYPES):
            out.append(f"{w}: type is oauth2 or openIdConnect")
            continue
        out += [f"{w}: {k} is not a key of an {sc['type']} scheme ({', '.join(sorted(SCHEME_KEYS[sc['type']]))})"
                for k in sorted(set(sc) - SCHEME_KEYS[sc["type"]])]
        if "description" in sc and not (isinstance(sc["description"], str) and sc["description"].strip()):
            out.append(f"{w}: description is text")
        if sc["type"] == "oauth2" and not (isinstance(sc.get("flows"), dict) and sc["flows"]):
            out.append(f"{w}: an oauth2 scheme names its flows")
        elif sc["type"] == "oauth2":
            for flow, f in sc["flows"].items():
                if flow not in FLOW_KEYS or not isinstance(f, dict):
                    out.append(f"{w}.flows: {flow} is not a flow ({', '.join(sorted(FLOW_KEYS))})")
                    continue
                out += [f"{w}.flows.{flow}: {k} is not a key of the flow" for k in sorted(set(f) - FLOW_KEYS[flow])]
                if not (isinstance(f.get("scopes"), dict) and all(isinstance(v, str) for v in f["scopes"].values())):
                    out.append(f"{w}.flows.{flow}: scopes is an object of scope names and their descriptions")
        if len(json.dumps(sc, ensure_ascii=False).encode()) > SCHEME_MAX:
            out.append(f"{w}: a scheme is at most {SCHEME_MAX} bytes")
        for s in _strings(sc):
            if "{{" in s:
                out.append(f"{w}: holds a {{{{...}}}}")
            if SECRET_PREFIX.search(s) or (not s.startswith("https://") and SECRET_RUN.search(s)):
                out.append(f"{w}: holds what looks like a secret key; a card is public")
        if sc["type"] == "openIdConnect" and not isinstance(sc.get("openIdConnectUrl"), str):
            out.append(f"{w}: an openIdConnect scheme names its openIdConnectUrl")
        out += [f"{w}: {k} must be an https URL" for k, v in _urls(sc) if not re.fullmatch(r"https://\S+", v)]
    return out


def _strings(node):
    """Every key and string value in a scheme, at any depth."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield k
            yield from _strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from _strings(v)
    elif isinstance(node, str):
        yield node


def _urls(node):
    """(key, value) for every URL-valued key in a scheme (authorizationUrl, tokenUrl, refreshUrl, openIdConnectUrl...)."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k.endswith("Url"):
                yield k, v if isinstance(v, str) else ""
            else:
                yield from _urls(v)


def _docs(cfg):
    return cfg["origin"] + cfg.get("docs", "/llms.txt")


def server_card(cfg):
    m = cfg["mcp"]
    card = {"$schema": SERVER_CARD_SCHEMA, "name": m["name"], "version": m["version"], "description": m["description"]}
    if m.get("title"):
        card["title"] = m["title"]
    card["websiteUrl"] = cfg["origin"] + "/"
    card["remotes"] = [{"type": "streamable-http", "url": m["url"], "supportedProtocolVersions": list(m["protocol_versions"])}]
    return card


def mcp_json(cfg, contact):
    """The older /.well-known/mcp.json summary, kept for the agents that already read it."""
    m = cfg["mcp"]
    return {"schema_version": "1.0", "name": cfg["name"], "description": m["description"],
            "protocol_version": m["protocol_versions"][0], "transport": "streamable-http", "endpoints": {"public": m["url"]},
            "auth": {"tiers": [{"name": "public", "required": False, "description": m.get("access", "No sign-in; public pages only.")}]},
            "rate_limits": {"note": m.get("rate_limits", "Cloudflare's own limits; every call is a read of a published page.")},
            "documentation": _docs(cfg), "contact": contact, "license": "All rights reserved",
            "tools_summary": [dict(t) for t in m.get("tools", [])]}


def agent_card(cfg):
    """A2A's card: supportedInterfaces (the current shape) first, and the 0.3.0 url fields that older clients read."""
    a = cfg["a2a"]
    version = a.get("protocol_version", "0.3")
    return {"protocolVersion": "0.3.0", "name": cfg["name"], "description": cfg["description"],
            "supportedInterfaces": [{"url": a["url"], "protocolBinding": "JSONRPC", "protocolVersion": version}],
            "url": a["url"], "preferredTransport": "JSONRPC",
            "provider": {"organization": cfg["name"], "url": cfg["origin"] + "/"},
            "version": a.get("version", "0.1.0"), "documentationUrl": _docs(cfg),
            "capabilities": {"streaming": False, "pushNotifications": False},
            "defaultInputModes": ["text/plain"], "defaultOutputModes": ["text/plain"],
            "skills": [dict(s) for s in a["skills"]],
            **({"securitySchemes": a["security_schemes"], "security": [{n: []} for n in sorted(a["security_schemes"])]}
               if a.get("security_schemes") else {})}


def skill_bytes(root, rel):
    """A SKILL.md's bytes, only from a regular file inside root with no link on the way (maint-review on site-kit#317:
    a linked path would publish whatever it points at, /etc/hosts included)."""
    parts = pathlib.PurePosixPath(rel).parts
    if not parts or parts[-1] != "SKILL.md" or any(x.startswith(".") for x in parts):
        raise ValueError(f"{rel}: a skill is published only from a SKILL.md, with no hidden or parent folder on the way")
    base = pathlib.Path(root).resolve()
    p = base
    for part in pathlib.PurePosixPath(rel).parts:
        p = p / part
        if p.is_symlink():
            raise ValueError(f"{rel}: {p.relative_to(base)} is a link; a skill is published only from a regular file in the repo")
    if not p.is_file() or base not in p.resolve().parents:
        raise ValueError(f"{rel}: not a regular file inside {base}")
    return p.read_bytes()


def skill_files(cfg, root):
    """{site path: bytes} of each skill's SKILL.md, published beside the index, and the index with each one's digest."""
    out, entries = {}, []
    for s in cfg.get("skills") or []:
        data = skill_bytes(root, s["path"])
        rel = f".well-known/agent-skills/{s['name']}/SKILL.md"
        out[rel] = data
        entries.append({"name": s["name"], "type": "skill-md", "description": s["description"], "url": "/" + rel,
                        "digest": "sha256:" + hashlib.sha256(data).hexdigest()})
    if entries:
        out[".well-known/agent-skills/index.json"] = _json({"$schema": SKILLS_SCHEMA, "skills": entries})
    return out


def api_catalog(cfg, has):
    """RFC 9727: one item per endpoint the site really serves, each with its machine-readable card and its docs."""
    o = cfg["origin"]
    anchor = o + "/.well-known/api-catalog"
    items, meta = [], []
    if "mcp" in has:
        items.append({"href": cfg["mcp"]["url"]})
        meta.append({"anchor": cfg["mcp"]["url"],
                     "service-desc": [{"href": o + "/.well-known/mcp/server-card.json", "type": "application/mcp-server-card+json"}],
                     "service-doc": [{"href": _docs(cfg), "type": "text/html"}]})
    if "a2a" in has:
        items.append({"href": cfg["a2a"]["url"]})
        meta.append({"anchor": cfg["a2a"]["url"],
                     "service-desc": [{"href": o + "/.well-known/agent-card.json", "type": "application/a2a-agent-card+json"}],
                     "service-doc": [{"href": _docs(cfg), "type": "text/html"}]})
    return {"linkset": [{"anchor": anchor, "item": items}] + meta}


AUTH_MD_RULE = "auth_md must be text, at most 20000 characters"


def auth_md_ok(value):
    """The one rule for a site's auth.md text, here and in a template site's layout record (doorman#192)."""
    return isinstance(value, str) and bool(value.strip()) and len(value) <= 20000 and _utf8(value)


def _utf8(text):
    """True when the text encodes as UTF-8 (a lone surrogate from JSON's \\ud800 does not)."""
    try:
        text.encode()
        return True
    except UnicodeEncodeError:
        return False


def _phrase(text):
    """A description's first sentence as a short query: no parenthetical, no closing stop."""
    first = re.split(r"(?<=[.!?])\s", text.strip(), maxsplit=1)[0]
    return re.sub(r"\s*\([^)]*\)", "", first).rstrip(" .!?:")


def _first_five(queries):
    out = []
    for q in queries:
        if q and q not in out:
            out.append(q)
    return out[:5]


def _made(texts):
    """representativeQueries made from a block's real words: each text's first sentence, the first five, no repeats."""
    return _first_five(_phrase(t) for t in texts if isinstance(t, str))


def catalog_entries(cfg):
    """One AI Catalog entry per card the site publishes, each identified as urn:air:<domain>:<namespace>:<name>."""
    host = cfg["origin"].removeprefix("https://")
    o, entries = cfg["origin"], []
    m, a, skills = cfg.get("mcp"), cfg.get("a2a"), cfg.get("skills") or []
    if m:
        entries.append({"identifier": f"urn:air:{host}:mcp:{m['name'].split('/')[-1]}", "displayName": m.get("title") or cfg["name"],
                        "type": "application/mcp-server-card+json", "url": o + "/.well-known/mcp/server-card.json",
                        "description": m["description"],
                        "representativeQueries": m.get("queries") or _made(
                            [m["description"]] + [t.get("description") for t in m.get("tools", []) if isinstance(t, dict)])})
    if a:
        entries.append({"identifier": f"urn:air:{host}:a2a:agent", "displayName": cfg["name"],
                        "type": "application/a2a-agent-card+json", "url": o + "/.well-known/agent-card.json",
                        "description": cfg["description"],
                        "representativeQueries": a.get("queries") or _made(
                            [s.get("name") for s in a["skills"] if isinstance(s, dict)] + [cfg["description"]])})
    if skills:
        entries.append({"identifier": f"urn:air:{host}:skills:index", "displayName": f"{cfg['name']} skills",
                        "type": "application/agent-skills+json", "url": o + "/.well-known/agent-skills/index.json",
                        "description": "Installable Agent Skills, each with its sha256 digest.",
                        "representativeQueries": _first_five(q for s in skills for q in s.get("queries") or [_phrase(s["description"])])})
    return entries


def ai_catalog(cfg):
    """AI Catalog 1.0 (github.com/Agent-Card/ai-catalog): the site as its host, and its entries."""
    return {"specVersion": CATALOG_SPEC,
            "host": {"displayName": cfg["name"], "identifier": cfg["origin"].removeprefix("https://"), "documentationUrl": _docs(cfg)},
            "entries": catalog_entries(cfg)}


# Poppy lists an MCP only from this protocol version on (spec: Streamable HTTP, MCP 2025-06-18 or later).
POPPY_MCP_FROM = "2025-06-18"
# Only a dated version counts toward that floor: "draft", "latest" or "2025-6-18" would pass a plain string compare.
MCP_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


def poppy(cfg):
    """The Poppy file (Personal Agent Protocol 1.0, /.well-known/poppy.json) for a signed-out site, or None when the site
    has nothing Poppy lists: no public MCP on a protocol version Poppy takes, or a site that signs people in."""
    m = cfg.get("mcp")
    if not m or cfg.get("auth_md") or not any(isinstance(v, str) and MCP_DATE.fullmatch(v) and v >= POPPY_MCP_FROM for v in m["protocol_versions"]):
        return None
    return {"protocol_version": "1.0", "organization": {"name": cfg["name"], "domain": _host(cfg["origin"])},
            "apis": [{"type": "mcp", "url": m["url"], "description": m["description"]}]}


def link_header(has):
    """The home page's Link header value (RFC 8288), naming only files the site publishes."""
    links = []
    if has & {"mcp", "a2a"}:
        links.append('</.well-known/api-catalog>; rel="api-catalog"')
    if "a2a" in has:
        links.append('</.well-known/agent-card.json>; rel="describedby"; type="application/json"')
    links.append('</llms.txt>; rel="describedby"; type="text/markdown"')
    if has & {"mcp", "a2a", "skills"}:
        links += [f'</{path}>; rel="{rel}"; type="application/json"' for path, rel in CATALOGS.items()]
    return ", ".join(links)


def _json(data):
    return (json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode()


def build(cfg, root, contact=None):
    """{site path: bytes} for every file the config has the thing behind."""
    has = {k for k in ("mcp", "a2a", "skills") if cfg.get(k)}
    out = {}
    if "mcp" in has:
        out[".well-known/mcp/server-card.json"] = _json(server_card(cfg))
        out[".well-known/mcp.json"] = _json(mcp_json(cfg, contact or cfg.get("contact") or cfg["origin"] + "/"))
    if "a2a" in has:
        out[".well-known/agent-card.json"] = _json(agent_card(cfg))
    out.update(skill_files(cfg, root))
    if has & {"mcp", "a2a"}:
        out[".well-known/api-catalog"] = _json(api_catalog(cfg, has))
    if has:
        doc = _json(ai_catalog(cfg))
        out.update(dict.fromkeys(CATALOGS, doc))
    if cfg.get("auth_md"):
        out["auth.md"] = cfg["auth_md"].rstrip("\n").encode() + b"\n"
    doc = poppy(cfg)
    if doc:
        out[".well-known/poppy.json"] = _json(doc)
    return out, link_header(has)


# A DNS name, strictly: the only text from the config that reaches a printed record line, which a person or
# ops/cloudflare.sh reads. No quote, space, userinfo, port or trailing dot can pass (the security read on herdos#3980).
DNS_NAME = re.compile(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}")


def _host(url):
    """The host of an https URL, or ValueError unless it is a plain DNS name."""
    m = re.fullmatch(r"https://([^/?#]+)(?:[/?#].*)?", url, re.S)
    host = m.group(1) if m else ""
    if not DNS_NAME.fullmatch(host):
        raise ValueError(f"{url!r} has no plain DNS host name")
    return host


def dns_aid(cfg):
    """[(hostname, type, rdata)] for the DNS-AID records the site really has (herdos#3980): the index at the site's own host,
    and an MCP or A2A record at that service's host. ServiceMode only; the target is a real host with its trailing dot."""
    zone = _host(cfg["origin"])
    out = [(f"_index._agents.{zone}", "HTTPS", f'1 {zone}. alpn="h3,h2" port=443')]
    for k in ("mcp", "a2a"):
        if cfg.get(k):
            out.append((f"_{k}._agents.{zone}", "HTTPS", f'1 {_host(cfg[k]["url"])}. alpn="h3,h2" port=443 mandatory=alpn,port'))
    return out


def endpoints(cfg):
    return [u for u in ((cfg.get("mcp") or {}).get("url"), (cfg.get("a2a") or {}).get("url")) if u]


def dead(url, opener=urllib.request.urlopen):
    """Why an endpoint can't be listed, or "" when it answers. An MCP or A2A endpoint answers a plain GET with 405 or 406,
    which still proves it is there; only no answer, a 404/410 or a server error counts as dead."""
    try:
        opener(urllib.request.Request(url, method="GET", headers={"User-Agent": "site-kit agent-discovery"}), timeout=10)
        return ""
    except urllib.error.HTTPError as e:
        return "" if e.code < 500 and e.code not in (404, 410) else f"{url} answers {e.code}"
    except (urllib.error.URLError, OSError) as e:
        return f"{url} does not answer ({e})"


def main(argv=None, opener=urllib.request.urlopen):
    p = argparse.ArgumentParser(prog="discovery.py")
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("config")
    b.add_argument("out")
    b.add_argument("--root")
    b.add_argument("--offline", action="store_true")
    d = sub.add_parser("dns-aid")
    d.add_argument("config")
    a = p.parse_args(argv)
    cfg_path = pathlib.Path(a.config)
    cfg = json.loads(cfg_path.read_text())
    errs = problems(cfg)
    if a.cmd == "dns-aid":
        if errs:
            for e in errs:
                print(f"discovery: {e}", file=sys.stderr)
            return 1
        try:
            records = dns_aid(cfg)
        except ValueError as e:
            print(f"discovery: {e}", file=sys.stderr)
            return 1
        for name, kind, rdata in records:
            print(f"{name} {kind} '{rdata}'")
        return 0
    if not a.offline:
        errs += [d for d in (dead(u, opener) for u in endpoints(cfg)) if d]
    if errs:
        for e in errs:
            print(f"discovery: {e}", file=sys.stderr)
        return 1
    root = pathlib.Path(a.root) if a.root else cfg_path.resolve().parent.parent
    try:
        files, link = build(cfg, root)
    except ValueError as e:
        print(f"discovery: {e}", file=sys.stderr)
        return 1
    out = pathlib.Path(a.out)
    for rel, data in files.items():
        f = out / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(data)
    print(f"Link: {link}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
