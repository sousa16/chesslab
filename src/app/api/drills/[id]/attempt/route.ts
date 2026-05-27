/**
 * Record a single attempt within a drill session.
 *
 * Body: { correct: boolean, timeMs: number }
 *
 * Flow:
 *  1. Persist a DrillAttempt row for the puzzle at the current position.
 *  2. Advance position; when position rolls past the end of the set, finish
 *     the cycle (recording lastCycleMs, baselineMs on cycle 1) and either
 *     bump to the next cycle or graduate the drill.
 *  3. Graduation (cycle > targetCycles) seeds PuzzleReview rows in the
 *     exponential phase at ~14 days — the Woodpecker convention: the
 *     pattern is now automatic, just needs anti-decay refreshers.
 *
 * Returns: { session, currentPuzzle, cycleCompleted, graduated }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { defaultSM2Config } from "@/lib/sm2";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Seeded interval (days) for the SRS rows we create when a drill graduates.
// 14d matches the Woodpecker convention: by cycle 5 the puzzle is automatic,
// so we want long anti-decay refreshers rather than the standard learning
// ramp that would re-test in 24min/2h/1d.
const GRADUATION_INTERVAL_DAYS = 14;

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const { id } = await ctx.params;

    const body = await request.json();
    const correct = typeof body.correct === "boolean" ? body.correct : null;
    const timeMs = typeof body.timeMs === "number" ? body.timeMs : null;
    if (correct === null || timeMs === null || timeMs < 0) {
      return NextResponse.json(
        { error: "Body must include { correct: boolean, timeMs: number }" },
        { status: 400 },
      );
    }

    const drill = await prisma.drillSession.findUnique({ where: { id } });
    if (!drill) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (drill.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (drill.status !== "active") {
      return NextResponse.json(
        { error: "Drill is not active" },
        { status: 409 },
      );
    }

    const puzzleId = drill.puzzleIds[drill.position];
    if (!puzzleId) {
      // Shouldn't happen unless the row was tampered with.
      return NextResponse.json(
        { error: "No puzzle at current position" },
        { status: 500 },
      );
    }

    await prisma.drillAttempt.create({
      data: {
        sessionId: drill.id,
        puzzleId,
        cycle: drill.cycle,
        correct,
        timeMs,
      },
    });

    let cycleCompleted = false;
    let graduated = false;
    let nextPosition = drill.position + 1;
    let nextCycle = drill.cycle;
    let nextBaselineMs = drill.baselineMs;
    let nextLastCycleMs = drill.lastCycleMs;
    let nextStatus = drill.status;
    let completedAt: Date | null = null;

    if (nextPosition >= drill.size) {
      cycleCompleted = true;
      // Tally this cycle's wall time from the attempts table — single
      // source of truth, immune to client clock drift.
      const cycleAttempts = await prisma.drillAttempt.findMany({
        where: { sessionId: drill.id, cycle: drill.cycle },
        select: { timeMs: true },
      });
      const cycleTotalMs = cycleAttempts.reduce(
        (sum, a) => sum + a.timeMs,
        0,
      );
      nextLastCycleMs = cycleTotalMs;
      if (drill.cycle === 1) nextBaselineMs = cycleTotalMs;

      if (drill.cycle >= drill.targetCycles) {
        graduated = true;
        nextStatus = "completed";
        completedAt = new Date();
      } else {
        nextCycle = drill.cycle + 1;
        nextPosition = 0;
      }
    }

    const updated = await prisma.drillSession.update({
      where: { id: drill.id },
      data: {
        position: nextPosition,
        cycle: nextCycle,
        baselineMs: nextBaselineMs,
        lastCycleMs: nextLastCycleMs,
        status: nextStatus,
        completedAt: completedAt ?? undefined,
      },
    });

    if (graduated) {
      // Seed the SRS with all puzzles from this drill at a long interval.
      // upsert so a puzzle the user happens to have separately reviewed
      // doesn't get its existing SM-2 state overwritten — drill graduation
      // only seeds, it doesn't clobber.
      const nextReview = new Date(
        Date.now() + GRADUATION_INTERVAL_DAYS * 24 * 60 * 60 * 1000,
      );
      await Promise.all(
        drill.puzzleIds.map((pid) =>
          prisma.puzzleReview.upsert({
            where: { userId_puzzleId: { userId, puzzleId: pid } },
            update: {},
            create: {
              userId,
              puzzleId: pid,
              interval: GRADUATION_INTERVAL_DAYS,
              easeFactor: defaultSM2Config.startingEase,
              repetitions: 1,
              nextReviewDate: nextReview,
              phase: "exponential",
              learningStepIndex: 0,
              lastReviewDate: new Date(),
            },
          }),
        ),
      );
    }

    // Load the next puzzle to return alongside the updated session, saving
    // a round-trip when the client is mid-drill.
    let currentPuzzle = null;
    if (updated.status === "active") {
      const nextPuzzleId = updated.puzzleIds[updated.position];
      if (nextPuzzleId) {
        const p = await prisma.puzzle.findUnique({
          where: { id: nextPuzzleId },
        });
        if (p) {
          currentPuzzle = {
            id: p.id,
            lichessId: p.lichessId,
            fen: p.fen,
            moves: p.moves,
            rating: p.rating,
            themes: p.themes,
            categories: p.categories,
          };
        }
      }
    }

    return NextResponse.json({
      session: {
        id: updated.id,
        motif: updated.motif,
        size: updated.size,
        cycle: updated.cycle,
        targetCycles: updated.targetCycles,
        position: updated.position,
        baselineMs: updated.baselineMs,
        lastCycleMs: updated.lastCycleMs,
        status: updated.status,
        createdAt: updated.createdAt,
        completedAt: updated.completedAt,
      },
      currentPuzzle,
      cycleCompleted,
      graduated,
    });
  } catch (err) {
    console.error("Error recording drill attempt:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
