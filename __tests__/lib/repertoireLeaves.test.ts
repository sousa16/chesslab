/**
 * Tests for the leaf-bit recomputation helper.
 *
 * The function pulls the repertoire's entries from prisma, asks the real
 * tree builder which entries have children, and emits at most two
 * updateMany calls (one for leaves, one for non-leaves).
 */

import { Chess } from "chess.js";

import { recomputeRepertoireLeaves } from "@/lib/repertoireLeaves";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    repertoire: { findUnique: jest.fn() },
    repertoireEntry: { updateMany: jest.fn() },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function fenAfter(sans: string[]): string {
  const g = new Chess();
  for (const s of sans) g.move(s);
  return g.fen();
}

function uci(san: string, sansBefore: string[] = []): string {
  const g = new Chess();
  for (const s of sansBefore) g.move(s);
  const m = g.move(san);
  if (!m) throw new Error(`Bad SAN ${san}`);
  return `${m.from}${m.to}${m.promotion ?? ""}`;
}

describe("recomputeRepertoireLeaves", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.repertoireEntry.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  });

  it("no-ops when the repertoire is missing", async () => {
    (mockPrisma.repertoire.findUnique as jest.Mock).mockResolvedValue(null);
    await recomputeRepertoireLeaves("missing-rep");
    expect(mockPrisma.repertoireEntry.updateMany).not.toHaveBeenCalled();
  });

  it("marks the only entry as a leaf when no children exist", async () => {
    (mockPrisma.repertoire.findUnique as jest.Mock).mockResolvedValue({
      color: "White",
      entries: [
        {
          id: "solo",
          expectedMove: uci("e4"),
          position: { fen: STARTING_FEN },
        },
      ],
    });

    await recomputeRepertoireLeaves("rep-1");

    expect(mockPrisma.repertoireEntry.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["solo"] } },
      data: { isLeaf: true },
    });
    // No non-leaf update; that branch short-circuits.
    expect(
      (mockPrisma.repertoireEntry.updateMany as jest.Mock).mock.calls.find(
        (c) => c[0]?.data?.isLeaf === false,
      ),
    ).toBeUndefined();
  });

  it("splits entries into leaves and non-leaves for a 2-ply tree", async () => {
    (mockPrisma.repertoire.findUnique as jest.Mock).mockResolvedValue({
      color: "White",
      entries: [
        {
          id: "root",
          expectedMove: uci("e4"),
          position: { fen: STARTING_FEN },
        },
        {
          id: "child",
          expectedMove: uci("Nf3", ["e4", "e5"]),
          position: { fen: fenAfter(["e4", "e5"]) },
        },
      ],
    });

    await recomputeRepertoireLeaves("rep-2");

    const calls = (mockPrisma.repertoireEntry.updateMany as jest.Mock).mock.calls;
    const leafCall = calls.find((c) => c[0].data.isLeaf === true);
    const nonLeafCall = calls.find((c) => c[0].data.isLeaf === false);
    expect(leafCall?.[0].where.id.in).toEqual(["child"]);
    expect(nonLeafCall?.[0].where.id.in).toEqual(["root"]);
  });

  it("only emits the leaf update when every entry is a leaf", async () => {
    // Two unrelated openings — both have no children of their own.
    (mockPrisma.repertoire.findUnique as jest.Mock).mockResolvedValue({
      color: "White",
      entries: [
        {
          id: "a",
          expectedMove: uci("e4"),
          position: { fen: STARTING_FEN },
        },
        {
          id: "b",
          expectedMove: uci("d4"),
          position: { fen: STARTING_FEN },
        },
      ],
    });

    await recomputeRepertoireLeaves("rep-3");

    const calls = (mockPrisma.repertoireEntry.updateMany as jest.Mock).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].data.isLeaf).toBe(true);
    expect(calls[0][0].where.id.in.sort()).toEqual(["a", "b"]);
  });
});
