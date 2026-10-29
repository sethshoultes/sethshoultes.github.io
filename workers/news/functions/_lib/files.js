// The free downloads. The PDFs live in the NEWS_KV namespace under `pdf:<slug>`; this is
// the list of slugs a signed link may name. Keep it in step with _data/library.yml
// (tests/news-server.test.mjs checks that).
export const FILES = {
  'why-ai-agents-skip-wordpress': { title: 'Why AI agents skip WordPress', filename: 'why-ai-agents-skip-wordpress.pdf' },
};
export const DEFAULT_FILE = 'why-ai-agents-skip-wordpress';

// Is this PDF loaded in KV yet? Emails and the confirm redirect only promise it once it is.
export async function pdfReady(kv, slug) {
  return (await kv.list({ prefix: `pdf:${slug}`, limit: 1 })).keys.length > 0;
}
