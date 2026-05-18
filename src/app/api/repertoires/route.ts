import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lookupOpening } from "@/lib/openings";
import { buildRepertoireTree } from "@/lib/repertoireTree";

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
  expectedMove: string; // UCI format — kept for training/SRS callers
  moveNumber: number;
  // Display string in standard algebraic notation, e.g. "1.e4 c5 2.Nf3".
  displaySequence: string;
  // Raw SAN moves leading to this node (e.g. ["e4","c5","Nf3"]). Used by
  // the build flow and "Play this line on the board" interactions; the
  // board API consumes SAN directly.
  sanMoves: string[];
  // Longest-prefix-matched ECO opening (e.g. "Sicilian Defense: Najdorf").
  // Null if no named opening matches a prefix of sanMoves.
  openingName: string | null;
  openingEco: string | null;
  children: LineNode[];
  opponentMove?: string; // UCI — only used internally during tree construction
  // True when SRS has graduated this entry out of the initial learning
  // phase. "Practiced once" still leaves the card in `learning` and
  // shouldn't count as mastered; only `exponential` means the user has
  // hit the card right enough times in a row that the algorithm has
  // promoted it to long-interval spaced repetition.
  mastered?: boolean;
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

    // Tree-build + SAN computation lives in a shared helper so that
    // /api/repertoires and /(app)/training/page.tsx see identical paths
    // and therefore identical opening names.
    const { roots: builtRoots, byEntryId: builtById } = buildRepertoireTree(
      repertoire.entries,
      repertoire.color,
    );

    // Decorate the structural tree with display fields and opening matches.
    // "Mastered" = SRS has promoted this card to the exponential phase
    // (i.e. you've gotten it right enough times in a row that intervals
    // are now multi-day, not initial-learning steps).
    const masteredById = new Map<string, boolean>();
    for (const entry of repertoire.entries) {
      masteredById.set(entry.id, entry.phase === "exponential");
    }

    const decorate = (built: (typeof builtRoots)[number]): LineNode => {
      const match = lookupOpening(built.sanMoves);
      return {
        id: built.id,
        fen: built.fen,
        expectedMove: built.expectedMove,
        moveNumber: Math.ceil(built.sanMoves.length / 2),
        displaySequence: formatSanSequence(built.sanMoves),
        sanMoves: built.sanMoves,
        openingName: match?.name ?? null,
        openingEco: match?.eco ?? null,
        children: built.children.map(decorate),
        opponentMove: built.opponentMove,
        mastered: masteredById.get(built.id) ?? false,
      };
    };

    const rootNodes = builtRoots.map(decorate);

    let finalRoot: LineNode | null = null;
    if (rootNodes.length === 1) {
      finalRoot = rootNodes[0];
    } else if (rootNodes.length > 1) {
      finalRoot = {
        id: "virtual-root-" + repertoire.id,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        expectedMove: "",
        moveNumber: 0,
        displaySequence: "Starting Position",
        sanMoves: [],
        openingName: null,
        openingEco: null,
        children: rootNodes,
      };
    }

    // Avoid an unused-warning for `builtById` — we don't need it here, but the
    // shared helper returns it for other callers (e.g. training enrichment).
    void builtById;

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
 * Format an array of SAN moves with PGN-style move numbers.
 * Input is in plain SAN, e.g. ["e4", "c5", "Nf3"] -> "1.e4 c5 2.Nf3".
 */
function formatSanSequence(moves: string[]): string {
  if (moves.length === 0) {
    return "Initial Position";
  }

  const parts: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) {
      parts.push(`${Math.floor(i / 2) + 1}.${moves[i]}`);
    } else {
      parts.push(moves[i]);
    }
  }

  return parts.join(" ");
}
