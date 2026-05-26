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
import { useStartNavTransition } from "@/components/NavProgress";
import type { TrainingStats } from "@/lib/trainingStats";

type View = "home" | "repertoire";

interface HomeClientProps {
  // Passed in from the /home server page. HomePanel `use()`s it for a
  // cold load; revisits prefer the JS module cache and the promise
  // resolves silently in the background.
  statsPromise: Promise<TrainingStats | null>;
}

export default function HomeClient({ statsPromise }: HomeClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  // Wrap nav handlers that need side effects (sessionStorage writes)
  // inside the provider's transition so the global progress bar tracks
  // the FULL navigation — including the server-side data fetch on the
  // destination route, not just the URL flip.
  const startNavTransition = useStartNavTransition();

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
  const [lineOpening, setLineOpening] = useState<{
    name: string;
    eco: string | null;
  } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const boardRef = useRef<BoardHandle>(null);

  // Prefetch both build pages so navigation is instant when a piece is moved.
  // Also prefetch /training so Practice Now is instant from cold.
  useEffect(() => {
    router.prefetch("/build/white");
    router.prefetch("/build/black");
    router.prefetch("/training?mode=review");
  }, [router]);

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

  // Going back to home should leave the board in a clean state: clear the
  // saved-line preview AND drop the Board's internal move history so the
  // "Viewing move history" overlay doesn't linger after the panel swap.
  const handleGoHome = () => {
    setInitialMoves([]);
    setInitialFen("");
    setLineOpening(null);
    boardRef.current?.reset();
    setView("home");
  };

  const handleBack = handleGoHome;

  const handleStartPractice = () => {
    startNavTransition(() => {
      router.push("/training?mode=review");
    });
  };

  const handleBuild = (
    openingId?: string,
    lineId?: string,
    fen?: string,
    sanMoves?: string[],
  ) => {
    startNavTransition(() => {
      if (openingId) sessionStorage.setItem("buildOpeningId", openingId);
      if (lineId) sessionStorage.setItem("buildLineId", lineId);
      if (fen && (!sanMoves || sanMoves.length === 0)) {
        sessionStorage.setItem("buildFen", fen);
      }
      if (sanMoves && sanMoves.length > 0) {
        sessionStorage.setItem("buildSanMoves", JSON.stringify(sanMoves));
      }
      router.push(`/build/${selectedColor}`);
    });
  };

  const handleLearn = (openingId?: string, lineId?: string) => {
    startNavTransition(() => {
      if (openingId) sessionStorage.setItem("practiceOpeningId", openingId);
      // Pass lineId on the URL so the server training page can scope the
      // practice queue to this line's path (leaf + ancestors). The
      // previous sessionStorage hand-off was never read — clicking
      // "practice this line" silently fell back to "practice everything".
      const linePart = lineId ? `&line=${encodeURIComponent(lineId)}` : "";
      router.push(
        `/training?mode=practice&color=${selectedColor}${linePart}`,
      );
    });
  };

  const handleLearnFamily = (family: string) => {
    startNavTransition(() => {
      router.push(
        `/training?mode=practice&color=${selectedColor}&family=${encodeURIComponent(family)}`,
      );
    });
  };

  const handleLineClick = (
    moves: string[],
    openingName: string | null,
    openingEco: string | null,
  ) => {
    // node.sanMoves is the FULL path from the standard starting position, so
    // Board needs to replay from the default start (not from node.fen, which
    // is mid-game and would silently drop every replay).
    setInitialMoves([...moves]);
    setInitialFen("");
    setLineOpening(openingName ? { name: openingName, eco: openingEco } : null);
  };

  const handleDelete = async (nodeId: string) => {
    const response = await fetch(`/api/repertoire-entries/${nodeId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to delete line");
    }
    // Fire the shared bus event that both RepertoirePanel and HomePanel
    // already listen to. A detail without `positionsReviewed` triggers
    // a tree refetch (review writes use that field to suppress it).
    // Previously we did a full window.location.reload() — that dropped
    // the user's scroll position and tore down every other open panel.
    try {
      window.dispatchEvent(new CustomEvent("training-stats-updated"));
    } catch {
      /* non-browser env — no-op */
    }
  };

  const handleRotateBoard = () =>
    setSelectedColor(selectedColor === "white" ? "black" : "white");

  const handleMoveMade = (move: { from: string; to: string; san: string }) => {
    sessionStorage.setItem("buildMove", move.san);
    router.push(`/build/${selectedColor}`);
  };

  return (
    <div className="h-[100dvh] bg-background flex flex-col lg:flex-row overflow-hidden">
      <MobileNav
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onLogoClick={handleGoHome}
        onBack={view === "repertoire" ? handleGoHome : undefined}
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
          <Logo size="xl" clickable={true} onLogoClick={handleGoHome} />
        </div>

        {/* Inner column — fills height and centres content */}
        <div className="w-full max-w-xl flex-1 flex flex-col items-center gap-2 lg:gap-3 min-h-0 justify-start pt-4 lg:justify-center lg:pt-0">
          {/* Opening name banner (shown when viewing a saved line) */}
          {lineOpening && initialMoves.length > 0 && (
            <div className="px-3 py-1.5 rounded-full bg-surface-2/60 border border-border/50 flex-shrink-0 max-w-full overflow-hidden">
              <span className="block text-sm font-medium text-foreground truncate">
                {lineOpening.name}
              </span>
            </div>
          )}

          {/* Opponent label — desktop only. On mobile the board orientation
              already tells you which color the user plays, and the limited
              vertical space is better spent on the board itself. */}
          <div className="hidden lg:flex items-center gap-3 px-1 flex-shrink-0">
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
              // When the user clicks a saved line we want them to SEE how
              // the position was reached, not just the final state. Land
              // on the initial position so they can step forward through
              // the line with the BoardControls below.
              landAtStart={initialMoves.length > 0}
            />
          </div>

          {/* Player label — desktop only (see opponent-label note). */}
          <div className="hidden lg:flex items-center gap-3 px-1 flex-shrink-0">
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
            statsPromise={statsPromise}
          />
        ) : (
          <RepertoirePanel
            color={selectedColor}
            onBack={handleBack}
            onBuild={handleBuild}
            onLearn={handleLearn}
            onLearnFamily={handleLearnFamily}
            onDelete={handleDelete}
            onLineClick={handleLineClick}
          />
        )}
      </aside>
    </div>
  );
}
