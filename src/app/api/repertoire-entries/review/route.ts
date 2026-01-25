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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { entryId, response } = body;

    if (!entryId || !response) {
      return NextResponse.json(
        { error: "Missing entryId or response" },
        { status: 400 },
      );
    }

    if (!["forgot", "partial", "effort", "easy"].includes(response)) {
      return NextResponse.json({ error: "Invalid response" }, { status: 400 });
    }

    // Fetch the entry and verify ownership
    const entry = await prisma.repertoireEntry.findUnique({
      where: { id: entryId },
      include: {
        repertoire: {
          include: {
            user: true,
          },
        },
        position: true,
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (entry.repertoire.user.email !== session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Process the review using SM-2 algorithm
    const currentCardState = {
      interval: entry.interval,
      easeFactor: entry.easeFactor,
      repetitions: entry.repetitions,
      nextReviewDate: entry.nextReviewDate,
      phase: entry.phase as "learning" | "exponential" | "relearning",
      learningStepIndex: entry.learningStepIndex,
      lastReviewDate: entry.lastReviewDate,
    };

    const result = processReview(
      currentCardState,
      response as ReviewResponse,
      defaultSM2Config,
      new Date(),
    );

    // Update the entry with new SM-2 state
    const updatedEntry = await prisma.repertoireEntry.update({
      where: { id: entryId },
      data: {
        interval: result.newCardState.interval,
        easeFactor: result.newCardState.easeFactor,
        repetitions: result.newCardState.repetitions,
        nextReviewDate: result.newCardState.nextReviewDate,
        phase: result.newCardState.phase,
        learningStepIndex: result.newCardState.learningStepIndex,
        lastReviewDate: new Date(),
        updatedAt: new Date(),
      },
      include: {
        position: true,
      },
    });

    return NextResponse.json({
      success: true,
      entry: updatedEntry,
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
