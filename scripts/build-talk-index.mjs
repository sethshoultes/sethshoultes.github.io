#!/usr/bin/env node
// Builds the retrieval index behind /talk/ (#172): the blog posts plus brain notes marked
// `public: true`, embedded with Workers AI (bge-base, 768 dims) and written to the
// TALK KV namespace as one `index` value. Usage: node scripts/build-talk-index.mjs [--brain ~/brain] [--dry-run]
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (source the secrets file).
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadPosts, loadBrain, toChunks } from '../workers/ask/knowledge/sources.mjs';

const args = process.argv.slice(2);
const brainDir = args.includes('--brain') ? args[args.indexOf('--brain') + 1] : join(homedir(), 'brain');
const dry = args.includes('--dry-run');
const KV_ID = '7f0fd134bb364c3cbb280ff40f84beeb'; // the TALK namespace in workers/ask/wrangler.toml

const posts = loadPosts(new URL('../_posts', import.meta.url).pathname);
const notes = loadBrain(brainDir);
const chunks = toChunks([...posts, ...notes]);
console.log(`${posts.length} posts, ${notes.length} public brain notes, ${chunks.length} passages`);
if (dry) process.exit(0);

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
if (!token || !account) throw new Error('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID');
const api = `https://api.cloudflare.com/client/v4/accounts/${account}`;
const auth = { Authorization: `Bearer ${token}` };

const passages = [];
for (let i = 0; i < chunks.length; i += 20) {
  const batch = chunks.slice(i, i + 20);
  const emb = await (await fetch(`${api}/ai/run/@cf/baai/bge-base-en-v1.5`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: batch.map((c) => `${c.title}\n${c.text}`) }) })).json();
  if (!emb.success) throw new Error(`embed failed: ${JSON.stringify(emb.errors)}`);
  batch.forEach((c, j) => passages.push({ id: c.id, title: c.title, url: c.url, text: c.text, v: Buffer.from(Float32Array.from(emb.result.data[j]).buffer).toString('base64') }));
  console.log(`embedded ${Math.min(i + 20, chunks.length)}/${chunks.length}`);
}
const put = await (await fetch(`${api}/storage/kv/namespaces/${KV_ID}/values/index`, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ built: new Date().toISOString(), passages }) })).json();
if (!put.success) throw new Error(`KV write failed: ${JSON.stringify(put.errors)}`);
console.log(`wrote index: ${passages.length} passages`);
