import { Chess } from "chess.js";

/**
 * Convert SAN moves to UCI format. Pure chess.js — kept separate from
 * src/lib/repertoire.ts so client components can import it without
 * pulling in @prisma/client (which would balloon the client bundle and
 * fail at edge runtime).
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
