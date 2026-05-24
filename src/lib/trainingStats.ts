/**
 * Training stats aggregation, shared by the /api/training-stats route and
 * the /home server page.
 *
 * The heavy compute (entries fetch + chess.js tree-build to count line
 * leaves) is wrapped in `unstable_cache` keyed on userId + lastChanged.
 * Reads run a cheap probe to get lastChanged, then hit the cache; writes
 * to entries / daily activity naturally produce a new lastChanged and
 * therefore a new cache key, so invalidation is automatic.
 */

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export interface ColorStats {
  mastered: number;
  total: number;
}

export interface TrainingStats {
  dueCount: number;
  colorStats: {
    white: ColorStats;
    black: ColorStats;
  };
  streak: number;
  accuracy: number;
  timeSpentMinutes: number;
  positionsReviewedToday: number;
}

function calculateStreakFromActivities(activities: { date: Date }[]): number {
  if (activities.length === 0) return 0;

  const today = new Date();
  const todayUTC = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );

  const lastActivityDate = new Date(activities[0].date);
  const daysDiff = Math.floor(
    (todayUTC.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysDiff > 1) return 0;

  let streak = 0;
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
      break;
    }
  }
  return streak;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

async function computeTrainingStats(userId: string): Promise<TrainingStats> {
  const today = new Date();
  const todayUTC = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  const now = new Date();
  // Streak + today's counters only need the recent slice. All-time
  // accuracy is computed in SQL below — no need to scan every row.
  const since = new Date(Date.now() - NINETY_DAYS_MS);

  const [leafCounts, dueCount, recentActivities, accuracyAgg] = await Promise.all([
    // Count leaves per (color, phase). Uses the denormalized
    // RepertoireEntry.isLeaf column + the (repertoireId, isLeaf, phase)
    // composite index, so this is purely indexed aggregation — no
    // chess.js tree-build needed on the read path.
    prisma.$queryRaw<
      Array<{ color: string; phase: string; count: bigint }>
    >`
      SELECT r.color::text AS color, e.phase, COUNT(*)::bigint AS count
      FROM "Repertoire" r
      INNER JOIN "RepertoireEntry" e ON e."repertoireId" = r.id
      INNER JOIN "Position" p ON p.id = e."positionId"
      WHERE r."userId" = ${userId}
        AND e."isLeaf" = true
        AND p."fullmoveNumber" > 1
      GROUP BY r.color, e.phase
    `,
    // Due cards across both colors. Uses the (repertoireId,
    // nextReviewDate) composite index introduced in perf_indexes.
    prisma.repertoireEntry.count({
      where: {
        repertoire: { userId },
        nextReviewDate: { lte: now },
        position: { fullmoveNumber: { gt: 1 } },
      },
    }),
    prisma.dailyActivity.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: "desc" },
      select: {
        date: true,
        timeSpentMs: true,
        positionsReviewed: true,
      },
    }),
    prisma.dailyActivity.aggregate({
      where: { userId },
      _sum: { correctCount: true, incorrectCount: true },
    }),
  ]);

  const colorStats = {
    white: { mastered: 0, total: 0 },
    black: { mastered: 0, total: 0 },
  };
  for (const row of leafCounts) {
    const key = row.color === "White" ? "white" : "black";
    const n = Number(row.count);
    colorStats[key].total += n;
    if (row.phase === "exponential") colorStats[key].mastered += n;
  }

  const streak = calculateStreakFromActivities(recentActivities);

  let totalTimeMsToday = 0;
  let positionsReviewedToday = 0;
  for (const activity of recentActivities) {
    if (new Date(activity.date).getTime() === todayUTC.getTime()) {
      totalTimeMsToday += activity.timeSpentMs;
      positionsReviewedToday += activity.positionsReviewed ?? 0;
    }
  }

  const totalCorrect = accuracyAgg._sum.correctCount ?? 0;
  const totalIncorrect = accuracyAgg._sum.incorrectCount ?? 0;
  const totalReviews = totalCorrect + totalIncorrect;
  const accuracy =
    totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0;
  const timeSpentMinutes = Math.round(totalTimeMsToday / 60000);

  return {
    dueCount,
    colorStats,
    streak,
    accuracy,
    timeSpentMinutes,
    positionsReviewedToday,
  };
}

// Cached wrapper. The second positional arg is the cache-busting key —
// when `lastChanged` advances (entry or activity write), this argument
// changes and unstable_cache treats it as a cache miss; otherwise the
// previous result is returned. `revalidate: 300` is a safety net so
// values eventually refresh even if no writes happen for a while
// (covers the case where time alone makes a card become due).
const cachedComputeTrainingStats = unstable_cache(
  async (userId: string, _lastChanged: number) => computeTrainingStats(userId),
  ["training-stats-v1"],
  { revalidate: 300, tags: ["training-stats"] },
);

export async function getTrainingStats(userId: string): Promise<TrainingStats> {
  const lastChanged = await getTrainingStatsLastChanged(userId);
  return cachedComputeTrainingStats(userId, lastChanged);
}

/**
 * Cheap probe used by the API route's etag handshake — returns the most
 * recent change time across this user's entries + activity, so a 304
 * round-trip doesn't pay the heavy aggregation.
 */
export async function getTrainingStatsLastChanged(
  userId: string,
): Promise<number> {
  const [maxEntry, maxActivity] = await Promise.all([
    prisma.repertoireEntry.findFirst({
      where: { repertoire: { userId } },
      select: { updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.dailyActivity.findFirst({
      where: { userId },
      select: { updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return Math.max(
    maxEntry?.updatedAt.getTime() ?? 0,
    maxActivity?.updatedAt.getTime() ?? 0,
  );
}
