import { prisma } from "./prisma";
import { Chess } from "chess.js";

/**
 * Ensure a user has repertoires for both colors.
 * Creates them if they don't exist.
 */
export async function ensureUserRepertoires(userId: string) {
  const existing = await prisma.repertoire.findMany({
    where: { userId },
  });

  const hasWhite = existing.some((r) => r.color === "White");
  const hasBlack = existing.some((r) => r.color === "Black");

  const toCreate = [];
  if (!hasWhite) {
    toCreate.push({ userId, color: "White" as const });
  }
  if (!hasBlack) {
    toCreate.push({ userId, color: "Black" as const });
  }

  if (toCreate.length > 0) {
    await prisma.repertoire.createMany({ data: toCreate });
  }

  return {
    created: toCreate.length,
    hasWhite: hasWhite || toCreate.some((r) => r.color === "White"),
    hasBlack: hasBlack || toCreate.some((r) => r.color === "Black"),
  };
}

/**
 * Save an opening line to a user's repertoire.
 *
 * This function implements the core save logic:
 * 1. Play through the moves and find positions where it's the USER's turn
 * 2. For each such position, the expectedMove is the user's next move
 * 3. Create or reuse a Position (deduplicated by FEN)
 * 4. Create a RepertoireEntry linking the position to the expected move
 * 5. Initialize SRS fields for spaced repetition training
 */
export async function saveRepertoireLine(
  userId: string,
  repertoireColor: "white" | "black",
  moveHistory: string[], // FEN positions after each move (in order)
  movesInSan: string[], // Moves in SAN notation (e.g., ["e4", "c5", "Nf3"])
  movesInUci: string[], // Moves in UCI notation (e.g., ["e2e4", "c7c5", "g1f3"])
): Promise<number> {
  if (movesInSan.length === 0) {
    throw new Error("Cannot save empty line");
  }

  if (movesInSan.length !== movesInUci.length) {
    throw new Error("SAN and UCI move counts must match");
  }

  // Validate that the last move belongs to the user
  // In chess, move indices: 0=White, 1=Black, 2=White, 3=Black, etc.
  // White repertoire needs odd length (last move is White's)
  // Black repertoire needs even length (last move is Black's)
  const isWhiteRepertoire = repertoireColor === "white";
  const lastMoveIsWhite = (movesInSan.length - 1) % 2 === 0; // 0-indexed

  if (isWhiteRepertoire && !lastMoveIsWhite) {
    throw new Error(
      "White repertoire lines must end with a White move. Last move is from opponent.",
    );
  }

  if (!isWhiteRepertoire && lastMoveIsWhite) {
    throw new Error(
      "Black repertoire lines must end with a Black move. Last move is from opponent.",
    );
  }

  // Get or create the repertoire for this user and color
  const repertoire = await prisma.repertoire.findUnique({
    where: {
      userId_color: {
        userId,
        color: repertoireColor === "white" ? "White" : "Black",
      },
    },
  });

  if (!repertoire) {
    throw new Error(
      `Repertoire not found for user ${userId} and color ${repertoireColor}`,
    );
  }

  // Create a new opening for each line saved
  // This ensures each saved line is a separate, independent entry
  const newOpening = await prisma.opening.create({
    data: {
      repertoireId: repertoire.id,
      name: "Opening Line",
    },
  });
  const openingId = newOpening.id;

  const game = new Chess();
  const fensBeforeMoves: string[] = [];

  // Collect FEN before each move
  for (let i = 0; i < movesInSan.length; i++) {
    fensBeforeMoves.push(game.fen());
    game.move(movesInSan[i]);
  }

  // Save only positions where it's the USER's turn to move
  // For White repertoire: save positions before White's moves (even indices: 0, 2, 4...)
  // For Black repertoire: save positions before Black's moves (odd indices: 1, 3, 5...)
  let createdCount = 0;

  for (let i = 0; i < movesInSan.length; i++) {
    const isWhiteMove = i % 2 === 0; // 0, 2, 4... are White's moves

    // Only save if this move belongs to the user
    if (isWhiteRepertoire && !isWhiteMove) continue; // Skip Black's moves for White repertoire
    if (!isWhiteRepertoire && isWhiteMove) continue; // Skip White's moves for Black repertoire

    const fenBefore = fensBeforeMoves[i];
    const uciMove = movesInUci[i];

    // Get or create position by FEN
    const position = await prisma.position.upsert({
      where: { fen: fenBefore },
      update: {}, // No update needed
      create: { fen: fenBefore },
    });

    // Check if an entry already exists for this repertoire/position/expectedMove
    const existingEntry = await prisma.repertoireEntry.findUnique({
      where: {
        repertoireId_positionId_expectedMove: {
          repertoireId: repertoire.id,
          positionId: position.id,
          expectedMove: uciMove,
        },
      },
    });

    if (!existingEntry) {
      await prisma.repertoireEntry.create({
        data: {
          repertoireId: repertoire.id,
          openingId: openingId,
          positionId: position.id,
          expectedMove: uciMove,
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          nextReviewDate: new Date(),
        },
      });
      createdCount++;
    }
  }

  return createdCount;
}

/**
 * Convert SAN moves to UCI format using chess.js
 */
export function convertSanToUci(movesInSan: string[]): string[] {
  const game = new Chess();
  const uciMoves: string[] = [];

  for (const sanMove of movesInSan) {
    const move = game.move(sanMove);
    if (!move) {
      throw new Error(`Invalid move: ${sanMove}`);
    }
    uciMoves.push(`${move.from}${move.to}${move.promotion || ""}`);
  }

  return uciMoves;
}
