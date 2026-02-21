import { DELETE } from "@/app/api/repertoire-entries/[id]/route";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";

// Mock next-auth
jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

// Mock prisma
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    repertoireEntry: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    position: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

// Mock chess.js - simulate the tree building logic
jest.mock("chess.js", () => ({
  Chess: jest.fn().mockImplementation((fen) => {
    // Track internal FEN state
    let currentFen = fen;

    return {
      move: jest.fn((moveArg) => {
        const move =
          typeof moveArg === "string" ? moveArg : moveArg?.san || moveArg;

        // Starting position -> after e4
        if (
          currentFen ===
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" &&
          (move === "e2e4" || move === "e4")
        ) {
          currentFen =
            "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
          return { san: "e4", from: "e2", to: "e4" };
        }

        // After e4 -> after e4 c5 (opponent's response)
        if (
          currentFen ===
            "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" &&
          (move === "c5" || move === "c7c5")
        ) {
          currentFen =
            "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
          return { san: "c5", from: "c7", to: "c5" };
        }

        // After e4 c5 -> after e4 c5 Nf3 (user's second move)
        if (
          currentFen ===
            "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2" &&
          (move === "g1f3" || move === "Nf3")
        ) {
          currentFen =
            "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";
          return { san: "Nf3", from: "g1", to: "f3" };
        }

        // After e4 c5 Nf3 -> after e4 c5 Nf3 d6 (opponent's response)
        if (
          currentFen ===
            "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2" &&
          (move === "d6" || move === "d7d6")
        ) {
          currentFen =
            "rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3";
          return { san: "d6", from: "d7", to: "d6" };
        }

        return null;
      }),
      fen: jest.fn(() => currentFen),
      moves: jest.fn(() => {
        // Return possible opponent moves based on current position
        if (
          currentFen ===
          "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        ) {
          // After e4, opponent can play c5
          return [{ san: "c5", from: "c7", to: "c5" }];
        }
        if (
          currentFen ===
          "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"
        ) {
          // After Nf3, opponent can play d6
          return [{ san: "d6", from: "d7", to: "d6" }];
        }
        return [];
      }),
    };
  }),
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe("DELETE /api/repertoire-entries/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Authentication", () => {
    it("returns 401 if not authenticated", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const request = new Request(
        "http://localhost/api/repertoire-entries/123",
        {
          method: "DELETE",
        },
      );
      const params = Promise.resolve({ id: "123" });

      const response = await DELETE(request, { params });
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe("Unauthorized");
    });

    it("returns 401 if session has no email", async () => {
      mockGetServerSession.mockResolvedValue({ user: {} });

      const request = new Request(
        "http://localhost/api/repertoire-entries/123",
        {
          method: "DELETE",
        },
      );
      const params = Promise.resolve({ id: "123" });

      const response = await DELETE(request, { params });
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe("Unauthorized");
    });
  });

  describe("User validation", () => {
    it("returns 404 if user not found", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "test@example.com" },
      });
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const request = new Request(
        "http://localhost/api/repertoire-entries/123",
        {
          method: "DELETE",
        },
      );
      const params = Promise.resolve({ id: "123" });

      const response = await DELETE(request, { params });
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error).toBe("User not found");
    });
  });

  describe("Entry validation", () => {
    const mockUser = {
      id: "user-1",
      email: "test@example.com",
      repertoires: [{ id: "rep-1", color: "white", userId: "user-1" }],
    };

    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "test@example.com" },
      });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
    });

    it("returns 404 if entry not found", async () => {
      mockPrisma.repertoireEntry.findUnique.mockResolvedValue(null);

      const request = new Request(
        "http://localhost/api/repertoire-entries/123",
        {
          method: "DELETE",
        },
      );
      const params = Promise.resolve({ id: "123" });

      const response = await DELETE(request, { params });
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error).toBe("Entry not found");
    });

    it("returns 403 if entry belongs to another user", async () => {
      mockPrisma.repertoireEntry.findUnique.mockResolvedValue({
        id: "entry-1",
        repertoire: { id: "rep-2", userId: "other-user" },
        position: { id: "pos-1", fen: "some-fen" },
      } as any);

      const request = new Request(
        "http://localhost/api/repertoire-entries/123",
        {
          method: "DELETE",
        },
      );
      const params = Promise.resolve({ id: "123" });

      const response = await DELETE(request, { params });
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe("Unauthorized");
    });
  });

  describe("Successful deletion", () => {
    const mockUser = {
      id: "user-1",
      email: "test@example.com",
      repertoires: [{ id: "rep-1", color: "white", userId: "user-1" }],
    };

    const startingFen =
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    const mockEntry = {
      id: "entry-1",
      repertoireId: "rep-1",
      positionId: "pos-1",
      expectedMove: "e2e4",
      repertoire: { id: "rep-1", userId: "user-1" },
      position: { id: "pos-1", fen: startingFen },
    };

    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "test@example.com" },
      });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.repertoireEntry.findUnique.mockResolvedValue(mockEntry as any);
      mockPrisma.repertoireEntry.findMany.mockResolvedValue([mockEntry] as any);
      mockPrisma.repertoireEntry.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.position.findMany.mockResolvedValue([]);
      mockPrisma.position.deleteMany.mockResolvedValue({ count: 0 });
    });

    it("deletes the entry and returns success", async () => {
      const request = new Request(
        "http://localhost/api/repertoire-entries/entry-1",
        {
          method: "DELETE",
        },
      );
      const params = Promise.resolve({ id: "entry-1" });

      const response = await DELETE(request, { params });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.deletedCount).toBe(1);
      expect(mockPrisma.repertoireEntry.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["entry-1"] } },
      });
    });

    it("deletes entry and all descendant entries (cascade delete)", async () => {
      // Tree structure:
      // entry-1: Starting pos -> user plays e4
      // entry-2: After e4+c5 -> user plays Nf3 (child of entry-1)
      // entry-3: After e4+c5+Nf3+d6 -> user plays d4 (child of entry-2)
      //
      // The key insight: children are at positions AFTER user's move + opponent's response

      const startingFen =
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      const afterE4C5Fen =
        "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
      const afterNf3D6Fen =
        "rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3";

      const allEntries = [
        {
          id: "entry-1",
          repertoireId: "rep-1",
          positionId: "pos-1",
          expectedMove: "e2e4",
          position: { id: "pos-1", fen: startingFen },
        },
        {
          id: "entry-2",
          repertoireId: "rep-1",
          positionId: "pos-2",
          expectedMove: "g1f3",
          position: { id: "pos-2", fen: afterE4C5Fen }, // Position after e4 c5
        },
        {
          id: "entry-3",
          repertoireId: "rep-1",
          positionId: "pos-3",
          expectedMove: "d2d4",
          position: { id: "pos-3", fen: afterNf3D6Fen }, // Position after Nf3 d6
        },
      ];

      mockPrisma.repertoireEntry.findMany.mockResolvedValue(allEntries as any);
      mockPrisma.repertoireEntry.deleteMany.mockResolvedValue({ count: 3 });

      const request = new Request(
        "http://localhost/api/repertoire-entries/entry-1",
        {
          method: "DELETE",
        },
      );
      const params = Promise.resolve({ id: "entry-1" });

      const response = await DELETE(request, { params });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.deletedCount).toBe(3);
      // Should delete entry-1 and its descendants (entry-2, entry-3)
      expect(mockPrisma.repertoireEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: expect.arrayContaining(["entry-1", "entry-2", "entry-3"]) },
        },
      });
    });

    it("cleans up orphaned positions after deletion", async () => {
      const orphanedPosition = { id: "orphan-pos" };
      mockPrisma.position.findMany.mockResolvedValue([orphanedPosition as any]);

      const request = new Request(
        "http://localhost/api/repertoire-entries/entry-1",
        {
          method: "DELETE",
        },
      );
      const params = Promise.resolve({ id: "entry-1" });

      await DELETE(request, { params });

      expect(mockPrisma.position.findMany).toHaveBeenCalledWith({
        where: {
          repertoireEntries: {
            none: {},
          },
        },
      });
      expect(mockPrisma.position.deleteMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: ["orphan-pos"],
          },
        },
      });
    });
  });

  describe("Error handling", () => {
    it("returns 500 on database error", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "test@example.com" },
      });
      mockPrisma.user.findUnique.mockRejectedValue(new Error("Database error"));

      const request = new Request(
        "http://localhost/api/repertoire-entries/123",
        {
          method: "DELETE",
        },
      );
      const params = Promise.resolve({ id: "123" });

      const response = await DELETE(request, { params });
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe("Failed to delete entry");
    });
  });
});
