/**
 * API route to get training statistics for the current user.
 * Used by the client-side refetch on tab focus and the in-app
 * `training-stats-updated` event. Cold-load stats are server-rendered
 * directly on /home — see lib/trainingStats.getTrainingStats.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  getTrainingStats,
  getTrainingStatsLastChanged,
} from "@/lib/trainingStats";

// max-age=0 forces every nav to ask the server, but the etag fast-path
// (cheap probe + 304) means a hit costs essentially one network round-
// trip. With max-age=30 the browser previously served stale stats for
// up to 30s after a write, which hid post-review updates.
const CACHE_HEADER = "private, max-age=0, must-revalidate";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Cheap probe: when did anything for this user last change? Combined
    // with a 5-minute time bucket so time-based transitions ("entry just
    // became due") still surface for idle users.
    const lastChanged = await getTrainingStatsLastChanged(userId);
    const timeBucket = Math.floor(Date.now() / (5 * 60 * 1000));
    const etag = `W/"${lastChanged}-${timeBucket}"`;

    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { etag, "Cache-Control": CACHE_HEADER },
      });
    }

    const stats = await getTrainingStats(userId);

    return NextResponse.json(stats, {
      headers: { etag, "Cache-Control": CACHE_HEADER },
    });
  } catch (error) {
    console.error("Error fetching training stats:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
