"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeftRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import { MobileNav } from "@/components/MobileNav";
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

  // Check sessionStorage for return from build screen (before state initialization)
  const buildReturnColor =
    typeof window !== "undefined"
      ? sessionStorage.getItem("buildReturnColor")
      : null;

  // Initialize state directly from URL params or sessionStorage to avoid flash
  const initialView =
    searchParams.get("view") === "repertoire" || buildReturnColor
      ? "repertoire"
      : "home";
  const initialColor =
    (buildReturnColor as "white" | "black" | null) ||
    (searchParams.get("color") === "black" ? "black" : "white");

  const [view, setView] = useState<View>(initialView);
  const [selectedColor, setSelectedColor] = useState<"white" | "black">(
    initialColor,
  );
  const [initialMoves, setInitialMoves] = useState<string[]>([]);
  const [initialFen, setInitialFen] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const boardRef = useRef<BoardHandle>(null);

  useEffect(() => {
    // If session is loaded and user is not authenticated, redirect to landing page
    if (status === "unauthenticated") {
      router.push("/");
    }

    // Clear sessionStorage after reading on mount
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("buildReturnColor");
    }

    // Reset board when coming back from build/training pages
    boardRef.current?.reset();
  }, [status, router]);

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
    router.push("/training?mode=review");
  };

  const handleBuild = (
    openingId?: string,
    lineId?: string,
    fen?: string,
    moveSequence?: string,
  ) => {
    // Store build data in sessionStorage instead of URL params
    if (openingId) sessionStorage.setItem("buildOpeningId", openingId);
    if (lineId) sessionStorage.setItem("buildLineId", lineId);
    if (fen && !moveSequence) sessionStorage.setItem("buildFen", fen);
    if (moveSequence) sessionStorage.setItem("buildMoveSequence", moveSequence);
    router.push(`/build/${selectedColor}`);
  };

  const handleLearn = (openingId?: string, lineId?: string) => {
    // Store practice data in sessionStorage instead of URL params
    if (openingId) sessionStorage.setItem("practiceOpeningId", openingId);
    if (lineId) sessionStorage.setItem("practiceLineId", lineId);
    router.push(`/training?mode=practice&color=${selectedColor}`);
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
    // Store the move in sessionStorage instead of URL param
    sessionStorage.setItem("buildMove", move.san);
    router.push(`/build/${selectedColor}`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Mobile Navigation */}
      <MobileNav
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onLogoClick={() => setView("home")}
      />

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Left Panel - Board */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-6 min-w-0 min-h-screen pt-20 lg:pt-6 relative">
        {/* Logo in corner - hidden on mobile */}
        <div className="absolute top-4 left-4 hidden lg:block">
          <Logo
            size="xl"
            clickable={true}
            onLogoClick={() => setView("home")}
          />
        </div>

        <div className="w-full max-w-2xl h-full flex flex-col items-center justify-center gap-2 lg:gap-4">
          {/* Player Info - Top */}
          <div className="h-10 lg:h-14 flex items-center gap-3 lg:gap-4 px-1">
            <div
              className={`w-10 h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center ${
                selectedColor === "black"
                  ? "bg-zinc-100"
                  : "bg-zinc-800 border border-zinc-700"
              }`}>
              <span
                className={`text-base lg:text-lg font-medium ${
                  selectedColor === "black" ? "text-zinc-800" : "text-zinc-300"
                }`}>
                {selectedColor === "black" ? "W" : "B"}
              </span>
            </div>
            <p className="text-sm lg:text-base text-muted-foreground">
              {selectedColor === "black" ? "White" : "Black"}
            </p>
          </div>

          {/* Chessboard */}
          <Board
            ref={boardRef}
            playerColor={selectedColor}
            buildMode={true}
            onMoveMade={handleMoveMade}
            initialMoves={initialMoves}
            initialFen={initialFen}
          />

          {/* Player Info - Bottom */}
          <div className="h-10 lg:h-14 flex items-center gap-3 lg:gap-4 px-1">
            <div
              className={`w-10 h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center ${
                selectedColor === "white"
                  ? "bg-zinc-100"
                  : "bg-zinc-800 border border-zinc-700"
              }`}>
              <span
                className={`text-base lg:text-lg font-medium ${
                  selectedColor === "white" ? "text-zinc-800" : "text-zinc-300"
                }`}>
                {selectedColor === "white" ? "W" : "B"}
              </span>
            </div>
            <p className="text-sm lg:text-base text-foreground font-medium">You</p>
          </div>

          {/* Board Controls */}
          <div className="flex items-center gap-2 lg:gap-3">
            <BoardControls
              onFirstMove={() => boardRef.current?.goToFirst()}
              onPreviousMove={() => boardRef.current?.goToPrevious()}
              onNextMove={() => boardRef.current?.goToNext()}
              onLastMove={() => boardRef.current?.goToLast()}
              onReset={() => boardRef.current?.reset()}
            />
            <Button
              variant="ghost"
              className="h-10 w-10 lg:h-12 lg:w-12 p-0 text-muted-foreground hover:text-foreground [&_svg]:size-auto"
              title="Rotate board"
              onClick={handleRotateBoard}>
              <ArrowLeftRight size={22} className="lg:hidden" />
              <ArrowLeftRight size={26} className="hidden lg:block" />
            </Button>
          </div>

          {/* Mobile Start Practice Button - Below Board */}
          <div className="lg:hidden w-full max-w-2xl px-4 mt-6">
            <Button
              className="w-full h-12 text-sm btn-primary-gradient rounded-xl font-medium"
              onClick={handleStartPractice}>
              Start Practice
            </Button>
          </div>
        </div>
      </div>

      {/* Right Panel - Sidebar */}
      <aside
        className={`fixed lg:relative top-14 lg:top-0 right-0 z-40 w-80 lg:w-96 xl:w-[28rem] h-[calc(100vh-3.5rem)] lg:h-screen border-l border-border bg-background flex-shrink-0 flex flex-col overflow-hidden transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}>
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
