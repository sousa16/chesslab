"use client";

/**
 * TacticsClient — the single-mode tactics screen.
 *
 * The user plays the move on the board. The board validates it against the
 * puzzle solution: correct → opponent auto-replies, advance; wrong → red
 * flash, try again. No self-rating, no manual reveal.
 *
 * Scoring is derived from how the puzzle was completed:
 *   - 1st try, no help, no wrong drops → "easy"
 *   - 1 wrong drop before solving      → "effort"
 *   - 2+ wrong drops before solving    → "partial"
 *   - User asked to see the solution   → "partial" (or "forgot" if 0 attempts)
 *   - User skipped                     → "forgot"
 *
 * Adaptive difficulty and motif blocking run on the server (auto mode is
 * the default). The settings drawer exposes manual mode/category overrides
 * for users who want them, but the primary surface is intentionally bare.
 */

import { Chess } from "chess.js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Cpu,
  Eye,
  Flame,
  Repeat2,
  Settings,
  SkipForward,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useNavTransition } from "@/components/NavProgress";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { MobileNav } from "@/components/MobileNav";
import { BoardControls } from "@/components/BoardControls";
import {
  PuzzleBoard,
  type PuzzleBoardHandle,
} from "@/components/PuzzleBoard";
import { PUZZLE_CATEGORIES, type PuzzleCategory } from "@/lib/puzzleCategories";
import {
  CANONICAL_MOTIFS,
  MOTIF_LABELS,
  type CanonicalMotif,
} from "@/lib/motifs";
import type { ReviewResponse } from "@/lib/sm2";
import { recordReview } from "@/lib/statsCache";
import type { AnalysisResponse } from "@/app/api/analysis/route";

interface PuzzleData {
  id: string;
  lichessId: string;
  fen: string;
  moves: string;
  rating: number;
  themes: string[];
  categories: string[];
}

interface ReviewData {
  id: string;
}

interface NextPuzzleResponse {
  puzzle: PuzzleData | null;
  review: ReviewData | null;
  dueCount: number;
  source: "due" | "new" | "empty";
  focusMotif: string | null;
  targetRating: number | null;
}

type SelectionMode = "auto" | "blocked" | "mixed";

interface Prefs {
  mode: SelectionMode;
  blockedFilterMotif: string | null;
  enabledCategories: PuzzleCategory[];
  currentTargetRating: number;
  globalEwmaSuccess: number;
  globalAttempts: number;
  globalCorrect: number;
}

interface MotifProgress {
  motif: CanonicalMotif;
  label: string;
  attempts: number;
  correct: number;
  ewmaSuccess: number | null;
  rating: number | null;
  unlocked: boolean;
}

interface MotifProgressResponse {
  motifs: MotifProgress[];
}

const UNLOCK_ATTEMPTS = 20;
// Tiny pause after onSolved fires so the green-flash in PuzzleBoard has a
// moment to land before the next puzzle slides in. Kept short — the
// next-puzzle load IS the success signal; lingering on a "solved" state
// just causes layout shift as the controls swap.
const ADVANCE_DELAY_MS = 280;

export default function TacticsClient() {
  const router = useRouter();
  void router;
  const [, navigate] = useNavTransition();

  // Puzzle stream state
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [empty, setEmpty] = useState(false);

  // Adaptive state
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [motifProgress, setMotifProgress] = useState<MotifProgress[] | null>(
    null,
  );
  const [focusMotif, setFocusMotif] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);

  // Per-puzzle solving state
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [solutionShown, setSolutionShown] = useState(false);
  // Tracks where the current puzzle came from (SRS due queue vs new pick)
  // so we can render a small "Review" chip — explains to the user that
  // re-seeing an old puzzle is intentional, not a bug.
  const [puzzleSource, setPuzzleSource] = useState<"due" | "new" | "empty">(
    "new",
  );

  // UI overlays
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Engine analysis (only available after a puzzle is finished / solution shown)
  const [analysisOn, setAnalysisOn] = useState(false);
  const [analysisFen, setAnalysisFen] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(
    null,
  );
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const analysisReqRef = useRef(0);

  const cardStartRef = useRef<number>(Date.now());
  const boardRef = useRef<PuzzleBoardHandle | null>(null);
  const prefetchRef = useRef<Promise<NextPuzzleResponse | null> | null>(null);
  const recentlyRatedRef = useRef<string[]>([]);
  const RECENT_RATED_CAP = 20;

  const handleBack = () => navigate("/home");

  const fetchNext = useCallback(
    async (excludeIds?: string[]): Promise<NextPuzzleResponse | null> => {
      try {
        const filtered = (excludeIds ?? []).filter(Boolean);
        const url =
          filtered.length > 0
            ? `/api/puzzles/next?exclude=${encodeURIComponent(filtered.join(","))}`
            : "/api/puzzles/next";
        const res = await fetch(url);
        if (!res.ok) return null;
        return (await res.json()) as NextPuzzleResponse;
      } catch (err) {
        console.error(err);
        return null;
      }
    },
    [],
  );

  const applyNext = useCallback((data: NextPuzzleResponse | null) => {
    if (!data) return;
    setPuzzle(data.puzzle);
    setReview(data.review);
    setDueCount(data.dueCount);
    setEmpty(data.puzzle === null);
    setFocusMotif(data.focusMotif);
    // Per-puzzle reset
    setWrongAttempts(0);
    setSolutionShown(false);
    setPuzzleSource(data.source);
    setAnalysisOn(false);
    setAnalysisFen(null);
    setAnalysisResult(null);
    setAnalysisError(null);
    setAnalysisLoading(false);
    cardStartRef.current = Date.now();
  }, []);

  const loadNext = useCallback(
    async (excludeId?: string) => {
      prefetchRef.current = null;
      try {
        const excludes = excludeId
          ? [excludeId, ...recentlyRatedRef.current]
          : [...recentlyRatedRef.current];
        const data = await fetchNext(excludes);
        applyNext(data);
      } finally {
        setSubmitting(false);
      }
    },
    [fetchNext, applyNext],
  );

  const refreshMotifProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/puzzles/motif-progress");
      if (!res.ok) return;
      const data = (await res.json()) as MotifProgressResponse;
      setMotifProgress(data.motifs);
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Initial fetch: prefs + motif progress + first puzzle in parallel.
  useEffect(() => {
    (async () => {
      try {
        const [prefsRes] = await Promise.all([
          fetch("/api/puzzle-prefs").then((r) => (r.ok ? r.json() : null)),
          refreshMotifProgress(),
          loadNext(),
        ]);
        if (prefsRes) setPrefs(prefsRes);
      } finally {
        setInitialLoading(false);
      }
    })();
  }, [loadNext, refreshMotifProgress]);

  // Prefetch the next puzzle while the current one is on screen so the
  // hand-off after a solve feels instant.
  useEffect(() => {
    if (!puzzle || empty) {
      prefetchRef.current = null;
      return;
    }
    prefetchRef.current = fetchNext([
      puzzle.id,
      ...recentlyRatedRef.current,
    ]);
  }, [puzzle?.id, empty, fetchNext]);

  /**
   * Derive an SRS response from the user's path through the puzzle.
   * Mapping is intentionally conservative: a single wrong attempt counts
   * as "effort", not "easy", to keep the SRS honest. Solution viewed = at
   * best "partial" — you weren't tested.
   */
  const deriveResponse = useCallback(
    (
      attempts: number,
      shown: boolean,
      gaveUp: boolean,
    ): ReviewResponse => {
      if (gaveUp) return "forgot";
      if (shown) return attempts === 0 ? "forgot" : "partial";
      if (attempts === 0) return "easy";
      if (attempts === 1) return "effort";
      return "partial";
    },
    [],
  );

  const submitAndAdvance = useCallback(
    (response: ReviewResponse) => {
      if (!puzzle) return;
      setSubmitting(true);
      const isCorrect = response === "effort" || response === "easy";
      if (isCorrect) setStreak((s) => s + 1);
      else setStreak(0);
      const timeSpentMs = Date.now() - cardStartRef.current;

      try {
        recordReview({ wasDue: false });
        window.dispatchEvent(
          new CustomEvent("training-stats-updated", {
            detail: { timeSpentMs, positionsReviewed: 1 },
          }),
        );
      } catch {}

      const ratedId = puzzle.id;
      fetch("/api/puzzles/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId: review?.id,
          puzzleId: review ? undefined : puzzle.id,
          response,
          timeSpentMs,
        }),
      })
        .then(async () => {
          await Promise.all([
            refreshMotifProgress(),
            fetch("/api/puzzle-prefs")
              .then((r) => (r.ok ? r.json() : null))
              .then((p) => p && setPrefs(p))
              .catch(() => {}),
          ]);
        })
        .catch((err) => console.error(err));

      recentlyRatedRef.current.push(ratedId);
      if (recentlyRatedRef.current.length > RECENT_RATED_CAP) {
        recentlyRatedRef.current.shift();
      }

      const pending = prefetchRef.current;
      prefetchRef.current = null;
      const advance = () => {
        if (pending) {
          pending
            .then((data) => applyNext(data))
            .finally(() => setSubmitting(false));
        } else {
          loadNext(ratedId);
        }
      };
      // Tiny pause so the user can register the outcome before the board
      // swaps. Skipped if they explicitly hit Skip — that's a "get me out".
      if (response === "forgot") {
        advance();
      } else {
        setTimeout(advance, ADVANCE_DELAY_MS);
      }
    },
    [puzzle, review, applyNext, loadNext, refreshMotifProgress],
  );

  // Board callbacks
  const handleBoardIncorrect = useCallback(() => {
    setWrongAttempts((n) => n + 1);
  }, []);

  const handleBoardSolved = useCallback(() => {
    if (submitting) return;
    // No interim UI state — the board's own green flash is the feedback,
    // and submitAndAdvance schedules a short pause before the next puzzle
    // slides in. Keeps the layout stable.
    const response = deriveResponse(wrongAttempts, solutionShown, false);
    submitAndAdvance(response);
  }, [submitting, wrongAttempts, solutionShown, deriveResponse, submitAndAdvance]);

  const handleShowSolution = () => {
    if (submitting || solutionShown || !boardRef.current) return;
    setSolutionShown(true);
    boardRef.current
      .revealRemaining()
      .then(() => {
        const response = deriveResponse(wrongAttempts, true, false);
        // submitAndAdvance schedules its own ADVANCE_DELAY_MS pause.
        submitAndAdvance(response);
      })
      .catch(() => {
        // If the reveal animation fails, still submit so the user isn't stuck.
        submitAndAdvance(deriveResponse(wrongAttempts, true, false));
      });
  };

  const handleSkip = () => {
    if (submitting) return;
    submitAndAdvance("forgot");
  };

  const toggleAnalysis = () => {
    if (!solutionShown && wrongAttempts === 0) return; // analysis only after exposure
    setAnalysisOn((on) => !on);
  };

  // Analysis-mode fen change → debounced eval fetch.
  const handleAnalysisPositionChange = useCallback((fen: string) => {
    setAnalysisFen(fen);
  }, []);
  useEffect(() => {
    if (!analysisOn || !analysisFen) return;
    const myReqId = ++analysisReqRef.current;
    setAnalysisLoading(true);
    setAnalysisError(null);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/analysis?fen=${encodeURIComponent(analysisFen)}`,
        );
        if (myReqId !== analysisReqRef.current) return;
        if (!res.ok) {
          setAnalysisError("Engine unavailable");
          setAnalysisResult(null);
        } else {
          const data = (await res.json()) as AnalysisResponse;
          if (myReqId !== analysisReqRef.current) return;
          setAnalysisResult(data);
        }
      } catch {
        if (myReqId !== analysisReqRef.current) return;
        setAnalysisError("Engine unavailable");
        setAnalysisResult(null);
      } finally {
        if (myReqId === analysisReqRef.current) setAnalysisLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [analysisOn, analysisFen]);

  // Keyboard: Space = Show Solution, S = Skip.
  useEffect(() => {
    if (empty || !puzzle) return;
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
  }, [empty, puzzle?.id, solutionShown, submitting, wrongAttempts]);

  // Prefs mutators
  const updatePrefs = async (patch: {
    mode?: SelectionMode;
    blockedFilterMotif?: string | null;
    enabledCategories?: PuzzleCategory[];
  }) => {
    if (!prefs) return;
    setPrefs({ ...prefs, ...patch });
    try {
      const res = await fetch("/api/puzzle-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = await res.json();
        setPrefs(updated);
      }
    } catch (err) {
      console.error(err);
    }
    loadNext();
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading puzzle…</p>
      </div>
    );
  }

  if (empty || !puzzle) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <MobileNav
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onLogoClick={handleBack}
        />
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <div className="absolute top-4 left-4 hidden lg:block">
            <Logo size="xl" clickable={true} onLogoClick={handleBack} />
          </div>
          <Trophy className="w-12 h-12 text-primary mb-3" />
          <h2 className="text-xl font-semibold text-foreground">
            No puzzles to solve right now
          </h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            You&apos;ve worked through every puzzle in your enabled categories.
            Widen the filters or come back when reviews are due.
          </p>
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setIsSettingsOpen(true)}>
              Settings
            </Button>
            <Button onClick={handleBack} className="btn-primary-gradient">
              Back to home
            </Button>
          </div>
        </div>
        {prefs && isSettingsOpen && (
          <SettingsDrawer
            prefs={prefs}
            motifProgress={motifProgress}
            onClose={() => setIsSettingsOpen(false)}
            onUpdate={updatePrefs}
          />
        )}
      </div>
    );
  }

  const movesArr = puzzle.moves.split(" ").filter(Boolean);
  const orientation = computeOrientation(puzzle.fen, movesArr[0]);
  const solutionSan = computeSolutionSan(puzzle.fen, movesArr);

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

      {/* Board column */}
      <div className="flex-1 flex flex-col items-center px-3 lg:px-6 min-w-0 h-below-nav lg:h-screen mt-nav lg:mt-0 pb-2 lg:pb-6 relative overflow-hidden">
        <div className="absolute top-4 left-4 hidden lg:block">
          <Logo size="xl" clickable={true} onLogoClick={handleBack} />
        </div>

        <div className="w-full max-w-xl flex-1 flex flex-col items-center gap-2 lg:gap-3 min-h-0 justify-start pt-3 lg:justify-center lg:pt-0">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <div className="px-3 py-1.5 rounded-full bg-surface-2/60 border border-border/50">
              <span className="text-sm font-medium text-foreground">
                {orientation === "white" ? "White" : "Black"} to move
              </span>
            </div>
            {puzzleSource === "due" && (
              <div
                className="px-3 py-1.5 rounded-full bg-sky-500/15 border border-sky-500/40 text-sky-300 text-xs font-medium"
                title="A puzzle you've seen before — your SRS scheduled it for review today.">
                Review
              </div>
            )}
            {wrongAttempts > 0 && !solutionShown && (
              <div className="px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-medium tabular-nums">
                {wrongAttempts} wrong {wrongAttempts === 1 ? "try" : "tries"}
              </div>
            )}
          </div>

          <div
            className="flex-shrink-0 w-full"
            style={{
              maxWidth: "min(100%, calc(100dvh - var(--mobile-nav-h) - 240px))",
            }}>
            <PuzzleBoard
              ref={boardRef}
              key={puzzle.id}
              initialFen={puzzle.fen}
              moves={movesArr}
              revealSolution={false}
              playMode={!analysisOn && !solutionShown}
              orientation={orientation}
              analysisMode={analysisOn}
              onPositionChange={
                analysisOn ? handleAnalysisPositionChange : undefined
              }
              onIncorrect={handleBoardIncorrect}
              onSolved={handleBoardSolved}
            />
          </div>

          {/* Bottom controls. When solving (incl. just after a clean solve
              while we're about to swap puzzles): Skip + Show Solution.
              The "post-solve" tree only renders when the user explicitly
              hit Show Solution — keeps the layout stable on auto-solve. */}
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
            <div className="w-full flex flex-col gap-2">
              <div className="flex items-center justify-center gap-2">
                <BoardControls
                  onFirstMove={() => boardRef.current?.goToFirst()}
                  onPreviousMove={() => boardRef.current?.goToPrevious()}
                  onNextMove={() => boardRef.current?.goToNext()}
                  onLastMove={() => boardRef.current?.goToLast()}
                  onReset={() => boardRef.current?.goToFirst()}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleAnalysis}
                  className={`h-9 px-3 rounded-lg text-xs font-medium border transition-colors ${
                    analysisOn
                      ? "bg-primary/20 border-primary/40 text-primary hover:bg-primary/30"
                      : "bg-surface-2/60 border-border/50 text-muted-foreground hover:bg-surface-2"
                  }`}>
                  <Cpu size={14} className="mr-1.5" />
                  {analysisOn ? "Stop" : "Analyze"}
                </Button>
              </div>
              <div className="glass-card rounded-xl p-2.5 text-center">
                <p className="text-xs text-muted-foreground mb-1">Solution</p>
                <p className="text-base font-mono font-bold text-foreground break-words">
                  {solutionSan.join(" ")}
                </p>
              </div>
              {analysisOn && (
                <AnalysisPanel
                  fen={analysisFen}
                  result={analysisResult}
                  loading={analysisLoading}
                  error={analysisError}
                  compact
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar — kept lightweight. Heavy controls live in the drawer. */}
      <aside
        className={`fixed lg:relative top-[var(--mobile-nav-h)] lg:top-0 right-0 z-40 w-80 lg:w-96 h-below-nav lg:h-screen border-l border-border bg-solid flex-shrink-0 flex flex-col overflow-hidden pb-safe transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}>
        <div className="p-4 lg:p-5 border-b border-border/50 glass-panel">
          <div className="flex items-center justify-between mb-3">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-xl -ml-2"
              onClick={handleBack}>
              <ChevronLeft size={20} />
            </Button>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium uppercase tracking-wide">
              <Target size={12} />
              Tactics
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-xl"
              onClick={() => setIsSettingsOpen(true)}
              title="Settings">
              <Settings size={18} />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg bg-gradient-to-br from-purple-500/30 to-blue-500/30 border border-purple-400/30">
              <Target className="w-6 h-6 text-purple-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground truncate">
                Puzzle #{puzzle.lichessId}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Rating {puzzle.rating}
                {focusMotif && (
                  <>
                    {" · "}
                    <span className="text-amber-300/90">
                      drilling{" "}
                      {MOTIF_LABELS[focusMotif as CanonicalMotif] ?? focusMotif}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 lg:p-5 flex flex-col overflow-y-auto gap-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Due" value={dueCount} />
            <Stat
              label="Streak"
              value={streak}
              icon={
                <Flame
                  className={`w-4 h-4 ${
                    streak > 0 ? "text-orange-500" : "text-muted-foreground"
                  }`}
                />
              }
            />
            <Stat label="Level" value={prefs?.currentTargetRating ?? "—"} />
          </div>

          <Button
            variant="outline"
            className="w-full h-10 rounded-xl border-border/50 hover:bg-surface-2"
            onClick={() => navigate("/tactics/drills")}>
            <Repeat2 size={16} className="mr-2" />
            Woodpecker Drills
          </Button>

          {motifProgress && (
            <MotifProgressPanel motifProgress={motifProgress} />
          )}
        </div>
      </aside>

      {prefs && isSettingsOpen && (
        <SettingsDrawer
          prefs={prefs}
          motifProgress={motifProgress}
          onClose={() => setIsSettingsOpen(false)}
          onUpdate={updatePrefs}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-xl p-2.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </p>
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-lg font-semibold text-foreground tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * Hidden by default. Opens from a cog button. Holds the controls that most
 * users will only touch once or twice (mode, motif, categories).
 */
function SettingsDrawer({
  prefs,
  motifProgress,
  onClose,
  onUpdate,
}: {
  prefs: Prefs;
  motifProgress: MotifProgress[] | null;
  onClose: () => void;
  onUpdate: (patch: {
    mode?: SelectionMode;
    blockedFilterMotif?: string | null;
    enabledCategories?: PuzzleCategory[];
  }) => void;
}) {
  const MODE_LABELS: Record<SelectionMode, string> = {
    auto: "Auto — pick what I need",
    blocked: "Blocked — one motif",
    mixed: "Mixed — all motifs",
  };
  const MODE_HELP: Record<SelectionMode, string> = {
    auto: "App picks the weakest motif you haven't unlocked yet, then mixes once you've solved 20+ at 80%.",
    blocked: "Drill a single motif until you switch away.",
    mixed: "Everything jumbled — best once your motifs are unlocked.",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60"
      onClick={onClose}>
      <div
        className="bg-solid border-t lg:border border-border/50 w-full lg:w-[28rem] max-h-[85vh] lg:max-h-[80vh] rounded-t-2xl lg:rounded-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="p-4 lg:p-5 border-b border-border/50 flex items-center justify-between sticky top-0 bg-solid">
          <h3 className="text-base font-semibold text-foreground">Settings</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        <div className="p-4 lg:p-5 space-y-5">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
              Mode
            </label>
            <select
              value={prefs.mode}
              onChange={(e) =>
                onUpdate({ mode: e.target.value as SelectionMode })
              }
              className="w-full h-10 px-3 rounded-lg bg-surface-2 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
              {(Object.keys(MODE_LABELS) as SelectionMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
              {MODE_HELP[prefs.mode]}
            </p>
          </div>

          {prefs.mode === "blocked" && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                Motif
              </label>
              <select
                value={prefs.blockedFilterMotif ?? ""}
                onChange={(e) =>
                  onUpdate({
                    mode: "blocked",
                    blockedFilterMotif: e.target.value || null,
                  })
                }
                className="w-full h-10 px-3 rounded-lg bg-surface-2 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="" disabled>
                  Pick a motif…
                </option>
                {CANONICAL_MOTIFS.map((m) => {
                  const row = motifProgress?.find((x) => x.motif === m);
                  return (
                    <option key={m} value={m}>
                      {MOTIF_LABELS[m]}
                      {row && row.attempts > 0
                        ? ` (${row.attempts}${row.unlocked ? " · unlocked" : ""})`
                        : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
              Categories
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PUZZLE_CATEGORIES.map((cat) => {
                const enabled = prefs.enabledCategories.includes(cat);
                const isLast =
                  enabled && prefs.enabledCategories.length === 1;
                return (
                  <label
                    key={cat}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer select-none transition-colors ${
                      enabled
                        ? "bg-primary/15 border-primary/40 text-foreground"
                        : "bg-surface-2/40 border-border/40 text-muted-foreground hover:bg-surface-2"
                    } ${isLast ? "cursor-not-allowed opacity-80" : ""}`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={enabled}
                      disabled={isLast}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? Array.from(
                              new Set([...prefs.enabledCategories, cat]),
                            )
                          : prefs.enabledCategories.filter((c) => c !== cat);
                        if (next.length === 0) return;
                        onUpdate({ enabledCategories: next });
                      }}
                    />
                    <span
                      className={`w-4 h-4 rounded-sm flex items-center justify-center border ${
                        enabled
                          ? "bg-primary border-primary"
                          : "border-border/60"
                      }`}>
                      {enabled && (
                        <span className="text-[10px] text-primary-foreground">
                          ✓
                        </span>
                      )}
                    </span>
                    {cat}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MotifProgressPanel({
  motifProgress,
}: {
  motifProgress: MotifProgress[];
}) {
  const locked = motifProgress
    .filter((m) => !m.unlocked)
    .sort((a, b) => b.attempts - a.attempts);
  const unlocked = motifProgress.filter((m) => m.unlocked);
  const ordered = [...locked, ...unlocked];

  return (
    <div className="glass-card rounded-xl p-3 lg:p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Motifs
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {unlocked.length}/{motifProgress.length} unlocked
        </span>
      </div>
      <ul className="space-y-2">
        {ordered.map((m) => {
          const pct = Math.min(
            100,
            Math.round((m.attempts / UNLOCK_ATTEMPTS) * 100),
          );
          const accPct =
            m.attempts >= 3 && m.ewmaSuccess !== null
              ? Math.round(m.ewmaSuccess * 100)
              : null;
          return (
            <li key={m.motif} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span
                  className={
                    m.unlocked ? "text-foreground" : "text-foreground/90"
                  }>
                  {m.unlocked && (
                    <span className="text-emerald-400 mr-1">✓</span>
                  )}
                  {m.label}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {m.unlocked
                    ? accPct !== null
                      ? `${accPct}%`
                      : "unlocked"
                    : `${Math.min(m.attempts, UNLOCK_ATTEMPTS)}/${UNLOCK_ATTEMPTS}`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-300 ${
                    m.unlocked
                      ? "bg-emerald-500/70"
                      : "bg-gradient-to-r from-amber-400/70 to-amber-500/70"
                  }`}
                  style={{ width: `${m.unlocked ? 100 : pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AnalysisPanel({
  fen,
  result,
  loading,
  error,
  compact = false,
}: {
  fen: string | null;
  result: AnalysisResponse | null;
  loading: boolean;
  error: string | null;
  compact?: boolean;
}) {
  const { bestSan, pvSan } = (() => {
    if (!fen || !result)
      return { bestSan: null as string | null, pvSan: [] as string[] };
    let bestSan: string | null = null;
    const pvSan: string[] = [];
    try {
      if (result.bestMove) {
        const g = new Chess(fen);
        const m = applyUciToGame(g, result.bestMove);
        if (m) bestSan = m.san;
      }
    } catch {}
    try {
      if (result.continuation) {
        const g = new Chess(fen);
        const ucis = result.continuation.split(/\s+/).filter(Boolean).slice(0, 6);
        for (const uci of ucis) {
          const m = applyUciToGame(g, uci);
          if (!m) break;
          pvSan.push(m.san);
        }
      }
    } catch {}
    return { bestSan, pvSan };
  })();

  const evalText = (() => {
    if (!result) return "—";
    if (typeof result.mate === "number" && result.mate !== 0) {
      const n = Math.abs(result.mate);
      return result.mate > 0 ? `M${n}` : `-M${n}`;
    }
    if (typeof result.eval === "number") {
      const sign = result.eval > 0 ? "+" : "";
      return `${sign}${result.eval.toFixed(2)}`;
    }
    return "—";
  })();

  const evalColor = (() => {
    if (!result) return "text-foreground";
    const score =
      typeof result.mate === "number" && result.mate !== 0
        ? result.mate > 0
          ? 99
          : -99
        : (result.eval ?? 0);
    if (score > 0.3) return "text-emerald-400";
    if (score < -0.3) return "text-rose-400";
    return "text-foreground";
  })();

  return (
    <div className={`glass-card rounded-xl ${compact ? "p-2.5" : "p-4"} space-y-2`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">
          Engine
        </span>
        <span className={`text-base font-mono font-semibold ${evalColor}`}>
          {evalText}
          {loading && (
            <span className="ml-2 inline-block w-2 h-2 rounded-full bg-primary/60 animate-pulse align-middle" />
          )}
        </span>
      </div>
      {error ? (
        <p className="text-xs text-rose-400/80">{error}</p>
      ) : (
        <>
          {bestSan && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Best</span>
              <span className="font-mono font-semibold text-foreground">
                {bestSan}
              </span>
            </div>
          )}
          {pvSan.length > 0 && (
            <div className="text-xs">
              <span className="text-muted-foreground">Line </span>
              <span className="font-mono text-foreground/90 break-words">
                {pvSan.join(" ")}
              </span>
            </div>
          )}
          {!result && !loading && (
            <p className="text-xs text-muted-foreground">
              Drag a piece to explore alternatives.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function applyUciToGame(game: Chess, uci: string) {
  if (uci.length < 4) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
  try {
    return game.move({ from, to, promotion: promotion || "q" });
  } catch {
    return null;
  }
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
