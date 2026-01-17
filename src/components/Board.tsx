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
    },
    ref,
  ) => {
    const gameRef = useRef(new Chess());
    const [position, setPosition] = useState(gameRef.current.fen());
    const [moveHistory, setMoveHistory] = useState<string[]>([]);
    const [moves, setMoves] = useState<string[]>([]);
    const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);

    // Initialize board with any initial moves
    useEffect(() => {
      if (initialMoves.length > 0) {
        gameRef.current.reset();
        const newHistory: string[] = [];
        const newMoves: string[] = [];

        for (const moveSan of initialMoves) {
          try {
            const move = gameRef.current.move(moveSan);
            if (move) {
              newMoves.push(move.san);
              newHistory.push(gameRef.current.fen());
            }
          } catch {
            // Skip invalid moves
          }
        }

        setMoves(newMoves);
        setMoveHistory(newHistory);
        setCurrentMoveIndex(newHistory.length - 1);
        setPosition(gameRef.current.fen());
      }
    }, [initialMoves]);

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
        const moveObj = tempGame.move(moves[i]);
        if (!moveObj) continue;

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
      }
      onMovesUpdated?.(result);
    }, [moves, onMovesUpdated]);

    const handlePieceDrop = ({
      sourceSquare,
      targetSquare,
      piece,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
      piece: { isSparePiece: boolean; position: string; pieceType: string };
    }): boolean => {
      if (!targetSquare) {
        return false;
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
          onBuildMove?.({ from: sourceSquare, to: targetSquare });
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

    useImperativeHandle(ref, () => ({
      goToFirst,
      goToPrevious,
      goToNext,
      goToLast,
      reset,
      getMoveHistory,
      deleteToMove,
    }));

    const isViewingHistory = currentMoveIndex !== moveHistory.length - 1;

    return (
      <div className="relative">
        <div
          className="w-full aspect-square max-w-2xl rounded-lg overflow-hidden shadow-lg"
          data-testid="board">
          <Chessboard
            options={{
              position,
              boardOrientation: playerColor,
              onPieceDrop: handlePieceDrop,
              showNotation: true,
              lightSquareStyle: { backgroundColor: "#b8a06d" },
              darkSquareStyle: { backgroundColor: "#2c5233" },
              allowDragging: currentMoveIndex === moveHistory.length - 1,
            }}
          />
        </div>
        {isViewingHistory && (
          <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center">
            <div className="bg-background/90 px-6 py-3 rounded-lg text-center">
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
