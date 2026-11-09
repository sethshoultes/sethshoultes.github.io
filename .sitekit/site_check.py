#!/usr/bin/env python3
"""The reuse-first check each site repo runs in CI (site-kit#6, Seth 2026-11-05):

    python3 site_check.py --catalog catalog.json --repo "$GITHUB_REPOSITORY" [--root .]   (--repo is required: the site is the repository's, not the file's)

It fails a site with no SOUL.md (its sections, a link to the style guide, no template placeholder left) or no style guide, and any
feature that is not in the site-kit catalog: a plugin folder, a function (a file under functions/ that exports an onRequest
handler), or a page type. The way out is never to switch the check off: it is a plugin proposal in site-kit, ruled on before any
code. The owner approves it by adding {"ref", "kind", "name"} to that site's "approved" list in site-kit's catalog/sites.json,
bound to that one feature; then the site's .sitekit/features.json lists the feature as site-only with the ref. "existing" covers
only the names in the site's "baseline" in site-kit (what it had when it adopted the rule), so it cannot be used for anything new. A baseline
lists existing FEATURES, not frozen code: the site keeps editing its own mcp.js; what an edit to an existing feature does is the PR
reader's job, not this check's. Another known limit: a site with no page types in the catalog that keeps them in a file other than
data/types.json has them checked only through the file its features.json names.

What the check always does, whatever .sitekit/features.json says: scan functions/ and plugins/ (declared extra directories only
add to that), match a plugin folder against the catalog by a hash of its files (an edited or forked copy fails), and take the
site's name from the repository, not from the file. The catalog, this script and the features file are vendored into the site
(kit-sync) and byte-compared with a pinned site-kit tag in CI, with CODEOWNERS on .sitekit/ and the workflow: that is what makes
the owner's approval binding.

.sitekit/features.json (in the site repo; every key but site_only, post_images and memory_lines is required):
  { "site": "smores", "soul": "SOUL.md", "style_guide": "canon/STYLEGUIDE.md", "plugins_dir": "plugins",
    "functions_dirs": ["functions"], "page_types_file": "data/types.json" | null, "post_images": true | false,
    "memory_lines": true | false,
    "site_only": [ {"kind": "plugin|function|page_type", "name": "...", "proposal": "site-kit#N|existing", "why": "..."} ] }

Featured images (site-kit#214, Seth: "posts always need a featured image unless the site has them turned off"): a site with a
blog (data/blog.json) fails when a post in it has no "image" and "image_alt", unless "post_images" is false.

Memory lines (site-kit#255): the vendored site-memory workflow adds one line to .agent/memory/ after each merged pull request,
unless "memory_lines" is false (a busy repo whose open pull requests must stay up to date with main)."""
import hashlib
import json
import os
import pathlib
import re
import sys

SOUL_SECTIONS = ("Style guide", "Who it is for", "Voice and look", "Non-negotiables", "Reuse")
#: The only memory file names the site agent's read_brain reads (site-agent src/tools.js, site-kit#255): a month file, or one
#: note per change with an 8-lowercase-hex id. Any other file under .agent/memory/ is memory no one reads.
MEMORY_NOTE = re.compile(r"\.agent/memory/[0-9]{4}-[0-9]{2}/[0-9]{4}-[0-9]{2}-[0-9]{2}(?:-[0-9]{6})?-[0-9a-f]{8}\.md\Z")
MEMORY_MONTH = re.compile(r"\.agent/memory/[0-9]{4}-[0-9]{2}\.md\Z")
BRAIN_DEFAULTS = {"soul": "SOUL.md", "style_guide": "canon/STYLEGUIDE.md"}
KINDS = ("plugin", "function", "page_type")
REF = re.compile(r"site-kit#\d+")
CODE = (".js", ".mjs", ".ts", ".tsx", ".jsx")
# What Pages Functions treats as a route or middleware: an export named onRequest, onRequestGet, onRequestPost, ...
# Fail-safe: a code file is counted if it mentions onRequest anywhere (however it is exported: `export const { onRequest } = ...`,
# `export /* c */ const onRequest`) or exports something while using a \u or \x escape, or a string export name (`export { h as "..." }`), either of which could spell it. A helper module that
# only has a comment about onRequest is counted too; list it, or reword the comment.
ROUTE = re.compile(r"onRequest|\bexport\b[\s\S]*\\[ux][0-9a-fA-F{]|\bexport(?:[\s\ufeff]|/\*[\s\S]*?\*/|//[^\n]*)*[*{]")
KEYS = ("site", "soul", "style_guide", "plugins_dir", "functions_dirs", "page_types_file")


def label(kind):
    return kind.replace("_", " ")


def hashed(rel):
    """Whether a file at this path (parts) inside a plugin folder is part of the plugin's fingerprint. Anything else (tests, hidden
    folders, caches) is NOT covered by the hash, so a copy of it under functions/plugins/ is never trusted as generated."""
    return not (rel[0] == "tests" or any(x.startswith(".") or x == "__pycache__" for x in rel))


def plugin_hash(folder):
    """The library's fingerprint of a plugin folder (scripts/catalog.py computes the same): its files, not its tests or caches."""
    h = hashlib.sha256()
    for f in sorted(p for p in folder.rglob("*") if p.is_file()):
        rel = f.relative_to(folder).parts
        if not hashed(rel):
            continue
        h.update("/".join(rel).encode() + b"\0" + f.read_bytes() + b"\0")
    return h.hexdigest()


def _hash_or_none(folder):
    try:
        return plugin_hash(folder)
    except OSError:   # an unreadable file in a plugin is a mismatch, never a crash
        return None


def _text(path):
    try:
        return path.read_text(), None
    except (OSError, UnicodeDecodeError) as err:
        return None, f"{path.name} cannot be read as text: {err}"


def _features(root):
    path = root / ".sitekit" / "features.json"
    if not path.is_file():
        return None, [".sitekit/features.json is missing: it names the site and lists its site-only features"]
    text, err = _text(path)
    if err:
        return None, [f".sitekit/features.json {err}"]
    try:
        f = json.loads(text)
    except json.JSONDecodeError as e:
        return None, [f".sitekit/features.json is not valid JSON: {e}"]
    if not isinstance(f, dict):
        return None, [".sitekit/features.json must be an object"]
    bad = [f'.sitekit/features.json is missing "{k}"' for k in KEYS if k not in f]
    for k in ("site", "soul", "style_guide", "plugins_dir"):
        if k in f and not (isinstance(f[k], str) and f[k]):
            bad.append(f'.sitekit/features.json "{k}" must be text')
    if "functions_dirs" in f and not (isinstance(f["functions_dirs"], list) and f["functions_dirs"] and all(isinstance(x, str) and x for x in f["functions_dirs"])):
        bad.append('.sitekit/features.json "functions_dirs" must be a non-empty list of directories')
    if "post_images" in f and not isinstance(f["post_images"], bool):
        bad.append('.sitekit/features.json "post_images" must be true or false (false turns featured images off for this site)')
    if "memory_lines" in f and not isinstance(f["memory_lines"], bool):
        bad.append('.sitekit/features.json "memory_lines" must be true or false (false turns merged-PR memory lines off for this site)')
    if "page_types_file" in f and not (f["page_types_file"] is None or (isinstance(f["page_types_file"], str) and f["page_types_file"])):
        bad.append('.sitekit/features.json "page_types_file" must be a path, or null for a site with none')
    entries = f.get("site_only", [])
    if not isinstance(entries, list):
        bad.append(".sitekit/features.json site_only must be a list")
        entries = []
    for e in entries:
        if not isinstance(e, dict) or e.get("kind") not in KINDS or not isinstance(e.get("name"), str):
            bad.append(f'.sitekit/features.json site_only entry {e!r} needs a "kind" ({", ".join(KINDS)}) and a "name"')
        elif not (e.get("proposal") == "existing" or (isinstance(e.get("proposal"), str) and REF.fullmatch(e["proposal"]))):
            bad.append(f'.sitekit/features.json {label(e["kind"])} {e["name"]}: "proposal" must be "site-kit#N" or "existing"')
    return (None, bad) if bad else (f, [])


HTML_TAGS = ("a", "abbr", "article", "aside", "audio", "b", "blockquote", "br", "caption", "center", "cite", "code", "dd", "del", "details", "div", "dl",
             "dt", "em", "figcaption", "figure", "footer", "h[1-6]", "header", "hr", "i", "img", "ins", "kbd", "li", "main", "mark", "nav", "ol", "p",
             "picture", "pre", "q", "s", "section", "small", "source", "span", "strike", "strong", "sub", "summary", "sup", "table", "tbody", "td",
             "tfoot", "th", "thead", "time", "tr", "u", "ul", "video")


def _post_images(root, f):
    """Every post in the site's data/blog.json has a featured image ("image" and "image_alt"), unless the site turned them off."""
    blog = root / "data" / "blog.json"
    if f.get("post_images", True) is False or not blog.is_file():
        return []
    text, err = _text(blog)
    if err:
        return [f"data/blog.json {err}"]
    try:
        posts = json.loads(text).get("posts")
    except (json.JSONDecodeError, AttributeError):
        return ['data/blog.json is not {"posts": [...]}: the check cannot see whether each post has its featured image']
    if not isinstance(posts, list):
        return ['data/blog.json is not {"posts": [...]}: the check cannot see whether each post has its featured image']
    return [f'data/blog.json post {p.get("slug") if isinstance(p, dict) else repr(p)} has no featured image: it needs "image" and "image_alt" '
            '(site-kit#214); a site without post images sets "post_images": false in .sitekit/features.json'
            for p in posts if not (isinstance(p, dict) and isinstance(p.get("image"), str) and p["image"].strip()
                                   and isinstance(p.get("image_alt"), str) and p["image_alt"].strip())]


def _links_to(section, target):
    """True if the markdown in `section` links to `target` (inline, ./ prefix and #anchor allowed, or a reference-style link)."""
    def norm(t):
        t = t.strip().strip("<>").split("#")[0]
        return t[2:] if t.startswith("./") else t
    want = norm(target)
    inline = [m for m in re.findall(r"\]\(\s*([^)\s]+)[^)]*\)", section)]
    refs = re.findall(r"^\s*\[[^\]]+\]:\s*(\S+)", section, re.M)
    used_refs = set(re.findall(r"\]\[([^\]]+)\]", section)) | set(re.findall(r"(?<!\])\[([^\]]+)\](?!\(|:)", section))
    ref_defs = dict((m.group(1).lower(), m.group(2)) for m in re.finditer(r"^\s*\[([^\]]+)\]:\s*(\S+)", section, re.M))
    targets = inline + [ref_defs[r.lower()] for r in used_refs if r.lower() in ref_defs]
    return any(norm(t) == want for t in targets)


def _soul(root, f):
    out = []
    path = root / f["soul"]
    style = f["style_guide"]
    if not path.is_file():
        out.append(f"{path.name} is missing: every site keeps one at its root (templates/SOUL.md in site-kit)")
    else:
        text, err = _text(path)
        if err:
            return [err]
        for s in SOUL_SECTIONS:
            if not re.search(rf"^##\s+{re.escape(s)}\b", text, re.M | re.I):
                out.append(f'{path.name} has no "{s}" section')
        plain = re.sub(r"```.*?```|~~~.*?~~~", "", text, flags=re.S)
        plain = re.sub(r"`[^`\n]*`|\]\([^)]*\)|<https?://[^>\s]*>|</?(?:%s)(?:\s[^<>]*)?/?>" % "|".join(HTML_TAGS), "", plain, flags=re.I)   # code, link targets, autolinks, real HTML tags
        # What is left in angle brackets, starting a word (not a comparison like a<b), with no = (an attribute) is the template's own
        # <placeholder>.
        ph = re.search(r"(?<![\w<])<[A-Za-z][^<>=\n]*>", plain)
        if ph:
            out.append(f"{path.name} still has a placeholder from the template, {ph.group(0)!r}: fill it in (or, if it is real text, put it in backticks)")
        first = re.search(r"^##\s+Style guide\b(.*?)(?=^##\s|\Z)", text, re.M | re.S | re.I)
        if not first or not _links_to(first.group(1), style):
            out.append(f"{path.name} must link the style guide ({style}) as a markdown link in its Style guide section")
    if not (root / style).is_file():
        out.append(f"the style guide {style} is missing")
    return out


def _routes(base, root, verified_plugins, plugins_root):
    """Every file under `base` that Pages Functions serves: a code file that may export an onRequest handler. A file under
    functions/plugins/<name>/ is the plugins' own edge code (the build copies it verbatim) and is not a site function ONLY when the
    plugin is registered for the site, its folder matches the catalog's hash, and the file is byte-equal to the plugin's own."""
    out = []
    for f in sorted(p for p in base.rglob("*") if p.is_file() and p.suffix in CODE):
        rel = f.relative_to(base).parts
        if base.name == "functions" and len(rel) >= 3 and rel[0] == "plugins" and rel[1] in verified_plugins:
            own = plugins_root / rel[1] / pathlib.PurePosixPath(*rel[2:])
            try:
                if hashed(rel[2:]) and own.is_file() and own.read_bytes() == f.read_bytes():
                    continue
            except OSError:
                pass
        text, err = _text(f)
        if err or ROUTE.search(text):   # an unreadable code file is counted, never trusted
            out.append(f.relative_to(root).as_posix())
    return out


# A site entry names its repository exactly ("repo") or, for a family of sites made from one product, by a pattern
# ("repo_pattern", site-kit#158): an owner, a slash, a name prefix of at least 4 characters and one * at the end; the *
# matches a-z, 0-9 and -. A short prefix ("o/f*") would take most of an owner's repositories. "repo_exclude" names, exactly,
# the repositories the pattern would match that are not of the family (maint-review-2 on #168: foo-agent is not a customer).
REPO_PATTERN = re.compile(r"[A-Za-z0-9-]+/[a-z0-9-]{4,}\*")


def pattern_matches(pattern, repo):
    return bool(REPO_PATTERN.fullmatch(pattern)) and re.fullmatch(re.escape(pattern[:-1]) + r"[a-z0-9-]+", repo) is not None


def site_for(sites, repo):
    """(the catalog's site for this repository, or None; a problem, or None). An exact repo wins; else the one pattern that
    matches it. Two patterns matching one repository is a problem, never a guess."""
    entries = [(n, i) for n, i in sites.items() if isinstance(i, dict)] if isinstance(sites, dict) else []
    exact = [n for n, i in entries if i.get("repo") == repo]
    if exact:
        return exact[0], None
    matched = [(n, i) for n, i in entries if isinstance(i.get("repo_pattern"), str) and pattern_matches(i["repo_pattern"], repo)]
    for n, i in matched:
        x = i.get("repo_exclude", [])
        if not (isinstance(x, list) and all(isinstance(r, str) for r in x)):
            # Fail closed (mi-dev-1 on #169): an exclude list of the wrong shape must not let an excluded repo back in.
            return None, f'site "{n}": repo_exclude is not a list of repositories, so {repo} cannot be placed; the catalog is broken'
    hits = sorted(n for n, i in matched if repo not in i.get("repo_exclude", []))
    if len(hits) > 1:
        return None, f"repository {repo} matches more than one repo_pattern in the site-kit catalog ({', '.join(hits)})"
    return (hits[0] if hits else None), None


def _memory(root):
    """Every file under .agent/memory/ the site agent would never read, by its name (site-kit#255)."""
    # git keeps a symlink as one link entry, so the site agent reads nothing through one: a link anywhere is memory no one reads
    for rel in (".agent", ".agent/memory"):
        if (root / rel).is_symlink():
            return [f"{rel} is a symlink: the site agent reads memory only from the repo itself"]
    base = root / ".agent" / "memory"
    if not base.is_dir():
        return []
    out = []
    for p in sorted(base.rglob("*")):
        rel = p.relative_to(root).as_posix()
        if p.is_symlink():
            out.append(f"{rel} is a symlink: the site agent reads memory only from the repo itself")
            continue
        if p.is_dir() or p.name == ".gitkeep":
            continue
        if not (MEMORY_NOTE.match(rel) or MEMORY_MONTH.match(rel)):
            out.append(f"{rel} is a memory file the site agent never reads: name it .agent/memory/YYYY-MM/YYYY-MM-DD-HHMMSS-<8 hex>.md (site-kit#255)")
    return out


def brain(root):
    """Only the brain (site-kit#255): SOUL.md and its style guide at the default paths, and memory the site agent can read. For a
    site that is not a site_sync site (no catalog entry or features.json), such as one that vendors only site-kit's checks."""
    root = pathlib.Path(root)
    return _soul(root, BRAIN_DEFAULTS) + _memory(root)


def check(root, catalog, site=None):
    """Everything wrong with the site at `root` against the catalog, as a list of messages; empty means it passes."""
    root = pathlib.Path(root)
    if not isinstance(catalog, dict):
        return ["the catalog is not a JSON object"]
    f, problems = _features(root)
    if f is None:
        return problems
    site = site or f["site"]
    sites = catalog.get("sites")
    reg = sites.get(site) if isinstance(sites, dict) else None
    if not isinstance(reg, dict):
        return [f'site "{site}" is not in the site-kit catalog (catalog/sites.json): the site-kit owner registers a site first']
    if f["site"] != site:
        problems.append(f'.sitekit/features.json says the site is "{f["site"]}" but this repository is "{site}" in the catalog')
    problems += _soul(root, f)
    problems += _memory(root)
    problems += _post_images(root, f)
    baseline = reg.get("baseline") if isinstance(reg.get("baseline"), dict) else {}
    approved = {(a.get("ref"), a.get("kind"), a.get("name")) for a in (reg.get("approved") if isinstance(reg.get("approved"), list) else []) if isinstance(a, dict)}
    listed = {(e["kind"], e["name"]): e for e in f.get("site_only", [])}
    seen = set()
    way_out = ("it is not in the site-kit catalog: open a plugin proposal issue in site-kit; once the owner approves it for this site, "
               "list it in .sitekit/features.json as site-only with the proposal's ref (or reuse a plugin from CATALOG.md)")

    def verdict(kind, name, catalogued, extra=""):
        seen.add((kind, name))
        e = listed.get((kind, name))
        if catalogued:
            if e:
                problems.append(f"{label(kind)} {name}: the catalog now has it; remove it from site_only in .sitekit/features.json")
            return
        if not e:
            problems.append(f"{label(kind)} {name} {extra or way_out}")
        elif e["proposal"] == "existing":
            if name not in (baseline.get(kind + "s") or []):
                problems.append(f'{label(kind)} {name}: "existing" covers only what the site had when it adopted the rule (its baseline in site-kit); '
                                f"this is new: open a plugin proposal")
            elif not e.get("why"):
                problems.append(f'{label(kind)} {name}: a site-only entry needs a "why"')
        elif (e["proposal"], kind, name) not in approved:
            problems.append(f"{label(kind)} {name}: proposal {e['proposal']} is not approved for this site and feature "
                            f"(the site-kit owner adds it to this site's approved list in catalog/sites.json)")
        elif not e.get("why"):
            problems.append(f'{label(kind)} {name}: a site-only entry needs a "why"')

    # plugins: scanned always, from plugins/ and the declared directory; matched by the hash of their files
    by_plugin = {p.get("name"): p for p in (catalog.get("plugins") if isinstance(catalog.get("plugins"), list) else []) if isinstance(p, dict)}
    verified = set()
    registered = reg.get("plugins") if isinstance(reg.get("plugins"), dict) else {}
    pdirs = {root / "plugins", root / f["plugins_dir"]}
    if not (root / f["plugins_dir"]).is_dir() and f["plugins_dir"] != "plugins":
        problems.append(f'.sitekit/features.json plugins_dir "{f["plugins_dir"]}" does not exist')
    for pdir in sorted(pdirs):
        for d in sorted(p for p in pdir.iterdir() if p.is_dir()) if pdir.is_dir() else []:
            cat = by_plugin.get(d.name)
            if cat is None:
                verdict("plugin", d.name, False)
            elif d.name not in registered:
                verdict("plugin", d.name, False, "is in the catalog but this site is not registered as using it: the owner adds it to this site's plugins in site-kit's catalog/sites.json")
            elif _hash_or_none(d) != cat.get("hash"):
                verdict("plugin", d.name, False, "differs from the catalog's copy (edited, forked or out of date): run kit-sync for the current version, and change a plugin in site-kit, never in the site")
            else:
                verdict("plugin", d.name, True)
                if d.parent == root / "plugins":
                    verified.add(d.name)

    # functions: scanned always from functions/, and from any other declared directory
    fdirs = {root / "functions"} | {root / d for d in f["functions_dirs"]}
    for d in f["functions_dirs"]:
        if not (root / d).is_dir():
            problems.append(f'.sitekit/features.json functions_dirs "{d}" does not exist')
    for fdir in sorted(fdirs):
        for rel in _routes(fdir, root, verified, root / "plugins") if fdir.is_dir() else []:
            verdict("function", rel, False)

    # Cloudflare Pages "advanced mode": a _worker.js (a file or a folder) or a _routes.json anywhere in the repository serves requests
    # without a functions/ file, so each is a function the site has to account for (a build output folder is where they live).
    walk_errors = []
    for dirpath, dirnames, filenames in os.walk(root, onerror=walk_errors.append):
        if pathlib.Path(dirpath) == root:    # only the top-level .git is skipped; node_modules is scanned (CI checks out a clean tree, and
            dirnames[:] = [d for d in dirnames if d != ".git"]    # wrangler.toml could point the Pages output folder inside it)
        for d in sorted(dirnames):
            if (pathlib.Path(dirpath) / d).is_symlink():
                problems.append(f"{(pathlib.Path(dirpath) / d).relative_to(root).as_posix()} is a symlink to a folder: the check does not follow it, so it cannot see what is behind it")
        for name in sorted(dirnames + filenames):
            if name in ("_worker.js", "_routes.json"):
                verdict("function", (pathlib.Path(dirpath) / name).relative_to(root).as_posix(), False)

    if (root / ".gitmodules").exists():
        problems.append(".gitmodules: CI does not fetch submodules, so the check cannot see the code inside them (a submodule can hold functions/ or a worker)")
    problems += [f"{e.filename} could not be read ({e.strerror}): the check cannot see what is in it" for e in walk_errors]

    # page types
    tf = f["page_types_file"]
    types = []
    listed_here = [t.get("name") for t in (catalog.get("page_types") if isinstance(catalog.get("page_types"), list) else []) if isinstance(t, dict) and site in (t.get("sites") if isinstance(t.get("sites"), list) else [])]
    if tf is None:
        if listed_here:
            problems.append(f'.sitekit/features.json page_types_file is null but the catalog lists page types for this site ({", ".join(sorted(map(str, listed_here)))}): name the file that holds them')
        if (root / "data" / "types.json").is_file():
            problems.append('.sitekit/features.json page_types_file is null but data/types.json exists: name it')
    elif not (root / tf).is_file():
        problems.append(f'.sitekit/features.json page_types_file "{tf}" does not exist (use null for a site with no page types)')
    else:
        text, err = _text(root / tf)
        try:
            data = json.loads(text) if not err else None
        except json.JSONDecodeError:
            data = None
        if not isinstance(data, dict):
            problems.append(f"{tf} must be a JSON object keyed by page-type name")
        else:
            types = sorted(data)
    have = set(listed_here)
    for t in types:
        verdict("page_type", t, t in have)

    for (kind, name), e in sorted(listed.items()):
        if (kind, name) not in seen:
            problems.append(f"{label(kind)} {name}: listed as site-only but no longer in the site; remove it from .sitekit/features.json")
    return problems


def main(argv):
    def arg(flag):
        if flag in argv:
            i = argv.index(flag)
            return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith("--") else ""
        return None
    cat_path, repo, root = arg("--catalog"), arg("--repo"), arg("--root")
    if "--brain" in argv and (cat_path is not None or repo is not None):
        print("usage: site_check.py --brain [--root DIR] runs only the brain checks; with --catalog or --repo, run the full check without --brain")
        return 2
    if "--brain" in argv and root != "":
        problems = brain(root or ".")
        for p in problems:
            print(f"FAIL {p}")
        print("site_check --brain: " + ("OK" if not problems else f"{len(problems)} problem(s): a site has its brain (site-kit#255; scripts/brain.py new writes one)."))
        return 1 if problems else 0
    if not cat_path or not repo or root == "":
        print("usage: site_check.py --catalog catalog.json --repo owner/name [--root DIR]   (--repo names the site from the catalog's registry; CI passes $GITHUB_REPOSITORY)")
        print("       site_check.py --brain [--root DIR]   (only SOUL.md, its style guide and readable memory names, for a site with no catalog entry)")
        return 2
    try:
        catalog = json.loads(pathlib.Path(cat_path).read_text())
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as err:
        print(f"site_check: the catalog {cat_path} cannot be read: {err}")
        return 2
    sites = catalog.get("sites") if isinstance(catalog, dict) else None
    site, ambiguous = site_for(sites, repo)
    if ambiguous:
        print(f"FAIL {ambiguous}")
        return 1
    if site is None:
        print(f"FAIL repository {repo} is not a site in the site-kit catalog (catalog/sites.json)")
        return 1
    problems = check(pathlib.Path(root or "."), catalog, site)
    for p in problems:
        print(f"FAIL {p}")
    print("site_check: " + ("OK" if not problems else f"{len(problems)} problem(s). The fix is a linked, approved proposal, never turning this check off."))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
