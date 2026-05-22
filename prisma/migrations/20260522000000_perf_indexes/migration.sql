-- Performance indexes.
--
-- Each composite index targets a specific hot-path query that today does a
-- bitmap-AND or seq scan; the array GIN indexes replace btree indexes that
-- cannot serve the `&&` / hasSome operators used in puzzles/next.

-- Hot path: practice queue lookup per repertoire (RepertoireEntry where
-- repertoireId = ? AND nextReviewDate <= now). The two single-column
-- indexes were combined via bitmap before this; a composite gives one
-- indexed range scan.
CREATE INDEX IF NOT EXISTS "RepertoireEntry_repertoireId_nextReviewDate_idx"
  ON "RepertoireEntry" ("repertoireId", "nextReviewDate");

-- Hot path: puzzle review queue per user.
CREATE INDEX IF NOT EXISTS "PuzzleReview_userId_nextReviewDate_idx"
  ON "PuzzleReview" ("userId", "nextReviewDate");

-- Hot path: streak query (activities per user ordered by date desc).
-- Postgres can scan an ASC btree backwards so we don't need a DESC index.
CREATE INDEX IF NOT EXISTS "DailyActivity_userId_date_idx"
  ON "DailyActivity" ("userId", "date");

-- Replace btree on Puzzle.categories with GIN — btree cannot serve the
-- `&&` (array overlap) operator that puzzles/next uses to filter by the
-- user's enabledCategories. Same for themes (currently no index at all).
DROP INDEX IF EXISTS "Puzzle_categories_idx";
CREATE INDEX IF NOT EXISTS "Puzzle_categories_idx"
  ON "Puzzle" USING GIN ("categories");
CREATE INDEX IF NOT EXISTS "Puzzle_themes_idx"
  ON "Puzzle" USING GIN ("themes");

-- Position.fen is already unique (the @unique constraint creates an
-- implicit btree); the second @@index([fen]) was redundant and just
-- slowed inserts.
DROP INDEX IF EXISTS "Position_fen_idx";
