import { POST } from "@/app/api/puzzles/review/route";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  authOptions: {},
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    puzzleReview: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    puzzle: {
      findUnique: jest.fn(),
    },
    dailyActivity: {
      upsert: jest.fn(),
    },
  },
}));

const mockSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/puzzles/review", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/puzzles/review", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "user-1" } } as any);
    (mockPrisma.puzzleReview.upsert as jest.Mock).mockResolvedValue({
      id: "review-1",
    });
    (mockPrisma.dailyActivity.upsert as jest.Mock).mockResolvedValue({});
  });

  it("returns 401 when no session", async () => {
    mockSession.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ puzzleId: "p1", response: "easy" }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects an unknown response value with 400", async () => {
    const res = await POST(
      makeRequest({ puzzleId: "p1", response: "nope" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid response" });
  });

  it("rejects a request that has neither reviewId nor puzzleId", async () => {
    const res = await POST(makeRequest({ response: "easy" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Missing reviewId or puzzleId",
    });
  });

  it("creates a fresh review when called with a puzzleId on first encounter", async () => {
    (mockPrisma.puzzle.findUnique as jest.Mock).mockResolvedValue({
      id: "puz-42",
    });

    const res = await POST(
      makeRequest({
        puzzleId: "puz-42",
        response: "easy",
        timeSpentMs: 5000,
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result).toHaveProperty("intervalDays");
    expect(mockPrisma.puzzleReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_puzzleId: { userId: "user-1", puzzleId: "puz-42" },
        },
      }),
    );
    expect(mockPrisma.dailyActivity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: "user-1",
          correctCount: 1,
          incorrectCount: 0,
        }),
      }),
    );
  });

  it("returns 404 when the puzzleId doesn't exist", async () => {
    (mockPrisma.puzzle.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await POST(
      makeRequest({ puzzleId: "missing", response: "easy" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when the reviewId doesn't exist", async () => {
    (mockPrisma.puzzleReview.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await POST(
      makeRequest({ reviewId: "missing", response: "easy" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when the reviewId belongs to another user", async () => {
    (mockPrisma.puzzleReview.findUnique as jest.Mock).mockResolvedValue({
      userId: "someone-else",
      puzzleId: "puz-1",
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      nextReviewDate: new Date(),
      phase: "learning",
      learningStepIndex: 0,
      lastReviewDate: null,
    });
    const res = await POST(
      makeRequest({ reviewId: "rev-1", response: "easy" }),
    );
    expect(res.status).toBe(403);
  });

  it("uses stored card state when an existing reviewId is supplied", async () => {
    const past = new Date("2024-01-01");
    (mockPrisma.puzzleReview.findUnique as jest.Mock).mockResolvedValue({
      userId: "user-1",
      puzzleId: "puz-7",
      interval: 5,
      easeFactor: 2.3,
      repetitions: 3,
      nextReviewDate: past,
      phase: "exponential",
      learningStepIndex: 0,
      lastReviewDate: past,
    });
    const res = await POST(
      makeRequest({ reviewId: "rev-7", response: "forgot" }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.puzzleReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_puzzleId: { userId: "user-1", puzzleId: "puz-7" },
        },
      }),
    );
    // 'forgot' should decrement repetitions/relearn — verify it logged an incorrect.
    expect(mockPrisma.dailyActivity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          incorrectCount: 1,
          correctCount: 0,
        }),
      }),
    );
  });

  it("returns 500 when the database throws unexpectedly", async () => {
    (mockPrisma.puzzle.findUnique as jest.Mock).mockRejectedValue(
      new Error("db down"),
    );
    const res = await POST(
      makeRequest({ puzzleId: "p", response: "easy" }),
    );
    expect(res.status).toBe(500);
  });
});
