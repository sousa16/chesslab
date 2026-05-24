import { GET } from "@/app/api/puzzles/next/route";
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
    userPuzzlePrefs: {
      findUnique: jest.fn(),
    },
    puzzleReview: {
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const samplePuzzle = {
  id: "puzzle-1",
  lichessId: "abc",
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  moves: "e2e4 e7e5",
  rating: 1200,
  themes: ["fork"],
  categories: ["middlegame"],
};

describe("GET /api/puzzles/next", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.userPuzzlePrefs.findUnique.mockResolvedValue(null);
    mockPrisma.puzzleReview.count.mockResolvedValue(2);
    mockPrisma.$queryRaw.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(
      new NextRequest("http://localhost/api/puzzles/next"),
    );
    expect(res.status).toBe(401);
  });

  it("returns due puzzle and passes comma-separated exclude ids", async () => {
    mockPrisma.puzzleReview.findFirst.mockResolvedValue({
      id: "review-1",
      puzzleId: "puzzle-1",
      nextReviewDate: new Date(),
      puzzle: samplePuzzle,
    } as any);

    const res = await GET(
      new NextRequest(
        "http://localhost/api/puzzles/next?exclude=puzzle-1,puzzle-2,puzzle-3",
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.source).toBe("due");
    expect(json.puzzle.id).toBe("puzzle-1");
    expect(mockPrisma.puzzleReview.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          puzzleId: { notIn: ["puzzle-1", "puzzle-2", "puzzle-3"] },
        }),
      }),
    );
  });

  it("returns empty when no due or new puzzles", async () => {
    mockPrisma.puzzleReview.findFirst.mockResolvedValue(null);
    mockPrisma.puzzleReview.count.mockResolvedValue(0);

    const res = await GET(
      new NextRequest("http://localhost/api/puzzles/next"),
    );
    const json = await res.json();

    expect(json.source).toBe("empty");
    expect(json.puzzle).toBeNull();
  });
});
