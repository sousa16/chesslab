/**
 * Shared tree-building for a user's repertoire.
 *
 * Given a flat list of RepertoireEntries (positions where the user is to
 * move + the user's expected move in UCI), reconstruct the tree induced by
 * chess transpositions and compute the canonical SAN path from the standard
 * starting position to each entry.
 *
 * Used by:
 *   - /api/repertoires/route.ts to render the opening-line tree
 *   - /(app)/training/page.tsx to look up opening names for training cards
 *
 * Two callers, one source of truth — keeps SAN paths (and therefore opening
 * names) consistent across the UI.
 */

import { Chess } from "chess.js";
import { sanPathToFen } from "./openings";

// Compare FENs ignoring halfmove clock, fullmove number, and en passant
// target. The first two drift between replay and stored FEN trivially;
// the EP square also drifts because some tools follow the FIDE rule (set
// after any pawn double-push) while chess.js follows the Hybrid rule
// (set only when a capture is actually possible). For navigation /
// anchoring we only care about piece placement + side to move + castling.
function fenKey(fen: string | null | undefined): string {
  if (!fen) return "";
  return fen.split(" ").slice(0, 3).join(" ");
}

function replayToTarget(
  startFen: string | undefined,
  sans: string[],
  targetFen: string,
): string[] | null {
  try {
    const g = startFen ? new Chess(startFen) : new Chess();
    const targetKey = fenKey(targetFen);
    if (fenKey(g.fen()) === targetKey) return [];
    const played: string[] = [];
    for (const san of sans) {
      const move = g.move(san);
      if (!move) return null;
      played.push(san);
      if (fenKey(g.fen()) === targetKey) return played;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Resolve the SAN move sequence from the standard starting position to a
 * given repertoire-tree entry. Tries three sources in order:
 *
 *   1. Replay the tree's own `sanMoves` from the start — works when the
 *      user's tree extends all the way back to move 0.
 *   2. Prepend the ECO mainline path to the tree's `rootFen`, then layer
 *      the tree's sans — works when the tree root sits mid-game on a
 *      known opening line (e.g., a Caro-Kann entry whose tree starts at
 *      "after 1.e4 c6" because there's no earlier entry).
 *   3. ECO direct lookup of the position FEN — last-resort match for
 *      positions that happen to sit exactly on a named opening's path.
 *
 * Returns [] when nothing anchors cleanly so callers can hide navigation
 * and avoid showing a misleading partial line.
 */
export function anchorSansToStart(
  treeSans: string[],
  positionFen: string,
  rootFen: string,
): string[] {
  const fromStart = replayToTarget(undefined, treeSans, positionFen);
  if (fromStart) return fromStart;

  const ecoToRoot = sanPathToFen(rootFen);
  if (ecoToRoot && ecoToRoot.length > 0) {
    const combined = [...ecoToRoot, ...treeSans];
    const fromStartWithEco = replayToTarget(undefined, combined, positionFen);
    if (fromStartWithEco) return fromStartWithEco;
  }

  const ecoDirect = sanPathToFen(positionFen);
  if (ecoDirect) return ecoDirect;

  return [];
}

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export interface TreeEntryInput {
  id: string;
  expectedMove: string; // UCI
  position: { fen: string };
}

export interface RepertoireTreeNode {
  id: string;
  fen: string;
  expectedMove: string; // UCI
  opponentMove?: string; // UCI; the move that bridges from a parent's
  //                       post-user-move position to this node's position
  sanMoves: string[]; // SAN path from this node's tree root through this node
  // FEN of the deepest ancestor reachable from this node in the user's
  // tree. When the tree root is the standard starting position, sanMoves
  // is anchored at the start. When it's mid-game (the user has no entry at
  // a shallower position), callers can derive a full-from-start path by
  // prepending the canonical moves leading to rootFen.
  rootFen: string;
  children: RepertoireTreeNode[];
}

export interface BuiltRepertoireTree {
  roots: RepertoireTreeNode[];
  byEntryId: Map<string, RepertoireTreeNode>;
}

/**
 * Build the repertoire tree and compute SAN paths for every entry.
 *
 * For Black repertoires, the root entry's FEN is one ply past the start;
 * we discover the white move that produced it by trying all 20 legal white
 * first moves so the SAN path includes the opener.
 */
export function buildRepertoireTree(
  entries: TreeEntryInput[],
  color: "White" | "Black",
): BuiltRepertoireTree {
  const byEntryId = new Map<string, RepertoireTreeNode>();
  const nodesByFen = new Map<string, RepertoireTreeNode[]>();

  for (const entry of entries) {
    const node: RepertoireTreeNode = {
      id: entry.id,
      fen: entry.position.fen,
      expectedMove: entry.expectedMove,
      sanMoves: [],
      rootFen: entry.position.fen,
      children: [],
    };
    byEntryId.set(entry.id, node);
    if (!nodesByFen.has(entry.position.fen)) {
      nodesByFen.set(entry.position.fen, []);
    }
    nodesByFen.get(entry.position.fen)!.push(node);
  }

  // Link parents to children by playing the user's move and then enumerating
  // every legal opponent reply that lands on a saved position. The probe
  // game is reused across replies via play/undo so we don't allocate a
  // fresh Chess instance for each of the ~30 legal moves per entry —
  // matters for users with large repertoires because this loop dominates
  // endpoint latency for both /api/repertoires and /api/training-stats.
  for (const list of nodesByFen.values()) {
    for (const parent of list) {
      let postUserFen: string;
      try {
        const game = new Chess(parent.fen);
        const moved = game.move(parent.expectedMove, { strict: false });
        if (!moved) continue;
        postUserFen = game.fen();
      } catch {
        continue;
      }

      const probe = new Chess(postUserFen);
      const replies = probe.moves({ verbose: true });
      const seen = new Set<string>();
      for (const reply of replies) {
        probe.move(reply.san);
        const childFen = probe.fen();
        probe.undo();
        const childList = nodesByFen.get(childFen);
        if (!childList) continue;
        for (const child of childList) {
          if (seen.has(child.id)) continue;
          seen.add(child.id);
          child.opponentMove = `${reply.from}${reply.to}${reply.promotion ?? ""}`;
          parent.children.push(child);
        }
      }
    }
  }

  // Roots are nodes whose FEN isn't referenced as anyone's child.
  const childFens = new Set<string>();
  for (const list of nodesByFen.values()) {
    for (const node of list) {
      for (const child of node.children) childFens.add(child.fen);
    }
  }
  const roots: RepertoireTreeNode[] = [];
  for (const list of nodesByFen.values()) {
    for (const node of list) {
      if (!childFens.has(node.fen)) roots.push(node);
    }
  }

  // Walk each root computing SAN paths. For Black roots, prepend the white
  // move that produced the root FEN.
  //
  // For each child we DERIVE the opponent bridge move from the parent's
  // post-user-move state instead of relying on `child.opponentMove`. The
  // linker stored `opponentMove` per child globally and overwrote it
  // across parent iterations, so a node reachable via a real transposition
  // (e.g., d4 then Nc6 vs. Nc6 then d4) ended up with only ONE parent's
  // bridge stored. When the walk arrived via the OTHER parent, the stored
  // SAN was illegal in the current game state, chess.js's move() returned
  // null, the try/catch silently swallowed it, and the chain's sanMoves
  // came out partial. anchorSansToStart then couldn't anchor and the
  // training UI hid the back-step nav. Recomputing the bridge per-path
  // guarantees a valid SAN list for whichever parent reaches the node.
  //
  // `visitedOnPath` breaks transposition cycles (A→B→A) that would
  // otherwise recurse forever — sanMoves still gets overwritten by the
  // last legitimate visit, which is fine since every path is valid.
  const findBridgeSan = (game: Chess, targetFen: string): string | null => {
    const targetKey = fenKey(targetFen);
    if (fenKey(game.fen()) === targetKey) return null; // already there
    const replies = game.moves({ verbose: true });
    for (const reply of replies) {
      game.move(reply.san);
      if (fenKey(game.fen()) === targetKey) {
        // Caller continues from this state, so we leave the move applied.
        return reply.san;
      }
      game.undo();
    }
    return null;
  };

  const walk = (
    node: RepertoireTreeNode,
    parentSans: string[],
    parentGame: Chess,
    rootFen: string,
    visitedOnPath: Set<string>,
  ) => {
    if (visitedOnPath.has(node.id)) return;
    const nextVisited = new Set(visitedOnPath);
    nextVisited.add(node.id);

    const game = new Chess(parentGame.fen());
    const sans = [...parentSans];

    // Bridge from parent's post-user state to node.fen via a single opp move.
    const bridgeSan = findBridgeSan(game, node.fen);
    if (bridgeSan) {
      sans.push(bridgeSan);
      // Update the stored UCI to match the path we actually took. The /api
      // route still exposes this field; without the update, callers would
      // see whichever path was linked last (potentially the wrong one).
      const lastMove = game.history({ verbose: true }).pop();
      if (lastMove) {
        node.opponentMove = `${lastMove.from}${lastMove.to}${lastMove.promotion ?? ""}`;
      }
    }

    try {
      const userMove = game.move({
        from: node.expectedMove.slice(0, 2),
        to: node.expectedMove.slice(2, 4),
        promotion: node.expectedMove.slice(4) || undefined,
      });
      if (userMove) sans.push(userMove.san);
    } catch {
      /* skip */
    }

    node.sanMoves = sans;
    node.rootFen = rootFen;
    for (const child of node.children) walk(child, sans, game, rootFen, nextVisited);
  };

  const findOpeningWhiteMove = (targetFen: string): string | null => {
    const probe = new Chess(STARTING_FEN);
    const moves = probe.moves({ verbose: true });
    for (const mv of moves) {
      probe.move(mv.san);
      const fen = probe.fen();
      probe.undo();
      if (fen === targetFen) return mv.san;
    }
    return null;
  };

  for (const root of roots) {
    const game = new Chess(root.fen);
    const sans: string[] = [];

    if (color === "Black" && game.turn() === "b") {
      const whiteMove = findOpeningWhiteMove(root.fen);
      if (whiteMove) sans.push(whiteMove);
    }

    try {
      const userMove = game.move({
        from: root.expectedMove.slice(0, 2),
        to: root.expectedMove.slice(2, 4),
        promotion: root.expectedMove.slice(4) || undefined,
      });
      if (userMove) sans.push(userMove.san);
    } catch {
      /* skip */
    }

    root.sanMoves = sans;
    root.rootFen = root.fen;
    const rootVisited = new Set<string>([root.id]);
    for (const child of root.children) walk(child, sans, game, root.fen, rootVisited);
  }

  return { roots, byEntryId };
}
