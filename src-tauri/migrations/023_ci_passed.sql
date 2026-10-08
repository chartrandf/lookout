-- How many checks passed: the CI badge reads "✗ CI 4/5" (passed / ran), like the panel's checks box.
-- NULL until the next sync counts it; until then the badge shows a bare ✗.
ALTER TABLE tasks ADD COLUMN ci_passed INTEGER;
ALTER TABLE my_prs ADD COLUMN ci_passed INTEGER;
