"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Board, BoardHandle } from "@/components/Board";
import { BuildPanel } from "@/components/BuildPanel";
import { convertSanToUci } from "@/lib/repertoire";
import { useToast } from "@/components/ui/toast";

interface Move {
  number: number;
  white: string;
  whiteUci: string;
  black?: string;
  blackUci?: string;
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
  const { showToast } = useToast();

  const moveParam = searchParams.get("move");
  const initialMoves = useMemo(
    () => (moveParam ? [moveParam] : []),
    [moveParam],
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

  const handleAddMove = async () => {
    if (moves.length === 0) {
      showToast("No moves to save", "warning");
      return;
    }

    try {
      // Convert Move objects to SAN format
      const movesInSan = moves.flatMap((move) => {
        const result = [move.white];
        if (move.black) result.push(move.black);
        return result;
      });

      // Convert SAN to UCI format
      let movesInUci: string[];
      try {
        movesInUci = convertSanToUci(movesInSan);
      } catch (error) {
        showToast(`Invalid move: ${(error as Error).message}`, "error");
        return;
      }

      const response = await fetch("/api/repertoire-entries/save-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          color,
          movesInSan,
          movesInUci,
        }),
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        console.error(
          "Failed to parse response:",
          response.status,
          response.statusText,
        );
        showToast(
          `Server returned ${response.status} ${response.statusText}`,
          "error",
        );
        return;
      }

      if (!response.ok) {
        showToast(data.error || "Failed to save line", "error");
        return;
      }

      showToast("Line saved!", "success");
      router.replace(`/home?view=repertoire&color=${color}`);
    } catch (error) {
      showToast((error as Error).message, "error");
    }
  };

  const handleDeleteMove = (moveIndex: number) => {
    // moveIndex is the index in the moves array (Move objects)
    // Each Move object represents 2 half-moves (white and black)
    // So to keep up to moveIndex, we keep moveIndex * 2 SAN moves
    boardRef.current?.deleteToMove(moveIndex * 2);
  };

  const currentMove = moves[currentMoveIndex - 1];

  return (
    <div className="h-screen bg-background flex">
      {/* Left Panel - Board */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-w-0 h-screen">
        {/* Logo in corner */}
        <div className="absolute top-4 left-4">
          <Logo size="xl" />
        </div>

        <div className="w-full max-w-2xl h-full flex flex-col items-center justify-center gap-4">
          {/* Position indicator */}
          <div className="w-full px-1 h-14 flex items-center">
            {currentMove && (
              <div className="bg-surface-2 rounded-lg px-4 py-3 border border-border/50 inline-flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  Position after
                </span>
                <span className="text-base font-mono text-foreground">
                  {currentMoveIndex}. {currentMove.white}
                  {currentMove.black && ` ${currentMove.black}`}
                </span>
              </div>
            )}
          </div>

          {/* Board */}
          <Board
            ref={boardRef}
            playerColor={color}
            buildMode={true}
            onMovesUpdated={handleMovesUpdated}
            initialMoves={initialMoves}
          />

          {/* Hint */}
          <div className="text-center h-14 flex items-center">
            <p className="text-base text-muted-foreground">
              {(() => {
                // Determine whose turn it is based on the moves array
                // If the last move is complete (has both white and black), it's the player's turn
                // If the last move is incomplete (only white, no black), it's the opponent's turn
                const lastMove = moves[moves.length - 1];
                const isOpponentTurn = lastMove && !lastMove.black;

                if (color === "white") {
                  if (isOpponentTurn) {
                    return "Black's turn. Click a square to add response.";
                  } else {
                    return "White's turn. Click a square to add move.";
                  }
                } else {
                  // Black repertoire
                  if (isOpponentTurn) {
                    return "Black's turn. Click a square to add response.";
                  } else {
                    return "White's turn. Click a square to add move.";
                  }
                }
              })()}
            </p>
          </div>

          {/* Invisible placeholder for board controls alignment */}
          <div className="flex items-center gap-3 invisible">
            <div className="flex items-center justify-center gap-3">
              <button className="h-14 w-14 p-0" />
              <button className="h-14 w-14 p-0" />
              <button className="h-14 w-14 p-0" />
              <button className="h-14 w-14 p-0" />
              <div className="w-px h-10 bg-border mx-3" />
              <button className="h-14 w-14 p-0" />
            </div>
            <button className="h-12 w-12 p-0" />
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <aside className="w-96 xl:w-[28rem] border-l border-border bg-surface-1 flex-shrink-0 flex flex-col overflow-hidden">
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
