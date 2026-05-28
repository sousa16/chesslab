/**
 * Returns the next puzzle for the signed-in user.
 *
 * Priority:
 *  1. A due review (a previously-seen puzzle whose nextReviewDate <= now)
 *     filtered by the user's enabled categories. Mode is intentionally
 *     ignored for due reviews — once a puzzle is in your SRS queue, when
 *     it's due it's due, regardless of which motif you're currently
 *     blocking on.
 *  2. A new puzzle picked by mode:
 *       - "auto"    → if any canonical motif is still locked (<20 attempts
 *                     or EWMA<0.80), serve from the locked motif with the
 *                     fewest attempts (round-robin). Otherwise mixed.
 *       - "blocked" → respect prefs.blockedFilterMotif (lazy-seed its
 *                     UserMotifRating from the global rating).
 *       - "mixed"   → any motif, target = global currentTargetRating.
 *
 *     New puzzles are picked by `ABS(rating - target)` so the rating btree
 *     does the work even when the catalog is thin near the target.
 *
 * Accepts `?exclude=<puzzleId>` so the client can guarantee the just-rated
 * puzzle isn't served again. Necessary because the review POST is
 * fire-and-forget, so the GET can race ahead of the PuzzleReview commit
 * and the catalog query would otherwise still pick the same puzzle.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PUZZLE_CATEGORIES } from "@/lib/puzzleCategories";
import { CANONICAL_MOTIFS, isCanonicalMotif } from "@/lib/motifs";

const DEFAULT_PREFS = {
  currentTargetRating: 1200,
  mode: "auto" as const,
  blockedFilterMotif: null as string | null,
  enabledCategories: [...PUZZLE_CATEGORIES],
};

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const puzzlePrefs = await prisma.userPuzzlePrefs.findUnique({
      where: { userId },
    });

    const prefs = puzzlePrefs ?? DEFAULT_PREFS;
    const now = new Date();
    // `exclude` is a comma-separated list of puzzle IDs the client knows
    // shouldn't be picked. The original use was just the current
    // displayed puzzle (so a prefetch with the same exclude couldn't
    // re-pick it). Now also covers RECENTLY-RATED puzzles whose review
    // write may not have committed yet — without that filter the
    // prefetch can race a fire-and-forget review POST and serve the
    // just-rated puzzle right back to the user.
    const excludeParam = request.nextUrl.searchParams.get("exclude");
    const excludeIds = excludeParam
      ? excludeParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    // 1) due review
    const dueReviewWhere = {
      userId,
      nextReviewDate: { lte: now },
      puzzle: { categories: { hasSome: prefs.enabledCategories } },
      ...(excludeIds.length > 0 ? { puzzleId: { notIn: excludeIds } } : {}),
    } satisfies Prisma.PuzzleReviewWhereInput;

    const dueReview = await prisma.puzzleReview.findFirst({
      where: dueReviewWhere,
      orderBy: { nextReviewDate: "asc" },
      include: { puzzle: true },
    });

    const dueCount = await prisma.puzzleReview.count({
      where: dueReviewWhere,
    });

    if (dueReview) {
      return NextResponse.json({
        puzzle: serializePuzzle(dueReview.puzzle),
        review: serializeReview(dueReview),
        dueCount,
        source: "due",
        // No motif emphasis on due reviews — the SRS scheduled it.
        focusMotif: null,
        targetRating: null,
      });
    }

    // 2) new puzzle — build an ordered list of (motif, rating) candidates
    // and try each until something matches.
    //
    // The previous version ran a single query against the chosen focusMotif
    // and surfaced "empty" the moment that motif's catalog was thin — the
    // user could be 5 puzzles in and get told there's nothing left even
    // though 17,000 other puzzles existed. The cascade below means a sparse
    // motif (e.g. `clearance` or `xRayAttack`) doesn't lock the whole
    // selector; we advance to the next-weakest motif, and finally to the
    // unfiltered pool, before declaring genuine exhaustion.
    const candidates = await resolveCandidates(
      userId,
      prefs.mode,
      prefs.blockedFilterMotif,
      prefs.currentTargetRating,
    );

    type PuzzleRow = {
      id: string;
      lichessId: string;
      fen: string;
      moves: string;
      rating: number;
      themes: string[];
      categories: string[];
    };

    let chosen: { row: PuzzleRow; focusMotif: string | null; targetRating: number } | null =
      null;

    for (const cand of candidates) {
      const themeFilter = cand.focusMotif
        ? Prisma.sql`AND p.themes && ARRAY[${cand.focusMotif}]::text[]`
        : Prisma.empty;

      const rows = await prisma.$queryRaw<Array<PuzzleRow>>`
        SELECT p.id, p."lichessId", p.fen, p.moves, p.rating, p.themes, p.categories
        FROM "Puzzle" p
        WHERE p.categories && ${prefs.enabledCategories}::text[]
          ${themeFilter}
          AND p.id <> ALL (${excludeIds}::text[])
          AND NOT EXISTS (
            SELECT 1 FROM "PuzzleReview" r
            WHERE r."puzzleId" = p.id AND r."userId" = ${userId}
          )
        ORDER BY ABS(p.rating - ${cand.targetRating}) ASC, p.id ASC
        LIMIT 1
      `;
      if (rows.length > 0) {
        chosen = {
          row: rows[0],
          focusMotif: cand.focusMotif,
          targetRating: cand.targetRating,
        };
        break;
      }
    }

    if (!chosen) {
      return NextResponse.json({
        puzzle: null,
        review: null,
        dueCount: 0,
        source: "empty",
        focusMotif: null,
        targetRating: prefs.currentTargetRating,
      });
    }

    return NextResponse.json({
      puzzle: serializePuzzle(chosen.row),
      review: null,
      dueCount,
      source: "new",
      focusMotif: chosen.focusMotif,
      targetRating: chosen.targetRating,
    });
  } catch (err) {
    console.error("Error fetching next puzzle:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Build an ordered list of (motif, rating) candidates for the new-puzzle
 * search. The selector tries them in order and stops at the first one with
 * a matching puzzle in the catalog.
 *
 * Mode behaviour:
 *  - "auto"    → every locked motif (weakest first by attempts), then a
 *                mixed-pool fallback so a sparse motif can't strand the
 *                user mid-session.
 *  - "blocked" → just the user-picked motif. Strict by design — the user
 *                wants ONE motif, so we don't silently widen.
 *  - "mixed"   → one mixed-pool entry.
 */
async function resolveCandidates(
  userId: string,
  mode: string,
  blockedFilterMotif: string | null,
  currentTargetRating: number,
): Promise<Array<{ focusMotif: string | null; targetRating: number }>> {
  if (mode === "mixed") {
    return [{ focusMotif: null, targetRating: currentTargetRating }];
  }

  if (mode === "blocked") {
    if (!blockedFilterMotif || !isCanonicalMotif(blockedFilterMotif)) {
      // Defensive: invalid prefs → behave like mixed.
      return [{ focusMotif: null, targetRating: currentTargetRating }];
    }
    const row = await prisma.userMotifRating.findUnique({
      where: { userId_motif: { userId, motif: blockedFilterMotif } },
    });
    return [
      {
        focusMotif: blockedFilterMotif,
        targetRating: row?.rating ?? currentTargetRating,
      },
    ];
  }

  // mode === "auto"
  const motifRows = await prisma.userMotifRating.findMany({
    where: { userId, motif: { in: [...CANONICAL_MOTIFS] } },
  });
  const byMotif = new Map(motifRows.map((m) => [m.motif, m]));

  // Locked motifs (unseen counts as attempts=0 → naturally at the front).
  const locked: { motif: string; attempts: number; rating: number }[] = [];
  for (const m of CANONICAL_MOTIFS) {
    const row = byMotif.get(m);
    if (!row) {
      locked.push({ motif: m, attempts: 0, rating: currentTargetRating });
    } else if (!row.unlocked) {
      locked.push({ motif: m, attempts: row.attempts, rating: row.rating });
    }
  }
  locked.sort((a, b) => a.attempts - b.attempts);

  const out: Array<{ focusMotif: string | null; targetRating: number }> =
    locked.map((l) => ({ focusMotif: l.motif, targetRating: l.rating }));

  // Always append a mixed-pool fallback. Means a thin motif catalog (or an
  // unlucky enabled-categories filter) never strands the user — once the
  // motif-specific queries are exhausted, the next puzzle just comes from
  // the broader pool. Cheap: the loop short-circuits on the first hit.
  out.push({ focusMotif: null, targetRating: currentTargetRating });
  return out;
}

function serializePuzzle(p: {
  id: string;
  lichessId: string;
  fen: string;
  moves: string;
  rating: number;
  themes: string[];
  categories: string[];
}) {
  return {
    id: p.id,
    lichessId: p.lichessId,
    fen: p.fen,
    moves: p.moves,
    rating: p.rating,
    themes: p.themes,
    categories: p.categories,
  };
}

function serializeReview(r: {
  id: string;
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReviewDate: Date;
  phase: string;
  learningStepIndex: number;
  lastReviewDate: Date | null;
}) {
  return {
    id: r.id,
    interval: r.interval,
    easeFactor: r.easeFactor,
    repetitions: r.repetitions,
    nextReviewDate: r.nextReviewDate,
    phase: r.phase,
    learningStepIndex: r.learningStepIndex,
    lastReviewDate: r.lastReviewDate,
  };
}
