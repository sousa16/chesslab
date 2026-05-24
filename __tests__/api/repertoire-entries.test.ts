import { DELETE } from "@/app/api/repertoire-entries/[id]/route";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/repertoireLeaves", () => ({
  recomputeRepertoireLeaves: jest.fn(),
}));

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return {
    ...actual,
    after: jest.fn(),
  };
});

jest.mock("@/lib/prisma", () => ({
  prisma: {
    repertoireEntry: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    position: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock("chess.js", () => ({
  Chess: jest.fn().mockImplementation((fen) => {
    let currentFen = fen;
    const stack: string[] = [fen];

    const applyMove = (moveArg: string | { san?: string }) => {
      const move =
        typeof moveArg === "string" ? moveArg : moveArg?.san || "";

      if (
        currentFen ===
          "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" &&
        (move === "e2e4" || move === "e4")
      ) {
        currentFen =
          "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
        return { san: "e4", from: "e2", to: "e4" };
      }
      if (
        currentFen ===
          "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" &&
        (move === "c5" || move === "c7c5")
      ) {
        currentFen =
          "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
        return { san: "c5", from: "c7", to: "c5" };
      }
      if (
        currentFen ===
          "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2" &&
        (move === "g1f3" || move === "Nf3")
      ) {
        currentFen =
          "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";
        return { san: "Nf3", from: "g1", to: "f3" };
      }
      if (
        currentFen ===
          "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2" &&
        (move === "d6" || move === "d7d6")
      ) {
        currentFen =
          "rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3";
        return { san: "d6", from: "d7", to: "d6" };
      }
      if (
        currentFen ===
          "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2" &&
        move === "c5"
      ) {
        currentFen =
          "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
        return { san: "c5", from: "c7", to: "c5", promotion: undefined };
      }
      if (
        currentFen ===
          "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2" &&
        move === "d6"
      ) {
        currentFen =
          "rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3";
        return { san: "d6", from: "d7", to: "d6", promotion: undefined };
      }
      return null;
    };

    return {
      move: jest.fn((moveArg: string | { san?: string }) => {
        stack.push(currentFen);
        return applyMove(moveArg);
      }),
      undo: jest.fn(() => {
        if (stack.length > 1) {
          stack.pop();
          currentFen = stack[stack.length - 1];
        }
      }),
      fen: jest.fn(() => currentFen),
      moves: jest.fn((opts?: { verbose?: boolean }) => {
        const verbose = opts?.verbose ?? false;
        if (
          currentFen ===
          "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        ) {
          const m = { san: "c5", from: "c7", to: "c5", promotion: undefined };
          return verbose ? [m] : ["c5"];
        }
        if (
          currentFen ===
          "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"
        ) {
          const m = { san: "d6", from: "d7", to: "d6", promotion: undefined };
          return verbose ? [m] : ["d6"];
        }
        if (
          currentFen ===
          "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"
        ) {
          const m = { san: "c5", from: "c7", to: "c5", promotion: undefined };
          return verbose ? [m] : ["c5"];
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

const USER_ID = "user-1";

describe("DELETE /api/repertoire-entries/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Authentication", () => {
    it("returns 401 if not authenticated", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const response = await DELETE(
        new Request("http://localhost/api/repertoire-entries/123", {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: "123" }) },
      );
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe("Unauthorized");
    });

    it("returns 401 if session has no user id", async () => {
      mockGetServerSession.mockResolvedValue({ user: { email: "a@b.com" } });

      const response = await DELETE(
        new Request("http://localhost/api/repertoire-entries/123", {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: "123" }) },
      );

      expect(response.status).toBe(401);
    });
  });

  describe("Entry validation", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { id: USER_ID, email: "test@example.com" },
      });
    });

    it("returns 404 if entry not found", async () => {
      mockPrisma.repertoireEntry.findUnique.mockResolvedValue(null);

      const response = await DELETE(
        new Request("http://localhost/api/repertoire-entries/123", {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: "123" }) },
      );
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error).toBe("Entry not found");
    });

    it("returns 403 if entry belongs to another user", async () => {
      mockPrisma.repertoireEntry.findUnique.mockResolvedValue({
        id: "entry-1",
        repertoire: { id: "rep-2", userId: "other-user", color: "White" },
        position: { id: "pos-1", fen: "some-fen" },
      } as any);

      const response = await DELETE(
        new Request("http://localhost/api/repertoire-entries/123", {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: "123" }) },
      );
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe("Unauthorized");
    });
  });

  describe("Successful deletion", () => {
    const startingFen =
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    const mockEntry = {
      id: "entry-1",
      repertoireId: "rep-1",
      positionId: "pos-1",
      expectedMove: "e2e4",
      repertoire: { id: "rep-1", userId: USER_ID, color: "White" },
      position: { id: "pos-1", fen: startingFen },
    };

    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { id: USER_ID, email: "test@example.com" },
      });
      mockPrisma.repertoireEntry.findUnique.mockResolvedValue(mockEntry as any);
      mockPrisma.repertoireEntry.findMany.mockResolvedValue([mockEntry] as any);
      mockPrisma.repertoireEntry.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.position.findMany.mockResolvedValue([]);
      mockPrisma.position.deleteMany.mockResolvedValue({ count: 0 });
    });

    it("deletes the entry and returns success", async () => {
      const response = await DELETE(
        new Request("http://localhost/api/repertoire-entries/entry-1", {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: "entry-1" }) },
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.deletedCount).toBe(1);
      expect(mockPrisma.repertoireEntry.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["entry-1"] } },
      });
    });

    it("deletes entry and descendant entries (cascade delete)", async () => {
      const afterE4C5Fen =
        "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
      const afterNf3D6Fen =
        "rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3";

      const allEntries = [
        {
          id: "entry-1",
          expectedMove: "e2e4",
          position: { fen: startingFen },
        },
        {
          id: "entry-2",
          expectedMove: "g1f3",
          position: { fen: afterE4C5Fen },
        },
        {
          id: "entry-3",
          expectedMove: "d2d4",
          position: { fen: afterNf3D6Fen },
        },
      ];

      mockPrisma.repertoireEntry.findMany.mockResolvedValue(allEntries as any);
      mockPrisma.repertoireEntry.deleteMany.mockResolvedValue({ count: 3 });

      const response = await DELETE(
        new Request("http://localhost/api/repertoire-entries/entry-1", {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: "entry-1" }) },
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.deletedCount).toBe(3);
      expect(mockPrisma.repertoireEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: expect.arrayContaining(["entry-1", "entry-2", "entry-3"]) },
        },
      });
    });

    it("cleans up orphaned positions after deletion", async () => {
      mockPrisma.position.findMany.mockResolvedValue([
        { id: "orphan-pos" },
      ] as any);

      await DELETE(
        new Request("http://localhost/api/repertoire-entries/entry-1", {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: "entry-1" }) },
      );

      expect(mockPrisma.position.findMany).toHaveBeenCalledWith({
        where: { repertoireEntries: { none: {} } },
      });
      expect(mockPrisma.position.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["orphan-pos"] } },
      });
    });
  });

  describe("Error handling", () => {
    it("returns 500 on database error", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: USER_ID, email: "test@example.com" },
      });
      mockPrisma.repertoireEntry.findUnique.mockRejectedValue(
        new Error("Database error"),
      );

      const response = await DELETE(
        new Request("http://localhost/api/repertoire-entries/123", {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: "123" }) },
      );
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe("Failed to delete entry");
    });
  });
});
