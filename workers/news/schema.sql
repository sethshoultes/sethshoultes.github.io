-- The newsletter's whole database: one table. An email, a timestamp, the page they
-- signed up on, the exact consent wording they saw, and where they are in the opt-in.
-- No IP address, no user agent, nothing else. Tokens are derived (HMAC), not stored.
CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  source TEXT NOT NULL,
  consent_text TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  confirmed_at TEXT,
  unsubscribed_at TEXT
);
