-- CreateEnum
CREATE TYPE "PieceColor" AS ENUM ('White', 'Black');

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repertoire" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "color" "PieceColor" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repertoire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepertoireEntry" (
    "id" TEXT NOT NULL,
    "repertoireId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "expectedMove" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "nextReviewDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepertoireEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Position_fen_key" ON "Position"("fen");

-- CreateIndex
CREATE INDEX "Position_fen_idx" ON "Position"("fen");

-- CreateIndex
CREATE INDEX "Repertoire_userId_idx" ON "Repertoire"("userId");

-- CreateIndex
CREATE INDEX "RepertoireEntry_repertoireId_idx" ON "RepertoireEntry"("repertoireId");

-- CreateIndex
CREATE INDEX "RepertoireEntry_positionId_idx" ON "RepertoireEntry"("positionId");

-- CreateIndex
CREATE INDEX "RepertoireEntry_nextReviewDate_idx" ON "RepertoireEntry"("nextReviewDate");

-- CreateIndex
CREATE UNIQUE INDEX "RepertoireEntry_repertoireId_positionId_key" ON "RepertoireEntry"("repertoireId", "positionId");

-- AddForeignKey
ALTER TABLE "Repertoire" ADD CONSTRAINT "Repertoire_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepertoireEntry" ADD CONSTRAINT "RepertoireEntry_repertoireId_fkey" FOREIGN KEY ("repertoireId") REFERENCES "Repertoire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepertoireEntry" ADD CONSTRAINT "RepertoireEntry_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;
