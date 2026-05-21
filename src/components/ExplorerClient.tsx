"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { ChevronLeft, Compass, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { MobileNav } from "@/components/MobileNav";
import { Board, BoardHandle } from "@/components/Board";

interface ExplorerEntry {
  fen: string; // position where the user is to move (key for lookup)
  expectedMove: string; // UCI
}

interface ExplorerRepertoire {
  color: "white" | "black";
  entries: ExplorerEntry[];
}

interface ExplorerClientProps {
  repertoires: ExplorerRepertoire[];
}

// Strip halfmove/fullmove fields so FENs compare cleanly across sources.
function fenKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

function uciToSanFromFen(fen: string, uci: string): string {
  try {
    const g = new Chess(fen);
    const m = g.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4) || undefined,
    });
    return m ? m.san : uci;
  } catch {
    return uci;
  }
}

interface PlyAnalysis {
  ply: number; // 1-based ply number (1 = first move played)
  moveNumber: number; // 1-based full move number
  isWhiteTurn: boolean; // whose turn it was BEFORE this move
  san: string; // the move actually played
  beforeFen: string; // position before this move
  userTurn: boolean; // was it the user's turn at this position?
  inRepertoire: boolean; // did the user have an entry at beforeFen?
  expectedSan: string | null; // user's planned move at this position (SAN)
  matchedPlan: boolean; // did the actual move match the plan?
}

export default function ExplorerClient({ repertoires }: ExplorerClientProps) {
  const router = useRouter();
  const boardRef = useRef<BoardHandle>(null);
  const [color, setColor] = useState<"white" | "black">("white");
  const [pgn, setPgn] = useState("");
  const [pgnError, setPgnError] = useState<string | null>(null);
  // SAN move list reflecting what's currently on the board. The Board
  // emits this via onMovesUpdated; we keep our own state so the sidebar
  // analysis re-renders whenever it changes.
  const [moves, setMoves] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Bumping a key forces Board to remount with the new initialMoves —
  // simpler than reaching into Board's imperative API for PGN loading.
  const [boardKey, setBoardKey] = useState(0);
  const [loadedMoves, setLoadedMoves] = useState<string[] | undefined>(
    undefined,
  );

  // Build per-color fen→expectedMove map for fast per-ply lookup.
  const entriesByColor = useMemo(() => {
    const map: Record<"white" | "black", Map<string, string>> = {
      white: new Map(),
      black: new Map(),
    };
    for (const rep of repertoires) {
      for (const e of rep.entries) {
        map[rep.color].set(fenKey(e.fen), e.expectedMove);
      }
    }
    return map;
  }, [repertoires]);

  const userEntries = entriesByColor[color];

  // Replay the SAN moves to derive per-ply analysis. The board itself
  // already holds the game; we re-derive here so the sidebar stays in sync
  // with the user's selected color without depending on the board's
  // internal state.
  const analysis = useMemo<PlyAnalysis[]>(() => {
    const result: PlyAnalysis[] = [];
    const g = new Chess();
    for (let i = 0; i < moves.length; i++) {
      const san = moves[i];
      const beforeFen = g.fen();
      const isWhiteTurn = g.turn() === "w";
      const userTurn =
        (color === "white" && isWhiteTurn) ||
        (color === "black" && !isWhiteTurn);
      const expectedUci = userEntries.get(fenKey(beforeFen)) ?? null;
      const expectedSan = expectedUci
        ? uciToSanFromFen(beforeFen, expectedUci)
        : null;
      const move = g.move(san);
      if (!move) break;
      result.push({
        ply: i + 1,
        moveNumber: Math.floor(i / 2) + 1,
        isWhiteTurn,
        san: move.san,
        beforeFen,
        userTurn,
        inRepertoire: expectedSan !== null,
        expectedSan,
        matchedPlan:
          expectedSan !== null && move.san === expectedSan,
      });
    }
    return result;
  }, [moves, userEntries, color]);

  // What position is currently on the board? After replaying all moves,
  // the current FEN is the one *after* the last move played. From the
  // perspective of "is this position in my repertoire?" we look up the
  // current FEN (whose turn determines whether it's a user-turn position).
  const currentFen = useMemo(() => {
    const g = new Chess();
    for (const san of moves) {
      if (!g.move(san)) break;
    }
    return g.fen();
  }, [moves]);

  const currentTurnIsWhite = currentFen.split(" ")[1] === "w";
  const currentIsUserTurn =
    (color === "white" && currentTurnIsWhite) ||
    (color === "black" && !currentTurnIsWhite);
  const currentExpectedUci =
    currentIsUserTurn ? userEntries.get(fenKey(currentFen)) ?? null : null;
  const currentExpectedSan = currentExpectedUci
    ? uciToSanFromFen(currentFen, currentExpectedUci)
    : null;

  // First ply where the user's turn position wasn't in the repertoire —
  // that's where the line "exits" the repertoire. Opponent-turn positions
  // don't count; we only consider where the user lacks a plan.
  const firstExitPly = useMemo(() => {
    for (const a of analysis) {
      if (a.userTurn && !a.inRepertoire) return a.ply;
    }
    if (currentIsUserTurn && !currentExpectedSan) {
      // We're already at a user-turn position past the last analyzed ply
      // (i.e., it's the user's turn NOW), and there's no plan here.
      return analysis.length + 1;
    }
    return null;
  }, [analysis, currentIsUserTurn, currentExpectedSan]);

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleBack = () => {
    router.push("/home");
    router.refresh();
  };

  const handleMovesUpdated = (
    pairedMoves: {
      number: number;
      white: string;
      black?: string;
    }[],
  ) => {
    const flat: string[] = [];
    for (const m of pairedMoves) {
      flat.push(m.white);
      if (m.black) flat.push(m.black);
    }
    setMoves(flat);
  };

  const handleLoadPgn = () => {
    setPgnError(null);
    if (!pgn.trim()) {
      setPgnError("Paste a PGN or move list first.");
      return;
    }
    try {
      const g = new Chess();
      // chess.js loadPgn throws on parse failure; on success it leaves the
      // game state at the end of the PGN. Works for both full PGNs (with
      // headers) and bare move lists like "1. e4 c5 2. Nf3".
      g.loadPgn(pgn, { strict: false });
      const sans = g.history();
      if (sans.length === 0) throw new Error("PGN contained no moves");
      setLoadedMoves(sans);
      setBoardKey((k) => k + 1); // force remount with new initialMoves
      setMoves(sans);
    } catch (err) {
      setPgnError(
        err instanceof Error ? err.message : "Failed to parse PGN",
      );
    }
  };

  const handleClear = () => {
    setLoadedMoves(undefined);
    setBoardKey((k) => k + 1);
    setMoves([]);
    setPgn("");
    setPgnError(null);
  };

  const handleAddCurrentToRepertoire = () => {
    // Stash the move list so the Build page can resume from this position
    // with the right SAN history already loaded.
    if (moves.length === 0) return;
    sessionStorage.setItem("buildSanMoves", JSON.stringify(moves));
    router.push(`/build/${color}`);
  };

  // ── UI ──────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-background flex flex-col lg:flex-row overflow-hidden">
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

      {/* Board panel */}
      <div className="flex-1 flex flex-col items-center px-4 lg:px-6 min-w-0 h-below-nav lg:h-screen mt-nav lg:mt-0 pb-2 lg:pb-6 relative overflow-hidden">
        <div className="absolute top-4 left-4 hidden lg:block">
          <Logo size="xl" clickable={true} onLogoClick={handleBack} />
        </div>

        <div className="w-full max-w-xl flex-1 flex flex-col items-center gap-2 lg:gap-3 min-h-0 justify-start pt-4 lg:justify-center lg:pt-0">
          <div className="px-3 py-1.5 rounded-full bg-surface-2/60 border border-border/50 flex-shrink-0">
            <span className="text-sm font-medium text-foreground">
              {currentTurnIsWhite ? "White" : "Black"} to move
            </span>
          </div>

          <div
            className="flex-shrink-0 w-full"
            style={{
              maxWidth: "min(100%, calc(100dvh - var(--mobile-nav-h) - 280px))",
            }}>
            <Board
              key={boardKey}
              ref={boardRef}
              playerColor={color}
              buildMode={true}
              initialMoves={loadedMoves}
              onMovesUpdated={handleMovesUpdated}
            />
          </div>

          {/* Current-position banner: either show the user's planned move
              from here, or surface that this position is out of repertoire
              with a shortcut to add it. */}
          <div className="w-full flex-shrink-0 min-h-[3rem]">
            {currentIsUserTurn ? (
              currentExpectedSan ? (
                <div className="glass-card rounded-xl p-3 lg:p-4 text-center border border-primary/30 bg-primary/5">
                  <p className="text-xs text-muted-foreground">
                    Your repertoire plays
                  </p>
                  <p className="text-xl font-mono font-bold text-foreground">
                    {currentExpectedSan}
                  </p>
                </div>
              ) : (
                <div className="glass-card rounded-xl p-3 lg:p-4 flex items-center justify-between gap-3 border border-amber-500/30 bg-amber-500/5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-amber-400">
                      Out of repertoire
                    </p>
                    <p className="text-xs text-muted-foreground">
                      No response saved for this position.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAddCurrentToRepertoire}
                    className="btn-primary-gradient flex-shrink-0"
                    disabled={moves.length === 0}
                    title={
                      moves.length === 0
                        ? "Play moves first to add this position"
                        : "Add to repertoire"
                    }>
                    <Plus size={14} className="mr-1" />
                    Add
                  </Button>
                </div>
              )
            ) : (
              <div className="text-center text-xs text-muted-foreground py-3">
                Opponent to move
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed lg:relative top-[var(--mobile-nav-h)] lg:top-0 right-0 z-40 w-80 lg:w-96 xl:w-[28rem] h-below-nav lg:h-screen border-l border-border bg-solid flex-shrink-0 flex flex-col overflow-hidden pb-safe transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}>
        <div className="p-4 lg:p-5 border-b border-border/50 glass-panel">
          <div className="flex items-center justify-between mb-3 lg:mb-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-xl -ml-2"
              onClick={handleBack}>
              <ChevronLeft size={20} />
            </Button>
            <div className="flex items-center gap-1.5 px-2.5 lg:px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium uppercase tracking-wide">
              <Compass size={12} />
              Explorer
            </div>
          </div>

          <h2 className="text-lg lg:text-xl font-semibold text-foreground">
            Repertoire Explorer
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Play moves or paste a PGN to see when the line leaves your
            repertoire.
          </p>
        </div>

        <div className="flex-1 p-4 lg:p-5 overflow-y-auto flex flex-col gap-4">
          {/* Color selector */}
          <div className="glass-card rounded-xl p-3 lg:p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Check against
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(["white", "black"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-9 rounded-lg text-sm font-medium border transition-colors capitalize ${
                    color === c
                      ? "bg-primary/20 border-primary/40 text-foreground"
                      : "bg-surface-2/40 border-border/40 text-muted-foreground hover:bg-surface-2"
                  }`}>
                  {c} repertoire
                </button>
              ))}
            </div>
          </div>

          {/* PGN paste */}
          <div className="glass-card rounded-xl p-3 lg:p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Load a game
            </p>
            <textarea
              value={pgn}
              onChange={(e) => setPgn(e.target.value)}
              placeholder="Paste PGN or move list..."
              rows={4}
              className="w-full text-xs font-mono rounded-lg bg-surface-2 border border-border/50 p-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
            {pgnError && (
              <p className="text-xs text-red-400 mt-1">{pgnError}</p>
            )}
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                onClick={handleLoadPgn}
                className="flex-1 btn-primary-gradient">
                Load
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleClear}
                className="flex-1">
                Clear board
              </Button>
            </div>
          </div>

          {/* Exit indicator */}
          {firstExitPly !== null && analysis.length > 0 && (
            <div className="glass-card rounded-xl p-3 lg:p-4 border border-amber-500/30 bg-amber-500/5">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
                Line exits at
              </p>
              <p className="text-sm text-foreground">
                Move {Math.ceil(firstExitPly / 2)}
                {firstExitPly % 2 === 1 ? "" : "…"} — no plan for that
                position in your {color} repertoire.
              </p>
            </div>
          )}

          {/* Per-ply analysis */}
          {analysis.length > 0 && (
            <div className="glass-card rounded-xl p-3 lg:p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Moves
              </p>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {analysis.map((a) => (
                  <PlyRow key={a.ply} a={a} />
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function PlyRow({ a }: { a: PlyAnalysis }) {
  const prefix = a.isWhiteTurn ? `${a.moveNumber}.` : `${a.moveNumber}…`;
  if (!a.userTurn) {
    // Opponent move — informational only.
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono w-10 tabular-nums">{prefix}</span>
        <span className="font-mono text-foreground">{a.san}</span>
      </div>
    );
  }
  // User-turn move — annotate against the plan.
  if (a.inRepertoire) {
    if (a.matchedPlan) {
      return (
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono w-10 tabular-nums text-muted-foreground">
            {prefix}
          </span>
          <span className="font-mono text-foreground">{a.san}</span>
          <span className="text-[10px] uppercase tracking-wide text-emerald-400">
            In line
          </span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono w-10 tabular-nums text-muted-foreground">
          {prefix}
        </span>
        <span className="font-mono text-foreground">{a.san}</span>
        <span className="text-[10px] uppercase tracking-wide text-blue-400">
          Diverged
        </span>
        <span className="text-[10px] text-muted-foreground">
          (you play {a.expectedSan})
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-mono w-10 tabular-nums text-muted-foreground">
        {prefix}
      </span>
      <span className="font-mono text-foreground">{a.san}</span>
      <span className="text-[10px] uppercase tracking-wide text-amber-400">
        Out of repertoire
      </span>
    </div>
  );
}
