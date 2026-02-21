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
  notes?: string;
  root: LineNode | null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Support both session.user.id and session.user.email for auth
    const userId = session?.user?.id;
    const userEmail = session?.user?.email;

    if (!userId && !userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const color = request.nextUrl.searchParams.get("color");

    if (!color || !["white", "black"].includes(color)) {
      return NextResponse.json(
        { error: "Invalid color: must be 'white' or 'black'" },
        { status: 400 },
      );
    }

    // If we have user ID, use it directly; otherwise look up by email
    let actualUserId = userId;
    if (!actualUserId && userEmail) {
      const user = await prisma.user.findUnique({
        where: { email: userEmail },
        select: { id: true },
      });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      actualUserId = user.id;
    }

    // Get the user's repertoire for this color with ALL entries
    const repertoire = await prisma.repertoire.findUnique({
      where: {
        userId_color: {
          userId: actualUserId!,
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

    // Build a single tree from all entries
    const entries = repertoire.entries;

    const nodesByEntryId = new Map<string, LineNode>();
    const nodesByFen = new Map<string, LineNode[]>();

    // First pass: create nodes for each position where user moves
    for (const entry of entries) {
      const node: LineNode = {
        id: entry.id,
        fen: entry.position.fen,
        expectedMove: entry.expectedMove,
        moveNumber: 0,
        moveSequence: "",
        children: [],
      };
      nodesByEntryId.set(entry.id, node);

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
        const foundChildren = new Set<string>();

        // Find saved positions reachable by opponent moves
        const testGameForMoves = new Chess(posAfterUserMove);
        const opponentMoves = testGameForMoves.moves({ verbose: true });

        for (const moveObj of opponentMoves) {
          const testGame = new Chess(posAfterUserMove);
          testGame.move(moveObj.san);
          const fensAfterOpponentMove = testGame.fen();

          const childNodes = nodesByFen.get(fensAfterOpponentMove);
          if (childNodes) {
            for (const childNode of childNodes) {
              if (!foundChildren.has(childNode.id)) {
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

    // Third pass: identify root nodes
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

    // Calculate move sequences
    const calculateSequences = (
      node: LineNode,
      pathMoves: string[],
      isRoot: boolean,
    ) => {
      const nodeMoves = [...pathMoves];
      if (node.opponentMove) {
        nodeMoves.push(node.opponentMove);
      }
      nodeMoves.push(node.expectedMove);

      // Always show the full move sequence, not just the last moves
      node.moveSequence = formatMoveSequence(nodeMoves);
      node.moveNumber = Math.ceil(nodeMoves.length / 2);

      for (const child of node.children) {
        calculateSequences(child, nodeMoves, false);
      }
    };

    for (const rootNode of rootNodes) {
      rootNode.moveSequence = formatMoveSequence([rootNode.expectedMove]);
      rootNode.moveNumber = 1;

      for (const child of rootNode.children) {
        calculateSequences(child, [rootNode.expectedMove], false);
      }
    }

    // If there are multiple root nodes, create a mega-root that contains them all
    let finalRoot: LineNode | null = null;
    if (rootNodes.length === 1) {
      finalRoot = rootNodes[0];
    } else if (rootNodes.length > 1) {
      // Create a virtual root node that contains all root variations
      finalRoot = {
        id: "virtual-root-" + repertoire.id,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", // Starting position
        expectedMove: "",
        moveNumber: 0,
        moveSequence: "Starting Position",
        children: rootNodes,
      };
    }

    // Return the tree directly - the root nodes are the openings
    return NextResponse.json({ root: finalRoot }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : "";
    console.error("Error fetching repertoires:", errorMessage);
    console.error("Stack trace:", errorStack);

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
