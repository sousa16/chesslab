/*
  Warnings:

  - You are about to drop the column `name` on the `RepertoireEntry` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `RepertoireEntry` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "RepertoireEntry" DROP COLUMN "name",
DROP COLUMN "notes",
ADD COLUMN     "lastReviewDate" TIMESTAMP(3),
ADD COLUMN     "learningStepIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openingId" TEXT,
ADD COLUMN     "phase" TEXT NOT NULL DEFAULT 'learning';

-- CreateTable
CREATE TABLE "Opening" (
    "id" TEXT NOT NULL,
    "repertoireId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Opening Line',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opening_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Opening_repertoireId_idx" ON "Opening"("repertoireId");

-- CreateIndex
CREATE INDEX "RepertoireEntry_openingId_idx" ON "RepertoireEntry"("openingId");

-- AddForeignKey
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_repertoireId_fkey" FOREIGN KEY ("repertoireId") REFERENCES "Repertoire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepertoireEntry" ADD CONSTRAINT "RepertoireEntry_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "Opening"("id") ON DELETE SET NULL ON UPDATE CASCADE;
