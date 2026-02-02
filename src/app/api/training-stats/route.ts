/**
 * API route to get training statistics for the current user
 * Returns count of due cards, total positions, streak, all-time accuracy, and total time spent
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Check if a position is a "first move" position that shouldn't be counted for training.
 */
function isFirstMovePosition(
  fen: string,
  repertoireColor: "White" | "Black",
): boolean {
  const parts = fen.split(" ");
  const sideToMove = parts[1];
  const fullmoveNumber = parseInt(parts[5], 10);

  if (repertoireColor === "White") {
    return fullmoveNumber === 1 && sideToMove === "w";
  } else {
    return fullmoveNumber === 1 && sideToMove === "b";
  }
}

/**
 * Calculate streak by counting consecutive days with activity
 */
async function calculateStreak(userId: string): Promise<number> {
  const activities = await prisma.dailyActivity.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    select: { date: true },
  });

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

  // If practice happened today or yesterday, count it as start of streak
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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        repertoires: {
          include: {
            entries: {
              include: {
                position: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const now = new Date();
    let dueCount = 0;
    let totalPositions = 0;

    // Per-color stats
    const colorStats = {
      white: { learned: 0, total: 0 },
      black: { learned: 0, total: 0 },
    };

    for (const repertoire of user.repertoires) {
      const colorKey = repertoire.color === "White" ? "white" : "black";

      for (const entry of repertoire.entries) {
        // Skip first move positions
        if (isFirstMovePosition(entry.position.fen, repertoire.color)) {
          continue;
        }

        totalPositions++;
        colorStats[colorKey].total++;

        // A position is "learned" if it's not due for review (next review in future)
        if (new Date(entry.nextReviewDate) > now) {
          colorStats[colorKey].learned++;
        } else if (new Date(entry.nextReviewDate) <= now) {
          // Only count non-first-move positions as due
          dueCount++;
        }
      }
    }

    // Get streak
    let streak = 0;
    let accuracy = 0;
    let timeSpentMinutes = 0;

    try {
      streak = await calculateStreak(user.id);

      // Get all-time accuracy (sum of all days)
      const allActivities = await prisma.dailyActivity.findMany({
        where: { userId: user.id },
      });

      let totalCorrect = 0;
      let totalIncorrect = 0;
      let totalTimeMs = 0;

      for (const activity of allActivities) {
        totalCorrect += activity.correctCount;
        totalIncorrect += activity.incorrectCount;
        totalTimeMs += activity.timeSpentMs;
      }

      const totalReviews = totalCorrect + totalIncorrect;
      accuracy =
        totalReviews > 0
          ? Math.round((totalCorrect / totalReviews) * 100)
          : 0;
      timeSpentMinutes = Math.round(totalTimeMs / 60000);
    } catch (activityError) {
      // If daily activity queries fail, continue with default values
      console.error("Error fetching daily activity:", activityError);
    }

    return NextResponse.json({
      dueCount,
      totalPositions,
      colorStats,
      streak,
      accuracy,
      timeSpentMinutes,
    });
  } catch (error) {
    console.error("Error fetching training stats:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
