"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeftRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import { HomePanel } from "@/components/HomePanel";
import { RepertoirePanel } from "@/components/RepertoirePanel";
import { Board, BoardHandle } from "@/components/Board";
import { BoardControls } from "@/components/BoardControls";
import { Button } from "@/components/ui/button";

type View = "home" | "repertoire";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [view, setView] = useState<View>("home");
  const [selectedColor, setSelectedColor] = useState<"white" | "black">(
    "white",
  );
  const [initialMoves, setInitialMoves] = useState<string[]>([]);
  const [initialFen, setInitialFen] = useState<string>("");
  const boardRef = useRef<BoardHandle>(null);

  useEffect(() => {
    // If session is loaded and user is not authenticated, redirect to landing page
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    // Read color from query params and set it
    const colorParam = searchParams.get("color");
    if (colorParam === "white" || colorParam === "black") {
      setSelectedColor(colorParam);
    }
  }, [searchParams]);

  useEffect(() => {
    // Reset board when coming back from build/training pages
    // The board should be reset to initial state when on the home page
    boardRef.current?.reset();
  }, []);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const handleSelectRepertoire = (color: "white" | "black") => {
    setSelectedColor(color);
    setView("repertoire");
  };

  const handleBack = () => {
    setView("home");
  };

  const handleStartPractice = () => {
    router.push("/training");
  };

  const handleBuild = (openingId?: string, lineId?: string) => {
    const params = new URLSearchParams();
    if (openingId) params.set("opening", openingId);
    if (lineId) params.set("line", lineId);
    const query = params.toString();
    router.push(`/build/${selectedColor}${query ? `?${query}` : ""}`);
  };

  const handleLearn = (openingId?: string, lineId?: string) => {
    const params = new URLSearchParams();
    params.set("color", selectedColor);
    params.set("mode", "practice"); // Practice mode - no SRS updates
    if (openingId) params.set("opening", openingId);
    if (lineId) params.set("line", lineId);
    router.push(`/training?${params.toString()}`);
  };

  const handleLineClick = (moves: string[], startingFen: string) => {
    // Create a new array reference to ensure React detects the change
    setInitialMoves([...moves]);
    setInitialFen(startingFen);
  };

  const handleDelete = async (nodeId: string) => {
    const response = await fetch(`/api/repertoire-entries/${nodeId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to delete line");
    }

    // Refresh the page to reflect the changes
    window.location.reload();
  };

  const handleRotateBoard = () => {
    setSelectedColor(selectedColor === "white" ? "black" : "white");
  };

  const handleMoveMade = (move: { from: string; to: string; san: string }) => {
    router.push(`/build/${selectedColor}?move=${move.san}`);
  };

  return (
    <div className="h-screen bg-background flex">
      {/* Left Panel - Board */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-w-0 h-screen">
        {/* Logo in corner */}
        <div className="absolute top-4 left-4">
          <Logo size="xl" />
        </div>

        <div className="w-full max-w-2xl h-full flex flex-col items-center justify-center gap-4">
          {/* Player Info - Top */}
          <div className="h-14 flex items-center gap-4 px-1">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                selectedColor === "black"
                  ? "bg-zinc-100"
                  : "bg-zinc-800 border border-zinc-700"
              }`}>
              <span
                className={`text-lg font-medium ${
                  selectedColor === "black" ? "text-zinc-800" : "text-zinc-300"
                }`}>
                {selectedColor === "black" ? "W" : "B"}
              </span>
            </div>
            <p className="text-base text-muted-foreground">
              {selectedColor === "black" ? "White" : "Black"}
            </p>
          </div>

          {/* Chessboard */}
          <Board
            ref={boardRef}
            playerColor={selectedColor}
            onMoveMade={handleMoveMade}
            initialMoves={initialMoves}
            initialFen={initialFen}
          />

          {/* Player Info - Bottom */}
          <div className="h-14 flex items-center gap-4 px-1">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                selectedColor === "white"
                  ? "bg-zinc-100"
                  : "bg-zinc-800 border border-zinc-700"
              }`}>
              <span
                className={`text-lg font-medium ${
                  selectedColor === "white" ? "text-zinc-800" : "text-zinc-300"
                }`}>
                {selectedColor === "white" ? "W" : "B"}
              </span>
            </div>
            <p className="text-base text-foreground font-medium">You</p>
          </div>

          {/* Board Controls */}
          <div className="flex items-center gap-3">
            <BoardControls
              onFirstMove={() => boardRef.current?.goToFirst()}
              onPreviousMove={() => boardRef.current?.goToPrevious()}
              onNextMove={() => boardRef.current?.goToNext()}
              onLastMove={() => boardRef.current?.goToLast()}
              onReset={() => boardRef.current?.reset()}
            />
            <Button
              variant="ghost"
              className="h-12 w-12 p-0 text-muted-foreground hover:text-foreground [&_svg]:size-auto"
              title="Rotate board"
              onClick={handleRotateBoard}>
              <ArrowLeftRight size={26} />
            </Button>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <aside className="w-96 xl:w-[28rem] border-l border-border bg-surface-1 flex-shrink-0 flex flex-col overflow-hidden">
        {view === "home" ? (
          <HomePanel
            onSelectRepertoire={handleSelectRepertoire}
            onStartPractice={handleStartPractice}
          />
        ) : (
          <RepertoirePanel
            color={selectedColor}
            onBack={handleBack}
            onBuild={handleBuild}
            onLearn={handleLearn}
            onDelete={handleDelete}
            onLineClick={handleLineClick}
          />
        )}
      </aside>
    </div>
  );
}
