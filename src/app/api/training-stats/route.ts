/**
 * API route to get training statistics for the current user
 * Returns count of due cards and total positions (excluding first moves)
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Check if a position is a "first move" position that shouldn't be counted for training.
 */
function isFirstMovePosition(
  fen: string,
  repertoireColor: "White" | "Black",
): boolean {
  const parts = fen.split(" ");
  const sideToMove = parts[1];
  const fullmoveNumber = parseInt(parts[5], 10);

  if (repertoireColor === "White") {
    return fullmoveNumber === 1 && sideToMove === "w";
  } else {
    return fullmoveNumber === 1 && sideToMove === "b";
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        repertoires: {
          include: {
            entries: {
              include: {
                position: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const now = new Date();
    let dueCount = 0;
    let totalPositions = 0;

    // Per-color stats
    const colorStats = {
      white: { learned: 0, total: 0 },
      black: { learned: 0, total: 0 },
    };

    for (const repertoire of user.repertoires) {
      const colorKey = repertoire.color === "White" ? "white" : "black";

      for (const entry of repertoire.entries) {
        // Skip first move positions
        if (isFirstMovePosition(entry.position.fen, repertoire.color)) {
          continue;
        }

        totalPositions++;
        colorStats[colorKey].total++;

        // A position is "learned" if it has been reviewed at least once
        if (entry.repetitions > 0) {
          colorStats[colorKey].learned++;
        }

        if (new Date(entry.nextReviewDate) <= now) {
          dueCount++;
        }
      }
    }

    return NextResponse.json({
      dueCount,
      totalPositions,
      colorStats,
    });
  } catch (error) {
    console.error("Error fetching training stats:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
