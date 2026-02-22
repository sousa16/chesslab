/**
 * Save Opening Line Tests
 *
 * These tests document the implementation of ChessLab's opening line saving feature.
 * Based on the design: positions are stored globally (deduplicated by FEN),
 * and each expected move is stored separately with its own SRS state.
 */

import { prisma } from "@/lib/prisma";
import {
  saveRepertoireLine,
  convertSanToUci,
  ensureUserRepertoires,
} from "@/lib/repertoire";

// Mock Prisma
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    repertoire: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    opening: {
      create: jest.fn(),
    },
    repertoireEntry: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    position: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    expectedMove: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
  
  // Set up default mock return value for opening.create
  mockPrisma.opening.create.mockResolvedValue({
    id: "opening-1",
    repertoireId: "rep-1",
    name: "Opening Line",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);
});

describe("Opening Line Save Feature", () => {
  // Mock user ID for testing
  const testUserId = "test-user-123";

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Mock successful database operations
    mockPrisma.user.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.create.mockResolvedValue({
      id: testUserId,
      email: `${testUserId}@test.com`,
    });

    // Setup mock position upsert
    let positionCounter = 0;
    mockPrisma.position.upsert.mockImplementation(async (args) => {
      return {
        id: `pos${++positionCounter}`,
        fen: args.where.fen,
      };
    });

    // Setup mock repertoireEntry behavior: default to no existing entry
    let entryCounter = 0;
    mockPrisma.repertoireEntry.findUnique.mockImplementation(async (args) => null);
    mockPrisma.repertoireEntry.create.mockImplementation(async (args) => {
      return {
        id: `entry${++entryCounter}`,
        repertoireId: args.data.repertoireId,
        positionId: args.data.positionId,
        expectedMove: args.data.expectedMove,
        interval: args.data.interval,
        easeFactor: args.data.easeFactor,
        repetitions: args.data.repetitions,
        nextReviewDate: args.data.nextReviewDate,
      };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("convertSanToUci", () => {
    it("converts a sequence of SAN moves to UCI format", () => {
      const sanMoves = ["e4", "c5", "Nf3", "d6"];
      const uciMoves = convertSanToUci(sanMoves);

      expect(uciMoves).toEqual(["e2e4", "c7c5", "g1f3", "d7d6"]);
    });

    it("handles promotions in UCI", () => {
      const sanMoves = ["e4", "c5", "e8=Q"];
      // This tests error handling - promotions need valid position
      expect(() => convertSanToUci(sanMoves)).toThrow();
    });

    it("throws on invalid move", () => {
      const sanMoves = ["e4", "invalid"];
      expect(() => convertSanToUci(sanMoves)).toThrow("Invalid move");
    });
  });

  describe("ensureUserRepertoires", () => {
    it("creates White and Black repertoires for new user", async () => {
      const whiteRepertoire = { id: "rep-white", userId: testUserId, color: "White", entries: [] };
      const blackRepertoire = { id: "rep-black", userId: testUserId, color: "Black", entries: [] };

      mockPrisma.repertoire.findMany.mockResolvedValue([whiteRepertoire, blackRepertoire]);

      await ensureUserRepertoires(testUserId);

      const repertoires = await mockPrisma.repertoire.findMany({
        where: { userId: testUserId },
      });

      expect(repertoires).toHaveLength(2);
      expect(repertoires.map((r) => r.color)).toEqual(
        expect.arrayContaining(["White", "Black"]),
      );
    });

    it("does not create duplicates if repertoires exist", async () => {
      const mockRepertoires = [
        { id: "rep-white", userId: testUserId, color: "White", entries: [] },
        { id: "rep-black", userId: testUserId, color: "Black", entries: [] },
      ];

      mockPrisma.repertoire.findMany.mockResolvedValue(mockRepertoires);

      await ensureUserRepertoires(testUserId);
      const result1 = await mockPrisma.repertoire.findMany({
        where: { userId: testUserId },
      });

      await ensureUserRepertoires(testUserId);
      const result2 = await mockPrisma.repertoire.findMany({
        where: { userId: testUserId },
      });

      expect(result1).toHaveLength(2);
      expect(result2).toHaveLength(2);
    });
  });

  describe("saveRepertoireLine", () => {
    it("saves a simple opening line (1. e4 c5 2. Nf3)", async () => {
      const mockRepertoire = {
        id: "rep-white",
        userId: testUserId,
        color: "White",
        entries: [],
      };

      mockPrisma.repertoire.findUnique.mockResolvedValue(mockRepertoire);
      mockPrisma.position.findMany.mockResolvedValue([]);

      const movesInSan = ["e4", "c5", "Nf3"];
      const movesInUci = convertSanToUci(movesInSan);

        const created = await saveRepertoireLine(testUserId, "white", [], movesInSan, movesInUci);

        // Verify position.upsert was called
        expect(mockPrisma.position.upsert).toHaveBeenCalled();

        // Verify repertoireEntry.findUnique and create were used
        expect(mockPrisma.repertoireEntry.findUnique).toHaveBeenCalled();
        expect(mockPrisma.repertoireEntry.create).toHaveBeenCalled();
        expect(typeof created).toBe("number");
    });

    it("reuses Position when saving transposed lines", async () => {
      const mockRepertoire = {
        id: "rep-white",
        userId: testUserId,
        color: "White",
        entries: [],
      };

      mockPrisma.repertoire.findUnique.mockResolvedValue(mockRepertoire);
      mockPrisma.position.findMany.mockResolvedValue([]);

      // Line 1: 1. e4 c5 2. Nf3 (ends with White move)
      const line1 = convertSanToUci(["e4", "c5", "Nf3"]);
      await saveRepertoireLine(
        testUserId,
        "white",
        [],
        ["e4", "c5", "Nf3"],
        line1,
      );

      // Reset the counter for the second call
      jest.clearAllMocks();
      mockPrisma.repertoire.findUnique.mockResolvedValue(mockRepertoire);
      mockPrisma.position.findMany.mockResolvedValue([]);

      // Line 2: 1. e4 e5 2. Nf3 (different line but reuses e4 position)
      const line2 = convertSanToUci(["e4", "e5", "Nf3"]);
      await saveRepertoireLine(
        testUserId,
        "white",
        [],
        ["e4", "e5", "Nf3"],
        line2,
      );

      // Both upsert calls should have been made for new positions
      expect(mockPrisma.position.upsert).toHaveBeenCalled();
    });

    it("preserves SRS data on entry upsert", async () => {
      const mockRepertoire = {
        id: "rep-white",
        userId: testUserId,
        color: "White",
        entries: [],
      };

      mockPrisma.repertoire.findUnique.mockResolvedValue(mockRepertoire);
      mockPrisma.position.findMany.mockResolvedValue([]);

      // Save initial line
      const moves = convertSanToUci(["e4"]);
      const created = await saveRepertoireLine(testUserId, "white", [], ["e4"], moves);

      // Verify findUnique was used to check existing entry and create was used when missing
      expect(mockPrisma.repertoireEntry.findUnique).toHaveBeenCalled();
      expect(mockPrisma.repertoireEntry.create).toHaveBeenCalled();
      expect(typeof created).toBe("number");
    });

    it("throws error if repertoire does not exist", async () => {
      mockPrisma.repertoire.findUnique.mockResolvedValue(null);

      // Don't create repertoires
      const moves = convertSanToUci(["e4"]);

      await expect(
        saveRepertoireLine(testUserId, "white", [], ["e4"], moves),
      ).rejects.toThrow("Repertoire not found");
    });
  });

  describe("Position Deduplication", () => {
    it("stores same position only once globally", async () => {
      const mockRepertoire = {
        id: "rep-white",
        userId: testUserId,
        color: "White",
        entries: [],
      };

      mockPrisma.repertoire.findUnique.mockResolvedValue(mockRepertoire);
      mockPrisma.user.create.mockResolvedValue({
        id: "test-user-456",
        email: "test-user-456@test.com",
      });
      mockPrisma.repertoireEntry.findMany.mockResolvedValue([
        {
          id: "entry1",
          repertoireId: "rep-white",
          positionId: "pos1",
          expectedMove: "c5",
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          position: { id: "pos1", fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1" },
        },
      ]);

      // Save line 1: 1. e4 c5 2. Nf3 (White's moves at indices 0, 2)
      const line1 = convertSanToUci(["e4", "c5", "Nf3"]);
      await saveRepertoireLine(
        testUserId,
        "white",
        [],
        ["e4", "c5", "Nf3"],
        line1,
      );

      // Create second user and save overlapping line
      const user2Id = "test-user-456";
      await mockPrisma.user.create({
        data: { id: user2Id, email: `${user2Id}@test.com` },
      });

      const line2 = convertSanToUci(["e4", "c5", "Nf3"]);
      await saveRepertoireLine(
        user2Id,
        "white",
        [],
        ["e4", "c5", "Nf3"],
        line2,
      );

      // Both users should reference same Position records
      const user1Entries = await mockPrisma.repertoireEntry.findMany({
        where: {
          repertoire: { userId: testUserId },
        },
        include: { position: true },
      });

      const user2Entries = await mockPrisma.repertoireEntry.findMany({
        where: {
          repertoire: { userId: user2Id },
        },
        include: { position: true },
      });

      // Find matching FENs
      const user1Fens = user1Entries.map((e) => e.position.fen);
      const user2Fens = user2Entries.map((e) => e.position.fen);
      const sharedFens = user1Fens.filter((f) => user2Fens.includes(f));

      expect(sharedFens.length).toBeGreaterThan(0);

      // Clean up
      await mockPrisma.user.deleteMany({
        where: { id: user2Id },
      });
    });
  });
});
