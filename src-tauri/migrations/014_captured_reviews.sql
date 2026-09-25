-- A review only reaches a card if the review skill exported it to
-- AI_TASKS/code-review/<stamp>-<branch>.md, which src/lib/reviews.ts scans. The shipped default
-- button runs Claude Code's own /review: it prints its verdict and writes nothing, so anyone who
-- hasn't copied a personal /do-review gets a session in the feed and no report to read.
--
-- This table holds the reviews Lookout had to recover itself — the final assistant turn of a review
-- session (src/lib/capture.ts), or a body/path handed over by the `lookout` CLI. `tasks.review_files`
-- is untouched: the filesystem scan stays the truth for flows that do export a file, and a session
-- that exported one is never captured here (capture.ts `exportedToFile` is that dedupe).
--
-- Display only: nothing here feeds alerts.ts or moves a card, so upgrading changes no board.
-- Rows expire — only the last 30 days are kept, and Settings can clear them all.
CREATE TABLE IF NOT EXISTS captured_reviews (
  id TEXT PRIMARY KEY,        -- the session id, or "file:<abs path>" for a reference the CLI registered
  task_id TEXT NOT NULL,      -- owner/repo#number
  branch TEXT NOT NULL,
  source TEXT NOT NULL,       -- sync | hook | cli
  session_id TEXT,            -- set when it came out of a transcript
  file_path TEXT,             -- set when a report file backs it; body is then NULL
  body TEXT,                  -- the captured markdown
  created_at TEXT NOT NULL,   -- when the review happened: feed order, and what the 30-day prune reads
  captured_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS captured_reviews_task ON captured_reviews (task_id);
