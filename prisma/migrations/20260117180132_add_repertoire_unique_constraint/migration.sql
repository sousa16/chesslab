/*
  Warnings:

  - A unique constraint covering the columns `[userId,color]` on the table `Repertoire` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Repertoire_userId_color_key" ON "Repertoire"("userId", "color");
