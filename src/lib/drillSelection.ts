/**
 * Pick the puzzle set for a Woodpecker drill.
 *
 * Strategy:
 *  - For motif-targeted drills, use the user's UserMotifRating.rating as the
 *    anchor (or currentTargetRating if no motif row yet). For mixed drills,
 *    use currentTargetRating directly.
 *  - Order by absolute distance from the anchor, ties by id (stable). Excludes
 *    puzzles the user has already reviewed — repetition value comes from the
 *    drill itself, not from re-seeing already-known patterns.
 *
 * Returns a fixed ordered array of puzzleIds, frozen into the DrillSession
 * row at creation time.
 */

import { prisma } from "@/lib/prisma";
import { isCanonicalMotif } from "@/lib/motifs";

export async function pickDrillPuzzles(opts: {
  userId: string;
  motif: string;
  size: number;
}): Promise<string[]> {
  const { userId, motif, size } = opts;

  // Anchor rating: motif-specific if available, else global target.
  let anchorRating: number;
  const prefs = await prisma.userPuzzlePrefs.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  if (motif !== "mixed" && isCanonicalMotif(motif)) {
    const motifRow = await prisma.userMotifRating.findUnique({
      where: { userId_motif: { userId, motif } },
    });
    anchorRating = motifRow?.rating ?? prefs.currentTargetRating;
  } else {
    anchorRating = prefs.currentTargetRating;
  }

  // Raw SQL for the same reason /api/puzzles/next uses it: ABS-sort
  // against the rating btree, optionally filtered by theme (GIN).
  if (motif !== "mixed") {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT p.id
      FROM "Puzzle" p
      WHERE p.themes && ARRAY[${motif}]::text[]
        AND NOT EXISTS (
          SELECT 1 FROM "PuzzleReview" r
          WHERE r."puzzleId" = p.id AND r."userId" = ${userId}
        )
      ORDER BY ABS(p.rating - ${anchorRating}) ASC, p.id ASC
      LIMIT ${size}
    `;
    return rows.map((r) => r.id);
  }

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT p.id
    FROM "Puzzle" p
    WHERE NOT EXISTS (
        SELECT 1 FROM "PuzzleReview" r
        WHERE r."puzzleId" = p.id AND r."userId" = ${userId}
      )
    ORDER BY ABS(p.rating - ${anchorRating}) ASC, p.id ASC
    LIMIT ${size}
  `;
  return rows.map((r) => r.id);
}
