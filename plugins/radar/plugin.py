"""radar (superintelligentfoo#94): the build half. Cookieless page views for Foo's Radar.

The build adds nothing to any page (0.1.1). The site key is a Pages secret, visible only to the edge at runtime and never at
build time, so the edge (edge.js) adds the one deferred script, /assets/plugins/radar/assets/radar.js, to HTML pages, and only once
that secret is set: until then Radar is a true no-op. The script sends one beacon per page view to the site's own POST /api/radar.
`files()` writes functions/plugins/radar/radar-data.json with the plugin's two settings for the edge code, which passes the page
view on to the collector server to server.

Settings: `collect_url`, the full address of the site's Radar collector in Foo, and `key_var`, the NAME of the environment
variable (a Pages secret the site owner sets) that holds its site key; `ingest_url`, the Radar service's ingest
(https://<radar>/v1/ingest, 0.2, site-kit#426), and `ingest_key_var`, the NAME of the Pages secret that holds the site's ingest
key, set from stdin and never written anywhere else. A config needs at least one of collect_url and ingest_url: with neither, or
with one that isn't a plain https address, the build stops, so a half-configured Radar never ships. The plugin never holds a
key."""
import json
import urllib.parse


def https_url(ctx, name):
    """ctx.config's `name`, or None when it is unset or empty; refused with a plain reason unless it is a plain https address."""
    url = ctx.config.get(name, "")
    if url is None or (isinstance(url, str) and not url.strip()):
        return None
    if not isinstance(url, str):
        raise ValueError(f"{name} must be a text https:// address")
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.password or url != url.strip():
        raise ValueError(f'{name} "{url}" must be a plain https:// address with a host (and no user or password in it)')
    return url


def var_name(ctx, name, default):
    value = ctx.config.get(name, default)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} is empty: it names the Pages secret that holds the key (default {default})")
    return value


def files(ctx):
    collect, ingest = https_url(ctx, "collect_url"), https_url(ctx, "ingest_url")
    if not collect and not ingest:
        raise ValueError("radar needs collect_url (Foo's Radar collector, e.g. https://<foo api host>/api/v1/radar/collect) "
                         "or ingest_url (the Radar service, e.g. https://<radar host>/v1/ingest), or both")
    config = {"key_var": var_name(ctx, "key_var", "RADAR_SITE_KEY"), "ingest_key_var": var_name(ctx, "ingest_key_var", "RADAR_INGEST_KEY")}
    if collect:
        config["collect_url"] = collect
    if ingest:
        config["ingest_url"] = ingest
    return {"radar-data.json": json.dumps({"config": config}, indent=2) + "\n"}


hooks = {}
