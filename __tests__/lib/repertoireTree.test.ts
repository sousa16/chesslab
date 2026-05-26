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

  it("walks the correct path for a node reachable via multiple transposition parents", () => {
    // A simple transposition: after 1.e4, white plans both d4 and Nf3 as
    // potential first-move follow-ups. The position after 1.e4 e5 2.Nf3 d6
    // 3.d4 is the same as 1.e4 e5 2.d4 d6 3.Nf3 (= 1.e4 e5 2.Nf3 d6 3.d4
    // and 1.e4 e5 2.d4 d6 3.Nf3 both converge — wait, those don't actually
    // converge naturally). Use a known reversible-order pair instead:
    //   1.e4 c5 2.Nc3 d6 3.g3  vs.  1.e4 c5 2.g3 d6 3.Nc3 — both reach the
    //   same Closed Sicilian position.
    const root = STARTING_FEN;
    // conv: 6 plies, white-to-move at the convergence position.
    // Same position reached by either ordering of Nc3/g3 by white.
    const conv = ["e4", "c5", "Nc3", "d6", "g3", "Nc6"];
    expect(fenAfter(conv).split(" ").slice(0, 3).join(" ")).toBe(
      fenAfter(["e4", "c5", "g3", "d6", "Nc3", "Nc6"]).split(" ").slice(0, 3).join(" "),
    );

    const entries: TreeEntryInput[] = [
      { id: "root", expectedMove: uci("e4"), position: { fen: root } },
      // First branch: after 1.e4 c5, user plays Nc3
      {
        id: "nc3-branch",
        expectedMove: uci("Nc3", ["e4", "c5"]),
        position: { fen: fenAfter(["e4", "c5"]) },
      },
      // Second branch: after 1.e4 c5, user plays g3
      {
        id: "g3-branch",
        expectedMove: uci("g3", ["e4", "c5"]),
        position: { fen: fenAfter(["e4", "c5"]) },
      },
      // After Nc3 d6, user plays g3 (the converging path)
      {
        id: "after-nc3-d6",
        expectedMove: uci("g3", ["e4", "c5", "Nc3", "d6"]),
        position: { fen: fenAfter(["e4", "c5", "Nc3", "d6"]) },
      },
      // After g3 d6, user plays Nc3 (the OTHER converging path)
      {
        id: "after-g3-d6",
        expectedMove: uci("Nc3", ["e4", "c5", "g3", "d6"]),
        position: { fen: fenAfter(["e4", "c5", "g3", "d6"]) },
      },
      // Convergence point — both predecessors reach this position.
      // User plays Bg2 here.
      {
        id: "convergence",
        expectedMove: uci("Bg2", conv),
        position: { fen: fenAfter(conv) },
      },
    ];

    const { byEntryId } = buildRepertoireTree(entries, "White");
    const convergence = byEntryId.get("convergence")!;

    // convergence has TWO parents (after-nc3-d6 and after-g3-d6). Whichever
    // path the walk takes, the resulting sanMoves must replay cleanly into
    // chess.js and end on the user's expected move.
    expect(convergence.sanMoves[convergence.sanMoves.length - 1]).toBe("Bg2");
    const game = new Chess();
    for (const san of convergence.sanMoves) {
      const m = game.move(san);
      expect(m).not.toBeNull();
    }
    // The walked path must end at convergence position + Bg2 played.
    const targetFen = fenAfter([...conv, "Bg2"]);
    expect(game.fen().split(" ").slice(0, 3).join(" ")).toBe(
      targetFen.split(" ").slice(0, 3).join(" "),
    );
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
