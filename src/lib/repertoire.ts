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
 *
 * Performance: all DB work is batched inside a single transaction —
 * positions are upserted in parallel, existing entries are fetched in
 * one query, and new entries are bulk-inserted with createMany.
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

  // Compute FENs before each user move (CPU-only, no DB calls)
  const game = new Chess();
  const userMoves: { fen: string; uci: string }[] = [];

  for (let i = 0; i < movesInSan.length; i++) {
    const fen = game.fen();
    const isWhiteMove = i % 2 === 0; // 0, 2, 4... are White's moves

    if (
      (isWhiteRepertoire && isWhiteMove) ||
      (!isWhiteRepertoire && !isWhiteMove)
    ) {
      userMoves.push({ fen, uci: movesInUci[i] });
    }

    game.move(movesInSan[i]);
  }

  // Run all DB work in a single transaction
  return prisma.$transaction(async (tx) => {
    // Fetch the repertoire
    const repertoire = await tx.repertoire.findUnique({
      where: {
        userId_color: {
          userId,
          color: isWhiteRepertoire ? "White" : "Black",
        },
      },
    });

    if (!repertoire) {
      throw new Error(
        `Repertoire not found for user ${userId} and color ${repertoireColor}`,
      );
    }

    // Create a new opening for this line
    const newOpening = await tx.opening.create({
      data: {
        repertoireId: repertoire.id,
        name: "Opening Line",
      },
    });

    // Upsert all positions in parallel (one round-trip each, but concurrent)
    const positions = await Promise.all(
      userMoves.map(({ fen }) =>
        tx.position.upsert({
          where: { fen },
          update: {},
          create: { fen },
        }),
      ),
    );

    // Fetch all existing entries for these positions in a single query
    const positionIds = positions.map((p) => p.id);
    const existingEntries = await tx.repertoireEntry.findMany({
      where: {
        repertoireId: repertoire.id,
        positionId: { in: positionIds },
      },
      select: { positionId: true, expectedMove: true },
    });

    const existingSet = new Set(
      existingEntries.map((e) => `${e.positionId}:${e.expectedMove}`),
    );

    // Bulk-insert all new entries in a single query
    const toCreate = userMoves
      .map(({ uci }, idx) => ({ position: positions[idx], uci }))
      .filter(({ position, uci }) => !existingSet.has(`${position.id}:${uci}`))
      .map(({ position, uci }) => ({
        repertoireId: repertoire.id,
        openingId: newOpening.id,
        positionId: position.id,
        expectedMove: uci,
        interval: 0,
        easeFactor: 2.5,
        repetitions: 0,
        nextReviewDate: new Date(),
      }));

    if (toCreate.length > 0) {
      await tx.repertoireEntry.createMany({ data: toCreate });
    }

    return toCreate.length;
  });
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
