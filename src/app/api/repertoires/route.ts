import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { PieceColor, Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getCachedRepertoireTree,
  type CachedLineNode,
} from "@/lib/repertoireTreeCache";

// Tree-build for large repertoires can briefly spike CPU and Prisma's
// cold-connection latency adds another second or two — give the lambda
// enough headroom that a slow cold start doesn't 504 in front of users.
export const maxDuration = 60;

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

// max-age=0 forces every nav to ask the server, but the etag probe (two
// indexed queries against RepertoireEntry) is cheap and returns 304 when
// nothing changed. The previous max-age=30 had the browser serve stale
// local copies for 30s after writes, which hid newly-saved/deleted lines
// from the panel until the cache expired.
const CACHE_HEADER = "private, max-age=0, must-revalidate";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const color = request.nextUrl.searchParams.get("color");

    if (!color || !["white", "black"].includes(color)) {
      return NextResponse.json(
        { error: "Invalid color: must be 'white' or 'black'" },
        { status: 400 },
      );
    }

    const prismaColor: PieceColor =
      color === "white" ? PieceColor.White : PieceColor.Black;
    const entryFilter: Prisma.RepertoireEntryWhereInput = {
      repertoire: { userId, color: prismaColor },
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

    // Pull the cached tree (shape + opening names + display strings).
    // This bypasses the 4–5s buildRepertoireTree + anchorSansToStart +
    // lookupOpening per entry on a hot cache. The cache key is the
    // structure version (max createdAt + count), so SRS review writes
    // don't bust it — only adds/deletes do.
    //
    // The fresh `mastered` data is patched in below from a cheap
    // (id, phase) projection of the current entries.
    const cached = await getCachedRepertoireTree(userId, prismaColor);

    if (!cached.root) {
      return NextResponse.json(
        { openings: [] },
        { status: 200, headers: { etag, "Cache-Control": CACHE_HEADER } },
      );
    }

    const phaseRows = await prisma.repertoireEntry.findMany({
      where: entryFilter,
      select: { id: true, phase: true },
    });
    const masteredById = new Map<string, boolean>();
    for (const row of phaseRows) {
      masteredById.set(row.id, row.phase === "exponential");
    }

    const patchMastered = (node: CachedLineNode): LineNode => ({
      ...node,
      // Virtual roots and intermediate nodes default to false; per-entry
      // ids match real entries and pick up fresh phase data.
      mastered: masteredById.get(node.id) ?? false,
      children: node.children.map(patchMastered),
    });

    const finalRoot: LineNode = patchMastered(cached.root);

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

