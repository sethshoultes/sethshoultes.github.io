// Signed, expiring links without storing a token: every link is an HMAC of what it
// grants, keyed by NEWS_SECRET. Verifying is recomputing and comparing.

const enc = new TextEncoder();

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const sign = (secret, purpose, subject) => hmac(secret, `${purpose}:${subject}`);

export async function verify(secret, purpose, subject, token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
  return equal(await sign(secret, purpose, subject), token);
}

// A download link grants one file until `expires` (unix seconds).
export const downloadSig = (secret, file, expires) => sign(secret, 'download', `${file}:${expires}`);

export async function downloadUrl(origin, secret, file, now = Date.now(), days = 7) {
  const expires = Math.floor(now / 1000) + days * 86400;
  const s = await downloadSig(secret, file, expires);
  return `${origin}/download?f=${encodeURIComponent(file)}&e=${expires}&s=${s}`;
}

export async function verifyDownload(secret, file, expires, token, now = Date.now()) {
  const e = Number(expires);
  if (!Number.isInteger(e) || e * 1000 < now) return false;
  return verify(secret, 'download', `${file}:${e}`, token);
}
