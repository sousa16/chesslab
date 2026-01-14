"use client";

import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useMemo } from "react";

interface BoardProps {
  playerColor?: "white" | "black";
}

export function Board({ playerColor = "white" }: BoardProps) {
  const game = useMemo(() => new Chess(), []);

  return (
    <div className="w-full aspect-square max-w-2xl rounded-lg overflow-hidden shadow-lg">
      <Chessboard
        options={{
          position: game.fen(),
          boardOrientation: playerColor,
          allowDragging: false,
          showNotation: true,
          lightSquareStyle: { backgroundColor: "#b8a06d" }, // board-light
          darkSquareStyle: { backgroundColor: "#2c5233" }, // board-dark
        }}
      />
    </div>
  );
}
