-- preview-feedback pins (site-kit plugin; garage-door-smores#206). One row per pin left on a preview deploy. alias is
-- the preview's branch alias, so a branch's pins stay with that branch. shot is a PNG of the spot (at most 300 KB), served
-- only through Access at /__feedback/shot/<id>. Notes are plain text, as typed.
CREATE TABLE IF NOT EXISTS feedback_pins (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  alias TEXT NOT NULL,
  path TEXT NOT NULL,
  selector TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  vw INTEGER NOT NULL,
  vh INTEGER NOT NULL,
  ua TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL,
  author TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  comment_url TEXT,
  resolved_at INTEGER,
  resolved_by TEXT,
  shot BLOB
);
CREATE INDEX IF NOT EXISTS feedback_pins_page ON feedback_pins (alias, path, status, created_at);
-- site-kit#67: the pins left through a review link, whose author is a name its holder typed, not a signed-in person. A
-- table of its own rather than a column on feedback_pins: sites apply this file on every deploy, it stays safe to run
-- again (SQLite has no ADD COLUMN IF NOT EXISTS), and an existing site's database needs no migration. A mark the server
-- writes, so it cannot be typed.
CREATE TABLE IF NOT EXISTS feedback_review_pins (id TEXT PRIMARY KEY);
