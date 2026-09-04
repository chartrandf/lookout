-- Rename the `inbox` stage to `needs_review`. The board has always called this column "Needs
-- Review"; `inbox` was an internal name nobody outside the code could map to it, and now that the
-- CLI exposes stages to skills and terminals the id has to read the same as the column.
-- Stage ids elsewhere: discovered | watching | ignored | needs_review | reviewing | reviewed | followup | done
UPDATE tasks SET stage = 'needs_review' WHERE stage = 'inbox';
