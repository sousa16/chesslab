"use client";

import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import {
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  useEffect,
} from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { playMoveSound, playCaptureSound } from "@/lib/sounds";

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
  initialMoves?: string[];
  initialFen?: string;
  trainingMode?: boolean;
  showingAnswer?: boolean;
  onTrainingMove?: (move: { from: string; to: string; san: string }) => boolean; // returns true if correct
  highlightSquare?: { square: string; color: "correct" | "incorrect" } | null;
}

export interface BoardHandle {
  goToFirst: () => void;
  goToPrevious: () => void;
  goToNext: () => void;
  goToLast: () => void;
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
      initialMoves = [],
      initialFen,
      trainingMode = false,
      showingAnswer = false,
      onTrainingMove,
      highlightSquare,
    },
    ref,
  ) => {
    const gameRef = useRef(new Chess());
    const [position, setPosition] = useState(gameRef.current.fen());
    const [moveHistory, setMoveHistory] = useState<string[]>([]);
    const [moves, setMoves] = useState<string[]>([]);
    const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
    const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
    const { soundEffects, showCoordinates } = useSettings();

    // Initialize board with any initial moves
    useEffect(() => {
      const startingFen =
        initialFen ||
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      gameRef.current = new Chess(startingFen);

      if (initialMoves && initialMoves.length > 0) {
        const newHistory: string[] = [];
        const newMoves: string[] = [];

        for (const moveSan of initialMoves) {
          try {
            const move = gameRef.current.move(moveSan);
            if (move) {
              newMoves.push(move.san);
              newHistory.push(gameRef.current.fen());
            }
          } catch (e) {
            // Skip invalid moves silently
          }
        }

        setMoves(newMoves);
        setMoveHistory(newHistory);
        setCurrentMoveIndex(newHistory.length - 1);
        setPosition(gameRef.current.fen());
      } else {
        // Reset to initial state
        setMoves([]);
        setMoveHistory([]);
        setCurrentMoveIndex(-1);
        setPosition(gameRef.current.fen());
      }
    }, [initialFen, JSON.stringify(initialMoves)]);

    // Notify parent of moves changes
    useEffect(() => {
      const result: {
        number: number;
        white: string;
        whiteUci: string;
        black?: string;
        blackUci?: string;
      }[] = [];

      // Replay moves to get both SAN and UCI
      const tempGame = new Chess();
      for (let i = 0; i < moves.length; i++) {
        const moveNumber = Math.floor(i / 2) + 1;
        try {
          const moveObj = tempGame.move(moves[i]);
          if (!moveObj) {
            continue;
          }

          const uci = `${moveObj.from}${moveObj.to}${moveObj.promotion ? moveObj.promotion : ""}`;

          if (i % 2 === 0) {
            result.push({ number: moveNumber, white: moves[i], whiteUci: uci });
          } else {
            const lastMove = result[result.length - 1];
            if (lastMove) {
              lastMove.black = moves[i];
              lastMove.blackUci = uci;
            }
          }
        } catch (e) {
          continue;
        }
      }
      onMovesUpdated?.(result);
    }, [moves, onMovesUpdated]);

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

      if (trainingMode && onTrainingMove) {
        // In training mode, validate the move without executing it permanently
        try {
          // Create a temporary game to validate and get SAN notation
          const tempGame = new Chess(gameRef.current.fen());
          const move = tempGame.move({
            from: sourceSquare,
            to: targetSquare,
            promotion: "q",
          });
          if (!move) {
            return false;
          }

          // Call the training callback with move details
          const isCorrect = onTrainingMove({
            from: sourceSquare,
            to: targetSquare,
            san: move.san,
          });

          // If correct, execute the move on the actual board
          if (isCorrect) {
            gameRef.current.move({
              from: sourceSquare,
              to: targetSquare,
              promotion: "q",
            });
            setPosition(gameRef.current.fen());
          }

          return isCorrect;
        } catch {
          return false;
        }
      }

      if (buildMode) {
        // In build mode, make the move and track it
        try {
          const move = gameRef.current.move({
            from: sourceSquare,
            to: targetSquare,
            promotion: "q",
          });
          if (!move) {
            return false;
          }
          const newMoves = [...moves, move.san];
          const newHistory = [...moveHistory, gameRef.current.fen()];
          setMoves(newMoves);
          setMoveHistory(newHistory);
          setCurrentMoveIndex(newHistory.length - 1);
          setPosition(gameRef.current.fen());

          // Play sound effect
          if (soundEffects) {
            if (move.captured) {
              playCaptureSound();
            } else {
              playMoveSound();
            }
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

      // Only allow moves if viewing the latest position
      if (currentMoveIndex !== moveHistory.length - 1) {
        return false;
      }

      try {
        const move = gameRef.current.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q",
        });

        if (!move) {
          return false;
        }

        const newHistory = moveHistory.slice(0, currentMoveIndex + 1);
        newHistory.push(gameRef.current.fen());
        setMoveHistory(newHistory);

        const newMoves = moves.slice(0, currentMoveIndex + 1);
        newMoves.push(move.san);
        setMoves(newMoves);

        setCurrentMoveIndex(newHistory.length - 1);
        setPosition(gameRef.current.fen());

        // Play sound effect
        if (soundEffects) {
          if (move.captured) {
            playCaptureSound();
          } else {
            playMoveSound();
          }
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

      const tempGame = new Chess();
      for (let i = 0; i < moves.length; i++) {
        const moveNumber = Math.floor(i / 2) + 1;
        const moveObj = tempGame.move(moves[i]);
        if (!moveObj) continue;

        const uci = `${moveObj.from}${moveObj.to}${moveObj.promotion ? moveObj.promotion : ""}`;

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
      const newHistory = moveHistory.slice(0, sanMoveCount);

      setMoves(newMoves);
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
          className="w-full aspect-square max-w-2xl max-h-full rounded-2xl overflow-hidden elevated cursor-pointer ring-1 ring-white/5"
          data-testid="board"
          onClick={(e) => {
            const rect = (
              e.currentTarget as HTMLElement
            ).getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const squareSize = rect.width / 8;
            let file = Math.floor(x / squareSize);
            let rank = 7 - Math.floor(y / squareSize); // Invert rank (top = 8, bottom = 1)

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
            options={{
              position,
              boardOrientation: playerColor,
              onPieceDrop: handlePieceDrop,
              showNotation: showCoordinates,
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
        {isViewingHistory && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] rounded-2xl flex items-center justify-center">
            <div className="glass-card px-6 py-4 rounded-xl text-center">
              <p className="text-base font-medium text-foreground">
                Viewing move history
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Press "Last move" to continue playing
              </p>
            </div>
          </div>
        )}
      </div>
    );
  },
);
