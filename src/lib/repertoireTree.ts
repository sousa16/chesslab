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
  // every legal opponent reply that lands on a saved position.
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
      const seen = new Set<string>();
      for (const reply of probe.moves({ verbose: true })) {
        const next = new Chess(postUserFen);
        next.move(reply.san);
        const childList = nodesByFen.get(next.fen());
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
  const walk = (
    node: RepertoireTreeNode,
    parentSans: string[],
    parentGame: Chess,
    rootFen: string,
  ) => {
    const game = new Chess(parentGame.fen());
    const sans = [...parentSans];

    if (node.opponentMove) {
      try {
        const m = game.move({
          from: node.opponentMove.slice(0, 2),
          to: node.opponentMove.slice(2, 4),
          promotion: node.opponentMove.slice(4) || undefined,
        });
        if (m) sans.push(m.san);
      } catch {
        /* skip */
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
    for (const child of node.children) walk(child, sans, game, rootFen);
  };

  const findOpeningWhiteMove = (targetFen: string): string | null => {
    const probe = new Chess(STARTING_FEN);
    for (const mv of probe.moves({ verbose: true })) {
      const t = new Chess(STARTING_FEN);
      t.move(mv.san);
      if (t.fen() === targetFen) return mv.san;
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
    for (const child of root.children) walk(child, sans, game, root.fen);
  }

  return { roots, byEntryId };
}
