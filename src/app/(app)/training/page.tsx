import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TrainingClient from "@/components/TrainingClient";

interface TrainingPageProps {
  searchParams: Promise<{
    color?: string;
    opening?: string;
    line?: string;
    mode?: string;
    fen?: string;
  }>;
}

/**
 * Check if a position is a "first move" position that shouldn't be trained.
 * - White's first move: from starting position (fullmove 1, White to move)
 * - Black's first move: after White's first move (fullmove 1, Black to move)
 *
 * FEN format: "position w/b castling en-passant halfmove fullmove"
 * We check: fullmove === 1
 */
function isFirstMovePosition(
  fen: string,
  repertoireColor: "White" | "Black",
): boolean {
  const parts = fen.split(" ");
  const sideToMove = parts[1]; // 'w' or 'b'
  const fullmoveNumber = parseInt(parts[5], 10); // fullmove counter

  if (repertoireColor === "White") {
    // White's first move is from fullmove 1 with White to move
    return fullmoveNumber === 1 && sideToMove === "w";
  } else {
    // Black's first move is from fullmove 1 with Black to move
    return fullmoveNumber === 1 && sideToMove === "b";
  }
}

export default async function TrainingPage({
  searchParams,
}: TrainingPageProps) {
  const session = await getServerSession(authOptions);
  const params = await searchParams;

  if (!session?.user?.email) {
    return <div>Please sign in to access training</div>;
  }

  // Determine mode: "review" (due cards, affects SRS) or "practice" (all cards, no SRS)
  const mode = params.mode === "practice" ? "practice" : "review";

  // Determine color filter (if any)
  const colorFilter =
    params.color === "white" || params.color === "black" ? params.color : null;

  // Optional FEN filter for line-specific practice
  const fenFilter = params.fen ? decodeURIComponent(params.fen) : null;

  // Get user's repertoires with optional color filtering
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      repertoires: {
        where: colorFilter
          ? {
              color: colorFilter === "white" ? "White" : "Black",
            }
          : undefined,
        include: {
          entries: {
            include: {
              position: true,
            },
            where:
              mode === "review"
                ? {
                    nextReviewDate: {
                      lte: new Date(), // Due for review
                    },
                  }
                : undefined, // In practice mode, get all entries
            orderBy: {
              nextReviewDate: "asc",
            },
          },
        },
      },
    },
  });

  if (!user) {
    return <div>User not found</div>;
  }

  // Filter out first-move positions from training (they're predetermined choices, not recalls)
  // Also filter by FEN if doing line-specific practice
  const userWithFilteredEntries = {
    ...user,
    repertoires: user.repertoires.map((repertoire) => ({
      ...repertoire,
      entries: repertoire.entries.filter((entry) => {
        // Skip first move positions
        if (isFirstMovePosition(entry.position.fen, repertoire.color)) {
          return false;
        }

        // If FEN filter is set, only include positions that come after that FEN in the line
        // This is tricky - we need to check if this position is reachable from the given FEN
        // For now, we'll use a simpler approach: the FEN filter should be the starting position
        // and we include all positions (the tree structure will handle the rest)
        if (fenFilter) {
          // Include all positions for now - the line-specific filtering
          // should be done by the API that builds the tree
          return true;
        }

        return true;
      }),
    })),
  };

  return <TrainingClient user={userWithFilteredEntries} mode={mode} />;
}
