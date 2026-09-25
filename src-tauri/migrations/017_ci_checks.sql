-- How many checks failed, out of how many: a red CI badge reads "CI ✗ 4/7" instead of a bare ✗.
-- NULL until the next sync counts them (and for a PR with no checks at all).
ALTER TABLE tasks ADD COLUMN ci_failed INTEGER;
ALTER TABLE tasks ADD COLUMN ci_total INTEGER;
ALTER TABLE my_prs ADD COLUMN ci_failed INTEGER;
ALTER TABLE my_prs ADD COLUMN ci_total INTEGER;
