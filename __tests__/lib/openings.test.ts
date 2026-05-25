/**
 * Tests for the ECO opening lookup library.
 *
 * Uses the real precomputed ECO dataset — these tests verify that:
 *   1. SAN-prefix lookup returns the longest match.
 *   2. The FEN-path map is built lazily and resolves well-known starting
 *      positions to the expected SAN sequence.
 *   3. Off-mainline inputs return null rather than throwing.
 */

import { lookupOpening, sanPathToFen } from "@/lib/openings";

describe("lookupOpening", () => {
  it("returns null for an empty move list", () => {
    expect(lookupOpening([])).toBeNull();
  });

  it("matches a known short opening prefix (1. e4)", () => {
    const hit = lookupOpening(["e4"]);
    expect(hit).not.toBeNull();
    expect(hit?.eco).toMatch(/^B0/);
  });

  it("returns the longest matching prefix", () => {
    const short = lookupOpening(["e4"]);
    const longer = lookupOpening(["e4", "c5"]);
    expect(longer).not.toBeNull();
    expect(longer?.name).not.toBe(short?.name);
  });

  it("falls back to a shorter prefix when the full sequence isn't in the dataset", () => {
    const e4Hit = lookupOpening(["e4"]);
    // Garbage trailing tokens — the longest prefix that matches is just "e4".
    const padded = lookupOpening(["e4", "ZZZ", "QQQ"]);
    expect(padded).toEqual(e4Hit);
  });

  it("returns null when no prefix matches at all", () => {
    // SAN strings that don't appear in the ECO dataset for any prefix.
    expect(lookupOpening(["ZZZ"])).toBeNull();
  });

  it("returned matches expose eco and name strings", () => {
    const hit = lookupOpening(["d4", "Nf6"]);
    expect(typeof hit?.eco).toBe("string");
    expect(typeof hit?.name).toBe("string");
    expect(hit?.eco.length).toBeGreaterThan(0);
  });
});

describe("sanPathToFen", () => {
  const STARTING_FEN =
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("returns null for the standard starting position (no opening played yet)", () => {
    expect(sanPathToFen(STARTING_FEN)).toBeNull();
  });

  it("resolves a well-known mid-opening FEN to the SAN path leading to it", () => {
    // FEN after 1. e4 c5
    const sicilianAfterC5 =
      "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
    const path = sanPathToFen(sicilianAfterC5);
    expect(path).not.toBeNull();
    expect(path).toEqual(["e4", "c5"]);
  });

  it("returns null for a FEN that doesn't sit on any known opening path", () => {
    // Synthetic FEN string — clearly not on any opening's traversal.
    expect(sanPathToFen("not-a-real-fen-key")).toBeNull();
  });
});
