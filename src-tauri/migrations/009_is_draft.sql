ALTER TABLE tasks ADD COLUMN is_draft INTEGER NOT NULL DEFAULT 0;  -- PR is a draft (drafts sort last and render dashed)
