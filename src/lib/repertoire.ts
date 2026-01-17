import { prisma } from "./prisma";

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

  return { created: toCreate.length, hasWhite: hasWhite || toCreate.some(r => r.color === "White"), hasBlack: hasBlack || toCreate.some(r => r.color === "Black") };
}

/**
 * Save an opening line to a user's repertoire.
 * 
 * This function implements the core save logic:
 * 1. For each move in the line, get the FEN before the move
 * 2. Create or reuse a Position (deduplicated by FEN)
 * 3. Create a RepertoireEntry linking the position to the expected move
 * 4. Initialize SRS fields for spaced repetition training
 */
export async function saveRepertoireLine(
  userId: string,
  repertoireColor: "white" | "black",
  moveHistory: string[], // FEN positions after each move (in order)
  movesInSan: string[], // Moves in SAN notation (e.g., ["e4", "c5", "Nf3"])
  movesInUci: string[] // Moves in UCI notation (e.g., ["e2e4", "c7c5", "g1f3"])
) {
  if (movesInSan.length === 0) {
    throw new Error("Cannot save empty line");
  }

  if (movesInSan.length !== movesInUci.length) {
    throw new Error("SAN and UCI move counts must match");
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
      `Repertoire not found for user ${userId} and color ${repertoireColor}`
    );
  }

  // We need to reconstruct the FEN before each move
  // moveHistory contains FENs AFTER each move
  // So we need to work backward or use chess.js to replay
  
  const Chess = require("chess.js").Chess;
  const game = new Chess();
  const fensBeforeMoves: string[] = [];

  // Collect FEN before each move
  for (let i = 0; i < movesInSan.length; i++) {
    fensBeforeMoves.push(game.fen());
    game.move(movesInSan[i]);
  }

  // Save each move as a separate entry
  for (let i = 0; i < movesInSan.length; i++) {
    const fenBefore = fensBeforeMoves[i];
    const uciMove = movesInUci[i];

    // Get or create position by FEN
    const position = await prisma.position.upsert({
      where: { fen: fenBefore },
      update: {}, // No update needed
      create: { fen: fenBefore },
    });

    // Create or update the repertoire entry
    // If it already exists, don't overwrite SRS data
    await prisma.repertoireEntry.upsert({
      where: {
        repertoireId_positionId: {
          repertoireId: repertoire.id,
          positionId: position.id,
        },
      },
      update: {}, // Don't modify if exists (preserve SRS)
      create: {
        repertoireId: repertoire.id,
        positionId: position.id,
        expectedMove: uciMove,
        interval: 0,
        easeFactor: 2.5,
        repetitions: 0,
        nextReviewDate: new Date(),
      },
    });
  }
}

/**
 * Convert SAN moves to UCI format using chess.js
 */
export function convertSanToUci(movesInSan: string[]): string[] {
  const Chess = require("chess.js").Chess;
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
