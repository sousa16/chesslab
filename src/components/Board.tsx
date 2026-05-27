"use client";

import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import {
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useMemo,
} from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { playMoveSound, playCaptureSound } from "@/lib/sounds";
import { PromotionPicker, detectPromotion } from "@/components/PromotionPicker";

interface BoardProps {
  playerColor?: "white" | "black";
  onMoveHistoryChange?: (moveCount: number) => void;
  onMoveMade?: (move: { from: string; to: string; san: string }) => void;
  onMovesUpdated?: (
    moves: {
      number: number;
      white: string;
      whiteUci: string;
      black?: string;
      blackUci?: string;
    }[],
  ) => void;
  buildMode?: boolean;
  onBuildMove?: (move: { from: string; to: string }) => void;
  // Fires when the displayed move index changes (history navigation or
  // playing a new move). Pass a memoized callback to avoid re-render
  // loops; the prop is read inside a useEffect that depends on it.
  onMoveIndexChange?: (index: number) => void;
  initialMoves?: string[];
  initialFen?: string;
  trainingMode?: boolean;
  showingAnswer?: boolean;
  onTrainingMove?: (move: { from: string; to: string; san: string }) => boolean; // returns true if correct
  highlightSquare?: { square: string; color: "correct" | "incorrect" } | null;
  // When true, after replaying `initialMoves` the board lands at the
  // initial (pre-first-move) position rather than the final one. The full
  // moveHistory is still populated so the user can step forward through
  // the line via BoardControls. Used by the line-viewer flow on Home so
  // the user actually sees how the position was reached.
  landAtStart?: boolean;
  // Suppress the "Viewing move history" overlay that normally appears
  // when the user steps back from the latest ply. Surfaces in build/home
  // where the overlay nudges the user back to live play; in Explorer the
  // entire point is scrubbing through a loaded game, so the overlay just
  // gets in the way.
  hideHistoryOverlay?: boolean;
}

export interface BoardHandle {
  goToFirst: () => void;
  goToPrevious: () => void;
  goToNext: () => void;
  goToLast: () => void;
  // Jump to a specific ply. -1 = starting position (before any move),
  // 0..moveHistory.length-1 = position after that many moves. Used by
  // the explorer's clickable move list.
  goToMove: (index: number) => void;
  reset: () => void;
  getMoveHistory: () => {
    number: number;
    white: string;
    whiteUci: string;
    black?: string;
    blackUci?: string;
  }[];
  deleteToMove: (moveIndex: number) => void;
  makeMove: (from: string, to: string, promotion?: string) => boolean;
}

export const Board = forwardRef<BoardHandle, BoardProps>(
  (
    {
      playerColor = "white",
      onMoveHistoryChange,
      onMoveMade,
      onMovesUpdated,
      buildMode = false,
      onBuildMove,
      onMoveIndexChange,
      initialMoves = [],
      initialFen,
      trainingMode = false,
      showingAnswer = false,
      onTrainingMove,
      highlightSquare,
      landAtStart = false,
      hideHistoryOverlay = false,
    },
    ref,
  ) => {
    const gameRef = useRef(new Chess());
    const [position, setPosition] = useState(gameRef.current.fen());
    const [moveHistory, setMoveHistory] = useState<string[]>([]);
    const [moves, setMoves] = useState<string[]>([]);
    const [uciMoves, setUciMoves] = useState<string[]>([]);
    const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
    const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
    // Deferred promotion move: set when the user drops a pawn on the last
    // rank; cleared when they pick a piece (executed) or click the backdrop
    // (cancelled). Without this the board silently auto-promotes to queen,
    // which is wrong for underpromotion and confusing in build/training.
    const [pendingPromotion, setPendingPromotion] = useState<{
      from: string;
      to: string;
      color: "w" | "b";
    } | null>(null);
    const { soundEffects, showCoordinates } = useSettings();

    // Sync board state with the initial props during render (not in a
    // useEffect). Doing this in a useEffect causes a one-render lag: the
    // Chessboard mounts at the new key with the *old* `position` state, then
    // updates to the new FEN — react-chessboard reads that as a position
    // change and animates pieces flying across the board. Computing state
    // during render is React's official pattern for "prop-derived state"
    // and avoids the intermediate frame.
    //
    // `lastInitKey` starts as `null` so the very first render always falls
    // into the sync block — otherwise mounting with non-empty `initialMoves`
    // (e.g. after Home pushes a buildMove via sessionStorage) silently
    // skipped the replay and the move was lost.
    const initKey = `${initialFen ?? ""}|${JSON.stringify(initialMoves ?? [])}`;
    const [lastInitKey, setLastInitKey] = useState<string | null>(null);
    if (lastInitKey !== initKey) {
      setLastInitKey(initKey);

      const startingFen =
        initialFen ||
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      gameRef.current = new Chess(startingFen);

      if (initialMoves && initialMoves.length > 0) {
        const newHistory: string[] = [];
        const newMoves: string[] = [];
        const newUciMoves: string[] = [];

        for (const moveSan of initialMoves) {
          try {
            const move = gameRef.current.move(moveSan);
            if (move) {
              newMoves.push(move.san);
              const uci = `${move.from}${move.to}${move.promotion ? move.promotion : ""}`;
              newUciMoves.push(uci);
              newHistory.push(gameRef.current.fen());
            }
          } catch (e) {
            // Skip invalid moves silently
          }
        }

        setMoves(newMoves);
        setUciMoves(newUciMoves);
        setMoveHistory(newHistory);
        if (landAtStart && newHistory.length > 0) {
          // Keep the full history so the user can step forward, but show
          // the position after the FIRST move — clicking a saved line
          // should already display that line beginning, not the empty
          // starting position. Subsequent moves are driven by the
          // BoardControls "Next move" button.
          gameRef.current = new Chess(newHistory[0]);
          setCurrentMoveIndex(0);
          setPosition(newHistory[0]);
        } else {
          setCurrentMoveIndex(newHistory.length - 1);
          setPosition(gameRef.current.fen());
        }
      } else {
        setMoves([]);
        setUciMoves([]);
        setMoveHistory([]);
        setCurrentMoveIndex(-1);
        setPosition(gameRef.current.fen());
      }
      setSelectedSquare(null);
      setPendingPromotion(null);
    }

    // Memoize pairing of SAN moves and UCI moves to avoid replaying the game
    const pairedMoves = useMemo(() => {
      const result: {
        number: number;
        white: string;
        whiteUci: string;
        black?: string;
        blackUci?: string;
      }[] = [];

      for (let i = 0; i < moves.length; i++) {
        const moveNumber = Math.floor(i / 2) + 1;
        const uci = uciMoves[i] ?? "";

        if (i % 2 === 0) {
          result.push({ number: moveNumber, white: moves[i], whiteUci: uci });
        } else {
          const lastMove = result[result.length - 1];
          if (lastMove) {
            lastMove.black = moves[i];
            lastMove.blackUci = uci;
          }
        }
      }

      return result;
    }, [moves, uciMoves]);

    useEffect(() => {
      onMovesUpdated?.(pairedMoves);
    }, [pairedMoves, onMovesUpdated]);

    useEffect(() => {
      onMoveIndexChange?.(currentMoveIndex);
    }, [currentMoveIndex, onMoveIndexChange]);

    const handleSquareClick = (square: string) => {
      // Disable square selection outside of training or build mode
      if (!trainingMode && !buildMode) {
        return;
      }

      // If no square is selected, select this square if it has a piece
      if (!selectedSquare) {
        const piece = gameRef.current.get(square as any);
        if (piece) {
          setSelectedSquare(square);
        }
        return;
      }

      // If a square is already selected, try to make a move
      if (selectedSquare === square) {
        // Deselect if clicking the same square
        setSelectedSquare(null);
        return;
      }

      // Try to make a move from selected square to clicked square
      const success = handlePieceDrop({
        sourceSquare: selectedSquare,
        targetSquare: square,
        piece: { isSparePiece: false, position: selectedSquare, pieceType: "" },
      });

      if (success) {
        setSelectedSquare(null);
      } else {
        // If move failed, check if the clicked square has a piece and select it
        const piece = gameRef.current.get(square as any);
        if (piece) {
          setSelectedSquare(square);
        } else {
          setSelectedSquare(null);
        }
      }
    };

    /**
     * Apply a move with an explicit promotion piece, routing through the
     * mode-specific branch (training validate / build record / normal play).
     * Returns whether the move was accepted. Shared by the drag-drop entry
     * point and the promotion picker so under-promotion produces a single
     * source of truth for "what just happened on the board".
     */
    const executeMove = (
      sourceSquare: string,
      targetSquare: string,
      promotion: "q" | "r" | "b" | "n" = "q",
    ): boolean => {
      if (trainingMode && onTrainingMove) {
        try {
          const tempGame = new Chess(gameRef.current.fen());
          const move = tempGame.move({
            from: sourceSquare,
            to: targetSquare,
            promotion,
          });
          if (!move) return false;

          const isCorrect = onTrainingMove({
            from: sourceSquare,
            to: targetSquare,
            san: move.san,
          });

          if (isCorrect) {
            gameRef.current.move({
              from: sourceSquare,
              to: targetSquare,
              promotion,
            });
            setPosition(gameRef.current.fen());
          }
          return isCorrect;
        } catch {
          return false;
        }
      }

      if (buildMode) {
        try {
          const move = gameRef.current.move({
            from: sourceSquare,
            to: targetSquare,
            promotion,
          });
          if (!move) return false;
          const newMoves = [...moves, move.san];
          const newUciMoves = [
            ...uciMoves,
            `${move.from}${move.to}${move.promotion ? move.promotion : ""}`,
          ];
          const newHistory = [...moveHistory, gameRef.current.fen()];
          setMoves(newMoves);
          setUciMoves(newUciMoves);
          setMoveHistory(newHistory);
          setCurrentMoveIndex(newHistory.length - 1);
          setPosition(gameRef.current.fen());

          if (soundEffects) {
            if (move.captured) playCaptureSound();
            else playMoveSound();
          }

          onBuildMove?.({ from: sourceSquare, to: targetSquare });
          onMoveMade?.({
            from: sourceSquare,
            to: targetSquare,
            san: move.san,
          });
          return true;
        } catch {
          return false;
        }
      }

      // Normal play branch
      if (currentMoveIndex !== moveHistory.length - 1) return false;
      try {
        const move = gameRef.current.move({
          from: sourceSquare,
          to: targetSquare,
          promotion,
        });
        if (!move) return false;

        const newHistory = moveHistory.slice(0, currentMoveIndex + 1);
        newHistory.push(gameRef.current.fen());
        setMoveHistory(newHistory);

        const newMoves = moves.slice(0, currentMoveIndex + 1);
        newMoves.push(move.san);
        const newUciMoves = uciMoves.slice(0, currentMoveIndex + 1);
        newUciMoves.push(
          `${move.from}${move.to}${move.promotion ? move.promotion : ""}`,
        );
        setMoves(newMoves);
        setUciMoves(newUciMoves);

        setCurrentMoveIndex(newHistory.length - 1);
        setPosition(gameRef.current.fen());

        if (soundEffects) {
          if (move.captured) playCaptureSound();
          else playMoveSound();
        }

        onMoveHistoryChange?.(newHistory.length);
        onMoveMade?.({
          from: sourceSquare,
          to: targetSquare,
          san: move.san,
        });
        return true;
      } catch {
        return false;
      }
    };

    const handlePromotionPick = (piece: "q" | "r" | "b" | "n") => {
      if (!pendingPromotion) return;
      const { from, to } = pendingPromotion;
      setPendingPromotion(null);
      executeMove(from, to, piece);
    };

    const cancelPromotion = () => setPendingPromotion(null);

    const handlePieceDrop = ({
      sourceSquare,
      targetSquare,
      piece,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
      piece: { isSparePiece: boolean; position: string; pieceType: string };
    }): boolean => {
      // Prevent dragging outside of allowed modes
      if (!buildMode && (!trainingMode || !showingAnswer)) {
        return false;
      }

      if (!targetSquare) {
        return false;
      }
      // No-op drops (release on the same square) aren't move attempts —
      // chess.js would reject them anyway. Filtering here keeps the
      // training-mode incorrect path from firing on a casual piece-poke.
      if (sourceSquare === targetSquare) {
        return false;
      }

      // Block further drags while a promotion choice is open — otherwise
      // a second drop would silently replace the pending one.
      if (pendingPromotion) return false;

      // Intercept pawn promotions so the user picks Q/R/B/N instead of
      // silently queening. For training mode in particular this matters:
      // the expected move might be an under-promotion.
      const promo = detectPromotion(
        gameRef.current.fen(),
        sourceSquare,
        targetSquare,
      );
      if (promo) {
        setPendingPromotion({
          from: sourceSquare,
          to: targetSquare,
          color: promo,
        });
        // Return false so react-chessboard snaps the piece back; the picker
        // appears in its place and the move materialises after the choice.
        return false;
      }

      try {
        return executeMove(sourceSquare, targetSquare);
      } catch {
        return false;
      }
    };

    const goToMove = (index: number) => {
      if (index < -1 || index >= moveHistory.length) return;

      gameRef.current.reset();
      setCurrentMoveIndex(index);

      if (index === -1) {
        setPosition(gameRef.current.fen());
      } else {
        const moves = moveHistory.slice(0, index + 1);
        for (const fen of moves) {
          // Load the position from FEN to navigate history
          gameRef.current.load(fen);
        }
        setPosition(gameRef.current.fen());
      }
    };

    const goToFirst = () => goToMove(-1);
    const goToPrevious = () => goToMove(currentMoveIndex - 1);
    const goToNext = () => goToMove(currentMoveIndex + 1);
    const goToLast = () => goToMove(moveHistory.length - 1);
    const reset = () => {
      gameRef.current.reset();
      setMoveHistory([]);
      setMoves([]);
      setUciMoves([]);
      setCurrentMoveIndex(-1);
      setPosition(gameRef.current.fen());
      onMoveHistoryChange?.(0);
    };

    const getMoveHistory = () => {
      // Convert the move array to the display format
      const result: {
        number: number;
        white: string;
        whiteUci: string;
        black?: string;
        blackUci?: string;
      }[] = [];

      for (let i = 0; i < moves.length; i++) {
        const moveNumber = Math.floor(i / 2) + 1;
        const uci = uciMoves[i] ?? "";

        if (i % 2 === 0) {
          // White move
          result.push({ number: moveNumber, white: moves[i], whiteUci: uci });
        } else {
          // Black move
          const lastMove = result[result.length - 1];
          if (lastMove) {
            lastMove.black = moves[i];
            lastMove.blackUci = uci;
          }
        }
      }

      return result;
    };

    const deleteToMove = (sanMoveCount: number) => {
      // Delete all moves after keeping sanMoveCount SAN moves
      // If sanMoveCount = 0, delete all moves
      // If sanMoveCount = 2, keep first 2 moves (white's move, black's response)
      const newMoves = moves.slice(0, sanMoveCount);
      const newUciMoves = uciMoves.slice(0, sanMoveCount);
      const newHistory = moveHistory.slice(0, sanMoveCount);

      setMoves(newMoves);
      setUciMoves(newUciMoves);
      setMoveHistory(newHistory);
      setCurrentMoveIndex(Math.max(-1, sanMoveCount - 1));

      // Reset game and replay moves
      gameRef.current.reset();
      for (const fen of newHistory) {
        gameRef.current.load(fen);
      }
      setPosition(gameRef.current.fen());
      onMoveHistoryChange?.(newMoves.length);
    };

    const makeMove = (
      from: string,
      to: string,
      promotion?: string,
    ): boolean => {
      try {
        const move = gameRef.current.move({
          from,
          to,
          promotion: promotion || "q",
        });
        if (move) {
          setPosition(gameRef.current.fen());
          return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    useImperativeHandle(ref, () => ({
      goToFirst,
      goToPrevious,
      goToNext,
      goToLast,
      goToMove,
      reset,
      getMoveHistory,
      deleteToMove,
      makeMove,
    }));

    const isViewingHistory = currentMoveIndex !== moveHistory.length - 1;

    // Board theme colors - Midnight theme (muted slate for reduced eye strain)
    const boardColors = {
      light: "#c8c4bc", // soft cream/slate
      dark: "#5c6370", // muted slate gray
      highlight: "rgba(255, 200, 0, 0.4)",
    };

    return (
      <div className="relative">
        <div
          className="w-full aspect-square rounded-2xl overflow-hidden elevated cursor-pointer ring-1 ring-white/5"
          data-testid="board"
          onClick={(e) => {
            const rect = (
              e.currentTarget as HTMLElement
            ).getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Use the smaller of width/height to determine the board square
            const boardSize = Math.min(rect.width, rect.height);
            const squareSize = boardSize / 8;

            // Compute offsets to account for centered square if container isn't perfectly square
            const leftOffset = (rect.width - boardSize) / 2;
            const topOffset = (rect.height - boardSize) / 2;

            // If click is outside the actual square board area, ignore
            if (
              x < leftOffset ||
              x > leftOffset + boardSize ||
              y < topOffset ||
              y > topOffset + boardSize
            ) {
              return;
            }

            let file = Math.floor((x - leftOffset) / squareSize);
            let rank = 7 - Math.floor((y - topOffset) / squareSize); // Invert rank (top = 8, bottom = 1)

            // Adjust for board orientation
            if (playerColor === "black") {
              file = 7 - file;
              rank = 7 - rank;
            }

            const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
            const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"];
            const squareFile = files[file];
            const squareRank = ranks[rank];

            if (squareFile && squareRank) {
              const square = squareFile + squareRank;
              handleSquareClick(square);
            }
          }}>
          <Chessboard
            // Remount Chessboard on programmatic position changes (initialFen
            // or initialMoves prop change) so react-chessboard skips its
            // piece-tweening animation — otherwise jumping between distant
            // positions makes pieces fly across the board for ~300ms. Regular
            // user moves keep the same key and animate smoothly.
            key={`${initialFen ?? ""}|${initialMoves?.length ?? 0}|${
              initialMoves?.[initialMoves.length - 1] ?? ""
            }`}
            options={{
              position,
              boardOrientation: playerColor,
              onPieceDrop: handlePieceDrop,
              showNotation: showCoordinates,
              // Disable piece-tweening animations whenever the parent drives
              // the position programmatically (training-card cycling and the
              // line-click viewer). react-chessboard's inner animation useEffect
              // computes per-piece transforms on every position change — even
              // a fresh mount can flicker pieces as the animation timeout
              // fires once. With showAnimations=false the library calls
              // setCurrentPosition directly, no transforms, no glitch.
              showAnimations: buildMode,
              lightSquareStyle: { backgroundColor: boardColors.light },
              darkSquareStyle: { backgroundColor: boardColors.dark },
              allowDragging:
                !trainingMode &&
                (buildMode || currentMoveIndex === moveHistory.length - 1),
              squareStyles: {
                ...(selectedSquare
                  ? {
                      [selectedSquare]: {
                        backgroundColor: boardColors.highlight,
                      },
                    }
                  : {}),
                ...(highlightSquare
                  ? {
                      [highlightSquare.square]: {
                        backgroundColor:
                          highlightSquare.color === "correct"
                            ? "rgba(34, 197, 94, 0.5)"
                            : "rgba(239, 68, 68, 0.5)",
                      },
                    }
                  : {}),
              },
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
        {isViewingHistory && !hideHistoryOverlay && (
          // Tiny corner badge instead of a full-board scrim. The previous
          // backdrop-blur curtain covered the very thing the user was
          // trying to study (the past position). A pill in the corner
          // still communicates "read-only / step forward to play" without
          // hiding anything; the drag handler is what actually blocks
          // illegal moves from a back-stepped position.
          <div
            className="pointer-events-none absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/55 text-white/90 text-[10px] font-semibold uppercase tracking-wider shadow-sm"
            title="Read-only — press &quot;Last move&quot; to play"
            aria-label="Viewing move history">
            History
          </div>
        )}
      </div>
    );
  },
);
