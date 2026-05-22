import { NextRequest, NextResponse, after } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildRepertoireTree } from "@/lib/repertoireTree";
import { recomputeRepertoireLeaves } from "@/lib/repertoireLeaves";
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

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    if (entry.repertoire.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Build the full repertoire tree so we can walk both DOWN (descendants
    // of the clicked entry — always part of this line) and UP (ancestors
    // that exist only to feed this line, with no other forks). Without the
    // up-walk a user has to click "delete" once per ply to remove a saved
    // line, because each click would remove only the leaf.
    const allEntries = await prisma.repertoireEntry.findMany({
      where: { repertoireId: entry.repertoireId },
      select: {
        id: true,
        expectedMove: true,
        position: { select: { fen: true } },
      },
    });

    const { roots, byEntryId } = buildRepertoireTree(
      allEntries,
      entry.repertoire.color,
    );

    const entriesToDelete = new Set<string>();
    const startNode = byEntryId.get(id);

    if (!startNode) {
      // Tree-build couldn't place this entry (e.g. orphan with no valid
      // moves). Fall back to single-row delete; nothing else can be
      // certainly part of "this line".
      entriesToDelete.add(id);
    } else {
      // 1) DOWN walk — everything reachable from this node along the tree
      // is deleted along with it.
      const collectDescendants = (node: typeof startNode) => {
        if (entriesToDelete.has(node.id)) return;
        entriesToDelete.add(node.id);
        for (const child of node.children) collectDescendants(child);
      };
      collectDescendants(startNode);

      // 2) UP walk — derive parent links from the tree, then climb until
      // we hit a fork (an ancestor whose other children survive).
      const parentOf = new Map<string, string>();
      const buildParentMap = (node: typeof startNode) => {
        for (const child of node.children) {
          parentOf.set(child.id, node.id);
          buildParentMap(child);
        }
      };
      for (const root of roots) buildParentMap(root);

      let cursor: string = startNode.id;
      // Bounded by tree depth — every iteration moves strictly upward.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const parentId = parentOf.get(cursor);
        if (!parentId) break;
        const parentNode = byEntryId.get(parentId);
        if (!parentNode) break;
        const allInSet = parentNode.children.every((c) =>
          entriesToDelete.has(c.id),
        );
        if (!allInSet) break;
        entriesToDelete.add(parentId);
        cursor = parentId;
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

    // Surviving parent entries in the same repertoire may have just
    // become leaves (the deleted subtree was their only child).
    // Deferred with `after()` so the response returns the moment the
    // delete is committed — the UI's post-delete refetch doesn't have
    // to race with this denormalization step.
    after(async () => {
      try {
        await recomputeRepertoireLeaves(entry.repertoireId);
      } catch (err) {
        console.error(
          "Failed to recompute isLeaf after delete-entry:",
          err,
        );
      }
    });

    return NextResponse.json({ success: true, deletedCount: result.count });
  } catch (error) {
    console.error("Error deleting repertoire entry:", error);
    return NextResponse.json(
      { error: "Failed to delete entry" },
      { status: 500 }
    );
  }
}
