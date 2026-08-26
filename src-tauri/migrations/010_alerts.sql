-- Alerts replace the append-only notification log: each row is an actionable situation derived from
-- live PR state every sync. The key makes re-derivation idempotent (no duplicates), and a row is
-- deleted as soon as the situation no longer needs action, so the bell is a to-do list, not a history.
CREATE TABLE IF NOT EXISTS alerts (
  key        TEXT PRIMARY KEY,   -- kind:task_id[:event_ts] — changes when the driving event does
  task_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,      -- addressed | ready_to_send | awaiting_me | ci_fail
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

DROP TABLE IF EXISTS notifications;  -- the event log this replaces
