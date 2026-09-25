-- GitHub can't merge the PR as it stands (mergeable = CONFLICTING). Shown as "✗ Conflicts" in place
-- of a CI verdict: pull-request CI doesn't run on a branch with conflicts.
ALTER TABLE tasks ADD COLUMN conflicts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE my_prs ADD COLUMN conflicts INTEGER NOT NULL DEFAULT 0;
