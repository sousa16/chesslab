import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  type GapFilters,
  type GapProgressEvent,
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

  // Stream NDJSON: one JSON object per line. The client uses progress
  // events to drive a real bar; the final {type:"result"} line carries
  // the same payload the old single-shot JSON used to return.
  //
  // `request.signal` aborts when the user clicks Cancel or navigates
  // away. We forward it to runGapAnalysis, which forwards it to every
  // upstream fetch — so cancel actually cancels chess.com/lichess I/O
  // instead of just hanging up the response.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const write = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      const onProgress = (event: GapProgressEvent) => write(event);

      try {
        const result = await runGapAnalysis(filters, repertoires, {
          onProgress,
          signal: request.signal,
        });
        write({ type: "result", ...result });
      } catch (err) {
        // Check `name` directly — in some runtimes DOMException doesn't
        // satisfy `instanceof Error`, so an instanceof guard would let
        // genuine aborts fall through to the error branch.
        const name = (err as { name?: string } | null)?.name;
        if (name === "AbortError") {
          write({ type: "aborted" });
        } else {
          write({
            type: "error",
            error:
              err instanceof Error ? err.message : "Gap analysis failed",
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // Important on serverless: tell the platform NOT to buffer the
      // whole stream before flushing — defeats the point of progress.
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
