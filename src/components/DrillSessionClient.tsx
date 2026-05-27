"use client";

/**
 * Drill solving view — Woodpecker-style cycling of a fixed puzzle set.
 *
 * Auto-detect: user plays the move on the board, which validates against the
 * solution. Wrong drops flash red and let the user retry. Solving on the
 * first try with zero wrong drops counts as "correct"; needing the
 * solution or skipping counts as "incorrect" (the wall-clock matters more
 * than the binary anyway — the cycle-speedup curve is the point).
 *
 * Differs from TacticsClient in that there's no adaptive controller, no
 * motif blocking, no SRS rating — just play the same set faster each cycle.
 */

import { Chess } from "chess.js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Eye,
  SkipForward,
  Trophy,
} from "lucide-react";
import { useNavTransition } from "@/components/NavProgress";
import { Button } from "@/components/ui/button";
import { PuzzleBoard, type PuzzleBoardHandle } from "@/components/PuzzleBoard";
import { MOTIF_LABELS, type CanonicalMotif } from "@/lib/motifs";

interface PuzzleData {
  id: string;
  lichessId: string;
  fen: string;
  moves: string;
  rating: number;
  themes: string[];
  categories: string[];
}

interface SessionData {
  id: string;
  motif: string;
  size: number;
  cycle: number;
  targetCycles: number;
  position: number;
  baselineMs: number | null;
  lastCycleMs: number | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

interface SessionResponse {
  session: SessionData;
  currentPuzzle: PuzzleData | null;
}

interface AttemptResponse {
  session: SessionData;
  currentPuzzle: PuzzleData | null;
  cycleCompleted: boolean;
  graduated: boolean;
}

// Tiny pause so the green flash on the board lands before the next puzzle
// slides in. Anything longer reads as a "celebration screen" the user has
// to wait through; the next puzzle loading is itself the success signal.
const ADVANCE_DELAY_MS = 280;

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatMotif(motif: string): string {
  if (motif === "mixed") return "Mixed";
  return MOTIF_LABELS[motif as CanonicalMotif] ?? motif;
}

export default function DrillSessionClient({ drillId }: { drillId: string }) {
  const [, navigate] = useNavTransition();
  const [session, setSession] = useState<SessionData | null>(null);
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graduatedNotice, setGraduatedNotice] = useState(false);

  // Per-puzzle state
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [solutionShown, setSolutionShown] = useState(false);

  const cardStartRef = useRef<number>(Date.now());
  const boardRef = useRef<PuzzleBoardHandle | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/drills/${drillId}`);
        if (!res.ok) {
          setError("Drill not found");
          return;
        }
        const d = (await res.json()) as SessionResponse;
        setSession(d.session);
        setPuzzle(d.currentPuzzle);
        cardStartRef.current = Date.now();
      } catch (err) {
        console.error(err);
        setError("Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, [drillId]);

  const resetPuzzleState = useCallback(() => {
    setWrongAttempts(0);
    setSolutionShown(false);
  }, []);

  const submitAttempt = useCallback(
    async (correct: boolean) => {
      if (!session || !puzzle || submitting) return;
      setSubmitting(true);
      const timeMs = Date.now() - cardStartRef.current;
      try {
        const res = await fetch(`/api/drills/${drillId}/attempt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ correct, timeMs }),
        });
        if (!res.ok) {
          setError("Failed to record attempt");
          return;
        }
        const d = (await res.json()) as AttemptResponse;
        setSession(d.session);
        setPuzzle(d.currentPuzzle);
        resetPuzzleState();
        cardStartRef.current = Date.now();
        if (d.graduated) setGraduatedNotice(true);
      } catch (err) {
        console.error(err);
        setError("Network error");
      } finally {
        setSubmitting(false);
      }
    },
    [drillId, session, puzzle, submitting, resetPuzzleState],
  );

  const handleBoardIncorrect = useCallback(() => {
    setWrongAttempts((n) => n + 1);
  }, []);

  const handleBoardSolved = useCallback(() => {
    if (submitting) return;
    // Solved counts as correct only if no wrong attempts and no solution shown.
    // That's the strict standard — the drill is about pattern fluency, and
    // any failure should be a "miss" that earns the puzzle another cycle.
    // The board's own green flash is the feedback; no interim UI needed.
    const wasClean = wrongAttempts === 0 && !solutionShown;
    setTimeout(() => submitAttempt(wasClean), ADVANCE_DELAY_MS);
  }, [submitting, wrongAttempts, solutionShown, submitAttempt]);

  const handleShowSolution = () => {
    if (submitting || solutionShown || !boardRef.current) return;
    setSolutionShown(true);
    boardRef.current
      .revealRemaining()
      .then(() => submitAttempt(false))
      .catch(() => submitAttempt(false));
  };

  const handleSkip = () => {
    if (submitting) return;
    submitAttempt(false);
  };

  // Keyboard shortcuts: Space = Show Solution, S = Skip.
  useEffect(() => {
    if (!puzzle) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " && !solutionShown) {
        e.preventDefault();
        handleShowSolution();
      } else if ((e.key === "s" || e.key === "S") && !solutionShown) {
        e.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.id, solutionShown, submitting, wrongAttempts]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading drill…</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-foreground">{error ?? "Drill not available"}</p>
          <Button onClick={() => navigate("/tactics/drills")}>
            Back to drills
          </Button>
        </div>
      </div>
    );
  }

  if (graduatedNotice || session.status === "completed") {
    const speedup =
      session.baselineMs && session.lastCycleMs && session.lastCycleMs > 0
        ? session.baselineMs / session.lastCycleMs
        : null;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="glass-card rounded-2xl p-6 lg:p-8 max-w-md text-center space-y-4">
          <Trophy className="w-12 h-12 text-emerald-400 mx-auto" />
          <h2 className="text-xl font-semibold text-foreground">
            Drill complete
          </h2>
          <p className="text-sm text-muted-foreground leading-snug">
            Baseline {formatMs(session.baselineMs)} → final{" "}
            {formatMs(session.lastCycleMs)}
            {speedup && (
              <>
                {" "}
                <span className="text-emerald-400">
                  ({speedup.toFixed(1)}× faster)
                </span>
              </>
            )}
            . These puzzles will surface again in 14 days as anti-decay
            refreshers.
          </p>
          <Button
            onClick={() => navigate("/tactics/drills")}
            className="btn-primary-gradient">
            Back to drills
          </Button>
        </div>
      </div>
    );
  }

  if (!puzzle) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">No puzzle to show.</p>
      </div>
    );
  }

  const movesArr = puzzle.moves.split(" ").filter(Boolean);
  const orientation = computeOrientation(puzzle.fen, movesArr[0]);
  const solutionSan = computeSolutionSan(puzzle.fen, movesArr);

  const baselineRatio =
    session.baselineMs && session.lastCycleMs && session.lastCycleMs > 0
      ? session.baselineMs / session.lastCycleMs
      : null;

  return (
    <div className="h-[100dvh] bg-background flex flex-col">
      <header className="border-b border-border/50 px-3 py-2.5 flex items-center justify-between gap-3 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/tactics/drills")}
          className="-ml-2">
          <ChevronLeft size={18} className="mr-1" />
          Drills
        </Button>
        <div className="text-center min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {formatMotif(session.motif)} drill
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            Cycle {session.cycle}/{session.targetCycles} · Puzzle{" "}
            {session.position + 1}/{session.size}
            {session.lastCycleMs && (
              <>
                {" "}
                · last {formatMs(session.lastCycleMs)}
                {baselineRatio && (
                  <span className="text-emerald-400/80">
                    {" "}
                    ({baselineRatio.toFixed(1)}×)
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <div className="w-[88px]" />
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-3 py-3 overflow-hidden">
        <div className="w-full max-w-xl flex flex-col items-center gap-2 min-h-0">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <div className="px-3 py-1.5 rounded-full bg-surface-2/60 border border-border/50">
              <span className="text-sm font-medium text-foreground">
                {orientation === "white" ? "White" : "Black"} to move
              </span>
            </div>
            {wrongAttempts > 0 && !solutionShown && (
              <div className="px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-medium tabular-nums">
                {wrongAttempts} wrong
              </div>
            )}
          </div>

          <div
            className="flex-shrink-0 w-full"
            style={{ maxWidth: "min(100%, calc(100dvh - 240px))" }}>
            <PuzzleBoard
              ref={boardRef}
              key={puzzle.id}
              initialFen={puzzle.fen}
              moves={movesArr}
              revealSolution={false}
              playMode={!solutionShown}
              orientation={orientation}
              onIncorrect={handleBoardIncorrect}
              onSolved={handleBoardSolved}
            />
          </div>

          {!solutionShown ? (
            <div className="w-full flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                disabled={submitting}
                className="flex-1 h-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-2 border border-border/40">
                <SkipForward size={14} className="mr-1.5" />
                Skip
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleShowSolution}
                disabled={submitting}
                className="flex-1 h-10 rounded-xl border-border/50 hover:bg-surface-2">
                <Eye size={14} className="mr-1.5" />
                Show solution
              </Button>
            </div>
          ) : (
            <div className="glass-card rounded-xl p-2.5 text-center w-full">
              <p className="text-xs text-muted-foreground mb-1">Solution</p>
              <p className="text-base font-mono font-bold text-foreground break-words">
                {solutionSan.join(" ")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function computeOrientation(
  fen: string,
  setupUci: string | undefined,
): "white" | "black" {
  try {
    const game = new Chess(fen);
    if (setupUci) {
      const from = setupUci.slice(0, 2);
      const to = setupUci.slice(2, 4);
      const promotion = setupUci.length > 4 ? setupUci.slice(4, 5) : undefined;
      game.move({ from, to, promotion: promotion || "q" });
    }
    return game.turn() === "w" ? "white" : "black";
  } catch {
    return "white";
  }
}

function computeSolutionSan(fen: string, moves: string[]): string[] {
  try {
    const game = new Chess(fen);
    const sans: string[] = [];
    for (let i = 0; i < moves.length; i++) {
      const uci = moves[i];
      if (uci.length < 4) continue;
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
      const move = game.move({ from, to, promotion: promotion || "q" });
      if (i >= 1 && move) sans.push(move.san);
    }
    return sans;
  } catch {
    return [];
  }
}
