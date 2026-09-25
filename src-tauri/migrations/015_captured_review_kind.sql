-- A follow-up run answers "was my review addressed?", which is not the review itself. The feed says
-- which of the two it is showing, so the row has to know. Everything captured before this was a
-- review, which is what the default covers.
ALTER TABLE captured_reviews ADD COLUMN kind TEXT NOT NULL DEFAULT 'review'; -- review | followup
