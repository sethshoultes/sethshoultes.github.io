#!/usr/bin/env python3
"""site_sync.py (site-kit#6): put the reuse-first check into a site repo, and check later that it is still the released one.

    python3 <kit>/scripts/site_sync.py sync <ref> [--skills=a,b]   run in the site's root; <ref> is a site-kit tag or commit
    python3 -I .sitekit/site_sync.py verify         run in CI (templates/site-check.yml) before the check itself

`sync` copies the check (`.sitekit/site_check.py`), the catalog (`.sitekit/catalog.json`), this script (`.sitekit/site_sync.py`),
the CI workflow (`.github/workflows/site-check.yml`) and the merged-PR memory workflow with its script (`.github/workflows/site-memory.yml`,
`.sitekit/memory_line.py`, site-kit#255) out of site-kit at <ref>, and writes `.sitekit/kit.lock` with the commit
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

The workflow is the one vendored file sync writes differently per site (site-kit#213): each `{{site-check paths}}` line in the
template becomes a `paths:` list of what the check reads (`check_paths`), so a pull request that touches none of them runs
nothing. The lock records the list, and its hash is over the written bytes, so `verify` still catches a hand edit; when
features.json changes, the list it gives no longer matches the lock and `verify` asks for a re-sync."""
import hashlib
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
}
LOCK = ".sitekit/kit.lock"
# The site's own records: brand.json (skills/brand, #108) and layout.json (skills/site-templates, #136).
ALLOWED_IN_SITEKIT = {"kit.lock", "features.json", "brand.json", "layout.json"}
SKILL_NAME = re.compile(r"[a-z0-9][a-z0-9-]*\Z")
WORKFLOW = ".github/workflows/site-check.yml"
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


def sync(ref, root=".", kit=None, skills=None):
    root = pathlib.Path(root)
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
    for dest, src in FILES.items():
        out = subprocess.run(["git", "-C", str(kit), "show", f"{commit}:{src}"], capture_output=True)
        if out.returncode:
            raise SystemExit(f"{src} is not in site-kit at {ref}")
        got[dest] = out.stdout
    for name in skills:
        listing = subprocess.run(["git", "-C", str(kit), "ls-tree", "-r", "-z", "--name-only", commit, "--", f"skills/{name}/"], capture_output=True, text=True)
        paths = [x for x in listing.stdout.split("\0") if x]
        if f"skills/{name}/SKILL.md" not in paths:
            raise SystemExit(f"site-kit has no skill {name!r} at {ref}")
        for path in paths:
            got[path] = subprocess.run(["git", "-C", str(kit), "show", f"{commit}:{path}"], capture_output=True, check=True).stdout
    paths = check_paths(root, skills)
    got[WORKFLOW] = render_workflow(got[WORKFLOW], paths)
    lock = {"ref": ref, "commit": commit, "files": {d: sha(b) for d, b in sorted(got.items())}, "skills": skills, "paths": paths}
    dropped = sorted(set(before) - set(skills))   # a skill the new lock leaves out loses its folder too (game-dev-2 on #149)
    for dest in [*got, *(f"skills/{n}/SKILL.md" for n in dropped)]:   # never write, or delete, through a symlinked folder
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


def verify(root="."):
    """A list of problems; empty means the vendored files are the locked ones."""
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
    problems = [f"{LOCK} does not list {d}" for d in FILES if d not in want]
    if "paths" not in lock or lock["paths"] != check_paths(root, skills):
        problems.append(f"{WORKFLOW}'s paths no longer match .sitekit/features.json: re-run site_sync.py sync, so the check runs on what it reads")
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
    allowed = {pathlib.PurePosixPath(d).name for d in FILES if d.startswith(".sitekit/")} | ALLOWED_IN_SITEKIT
    if sitekit.is_dir():
        problems += [f".sitekit/{e.name} is not a locked file: only {', '.join(sorted(allowed))} may be there" for e in sorted(sitekit.iterdir()) if e.name not in allowed]
    for dest, digest in want.items():
        if dest not in FILES and not in_skill(dest, skills):
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
    if len(argv) in (3, 4) and argv[1] == "sync" and (len(argv) == 3 or argv[3].startswith("--skills=")):
        skills = None if len(argv) == 3 else [n for n in argv[3].removeprefix("--skills=").split(",") if n]
        lock = sync(argv[2], skills=skills)
        print(f"vendored site-kit {lock['ref']} ({lock['commit'][:10]}): {len(lock['files'])} files, skills: {', '.join(lock['skills']) or 'none'}")
        return 0
    if len(argv) == 2 and argv[1] == "verify":
        problems = verify()
        for p in problems:
            print("FAIL", p)
        if not problems:
            print("site_sync: the vendored check is the locked release")
        return 1 if problems else 0
    print("usage: site_sync.py sync <tag-or-commit> [--skills=a,b]   |   site_sync.py verify", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
