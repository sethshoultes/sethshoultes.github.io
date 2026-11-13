import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Drift check (herdos#3873): the committed agent discovery files are exactly what the vendored discovery.py writes from
// _data/agents.json, and the home page's Link in _headers is the one it prints.
const repo = fileURLToPath(new URL('..', import.meta.url));
const OWNED = ['.well-known/mcp.json', '.well-known/agent-card.json', '.well-known/api-catalog', '.well-known/ard.json'];
const OWNED_DIRS = ['.well-known/mcp', '.well-known/agent-skills'];

const files = (dir) => readdirSync(dir).flatMap((n) => {
  const f = join(dir, n);
  return statSync(f).isDirectory() ? files(f) : [f];
});

function generate() {
  const out = mkdtempSync(join(tmpdir(), 'discovery-'));
  const run = spawnSync('python3', ['-I', 'assets/vendor/site-kit/scripts/discovery.py', 'build', '_data/agents.json', out,
    '--root', '.', '--offline'], { cwd: repo, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return { out, link: run.stdout.trim().replace(/^Link: /, '') };
}

test('the committed discovery files are what discovery.py writes from _data/agents.json', (t) => {
  const { out } = generate();
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const made = files(out).map((f) => relative(out, f)).sort();
  for (const rel of made) {
    assert.ok(existsSync(join(repo, rel)), `${rel} is generated but not committed: run discovery.py build`);
    assert.ok(readFileSync(join(out, rel)).equals(readFileSync(join(repo, rel))), `${rel} differs from what discovery.py writes`);
  }
  const committed = [...OWNED.filter((f) => existsSync(join(repo, f))),
    ...OWNED_DIRS.filter((d) => existsSync(join(repo, d))).flatMap((d) => files(join(repo, d)).map((f) => relative(repo, f)))].sort();
  assert.deepEqual(committed, made, 'a committed discovery file is one discovery.py no longer writes');
});

test("the home page's Link header in _headers is the one discovery.py prints", () => {
  const { out, link } = generate();
  rmSync(out, { recursive: true, force: true });
  const lines = readFileSync(join(repo, '_headers'), 'utf8').split('\n');
  const home = lines.indexOf('/');
  assert.notEqual(home, -1, '_headers has no / block');
  assert.equal(lines[home + 1], `  Link: ${link}`);
});
