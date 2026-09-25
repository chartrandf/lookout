-- Snooze on the Pull Requests board, as the review board has had since 004: a card hidden until
-- GitHub reports something new about the PR (src/lib/myprs.ts decides what counts).
ALTER TABLE my_prs ADD COLUMN snoozed INTEGER NOT NULL DEFAULT 0;
