/**
 * API route for processing card reviews in the training module
 * Handles SM-2 spaced repetition calculations and database updates
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  processReview,
  defaultSM2Config,
  type ReviewResponse,
} from "@/lib/sm2";

/**
 * Record daily activity for tracking streak, accuracy, and time
 */
async function recordDailyActivity(
  userId: string,
  isCorrect: boolean,
  timeSpentMs: number = 0,
) {
  // Use UTC date to match PostgreSQL DATE type
  const today = new Date();
  const todayUTC = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );

  await prisma.dailyActivity.upsert({
    where: {
      userId_date: {
        userId,
        date: todayUTC,
      },
    },
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

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { entryId, response, timeSpentMs = 0 } = body;

    if (!entryId || !response) {
      return NextResponse.json(
        { error: "Missing entryId or response" },
        { status: 400 },
      );
    }

    if (!["forgot", "partial", "effort", "easy"].includes(response)) {
      return NextResponse.json({ error: "Invalid response" }, { status: 400 });
    }

    // Fetch only the SM-2 state and the owning user id — verifying ownership
    // doesn't need the full user row or the linked Position.
    const entry = await prisma.repertoireEntry.findUnique({
      where: { id: entryId },
      select: {
        interval: true,
        easeFactor: true,
        repetitions: true,
        nextReviewDate: true,
        phase: true,
        learningStepIndex: true,
        lastReviewDate: true,
        repertoire: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (entry.repertoire.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const result = processReview(
      {
        interval: entry.interval,
        easeFactor: entry.easeFactor,
        repetitions: entry.repetitions,
        nextReviewDate: entry.nextReviewDate,
        phase: entry.phase as "learning" | "exponential" | "relearning",
        learningStepIndex: entry.learningStepIndex,
        lastReviewDate: entry.lastReviewDate,
      },
      response as ReviewResponse,
      defaultSM2Config,
      new Date(),
    );

    // Run the entry update and the daily-activity upsert in parallel —
    // they're independent and each is a single round-trip.
    const isCorrect = response === "effort" || response === "easy";
    await Promise.all([
      prisma.repertoireEntry.update({
        where: { id: entryId },
        data: {
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
      recordDailyActivity(entry.repertoire.userId, isCorrect, timeSpentMs),
    ]);

    return NextResponse.json({
      success: true,
      result: {
        message: result.message,
        intervalDays: result.intervalDays,
        nextReviewDate: result.nextReviewDate,
      },
    });
  } catch (error) {
    console.error("Error processing review:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
