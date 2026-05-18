-- CreateTable
CREATE TABLE "Puzzle" (
    "id" TEXT NOT NULL,
    "lichessId" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "moves" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "popularity" INTEGER NOT NULL DEFAULT 0,
    "themes" TEXT[],
    "categories" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Puzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuzzleReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "nextReviewDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastReviewDate" TIMESTAMP(3),
    "learningStepIndex" INTEGER NOT NULL DEFAULT 0,
    "phase" TEXT NOT NULL DEFAULT 'learning',

    CONSTRAINT "PuzzleReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPuzzlePrefs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ratingMin" INTEGER NOT NULL DEFAULT 1200,
    "ratingMax" INTEGER NOT NULL DEFAULT 1600,
    "enabledCategories" TEXT[] DEFAULT ARRAY['Mates', 'Motifs', 'Middlegame', 'Endgame']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPuzzlePrefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Puzzle_lichessId_key" ON "Puzzle"("lichessId");

-- CreateIndex
CREATE INDEX "Puzzle_rating_idx" ON "Puzzle"("rating");

-- CreateIndex
CREATE INDEX "Puzzle_categories_idx" ON "Puzzle"("categories");

-- CreateIndex
CREATE INDEX "PuzzleReview_userId_idx" ON "PuzzleReview"("userId");

-- CreateIndex
CREATE INDEX "PuzzleReview_puzzleId_idx" ON "PuzzleReview"("puzzleId");

-- CreateIndex
CREATE INDEX "PuzzleReview_nextReviewDate_idx" ON "PuzzleReview"("nextReviewDate");

-- CreateIndex
CREATE UNIQUE INDEX "PuzzleReview_userId_puzzleId_key" ON "PuzzleReview"("userId", "puzzleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPuzzlePrefs_userId_key" ON "UserPuzzlePrefs"("userId");

-- AddForeignKey
ALTER TABLE "PuzzleReview" ADD CONSTRAINT "PuzzleReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuzzleReview" ADD CONSTRAINT "PuzzleReview_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "Puzzle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPuzzlePrefs" ADD CONSTRAINT "UserPuzzlePrefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
