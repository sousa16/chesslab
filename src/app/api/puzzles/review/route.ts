/**
 * Records a puzzle review using the shared SM-2 scheduler AND advances the
 * adaptive difficulty controller for the global and per-motif states.
 *
 * Accepts either an existing reviewId (when the puzzle was already in the
 * user's review queue) or a puzzleId for a first-time review — in that
 * case a fresh PuzzleReview row is created in the learning phase.
 *
 * Mirrors /api/repertoire-entries/review so streak/accuracy stats remain
 * unified across opening and puzzle training.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  processReview,
  defaultSM2Config,
  type ReviewResponse,
  type CardState,
} from "@/lib/sm2";
import { canonicalMotifsFromThemes } from "@/lib/motifs";
import {
  updateMotifRating,
  seedMotifRating,
  type MotifRatingState,
} from "@/lib/adaptiveRating";

async function recordDailyActivity(
  userId: string,
  isCorrect: boolean,
  timeSpentMs: number,
) {
  const today = new Date();
  const todayUTC = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  await prisma.dailyActivity.upsert({
    where: { userId_date: { userId, date: todayUTC } },
    update: {
      correctCount: isCorrect ? { increment: 1 } : undefined,
      incorrectCount: !isCorrect ? { increment: 1 } : undefined,
      timeSpentMs: { increment: timeSpentMs },
      positionsReviewed: { increment: 1 },
    },
    create: {
      userId,
      date: todayUTC,
      correctCount: isCorrect ? 1 : 0,
      incorrectCount: isCorrect ? 0 : 1,
      timeSpentMs,
      positionsReviewed: 1,
    },
  });
}

/**
 * Advance the global controller (UserPuzzlePrefs counters + currentTargetRating)
 * and every applicable per-motif controller for this puzzle.
 *
 * `unlocked` on the global state is meaningless — only meaningful on motif rows.
 * `seedMotifRating` for new motif rows uses the user's current global target
 * rating so fresh motifs start at a sensible difficulty rather than 1200.
 */
async function advanceAdaptiveState(
  userId: string,
  isCorrect: boolean,
  puzzleThemes: string[],
) {
  // Global controller lives on UserPuzzlePrefs. Upsert ensures the row
  // exists even if the user never opened the FiltersPanel.
  const prefs = await prisma.userPuzzlePrefs.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  const globalPrior: MotifRatingState = {
    rating: prefs.currentTargetRating,
    ewmaSuccess: prefs.globalEwmaSuccess,
    attempts: prefs.globalAttempts,
    correct: prefs.globalCorrect,
    unlocked: false,
  };
  const globalNext = updateMotifRating(globalPrior, isCorrect);

  await prisma.userPuzzlePrefs.update({
    where: { userId },
    data: {
      currentTargetRating: globalNext.rating,
      globalEwmaSuccess: globalNext.ewmaSuccess,
      globalAttempts: globalNext.attempts,
      globalCorrect: globalNext.correct,
    },
  });

  // Per-motif controllers: one update per canonical motif the puzzle is
  // tagged with. A single puzzle can credit several (e.g. a fork+pin) —
  // that's fine, both motifs really did get practiced.
  const motifs = canonicalMotifsFromThemes(puzzleThemes);
  if (motifs.length === 0) return;

  const existing = await prisma.userMotifRating.findMany({
    where: { userId, motif: { in: motifs } },
  });
  const byMotif = new Map(existing.map((m) => [m.motif, m]));

  // No transaction here: each motif row is independent and a partial
  // failure just means the next attempt re-converges. Avoids
  // serialization contention when multiple users review concurrently.
  await Promise.all(
    motifs.map(async (motif) => {
      const row = byMotif.get(motif);
      const prior: MotifRatingState = row
        ? {
            rating: row.rating,
            ewmaSuccess: row.ewmaSuccess,
            attempts: row.attempts,
            correct: row.correct,
            unlocked: row.unlocked,
          }
        : seedMotifRating(globalNext.rating);
      const next = updateMotifRating(prior, isCorrect);
      await prisma.userMotifRating.upsert({
        where: { userId_motif: { userId, motif } },
        update: {
          rating: next.rating,
          ewmaSuccess: next.ewmaSuccess,
          attempts: next.attempts,
          correct: next.correct,
          unlocked: next.unlocked,
        },
        create: {
          userId,
          motif,
          rating: next.rating,
          ewmaSuccess: next.ewmaSuccess,
          attempts: next.attempts,
          correct: next.correct,
          unlocked: next.unlocked,
        },
      });
    }),
  );
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { reviewId, puzzleId, response, timeSpentMs = 0 } = body as {
      reviewId?: string;
      puzzleId?: string;
      response?: ReviewResponse;
      timeSpentMs?: number;
    };

    if (!response || !["forgot", "partial", "effort", "easy"].includes(response)) {
      return NextResponse.json({ error: "Invalid response" }, { status: 400 });
    }
    if (!reviewId && !puzzleId) {
      return NextResponse.json(
        { error: "Missing reviewId or puzzleId" },
        { status: 400 },
      );
    }

    const user = { id: session.user.id };

    let priorState: CardState;
    let resolvedPuzzleId: string;
    let puzzleThemes: string[] = [];

    if (reviewId) {
      const existing = await prisma.puzzleReview.findUnique({
        where: { id: reviewId },
        select: {
          userId: true,
          puzzleId: true,
          interval: true,
          easeFactor: true,
          repetitions: true,
          nextReviewDate: true,
          phase: true,
          learningStepIndex: true,
          lastReviewDate: true,
          puzzle: { select: { themes: true } },
        },
      });
      if (!existing) {
        return NextResponse.json({ error: "Review not found" }, { status: 404 });
      }
      if (existing.userId !== user.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      priorState = {
        interval: existing.interval,
        easeFactor: existing.easeFactor,
        repetitions: existing.repetitions,
        nextReviewDate: existing.nextReviewDate,
        phase: existing.phase as "learning" | "exponential" | "relearning",
        learningStepIndex: existing.learningStepIndex,
        lastReviewDate: existing.lastReviewDate,
      };
      resolvedPuzzleId = existing.puzzleId;
      puzzleThemes = existing.puzzle.themes;
    } else {
      const puzzle = await prisma.puzzle.findUnique({
        where: { id: puzzleId },
        select: { id: true, themes: true },
      });
      if (!puzzle) {
        return NextResponse.json({ error: "Puzzle not found" }, { status: 404 });
      }
      priorState = {
        interval: 0,
        easeFactor: defaultSM2Config.startingEase,
        repetitions: 0,
        nextReviewDate: new Date(),
        phase: "learning",
        learningStepIndex: 0,
        lastReviewDate: null,
      };
      resolvedPuzzleId = puzzle.id;
      puzzleThemes = puzzle.themes;
    }

    const result = processReview(
      priorState,
      response,
      defaultSM2Config,
      new Date(),
    );
    const isCorrect = response === "effort" || response === "easy";

    await Promise.all([
      prisma.puzzleReview.upsert({
        where: {
          userId_puzzleId: { userId: user.id, puzzleId: resolvedPuzzleId },
        },
        update: {
          interval: result.newCardState.interval,
          easeFactor: result.newCardState.easeFactor,
          repetitions: result.newCardState.repetitions,
          nextReviewDate: result.newCardState.nextReviewDate,
          phase: result.newCardState.phase,
          learningStepIndex: result.newCardState.learningStepIndex,
          lastReviewDate: new Date(),
        },
        create: {
          userId: user.id,
          puzzleId: resolvedPuzzleId,
          interval: result.newCardState.interval,
          easeFactor: result.newCardState.easeFactor,
          repetitions: result.newCardState.repetitions,
          nextReviewDate: result.newCardState.nextReviewDate,
          phase: result.newCardState.phase,
          learningStepIndex: result.newCardState.learningStepIndex,
          lastReviewDate: new Date(),
        },
        select: { id: true },
      }),
      recordDailyActivity(user.id, isCorrect, timeSpentMs),
      advanceAdaptiveState(user.id, isCorrect, puzzleThemes),
    ]);

    return NextResponse.json({
      success: true,
      result: {
        message: result.message,
        intervalDays: result.intervalDays,
        nextReviewDate: result.nextReviewDate,
      },
    });
  } catch (err) {
    console.error("Error processing puzzle review:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
