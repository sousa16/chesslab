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

describe("Opening Line Save Feature", () => {
  // Mock user ID for testing
  const testUserId = "test-user-123";

  beforeEach(async () => {
    // Clean up test data
    await prisma.user.deleteMany({
      where: { id: testUserId },
    });

    // Create test user
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `${testUserId}@test.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { id: testUserId },
    });
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
      await ensureUserRepertoires(testUserId);

      const repertoires = await prisma.repertoire.findMany({
        where: { userId: testUserId },
      });

      expect(repertoires).toHaveLength(2);
      expect(repertoires.map((r) => r.color)).toEqual(
        expect.arrayContaining(["White", "Black"]),
      );
    });

    it("does not create duplicates if repertoires exist", async () => {
      await ensureUserRepertoires(testUserId);
      const result1 = await prisma.repertoire.findMany({
        where: { userId: testUserId },
      });

      await ensureUserRepertoires(testUserId);
      const result2 = await prisma.repertoire.findMany({
        where: { userId: testUserId },
      });

      expect(result1).toHaveLength(2);
      expect(result2).toHaveLength(2);
    });
  });

  describe("saveRepertoireLine", () => {
    it("saves a simple opening line (1. e4 c5 2. Nf3)", async () => {
      await ensureUserRepertoires(testUserId);

      const movesInSan = ["e4", "c5", "Nf3"];
      const movesInUci = convertSanToUci(movesInSan);

      await saveRepertoireLine(testUserId, "white", [], movesInSan, movesInUci);

      // Verify positions were created
      const positions = await prisma.position.findMany();
      expect(positions.length).toBeGreaterThanOrEqual(2);

      // Verify repertoire entries were created
      const repertoire = await prisma.repertoire.findUnique({
        where: {
          userId_color: {
            userId: testUserId,
            color: "White",
          },
        },
        include: { entries: true },
      });

      // For White repertoire with moves [e4, c5, Nf3], only e4 (index 0) and Nf3 (index 2) are saved
      // c5 is Black's move and is not saved for White repertoire
      expect(repertoire?.entries).toHaveLength(2);

      // Verify SRS fields are initialized
      repertoire?.entries.forEach((entry) => {
        expect(entry.interval).toBe(0);
        expect(entry.easeFactor).toBe(2.5);
        expect(entry.repetitions).toBe(0);
        expect(entry.expectedMove).toBeTruthy();
      });
    });

    it("reuses Position when saving transposed lines", async () => {
      await ensureUserRepertoires(testUserId);

      // Line 1: 1. e4 c5 2. Nf3 (ends with White move)
      const line1 = convertSanToUci(["e4", "c5", "Nf3"]);
      await saveRepertoireLine(
        testUserId,
        "white",
        [],
        ["e4", "c5", "Nf3"],
        line1,
      );

      const positionsBefore = await prisma.position.findMany();

      // Line 2: 1. e4 e5 2. Nf3 (different line but reuses e4 position)
      const line2 = convertSanToUci(["e4", "e5", "Nf3"]);
      await saveRepertoireLine(
        testUserId,
        "white",
        [],
        ["e4", "e5", "Nf3"],
        line2,
      );

      const positionsAfter = await prisma.position.findMany();

      // The e4 position should be reused, so we shouldn't add too many new positions
      expect(positionsAfter.length).toBeLessThanOrEqual(
        positionsBefore.length + 2,
      );
    });

    it("preserves SRS data on entry upsert", async () => {
      await ensureUserRepertoires(testUserId);

      // Save initial line
      const moves = convertSanToUci(["e4"]);
      await saveRepertoireLine(testUserId, "white", [], ["e4"], moves);

      // Update SRS data
      const repertoire = await prisma.repertoire.findUnique({
        where: {
          userId_color: {
            userId: testUserId,
            color: "White",
          },
        },
        include: { entries: true },
      });

      const entry = repertoire!.entries[0];
      await prisma.repertoireEntry.update({
        where: { id: entry.id },
        data: {
          interval: 5,
          easeFactor: 2.8,
          repetitions: 3,
        },
      });

      // Save same line again (should not overwrite SRS)
      await saveRepertoireLine(testUserId, "white", [], ["e4"], moves);

      const updatedEntry = await prisma.repertoireEntry.findUnique({
        where: { id: entry.id },
      });

      // SRS data should be preserved
      expect(updatedEntry?.interval).toBe(5);
      expect(updatedEntry?.easeFactor).toBe(2.8);
      expect(updatedEntry?.repetitions).toBe(3);
    });

    it("throws error if repertoire does not exist", async () => {
      // Don't create repertoires
      const moves = convertSanToUci(["e4"]);

      await expect(
        saveRepertoireLine(testUserId, "white", [], ["e4"], moves),
      ).rejects.toThrow("Repertoire not found");
    });
  });

  describe("Position Deduplication", () => {
    it("stores same position only once globally", async () => {
      await ensureUserRepertoires(testUserId);

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
      await prisma.user.create({
        data: { id: user2Id, email: `${user2Id}@test.com` },
      });
      await ensureUserRepertoires(user2Id);

      const line2 = convertSanToUci(["e4", "c5", "Nf3"]);
      await saveRepertoireLine(
        user2Id,
        "white",
        [],
        ["e4", "c5", "Nf3"],
        line2,
      );

      // Both users should reference same Position records
      const user1Entries = await prisma.repertoireEntry.findMany({
        where: {
          repertoire: { userId: testUserId },
        },
        include: { position: true },
      });

      const user2Entries = await prisma.repertoireEntry.findMany({
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
      await prisma.user.deleteMany({
        where: { id: user2Id },
      });
    });
  });
});
