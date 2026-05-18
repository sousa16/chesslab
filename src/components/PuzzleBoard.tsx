"use client";

import { useEffect, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useSettings } from "@/contexts/SettingsContext";

interface PuzzleBoardProps {
  // FEN of the position *before* the setup move from the Lichess dump.
  initialFen: string;
  // UCI moves: the first is the opponent's setup move; the rest are the solution.
  moves: string[];
  // When true, the board plays through the solution one move at a time.
  revealSolution: boolean;
  // Player color (i.e. whose turn it is at the puzzle position).
  orientation: "white" | "black";
}

const SOLUTION_STEP_MS = 600;

/**
 * Read-only puzzle board.
 *
 * Renders the puzzle position immediately (i.e. with moves[0] already
 * applied) and, when `revealSolution` flips on, walks through moves[1..]
 * one at a time. No move sounds — the user is calculating, and the steady
 * click of solution moves was reported as distracting.
 *
 * Parent must pass a `key` tied to the puzzle id so React fully remounts
 * this component on puzzle change.
 */
export function PuzzleBoard({
  initialFen,
  moves,
  revealSolution,
  orientation,
}: PuzzleBoardProps) {
  const { showCoordinates } = useSettings();

  // Initialize the chess.js game and the displayed FEN lazily, once per mount.
  // useState's initializer runs once; the `game` object reference is stable
  // across renders, so we can mutate it in the reveal effect without ever
  // recreating it.
  const [game] = useState(() => {
    const g = new Chess(initialFen);
    const setupUci = moves[0];
    if (setupUci) applyUci(g, setupUci);
    return g;
  });
  const [fen, setFen] = useState(() => game.fen());

  // Play through the solution when reveal toggles on.
  useEffect(() => {
    if (!revealSolution) return;
    const solution = moves.slice(1);
    let delay = 0;
    const ts: ReturnType<typeof setTimeout>[] = [];
    for (const uci of solution) {
      delay += SOLUTION_STEP_MS;
      const t = setTimeout(() => {
        const move = applyUci(game, uci);
        if (move) setFen(game.fen());
      }, delay);
      ts.push(t);
    }
    return () => ts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealSolution]);

  const boardColors = {
    light: "#c8c4bc",
    dark: "#5c6370",
  };

  return (
    <div className="relative">
      <div
        className="w-full aspect-square rounded-2xl overflow-hidden elevated ring-1 ring-white/5"
        data-testid="puzzle-board">
        <Chessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            showNotation: showCoordinates,
            allowDragging: false,
            lightSquareStyle: { backgroundColor: boardColors.light },
            darkSquareStyle: { backgroundColor: boardColors.dark },
          }}
        />
      </div>
    </div>
  );
}

function applyUci(game: Chess, uci: string) {
  if (uci.length < 4) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
  try {
    return game.move({ from, to, promotion: promotion || "q" });
  } catch {
    return null;
  }
}
