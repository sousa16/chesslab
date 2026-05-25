"use client";

import {
  forwardRef,
  useCallback,
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
  // When true, the board enters free-play analysis mode anchored at the
  // position currently on screen. The user may drag any legal move for
  // either side; the imperative handle navigates the exploration history
  // rather than the solution.
  analysisMode?: boolean;
  // Fires whenever the displayed FEN changes — used by the parent to
  // request engine evaluation.
  onPositionChange?: (fen: string) => void;
}

export interface PuzzleBoardHandle {
  goToFirst: () => void;
  goToPrevious: () => void;
  goToNext: () => void;
  goToLast: () => void;
}

const SOLUTION_STEP_MS = 600;

interface AnalysisLine {
  // Position along the puzzle's main solution line. -1 = puzzle position
  // (before any solution move); 0..solutionFens.length-1 = after that
  // solution move. Doubles as the branch root when the user explores an
  // alternative — branches always fork off the current baseIndex.
  baseIndex: number;
  // Linear stack of FENs reached by dragging from the branch root.
  // Empty when the user is just navigating the solution.
  branch: string[];
  // -1 means we're showing the base node (solutionFens[baseIndex] or
  // puzzleFen). 0..branch.length-1 means we're inside the variation.
  branchIndex: number;
}

export const PuzzleBoard = forwardRef<PuzzleBoardHandle, PuzzleBoardProps>(
  function PuzzleBoard(
    {
      initialFen,
      moves,
      revealSolution,
      orientation,
      analysisMode = false,
      onPositionChange,
    },
    ref,
  ) {
    const { showCoordinates } = useSettings();

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

    // currentIndex semantics (solution mode only):
    //   -1                       → puzzle position (before any solution move)
    //    0..solutionFens.length-1 → after that solution move
    const [currentIndex, setCurrentIndex] = useState(-1);

    // Set when analysisMode flips on; cleared when it flips off. Holds the
    // user's free-play exploration anchored at the position visible at toggle.
    const [analysis, setAnalysis] = useState<AnalysisLine | null>(null);

    // Solution playback animation. Skips when analysis is active so a toggle
    // mid-playback doesn't keep advancing.
    const ticking = useRef(false);
    useEffect(() => {
      if (!revealSolution || ticking.current || analysisMode) return;
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

    const baseFen = (idx: number) =>
      idx < 0 ? puzzleFen : solutionFens[idx];

    // Compute the FEN currently being displayed. In analysis mode this is
    // either the active branch position or the underlying base node;
    // otherwise it's whatever solution step we're stopped at.
    const displayedFen = analysis
      ? analysis.branchIndex >= 0
        ? analysis.branch[analysis.branchIndex]
        : baseFen(analysis.baseIndex)
      : currentIndex < 0
        ? puzzleFen
        : solutionFens[currentIndex];

    // Toggle analysis on/off. On entry, seed the base position with whatever
    // solution step is currently on screen so the visible position stays
    // stable. On exit, sync currentIndex back so the solution-mode arrows
    // continue from where the user left off — but keep us off the branch
    // (branches don't survive a toggle).
    const prevAnalysisMode = useRef(false);
    useEffect(() => {
      if (analysisMode && !prevAnalysisMode.current) {
        setAnalysis({
          baseIndex: currentIndex,
          branch: [],
          branchIndex: -1,
        });
      } else if (!analysisMode && prevAnalysisMode.current) {
        setAnalysis((a) => {
          if (a) setCurrentIndex(a.baseIndex);
          return null;
        });
      }
      prevAnalysisMode.current = analysisMode;
      // currentIndex intentionally excluded — only sampled at the moment
      // of the toggle, not on every step.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [analysisMode]);

    // Fire onPositionChange whenever the displayed FEN changes.
    useEffect(() => {
      if (onPositionChange) onPositionChange(displayedFen);
    }, [displayedFen, onPositionChange]);

    useImperativeHandle(
      ref,
      () => {
        if (analysis) {
          return {
            goToFirst: () =>
              setAnalysis({ baseIndex: -1, branch: [], branchIndex: -1 }),
            goToPrevious: () =>
              setAnalysis((a) => {
                if (!a) return a;
                // Inside a branch: step back through it. branchIndex
                // reaches -1 when we're back at the branch root; the
                // branch stays so the user can re-walk it forward.
                if (a.branchIndex > -1) {
                  return { ...a, branchIndex: a.branchIndex - 1 };
                }
                // At a base node. Discard any stale branch (it was
                // rooted at the node we're leaving) and step base back.
                return {
                  baseIndex: Math.max(-1, a.baseIndex - 1),
                  branch: [],
                  branchIndex: -1,
                };
              }),
            goToNext: () =>
              setAnalysis((a) => {
                if (!a) return a;
                // If a branch is present, forward navigates within it —
                // we re-enter the variation rather than stepping the
                // base, since the branch was the most recent intent.
                if (a.branch.length > 0) {
                  return a.branchIndex < a.branch.length - 1
                    ? { ...a, branchIndex: a.branchIndex + 1 }
                    : a;
                }
                return a.baseIndex < solutionFens.length - 1
                  ? { ...a, baseIndex: a.baseIndex + 1 }
                  : a;
              }),
            goToLast: () =>
              setAnalysis({
                baseIndex: solutionFens.length - 1,
                branch: [],
                branchIndex: -1,
              }),
          };
        }
        return {
          goToFirst: () => setCurrentIndex(-1),
          goToPrevious: () =>
            setCurrentIndex((i) => (i > -1 ? i - 1 : -1)),
          goToNext: () =>
            setCurrentIndex((i) =>
              i < solutionFens.length - 1 ? i + 1 : i,
            ),
          goToLast: () => setCurrentIndex(solutionFens.length - 1),
        };
      },
      [analysis, solutionFens.length],
    );

    const handlePieceDrop = useCallback(
      ({
        sourceSquare,
        targetSquare,
      }: {
        sourceSquare: string;
        targetSquare: string | null;
      }): boolean => {
        if (!analysis || !targetSquare) return false;
        const fromFen =
          analysis.branchIndex >= 0
            ? analysis.branch[analysis.branchIndex]
            : baseFen(analysis.baseIndex);
        try {
          const g = new Chess(fromFen);
          const move = g.move({
            from: sourceSquare,
            to: targetSquare,
            promotion: "q",
          });
          if (!move) return false;
          const newFen = g.fen();
          setAnalysis((a) => {
            if (!a) return a;
            // At a base node: start a fresh branch rooted here. Any
            // previously-saved branch is discarded since dragging means
            // the user is committing to this new variation.
            if (a.branchIndex < 0) {
              return { ...a, branch: [newFen], branchIndex: 0 };
            }
            // Inside an existing branch: truncate any forward moves
            // (re-dragging at a back-stepped position branches off).
            const truncated = a.branch.slice(0, a.branchIndex + 1);
            truncated.push(newFen);
            return {
              ...a,
              branch: truncated,
              branchIndex: truncated.length - 1,
            };
          });
          return true;
        } catch {
          return false;
        }
      },
      // baseFen is closed over puzzleFen and solutionFens; both are
      // stable per-mount, so depending on `analysis` is enough.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [analysis],
    );

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
              position: displayedFen,
              boardOrientation: orientation,
              showNotation: showCoordinates,
              allowDragging: Boolean(analysis),
              onPieceDrop: analysis ? handlePieceDrop : undefined,
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
