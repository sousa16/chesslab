-- AlterTable
ALTER TABLE "RepertoireEntry" ADD COLUMN     "lastReviewDate" TIMESTAMP(3),
ADD COLUMN     "learningStepIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "phase" TEXT NOT NULL DEFAULT 'learning';
