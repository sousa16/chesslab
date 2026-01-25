import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Chess } from "chess.js";

/**
 * Find all descendant entry IDs by rebuilding the tree structure
 * and traversing from the given entry
 */
function findDescendantEntryIds(
  entryId: string,
  allEntries: Array<{
    id: string;
    positionId: string;
    expectedMove: string;
    position: { fen: string };
  }>,
): string[] {
  // Build tree structure same as repertoires API
  const nodesByFen = new Map<string, typeof allEntries>();

  for (const entry of allEntries) {
    if (!nodesByFen.has(entry.position.fen)) {
      nodesByFen.set(entry.position.fen, []);
    }
    nodesByFen.get(entry.position.fen)!.push(entry);
  }

  // Build parent -> children map
  const childrenMap = new Map<string, string[]>();

  for (const entries of nodesByFen.values()) {
    for (const parentEntry of entries) {
      // Make user's move
      const game = new Chess(parentEntry.position.fen);
      let moveResult = null;

      try {
        moveResult = game.move(parentEntry.expectedMove, { strict: false });
      } catch {
        continue;
      }

      if (!moveResult) continue;

      // After user's move, it's opponent's turn
      const posAfterUserMove = game.fen();

      // Find saved positions reachable by opponent moves
      const testGameForMoves = new Chess(posAfterUserMove);
      const opponentMoves = testGameForMoves.moves({ verbose: true });

      const children: string[] = [];

      for (const moveObj of opponentMoves) {
        const testGame = new Chess(posAfterUserMove);
        testGame.move(moveObj.san);
        const fenAfterOpponentMove = testGame.fen();

        // Check if this FEN has any saved positions
        const childEntries = nodesByFen.get(fenAfterOpponentMove);
        if (childEntries) {
          for (const childEntry of childEntries) {
            if (!children.includes(childEntry.id)) {
              children.push(childEntry.id);
            }
          }
        }
      }

      childrenMap.set(parentEntry.id, children);
    }
  }

  // Now traverse from entryId to find all descendants
  const descendants: string[] = [];
  const visited = new Set<string>();

  function collectDescendants(id: string) {
    if (visited.has(id)) return;
    visited.add(id);

    const children = childrenMap.get(id) || [];
    for (const childId of children) {
      descendants.push(childId);
      collectDescendants(childId);
    }
  }

  collectDescendants(entryId);

  return descendants;
}

/**
 * DELETE /api/repertoire-entries/[id]
 * Delete a repertoire entry and all its children (positions that follow from it)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        repertoires: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get the entry to delete
    const entry = await prisma.repertoireEntry.findUnique({
      where: { id },
      include: {
        repertoire: true,
        position: true,
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    // Verify the entry belongs to the user
    if (entry.repertoire.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get all entries in this repertoire to find descendants
    const allEntries = await prisma.repertoireEntry.findMany({
      where: { repertoireId: entry.repertoireId },
      include: { position: true },
    });

    // Find all descendant entries that should also be deleted
    const descendantIds = findDescendantEntryIds(id, allEntries);

    // Delete the entry and all its descendants
    const idsToDelete = [id, ...descendantIds];

    await prisma.repertoireEntry.deleteMany({
      where: {
        id: { in: idsToDelete },
      },
    });

    // Clean up orphaned positions (positions with no more entries)
    const orphanedPositions = await prisma.position.findMany({
      where: {
        repertoireEntries: {
          none: {},
        },
      },
    });

    if (orphanedPositions.length > 0) {
      await prisma.position.deleteMany({
        where: {
          id: {
            in: orphanedPositions.map((p) => p.id),
          },
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${idsToDelete.length} entry(s) successfully`,
      deletedCount: idsToDelete.length,
    });
  } catch (error) {
    console.error("Error deleting repertoire entry:", error);
    return NextResponse.json(
      { error: "Failed to delete entry" },
      { status: 500 },
    );
  }
}
