"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
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
  const { data: session, status } = useSession();
  const [view, setView] = useState<View>("home");
  const [selectedColor, setSelectedColor] = useState<"white" | "black">(
    "white"
  );
  const boardRef = useRef<BoardHandle>(null);

  useEffect(() => {
    // If session is loaded and user is not authenticated, redirect to auth
    if (status === "unauthenticated") {
      router.push("/auth");
    }
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
    router.push("/training?color=white");
  };

  const handleBuild = (openingId?: string, lineId?: string) => {
    const params = new URLSearchParams();
    if (openingId) params.set("opening", openingId);
    if (lineId) params.set("line", lineId);
    const query = params.toString();
    router.push(
      `/repertoire?color=${selectedColor}${query ? `&${query}` : ""}`
    );
  };

  const handleLearn = (openingId?: string, lineId?: string) => {
    const params = new URLSearchParams();
    if (openingId) params.set("opening", openingId);
    if (lineId) params.set("line", lineId);
    const query = params.toString();
    router.push(`/training?color=${selectedColor}${query ? `&${query}` : ""}`);
  };

  const handleRotateBoard = () => {
    setSelectedColor(selectedColor === "white" ? "black" : "white");
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Panel - Board */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-w-0">
        {/* Logo in corner */}
        <div className="absolute top-4 left-4">
          <Logo size="xl" />
        </div>

        <div className="w-full max-w-4xl h-full flex flex-col items-center justify-center gap-4">
          {/* Player Info - Top */}
          <div className="flex items-center gap-4 mb-3 px-1">
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
          <Board ref={boardRef} playerColor={selectedColor} />

          {/* Player Info - Bottom */}
          <div className="flex items-center gap-4 mt-3 px-1">
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
          <div className="mt-4 flex items-center gap-3">
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
      <aside className="w-96 xl:w-[28rem] border-l border-border bg-surface-1 flex-shrink-0">
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
          />
        )}
      </aside>
    </div>
  );
}
