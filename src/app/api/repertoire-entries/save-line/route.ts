import { NextRequest, NextResponse, after } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  saveRepertoireLine,
  convertSanToUci,
  ensureUserRepertoires,
} from "@/lib/repertoire";
import { recomputeRepertoireLeaves } from "@/lib/repertoireLeaves";

export const maxDuration = 60;

/**
 * POST /api/repertoire-entries/save-line
 *
 * Saves an opening line to a user's repertoire.
 *
 * Request body:
 * {
 *   color: "white" | "black",
 *   movesInSan: string[], // e.g., ["e4", "c5", "Nf3", "d6"]
 * }
 *
 * Response: { success: true, entriesCreated: number }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { color, movesInSan } = body;

    if (!color || !["white", "black"].includes(color)) {
      return NextResponse.json(
        { error: "Invalid color: must be 'white' or 'black'" },
        { status: 400 },
      );
    }

    if (!Array.isArray(movesInSan) || movesInSan.length === 0) {
      return NextResponse.json(
        { error: "movesInSan must be a non-empty array" },
        { status: 400 },
      );
    }

    // Ensure user has repertoires
    await ensureUserRepertoires(session.user.id);

    // Convert SAN to UCI
    let movesInUci: string[];
    try {
      movesInUci = convertSanToUci(movesInSan);
    } catch (error) {
      return NextResponse.json(
        { error: `Invalid move sequence: ${(error as Error).message}` },
        { status: 400 },
      );
    }

    // Save the line and get how many new entries were created
    const { entriesCreated, repertoireId } = await saveRepertoireLine(
      session.user.id,
      color,
      [],
      movesInSan,
      movesInUci,
    );

    // Re-stamp isLeaf for every entry in this repertoire. New entries
    // default to true; existing ones may have just become interior nodes
    // (a new child below them was inserted). Deferred with `after()` so
    // the response returns the moment the line is committed — the
    // RepertoirePanel that mounts on the post-save nav doesn't have to
    // race with this denormalization step. The backfill script can
    // repair drift if a deferred recompute fails.
    if (entriesCreated > 0) {
      after(async () => {
        try {
          await recomputeRepertoireLeaves(repertoireId);
        } catch (err) {
          console.error(
            "Failed to recompute isLeaf after save-line:",
            err,
          );
        }
      });
    }

    return NextResponse.json(
      {
        success: true,
        entriesCreated,
      },
      { status: 201 },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error saving line:", errorMessage);

    if (errorMessage.includes("Repertoire not found")) {
      return NextResponse.json(
        {
          error: "Repertoire not found. Please create a repertoire first.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: `Failed to save line: ${errorMessage}` },
      { status: 500 },
    );
  }
}
