/**
 * Records a puzzle review using the shared SM-2 scheduler.
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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let priorState: CardState;
    let resolvedPuzzleId: string;

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
    } else {
      const puzzle = await prisma.puzzle.findUnique({
        where: { id: puzzleId },
        select: { id: true },
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
