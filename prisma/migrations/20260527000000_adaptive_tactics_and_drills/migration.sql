-- Adaptive tactics + drill sessions.
--
-- Replaces the static rating-band selector with an adaptive controller that
-- targets ~85% success per user (Wilson et al., Nature Communications 2019)
-- and per major motif. Adds drill sessions implementing the Woodpecker
-- method (Smith & Tikkanen 2018) — cycle the same fixed set of N puzzles
-- until they're automatic, then hand them to the SRS with a long interval.

-- 1) UserPuzzlePrefs: replace rating band with adaptive setpoint + mode.
ALTER TABLE "UserPuzzlePrefs"
  ADD COLUMN "currentTargetRating" INTEGER NOT NULL DEFAULT 1200,
  ADD COLUMN "globalEwmaSuccess" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "globalAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "globalCorrect" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN "blockedFilterMotif" TEXT;

-- Seed currentTargetRating from existing band midpoint so existing users
-- don't start cold at 1200 after the migration.
UPDATE "UserPuzzlePrefs"
SET "currentTargetRating" = ("ratingMin" + "ratingMax") / 2;

ALTER TABLE "UserPuzzlePrefs"
  DROP COLUMN "ratingMin",
  DROP COLUMN "ratingMax";

-- 2) Per-motif adaptive state, lazily created on first attempt.
CREATE TABLE "UserMotifRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1200,
    "ewmaSuccess" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "unlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMotifRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserMotifRating_userId_motif_key" ON "UserMotifRating"("userId", "motif");
CREATE INDEX "UserMotifRating_userId_idx" ON "UserMotifRating"("userId");
CREATE INDEX "UserMotifRating_userId_unlocked_idx" ON "UserMotifRating"("userId", "unlocked");

ALTER TABLE "UserMotifRating"
  ADD CONSTRAINT "UserMotifRating_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Drill sessions (Woodpecker method).
CREATE TABLE "DrillSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "puzzleIds" TEXT[],
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "targetCycles" INTEGER NOT NULL DEFAULT 5,
    "position" INTEGER NOT NULL DEFAULT 0,
    "baselineMs" INTEGER,
    "lastCycleMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DrillSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DrillSession_userId_status_idx" ON "DrillSession"("userId", "status");

ALTER TABLE "DrillSession"
  ADD CONSTRAINT "DrillSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DrillAttempt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "timeMs" INTEGER NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrillAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DrillAttempt_sessionId_idx" ON "DrillAttempt"("sessionId");
CREATE INDEX "DrillAttempt_sessionId_cycle_idx" ON "DrillAttempt"("sessionId", "cycle");

ALTER TABLE "DrillAttempt"
  ADD CONSTRAINT "DrillAttempt_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "DrillSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
