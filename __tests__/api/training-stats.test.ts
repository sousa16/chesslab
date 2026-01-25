/**
 * Training Stats API Tests
 *
 * Tests for the /api/training-stats endpoint that returns:
 * - dueCount: number of cards due for review
 * - totalPositions: total positions (excluding first moves)
 * - colorStats: per-color learned/total counts
 */

import { GET } from "@/app/api/training-stats/route";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";

// Mock dependencies
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  authOptions: {},
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGetServerSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;

describe("Training Stats API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/training-stats", () => {
    it("should return 401 when user is not authenticated", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("should return 404 when user is not found", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "notfound@example.com" },
      });
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("User not found");
    });

    it("should return correct stats for user with no repertoires", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "test@example.com" },
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        repertoires: [],
      } as any);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        dueCount: 0,
        totalPositions: 0,
        colorStats: {
          white: { learned: 0, total: 0 },
          black: { learned: 0, total: 0 },
        },
      });
    });

    it("should exclude first-move positions from counts", async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago

      mockGetServerSession.mockResolvedValue({
        user: { email: "test@example.com" },
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        repertoires: [
          {
            id: "rep-1",
            color: "White",
            entries: [
              {
                // First move position for White - should be excluded
                id: "entry-1",
                repetitions: 1,
                nextReviewDate: pastDate,
                position: {
                  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                },
              },
              {
                // Second position - should be included
                id: "entry-2",
                repetitions: 1,
                nextReviewDate: pastDate,
                position: {
                  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
                },
              },
            ],
          },
        ],
      } as any);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.totalPositions).toBe(1); // Only second position counted
      expect(data.colorStats.white.total).toBe(1);
    });

    it("should exclude first-move positions for Black repertoire", async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1000 * 60 * 60);

      mockGetServerSession.mockResolvedValue({
        user: { email: "test@example.com" },
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        repertoires: [
          {
            id: "rep-1",
            color: "Black",
            entries: [
              {
                // First move position for Black (after 1.e4) - should be excluded
                id: "entry-1",
                repetitions: 0,
                nextReviewDate: pastDate,
                position: {
                  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
                },
              },
              {
                // Later position - should be included
                id: "entry-2",
                repetitions: 0,
                nextReviewDate: pastDate,
                position: {
                  fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
                },
              },
            ],
          },
        ],
      } as any);

      const response = await GET();
      const data = await response.json();

      expect(data.totalPositions).toBe(1);
      expect(data.colorStats.black.total).toBe(1);
    });

    it("should correctly count due cards", async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1000 * 60 * 60); // Due
      const futureDate = new Date(now.getTime() + 1000 * 60 * 60 * 24); // Not due

      mockGetServerSession.mockResolvedValue({
        user: { email: "test@example.com" },
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        repertoires: [
          {
            id: "rep-1",
            color: "White",
            entries: [
              {
                id: "entry-1",
                repetitions: 1,
                nextReviewDate: pastDate, // Due
                position: {
                  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
                },
              },
              {
                id: "entry-2",
                repetitions: 1,
                nextReviewDate: futureDate, // Not due
                position: {
                  fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
                },
              },
            ],
          },
        ],
      } as any);

      const response = await GET();
      const data = await response.json();

      expect(data.dueCount).toBe(1);
      expect(data.totalPositions).toBe(2);
    });

    it("should correctly count learned positions (repetitions > 0)", async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 1000 * 60 * 60 * 24);

      mockGetServerSession.mockResolvedValue({
        user: { email: "test@example.com" },
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        repertoires: [
          {
            id: "rep-1",
            color: "White",
            entries: [
              {
                id: "entry-1",
                repetitions: 3, // Learned
                nextReviewDate: futureDate,
                position: {
                  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
                },
              },
              {
                id: "entry-2",
                repetitions: 0, // Not learned yet
                nextReviewDate: futureDate,
                position: {
                  fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
                },
              },
            ],
          },
          {
            id: "rep-2",
            color: "Black",
            entries: [
              {
                id: "entry-3",
                repetitions: 1, // Learned
                nextReviewDate: futureDate,
                position: {
                  fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
                },
              },
            ],
          },
        ],
      } as any);

      const response = await GET();
      const data = await response.json();

      expect(data.colorStats.white).toEqual({ learned: 1, total: 2 });
      expect(data.colorStats.black).toEqual({ learned: 1, total: 1 });
    });

    it("should handle mixed repertoires correctly", async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1000);

      mockGetServerSession.mockResolvedValue({
        user: { email: "test@example.com" },
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        repertoires: [
          {
            id: "rep-white",
            color: "White",
            entries: [
              {
                id: "w1",
                repetitions: 5,
                nextReviewDate: pastDate,
                position: {
                  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
                },
              },
              {
                id: "w2",
                repetitions: 2,
                nextReviewDate: pastDate,
                position: {
                  fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
                },
              },
              {
                id: "w3",
                repetitions: 0,
                nextReviewDate: pastDate,
                position: {
                  fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
                },
              },
            ],
          },
          {
            id: "rep-black",
            color: "Black",
            entries: [
              {
                id: "b1",
                repetitions: 1,
                nextReviewDate: pastDate,
                position: {
                  fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
                },
              },
            ],
          },
        ],
      } as any);

      const response = await GET();
      const data = await response.json();

      expect(data.totalPositions).toBe(4);
      expect(data.dueCount).toBe(4);
      expect(data.colorStats.white).toEqual({ learned: 2, total: 3 });
      expect(data.colorStats.black).toEqual({ learned: 1, total: 1 });
    });
  });
});
