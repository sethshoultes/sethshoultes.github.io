import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, embeddedIds } from '../scripts/check-youtube.mjs';

function site(files) {
  const root = mkdtempSync(join(tmpdir(), 'yt-'));
  for (const [path, html] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), html);
  }
  return root;
}
const embed = (id) => `<iframe src="https://www.youtube.com/embed/${id}"></iframe>`;

test('finds embed ids, including the nocookie host', () => {
  const ids = embeddedIds(`${embed('aMkmhg8fMe8')}<iframe src="https://www.youtube-nocookie.com/embed/dXUCo4hJ-_c"></iframe>`);
  assert.deepEqual([...ids].sort(), ['aMkmhg8fMe8', 'dXUCo4hJ-_c']);
});
test('finds ids on video facades (data-video-id) too', () => {
  const ids = embeddedIds('<a class="video-facade" href="https://www.youtube.com/watch?v=ASQ2PxAsYRc" data-video-id="ASQ2PxAsYRc"></a>');
  assert.deepEqual([...ids], ['ASQ2PxAsYRc']);
});
test('a private or deleted video (401, 403, 404) fails and names the page', async () => {
  const root = site({ 'projects/index.html': embed('aMkmhg8fMe8') + embed('dXUCo4hJ-_c') });
  for (const code of [401, 403, 404]) {
    const r = await check(root, async (id) => (id === 'aMkmhg8fMe8' ? code : 200));
    assert.deepEqual(r.failures, [`aMkmhg8fMe8 -> HTTP ${code} (/projects/index.html)`]);
  }
});
test('network errors and 5xx only warn', async () => {
  const root = site({ 'a.html': embed('aMkmhg8fMe8') + embed('dXUCo4hJ-_c') });
  const r = await check(root, async (id) => { if (id === 'aMkmhg8fMe8') throw new Error('offline'); return 503; });
  assert.deepEqual(r.failures, []);
  assert.equal(r.warnings.length, 2);
});
test('a clean site passes and embeds in skipped folders are ignored', async () => {
  const root = site({ 'a.html': embed('dXUCo4hJ-_c'), 'garage-door-science-hub/x.html': embed('aMkmhg8fMe8') });
  const r = await check(root, async (id) => (id === 'dXUCo4hJ-_c' ? 200 : 403));
  assert.deepEqual(r, { failures: [], warnings: [] });
});
