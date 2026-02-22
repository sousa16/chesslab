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

export default function HomeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  const buildReturnColor =
    typeof window !== "undefined"
      ? sessionStorage.getItem("buildReturnColor")
      : null;

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
    if (status === "unauthenticated") {
      router.push("/");
    }

    if (typeof window !== "undefined") {
      sessionStorage.removeItem("buildReturnColor");
    }

    boardRef.current?.reset();
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) return null;

  const handleSelectRepertoire = (color: "white" | "black") => {
    setSelectedColor(color);
    setView("repertoire");
  };

  const handleBack = () => setView("home");

  const handleStartPractice = () => router.push("/training?mode=review");

  const handleBuild = (
    openingId?: string,
    lineId?: string,
    fen?: string,
    moveSequence?: string,
  ) => {
    if (openingId) sessionStorage.setItem("buildOpeningId", openingId);
    if (lineId) sessionStorage.setItem("buildLineId", lineId);
    if (fen && !moveSequence) sessionStorage.setItem("buildFen", fen);
    if (moveSequence) sessionStorage.setItem("buildMoveSequence", moveSequence);
    router.push(`/build/${selectedColor}`);
  };

  const handleLearn = (openingId?: string, lineId?: string) => {
    if (openingId) sessionStorage.setItem("practiceOpeningId", openingId);
    if (lineId) sessionStorage.setItem("practiceLineId", lineId);
    router.push(`/training?mode=practice&color=${selectedColor}`);
  };

  const handleLineClick = (moves: string[], startingFen: string) => {
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
    window.location.reload();
  };

  const handleRotateBoard = () =>
    setSelectedColor(selectedColor === "white" ? "black" : "white");

  const handleMoveMade = (move: { from: string; to: string; san: string }) => {
    sessionStorage.setItem("buildMove", move.san);
    router.push(`/build/${selectedColor}`);
  };

  return (
    <div className="h-screen bg-background flex flex-col lg:flex-row overflow-hidden">
      <MobileNav
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onLogoClick={() => setView("home")}
      />

      {isSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main board area */}
      <div className="flex-1 flex flex-col items-center px-4 lg:px-6 min-w-0 h-below-nav lg:h-screen mt-nav lg:mt-0 pb-2 lg:pb-6 relative overflow-hidden">
        <div className="absolute top-4 left-4 hidden lg:block">
          <Logo
            size="xl"
            clickable={true}
            onLogoClick={() => setView("home")}
          />
        </div>

        {/* Inner column — fills height and centres content */}
        <div className="w-full max-w-xl flex-1 flex flex-col items-center gap-2 lg:gap-3 min-h-0 justify-center">
          {/* Opponent label */}
          <div className="flex items-center gap-3 px-1 flex-shrink-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                selectedColor === "black"
                  ? "bg-zinc-100"
                  : "bg-zinc-800 border border-zinc-700"
              }`}>
              <span
                className={`text-sm font-medium ${
                  selectedColor === "black" ? "text-zinc-800" : "text-zinc-300"
                }`}>
                {selectedColor === "black" ? "W" : "B"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {selectedColor === "black" ? "White" : "Black"}
            </p>
          </div>

          {/* Board — width = min(full column width, available height minus all other elements) */}
          <div
            className="flex-shrink-0 w-full"
            style={{
              maxWidth: "min(100%, calc(100dvh - var(--mobile-nav-h) - 220px))",
            }}>
            <Board
              ref={boardRef}
              playerColor={selectedColor}
              buildMode={true}
              onMoveMade={handleMoveMade}
              initialMoves={initialMoves}
              initialFen={initialFen}
            />
          </div>

          {/* Player label */}
          <div className="flex items-center gap-3 px-1 flex-shrink-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                selectedColor === "white"
                  ? "bg-zinc-100"
                  : "bg-zinc-800 border border-zinc-700"
              }`}>
              <span
                className={`text-sm font-medium ${
                  selectedColor === "white" ? "text-zinc-800" : "text-zinc-300"
                }`}>
                {selectedColor === "white" ? "W" : "B"}
              </span>
            </div>
            <p className="text-sm text-foreground font-medium">You</p>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <BoardControls
              onFirstMove={() => boardRef.current?.goToFirst()}
              onPreviousMove={() => boardRef.current?.goToPrevious()}
              onNextMove={() => boardRef.current?.goToNext()}
              onLastMove={() => boardRef.current?.goToLast()}
              onReset={() => boardRef.current?.reset()}
            />
            <Button
              variant="ghost"
              className="h-10 w-10 p-0 text-muted-foreground hover:text-foreground [&_svg]:size-auto"
              title="Rotate board"
              onClick={handleRotateBoard}>
              <ArrowLeftRight size={22} />
            </Button>
          </div>

          {/* Start Practice button — mobile only */}
          <div className="lg:hidden w-full px-4 flex-shrink-0 mt-3">
            <Button
              className="w-full h-11 text-sm btn-primary-gradient rounded-xl font-medium"
              onClick={handleStartPractice}>
              Start Practice
            </Button>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed lg:relative top-[var(--mobile-nav-h)] lg:top-0 right-0 z-40 w-80 lg:w-96 xl:w-[28rem] h-below-nav lg:h-screen border-l border-border bg-solid flex-shrink-0 flex flex-col overflow-y-auto pb-safe transition-transform duration-300 ease-in-out ${
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
