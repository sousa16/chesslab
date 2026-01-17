import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Chess } from "chess.js";

/**
 * GET /api/repertoires?color=white|black
 *
 * Fetches all openings for a user's repertoire of a specific color.
 * Returns opening lines as hierarchical trees with move numbers and full sequences.
 *
 * Response: { openings: Opening[] }
 */

interface LineNode {
  id: string;
  fen: string;
  expectedMove: string; // UCI format
  moveNumber: number; // e.g., 1 for first move, continues incrementing
  moveSequence: string; // e.g., "1. e2e4" or "1. e2e4 c7c5"
  children: LineNode[];
  opponentMove?: string; // The opponent's move that led to this position from parent
}

interface Opening {
  id: string;
  name: string;
  root: LineNode | null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const color = request.nextUrl.searchParams.get("color");

    if (!color || !["white", "black"].includes(color)) {
      return NextResponse.json(
        { error: "Invalid color: must be 'white' or 'black'" },
        { status: 400 },
      );
    }

    // Get the user's repertoire for this color
    const repertoire = await prisma.repertoire.findUnique({
      where: {
        userId_color: {
          userId: session.user.id,
          color: color === "white" ? "White" : "Black",
        },
      },
      include: {
        entries: {
          include: { position: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!repertoire || repertoire.entries.length === 0) {
      return NextResponse.json({ openings: [] }, { status: 200 });
    }

    // Build opening lines as hierarchical trees
    // Each entry represents a position where it's the user's turn to move
    // The tree shows the user's moves and opponent responses

    const nodesByEntryId = new Map<string, LineNode>(); // Map by entry ID to handle multiple moves from same position
    const nodesByFen = new Map<string, LineNode[]>(); // Multiple nodes can have the same FEN (different expected moves)

    // First pass: create nodes for each position where user moves
    for (const entry of repertoire.entries) {
      const node: LineNode = {
        id: entry.id,
        fen: entry.position.fen,
        expectedMove: entry.expectedMove,
        moveNumber: 0, // Will be calculated later
        moveSequence: "", // Will be calculated later
        children: [],
      };
      nodesByEntryId.set(entry.id, node);

      // Track all nodes by FEN (can have multiple)
      if (!nodesByFen.has(entry.position.fen)) {
        nodesByFen.set(entry.position.fen, []);
      }
      nodesByFen.get(entry.position.fen)!.push(node);
    }

    // Second pass: build tree by finding which positions can be reached from user moves
    for (const nodes of nodesByFen.values()) {
      for (const parentNode of nodes) {
        // Make user's move
        const game = new Chess(parentNode.fen);
        let moveResult = null;

        try {
          moveResult = game.move(parentNode.expectedMove, { strict: false });
        } catch (e) {
          console.warn(
            `Could not play move "${parentNode.expectedMove}" from position`,
          );
          continue;
        }

        if (!moveResult) continue;

        // After user's move, it's opponent's turn
        const posAfterUserMove = game.fen();
        const foundChildren = new Set<string>(); // Track children we've added to avoid duplicates

        // Find saved positions reachable by opponent moves
        const testGameForMoves = new Chess(posAfterUserMove);
        const opponentMoves = testGameForMoves.moves({ verbose: true });

        for (const moveObj of opponentMoves) {
          const testGame = new Chess(posAfterUserMove);
          testGame.move(moveObj.san);
          const fensAfterOpponentMove = testGame.fen();

          // Check if this FEN has any saved positions
          const childNodes = nodesByFen.get(fensAfterOpponentMove);
          if (childNodes) {
            for (const childNode of childNodes) {
              if (!foundChildren.has(childNode.id)) {
                // Store the opponent's move in UCI format, same as expectedMove
                childNode.opponentMove = `${moveObj.from}${moveObj.to}${
                  moveObj.promotion || ""
                }`;
                parentNode.children.push(childNode);
                foundChildren.add(childNode.id);
              }
            }
          }
        }
      }
    }

    // Third pass: identify root nodes (positions not reachable from other saved positions)
    const positionsThatAreChildren = new Set<string>();
    for (const nodes of nodesByFen.values()) {
      for (const node of nodes) {
        for (const child of node.children) {
          positionsThatAreChildren.add(child.fen);
        }
      }
    }

    const rootNodes = Array.from(nodesByFen.values())
      .flat()
      .filter((node) => !positionsThatAreChildren.has(node.fen));

    // Calculate move sequences by reconstructing the path from root to each node
    const calculateSequences = (
      node: LineNode,
      pathMoves: string[],
      isRoot: boolean,
    ) => {
      // Add opponent's move that led to this position (if any)
      const nodeMoves = [...pathMoves];
      if (node.opponentMove) {
        nodeMoves.push(node.opponentMove);
      }
      // Add this node's expected move
      nodeMoves.push(node.expectedMove);

      // For non-root nodes, only show the immediate moves (last 2: opponent move + user move)
      // For root nodes, show the full sequence
      if (isRoot) {
        node.moveSequence = formatMoveSequence(nodeMoves);
      } else {
        // Show only the last 2 moves: opponent's move and user's move
        const lastTwoMoves = nodeMoves.slice(-2);
        node.moveSequence = formatBranchMoveSequence(
          lastTwoMoves,
          nodeMoves.length,
        );
      }

      node.moveNumber = Math.ceil(nodeMoves.length / 2); // Move number is ceil(halfMoves / 2)

      // Recursively process children (not root anymore)
      for (const child of node.children) {
        calculateSequences(child, nodeMoves, false);
      }
    };

    // Start from root nodes with empty move sequence
    for (const rootNode of rootNodes) {
      rootNode.moveSequence = formatMoveSequence([rootNode.expectedMove]);
      rootNode.moveNumber = 1;

      // Process children, passing the user's first move
      for (const child of rootNode.children) {
        calculateSequences(child, [rootNode.expectedMove], false);
      }
    }

    const openings: Opening[] = rootNodes.map((root) => ({
      id: "opening-" + root.id,
      name: computeOpeningName(root),
      root,
    }));

    return NextResponse.json({ openings }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error fetching repertoires:", errorMessage);

    return NextResponse.json(
      { error: `Failed to fetch repertoires: ${errorMessage}` },
      { status: 500 },
    );
  }
}

/**
 * Format a move sequence with proper move numbers
 * Takes array of moves in UCI format ["e2e4", "c7c5", "f2f4"]
 * Returns formatted string like "1.e2e4 c7c5 2.f2f4"
 */
function formatMoveSequence(moves: string[]): string {
  if (moves.length === 0) {
    return "Initial Position";
  }

  const formatted: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    const isWhiteMove = i % 2 === 0;

    // Add move number only for white moves (even indices)
    if (isWhiteMove) {
      const moveNumber = Math.floor(i / 2) + 1;
      formatted.push(`${moveNumber}.${moves[i]}`);
    } else {
      formatted.push(moves[i]);
    }
  }

  return formatted.join(" ");
}

/**
 * Format a branch move sequence showing only immediate moves
 * Takes last 2 moves (opponent move + user move) and total path length
 * Returns formatted string like "... 2.c7c5 2.g1f3"
 * where the first move is the opponent's move and second is user's move
 */
function formatBranchMoveSequence(
  lastTwoMoves: string[],
  totalPathLength: number,
): string {
  if (lastTwoMoves.length < 2) {
    // Fallback if we don't have both moves
    return formatMoveSequence(lastTwoMoves);
  }

  const opponentMove = lastTwoMoves[0];
  const userMove = lastTwoMoves[1];

  // Calculate move numbers based on total path length
  // If totalPathLength = 2: moves are at indices 0-1, move number 1
  // If totalPathLength = 3: moves are at indices 1-2, move numbers 1 and 2
  // If totalPathLength = 4: moves are at indices 2-3, move number 2
  const opponentMoveIndex = totalPathLength - 2;
  const userMoveIndex = totalPathLength - 1;

  const opponentMoveNumber = Math.ceil((opponentMoveIndex + 1) / 2);
  const userMoveNumber = Math.ceil((userMoveIndex + 1) / 2);

  // Format with appropriate notation
  const isBlackMove = opponentMoveIndex % 2 === 1;
  const opponentMoveStr = `${opponentMoveNumber}.${opponentMove}`;

  return `${opponentMoveStr} ${userMoveNumber}.${userMove}`;
}

/**
 * Compute an opening name based on the opening moves
 */
function computeOpeningName(node: LineNode): string {
  const seq = node.moveSequence.toLowerCase();

  // Check for common openings
  if (seq.includes("e2e4")) {
    if (seq.includes("c7c5")) return "Sicilian Defense";
    if (seq.includes("e7e5")) return "Open Games (1. e4 e5)";
    return "1. e4 Openings";
  }
  if (seq.includes("d2d4")) {
    if (seq.includes("d7d5")) return "Queen's Gambit";
    if (seq.includes("g8f6")) return "1. d4 Nf6";
    return "1. d4 Openings";
  }
  if (seq.includes("c2c4")) return "English Opening";

  return "Opening Lines";
}
