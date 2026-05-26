"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { ChevronLeft, Compass, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { MobileNav } from "@/components/MobileNav";
import { Board, BoardHandle } from "@/components/Board";
import { BoardControls } from "@/components/BoardControls";
import { useNavTransition } from "@/components/NavProgress";

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
  inRepertoire: boolean; // did the user have any entry at beforeFen?
  expectedSans: string[]; // all SAN responses the user has saved here
  matchedPlan: boolean; // did the actual move match any saved response?
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
  // simpler than reaching into Board's imperative API.
  const [boardKey, setBoardKey] = useState(0);
  const [loadedMoves, setLoadedMoves] = useState<string[] | undefined>(
    undefined,
  );
  // Index of the ply currently displayed on the board. -1 = starting
  // position, 0..moves.length-1 = position after that many moves played.
  // Updated whenever the Board's internal nav state changes.
  const [displayedIndex, setDisplayedIndex] = useState(-1);

  // `repertoires` is server-fetched and rides along in the RSC payload that
  // Next caches client-side. When the user routes away (e.g. to /build or
  // /gaps), saves a line, and comes back, the router will happily replay
  // the stale RSC — and the explorer will keep telling them the new line
  // is "out of repertoire". Forcing a refresh on mount re-pulls the RSC
  // from the server so the latest entries land in props.
  useEffect(() => {
    router.refresh();
  }, [router]);

  // Build per-color fen→expectedMoves map. We store an ARRAY of UCI moves
  // (one per repertoire entry at the same FEN) so multiple planned
  // responses to the same position both show up. The user said they don't
  // have multi-response lines yet but will eventually; this keeps the
  // model honest without later having to rework the lookup.
  const entriesByColor = useMemo(() => {
    const map: Record<"white" | "black", Map<string, string[]>> = {
      white: new Map(),
      black: new Map(),
    };
    for (const rep of repertoires) {
      for (const e of rep.entries) {
        const key = fenKey(e.fen);
        const list = map[rep.color].get(key);
        if (list) {
          if (!list.includes(e.expectedMove)) list.push(e.expectedMove);
        } else {
          map[rep.color].set(key, [e.expectedMove]);
        }
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
      const expectedUcis = userEntries.get(fenKey(beforeFen)) ?? [];
      const expectedSans = expectedUcis.map((uci) =>
        uciToSanFromFen(beforeFen, uci),
      );
      const move = g.move(san);
      if (!move) break;
      result.push({
        ply: i + 1,
        moveNumber: Math.floor(i / 2) + 1,
        isWhiteTurn,
        san: move.san,
        beforeFen,
        userTurn,
        inRepertoire: expectedSans.length > 0,
        expectedSans,
        matchedPlan: expectedSans.includes(move.san),
      });
    }
    return result;
  }, [moves, userEntries, color]);

  // Position currently displayed on the board. Reflects displayedIndex
  // (-1 = start, 0..moves.length-1 = after that many moves). Replaying
  // each time keeps us free of any reliance on Board's internal state.
  const currentFen = useMemo(() => {
    const g = new Chess();
    const limit = Math.min(moves.length, Math.max(0, displayedIndex + 1));
    for (let i = 0; i < limit; i++) {
      if (!g.move(moves[i])) break;
    }
    return g.fen();
  }, [moves, displayedIndex]);

  // Game-end status of the currently displayed position. We surface
  // checkmate / stalemate / draw on the turn banner so the board doesn't
  // misleadingly say "Black to move" when the position is mate.
  const gameStatus = useMemo(() => {
    try {
      const g = new Chess(currentFen);
      if (g.isCheckmate()) {
        const winner = g.turn() === "w" ? "Black" : "White";
        return { label: `Checkmate — ${winner} wins`, terminal: true } as const;
      }
      if (g.isStalemate()) {
        return { label: "Stalemate — Draw", terminal: true } as const;
      }
      if (g.isInsufficientMaterial()) {
        return {
          label: "Draw — Insufficient material",
          terminal: true,
        } as const;
      }
      if (g.isDraw()) {
        return { label: "Draw", terminal: true } as const;
      }
      const turn = g.turn() === "w" ? "White" : "Black";
      const check = g.inCheck() ? " • Check" : "";
      return { label: `${turn} to move${check}`, terminal: false } as const;
    } catch {
      return { label: "", terminal: false } as const;
    }
  }, [currentFen]);

  const currentTurnIsWhite = currentFen.split(" ")[1] === "w";
  const currentIsUserTurn =
    (color === "white" && currentTurnIsWhite) ||
    (color === "black" && !currentTurnIsWhite);
  const currentExpectedUcis = currentIsUserTurn
    ? userEntries.get(fenKey(currentFen)) ?? []
    : [];
  const currentExpectedSans = currentExpectedUcis.map((uci) =>
    uciToSanFromFen(currentFen, uci),
  );
  const currentHasPlan = currentExpectedSans.length > 0;

  // Where did the line leave the repertoire? Conceptually that's "the
  // last move the opponent played before the user had no plan." If the
  // user is white and after black's c5 the user has no entry, the exit
  // is black's c5 (the move that landed us in the unprepped position),
  // not the white move the user can't find.
  //
  // exitInfo carries:
  //  - exitPly: 1-based ply of the move that caused the exit (0 = no
  //    entry even at the starting position).
  //  - exitSan: SAN of that move (null when exitPly is 0).
  //  - moveLabel: "1...c5", "5.Bg5", etc. for display.
  const exitInfo = useMemo<
    | { exitPly: number; exitSan: string | null; moveLabel: string }
    | null
  >(() => {
    const labelFor = (ply: number, san: string | null) => {
      if (ply === 0) return "starting position";
      const moveNumber = Math.ceil(ply / 2);
      const isWhitePly = ply % 2 === 1;
      const sep = isWhitePly ? "." : "…";
      return `${moveNumber}${sep}${san ?? ""}`;
    };

    // Walk played plies. First user-turn position (BEFORE a move) with no
    // entry is where we got stuck — the exit move is the one BEFORE it.
    for (const a of analysis) {
      if (!a.userTurn) continue;
      if (a.inRepertoire) continue;
      const exitPly = a.ply - 1; // the move that landed us at a.beforeFen
      const exitSan =
        exitPly >= 1 ? analysis[exitPly - 1]?.san ?? null : null;
      return { exitPly, exitSan, moveLabel: labelFor(exitPly, exitSan) };
    }
    // We've consumed all moves played. Are we sitting at an unprepared
    // user-turn position right now? If so, the last move played is the
    // exit.
    if (currentIsUserTurn && !currentHasPlan && moves.length > 0) {
      const exitPly = moves.length;
      const exitSan = analysis[exitPly - 1]?.san ?? null;
      return { exitPly, exitSan, moveLabel: labelFor(exitPly, exitSan) };
    }
    // No moves played and we're stuck — entry missing at the very start.
    if (currentIsUserTurn && !currentHasPlan && moves.length === 0) {
      return { exitPly: 0, exitSan: null, moveLabel: labelFor(0, null) };
    }
    return null;
  }, [analysis, currentIsUserTurn, currentHasPlan, moves.length]);

  // ── Handlers ─────────────────────────────────────────────────────────
  // useNavTransition wraps router.push in a transition so the global
  // progress bar tracks the back-nav. No router.refresh — see
  // StatsClient.handleBack for the full rationale.
  const [, navigate] = useNavTransition();
  const handleBack = () => navigate("/home");

  // useCallback keeps the prop reference stable across renders. Without
  // it, Board's `useEffect(..., [pairedMoves, onMovesUpdated])` saw a new
  // onMovesUpdated every render and re-fired, calling setMoves with the
  // same list, which re-rendered us, and so on — Maximum update depth.
  // setMoves also early-outs on no-op updates so even if the callback
  // does fire spuriously we don't trigger a new render.
  // Mirrors Board's internal currentMoveIndex so we can drive the turn
  // banner, exit indicator, and move-row highlighting off the position
  // the user is actually looking at.
  const handleMoveIndexChange = useCallback((idx: number) => {
    setDisplayedIndex(idx);
  }, []);

  const handleMovesUpdated = useCallback(
    (
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
      setMoves((prev) => {
        if (prev.length === flat.length && prev.every((s, i) => s === flat[i])) {
          return prev;
        }
        return flat;
      });
    },
    [],
  );

  const handleLoadPgn = () => {
    setPgnError(null);
    if (!pgn.trim()) {
      setPgnError("Paste a PGN or move list first.");
      return;
    }
    try {
      const normalized = pgn.trim().replace(/\r\n/g, "\n");
      const g = new Chess();
      g.loadPgn(normalized, { strict: false });
      const sans = g.history();
      if (sans.length === 0) throw new Error("No moves found");
      setLoadedMoves(sans);
      setBoardKey((k) => k + 1);
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

  // "Undo last move" — drop the trailing SAN and reload the board with
  // the shorter sequence. Reuses the Board-remount-via-key trick so the
  // imperative state stays in sync without us touching boardRef.
  const handleUndo = () => {
    if (moves.length === 0) return;
    const next = moves.slice(0, -1);
    setLoadedMoves(next.length > 0 ? next : undefined);
    setBoardKey((k) => k + 1);
    setMoves(next);
  };

  // "Delete from here" — keep the first `keep` SAN moves and discard the
  // rest. Same remount trick as handleUndo but at an arbitrary cut point,
  // so the user can lop off branches mid-list without resetting.
  const handleTruncate = (keep: number) => {
    if (keep < 0) keep = 0;
    if (keep >= moves.length) return;
    const next = moves.slice(0, keep);
    setLoadedMoves(next.length > 0 ? next : undefined);
    setBoardKey((k) => k + 1);
    setMoves(next);
  };

  const handleAddCurrentToRepertoire = () => {
    // Use the line up to the currently displayed ply, not the full played
    // history — when the user has scrubbed back, they're looking at an
    // earlier position and probably want to add THAT, not whatever they
    // played later.
    const lineToHere = moves.slice(0, displayedIndex + 1);
    if (lineToHere.length === 0) return;
    sessionStorage.setItem("buildSanMoves", JSON.stringify(lineToHere));
    router.push(`/build/${color}`);
  };

  // ── UI ──────────────────────────────────────────────────────────────
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

      {/* Board panel */}
      <div className="flex-1 flex flex-col items-center px-4 lg:px-6 min-w-0 h-below-nav lg:h-screen mt-nav lg:mt-0 pb-2 lg:pb-6 relative overflow-hidden">
        <div className="absolute top-4 left-4 hidden lg:block">
          <Logo size="xl" clickable={true} onLogoClick={handleBack} />
        </div>

        <div className="w-full max-w-xl flex-1 flex flex-col items-center gap-2 lg:gap-3 min-h-0 justify-start pt-4 lg:justify-center lg:pt-0">
          {gameStatus.label && (
            <div
              className={`px-3 py-1.5 rounded-full border flex-shrink-0 ${
                gameStatus.terminal
                  ? "bg-amber-500/15 border-amber-500/40"
                  : "bg-surface-2/60 border-border/50"
              }`}>
              <span className="text-sm font-medium text-foreground">
                {gameStatus.label}
              </span>
            </div>
          )}

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
              onMoveIndexChange={handleMoveIndexChange}
              hideHistoryOverlay
            />
          </div>

          {/* Navigation controls — let the user scrub through the played
              line without modifying it. Playing a move while looking at a
              past position is blocked by Board itself; the user must come
              back to the latest ply first (or use the × on a move row to
              truncate from that point). */}
          {moves.length > 0 && (
            <div className="flex items-center justify-center flex-shrink-0">
              <BoardControls
                onFirstMove={() => boardRef.current?.goToFirst()}
                onPreviousMove={() => boardRef.current?.goToPrevious()}
                onNextMove={() => boardRef.current?.goToNext()}
                onLastMove={() => boardRef.current?.goToLast()}
              />
            </div>
          )}

          {/* Current-position banner: either show the user's planned move
              from here, or surface that this position is out of repertoire
              with a shortcut to add it.
              Fixed height across all three states keeps the desktop
              `lg:justify-center` column from reflowing as the user scrubs
              back and forth — the board would otherwise nudge up/down as
              the banner swapped between the (taller) user-turn card and
              the (shorter) "Opponent to move" text. */}
          <div className="w-full flex-shrink-0 h-[5.5rem] flex items-center">
            {currentIsUserTurn ? (
              currentHasPlan ? (
                <div className="w-full glass-card rounded-xl p-3 lg:p-4 text-center border border-primary/30 bg-primary/5">
                  <p className="text-xs text-muted-foreground">
                    {currentExpectedSans.length > 1
                      ? "Your repertoire plays one of"
                      : "Your repertoire plays"}
                  </p>
                  <p className="text-xl font-mono font-bold text-foreground">
                    {currentExpectedSans.join(" / ")}
                  </p>
                </div>
              ) : (
                <div className="w-full glass-card rounded-xl p-3 lg:p-4 flex items-center justify-between gap-3 border border-amber-500/30 bg-amber-500/5">
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
                    disabled={displayedIndex < 0}
                    title={
                      displayedIndex < 0
                        ? "Play moves first to add this position"
                        : "Add to repertoire"
                    }>
                    <Plus size={14} className="mr-1" />
                    Add
                  </Button>
                </div>
              )
            ) : (
              <div className="w-full text-center text-xs text-muted-foreground">
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
                onClick={handleUndo}
                disabled={moves.length === 0}>
                Undo
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleClear}>
                Reset
              </Button>
            </div>
          </div>

          {/* Exit indicator */}
          {exitInfo && (
            <div className="glass-card rounded-xl p-3 lg:p-4 border border-amber-500/30 bg-amber-500/5">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
                Line exits at
              </p>
              <p className="text-sm text-foreground">
                {exitInfo.exitPly === 0
                  ? `No plan at the starting position for your ${color} repertoire.`
                  : `${exitInfo.moveLabel} — no plan after this move in your ${color} repertoire.`}
              </p>
            </div>
          )}

          {/* Per-ply analysis */}
          {analysis.length > 0 && (
            <div className="glass-card rounded-xl p-3 lg:p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Moves
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] uppercase tracking-wider"
                  onClick={handleUndo}
                  disabled={moves.length === 0}>
                  Undo last
                </Button>
              </div>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {(() => {
                  // Compute display-time flags by walking the analysis in
                  // order. `firstOorPly` is the only ply that gets the
                  // "Out of repertoire" badge — once we're out, all the
                  // following moves are free play and don't need to keep
                  // restating it.
                  let firstOorPly: number | null = null;
                  for (const a of analysis) {
                    if (a.userTurn && !a.inRepertoire) {
                      firstOorPly = a.ply;
                      break;
                    }
                  }
                  return analysis.map((a) => (
                    <PlyRow
                      key={a.ply}
                      a={a}
                      showOorBadge={a.ply === firstOorPly}
                      pastFirstOor={
                        firstOorPly !== null && a.ply > firstOorPly
                      }
                      isCurrent={a.ply - 1 === displayedIndex}
                      onClick={() =>
                        boardRef.current?.goToMove(a.ply - 1)
                      }
                      onTruncate={() => handleTruncate(a.ply - 1)}
                    />
                  ));
                })()}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function PlyRow({
  a,
  showOorBadge,
  pastFirstOor,
  isCurrent,
  onClick,
  onTruncate,
}: {
  a: PlyAnalysis;
  showOorBadge: boolean;
  pastFirstOor: boolean;
  isCurrent: boolean;
  onClick: () => void;
  onTruncate: () => void;
}) {
  const prefix = a.isWhiteTurn ? `${a.moveNumber}.` : `${a.moveNumber}…`;
  // Highlight the currently displayed ply; once we're past the first
  // exit, drop status badges so the row is just SAN — every subsequent
  // user move is implicitly off-book.
  const rowClasses = `flex items-center gap-2 text-xs px-1 py-0.5 rounded cursor-pointer transition-colors ${
    isCurrent
      ? "bg-primary/20 text-foreground"
      : "hover:bg-surface-2/60 text-foreground"
  }`;
  const Trash = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onTruncate();
      }}
      className="ml-auto h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
      title="Delete this move and everything after">
      ×
    </button>
  );

  // Bare row layout — used when there's no status badge to show, e.g.
  // opponent moves and any user moves played after the line exited.
  if (!a.userTurn || pastFirstOor) {
    return (
      <div className={rowClasses} onClick={onClick}>
        <span className="font-mono w-10 tabular-nums text-muted-foreground">
          {prefix}
        </span>
        <span className="font-mono">{a.san}</span>
        {Trash}
      </div>
    );
  }
  if (a.inRepertoire) {
    if (a.matchedPlan) {
      return (
        <div className={rowClasses} onClick={onClick}>
          <span className="font-mono w-10 tabular-nums text-muted-foreground">
            {prefix}
          </span>
          <span className="font-mono">{a.san}</span>
          <span className="text-[10px] uppercase tracking-wide text-emerald-400">
            In line
          </span>
          {Trash}
        </div>
      );
    }
    return (
      <div className={rowClasses} onClick={onClick}>
        <span className="font-mono w-10 tabular-nums text-muted-foreground">
          {prefix}
        </span>
        <span className="font-mono">{a.san}</span>
        <span className="text-[10px] uppercase tracking-wide text-blue-400">
          Diverged
        </span>
        <span className="text-[10px] text-muted-foreground truncate">
          (plan: {a.expectedSans.join(" / ")})
        </span>
        {Trash}
      </div>
    );
  }
  return (
    <div className={rowClasses} onClick={onClick}>
      <span className="font-mono w-10 tabular-nums text-muted-foreground">
        {prefix}
      </span>
      <span className="font-mono">{a.san}</span>
      {showOorBadge && (
        <span className="text-[10px] uppercase tracking-wide text-amber-400">
          Out of repertoire
        </span>
      )}
      {Trash}
    </div>
  );
}
