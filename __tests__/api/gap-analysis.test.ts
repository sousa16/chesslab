import { POST } from "@/app/api/gap-analysis/route";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { runGapAnalysis } from "@/lib/gapAnalysis";

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({ authOptions: {} }));

jest.mock("@/lib/gapAnalysis", () => ({
  runGapAnalysis: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    repertoire: {
      findMany: jest.fn(),
    },
  },
}));

const mockSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockRunGapAnalysis = runGapAnalysis as jest.MockedFunction<
  typeof runGapAnalysis
>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function req(body: unknown, opts: { rawBody?: string } = {}) {
  return new NextRequest("http://localhost/api/gap-analysis", {
    method: "POST",
    body: opts.rawBody ?? JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/gap-analysis", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "u1" } } as any);
    (mockPrisma.repertoire.findMany as jest.Mock).mockResolvedValue([]);
    mockRunGapAnalysis.mockResolvedValue({
      gamesFetched: 0,
      gamesAnalyzed: 0,
      whiteGaps: [],
      blackGaps: [],
      errors: [],
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValue(null);
    const res = await POST(req({ chesscomUsername: "alice" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid JSON", async () => {
    const res = await POST(req({}, { rawBody: "{not json" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when neither username is provided", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Provide a chess.com or Lichess username",
    });
  });

  it("clamps maxGames to [1, 500]", async () => {
    await POST(req({ chesscomUsername: "alice", maxGames: 9999 }));
    expect(mockRunGapAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ maxGames: 500 }),
      expect.any(Array),
    );

    mockRunGapAnalysis.mockClear();
    await POST(req({ chesscomUsername: "alice", maxGames: 0 }));
    expect(mockRunGapAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ maxGames: 1 }),
      expect.any(Array),
    );
  });

  it("defaults maxGames to 200 and color to 'both' when unspecified", async () => {
    await POST(req({ chesscomUsername: "alice" }));
    expect(mockRunGapAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ maxGames: 200, color: "both" }),
      expect.any(Array),
    );
  });

  it("filters timeClasses to the known allowlist", async () => {
    await POST(
      req({
        chesscomUsername: "alice",
        timeClasses: ["blitz", "ultraBullet", 7, "rapid"],
      }),
    );
    expect(mockRunGapAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ timeClasses: ["blitz", "rapid"] }),
      expect.any(Array),
    );
  });

  it("normalizes the user's repertoire entries into the lib-expected shape", async () => {
    (mockPrisma.repertoire.findMany as jest.Mock).mockResolvedValue([
      {
        color: "White",
        entries: [
          { position: { fen: "fen-1" } },
          { position: { fen: "fen-2" } },
        ],
      },
      {
        color: "Black",
        entries: [{ position: { fen: "fen-3" } }],
      },
    ]);

    await POST(req({ chesscomUsername: "alice" }));
    expect(mockRunGapAnalysis).toHaveBeenCalledWith(expect.any(Object), [
      { color: "white", fens: ["fen-1", "fen-2"] },
      { color: "black", fens: ["fen-3"] },
    ]);
  });

  it("returns 500 with the lib's error message when runGapAnalysis throws", async () => {
    mockRunGapAnalysis.mockRejectedValue(new Error("upstream down"));
    const res = await POST(req({ chesscomUsername: "alice" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "upstream down" });
  });
});
