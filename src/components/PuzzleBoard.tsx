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
import { PromotionPicker, detectPromotion } from "@/components/PromotionPicker";

interface PuzzleBoardProps {
  // FEN of the position *before* the setup move from the Lichess dump.
  initialFen: string;
  // UCI moves: the first is the opponent's setup move; the rest are the solution.
  // After the setup move is applied, user moves are at indices 1, 3, 5, ... and
  // opponent replies (which the board plays automatically in play mode) at 2, 4, 6, ...
  moves: string[];
  // When true, the board plays through the solution one move at a time.
  // Mutually exclusive with playMode — the parent should drop one when
  // showing the other.
  revealSolution: boolean;
  // When true, the user solves the puzzle by dragging pieces. Each played
  // move is validated against the next expected solution move; correct →
  // opponent auto-replies and we wait for the next user move; wrong → brief
  // red flash and the move is rejected. Fires onCorrect/onIncorrect/onSolved
  // so the parent can drive scoring and screen flow.
  playMode?: boolean;
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
  // Play-mode callbacks. stepIndex is 0-indexed user-move number; e.g. the
  // first user move (moves[1]) is step 0.
  onCorrect?: (stepIndex: number) => void;
  onIncorrect?: (stepIndex: number) => void;
  onSolved?: () => void;
}

export interface PuzzleBoardHandle {
  goToFirst: () => void;
  goToPrevious: () => void;
  goToNext: () => void;
  goToLast: () => void;
  // Play-mode hook used by the parent's "Show solution" affordance. Disables
  // play interaction and animates the rest of the solution from the
  // current play position. Resolves a Promise the parent can await before
  // advancing to the next puzzle.
  revealRemaining: () => Promise<void>;
}

const SOLUTION_STEP_MS = 600;
// Delay between user's correct move and the opponent's auto-reply so the
// user can perceive their own move before the position shifts.
const OPPONENT_REPLY_MS = 350;
// Duration of the red flash when the user plays a wrong move.
const WRONG_FLASH_MS = 450;
// Duration of the green flash on a correct user move. Shorter than the
// wrong flash because we want the user to feel forward momentum, not pause.
const CORRECT_FLASH_MS = 280;

interface AnalysisLine {
  baseIndex: number;
  branch: string[];
  branchIndex: number;
}

export const PuzzleBoard = forwardRef<PuzzleBoardHandle, PuzzleBoardProps>(
  function PuzzleBoard(
    {
      initialFen,
      moves,
      revealSolution,
      playMode = false,
      orientation,
      analysisMode = false,
      onPositionChange,
      onCorrect,
      onIncorrect,
      onSolved,
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

    // Solution-mode position cursor.
    //   -1                       → puzzle position (before any solution move)
    //    0..solutionFens.length-1 → after that solution move
    const [currentIndex, setCurrentIndex] = useState(-1);

    // Play-mode state: which user move we're waiting for. 0 = first user move
    // (the answer to moves[1]). userMoveIndex(stepIndex) → 1 + 2*stepIndex.
    const [playStep, setPlayStep] = useState(0);
    // Wrong-flash + correct-flash drive the red/green ring overlays. Two
    // separate booleans rather than a tri-state so they can briefly overlap
    // with state transitions without coupling animations.
    const [wrongFlash, setWrongFlash] = useState(false);
    const [correctFlash, setCorrectFlash] = useState(false);
    // True after revealRemaining starts and during its animation; suppresses
    // further user input so a drag during the playback can't desync.
    const [revealingFromPlay, setRevealingFromPlay] = useState(false);
    // When the user drops a pawn on the last rank, defer the move until they
    // pick a piece via PromotionPicker. Two slots — one for play mode, one
    // for analysis — so a deferred play-mode move can't be silently
    // overwritten by an unrelated drag in analysis (defensive even though
    // the modes are mutually exclusive).
    const [pendingPromotion, setPendingPromotion] = useState<{
      from: string;
      to: string;
      color: "w" | "b";
    } | null>(null);
    const [pendingAnalysisPromotion, setPendingAnalysisPromotion] = useState<{
      from: string;
      to: string;
      color: "w" | "b";
    } | null>(null);

    const [analysis, setAnalysis] = useState<AnalysisLine | null>(null);

    // Solution playback animation when revealSolution flips on.
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

    // Total user moves the puzzle expects. With moves = [setup, U1, O1, U2, O2, ...],
    // user moves live at odd indices, count = ceil((length-1)/2).
    const totalUserMoves = Math.ceil((moves.length - 1) / 2);

    // After step k (k≥1), we've played k user moves and min(k, totalReplies)
    // opponent replies. solutionFens drops the setup move so its indices are
    // shifted by 1 from `moves`: the latest displayed FEN index is
    // (numUserMoves + numOpponentReplies - 1). Capped at array bounds for
    // defensive sanity — playStep should never exceed totalUserMoves.
    const totalOpponentReplies = moves.length - 1 - totalUserMoves;
    const playFen = (() => {
      if (!playMode || playStep === 0) return puzzleFen;
      const opponentRepliesPlayed = Math.min(playStep, totalOpponentReplies);
      const fenIdx = playStep + opponentRepliesPlayed - 1;
      return (
        solutionFens[Math.min(fenIdx, solutionFens.length - 1)] ?? puzzleFen
      );
    })();

    // What the user is about to display. Order of precedence:
    //   1. Analysis (free play overlay) — highest
    //   2. Solution playback (revealSolution)
    //   3. Play mode (user solving)
    //   4. Idle puzzle position
    const displayedFen = analysis
      ? analysis.branchIndex >= 0
        ? analysis.branch[analysis.branchIndex]
        : baseFen(analysis.baseIndex)
      : revealSolution || revealingFromPlay
        ? currentIndex < 0
          ? puzzleFen
          : solutionFens[currentIndex]
        : playMode
          ? playFen
          : currentIndex < 0
            ? puzzleFen
            : solutionFens[currentIndex];

    // Reset play state whenever the puzzle changes (initialFen change → new
    // useState seed → fresh solutionFens → reset cursor).
    useEffect(() => {
      setPlayStep(0);
      setCurrentIndex(-1);
      setRevealingFromPlay(false);
      setWrongFlash(false);
      setCorrectFlash(false);
      setPendingPromotion(null);
      setPendingAnalysisPromotion(null);
    }, [puzzleFen]);

    // Toggle analysis on/off; preserve the position currently on screen.
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [analysisMode]);

    useEffect(() => {
      if (onPositionChange) onPositionChange(displayedFen);
    }, [displayedFen, onPositionChange]);

    // Auto-clear wrong-flash and correct-flash after their animation windows.
    useEffect(() => {
      if (!wrongFlash) return;
      const t = setTimeout(() => setWrongFlash(false), WRONG_FLASH_MS);
      return () => clearTimeout(t);
    }, [wrongFlash]);
    useEffect(() => {
      if (!correctFlash) return;
      const t = setTimeout(() => setCorrectFlash(false), CORRECT_FLASH_MS);
      return () => clearTimeout(t);
    }, [correctFlash]);

    useImperativeHandle(
      ref,
      () => {
        const navHandle = analysis
          ? {
              goToFirst: () =>
                setAnalysis({ baseIndex: -1, branch: [], branchIndex: -1 }),
              goToPrevious: () =>
                setAnalysis((a) => {
                  if (!a) return a;
                  if (a.branchIndex > -1) {
                    return { ...a, branchIndex: a.branchIndex - 1 };
                  }
                  return {
                    baseIndex: Math.max(-1, a.baseIndex - 1),
                    branch: [],
                    branchIndex: -1,
                  };
                }),
              goToNext: () =>
                setAnalysis((a) => {
                  if (!a) return a;
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
            }
          : {
              goToFirst: () => setCurrentIndex(-1),
              goToPrevious: () =>
                setCurrentIndex((i) => (i > -1 ? i - 1 : -1)),
              goToNext: () =>
                setCurrentIndex((i) =>
                  i < solutionFens.length - 1 ? i + 1 : i,
                ),
              goToLast: () => setCurrentIndex(solutionFens.length - 1),
            };
        return {
          ...navHandle,
          // Animate the rest of the solution from where play stopped. Used
          // by the parent's "Show solution" button. Returns a Promise so
          // the parent can await playback before advancing.
          revealRemaining: () => {
            return new Promise<void>((resolve) => {
              setRevealingFromPlay(true);
              // Where we are in the canonical solution FEN list right now.
              // In play mode the parent should call this only while in play
              // mode, so derive the starting index from playStep.
              const opponentRepliesPlayed = Math.min(
                playStep,
                totalOpponentReplies,
              );
              const startIdx = playStep + opponentRepliesPlayed - 1;
              const from = Math.max(-1, startIdx);
              // Cancel any existing playback that may have queued from a
              // revealSolution toggle (defensive — parent shouldn't do both).
              ticking.current = true;
              setCurrentIndex(from);
              const ts: ReturnType<typeof setTimeout>[] = [];
              const stepsLeft = solutionFens.length - 1 - from;
              for (let i = 1; i <= stepsLeft; i++) {
                const t = setTimeout(
                  () => setCurrentIndex(from + i),
                  SOLUTION_STEP_MS * i,
                );
                ts.push(t);
              }
              const finalT = setTimeout(
                () => resolve(),
                SOLUTION_STEP_MS * (stepsLeft + 1),
              );
              ts.push(finalT);
              // No cleanup return — the promise resolves on its own; the
              // parent unmounting/remounting will key off puzzle change.
            });
          },
        };
      },
      [analysis, solutionFens.length, playStep, totalOpponentReplies],
    );

    /**
     * Validate a fully-specified play-mode move (including promotion piece)
     * against the expected solution. Updates state on success/failure and
     * returns whether the move was accepted. Shared by the drag-drop path
     * (non-promotion moves) and the promotion picker (after the user picks).
     */
    const tryUserMove = useCallback(
      (from: string, to: string, promotion?: "q" | "r" | "b" | "n"): boolean => {
        if (!playMode || revealingFromPlay || playStep >= totalUserMoves) {
          return false;
        }
        const expectedUserUciIndex = 1 + 2 * playStep;
        const expectedUci = moves[expectedUserUciIndex];
        if (!expectedUci) return false;

        const expectedFrom = expectedUci.slice(0, 2);
        const expectedTo = expectedUci.slice(2, 4);
        const expectedPromo =
          expectedUci.length > 4
            ? (expectedUci.slice(4, 5) as "q" | "r" | "b" | "n")
            : undefined;

        // For non-promotion moves: expectedPromo is undefined; promotion arg
        // ignored. For promotion moves: both must agree, otherwise the user
        // queen-promoted when the solution wanted a knight underpromotion
        // (or vice versa) — which is a *different move*, not the right one.
        const fromToMatches = from === expectedFrom && to === expectedTo;
        const promoMatches = expectedPromo
          ? promotion === expectedPromo
          : !promotion;
        if (!fromToMatches || !promoMatches) {
          setWrongFlash(true);
          onIncorrect?.(playStep);
          return false;
        }

        // Defensive legality check — if the user fed in a legal-but-not-
        // applicable move (chess.js will reject), still treat as wrong
        // rather than crash the board.
        try {
          const g = new Chess(playFen);
          const applied = g.move({
            from,
            to,
            promotion: promotion ?? "q",
          });
          if (!applied) {
            setWrongFlash(true);
            onIncorrect?.(playStep);
            return false;
          }
        } catch {
          setWrongFlash(true);
          onIncorrect?.(playStep);
          return false;
        }

        const nextStep = playStep + 1;
        onCorrect?.(playStep);
        // Visual confirmation on the board itself — survives across the
        // FEN update because the ring sits on the wrapper, not the squares.
        setCorrectFlash(true);
        setPlayStep(nextStep);
        if (nextStep >= totalUserMoves) {
          setTimeout(() => onSolved?.(), OPPONENT_REPLY_MS);
        }
        return true;
      },
      [
        playMode,
        revealingFromPlay,
        playStep,
        totalUserMoves,
        moves,
        playFen,
        onCorrect,
        onIncorrect,
        onSolved,
      ],
    );

    const handlePieceDrop = useCallback(
      ({
        sourceSquare,
        targetSquare,
      }: {
        sourceSquare: string;
        targetSquare: string | null;
      }): boolean => {
        if (!targetSquare) return false;
        // No-op drops (drag and release on the same square) aren't move
        // attempts — chess.js would reject them anyway, but we'd otherwise
        // run the wrong-flash + onIncorrect path in play mode, which makes
        // grabbing a piece to look at it cost an attempt.
        if (sourceSquare === targetSquare) return false;

        // Analysis branch (free play) — same defer-on-promotion treatment so
        // a user underpromoting in their analysis actually gets the piece
        // they wanted rather than a silent queen.
        if (analysis) {
          if (pendingAnalysisPromotion) return false;
          const fromFen =
            analysis.branchIndex >= 0
              ? analysis.branch[analysis.branchIndex]
              : baseFen(analysis.baseIndex);
          const promo = detectPromotion(fromFen, sourceSquare, targetSquare);
          if (promo) {
            setPendingAnalysisPromotion({
              from: sourceSquare,
              to: targetSquare,
              color: promo,
            });
            return false;
          }
          return applyAnalysisMove(fromFen, sourceSquare, targetSquare);
        }

        // Play-mode: intercept pawn promotions so the user picks the piece
        // instead of silently queening. Anything else goes straight through
        // the validator.
        if (!playMode || revealingFromPlay || playStep >= totalUserMoves) {
          return false;
        }
        // Block more drags until the user resolves the pending promotion.
        if (pendingPromotion) return false;

        const promo = detectPromotion(playFen, sourceSquare, targetSquare);
        if (promo) {
          // Defer: show the picker; the actual validation happens when the
          // user clicks one of the four pieces. Return false so the dragged
          // pawn snaps back to its source — the picker visually replaces it.
          setPendingPromotion({
            from: sourceSquare,
            to: targetSquare,
            color: promo,
          });
          return false;
        }

        return tryUserMove(sourceSquare, targetSquare);
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [
        analysis,
        playMode,
        playStep,
        totalUserMoves,
        playFen,
        revealingFromPlay,
        pendingPromotion,
        tryUserMove,
      ],
    );

    const handlePromotionPick = (piece: "q" | "r" | "b" | "n") => {
      if (!pendingPromotion) return;
      const { from, to } = pendingPromotion;
      setPendingPromotion(null);
      tryUserMove(from, to, piece);
    };

    const cancelPromotion = () => setPendingPromotion(null);

    const applyAnalysisMove = (
      fromFen: string,
      from: string,
      to: string,
      promotion: "q" | "r" | "b" | "n" = "q",
    ): boolean => {
      try {
        const g = new Chess(fromFen);
        const move = g.move({ from, to, promotion });
        if (!move) return false;
        const newFen = g.fen();
        setAnalysis((a) => {
          if (!a) return a;
          if (a.branchIndex < 0) {
            return { ...a, branch: [newFen], branchIndex: 0 };
          }
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
    };

    const handleAnalysisPromotionPick = (piece: "q" | "r" | "b" | "n") => {
      if (!pendingAnalysisPromotion || !analysis) return;
      const { from, to } = pendingAnalysisPromotion;
      setPendingAnalysisPromotion(null);
      const fromFen =
        analysis.branchIndex >= 0
          ? analysis.branch[analysis.branchIndex]
          : baseFen(analysis.baseIndex);
      applyAnalysisMove(fromFen, from, to, piece);
    };

    const cancelAnalysisPromotion = () => setPendingAnalysisPromotion(null);

    const boardColors = {
      light: "#c8c4bc",
      dark: "#5c6370",
    };

    // Whose turn is it in the displayed position? Only enable dragging when
    // it's actually the user's turn — prevents accidental drags of opponent
    // pieces during the brief inter-move window in play mode. Also disabled
    // while the promotion picker is open: any drag during that window would
    // be ambiguous with the deferred move.
    const allowDragging =
      (Boolean(analysis) && !pendingAnalysisPromotion) ||
      Boolean(playMode && !revealingFromPlay && !pendingPromotion);

    // Ring color: red while wrong-flashing, green while correct-flashing,
    // neutral otherwise. Both flashes auto-clear after a short window so
    // the board returns to its idle ring.
    const ringClass = wrongFlash
      ? "ring-2 ring-rose-500/80 shadow-[0_0_24px_rgba(244,63,94,0.45)]"
      : correctFlash
        ? "ring-2 ring-emerald-500/80 shadow-[0_0_18px_rgba(16,185,129,0.35)]"
        : "ring-white/5";

    return (
      <div className="relative">
        <div
          className={`w-full aspect-square rounded-2xl overflow-hidden elevated ring-1 transition-shadow duration-150 ${ringClass}`}
          data-testid="puzzle-board">
          <Chessboard
            options={{
              position: displayedFen,
              boardOrientation: orientation,
              showNotation: showCoordinates,
              allowDragging,
              onPieceDrop:
                analysis || (playMode && !revealingFromPlay)
                  ? handlePieceDrop
                  : undefined,
              lightSquareStyle: { backgroundColor: boardColors.light },
              darkSquareStyle: { backgroundColor: boardColors.dark },
            }}
          />
        </div>
        {pendingPromotion && (
          <PromotionPicker
            color={pendingPromotion.color}
            onPick={handlePromotionPick}
            onCancel={cancelPromotion}
          />
        )}
        {pendingAnalysisPromotion && (
          <PromotionPicker
            color={pendingAnalysisPromotion.color}
            onPick={handleAnalysisPromotionPick}
            onCancel={cancelAnalysisPromotion}
          />
        )}
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
