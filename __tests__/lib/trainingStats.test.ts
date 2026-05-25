/**
 * Unit tests for training stats aggregation (computeTrainingStats path).
 */

import { prisma } from "@/lib/prisma";

jest.mock("next/cache", () => ({
  unstable_cache: (fn: (userId: string, _lc: number) => unknown) => fn,
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: jest.fn(),
    repertoireEntry: {
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    dailyActivity: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

import {
  getTrainingStats,
  getTrainingStatsLastChanged,
} from "@/lib/trainingStats";

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe("getTrainingStatsLastChanged", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the max updatedAt across entries and activity", async () => {
    const t1 = new Date("2024-01-01T00:00:00Z");
    const t2 = new Date("2024-06-01T00:00:00Z");
    mockPrisma.repertoireEntry.findFirst.mockResolvedValue({
      updatedAt: t1,
    } as any);
    mockPrisma.dailyActivity.findFirst.mockResolvedValue({
      updatedAt: t2,
    } as any);

    const result = await getTrainingStatsLastChanged("user-1");
    expect(result).toBe(t2.getTime());
  });

  it("returns 0 when user has no rows", async () => {
    mockPrisma.repertoireEntry.findFirst.mockResolvedValue(null);
    mockPrisma.dailyActivity.findFirst.mockResolvedValue(null);

    expect(await getTrainingStatsLastChanged("user-1")).toBe(0);
  });
});

describe("getTrainingStats", () => {
  const today = new Date();
  const todayUTC = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.repertoireEntry.findFirst.mockResolvedValue(null);
    mockPrisma.dailyActivity.findFirst.mockResolvedValue(null);
  });

  it("aggregates leaf counts, due count, and activity fields", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { color: "White", phase: "exponential", count: BigInt(2) },
      { color: "White", phase: "learning", count: BigInt(1) },
      { color: "Black", phase: "learning", count: BigInt(3) },
    ]);
    mockPrisma.repertoireEntry.count.mockResolvedValue(4);
    mockPrisma.dailyActivity.findMany.mockResolvedValue([
      {
        date: todayUTC,
        timeSpentMs: 120_000,
        positionsReviewed: 5,
      },
      {
        date: new Date(todayUTC.getTime() - 86_400_000),
        timeSpentMs: 60_000,
        positionsReviewed: 2,
      },
    ]);
    mockPrisma.dailyActivity.aggregate.mockResolvedValue({
      _sum: { correctCount: 8, incorrectCount: 2 },
    } as any);

    const stats = await getTrainingStats("user-1");

    expect(stats.dueCount).toBe(4);
    expect(stats.colorStats.white).toEqual({ mastered: 2, total: 3 });
    expect(stats.colorStats.black).toEqual({ mastered: 0, total: 3 });
    expect(stats.streak).toBeGreaterThanOrEqual(1);
    expect(stats.accuracy).toBe(80);
    expect(stats.timeSpentMinutes).toBe(2);
    expect(stats.positionsReviewedToday).toBe(5);
  });

  it("returns zeros when user has no data", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.repertoireEntry.count.mockResolvedValue(0);
    mockPrisma.dailyActivity.findMany.mockResolvedValue([]);
    mockPrisma.dailyActivity.aggregate.mockResolvedValue({
      _sum: { correctCount: null, incorrectCount: null },
    } as any);

    const stats = await getTrainingStats("user-1");

    expect(stats).toEqual({
      dueCount: 0,
      colorStats: {
        white: { mastered: 0, total: 0 },
        black: { mastered: 0, total: 0 },
      },
      streak: 0,
      accuracy: 0,
      timeSpentMinutes: 0,
      positionsReviewedToday: 0,
    });
  });
});
