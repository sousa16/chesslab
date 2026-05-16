/**
 * API route to get training statistics for the current user
 * Returns count of due cards, total positions, streak, all-time accuracy, and total time spent
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve user id first (single light query); then fan out the heavy
    // queries in parallel so we don't pay sequential round-trips.
    const userIdRow = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!userIdRow) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const today = new Date();
    const todayUTC = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
    );

    // Fan-out: repertoire entries (for due/total/learned counts) + daily
    // activity (for streak/accuracy/today). The first-move filter is pushed
    // into Postgres via the fullmove counter at the end of the FEN.
    const [repertoires, allActivities] = await Promise.all([
      prisma.repertoire.findMany({
        where: { userId: userIdRow.id },
        select: {
          color: true,
          entries: {
            where: {
              position: { NOT: { fen: { endsWith: " 1" } } },
            },
            select: { nextReviewDate: true },
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
    let totalPositions = 0;

    const colorStats = {
      white: { learned: 0, total: 0 },
      black: { learned: 0, total: 0 },
    };

    for (const repertoire of repertoires) {
      const colorKey = repertoire.color === "White" ? "white" : "black";

      for (const entry of repertoire.entries) {
        totalPositions++;
        colorStats[colorKey].total++;

        if (new Date(entry.nextReviewDate) > now) {
          colorStats[colorKey].learned++;
        } else {
          dueCount++;
        }
      }
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
        totalPositions,
        colorStats,
        streak,
        accuracy,
        timeSpentMinutes,
        positionsReviewedToday,
      },
      {
        headers: {
          // Cache per-user in the browser for 30s; serve stale for up to 60s while revalidating
          "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    console.error("Error fetching training stats:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
