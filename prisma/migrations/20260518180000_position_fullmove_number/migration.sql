-- Add the column nullable so existing rows survive the ALTER without a
-- default value. We backfill from FEN immediately after.
ALTER TABLE "Position" ADD COLUMN "fullmoveNumber" INTEGER;

-- Backfill: the FEN's last whitespace-separated token is the fullmove
-- counter (e.g. ".... w KQkq - 0 1" → 1). split_part is cheap and exact.
UPDATE "Position"
SET "fullmoveNumber" = NULLIF(SPLIT_PART(fen, ' ', 6), '')::int
WHERE "fullmoveNumber" IS NULL;

-- Defensive: if any row failed to parse (malformed FEN), fall back to 1
-- so the column can be NOT NULL. Should be a no-op for valid data.
UPDATE "Position" SET "fullmoveNumber" = 1 WHERE "fullmoveNumber" IS NULL;

ALTER TABLE "Position" ALTER COLUMN "fullmoveNumber" SET NOT NULL;

CREATE INDEX "Position_fullmoveNumber_idx" ON "Position"("fullmoveNumber");
