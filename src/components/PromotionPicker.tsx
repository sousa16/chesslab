"use client";

import { Chess } from "chess.js";

/**
 * Centered overlay with the four promotion pieces (Q R B N). Used everywhere
 * a user drags a pawn to the last rank — without it, react-chessboard
 * silently auto-promotes to queen, which is wrong for underpromotion puzzles
 * and silently ambiguous in build / opening-line capture.
 *
 * Lives in its own file so PuzzleBoard, Board, and any future chessboard
 * wrapper can drop it in without re-implementing the deferred-move pattern.
 */
export function PromotionPicker({
  color,
  onPick,
  onCancel,
}: {
  color: "w" | "b";
  onPick: (piece: "q" | "r" | "b" | "n") => void;
  onCancel: () => void;
}) {
  const GLYPHS = {
    w: { q: "♕", r: "♖", b: "♗", n: "♘" },
    b: { q: "♛", r: "♜", b: "♝", n: "♞" },
  } as const;
  const PIECES = ["q", "r", "b", "n"] as const;
  const NAMES = { q: "queen", r: "rook", b: "bishop", n: "knight" } as const;

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 rounded-2xl"
      onClick={onCancel}
      role="dialog"
      aria-label="Choose promotion piece">
      <div
        className="flex gap-2 p-2 rounded-2xl bg-surface-2/95 border border-border/50 shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        {PIECES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            aria-label={`Promote to ${NAMES[p]}`}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-background hover:bg-primary/15 border border-border/60 hover:border-primary/50 transition-colors flex items-center justify-center text-4xl sm:text-5xl leading-none">
            <span className="text-foreground">{GLYPHS[color][p]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Returns the moving pawn's color when the proposed move is a legal
 * promotion (pawn from `from` to `to` on the last rank), or null otherwise.
 * Callers should intercept their onPieceDrop, show the PromotionPicker if
 * this returns non-null, and defer applying the move until the user picks.
 */
export function detectPromotion(
  fen: string,
  from: string,
  to: string,
): "w" | "b" | null {
  try {
    const g = new Chess(fen);
    const piece = g.get(from as Parameters<typeof g.get>[0]);
    if (!piece || piece.type !== "p") return null;
    const targetRank = to[1];
    if (piece.color === "w" && targetRank !== "8") return null;
    if (piece.color === "b" && targetRank !== "1") return null;
    const legal = g.moves({
      square: from as Parameters<typeof g.moves>[0]["square"],
      verbose: true,
    });
    return legal.some((m) => m.to === to && typeof m.promotion === "string")
      ? piece.color
      : null;
  } catch {
    return null;
  }
}
