/*
  Warnings:

  - A unique constraint covering the columns `[repertoireId,positionId,expectedMove]` on the table `RepertoireEntry` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "RepertoireEntry_repertoireId_positionId_key";

-- CreateIndex
CREATE UNIQUE INDEX "RepertoireEntry_repertoireId_positionId_expectedMove_key" ON "RepertoireEntry"("repertoireId", "positionId", "expectedMove");
