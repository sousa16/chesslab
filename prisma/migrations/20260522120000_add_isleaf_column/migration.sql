-- Add isLeaf column to RepertoireEntry.
--
-- Default `true` is the conservative choice for a fresh row (a newly-
-- inserted entry has no children yet). Existing rows get `true` too;
-- they're corrected by the one-time backfill script that runs after
-- this migration deploys (see scripts/backfill-isleaf.ts). Until then,
-- counts may overstate "lines" but queries don't fail.
ALTER TABLE "RepertoireEntry" ADD COLUMN "isLeaf" BOOLEAN NOT NULL DEFAULT true;

-- Index for the home dashboard's "count leaves per repertoire" query.
CREATE INDEX "RepertoireEntry_repertoireId_isLeaf_phase_idx"
  ON "RepertoireEntry" ("repertoireId", "isLeaf", "phase");
