// Shared admin glue: token management + Worker fetcher + small helpers.
//
// The admin token lives in localStorage (key: "admin_token"). All admin
// pages call requireAuth() before rendering; if the token is missing or
// rejected by the worker, the user is redirected to /admin/.

const WORKER_BASE = "https://sethshoultes-avatar-token.seth-a02.workers.dev";
const TOKEN_KEY = "admin_token";

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}
export function setToken(t) {
  try { localStorage.setItem(TOKEN_KEY, t); } catch {}
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

export async function adminAuth(token) {
  const res = await fetch(`${WORKER_BASE}/admin/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return res.ok;
}

export async function adminFetch(path) {
  const token = getToken();
  if (!token) throw new Error("UNAUTHORIZED");
  const res = await fetch(`${WORKER_BASE}${path}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (res.status === 401) {
    clearToken();
    window.location.href = "/admin/";
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Drop-in audio fetcher — returns a blob URL the <audio> tag can use.
export async function adminFetchAudioUrl(conversationId) {
  const token = getToken();
  if (!token) throw new Error("UNAUTHORIZED");
  const res = await fetch(
    `${WORKER_BASE}/admin/conversations/${encodeURIComponent(conversationId)}/audio`,
    { headers: { "Authorization": `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function requireAuth() {
  if (!getToken()) {
    window.location.href = "/admin/";
    return false;
  }
  return true;
}

// --- formatting helpers ---

export function formatRelative(unixSeconds) {
  if (!unixSeconds) return "—";
  const ms = unixSeconds * 1000;
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const date = new Date(ms);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export function formatTimestamp(unixSeconds) {
  if (!unixSeconds) return "—";
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatDuration(seconds) {
  if (seconds == null || seconds === 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}m ${sec.toString().padStart(2, "0")}s`;
}

export function truncate(s, n = 80) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// First USER turn text — for the table preview column.
export function firstUserMessage(transcript) {
  if (!Array.isArray(transcript)) return null;
  for (const turn of transcript) {
    if ((turn.role || "").toLowerCase() === "user" && (turn.message || turn.text)) {
      return turn.message || turn.text;
    }
  }
  return null;
}
