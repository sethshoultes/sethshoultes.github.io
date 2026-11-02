#!/usr/bin/env python3
"""Pick the tests a change needs from a repo's test map (docs/standards/tests-and-ci.md, rules 1 and 3).

  test-map-select.py --map .github/test-map.json --changed changed.txt [--deploy-changed deploy.txt] [--all]

--changed is a file with one changed path per line (git diff --name-only). --all (a nightly or manual run) selects
the full suite. --deploy-changed is the same kind of list measured from the commit now being served to HEAD (rule 7): deploy=true when
any of those paths is in `deploy`, so a source change whose own run failed still deploys with the next merge. Those paths also
count for area and core selection, so a deploy that ships an earlier failed change reruns that change's tests. Without it, deploy
is judged from --changed. Prints three GitHub Actions outputs: areas=<json list>, full=true|false, deploy=true|false.
A changed path in no area, not in `core`, not in `ignore` fails by name (exit 1), so the map stays complete.
"""
import argparse, json, re, sys


def glob_re(pattern):
    # ** crosses directories, * stays inside one, ? is one character; everything else is literal.
    out, i = "", 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out += "(?:.*/)?"; i += 3
        elif pattern.startswith("**", i):
            out += ".*"; i += 2
        elif pattern[i] == "*":
            out += "[^/]*"; i += 1
        elif pattern[i] == "?":
            out += "[^/]"; i += 1
        else:
            out += re.escape(pattern[i]); i += 1
    return re.compile("^" + out + "$")


def matches(path, patterns):
    return any(glob_re(p).match(path) for p in patterns)


def select(test_map, changed, run_all=False, deploy_changed=None):
    areas = test_map["areas"]
    if run_all:
        return {"areas": sorted(areas), "full": True, "deploy": True, "unmapped": []}
    selected, unmapped, full, deploy = set(), [], False, False
    # what a deploy will ship is tested too: the served-to-HEAD delta joins the PR's or push's own changes
    for path in list(dict.fromkeys(list(changed) + list(deploy_changed or []))):
        if matches(path, test_map.get("ignore", [])):
            continue
        hit = False
        if matches(path, test_map.get("core", [])):
            full, hit = True, True
        for name, area in areas.items():
            if matches(path, area["paths"]):
                selected.add(name); hit = True
        if matches(path, test_map.get("deploy", [])):
            deploy = True
        if not hit:
            unmapped.append(path)
    if deploy_changed is not None:
        deploy = any(matches(p, test_map.get("deploy", [])) and not matches(p, test_map.get("ignore", [])) for p in deploy_changed)
    return {"areas": sorted(selected), "full": full, "deploy": deploy, "unmapped": unmapped}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", required=True)
    ap.add_argument("--changed", required=True)
    ap.add_argument("--deploy-changed")
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    with open(a.map) as f:
        test_map = json.load(f)
    with open(a.changed) as f:
        changed = [line.strip() for line in f if line.strip()]
    deploy_changed = None
    if a.deploy_changed:
        with open(a.deploy_changed) as f:
            deploy_changed = [line.strip() for line in f if line.strip()]
    r = select(test_map, changed, a.all, deploy_changed)
    for path in r["unmapped"]:
        print(f"::error::{path} is in no test area, not in core, and not ignored: add it to .github/test-map.json", file=sys.stderr)
    print(f"areas={json.dumps(r['areas'])}")
    print(f"full={'true' if r['full'] else 'false'}")
    print(f"deploy={'true' if r['deploy'] else 'false'}")
    return 1 if r["unmapped"] else 0


if __name__ == "__main__":
    sys.exit(main())
