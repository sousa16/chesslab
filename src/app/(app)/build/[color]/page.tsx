"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Board, BoardHandle } from "@/components/Board";
import { BuildPanel } from "@/components/BuildPanel";

interface Move {
  number: number;
  white: string;
  black?: string;
}

export default function BuildPage({
  params,
}: {
  params: { color: "white" | "black" };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeParams = useParams();
  const color = (routeParams.color as "white" | "black") || "white";
  const boardRef = useRef<BoardHandle>(null);

  const openingId = searchParams.get("opening");
  const lineId = searchParams.get("line");

  const [moves, setMoves] = useState<Move[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);

  const moveParam = searchParams.get("move");
  const initialMoves = useMemo(
    () => (moveParam ? [moveParam] : []),
    [moveParam]
  );

  const handleMovesUpdated = useCallback((updatedMoves: Move[]) => {
    setMoves(updatedMoves);
    setCurrentMoveIndex(updatedMoves.length);
  }, []);

  // If a move was passed in the URL, we need to replay it on the board
  // This happens when navigating from the home page
  useEffect(() => {
    const moveParam = searchParams.get("move");
    if (moveParam && boardRef.current) {
      // The Board will have already made the move via buildMode and onBuildMove
      // So we just need to wait for onMovesUpdated to be called
    }
  }, [searchParams]);

  const handleBack = () => {
    router.back();
  };

  const handleAddMove = () => {
    // Save line logic here
    handleBack();
  };

  const handleDeleteMove = (moveIndex: number) => {
    // moveIndex is the index in the moves array (Move objects)
    // Each Move object represents 2 half-moves (white and black)
    // So to keep up to moveIndex, we keep moveIndex * 2 SAN moves
    boardRef.current?.deleteToMove(moveIndex * 2);
  };

  const currentMove = moves[currentMoveIndex - 1];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Panel - Board */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-w-0">
        {/* Logo in corner */}
        <div className="absolute top-4 left-4">
          <Logo size="xl" />
        </div>

        <div className="w-full max-w-2xl flex flex-col items-center gap-4">
          {/* Position indicator */}
          {currentMove && (
            <div className="w-full px-1">
              <div className="bg-surface-2 rounded-lg px-4 py-3 border border-border/50 inline-flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  Position after
                </span>
                <span className="text-base font-mono text-foreground">
                  {currentMoveIndex}. {currentMove.white}
                  {currentMove.black && ` ${currentMove.black}`}
                </span>
              </div>
            </div>
          )}

          {/* Board */}
          <Board
            ref={boardRef}
            playerColor={color}
            buildMode={true}
            onMovesUpdated={handleMovesUpdated}
            initialMoves={initialMoves}
          />

          {/* Hint */}
          <div className="text-center">
            <p className="text-base text-muted-foreground">
              {color === "white"
                ? "Black's turn. Click a square to add response."
                : "White's turn. Click a square to add move."}
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <aside className="w-96 xl:w-[28rem] border-l border-border bg-surface-1 flex-shrink-0">
        <BuildPanel
          color={color}
          onBack={handleBack}
          moves={moves}
          currentMoveIndex={currentMoveIndex}
          onAddMove={handleAddMove}
          onDeleteMove={handleDeleteMove}
        />
      </aside>
    </div>
  );
}
