/**
 * Tests for the gap analysis driver.
 *
 * Mocks `fetch` to control the chess.com / Lichess responses, runs the
 * real chess.js replay/aggregation logic, and verifies:
 *   - rating, time-class, and color filters
 *   - first-gap detection (one gap per game, on the user's first
 *     unprepared move)
 *   - aggregation by FEN across games (transpositions collapse)
 *   - sortedness (most-frequent gap first)
 */

import { runGapAnalysis } from "@/lib/gapAnalysis";

type FetchFn = (
  url: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}>;

function mockFetch(handler: FetchFn) {
  (global as unknown as { fetch: FetchFn }).fetch = jest.fn(handler);
}

// chess.com responses come in two flavors: the archives index and a month's
// games. The helper below wraps both.
function chesscomFixture(monthGames: object[]) {
  return (url: string) => {
    if (url.endsWith("/games/archives")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            archives: ["https://api.chess.com/pub/player/u/games/2024/01"],
          }),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ games: monthGames }),
    });
  };
}

function pgn(moves: string[]): string {
  let i = 0;
  let out = "";
  for (let n = 0; n < moves.length; n += 2) {
    i += 1;
    const w = moves[n];
    const b = moves[n + 1];
    out += `${i}. ${w}${b ? ` ${b}` : ""} `;
  }
  return `[Event "?"]\n[White "?"]\n[Black "?"]\n\n${out.trim()} *`;
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe("runGapAnalysis — chess.com", () => {
  it("returns 'no games' state cleanly when archive lookup fails", async () => {
    mockFetch((url) =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({}),
      }),
    );

    const result = await runGapAnalysis(
      {
        chesscomUsername: "alice",
        color: "both",
        maxGames: 10,
      },
      [],
    );
    expect(result.gamesFetched).toBe(0);
    expect(result.gamesAnalyzed).toBe(0);
    expect(result.errors).toContainEqual(
      expect.stringContaining("chess.com archives lookup failed"),
    );
  });

  it("aggregates a single white gap and reports a sample game URL", async () => {
    // Alice plays white as e4 then leaves prep at move 2 (no entry for
    // 1.e4 e5 with white to move).
    mockFetch(
      chesscomFixture([
        {
          url: "https://chess.com/game/1",
          pgn: pgn(["e4", "e5", "Nf3"]),
          time_class: "blitz",
          white: { username: "alice", rating: 1500 },
          black: { username: "bob", rating: 1500 },
        },
      ]),
    );

    const STARTING_FEN =
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = await runGapAnalysis(
      {
        chesscomUsername: "alice",
        color: "white",
        maxGames: 5,
      },
      [{ color: "white", fens: [STARTING_FEN] }],
    );

    expect(result.gamesFetched).toBe(1);
    expect(result.gamesAnalyzed).toBe(1);
    expect(result.whiteGaps).toHaveLength(1);
    expect(result.whiteGaps[0].occurrences).toBe(1);
    expect(result.whiteGaps[0].opponentMove).toBe("e5");
    expect(result.whiteGaps[0].sampleGameUrls).toContain(
      "https://chess.com/game/1",
    );
    expect(result.blackGaps).toEqual([]);
  });

  it("collapses transpositions to the same FEN bucket and sorts by frequency", async () => {
    // Same gap position reached twice (1.e4 e5 → user has no prep at the
    // start of move 2 white). Add a different gap (1.d4 d5) once.
    mockFetch(
      chesscomFixture([
        {
          url: "https://chess.com/game/1",
          pgn: pgn(["e4", "e5", "Nf3"]),
          time_class: "blitz",
          white: { username: "alice", rating: 1500 },
          black: { username: "bob", rating: 1500 },
        },
        {
          url: "https://chess.com/game/2",
          pgn: pgn(["e4", "e5", "Bc4"]),
          time_class: "blitz",
          white: { username: "alice", rating: 1500 },
          black: { username: "carol", rating: 1500 },
        },
        {
          url: "https://chess.com/game/3",
          pgn: pgn(["d4", "d5", "Nf3"]),
          time_class: "blitz",
          white: { username: "alice", rating: 1500 },
          black: { username: "dave", rating: 1500 },
        },
      ]),
    );

    const STARTING_FEN =
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = await runGapAnalysis(
      {
        chesscomUsername: "alice",
        color: "white",
        maxGames: 10,
      },
      // User has the start position covered; the gap is one ply later.
      [{ color: "white", fens: [STARTING_FEN] }],
    );

    expect(result.whiteGaps).toHaveLength(2);
    // Sorted desc by occurrences — e5 (2) before d5 (1).
    expect(result.whiteGaps[0].occurrences).toBe(2);
    expect(result.whiteGaps[0].opponentMove).toBe("e5");
    expect(result.whiteGaps[1].occurrences).toBe(1);
    expect(result.whiteGaps[1].opponentMove).toBe("d5");
  });

  it("respects the rating filter when applied", async () => {
    mockFetch(
      chesscomFixture([
        {
          pgn: pgn(["e4", "e5", "Nf3"]),
          time_class: "blitz",
          white: { username: "alice", rating: 800 }, // below minRating
          black: { username: "bob", rating: 800 },
        },
        {
          pgn: pgn(["d4", "d5", "Nf3"]),
          time_class: "blitz",
          white: { username: "alice", rating: 2000 }, // passes
          black: { username: "bob", rating: 2000 },
        },
      ]),
    );

    const STARTING_FEN =
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = await runGapAnalysis(
      {
        chesscomUsername: "alice",
        color: "white",
        minRating: 1800,
        maxGames: 10,
      },
      [{ color: "white", fens: [STARTING_FEN] }],
    );

    expect(result.gamesAnalyzed).toBe(1);
    expect(result.whiteGaps).toHaveLength(1);
    expect(result.whiteGaps[0].opponentMove).toBe("d5");
  });

  it("filters out games whose time class isn't in the allowlist", async () => {
    mockFetch(
      chesscomFixture([
        {
          pgn: pgn(["e4", "e5", "Nf3"]),
          time_class: "blitz",
          white: { username: "alice", rating: 1500 },
          black: { username: "bob", rating: 1500 },
        },
        {
          pgn: pgn(["d4", "d5", "Nf3"]),
          time_class: "rapid",
          white: { username: "alice", rating: 1500 },
          black: { username: "bob", rating: 1500 },
        },
      ]),
    );
    const STARTING_FEN =
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = await runGapAnalysis(
      {
        chesscomUsername: "alice",
        color: "white",
        timeClasses: ["rapid"],
        maxGames: 10,
      },
      [{ color: "white", fens: [STARTING_FEN] }],
    );

    expect(result.gamesAnalyzed).toBe(1);
    expect(result.whiteGaps[0].opponentMove).toBe("d5");
  });

  it("skips a game entirely when the user is on the wrong color for the filter", async () => {
    mockFetch(
      chesscomFixture([
        {
          // Alice was black here, but we're asking for white-only gaps.
          pgn: pgn(["e4", "e5"]),
          time_class: "blitz",
          white: { username: "bob", rating: 1500 },
          black: { username: "alice", rating: 1500 },
        },
      ]),
    );

    const STARTING_FEN =
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = await runGapAnalysis(
      {
        chesscomUsername: "alice",
        color: "white",
        maxGames: 10,
      },
      [{ color: "white", fens: [STARTING_FEN] }],
    );
    expect(result.whiteGaps).toEqual([]);
    expect(result.blackGaps).toEqual([]);
  });

  it("returns no gap when the user's repertoire covers the whole game", async () => {
    // The user has saved positions after every white move in 1.e4 e5 2.Nf3.
    // Game ends before any gap appears.
    const { Chess } = require("chess.js") as typeof import("chess.js");

    const fens: string[] = [];
    const g = new Chess();
    fens.push(g.fen()); // start
    g.move("e4");
    g.move("e5");
    fens.push(g.fen()); // before Nf3 (white to move)

    mockFetch(
      chesscomFixture([
        {
          pgn: pgn(["e4", "e5", "Nf3"]),
          time_class: "blitz",
          white: { username: "alice", rating: 1500 },
          black: { username: "bob", rating: 1500 },
        },
      ]),
    );

    const result = await runGapAnalysis(
      { chesscomUsername: "alice", color: "white", maxGames: 5 },
      [{ color: "white", fens }],
    );
    expect(result.whiteGaps).toEqual([]);
  });
});

describe("runGapAnalysis — lichess", () => {
  it("parses NDJSON, applies color filter, and reports the first gap", async () => {
    const lines = [
      JSON.stringify({
        id: "abc123",
        perf: "blitz",
        moves: "e4 e5 Nf3 Nc6",
        players: {
          white: { user: { name: "alice" }, rating: 1500 },
          black: { user: { name: "bob" }, rating: 1500 },
        },
      }),
    ].join("\n");

    mockFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(lines),
      }),
    );

    const STARTING_FEN =
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = await runGapAnalysis(
      { lichessUsername: "alice", color: "white", maxGames: 10 },
      [{ color: "white", fens: [STARTING_FEN] }],
    );

    expect(result.gamesFetched).toBe(1);
    expect(result.whiteGaps).toHaveLength(1);
    expect(result.whiteGaps[0].sampleGameUrls[0]).toBe(
      "https://lichess.org/abc123",
    );
  });

  it("reports a fetch error and returns empty results when lichess 404s", async () => {
    mockFetch(() =>
      Promise.resolve({ ok: false, status: 404, text: async () => "" }),
    );
    const result = await runGapAnalysis(
      { lichessUsername: "ghost", color: "both", maxGames: 5 },
      [],
    );
    expect(result.errors).toContainEqual(
      expect.stringContaining("lichess fetch failed"),
    );
    expect(result.gamesFetched).toBe(0);
  });
});
