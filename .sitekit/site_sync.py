#!/usr/bin/env python3
"""site_sync.py (site-kit#6): put the reuse-first check into a site repo, and check later that it is still the released one.

    python3 <kit>/scripts/site_sync.py sync <ref> [--skills=a,b] [--check=workflow|central] [--memory=yes|no]   run in the site's root; <ref> is a site-kit tag or commit
    python3 -I .sitekit/site_sync.py verify         run in CI (templates/site-check.yml) before the check itself

`sync` copies the check (`.sitekit/site_check.py`), the catalog (`.sitekit/catalog.json`), this script (`.sitekit/site_sync.py`),
the CI workflow (`.github/workflows/site-check.yml`) and the merged-PR memory workflow with its script (`.github/workflows/site-memory.yml`,
`.sitekit/memory_line.py`, site-kit#255), and on a family site (layout.json's footer or features.json "family": true, site-kit#428)
the family list `.sitekit/family.json` and its check `.sitekit/family.py` (deleted again at the next sync once the site turns
it off), out of site-kit at <ref>,
and writes `.sitekit/kit.lock` with the commit
and the sha256 of each. `--skills=a,b` also vendors those skills (`skills/<name>/` in site-kit, to the same path in the site) and
locks every file in them (site-kit#136); a later `sync <ref>` without it keeps the locked skills, so they move with the kit, and
a skill left out of `--skills=` is dropped from the lock and its folder deleted. Sync leaves each skill folder exactly the release (a stale file or `__pycache__` goes)
and refuses to write through a symlinked folder. `verify` fails when any of them differs from kit.lock, when `.sitekit/` holds anything but those files,
kit.lock, features.json, brand.json and layout.json (a stray `hashlib.py` there would otherwise replace a library module: the workflow also runs both
scripts with `python3 -I`), when a locked skill's folder holds a file the lock doesn't list (bytecode included), and when
a vendored path is a symlink, and when the workflow's paths no longer match the site's features.json. Hashes are taken over the committed bytes, so a site
`.gitattributes` that rewrites line endings on these files makes verify fail; keep them binary (`-text`). The lock is in the same repo, so the real control is CODEOWNERS
(templates/CODEOWNERS): the owner reviews every change to .sitekit/ and the workflow. The sites' repos are private, so CI cannot
fetch site-kit; that is why the files are vendored.

`--check=central` (superintelligentfoo#201, the lead's option 2) is for a site that carries no workflow file at all, a Foo
customer site: its check runs centrally on our box against the site and reports a commit status, never on a GitHub-hosted
runner. Sync then vendors everything but `.github/workflows/`, deletes any workflow files there, and records `"check":
"central"` in the lock; `verify` stops asking for the workflows and fails if one is there. `--memory=yes` (stampwithshelly#1)
is the one exception: a central site that opts in keeps `site-memory.yml`, and the lock records `"memory": true`. A later
sync keeps the lock's memory, as it keeps the check, until `--memory=no` turns it off. A Foo customer site never opts in,
so it stays workflow-free: sync refuses `--memory=yes`, and verify fails it, for a repository the registry places in a
product family (a `repo_pattern` entry, like Foo's `sethshoultes/foo-*`), or whose repository it cannot read from git. A later sync keeps the lock's check,
as it keeps skills, until `--check=workflow` names the other.

The workflow is the one vendored file sync writes differently per site (site-kit#213): each `{{site-check paths}}` line in the
template becomes a `paths:` list of what the check reads (`check_paths`), so a pull request that touches none of them runs
nothing. The lock records the list, and its hash is over the written bytes, so `verify` still catches a hand edit; when
features.json changes, the list it gives no longer matches the lock and `verify` asks for a re-sync."""
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import sys

FILES = {                       # path in the site -> path in site-kit
    ".sitekit/site_check.py": "scripts/site_check.py",
    ".sitekit/catalog.json": "catalog.json",
    ".sitekit/site_sync.py": "scripts/site_sync.py",
    ".github/workflows/site-check.yml": "templates/site-check.yml",
    # site-kit#255: one memory line per merged pull request, in the site's brain.
    ".sitekit/memory_line.py": "scripts/memory_line.py",
    ".github/workflows/site-memory.yml": "templates/site-memory.yml",
    # site-kit#298: the theme loader and the chain, for a site-templates build's --functions (skills/site-templates/edge.py).
    ".sitekit/theme.py": "theme/theme.py",
    ".sitekit/chain.js": "theme/chain.js",
    # site-kit#428: the Super Intelligent family list a family site's footer, llms.txt and JSON-LD read (site-templates' family.py).
    # Only a family site gets it (FAMILY, is_family): a client's repo never holds the list of Seth's sites. family.py, the list's
    # check and the current-site mark, goes with it for a site with its own builder (Foo's tools/www), so none copies them.
    ".sitekit/family.json": "catalog/family.json",
    ".sitekit/family.py": "skills/site-templates/family.py",
    # site-kit#488: the family's one theme a month, which monthly-edition's issue menu shows on every family site.
    ".sitekit/editions.json": "catalog/editions.json",
    # site-kit#521: the family's one cast (authors and the readers the sites are written for), read by bylines and briefs.
    ".sitekit/cast.json": "catalog/cast.json",
}
FAMILY = (".sitekit/family.json", ".sitekit/family.py", ".sitekit/editions.json", ".sitekit/cast.json")
LOCK = ".sitekit/kit.lock"
# The site's own records: brand.json (skills/brand, #108), layout.json (skills/site-templates, #136) and its plugins'
# settings, plugins.json (site-templates' --functions, #298). The docs library's config and the lock docs_sync writes
# (site-kit#485): the build checks the lock against data/docs, so verify only lets them be there.
ALLOWED_IN_SITEKIT = {"kit.lock", "features.json", "brand.json", "layout.json", "plugins.json", "docs.json", "docs.lock"}
SKILL_NAME = re.compile(r"[a-z0-9][a-z0-9-]*\Z")
WORKFLOW = ".github/workflows/site-check.yml"
MEMORY = ".github/workflows/site-memory.yml"
#: superintelligentfoo#201 (the lead's option 2): a Foo customer site carries no workflow file at all. Its check runs centrally
#: on our box and reports a commit status, so `sync --check=central` vendors everything but these, and the lock says so.
WORKFLOWS = tuple(d for d in FILES if d.startswith(".github/workflows/"))


def central_drops(memory):
    """The workflows a central site does not carry: all of them, or all but site-memory.yml when it opted in to memory
    (stampwithshelly#1)."""
    return tuple(d for d in WORKFLOWS if not (memory and d == MEMORY))
CHECKS = ("workflow", "central")


def _record(root, name):
    """The site's own .sitekit/<name> as JSON, or None when it is missing, unreadable or a symlink (site-kit#440)."""
    f = pathlib.Path(root) / ".sitekit" / name
    if f.is_symlink():
        return None
    try:
        return json.loads(f.read_text())
    except (OSError, ValueError):
        return None


def is_family(root):
    """Whether the site is in the Super Intelligent family (site-kit#428): its layout.json's footer says "family": true (a
    site-templates site), or its features.json says "family": true (a site with its own builder, as Foo's tools/www). Only
    true itself counts, and only from the site's own files."""
    layout, features = _record(root, "layout.json"), _record(root, "features.json")
    footer = layout.get("footer") if isinstance(layout, dict) else None
    return (isinstance(footer, dict) and footer.get("family") is True) or (isinstance(features, dict) and features.get("family") is True)


def _kit_catalog(kit):
    """The kit's scripts/catalog.py, for its strict JSON reader (_no_repeats): one reader for the catalog's files."""
    spec = importlib.util.spec_from_file_location("site_kit_catalog", pathlib.Path(kit) / "scripts" / "catalog.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def vendored(check, family=False, memory=False):
    """The vendored files a site with this check carries: all of FILES, or all but the workflows for a central one (bar
    site-memory.yml when it opted in), and the
    family files only on a family site."""
    return {d: s for d, s in FILES.items() if (check != "central" or d not in central_drops(memory)) and (family or d not in FAMILY)}
PATHS_MARKER = "    # {{site-check paths}}\n"
#: A path features.json may name: canonical (no leading `/` or `./`, no empty, `.` or `..` segment, as GitHub writes the
#: paths it matches, so a filter entry can never miss by spelling) and none of the characters GitHub's path filters treat
#: as a pattern or that could end the quoted YAML value it is written into. A trailing `/` on a folder is allowed.
SAFE_PATH = re.compile(r"(?:[A-Za-z0-9._-]+/)*[A-Za-z0-9._-]+/?\Z")
_DOTS = re.compile(r"(?:^|/)\.\.?(?:/|$)")
#: What the check reads in every site, whatever features.json says (scripts/site_check.py): its own files, the default plugin
#: and function folders, the default page-types file, the blog's posts (their featured images, site-kit#214), submodules, and a
#: Cloudflare worker or routes file anywhere.
ALWAYS_CHECKED = (".sitekit", ".sitekit/**", WORKFLOW, "plugins", "plugins/**", "functions", "functions/**", "data", "data/types.json",
                  "data/blog.json", ".gitmodules", "**/_worker.js", "**/_worker.js/**", "**/_routes.json")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def locked_skills(root):
    """The skills the site's lock lists, or [] when there is no readable lock."""
    try:
        skills = json.loads((pathlib.Path(root) / LOCK).read_text()).get("skills", [])
    except (OSError, ValueError, AttributeError):
        return []
    return skills if isinstance(skills, list) else []


def in_skill(dest, skills):
    """The locked skill a vendored path belongs to, or None."""
    parts = pathlib.PurePosixPath(dest).parts
    if len(parts) > 2 and parts[0] == "skills" and parts[1] in skills and ".." not in parts:
        return parts[1]
    return None


def check_paths(root, skills):
    """The paths the check reads in this site, for the workflow's `paths:` (site-kit#213), sorted; None when features.json
    cannot be read or names a path that is not plain, so the workflow runs on every change, as it did before (the check then
    reports the broken features.json itself)."""
    try:
        f = json.loads((pathlib.Path(root) / ".sitekit" / "features.json").read_text())
    except (OSError, ValueError):
        return None
    if not isinstance(f, dict) or not isinstance(f.get("functions_dirs"), list):
        return None
    files = [f.get("soul"), f.get("style_guide")] + ([] if f.get("page_types_file") is None else [f.get("page_types_file")])
    dirs = [f.get("plugins_dir"), *f["functions_dirs"]]
    if not all(isinstance(x, str) and SAFE_PATH.match(x) and not _DOTS.search(x) for x in files + dirs):
        return None
    dirs = [d.rstrip("/") for d in dirs]
    # Each folder, and every folder above a checked path, by its bare name too: a change to the entry itself (a folder swapped
    # for a symlink or a file) is a change to that path, which `<folder>/**` does not match.
    parents = {str(q) for x in [*files, *dirs] for q in pathlib.PurePosixPath(x).parents if str(q) != "."}
    return sorted({*ALWAYS_CHECKED, *files, *dirs, *parents, *(d + "/**" for d in dirs), *(f"skills/{n}/**" for n in skills)})


def render_workflow(data, paths):
    """The template with each `{{site-check paths}}` line replaced by `paths:` and the list, or removed when there is none."""
    text = data.decode()
    if text.count(PATHS_MARKER) != 2:
        raise SystemExit(f"{WORKFLOW}: the template must hold the paths marker twice (pull_request and push)")
    block = "" if paths is None else PATHS_MARKER.replace("# {{site-check paths}}", "paths:") + "".join(f"      - '{x}'\n" for x in paths)
    return text.replace(PATHS_MARKER, block).encode()


def locked_check(root):
    """The lock's check, "workflow" when it names none (every lock written before #201) or there is no lock yet."""
    try:
        return json.loads((pathlib.Path(root) / LOCK).read_text()).get("check", "workflow")
    except (OSError, ValueError, AttributeError):
        return "workflow"


def site_repo(root):
    """owner/name from the site's origin remote on GitHub, or None when there is none to read."""
    out = subprocess.run(["git", "-C", str(root), "remote", "get-url", "origin"], capture_output=True, text=True)
    m = re.fullmatch(r"(?:git@github\.com:|https://github\.com/|ssh://git@github\.com/)([\w.-]+/[\w.-]+?)(?:\.git)?/?", out.stdout.strip())
    return m.group(1) if out.returncode == 0 and m else None


def memory_refused(catalog_bytes, repo):
    """Why this repository may not opt in to memory, or None (stampwithshelly#1). A product family's sites (a registry entry
    with a repo_pattern, like Foo's customer sites) carry no workflow at all (superintelligentfoo#201), so they never may."""
    if repo is None:
        return "its repository can't be read from git (no GitHub origin remote), so it can't be shown to be outside a product family"
    spec = importlib.util.spec_from_file_location("kit_site_check", pathlib.Path(__file__).resolve().parent / "site_check.py")
    check = importlib.util.module_from_spec(spec)
    # No bytecode: in a site this is .sitekit/site_check.py, and a .sitekit/__pycache__ would fail verify's own
    # "only locked files" check in the same run (#588).
    was, sys.dont_write_bytecode = sys.dont_write_bytecode, True
    try:
        spec.loader.exec_module(check)
    finally:
        sys.dont_write_bytecode = was
    try:
        sites = json.loads(catalog_bytes).get("sites", {})
    except (ValueError, AttributeError):
        return "the catalog can't be read, so it can't be shown to be outside a product family"
    name = repo.lower()   # GitHub names are case-insensitive: SethShoultes/Foo-Acme is sethshoultes/foo-acme (site-dev on #587)
    families = sorted(n for n, i in sites.items() if isinstance(i, dict) and isinstance(i.get("repo_pattern"), str)
                      and check.pattern_matches(i["repo_pattern"].lower(), name)
                      and name not in [x.lower() for x in (i.get("repo_exclude") or []) if isinstance(x, str)])
    return f"{repo} is in the product family {families[0]!r}, whose sites carry no workflow file" if families else None


def locked_memory(root):
    """Whether the lock's central site opted in to memory lines (stampwithshelly#1); False for any other lock or none."""
    try:
        return json.loads((pathlib.Path(root) / LOCK).read_text()).get("memory") is True
    except (OSError, ValueError, AttributeError):
        return False


def sync(ref, root=".", kit=None, skills=None, check=None, memory=None):
    root = pathlib.Path(root)
    check = locked_check(root) if check is None else check   # kept from the lock, as skills are, unless named
    if check not in CHECKS:
        raise SystemExit(f"not a check: {check!r} (workflow or central)")
    memory = locked_memory(root) if memory is None else memory   # kept the same way; it only matters to a central site
    if not isinstance(memory, bool):
        raise SystemExit(f"not a memory setting: {memory!r} (yes or no)")
    memory = memory and check == "central"
    before = [n for n in locked_skills(root) if isinstance(n, str) and SKILL_NAME.match(n)]
    skills = sorted(set(before if skills is None else skills))
    for name in skills:
        if not isinstance(name, str) or not SKILL_NAME.match(name):
            raise SystemExit(f"not a skill name: {name!r}")
    kit = pathlib.Path(kit or pathlib.Path(__file__).resolve().parent.parent)
    commit = subprocess.run(["git", "-C", str(kit), "rev-parse", "--verify", "--end-of-options", f"{ref}^{{commit}}"], capture_output=True, text=True)
    if commit.returncode:
        raise SystemExit(f"site-kit has no tag or commit {ref!r}")
    commit = commit.stdout.strip()
    got = {}
    family = is_family(root)
    for dest, src in vendored(check, family, memory).items():
        out = subprocess.run(["git", "-C", str(kit), "show", f"{commit}:{src}"], capture_output=True)
        if out.returncode:
            raise SystemExit(f"{src} is not in site-kit at {ref}")
        got[dest] = out.stdout
    why = memory_refused(got[".sitekit/catalog.json"], site_repo(root)) if memory else None
    if why:
        raise SystemExit(f"--memory=yes is refused: {why}")
    if ".sitekit/editions.json" in got:   # site-kit#503: a month written twice is refused, by the kit's one strict reader
        try:
            json.loads(got[".sitekit/editions.json"], object_pairs_hook=_kit_catalog(kit)._no_repeats)
        except ValueError as e:
            raise SystemExit(f"catalog/editions.json at {ref} cannot be vendored: {e}")
    for name in skills:
        listing = subprocess.run(["git", "-C", str(kit), "ls-tree", "-r", "-z", "--name-only", commit, "--", f"skills/{name}/"], capture_output=True, text=True)
        paths = [x for x in listing.stdout.split("\0") if x]
        if f"skills/{name}/SKILL.md" not in paths:
            raise SystemExit(f"site-kit has no skill {name!r} at {ref}")
        for path in paths:
            got[path] = subprocess.run(["git", "-C", str(kit), "show", f"{commit}:{path}"], capture_output=True, check=True).stdout
    paths = check_paths(root, skills)
    if check == "workflow":
        got[WORKFLOW] = render_workflow(got[WORKFLOW], paths)
    lock = {"ref": ref, "commit": commit, "check": check, "files": {d: sha(b) for d, b in sorted(got.items())}, "skills": skills, "paths": paths}
    if memory:
        lock["memory"] = True
    dropped = sorted(set(before) - set(skills))   # a skill the new lock leaves out loses its folder too (game-dev-2 on #149)
    gone = list(central_drops(memory)) if check == "central" else []   # a site moving to the central check drops its workflows
    gone += [] if family else list(FAMILY)   # a site that leaves the family drops the list and its check
    for dest in [*got, *gone, *(f"skills/{n}/SKILL.md" for n in dropped)]:   # never write, or delete, through a symlinked folder
        for parent in pathlib.PurePosixPath(dest).parents:
            if str(parent) != "." and (root / parent).is_symlink():
                raise SystemExit(f"{parent} is a symlink in the site: sync refuses to write through it")
    got[LOCK] = (json.dumps(lock, indent=2) + "\n").encode()
    staged = []                 # write every file beside its place first, then move them in: a failure leaves the site as it was
    try:
        for dest, data in got.items():
            target = root / dest
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp = target.with_name(target.name + ".sync-tmp")
            if os.path.lexists(tmp):    # a committed "<file>.sync-tmp" link must not take the write elsewhere (game-dev-3 on #149)
                tmp.unlink()
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o644)
            with os.fdopen(fd, "wb") as f:
                f.write(data)
            staged.append((tmp, target))
        for tmp, target in staged:
            os.replace(tmp, target)
        for dest in gone:
            if os.path.lexists(root / dest):
                (root / dest).unlink()
        for name in skills + dropped:   # anything else in the folder goes, so it is exactly the release (os.walk follows no links)
            for top, dirs, names in os.walk(root / "skills" / name, topdown=False):
                for n in names + [d for d in dirs if os.path.islink(os.path.join(top, d))]:   # a linked folder: the link goes
                    f = pathlib.Path(top) / n
                    if f.relative_to(root).as_posix() not in got:
                        f.unlink()
                if name in dropped:     # bottom-up, so each folder is empty by now
                    os.rmdir(top)
    finally:
        for tmp, _ in staged:
            if tmp.exists():
                tmp.unlink()
    return lock


def kit_files(kit, check, skills, paths, family=False, memory=False):
    """{site path: sha256} of what a sync from this site-kit folder writes: the expected hashes taken from the kit's own bytes,
    never from the site's lock (superintelligentfoo#201: the central check runs on a site whose lock the customer can edit)."""
    kit = pathlib.Path(kit)
    out = {}
    for dest, src in vendored(check, family, memory).items():
        data = (kit / src).read_bytes()
        out[dest] = sha(render_workflow(data, paths) if dest == WORKFLOW else data)
    for name in skills:
        folder = kit / "skills" / name
        if not (folder / "SKILL.md").is_file():
            raise ValueError(f"site-kit has no skill {name!r}")
        for f in sorted(folder.rglob("*")):
            if f.is_file() and "__pycache__" not in f.parts:
                out[f.relative_to(kit).as_posix()] = sha(f.read_bytes())
    return out


def verify(root=".", kit=None):
    """A list of problems; empty means the vendored files are the locked ones. With `kit` (a site-kit folder at the locked
    commit), each file is held to the kit's own bytes instead of the lock's hashes, and the lock only names the check and skills."""
    root = pathlib.Path(root)
    try:
        lock = json.loads((root / LOCK).read_text())
        want = lock["files"]
        if not isinstance(want, dict):
            raise ValueError
    except (OSError, ValueError, KeyError, TypeError):
        return [f"{LOCK} is missing or unreadable: run site_sync.py sync <tag> from site-kit"]
    skills = lock.get("skills", [])
    if not isinstance(skills, list) or not all(isinstance(n, str) and SKILL_NAME.match(n) for n in skills):
        return [f"{LOCK} has a broken skills list: run site_sync.py sync <tag> from site-kit"]
    if kit is not None:
        if lock.get("check", "workflow") not in CHECKS:
            return [f"{LOCK} has a broken check {lock.get('check')!r}: run site_sync.py sync <tag> from site-kit"]
        try:
            kept = want
            want = kit_files(kit, lock.get("check", "workflow"), skills, check_paths(root, skills), is_family(root), lock.get("memory") is True)
        except (OSError, ValueError) as e:
            return [f"the site's lock does not match site-kit at {kit}: {e}"]
        problems = [f"{LOCK} lists {d}, which site-kit at that commit does not vendor" for d in kept if d not in want]
    check = lock.get("check", "workflow")
    if check not in CHECKS:
        return [f"{LOCK} has a broken check {check!r}: run site_sync.py sync <tag> from site-kit"]
    family = is_family(root)
    memory = lock.get("memory") is True and check == "central"
    why = memory_refused((root / ".sitekit/catalog.json").read_bytes(), site_repo(root)) if memory and (root / ".sitekit/catalog.json").is_file() else None
    if memory and not (root / ".sitekit/catalog.json").is_file():
        why = "its catalog is missing, so it can't be shown to be outside a product family"
    problems = (problems if kit is not None else []) + [f"{LOCK} does not list {d}" for d in vendored(check, family, memory) if d not in want]
    if check == "central":   # the box runs the check: a workflow file here would run beside it, unlocked
        problems += [f"{d} is in a site whose check is central: remove it (site_sync.py sync does)" for d in central_drops(memory) if os.path.lexists(root / d)]
        if why:
            problems.append(f"{LOCK} says memory, which this site may not have: {why}")
    if "paths" not in lock or lock["paths"] != check_paths(root, skills):
        what = f"{WORKFLOW}'s paths" if check == "workflow" else f"{LOCK}'s paths"   # a central site has no workflow (eventpresser-dev-2 on #358)
        problems.append(f"{what} no longer match .sitekit/features.json: re-run site_sync.py sync, so the check runs on what it reads")
    for name in skills:
        folder = root / "skills" / name
        if folder.is_symlink() or not folder.is_dir():
            problems.append(f"skills/{name} is missing, or a symlink: re-run site_sync.py sync")
            continue
        if f"skills/{name}/SKILL.md" not in want:
            problems.append(f"{LOCK} does not list skills/{name}/SKILL.md")
        for f in sorted(folder.rglob("*")):
            rel = f.relative_to(root).as_posix()
            if rel not in want and (f.is_symlink() or not f.is_dir()):   # bytecode too: an unchecked-hash .pyc runs unread
                problems.append(f"{rel} is in a locked skill but not in {LOCK}: re-run site_sync.py sync, never add files by hand")
    sitekit = root / ".sitekit"
    allowed = {pathlib.PurePosixPath(d).name for d in vendored(check, family, memory) if d.startswith(".sitekit/")} | ALLOWED_IN_SITEKIT
    if sitekit.is_dir():
        problems += [f".sitekit/{e.name} is not a locked file: only {', '.join(sorted(allowed))} may be there" for e in sorted(sitekit.iterdir()) if e.name not in allowed]
    for dest, digest in want.items():
        if dest not in vendored(check, family, memory) and not in_skill(dest, skills):
            problems.append(f"{LOCK} lists {dest}, which is not a file the sync vendors")
            continue
        if (root / dest).is_symlink():
            problems.append(f"{dest} is a symlink: it must be the released file itself")
            continue
        try:
            actual = sha((root / dest).read_bytes())
        except OSError:
            problems.append(f"{dest} is missing or not a file")
            continue
        if actual != digest:
            problems.append(f"{dest} differs from the released copy in {LOCK}: re-run site_sync.py sync, never edit it by hand")
    return problems


def main(argv):
    opts = argv[3:]
    if len(argv) >= 3 and argv[1] == "sync" and len(opts) <= 3 and all(o.startswith(("--skills=", "--check=", "--memory=")) for o in opts) \
            and len({o.split("=", 1)[0] for o in opts}) == len(opts):
        named = dict(o[2:].split("=", 1) for o in opts)
        skills = [n for n in named["skills"].split(",") if n] if "skills" in named else None
        if named.get("memory", "yes") not in ("yes", "no"):
            raise SystemExit(f"not a memory setting: {named['memory']!r} (yes or no)")
        memory = named["memory"] == "yes" if "memory" in named else None
        lock = sync(argv[2], skills=skills, check=named.get("check"), memory=memory)
        print(f"vendored site-kit {lock['ref']} ({lock['commit'][:10]}): {len(lock['files'])} files, skills: {', '.join(lock['skills']) or 'none'}, check: {lock['check']}"
              + (", memory: yes" if lock.get("memory") else ""))
        return 0
    if argv[1:2] == ["verify"] and (len(argv) == 2 or (len(argv) == 3 and argv[2].startswith("--kit=") and argv[2] != "--kit=")):
        problems = verify(kit=argv[2].removeprefix("--kit=") if len(argv) == 3 else None)
        for p in problems:
            print("FAIL", p)
        if not problems:
            print("site_sync: the vendored check is the locked release")
        return 1 if problems else 0
    print("usage: site_sync.py sync <tag-or-commit> [--skills=a,b] [--check=workflow|central] [--memory=yes|no]   |   site_sync.py verify [--kit=<site-kit folder>]", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
