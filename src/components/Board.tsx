"use client";

import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useRef, useState, forwardRef, useImperativeHandle } from "react";

interface BoardProps {
  playerColor?: "white" | "black";
  onMoveHistoryChange?: (moveCount: number) => void;
}

export interface BoardHandle {
  goToFirst: () => void;
  goToPrevious: () => void;
  goToNext: () => void;
  goToLast: () => void;
  reset: () => void;
}

export const Board = forwardRef<BoardHandle, BoardProps>(
  ({ playerColor = "white", onMoveHistoryChange }, ref) => {
  const gameRef = useRef(new Chess());
  const [position, setPosition] = useState(gameRef.current.fen());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);

  const handlePieceDrop = ({
    sourceSquare,
    targetSquare,
    piece,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
    piece: { isSparePiece: boolean; position: string; pieceType: string };
  }): boolean => {
    // Only allow moves if viewing the latest position
    if (currentMoveIndex !== moveHistory.length - 1 || !targetSquare) {
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
      setCurrentMoveIndex(newHistory.length - 1);
      setPosition(gameRef.current.fen());
      onMoveHistoryChange?.(newHistory.length);
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
    setCurrentMoveIndex(-1);
    setPosition(gameRef.current.fen());
    onMoveHistoryChange?.(0);
  };

  useImperativeHandle(ref, () => ({
    goToFirst,
    goToPrevious,
    goToNext,
    goToLast,
    reset,
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
            <p className="text-sm font-medium text-foreground">
              Viewing move history
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Press "Last move" to continue playing
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
);
