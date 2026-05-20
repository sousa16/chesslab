/**
 * Returns the next puzzle for the signed-in user.
 *
 * Priority:
 *  1. A due review (a previously-seen puzzle whose nextReviewDate <= now)
 *     filtered by the user's enabled categories.
 *  2. A new puzzle from the user's rating band whose categories overlap
 *     the user's enabled set.
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

const DEFAULT_PREFS = {
  ratingMin: 1200,
  ratingMax: 1600,
  enabledCategories: [...PUZZLE_CATEGORIES],
};

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, puzzlePrefs: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const prefs = user.puzzlePrefs ?? DEFAULT_PREFS;
    const now = new Date();
    const exclude = request.nextUrl.searchParams.get("exclude");

    // 1) due review
    const dueReviewWhere = {
      userId: user.id,
      nextReviewDate: { lte: now },
      puzzle: { categories: { hasSome: prefs.enabledCategories } },
      ...(exclude ? { puzzleId: { not: exclude } } : {}),
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
      });
    }

    // 2) new puzzle — rating-anchored random pick.
    //
    // `ORDER BY RANDOM() LIMIT 1` does a seq scan of the whole puzzle
    // catalog on every fetch. Instead pick a random target rating inside
    // the user's band and ask Postgres for the puzzle closest to it via
    // the rating btree index. Randomness comes from the target, not from
    // sorting — the index does ~all the work.
    const targetRating =
      prefs.ratingMin +
      Math.floor(Math.random() * (prefs.ratingMax - prefs.ratingMin + 1));

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        lichessId: string;
        fen: string;
        moves: string;
        rating: number;
        themes: string[];
        categories: string[];
      }>
    >`
      SELECT p.id, p."lichessId", p.fen, p.moves, p.rating, p.themes, p.categories
      FROM "Puzzle" p
      WHERE p.rating BETWEEN ${prefs.ratingMin} AND ${prefs.ratingMax}
        AND p.categories && ${prefs.enabledCategories}::text[]
        AND (${exclude}::text IS NULL OR p.id <> ${exclude})
        AND NOT EXISTS (
          SELECT 1 FROM "PuzzleReview" r
          WHERE r."puzzleId" = p.id AND r."userId" = ${user.id}
        )
      ORDER BY ABS(p.rating - ${targetRating}) ASC, p.id ASC
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({
        puzzle: null,
        review: null,
        dueCount: 0,
        source: "empty",
      });
    }

    return NextResponse.json({
      puzzle: serializePuzzle(rows[0]),
      review: null,
      dueCount,
      source: "new",
    });
  } catch (err) {
    console.error("Error fetching next puzzle:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
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
