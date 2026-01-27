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
  const toast = useToast();

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
      toast.warning("Make some moves on the board first");
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
        toast.error("One of the moves is invalid. Please try again.");
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
        toast.error("Something went wrong. Please try again.");
        return;
      }

      if (!response.ok) {
        // User-friendly error messages based on common issues
        const errorMsg = data.error?.toLowerCase() || "";
        
        if (errorMsg.includes("end with a white move") || errorMsg.includes("end with a black move") || errorMsg.includes("must end with")) {
          toast.error(`Your line should end with your move (${color}), not your opponent's.`);
        } else if (errorMsg.includes("unauthorized") || errorMsg.includes("sign in")) {
          toast.error("Please sign in to save your repertoire.");
        } else {
          // Show the actual error message for debugging
          toast.error(data.error || "Couldn't save the line. Please try again.");
        }
        return;
      }

      toast.success(`Line saved! ${data.entriesCreated} positions added.`);
      
      // Navigate back to the repertoire view for this color instead of going back
      router.push(`/home?panel=repertoire&color=${color}`);
    } catch (error) {
      toast.error("Connection error. Please check your internet.");
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

          {/* Hint - Enhanced with better styling */}
          <div className="text-center h-14 flex items-center justify-center w-full">
            {(() => {
              // Determine whose turn it is based on the moves array
              const lastMove = moves[moves.length - 1];
              const isOpponentTurn = lastMove && !lastMove.black;
              
              let message = "";
              let isUserTurn = false;

              if (color === "white") {
                if (isOpponentTurn) {
                  message = "Black's turn. Click a square to add response.";
                  isUserTurn = false;
                } else {
                  message = "White's turn. Click a piece to make your move.";
                  isUserTurn = true;
                }
              } else {
                if (isOpponentTurn) {
                  message = "Black's turn. Click a piece to make your move.";
                  isUserTurn = true;
                } else {
                  message = "White's turn. Click a square to add response.";
                  isUserTurn = false;
                }
              }

              return (
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${
                  isUserTurn 
                    ? "bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30" 
                    : "bg-surface-2/50 border border-border/30"
                }`}>
                  {isUserTurn && (
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  )}
                  <p className={`text-sm font-medium ${
                    isUserTurn ? "text-foreground" : "text-muted-foreground"
                  }`}>
                    {message}
                  </p>
                </div>
              );
            })()}
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
