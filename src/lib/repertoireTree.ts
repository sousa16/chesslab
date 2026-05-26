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
  // SAN path from STANDARD START to node.fen (i.e., NOT including the
  // user's expectedMove). Populated by the walk for the common case where
  // rootFen === starting position; lets getAnchoredSans skip a per-entry
  // chess.js replay. Undefined when the tree root is mid-game — callers
  // fall back to anchorSansToStart, which adds the ECO prefix.
  anchoredSansFromStart?: string[];
  children: RepertoireTreeNode[];
}

/**
 * Get the SAN path from the standard starting position to a node's
 * position FEN (i.e., the moves BEFORE the user's expectedMove). Uses
 * the walk-populated cache when present; otherwise falls back to the
 * generic anchor logic. Real callers (trainingEnrichment, /api routes,
 * stats aggregation) should prefer this over calling anchorSansToStart
 * directly on a node — it skips a ~1.3ms-per-entry chess.js replay.
 */
export function getAnchoredSansForNode(node: RepertoireTreeNode): string[] {
  if (node.anchoredSansFromStart) return node.anchoredSansFromStart;
  return anchorSansToStart(node.sanMoves, node.fen, node.rootFen);
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

  // Secondary index: 3-field FEN key → nodes. Lets the linker tolerate
  // EP / halfmove / fullmove drift between chess.js's computed fen and a
  // user-saved fen (different tools may produce different EP targets for
  // the same position).
  const nodesByFenKey = new Map<string, RepertoireTreeNode[]>();
  for (const list of nodesByFen.values()) {
    for (const node of list) {
      const key = fenKey(node.fen);
      if (!nodesByFenKey.has(key)) nodesByFenKey.set(key, []);
      nodesByFenKey.get(key)!.push(node);
    }
  }

  // Link parents to children. Two hot-path optimizations here vs. the
  // earlier implementation:
  //
  // 1) `probe.moves()` (no `verbose: true`) — generating the full Move
  //    objects with SAN/from/to was ~10× slower than just generating
  //    SAN strings, and the SAN string alone is all we need to play
  //    each candidate reply. For a ~450-entry repertoire this single
  //    change drops buildRepertoireTree from ~3.3s to well under 1s.
  // 2) We don't set `child.opponentMove` here anymore. The walk derives
  //    the correct bridge move per-path at walk time (a node reachable
  //    via two transpositions has two valid bridges — a single stored
  //    field would lose one). Keeping the linker focused on "does this
  //    reply land on a saved child fen?" makes the inner loop
  //    branch-free.
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
      const sanList = probe.moves();
      const seen = new Set<string>();
      for (const san of sanList) {
        const m = probe.move(san);
        if (!m) continue;
        const childFen = probe.fen();
        probe.undo();
        const childList =
          nodesByFen.get(childFen) ?? nodesByFenKey.get(fenKey(childFen));
        if (!childList) continue;
        for (const child of childList) {
          if (seen.has(child.id)) continue;
          seen.add(child.id);
          parent.children.push(child);
        }
      }
    }
  }

  // Roots are nodes whose FEN isn't referenced as anyone's child. Compare
  // on the 3-field key for the same EP-drift tolerance as the linker.
  const childFenKeys = new Set<string>();
  for (const list of nodesByFen.values()) {
    for (const node of list) {
      for (const child of node.children) childFenKeys.add(fenKey(child.fen));
    }
  }
  const roots: RepertoireTreeNode[] = [];
  for (const list of nodesByFen.values()) {
    for (const node of list) {
      if (!childFenKeys.has(fenKey(node.fen))) roots.push(node);
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
  // Returns the Move object for the bridge (which already exposes
  // from / to / promotion / san), or null if no legal reply reaches
  // `targetFen`. Uses `moves()` instead of `moves({ verbose: true })` to
  // avoid the ~10× cost of generating full Move objects up front — we
  // only need the verbose info for the ONE reply that bridges.
  const findBridgeMove = (
    game: Chess,
    targetFen: string,
  ): ReturnType<Chess["move"]> | null => {
    const targetKey = fenKey(targetFen);
    if (fenKey(game.fen()) === targetKey) return null;
    const sanList = game.moves();
    for (const san of sanList) {
      const m = game.move(san);
      if (!m) continue;
      if (fenKey(game.fen()) === targetKey) {
        // Caller continues from this state, so we leave the move applied.
        return m;
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
    rootIsStandardStart: boolean,
    visitedOnPath: Set<string>,
  ) => {
    if (visitedOnPath.has(node.id)) return;
    const nextVisited = new Set(visitedOnPath);
    nextVisited.add(node.id);

    const game = new Chess(parentGame.fen());
    const sans = [...parentSans];

    // Bridge from parent's post-user state to node.fen via a single opp move.
    const bridge = findBridgeMove(game, node.fen);
    if (bridge) {
      sans.push(bridge.san);
      node.opponentMove = `${bridge.from}${bridge.to}${bridge.promotion ?? ""}`;
    }

    // Memoize the anchored prefix BEFORE we play the user's move. When the
    // tree root is the standard start, `sans` at this point is the full
    // path from the standard starting position to node.fen — that's
    // exactly what anchorSansToStart would replay to derive. Storing it
    // lets per-entry callers skip a chess.js replay each (~1.3ms × N).
    if (rootIsStandardStart) {
      node.anchoredSansFromStart = [...sans];
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
    for (const child of node.children)
      walk(child, sans, game, rootFen, rootIsStandardStart, nextVisited);
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

  const STARTING_FEN_KEY_LOCAL = fenKey(STARTING_FEN);
  for (const root of roots) {
    const game = new Chess(root.fen);
    const sans: string[] = [];
    const rootIsStandardStart = fenKey(root.fen) === STARTING_FEN_KEY_LOCAL;

    if (color === "Black" && game.turn() === "b") {
      const whiteMove = findOpeningWhiteMove(root.fen);
      if (whiteMove) sans.push(whiteMove);
    }

    // Memoize the anchored prefix for the root too. For a white root at
    // the standard start this is just [] (no moves before the user's
    // first move); for a black root the white-opening move has already
    // been prepended into `sans`. The anchor for the root's positionFen
    // is the same — leave it captured before the user's move plays.
    if (rootIsStandardStart || (color === "Black" && sans.length === 1)) {
      root.anchoredSansFromStart = [...sans];
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
    for (const child of root.children)
      walk(child, sans, game, root.fen, rootIsStandardStart, rootVisited);
  }

  return { roots, byEntryId };
}
