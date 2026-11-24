"""preview-feedback (site-agent#259 part a): the build half. The page gets nothing at build time: the edge injects the client.

`files()` writes functions/plugins/preview-feedback/feedback-data.json with the plugin's four settings, so a site carries them in
its plugin config (filled from the registry by site_sync) and not only as FEEDBACK_* variables set by hand. The edge reads them
first; a FEEDBACK_* variable that is set still wins, so a site's own [vars] keep working. All four may be left out: the edge then
reads the variables alone, as before 0.17.0.

0.18.0: a setting the config leaves empty comes from the registry (site-agent#259 part a). The site's row in its vendored
.sitekit/catalog.json, found by the repository its git origin names, gives the site key and the Pages project; its studio
platform gives the agent and the Studio hosts, with the site's own hosts after them. A site with no row, no studio or no
catalog gets nothing from it. 0.19.0: a row's `pagesHost` (the project's *.pages.dev subdomain when it isn't the project name)
is the preview host its pins match.

Settings: `site`, the site's key in the site agent (FEEDBACK_SITE); `agent`, the site agent's https address (FEEDBACK_AGENT);
`studio`, the Studio origins that may greet the page (FEEDBACK_STUDIO), at most four, space-separated; `pages_project`, the
Cloudflare Pages project whose branch previews take pins (FEEDBACK_PAGES_PROJECT). A wrong one stops the build."""
import json
import pathlib
import re
import subprocess
import urllib.parse

SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
MAX_STUDIO = 4


def origin(name, value):
    """A bare https origin (scheme and host, no path, user or port games), or a plain reason why not."""
    parts = urllib.parse.urlsplit(value)
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.password or value != f"https://{parts.netloc}" \
            or parts.netloc != parts.netloc.lower():
        raise ValueError(f'{name} "{value}" must be a bare https:// origin, like https://agent.example.com')
    return value


def text(config, name):
    value = config.get(name, "")
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValueError(f"{name} must be text")
    return value.strip()


ROOT = pathlib.Path(__file__).resolve().parents[2]   # the site: <site>/plugins/preview-feedback/plugin.py


def repo(root):
    """owner/name, lower case, from the site's GitHub origin remote (as site_sync reads it), or None."""
    out = subprocess.run(["git", "-C", str(root), "remote", "get-url", "origin"], capture_output=True, text=True)
    m = re.fullmatch(r"(?:git@github\.com:|https://github\.com/|ssh://git@github\.com/)([\w.-]+/[\w.-]+?)(?:\.git)?/?", out.stdout.strip())
    return m.group(1).lower() if out.returncode == 0 and m else None


def registry(root=None):
    """The four settings the registry gives this site, or {} when it gives none."""
    root = pathlib.Path(root or ROOT)
    try:
        catalog = json.loads((root / ".sitekit" / "catalog.json").read_text())
    except (OSError, ValueError):
        return {}
    name = repo(root)
    if not name or not isinstance(catalog, dict):
        return {}
    sites, platforms = catalog.get("sites"), catalog.get("platforms")
    sites = sites if isinstance(sites, dict) else {}
    platforms = platforms if isinstance(platforms, dict) else {}
    rows = [(k, v) for k, v in sites.items() if isinstance(v, dict) and str(v.get("repo", "")).lower() == name]
    if len(rows) != 1 or not isinstance(rows[0][1].get("studio"), dict):
        return {}
    key, studio = rows[0][0], rows[0][1]["studio"]
    platform = platforms.get(studio.get("platform"))
    platform = platform if isinstance(platform, dict) else {}
    out = {"site": key, "pages_project": studio.get("pagesHost") or studio.get("pagesProject", "")}   # previews: <branch>.<this>.pages.dev
    if platform.get("agent"):
        out["agent"] = platform["agent"]
    hosts = [*(platform.get("studio") or []), *(studio.get("hosts") or [])]
    if hosts:
        out["studio"] = " ".join(dict.fromkeys(hosts))
    return out


def files(ctx):
    settings = registry()   # the site's own config wins over the registry, except where it leaves a setting empty
    settings.update({k: v for k, v in ctx.config.items() if not (isinstance(v, str) and not v.strip())})
    config = {}
    for name in ("site", "pages_project"):
        value = text(settings, name)
        if value and not SLUG.match(value):
            raise ValueError(f'{name} "{value}" must be a lowercase slug (letters, digits and hyphens)')
        if value:
            config[name] = value
    agent = text(settings, "agent")
    if agent:
        config["agent"] = origin("agent", agent)
    studio = text(settings, "studio").split()
    if len(studio) > MAX_STUDIO:
        raise ValueError(f"studio names {len(studio)} origins; a site greets at most {MAX_STUDIO}")
    if studio:
        config["studio"] = " ".join(origin("studio", s) for s in studio)
    return {"feedback-data.json": json.dumps({"config": config}, indent=2) + "\n"}


hooks = {}
