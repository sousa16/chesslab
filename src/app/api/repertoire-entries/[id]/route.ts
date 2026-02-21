import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * PATCH /api/repertoire-entries/[id]
 * Update a repertoire entry (name, notes)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, notes } = body;

    // Find the entry and verify ownership
    const entry = await prisma.repertoireEntry.findUnique({
      where: { id },
      include: {
        repertoire: true,
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (entry.repertoire.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Update the entry
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (notes !== undefined) updateData.notes = notes;
    
    const updatedEntry = await prisma.repertoireEntry.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ entry: updatedEntry });
  } catch (error) {
    console.error("Error updating repertoire entry:", error);
    return NextResponse.json(
      { error: "Failed to update entry" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/repertoire-entries/[id]
 * Delete a repertoire entry and optionally its children
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { id } = await params;

    // Find the entry and verify ownership
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

    if (entry.repertoire.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get all entries for this repertoire to build the tree
    const allEntries = await prisma.repertoireEntry.findMany({
      where: {
        repertoireId: entry.repertoireId,
      },
      include: {
        position: true,
        repertoire: true,
      },
    });

    // Build a map of FEN -> entries at that position
    const fenToEntries = new Map<string, typeof allEntries>();
    allEntries.forEach((e) => {
      const entries = fenToEntries.get(e.position.fen) || [];
      entries.push(e);
      fenToEntries.set(e.position.fen, entries);
    });

    // Build the descendant tree using Chess.js
    const entriesToDelete = new Set<string>([id]);
    const queue = [entry];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentFen = current.position.fen;

      // Use chess.js to find the next position
      const { Chess } = await import("chess.js");
      const game = new Chess(currentFen);

      // Try to make the expected move
      try {
        game.move(current.expectedMove);
        
        // Get all possible opponent responses
        const opponentMoves = game.moves({ verbose: true });
        
        // For each opponent response, check if we have entries at that position
        for (const opponentMove of opponentMoves) {
          const afterOpponentMove = new Chess(game.fen());
          afterOpponentMove.move(opponentMove);
          const afterOpponentFen = afterOpponentMove.fen();
          
          // Find all entries at this position (after user move + opponent response)
          const childEntries = fenToEntries.get(afterOpponentFen) || [];
          for (const child of childEntries) {
            if (!entriesToDelete.has(child.id)) {
              entriesToDelete.add(child.id);
              queue.push(child);
            }
          }
        }
      } catch {
        // Invalid move, no children
      }
    }

    // Delete all entries in the tree
    const result = await prisma.repertoireEntry.deleteMany({
      where: {
        id: {
          in: Array.from(entriesToDelete),
        },
      },
    });

    // Clean up orphaned positions
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

    return NextResponse.json({ success: true, deletedCount: result.count });
  } catch (error) {
    console.error("Error deleting repertoire entry:", error);
    return NextResponse.json(
      { error: "Failed to delete entry" },
      { status: 500 }
    );
  }
}
