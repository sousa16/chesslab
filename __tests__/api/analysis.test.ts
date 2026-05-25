import { GET } from "@/app/api/analysis/route";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));

const mockSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function req(fen?: string, depth?: string) {
  const params = new URLSearchParams();
  if (fen !== undefined) params.set("fen", fen);
  if (depth !== undefined) params.set("depth", depth);
  const qs = params.toString();
  return new NextRequest(
    `http://localhost/api/analysis${qs ? `?${qs}` : ""}`,
  );
}

describe("GET /api/analysis", () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "u1" } } as any);
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns 401 when not signed in", async () => {
    mockSession.mockResolvedValue(null);
    const res = await GET(req(STARTING_FEN));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 400 when fen is missing", async () => {
    const res = await GET(req());
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses stockfish.online response and normalizes bestmove UCI", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        evaluation: 0.4,
        mate: null,
        bestmove: "bestmove e2e4 ponder c7c5",
        continuation: "e2e4 c7c5 g1f3 b8c6",
      }),
    } as Response);

    const res = await GET(req(STARTING_FEN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      eval: 0.4,
      mate: null,
      bestMove: "e2e4",
      continuation: "e2e4 c7c5 g1f3 b8c6",
    });
  });

  it("passes mate-in-N through and sets eval to null", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        evaluation: null,
        mate: 3,
        bestmove: "bestmove d1h5 ponder g7g6",
        continuation: "d1h5 g7g6 h5e5",
      }),
    } as Response);

    const res = await GET(req(STARTING_FEN));
    const body = await res.json();
    expect(body.mate).toBe(3);
    expect(body.eval).toBeNull();
    expect(body.bestMove).toBe("d1h5");
  });

  it("returns null bestMove when the upstream line is malformed", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        evaluation: 0.1,
        mate: null,
        bestmove: "garbage no move here",
        continuation: null,
      }),
    } as Response);

    const res = await GET(req(STARTING_FEN));
    const body = await res.json();
    expect(body.bestMove).toBeNull();
    expect(body.continuation).toBeNull();
  });

  it("returns 502 when upstream is non-2xx", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response);

    const res = await GET(req(STARTING_FEN));
    expect(res.status).toBe(502);
  });

  it("returns 502 when upstream sets success=false", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    } as Response);

    const res = await GET(req(STARTING_FEN));
    expect(res.status).toBe(502);
  });

  it("returns 504 when fetch is aborted (timeout)", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    fetchSpy.mockRejectedValue(abort);
    const res = await GET(req(STARTING_FEN));
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "Engine timeout" });
  });

  it("returns 504 on generic fetch failure", async () => {
    fetchSpy.mockRejectedValue(new Error("network"));
    const res = await GET(req(STARTING_FEN));
    expect(res.status).toBe(504);
  });

  it("clamps depth into [1, 15] and forwards it to the upstream URL", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        evaluation: 0,
        mate: null,
        bestmove: "bestmove e2e4 ponder e7e5",
        continuation: "e2e4",
      }),
    } as Response);

    await GET(req(STARTING_FEN, "99"));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("stockfish.online");
    expect(calledUrl).toContain("depth=15");
    expect(calledUrl).toContain(encodeURIComponent(STARTING_FEN));

    fetchSpy.mockClear();
    await GET(req(STARTING_FEN, "0"));
    const calledUrl2 = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl2).toContain("depth=1");
  });
});
