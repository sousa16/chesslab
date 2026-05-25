import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

// Proxy to stockfish.online so the FEN goes out from our server (avoids
// any CORS surprises) and so we can normalize the response shape — their
// `bestmove` field is the raw UCI engine line ("bestmove e2e4 ponder e7e5"),
// not just the move.
//
// We expose:
//   { eval: number | null, mate: number | null, bestMove: string | null,
//     continuation: string | null }
// where `eval` is in pawns from white's POV (their `evaluation`), or null
// when the position is mate-forced (in which case `mate` is signed plies).

interface UpstreamResponse {
  success?: boolean;
  evaluation?: number | null;
  mate?: number | null;
  bestmove?: string | null;
  continuation?: string | null;
}

export interface AnalysisResponse {
  eval: number | null;
  mate: number | null;
  bestMove: string | null;
  continuation: string | null;
}

// Stockfish.online accepts depth up to 15. 12 is a good balance between
// strength and latency for puzzle-side exploration.
const DEFAULT_DEPTH = 12;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fen = request.nextUrl.searchParams.get("fen");
  if (!fen) {
    return NextResponse.json({ error: "Missing fen" }, { status: 400 });
  }
  const depthParam = request.nextUrl.searchParams.get("depth");
  const depth = depthParam ? Math.max(1, Math.min(15, Number(depthParam) || DEFAULT_DEPTH)) : DEFAULT_DEPTH;

  const upstreamUrl = `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(fen)}&depth=${depth}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(upstreamUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream ${res.status}` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as UpstreamResponse;
    if (!data.success) {
      return NextResponse.json(
        { error: "Engine did not return a result" },
        { status: 502 },
      );
    }

    // "bestmove e2e4 ponder e7e5" → "e2e4"
    let bestMove: string | null = null;
    if (typeof data.bestmove === "string") {
      const parts = data.bestmove.split(/\s+/);
      const idx = parts.indexOf("bestmove");
      if (idx >= 0 && parts[idx + 1]) bestMove = parts[idx + 1];
    }

    const payload: AnalysisResponse = {
      eval: typeof data.evaluation === "number" ? data.evaluation : null,
      mate: typeof data.mate === "number" ? data.mate : null,
      bestMove,
      continuation:
        typeof data.continuation === "string" ? data.continuation : null,
    };
    return NextResponse.json(payload);
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      { error: aborted ? "Engine timeout" : "Engine request failed" },
      { status: 504 },
    );
  }
}
