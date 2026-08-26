-- Archiving one alert hides that exact event key for good: it stays in the table so a re-derivation
-- won't bring it back, while a *later* event on the same PR gets a new key and shows up normally.
ALTER TABLE alerts ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
