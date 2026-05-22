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

    // Compute the family for every entry the same way the stats page and
    // sidebar do: replay SAN path from start, then ECO lookup. Anything
    // matching the target family is queued for deletion.
    const { byEntryId } = buildRepertoireTree(
      repertoire.entries,
      repertoire.color,
    );
    const idsToDelete: string[] = [];
    for (const entry of repertoire.entries) {
      const node = byEntryId.get(entry.id);
      const sans = node?.sanMoves ?? [];
      const rootFen = node?.rootFen ?? entry.position.fen;
      const anchored = anchorSansToStart(sans, entry.position.fen, rootFen);
      const lookupSans = anchored.length > 0 ? anchored : sans;
      const match = lookupOpening(lookupSans);
      if (familyOf(match?.name ?? null) === family) {
        idsToDelete.push(entry.id);
      }
    }

    if (idsToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        message: "No entries matched that family",
      });
    }

    const result = await prisma.repertoireEntry.deleteMany({
      where: { id: { in: idsToDelete } },
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
