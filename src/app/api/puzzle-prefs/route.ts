/**
 * Read/update the user's puzzle preferences (rating band + enabled categories).
 *
 * On first read, lazily provisions a row using the schema defaults, so the
 * client never has to special-case "no prefs yet".
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PUZZLE_CATEGORIES, type PuzzleCategory } from "@/lib/puzzleCategories";

async function getOrCreatePrefs(userId: string) {
  return prisma.userPuzzlePrefs.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const prefs = await getOrCreatePrefs(user.id);
    return NextResponse.json({
      ratingMin: prefs.ratingMin,
      ratingMax: prefs.ratingMax,
      enabledCategories: prefs.enabledCategories,
    });
  } catch (err) {
    console.error("Error reading puzzle prefs:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const data: {
      ratingMin?: number;
      ratingMax?: number;
      enabledCategories?: PuzzleCategory[];
    } = {};

    if (typeof body.ratingMin === "number") {
      data.ratingMin = Math.max(400, Math.min(3000, body.ratingMin));
    }
    if (typeof body.ratingMax === "number") {
      data.ratingMax = Math.max(400, Math.min(3000, body.ratingMax));
    }
    if (
      data.ratingMin !== undefined &&
      data.ratingMax !== undefined &&
      data.ratingMin > data.ratingMax
    ) {
      return NextResponse.json(
        { error: "ratingMin must be <= ratingMax" },
        { status: 400 },
      );
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

    await getOrCreatePrefs(user.id);
    const prefs = await prisma.userPuzzlePrefs.update({
      where: { userId: user.id },
      data,
    });
    return NextResponse.json({
      ratingMin: prefs.ratingMin,
      ratingMax: prefs.ratingMax,
      enabledCategories: prefs.enabledCategories,
    });
  } catch (err) {
    console.error("Error updating puzzle prefs:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
