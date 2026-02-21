"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { MobileNav } from "@/components/MobileNav";
import { Board, BoardHandle } from "@/components/Board";
import { BuildPanel } from "@/components/BuildPanel";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { convertSanToUci } from "@/lib/repertoire";
import { useToast } from "@/components/ui/toast";
import { useAsyncAction } from "@/hooks/useAsyncAction";

interface Move {
  number: number;
  white: string;
  whiteUci: string;
  black?: string;
  blackUci?: string;
}

export default function BuildClient({
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
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const moveParam = searchParams.get("move");
  const [initialMoves, setInitialMoves] = useState<string[]>([]);
  const [initialFen, setInitialFen] = useState<string | undefined>(undefined);

  // Read from sessionStorage on mount
  useEffect(() => {
    const fenFromSession = sessionStorage.getItem("buildFen");
    const moveSequenceFromSession = sessionStorage.getItem("buildMoveSequence");
    const moveFromSession = sessionStorage.getItem("buildMove");

    if (moveSequenceFromSession) {
      const moves = moveSequenceFromSession
        .split(" ")
        .filter((m) => m.length > 0)
        .map((part) => {
          return part.includes(".") ? part.split(".")[1] : part;
        })
        .filter((m) => m && m.length > 0);
      setInitialMoves(moves);
    } else if (moveFromSession) {
      setInitialMoves([moveFromSession]);
    } else if (moveParam) {
      setInitialMoves([moveParam]);
    }

    if (fenFromSession && !moveSequenceFromSession) {
      setInitialFen(fenFromSession);
    }

    // Clear sessionStorage after reading
    sessionStorage.removeItem("buildOpeningId");
    sessionStorage.removeItem("buildLineId");
    sessionStorage.removeItem("buildFen");
    sessionStorage.removeItem("buildMoveSequence");
    sessionStorage.removeItem("buildMove");
  }, [moveParam]);

  const handleMovesUpdated = useCallback((updatedMoves: Move[]) => {
    setMoves(updatedMoves);
    setCurrentMoveIndex(updatedMoves.length);
    setHasInitialized(true);
  }, []);

  useEffect(() => {
    if (hasInitialized && initialMoves.length > 0) {
      setCurrentMoveIndex(moves.length);
    }
  }, [hasInitialized, moves.length, initialMoves.length]);

  const handleBack = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("buildReturnColor", color);
    }
    router.back();
  };

  const performSaveLine = useCallback(async () => {
    if (moves.length === 0) {
      throw new Error("Make some moves on the board first");
    }

    const movesInSan = moves.flatMap((move) => {
      const result = [move.white];
      if (move.black) result.push(move.black);
      return result;
    });

    let movesInUci: string[];
    try {
      movesInUci = convertSanToUci(movesInSan);
    } catch (error) {
      throw new Error("One of the moves is invalid. Please try again.");
    }

    const baseUrl = window.location.origin; // gets current site origin
    const response = await fetch(
      `${baseUrl}/api/repertoire-entries/save-line`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          color,
          movesInSan,
          movesInUci,
        }),
      },
    );

    let data;
    try {
      data = await response.json();
    } catch (e) {
      console.error(
        "Failed to parse response:",
        response.status,
        response.statusText,
      );
      throw new Error("Something went wrong. Please try again.");
    }

    if (!response.ok) {
      const errorMsg = data.error?.toLowerCase() || "";

      if (
        errorMsg.includes("end with a white move") ||
        errorMsg.includes("end with a black move") ||
        errorMsg.includes("must end with")
      ) {
        throw new Error(
          `Your line should end with your move (${color}), not your opponent's.`,
        );
      } else if (
        errorMsg.includes("unauthorized") ||
        errorMsg.includes("sign in")
      ) {
        throw new Error("Please sign in to save your repertoire.");
      } else {
        throw new Error(
          data.error || "Couldn't save the line. Please try again.",
        );
      }
    }

    return data;
  }, [moves, color]);

  const { isLoading: isSavingLine, execute: handleAddMove } = useAsyncAction(
    performSaveLine,
    (data) => {
      toast.success(`Line saved! ${data.entriesCreated} positions added.`);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("buildReturnColor", color);
      }
      router.back();
    },
    (error) => {
      toast.error(error.message);
    },
  );

  const handleDeleteMove = (moveIndex: number) => {
    boardRef.current?.deleteToMove(moveIndex * 2);
  };

  const currentMove = moves[currentMoveIndex - 1];

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      <MobileNav
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onLogoClick={handleBack}
      />

      {isSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-6 min-w-0 min-h-screen pt-20 lg:pt-6 relative">
        <div className="absolute top-4 left-4 hidden lg:block">
          <Logo size="xl" />
        </div>

        <div className="w-full max-w-2xl h-full flex flex-col items-center justify-center gap-2 lg:gap-4">
          <div className="w-full px-1 h-10 lg:h-14 flex items-center">
            {currentMove && (
              <div className="bg-surface-2 rounded-lg px-3 lg:px-4 py-2 lg:py-3 border border-border/50 inline-flex items-center gap-2 lg:gap-3">
                <span className="text-xs lg:text-sm text-muted-foreground">
                  Position after
                </span>
                <span className="text-sm lg:text-base font-mono text-foreground">
                  {currentMoveIndex}. {currentMove.white}
                  {currentMove.black && ` ${currentMove.black}`}
                </span>
              </div>
            )}
          </div>

          <Board
            ref={boardRef}
            playerColor={color}
            buildMode={true}
            onMovesUpdated={handleMovesUpdated}
            initialMoves={initialMoves}
            initialFen={initialFen}
          />

          <div className="text-center h-10 lg:h-14 flex items-center justify-center w-full">
            {(() => {
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
                <div
                  className={`inline-flex items-center gap-2 px-3 lg:px-4 py-1.5 lg:py-2 rounded-xl ${
                    isUserTurn
                      ? "bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30"
                      : "bg-surface-2/50 border border-border/30"
                  }`}>
                  {isUserTurn && (
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  )}
                  <p
                    className={`text-xs lg:text-sm font-medium ${isUserTurn ? "text-foreground" : "text-muted-foreground"}`}>
                    {message}
                  </p>
                </div>
              );
            })()}
          </div>

          <div className="hidden lg:flex items-center gap-3 invisible">
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

          <div className="lg:hidden w-full max-w-2xl px-4">
            <Button
              className="w-full h-12 text-sm btn-primary-gradient rounded-xl font-medium gap-2"
              onClick={() => handleAddMove()}
              disabled={moves.length === 0 || isSavingLine}>
              <Save size={18} />
              {isSavingLine ? "Saving..." : "Save Line"}
            </Button>
            {moves.length > 0 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                This will add {moves.length} positions to your repertoire
              </p>
            )}
          </div>
        </div>
      </div>

      <aside
        className={`fixed lg:relative top-14 lg:top-0 right-0 z-40 w-80 lg:w-96 xl:w-[28rem] h-[calc(100vh-3.5rem)] lg:h-screen border-l border-border bg-solid flex-shrink-0 flex flex-col overflow-hidden transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}>
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
