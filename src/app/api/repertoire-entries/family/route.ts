/**
 * DELETE /api/repertoire-entries/family
 *
 * Bulk-delete every entry whose computed ECO family matches the given
 * name (e.g. "Caro-Kann Defense") within the user's repertoire of the
 * given color. Mirrors the per-line delete UX one level up — same
 * confirmation/refresh pattern, but acts on a whole opening family.
 *
 * Body: { color: "white" | "black", family: string }
 */
import { NextRequest, NextResponse, after } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lookupOpening } from "@/lib/openings";
import { anchorSansToStart, buildRepertoireTree } from "@/lib/repertoireTree";
import { recomputeRepertoireLeaves } from "@/lib/repertoireLeaves";

const UNFAMILIED_LABEL = "Other Lines";

function familyOf(openingName: string | null): string {
  if (!openingName) return UNFAMILIED_LABEL;
  const colon = openingName.indexOf(":");
  return colon === -1 ? openingName : openingName.slice(0, colon).trim();
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const color = body?.color;
    const family = typeof body?.family === "string" ? body.family.trim() : "";

    if (color !== "white" && color !== "black") {
      return NextResponse.json(
        { error: "Invalid color: must be 'white' or 'black'" },
        { status: 400 },
      );
    }
    if (!family) {
      return NextResponse.json(
        { error: "Missing family name" },
        { status: 400 },
      );
    }
    // Refuse the umbrella bucket — it's not a real family, just the
    // unnamed entries fallback. Deleting it would feel like a footgun.
    if (family === UNFAMILIED_LABEL) {
      return NextResponse.json(
        { error: "Cannot bulk-delete the 'Other Lines' bucket" },
        { status: 400 },
      );
    }

    const repertoire = await prisma.repertoire.findUnique({
      where: {
        userId_color: {
          userId: session.user.id,
          color: color === "white" ? "White" : "Black",
        },
      },
      select: {
        id: true,
        color: true,
        entries: {
          select: {
            id: true,
            expectedMove: true,
            position: { select: { fen: true } },
          },
        },
      },
    });
    if (!repertoire) {
      return NextResponse.json(
        { error: "Repertoire not found" },
        { status: 404 },
      );
    }

    // Compute family per LEAF only (the user-visible "line"), then walk
    // back up to include every interior ancestor whose leaf-descendants
    // are all in this family.
    //
    // Why we don't classify interior entries directly: ECO lookup on a
    // shallower path can land on a generic name (e.g. "Queen's Pawn Game")
    // even though every leaf below it is in a more specific family (e.g.
    // "Caro-Kann Defense"). The LineTree groups by LEAF family — so
    // delete must match the same set.
    const { roots, byEntryId } = buildRepertoireTree(
      repertoire.entries,
      repertoire.color,
    );

    // The full anchored path (= path-to-position + the user's own move at
    // that position) is what ECO matches most accurately. anchored alone
    // drops the leaf's final move; we glue it back the same way the
    // /api/repertoires display path does.
    const familyOfNode = (
      node: ReturnType<typeof byEntryId.get>,
    ): string => {
      if (!node) return UNFAMILIED_LABEL;
      const anchored = anchorSansToStart(
        node.sanMoves,
        node.fen,
        node.rootFen,
      );
      const userMove = node.sanMoves[node.sanMoves.length - 1];
      const lookupSans =
        anchored.length > 0 && userMove
          ? [...anchored, userMove]
          : node.sanMoves;
      const match = lookupOpening(lookupSans);
      return familyOf(match?.name ?? null);
    };

    // Walk down: classify each leaf; for interior nodes, mark them iff
    // EVERY leaf-descendant is in the target family. This way we don't
    // strand a parent entry whose specific-leaf children we're about to
    // remove.
    const idsToDelete = new Set<string>();
    type Node = (typeof roots)[number];
    const collect = (
      node: Node,
    ): { allInFamily: boolean; hasAnyLeaf: boolean } => {
      if (node.children.length === 0) {
        const inFam = familyOfNode(node) === family;
        if (inFam) idsToDelete.add(node.id);
        return { allInFamily: inFam, hasAnyLeaf: true };
      }
      let allInFamily = true;
      let hasAnyLeaf = false;
      for (const child of node.children) {
        const r = collect(child);
        if (r.hasAnyLeaf) hasAnyLeaf = true;
        if (!r.allInFamily) allInFamily = false;
      }
      if (hasAnyLeaf && allInFamily) {
        idsToDelete.add(node.id);
      }
      return { allInFamily, hasAnyLeaf };
    };
    for (const root of roots) collect(root);

    if (idsToDelete.size === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        message: "No entries matched that family",
      });
    }

    const result = await prisma.repertoireEntry.deleteMany({
      where: { id: { in: Array.from(idsToDelete) } },
    });

    // Sweep orphaned positions (no entries refer to them any more).
    const orphaned = await prisma.position.findMany({
      where: { repertoireEntries: { none: {} } },
      select: { id: true },
    });
    if (orphaned.length > 0) {
      await prisma.position.deleteMany({
        where: { id: { in: orphaned.map((p) => p.id) } },
      });
    }

    // Surviving siblings/parents may have become leaves now. Deferred
    // outside the response so the UI's post-delete refetch doesn't race.
    const repertoireId = repertoire.id;
    after(async () => {
      try {
        await recomputeRepertoireLeaves(repertoireId);
      } catch (err) {
        console.error(
          "Failed to recompute isLeaf after delete-family:",
          err,
        );
      }
    });

    return NextResponse.json({ success: true, deletedCount: result.count });
  } catch (error) {
    console.error("Error deleting family:", error);
    return NextResponse.json(
      { error: "Failed to delete family" },
      { status: 500 },
    );
  }
}
