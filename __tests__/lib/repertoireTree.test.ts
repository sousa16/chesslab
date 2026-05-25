/**
 * Tests for the repertoire tree builder.
 *
 * Uses real chess.js to construct test FENs so the tree-building logic
 * (which plays moves on real boards under the hood) is exercised against
 * real positions instead of synthetic strings.
 */

import { Chess } from "chess.js";
import {
  buildRepertoireTree,
  anchorSansToStart,
  type TreeEntryInput,
} from "@/lib/repertoireTree";

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
  if (!m) throw new Error(`Bad move ${san}`);
  return `${m.from}${m.to}${m.promotion ?? ""}`;
}

describe("buildRepertoireTree", () => {
  it("returns an empty tree for no entries", () => {
    const { roots, byEntryId } = buildRepertoireTree([], "White");
    expect(roots).toEqual([]);
    expect(byEntryId.size).toBe(0);
  });

  it("treats a single white entry at the start as a root", () => {
    const entries: TreeEntryInput[] = [
      {
        id: "e1",
        expectedMove: uci("e4"),
        position: { fen: STARTING_FEN },
      },
    ];
    const { roots, byEntryId } = buildRepertoireTree(entries, "White");

    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe("e1");
    expect(roots[0].children).toEqual([]);
    expect(roots[0].sanMoves).toEqual(["e4"]);
    expect(roots[0].rootFen).toBe(STARTING_FEN);
    expect(byEntryId.get("e1")).toBe(roots[0]);
  });

  it("prepends white's opening move for a black root one ply in", () => {
    // After 1.e4 — black to move. Black plans c5.
    const fenAfterE4 = fenAfter(["e4"]);
    const entries: TreeEntryInput[] = [
      {
        id: "b1",
        expectedMove: uci("c5", ["e4"]),
        position: { fen: fenAfterE4 },
      },
    ];
    const { roots } = buildRepertoireTree(entries, "Black");
    expect(roots).toHaveLength(1);
    expect(roots[0].sanMoves).toEqual(["e4", "c5"]);
  });

  it("links a parent entry to its child through the opponent reply", () => {
    // Parent: starting position, user plays e4.
    // Child: after 1.e4 e5, user plays Nf3.
    const parentFen = STARTING_FEN;
    const childFen = fenAfter(["e4", "e5"]);

    const entries: TreeEntryInput[] = [
      {
        id: "parent",
        expectedMove: uci("e4"),
        position: { fen: parentFen },
      },
      {
        id: "child",
        expectedMove: uci("Nf3", ["e4", "e5"]),
        position: { fen: childFen },
      },
    ];
    const { roots, byEntryId } = buildRepertoireTree(entries, "White");

    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe("parent");
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].id).toBe("child");

    const child = byEntryId.get("child")!;
    // opponentMove should be e7e5 in UCI
    expect(child.opponentMove).toBe("e7e5");
    expect(child.sanMoves).toEqual(["e4", "e5", "Nf3"]);
    expect(child.rootFen).toBe(parentFen);
  });

  it("creates separate children for distinct opponent replies", () => {
    // After 1.e4, branch on both 1...e5 (→ Nf3) and 1...c5 (→ Nf3 sicilian).
    const entries: TreeEntryInput[] = [
      {
        id: "parent",
        expectedMove: uci("e4"),
        position: { fen: STARTING_FEN },
      },
      {
        id: "vs-e5",
        expectedMove: uci("Nf3", ["e4", "e5"]),
        position: { fen: fenAfter(["e4", "e5"]) },
      },
      {
        id: "vs-c5",
        expectedMove: uci("Nf3", ["e4", "c5"]),
        position: { fen: fenAfter(["e4", "c5"]) },
      },
    ];
    const { roots, byEntryId } = buildRepertoireTree(entries, "White");

    expect(roots).toHaveLength(1);
    const parent = roots[0];
    expect(parent.children).toHaveLength(2);
    const childIds = parent.children.map((c) => c.id).sort();
    expect(childIds).toEqual(["vs-c5", "vs-e5"]);
    expect(byEntryId.get("vs-e5")!.opponentMove).toBe("e7e5");
    expect(byEntryId.get("vs-c5")!.opponentMove).toBe("c7c5");
  });

  it("uses each entry's parent as its rootFen when it has no parent in the tree", () => {
    // Mid-game black entry with no shallower entry — tree root is the entry itself.
    const midFen = fenAfter(["e4", "c5", "Nf3"]); // black to move
    const entries: TreeEntryInput[] = [
      {
        id: "mid",
        expectedMove: uci("d6", ["e4", "c5", "Nf3"]),
        position: { fen: midFen },
      },
    ];
    const { roots } = buildRepertoireTree(entries, "Black");
    expect(roots).toHaveLength(1);
    expect(roots[0].rootFen).toBe(midFen);
  });

  it("skips an entry whose expectedMove is not legal at its FEN without crashing", () => {
    // expectedMove e2e4 is fine at the start, but the second entry says
    // 'play e2e4 from a position where e2 is empty' — illegal.
    const entries: TreeEntryInput[] = [
      {
        id: "ok",
        expectedMove: uci("e4"),
        position: { fen: STARTING_FEN },
      },
      {
        id: "bad",
        expectedMove: "e2e4",
        position: { fen: fenAfter(["e4", "e5"]) },
      },
    ];
    const { roots } = buildRepertoireTree(entries, "White");
    // The good entry is still there; the bad one is a root (no parent could
    // be derived) and just has no children.
    const ids = roots.map((r) => r.id).sort();
    expect(ids).toContain("ok");
  });
});

describe("anchorSansToStart", () => {
  it("returns the tree sans unchanged when they already start from the standard position", () => {
    const fenAfterE4E5 = fenAfter(["e4", "e5"]);
    expect(anchorSansToStart(["e4", "e5"], fenAfterE4E5, STARTING_FEN)).toEqual([
      "e4",
      "e5",
    ]);
  });

  it("falls back to ECO direct FEN lookup when tree sans don't replay to the position", () => {
    // d4 d5 IS a known opening in ECO, so anchor returns that path
    // even though our (wrong) tree sans wouldn't replay there.
    expect(
      anchorSansToStart(["e4", "e5"], fenAfter(["d4", "d5"]), STARTING_FEN),
    ).toEqual(["d4", "d5"]);
  });

  it("returns [] when nothing anchors (off-book FEN, no replay, no ECO match)", () => {
    expect(
      anchorSansToStart(
        ["e4", "e5"],
        "not-a-real-fen",
        "also-not-a-real-fen",
      ),
    ).toEqual([]);
  });

  it("prepends the ECO path when the tree root sits mid-game on a known opening", () => {
    // Tree root = after 1.e4 c5 (Sicilian). Tree-local sans empty.
    // Anchor for the same position should be ['e4', 'c5'].
    const sicilianAfterC5 = fenAfter(["e4", "c5"]);
    const result = anchorSansToStart([], sicilianAfterC5, sicilianAfterC5);
    expect(result).toEqual(["e4", "c5"]);
  });
});
