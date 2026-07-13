CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,              -- owner/repo#number
  repo TEXT NOT NULL,               -- owner/repo
  repo_path TEXT,                   -- local clone path
  branch TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  pr_title TEXT NOT NULL,
  pr_url TEXT NOT NULL,
  pr_state TEXT NOT NULL DEFAULT 'open',       -- open | merged | closed
  pr_author TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'discovered',    -- discovered | watching | ignored | inbox | reviewing | reviewed | followup | done
  review_requested INTEGER NOT NULL DEFAULT 0,
  session_ids TEXT NOT NULL DEFAULT '[]',      -- JSON array
  review_files TEXT NOT NULL DEFAULT '[]',     -- JSON array
  followup_summary TEXT,                       -- JSON {addressed,partial,pending}
  done_at TEXT,
  updated_at TEXT NOT NULL
);
