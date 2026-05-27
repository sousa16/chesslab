/**
 * Drill session detail + abandon.
 *
 * GET → full session state + current puzzle, so the solving page can
 * render with a single round-trip.
 *
 * DELETE → mark as abandoned. Kept in the DB rather than hard-deleted so
 * the user can still see "I tried this drill" in their history (and we
 * could rehabilitate it later if we wanted to).
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const { id } = await ctx.params;

    const drill = await prisma.drillSession.findUnique({ where: { id } });
    if (!drill) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (drill.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Current puzzle is whatever sits at drill.position in the frozen list.
    // If status is completed/abandoned there's no current puzzle.
    let currentPuzzle = null;
    if (drill.status === "active") {
      const puzzleId = drill.puzzleIds[drill.position];
      if (puzzleId) {
        const p = await prisma.puzzle.findUnique({ where: { id: puzzleId } });
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
      session: serialize(drill),
      currentPuzzle,
    });
  } catch (err) {
    console.error("Error fetching drill:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const { id } = await ctx.params;

    const drill = await prisma.drillSession.findUnique({ where: { id } });
    if (!drill) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (drill.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (drill.status !== "active") {
      return NextResponse.json({ ok: true, alreadyClosed: true });
    }
    await prisma.drillSession.update({
      where: { id },
      data: { status: "abandoned" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error abandoning drill:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function serialize(d: {
  id: string;
  motif: string;
  size: number;
  cycle: number;
  targetCycles: number;
  position: number;
  baselineMs: number | null;
  lastCycleMs: number | null;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
}) {
  return {
    id: d.id,
    motif: d.motif,
    size: d.size,
    cycle: d.cycle,
    targetCycles: d.targetCycles,
    position: d.position,
    baselineMs: d.baselineMs,
    lastCycleMs: d.lastCycleMs,
    status: d.status,
    createdAt: d.createdAt,
    completedAt: d.completedAt,
  };
}
