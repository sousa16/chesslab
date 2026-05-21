import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { PieceColor, Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lookupOpening } from "@/lib/openings";
import { anchorSansToStart, buildRepertoireTree } from "@/lib/repertoireTree";

/**
 * GET /api/repertoires?color=white|black
 *
 * Fetches all openings for a user's repertoire of a specific color.
 * Returns opening lines as a hierarchical tree with move numbers and full
 * SAN sequences.
 *
 * Caching: the repertoire structure only changes when the user adds, edits
 * or reviews an entry, so the response carries an ETag keyed on
 * (max(updatedAt), count) of this color's entries. Revisits return 304
 * with no body and skip the tree-build entirely.
 */

interface LineNode {
  id: string;
  fen: string;
  expectedMove: string;
  moveNumber: number;
  displaySequence: string;
  sanMoves: string[];
  openingName: string | null;
  openingEco: string | null;
  children: LineNode[];
  opponentMove?: string;
  mastered?: boolean;
}

const CACHE_HEADER = "private, max-age=30, stale-while-revalidate=60";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

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

    const prismaColor: PieceColor =
      color === "white" ? PieceColor.White : PieceColor.Black;
    const entryFilter: Prisma.RepertoireEntryWhereInput = {
      repertoire: { userId: actualUserId!, color: prismaColor },
    };

    // Cheap conditional-request probe. Two indexed lookups on
    // RepertoireEntry — far cheaper than the tree-build and full payload.
    // Including the entry count covers deletions, which don't bump
    // updatedAt on the surviving rows.
    const [latest, count] = await Promise.all([
      prisma.repertoireEntry.findFirst({
        where: entryFilter,
        select: { updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.repertoireEntry.count({ where: entryFilter }),
    ]);
    const etag = `W/"${latest?.updatedAt.getTime() ?? 0}-${count}"`;

    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { etag, "Cache-Control": CACHE_HEADER },
      });
    }

    // Trimmed select: the tree-build needs id, expectedMove, position.fen;
    // the route itself needs phase to compute the "mastered" flag. Pulling
    // the full Position row was shipping createdAt + id over the wire on
    // every entry for no consumer.
    const repertoire = await prisma.repertoire.findUnique({
      where: {
        userId_color: { userId: actualUserId!, color: prismaColor },
      },
      select: {
        id: true,
        color: true,
        entries: {
          select: {
            id: true,
            expectedMove: true,
            phase: true,
            position: { select: { fen: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!repertoire || repertoire.entries.length === 0) {
      return NextResponse.json(
        { openings: [] },
        { status: 200, headers: { etag, "Cache-Control": CACHE_HEADER } },
      );
    }

    const { roots: builtRoots, byEntryId: builtById } = buildRepertoireTree(
      repertoire.entries,
      repertoire.color,
    );

    const masteredById = new Map<string, boolean>();
    for (const entry of repertoire.entries) {
      masteredById.set(entry.id, entry.phase === "exponential");
    }

    const decorate = (built: (typeof builtRoots)[number]): LineNode => {
      // Anchor the SAN list at the standard starting position before
      // looking up the opening name, so a mid-game-rooted tree (e.g., a
      // Caro-Kann sub-tree without an entry at "after 1.e4 c6") gets
      // named "Caro-Kann Defense" rather than "Queen's Pawn Game".
      const anchoredSans = anchorSansToStart(
        built.sanMoves,
        built.fen,
        built.rootFen,
      );
      const displaySans =
        anchoredSans.length > 0 ? anchoredSans : built.sanMoves;
      const match = lookupOpening(displaySans);
      return {
        id: built.id,
        fen: built.fen,
        expectedMove: built.expectedMove,
        moveNumber: Math.ceil(displaySans.length / 2),
        displaySequence: formatSanSequence(displaySans),
        sanMoves: displaySans,
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

    void builtById;

    return NextResponse.json(
      { root: finalRoot },
      { status: 200, headers: { etag, "Cache-Control": CACHE_HEADER } },
    );
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
