"use client";

import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useRef, useState } from "react";

interface BoardProps {
  playerColor?: "white" | "black";
}

export function Board({ playerColor = "white" }: BoardProps) {
  const gameRef = useRef(new Chess());
  const [position, setPosition] = useState(gameRef.current.fen());

  const handlePieceDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string;
    piece: string;
  }): boolean => {
    try {
      gameRef.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });

      setPosition(gameRef.current.fen());
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="w-full aspect-square max-w-2xl rounded-lg overflow-hidden shadow-lg">
      <Chessboard
        options={{
          position,
          boardOrientation: playerColor,
          onPieceDrop: handlePieceDrop,
          showNotation: true,
          lightSquareStyle: { backgroundColor: "#b8a06d" },
          darkSquareStyle: { backgroundColor: "#2c5233" },
          allowDragging: true,
        }}
      />
    </div>
  );
}
