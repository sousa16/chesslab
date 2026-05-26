"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { MobileNav } from "@/components/MobileNav";
import { Board, BoardHandle } from "@/components/Board";
import { BuildPanel } from "@/components/BuildPanel";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { convertSanToUci } from "@/lib/chessMoves";
import { useToast } from "@/components/ui/toast";
import {
  incrementPendingSave,
  decrementPendingSave,
} from "@/lib/savesPending";

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
  const routeParams = useParams();
  const color = (routeParams.color as "white" | "black") || "white";
  const boardRef = useRef<BoardHandle>(null);
  const toast = useToast();

  const [moves, setMoves] = useState<Move[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSavingLine, setIsSavingLine] = useState(false);
  const [openingName, setOpeningName] = useState<string | null>(null);

  // Read sessionStorage synchronously during first render so the board gets
  // the correct position immediately — no empty-board flash before useEffect fires.
  const [initialMoves] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const sanFromSession = sessionStorage.getItem("buildSanMoves");
    const moveFromSession = sessionStorage.getItem("buildMove");
    if (sanFromSession) {
      try {
        const parsed = JSON.parse(sanFromSession);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (m): m is string => typeof m === "string" && m.length > 0,
          );
        }
      } catch {
        /* fall through */
      }
    }
    if (moveFromSession) return [moveFromSession];
    return [];
  });

  const [initialFen] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const fenFromSession = sessionStorage.getItem("buildFen");
    const sanFromSession = sessionStorage.getItem("buildSanMoves");
    return fenFromSession && !sanFromSession ? fenFromSession : undefined;
  });

  // Clean up sessionStorage after values have been read into state
  useEffect(() => {
    sessionStorage.removeItem("buildOpeningId");
    sessionStorage.removeItem("buildLineId");
    sessionStorage.removeItem("buildFen");
    sessionStorage.removeItem("buildSanMoves");
    sessionStorage.removeItem("buildMove");
  }, []);

  const handleMovesUpdated = useCallback((updatedMoves: Move[]) => {
    setMoves(updatedMoves);
    setCurrentMoveIndex(updatedMoves.length);
  }, []);

  // Flat SAN list (each ply individually). Drives both the opening-name
  // lookup and the "line must end with your move" guard below.
  const movesInSan = useMemo(() => {
    const out: string[] = [];
    for (const m of moves) {
      out.push(m.white);
      if (m.black) out.push(m.black);
    }
    return out;
  }, [moves]);

  // Debounced opening-name lookup. The eco dataset is server-side only
  // (~470 KB), so we hit a tiny API endpoint instead of bundling it.
  useEffect(() => {
    if (movesInSan.length === 0) {
      setOpeningName(null);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/openings/lookup?moves=${movesInSan.join(",")}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.match?.name) setOpeningName(data.match.name);
          else setOpeningName(null);
        })
        .catch(() => {
          /* aborted or network — silent */
        });
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [movesInSan]);

  // A line saves cleanly only when it ends with the user's own move:
  // white repertoire = odd ply count, black repertoire = even ply count.
  const endsWithUserMove = useMemo(() => {
    if (movesInSan.length === 0) return false;
    return color === "white"
      ? movesInSan.length % 2 === 1
      : movesInSan.length % 2 === 0;
  }, [movesInSan.length, color]);

  const handleBack = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("buildReturnColor", color);
    }
    router.back();
  };

  const handleAddMove = useCallback(() => {
    if (isSavingLine || moves.length === 0 || !endsWithUserMove) return;

    const movesInSanLocal = moves.flatMap((m) =>
      m.black ? [m.white, m.black] : [m.white],
    );

    let movesInUci: string[];
    try {
      movesInUci = convertSanToUci(movesInSanLocal);
    } catch {
      toast.error("One of the moves is invalid. Please try again.");
      return;
    }

    // Optimistic: navigate back immediately and surface the result via toast.
    // The save round-trip continues in the background; on failure, the user
    // gets an error toast on the home screen instead of waiting on the
    // build view.
    setIsSavingLine(true);
    sessionStorage.setItem("buildReturnColor", color);
    // Mark a save as in-flight BEFORE we navigate, so that a panel
    // mounting on /home immediately knows to wait for us instead of
    // racing past the not-yet-committed save.
    incrementPendingSave();
    router.back();

    fetch("/api/repertoire-entries/save-line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color, movesInSan: movesInSanLocal, movesInUci }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errMsg = (data?.error ?? "").toLowerCase();
          if (errMsg.includes("must end with")) {
            toast.error(
              `Couldn't save: line should end with your ${color} move.`,
            );
          } else if (errMsg.includes("unauthorized")) {
            toast.error("Please sign in to save your repertoire.");
          } else if (res.status === 429) {
            toast.error("Too many saves — please wait a moment and try again.");
          } else {
            toast.error(data?.error || "Couldn't save the line.");
          }
          return;
        }
        toast.success(`Line saved — ${data.entriesCreated} positions added.`);
        // Fire the app-wide event for any panel already mounted; the
        // pending-saves counter (decremented in finally below) covers
        // the case where the panel mounts AFTER this resolves.
        try {
          window.dispatchEvent(new CustomEvent("training-stats-updated"));
        } catch {
          /* SSR or no DOM — fine to drop. */
        }
      })
      .catch(() => {
        toast.error("Network error saving line.");
      })
      .finally(() => {
        decrementPendingSave();
      });
    // We don't reset isSavingLine — the component unmounts on router.back().
  }, [isSavingLine, moves, endsWithUserMove, color, router, toast]);

  const handleDeleteMove = (moveIndex: number) => {
    boardRef.current?.deleteToMove(moveIndex * 2);
  };

  const currentMove = moves[currentMoveIndex - 1];

  return (
    <div className="h-[100dvh] bg-background flex flex-col lg:flex-row overflow-hidden">
      <MobileNav
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onLogoClick={handleBack}
        onBack={handleBack}
      />

      {isSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col items-center px-4 lg:px-6 min-w-0 h-below-nav lg:h-screen mt-nav lg:mt-0 pb-2 lg:pb-6 relative overflow-hidden">
        <div className="absolute top-4 left-4 hidden lg:block">
          <Logo size="xl" />
        </div>

        <div className="w-full max-w-xl flex-1 flex flex-col items-center gap-2 lg:gap-3 min-h-0 justify-start pt-4 lg:justify-center lg:pt-0">
          {currentMove && (
            <div className="w-full px-1 flex items-center flex-shrink-0">
              <div className="bg-surface-2 rounded-lg px-3 py-2 border border-border/50 inline-flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Position after
                </span>
                <span className="text-sm font-mono text-foreground">
                  {`${currentMoveIndex}. ${currentMove.white}${currentMove.black ? ` ${currentMove.black}` : ""}`}
                </span>
              </div>
            </div>
          )}

          {/* Board */}
          <div
            className="flex-shrink-0 w-full"
            style={{
              maxWidth: "min(100%, calc(100dvh - var(--mobile-nav-h) - 180px))",
            }}>
            <Board
              ref={boardRef}
              playerColor={color}
              buildMode={true}
              onMovesUpdated={handleMovesUpdated}
              initialMoves={initialMoves}
              initialFen={initialFen}
            />
          </div>

          <div className="text-center flex items-center justify-center w-full flex-shrink-0">
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

          {/* Inline mobile Save — hidden while the sidebar overlay is open
              (BuildPanel's own footer Save takes over there) so the user
              never sees two active Save buttons at once. */}
          {!isSidebarOpen && (
            <div className="lg:hidden w-full max-w-2xl px-4 flex-shrink-0 mt-3">
              <Button
                className="w-full h-11 text-sm btn-primary-gradient rounded-xl font-medium gap-2"
                onClick={() => handleAddMove()}
                disabled={!endsWithUserMove || isSavingLine}>
                <Save size={18} />
                {isSavingLine ? "Saving..." : "Save Line"}
              </Button>
              {moves.length > 0 && !endsWithUserMove && (
                <p className="mt-2 text-xs text-muted-foreground text-center">
                  Add your {color === "white" ? "White" : "Black"} move to save
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <aside
        className={`fixed lg:relative top-[var(--mobile-nav-h)] lg:top-0 right-0 z-40 w-80 lg:w-96 xl:w-[28rem] h-below-nav lg:h-screen border-l border-border bg-solid flex-shrink-0 flex flex-col overflow-hidden pb-safe transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}>
        <BuildPanel
          color={color}
          onBack={handleBack}
          moves={moves}
          currentMoveIndex={currentMoveIndex}
          onAddMove={handleAddMove}
          onDeleteMove={handleDeleteMove}
          isSavingLine={isSavingLine}
          openingName={openingName}
          canSave={endsWithUserMove}
        />
      </aside>
    </div>
  );
}
