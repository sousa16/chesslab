"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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

export interface PuzzleBoardHandle {
  goToFirst: () => void;
  goToPrevious: () => void;
  goToNext: () => void;
  goToLast: () => void;
}

const SOLUTION_STEP_MS = 600;

/**
 * Read-only puzzle board.
 *
 * Initial state shows the puzzle position (moves[0] applied to initialFen).
 * After `revealSolution` flips on, the component:
 *   1. Pre-computes the FEN of every solution position.
 *   2. Animates by advancing currentMoveIndex on a timer.
 *   3. Once animation finishes, the parent can step back and forth via
 *      the imperative handle (driven by BoardControls).
 *
 * Remounts on puzzle change (parent passes `key` tied to puzzle id), so
 * no reset logic lives here.
 */
export const PuzzleBoard = forwardRef<PuzzleBoardHandle, PuzzleBoardProps>(
  function PuzzleBoard(
    { initialFen, moves, revealSolution, orientation },
    ref,
  ) {
    const { showCoordinates } = useSettings();

    // Compute the puzzle position (after Lichess' moves[0]) and the FENs
    // of every subsequent solution move. Lazily, once per mount, so a
    // child remount on puzzle change starts clean.
    const [{ puzzleFen, solutionFens }] = useState(() => {
      const g = new Chess(initialFen);
      const setupUci = moves[0];
      if (setupUci) applyUci(g, setupUci);
      const start = g.fen();
      const fens: string[] = [];
      for (let i = 1; i < moves.length; i++) {
        const move = applyUci(g, moves[i]);
        if (!move) break;
        fens.push(g.fen());
      }
      return { puzzleFen: start, solutionFens: fens };
    });

    // currentIndex semantics:
    //   -1                       → puzzle position (before any solution move)
    //    0..solutionFens.length-1 → after that solution move
    const [currentIndex, setCurrentIndex] = useState(-1);

    // After the parent toggles `revealSolution`, walk the board through the
    // solution one move per tick. setState lives in the setTimeout callback
    // so the lint rule about setState-in-effect-body doesn't fire.
    const ticking = useRef(false);
    useEffect(() => {
      if (!revealSolution || ticking.current) return;
      ticking.current = true;
      const ts: ReturnType<typeof setTimeout>[] = [];
      for (let step = 0; step < solutionFens.length; step++) {
        const t = setTimeout(
          () => setCurrentIndex(step),
          SOLUTION_STEP_MS * (step + 1),
        );
        ts.push(t);
      }
      return () => ts.forEach(clearTimeout);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [revealSolution]);

    useImperativeHandle(
      ref,
      () => ({
        goToFirst: () => setCurrentIndex(-1),
        goToPrevious: () =>
          setCurrentIndex((i) => (i > -1 ? i - 1 : -1)),
        goToNext: () =>
          setCurrentIndex((i) =>
            i < solutionFens.length - 1 ? i + 1 : i,
          ),
        goToLast: () => setCurrentIndex(solutionFens.length - 1),
      }),
      [solutionFens.length],
    );

    const fen = currentIndex < 0 ? puzzleFen : solutionFens[currentIndex];

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
  },
);

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
