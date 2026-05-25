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

// Drain an NDJSON response body into an array of parsed events.
async function readStream(res: Response): Promise<Record<string, unknown>[]> {
  if (!res.body) return [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: Record<string, unknown>[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf("\n");
    while (nl !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf("\n");
      if (line) events.push(JSON.parse(line));
    }
  }
  if (buffer.trim()) events.push(JSON.parse(buffer));
  return events;
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
      expect.any(Object),
    );

    mockRunGapAnalysis.mockClear();
    await POST(req({ chesscomUsername: "alice", maxGames: 0 }));
    expect(mockRunGapAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ maxGames: 1 }),
      expect.any(Array),
      expect.any(Object),
    );
  });

  it("defaults maxGames to 200 and color to 'both' when unspecified", async () => {
    await POST(req({ chesscomUsername: "alice" }));
    expect(mockRunGapAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ maxGames: 200, color: "both" }),
      expect.any(Array),
      expect.any(Object),
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
      expect.any(Object),
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
    expect(mockRunGapAnalysis).toHaveBeenCalledWith(
      expect.any(Object),
      [
        { color: "white", fens: ["fen-1", "fen-2"] },
        { color: "black", fens: ["fen-3"] },
      ],
      expect.any(Object),
    );
  });

  it("streams a {type:'result',...} final event with the lib payload", async () => {
    const res = await POST(req({ chesscomUsername: "alice" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const events = await readStream(res);
    const final = events.find((e) => e.type === "result");
    expect(final).toMatchObject({
      type: "result",
      gamesFetched: 0,
      gamesAnalyzed: 0,
      whiteGaps: [],
      blackGaps: [],
    });
  });

  it("forwards each onProgress event from the lib as a stream line", async () => {
    // Replay a sequence of progress events through the onProgress callback
    // the route passes into runGapAnalysis.
    mockRunGapAnalysis.mockImplementation(async (_filters, _reps, opts) => {
      opts?.onProgress?.({ type: "fetching", platform: "chesscom" });
      opts?.onProgress?.({ type: "fetched", platform: "chesscom", games: 12 });
      opts?.onProgress?.({ type: "analyzing", total: 12 });
      opts?.onProgress?.({
        type: "analysis-progress",
        processed: 12,
        total: 12,
      });
      return {
        gamesFetched: 12,
        gamesAnalyzed: 12,
        whiteGaps: [],
        blackGaps: [],
        errors: [],
      };
    });

    const res = await POST(req({ chesscomUsername: "alice" }));
    const events = await readStream(res);
    const types = events.map((e) => e.type);
    expect(types).toEqual([
      "fetching",
      "fetched",
      "analyzing",
      "analysis-progress",
      "result",
    ]);
  });

  it("emits {type:'error', error} when the lib throws unexpectedly", async () => {
    mockRunGapAnalysis.mockRejectedValue(new Error("upstream down"));
    const res = await POST(req({ chesscomUsername: "alice" }));
    expect(res.status).toBe(200); // stream successfully opened
    const events = await readStream(res);
    expect(events).toContainEqual({ type: "error", error: "upstream down" });
  });

  it("emits {type:'aborted'} when the lib throws AbortError", async () => {
    mockRunGapAnalysis.mockRejectedValue(
      new DOMException("Gap analysis aborted", "AbortError"),
    );
    const res = await POST(req({ chesscomUsername: "alice" }));
    const events = await readStream(res);
    expect(events).toContainEqual({ type: "aborted" });
  });
});
