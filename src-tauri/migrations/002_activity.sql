ALTER TABLE tasks ADD COLUMN activity_count INTEGER;  -- NULL = no baseline yet
ALTER TABLE tasks ADD COLUMN ci_state TEXT;           -- pass | fail | pending
ALTER TABLE tasks ADD COLUMN new_activity INTEGER NOT NULL DEFAULT 0;
