/**
 * Drill session list + create.
 *
 * GET → user's active and recently-completed drills, newest first. The UI
 * shows active ones for resume and the last few completed for satisfaction
 * (cycle-time-shrinkage is the addictive part of Woodpecker).
 *
 * POST → create a new drill. Body: { motif: string, size: 20|50|100 }.
 *   - motif is a canonical motif name or "mixed".
 *   - size is the number of puzzles in the set. 50 is the documented sweet
 *     spot for sub-2000 players (Smith & Tikkanen 2018) but we let the user
 *     pick a smaller block when they're trying it out.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCanonicalMotif } from "@/lib/motifs";
import { pickDrillPuzzles } from "@/lib/drillSelection";

const ALLOWED_SIZES = new Set([20, 50, 100]);

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const [active, recentCompleted] = await Promise.all([
      prisma.drillSession.findMany({
        where: { userId, status: "active" },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.drillSession.findMany({
        where: { userId, status: "completed" },
        orderBy: { completedAt: "desc" },
        take: 5,
      }),
    ]);

    return NextResponse.json({
      active: active.map(serializeSession),
      recentCompleted: recentCompleted.map(serializeSession),
    });
  } catch (err) {
    console.error("Error listing drills:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json();
    const motif = typeof body.motif === "string" ? body.motif : null;
    const size = typeof body.size === "number" ? body.size : null;

    if (!motif || (motif !== "mixed" && !isCanonicalMotif(motif))) {
      return NextResponse.json(
        { error: "motif must be 'mixed' or a canonical motif name" },
        { status: 400 },
      );
    }
    if (size === null || !ALLOWED_SIZES.has(size)) {
      return NextResponse.json(
        { error: "size must be 20, 50, or 100" },
        { status: 400 },
      );
    }

    const puzzleIds = await pickDrillPuzzles({ userId, motif, size });
    if (puzzleIds.length < size) {
      // Don't silently start a too-small drill — the Woodpecker payoff
      // depends on cycling enough puzzles to keep them fresh between
      // exposures. Tell the user to pick a smaller size or a different motif.
      return NextResponse.json(
        {
          error: `Only ${puzzleIds.length} unseen puzzles available for this motif at your rating. Try a smaller size or a different motif.`,
        },
        { status: 422 },
      );
    }

    const drill = await prisma.drillSession.create({
      data: {
        userId,
        motif,
        size,
        puzzleIds,
      },
    });

    return NextResponse.json(serializeSession(drill));
  } catch (err) {
    console.error("Error creating drill:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function serializeSession(d: {
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
