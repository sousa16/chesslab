/**
 * API route to get training statistics for the current user
 * Returns count of due cards, total positions, streak, all-time accuracy, and total time spent
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildRepertoireTree } from "@/lib/repertoireTree";

/**
 * Calculate streak by counting consecutive days with activity.
 * Accepts pre-fetched activities (sorted by date desc) to avoid an extra DB query.
 */
function calculateStreakFromActivities(activities: { date: Date }[]): number {
  if (activities.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  // Use UTC to match PostgreSQL DATE type
  const todayUTC = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );

  // Check if user practiced today or yesterday (to allow for timezone differences)
  const lastActivityDate = new Date(activities[0].date);

  const daysDiff = Math.floor(
    (todayUTC.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  // If last activity was more than 1 day ago, streak is broken
  if (daysDiff > 1) return 0;

  // Start counting from the last activity date
  let expectedDate = new Date(lastActivityDate);

  for (const activity of activities) {
    const activityDate = new Date(activity.date);

    const diff = Math.floor(
      (expectedDate.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diff === 0) {
      streak++;
      expectedDate.setDate(expectedDate.getDate() - 1);
    } else if (diff > 0) {
      break; // Gap in streak
    }
  }

  return streak;
}

// Cache-Control reused across 200 and 304 responses.
const CACHE_HEADER = "private, max-age=30, stale-while-revalidate=60";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userIdRow = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!userIdRow) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Cheap probe: when did anything for this user last change? If the
    // browser is sending an If-None-Match that already covers that point
    // in time, we can skip the heavy aggregation and return 304. The
    // 5-minute time bucket ensures purely time-based transitions
    // ("entry just became due") still surface for idle users.
    const [maxEntry, maxActivity] = await Promise.all([
      prisma.repertoireEntry.findFirst({
        where: { repertoire: { userId: userIdRow.id } },
        select: { updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.dailyActivity.findFirst({
        where: { userId: userIdRow.id },
        select: { updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    const lastChanged = Math.max(
      maxEntry?.updatedAt.getTime() ?? 0,
      maxActivity?.updatedAt.getTime() ?? 0,
    );
    const timeBucket = Math.floor(Date.now() / (5 * 60 * 1000));
    const etag = `W/"${lastChanged}-${timeBucket}"`;

    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { etag, "Cache-Control": CACHE_HEADER },
      });
    }

    const today = new Date();
    const todayUTC = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
    );

    // Fan-out: full repertoires (needed for tree-build so we can count
    // LINES not individual positions) + daily activity for streak/accuracy.
    // First-move positions are stripped at the SQL layer.
    const [repertoires, allActivities] = await Promise.all([
      prisma.repertoire.findMany({
        where: { userId: userIdRow.id },
        select: {
          color: true,
          entries: {
            where: {
              // Skip first-move positions (fullmoveNumber = 1 covers the
              // starting position + positions after White's first move).
              // Uses the Position.fullmoveNumber btree index instead of
              // a `LIKE '% 1'` seq scan.
              position: { fullmoveNumber: { gt: 1 } },
            },
            select: {
              id: true,
              expectedMove: true,
              phase: true,
              nextReviewDate: true,
              position: { select: { fen: true } },
            },
          },
        },
      }),
      prisma.dailyActivity.findMany({
        where: { userId: userIdRow.id },
        orderBy: { date: "desc" },
        select: {
          date: true,
          correctCount: true,
          incorrectCount: true,
          timeSpentMs: true,
          positionsReviewed: true,
        },
      }),
    ]);

    const now = new Date();
    let dueCount = 0;

    // colorStats now counts LINES (= tree leaves = deepest saved position
    // per branch), aligning with how the repertoire panel counts.
    // "mastered" = SRS has promoted the leaf out of the learning phase.
    const colorStats = {
      white: { mastered: 0, total: 0 },
      black: { mastered: 0, total: 0 },
    };

    for (const repertoire of repertoires) {
      const colorKey = repertoire.color === "White" ? "white" : "black";

      // Count due cards across ALL positions (the practice queue is per
      // position, not per line — that's still position-based by design).
      for (const entry of repertoire.entries) {
        if (new Date(entry.nextReviewDate) <= now) dueCount++;
      }

      // Build the tree to find leaves (= lines). Each leaf counts as one
      // line; a leaf in `exponential` phase counts as a mastered line.
      const { roots } = buildRepertoireTree(repertoire.entries, repertoire.color);
      const entriesById = new Map(repertoire.entries.map((e) => [e.id, e]));
      const visited = new Set<string>();
      const walk = (node: (typeof roots)[number]) => {
        if (visited.has(node.id)) return;
        visited.add(node.id);
        if (node.children.length === 0) {
          const e = entriesById.get(node.id);
          if (e) {
            colorStats[colorKey].total++;
            if (e.phase === "exponential") colorStats[colorKey].mastered++;
          }
        }
        for (const c of node.children) walk(c);
      };
      for (const root of roots) walk(root);
    }

    const streak = calculateStreakFromActivities(allActivities);

    let totalCorrect = 0;
    let totalIncorrect = 0;
    let totalTimeMsToday = 0;
    let positionsReviewedToday = 0;

    for (const activity of allActivities) {
      totalCorrect += activity.correctCount;
      totalIncorrect += activity.incorrectCount;

      if (new Date(activity.date).getTime() === todayUTC.getTime()) {
        totalTimeMsToday += activity.timeSpentMs;
        positionsReviewedToday += activity.positionsReviewed ?? 0;
      }
    }

    const totalReviews = totalCorrect + totalIncorrect;
    const accuracy =
      totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0;
    const timeSpentMinutes = Math.round(totalTimeMsToday / 60000);

    return NextResponse.json(
      {
        dueCount,
        colorStats,
        streak,
        accuracy,
        timeSpentMinutes,
        positionsReviewedToday,
      },
      { headers: { etag, "Cache-Control": CACHE_HEADER } },
    );
  } catch (error) {
    console.error("Error fetching training stats:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
