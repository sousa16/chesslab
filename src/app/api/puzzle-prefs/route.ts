/**
 * Read/update the user's puzzle preferences.
 *
 * The shape changed in the adaptive-tactics migration: instead of a static
 * rating band the user picks a mode (auto / blocked / mixed) and the
 * server-side controller maintains the rating setpoint. The response also
 * exposes the global EWMA so the UI can render an "85% target" indicator.
 *
 * On first read, lazily provisions a row using the schema defaults, so the
 * client never has to special-case "no prefs yet".
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PUZZLE_CATEGORIES, type PuzzleCategory } from "@/lib/puzzleCategories";
import { isCanonicalMotif } from "@/lib/motifs";

type PrefsRow = Awaited<ReturnType<typeof getOrCreatePrefs>>;

async function getOrCreatePrefs(userId: string) {
  return prisma.userPuzzlePrefs.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

function serializePrefs(prefs: PrefsRow) {
  return {
    mode: prefs.mode,
    blockedFilterMotif: prefs.blockedFilterMotif,
    enabledCategories: prefs.enabledCategories,
    currentTargetRating: prefs.currentTargetRating,
    globalEwmaSuccess: prefs.globalEwmaSuccess,
    globalAttempts: prefs.globalAttempts,
    globalCorrect: prefs.globalCorrect,
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const prefs = await getOrCreatePrefs(session.user.id);
    return NextResponse.json(serializePrefs(prefs));
  } catch (err) {
    console.error("Error reading puzzle prefs:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json();
    const data: {
      mode?: string;
      blockedFilterMotif?: string | null;
      enabledCategories?: PuzzleCategory[];
    } = {};

    if (typeof body.mode === "string") {
      if (!["auto", "blocked", "mixed"].includes(body.mode)) {
        return NextResponse.json(
          { error: "mode must be 'auto', 'blocked' or 'mixed'" },
          { status: 400 },
        );
      }
      data.mode = body.mode;
    }
    if (body.blockedFilterMotif === null) {
      data.blockedFilterMotif = null;
    } else if (typeof body.blockedFilterMotif === "string") {
      if (!isCanonicalMotif(body.blockedFilterMotif)) {
        return NextResponse.json(
          { error: "blockedFilterMotif is not a canonical motif" },
          { status: 400 },
        );
      }
      data.blockedFilterMotif = body.blockedFilterMotif;
    }
    if (Array.isArray(body.enabledCategories)) {
      const valid = body.enabledCategories.filter((c: unknown): c is PuzzleCategory =>
        (PUZZLE_CATEGORIES as readonly string[]).includes(c as string),
      );
      if (valid.length === 0) {
        return NextResponse.json(
          { error: "At least one category must be enabled" },
          { status: 400 },
        );
      }
      data.enabledCategories = valid;
    }

    await getOrCreatePrefs(userId);
    const prefs = await prisma.userPuzzlePrefs.update({
      where: { userId },
      data,
    });
    return NextResponse.json(serializePrefs(prefs));
  } catch (err) {
    console.error("Error updating puzzle prefs:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
