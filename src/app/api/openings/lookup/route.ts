/**
 * GET /api/openings/lookup?moves=e4,e5,Nc3
 *
 * Server-side wrapper around `lookupOpening` so the ~470 KB ECO dataset
 * stays out of the client bundle. Used by the build screen to show the
 * user-in-progress opening name as they add moves.
 */

import { NextRequest, NextResponse } from "next/server";
import { lookupOpening } from "@/lib/openings";

export async function GET(request: NextRequest) {
  const movesParam = request.nextUrl.searchParams.get("moves") ?? "";
  const moves = movesParam
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  if (moves.length === 0) {
    return NextResponse.json(
      { match: null },
      {
        headers: {
          // Aggressively cache empty lookups; they're constant.
          "Cache-Control": "public, max-age=3600",
        },
      },
    );
  }

  const match = lookupOpening(moves);
  return NextResponse.json(
    { match },
    {
      headers: {
        // Pure function of input — cache per-URL.
        "Cache-Control": "public, max-age=3600, immutable",
      },
    },
  );
}
