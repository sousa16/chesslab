import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  type GapFilters,
  runGapAnalysis,
} from "@/lib/gapAnalysis";

// We fetch up to a few hundred games + replay them in chess.js, which
// can take 10–30s with cold connections to chess.com / Lichess.
export const maxDuration = 60;

interface RequestBody {
  chesscomUsername?: string;
  lichessUsername?: string;
  minRating?: number;
  maxRating?: number;
  timeClasses?: string[];
  color?: "white" | "black" | "both";
  maxGames?: number;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const chesscomUsername = body.chesscomUsername?.trim() || undefined;
  const lichessUsername = body.lichessUsername?.trim() || undefined;
  if (!chesscomUsername && !lichessUsername) {
    return NextResponse.json(
      { error: "Provide a chess.com or Lichess username" },
      { status: 400 },
    );
  }

  const filters: GapFilters = {
    chesscomUsername,
    lichessUsername,
    minRating:
      typeof body.minRating === "number" ? body.minRating : undefined,
    maxRating:
      typeof body.maxRating === "number" ? body.maxRating : undefined,
    timeClasses: Array.isArray(body.timeClasses)
      ? body.timeClasses.filter(
          (t): t is string =>
            typeof t === "string" &&
            ["bullet", "blitz", "rapid", "classical"].includes(t),
        )
      : undefined,
    color: body.color === "white" || body.color === "black" ? body.color : "both",
    // Hard cap so a user can't ask us to fetch 50k games and burn the
    // serverless function quota. 500 is plenty for a meaningful sample.
    maxGames: Math.max(1, Math.min(500, body.maxGames ?? 200)),
  };

  // Pull the user's repertoire entry FENs grouped by color. We only need
  // the FEN strings to know "does the user have a saved response at this
  // position", so the projection is tiny even for big repertoires.
  const repertoiresRaw = await prisma.repertoire.findMany({
    where: { userId: session.user.id },
    select: {
      color: true,
      entries: {
        select: { position: { select: { fen: true } } },
      },
    },
  });

  const repertoires = repertoiresRaw.map((r) => ({
    color: (r.color === "White" ? "white" : "black") as "white" | "black",
    fens: r.entries.map((e) => e.position.fen),
  }));

  try {
    const result = await runGapAnalysis(filters, repertoires);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Gap analysis failed",
      },
      { status: 500 },
    );
  }
}
