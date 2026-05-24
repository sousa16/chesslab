"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { ChevronLeft, Eye, Flame, Target, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { MobileNav } from "@/components/MobileNav";
import { BoardControls } from "@/components/BoardControls";
import {
  PuzzleBoard,
  type PuzzleBoardHandle,
} from "@/components/PuzzleBoard";
import { PUZZLE_CATEGORIES, type PuzzleCategory } from "@/lib/puzzleCategories";
import type { ReviewResponse } from "@/lib/sm2";

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
}

interface Prefs {
  ratingMin: number;
  ratingMax: number;
  enabledCategories: PuzzleCategory[];
}

type DifficultyBand = "beginner" | "intermediate" | "advanced" | "custom";

const DIFFICULTY_BANDS: Record<
  Exclude<DifficultyBand, "custom">,
  { label: string; ratingMin: number; ratingMax: number }
> = {
  beginner: { label: "Beginner (800–1399)", ratingMin: 800, ratingMax: 1399 },
  intermediate: {
    label: "Intermediate (1400–1799)",
    ratingMin: 1400,
    ratingMax: 1799,
  },
  advanced: { label: "Advanced (1800–2400)", ratingMin: 1800, ratingMax: 2400 },
};

function bandForPrefs(p: Prefs | null): DifficultyBand {
  if (!p) return "intermediate";
  for (const key of Object.keys(DIFFICULTY_BANDS) as Array<
    keyof typeof DIFFICULTY_BANDS
  >) {
    const b = DIFFICULTY_BANDS[key];
    if (p.ratingMin === b.ratingMin && p.ratingMax === b.ratingMax) return key;
  }
  return "custom";
}

export default function TacticsClient() {
  const router = useRouter();
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [streak, setStreak] = useState(0);
  const cardStartRef = useRef<number>(Date.now());
  const boardRef = useRef<PuzzleBoardHandle | null>(null);
  // Holds an in-flight fetch for the puzzle the user will see *after* the
  // one currently on screen. Populated by the effect below whenever a new
  // puzzle lands; consumed (or cleared) in handleRate and updatePrefs.
  const prefetchRef = useRef<Promise<NextPuzzleResponse | null> | null>(null);
  // Bounded list of just-rated puzzle ids. The review POST is fire-and-
  // forget, so the prefetch can race a not-yet-committed write and serve
  // the same puzzle back. Passing the recent ids as additional excludes
  // closes that window — by the time IDs roll off this list the server
  // has long since persisted them and SRS will have pushed them forward.
  const recentlyRatedRef = useRef<string[]>([]);
  const RECENT_RATED_CAP = 20;

  const handleBack = () => {
    router.push("/home");
  };

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
    // Swap puzzle + reset reveal atomically. Flipping `revealed` before
    // the new puzzle is in state would briefly show the previous puzzle's
    // (already-played) board paired with the "Show Answer" button.
    setPuzzle(data.puzzle);
    setReview(data.review);
    setDueCount(data.dueCount);
    setEmpty(data.puzzle === null);
    setRevealed(false);
    cardStartRef.current = Date.now();
  }, []);

  const loadNext = useCallback(
    async (excludeId?: string) => {
      // Any in-flight prefetch is now stale — the caller wants a fresh
      // pull (filters changed, initial load, etc.).
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

  // Initial fetch: prefs + first puzzle in parallel.
  useEffect(() => {
    (async () => {
      try {
        const [prefsRes] = await Promise.all([
          fetch("/api/puzzle-prefs").then((r) => (r.ok ? r.json() : null)),
          loadNext(),
        ]);
        if (prefsRes) setPrefs(prefsRes);
      } finally {
        setInitialLoading(false);
      }
    })();
  }, [loadNext]);

  // Prefetch the next puzzle in the background as soon as the current one
  // lands, so that when the user rates we can swap to it instantly instead
  // of awaiting the GET. Excludes both the current puzzle AND every
  // recently-rated id — the prefetch can fire before a previous review
  // POST has committed, and without the recent-rated filter the server
  // would happily return the not-yet-committed puzzle as the "next due".
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

  const handleShowAnswer = () => {
    setRevealed(true);
  };

  // Keyboard shortcuts: Enter = Show Answer, 1-4 = recall rating after reveal.
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
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (!revealed) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleShowAnswer();
        }
        return;
      }
      if (submitting) return;
      const ratings: Record<string, ReviewResponse> = {
        "1": "forgot",
        "2": "partial",
        "3": "effort",
        "4": "easy",
      };
      const rating = ratings[e.key];
      if (rating) {
        e.preventDefault();
        handleRate(rating);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, submitting, empty, puzzle?.id]);

  const handleRate = (response: ReviewResponse) => {
    if (!puzzle || submitting) return;
    setSubmitting(true);
    // Session-only streak: Good/Easy keep it growing, Hard/Forgot break it.
    // Same semantics as opening practice.
    if (response === "easy" || response === "effort") {
      setStreak((s) => s + 1);
    } else {
      setStreak(0);
    }
    const timeSpentMs = Date.now() - cardStartRef.current;

    try {
      // wasDue is intentionally omitted: puzzle reviews count toward
      // positionsReviewedToday (via DailyActivity) but NOT toward the
      // home dashboard's "moves to practice" number (which is repertoire-
      // only). Letting HomePanel skip the dueCount patch is the right
      // behavior here.
      window.dispatchEvent(
        new CustomEvent("training-stats-updated", {
          detail: { timeSpentMs, positionsReviewed: 1 },
        }),
      );
    } catch {}

    // Fire-and-forget: don't make the user wait for the SRS write to finish
    // before the next puzzle appears.
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
    }).catch((err) => console.error(err));

    // Record the rated id so subsequent prefetches exclude it. The list
    // is bounded so it doesn't grow unbounded across long sessions; by
    // the time the cap rolls an id off, the review write is committed
    // and SRS has bumped nextReviewDate forward.
    recentlyRatedRef.current.push(ratedId);
    if (recentlyRatedRef.current.length > RECENT_RATED_CAP) {
      recentlyRatedRef.current.shift();
    }

    // Consume the prefetched next puzzle if it's ready (or about to be).
    const pending = prefetchRef.current;
    prefetchRef.current = null;
    if (pending) {
      pending
        .then((data) => {
          applyNext(data);
        })
        .finally(() => setSubmitting(false));
    } else {
      loadNext(ratedId);
    }
  };

  const updatePrefs = async (patch: Partial<Prefs>) => {
    if (!prefs) return;
    const next: Prefs = { ...prefs, ...patch };
    setPrefs(next); // optimistic
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
    // New filter → fresh puzzle pulled from the new pool.
    loadNext();
  };

  const handleDifficultyChange = (band: DifficultyBand) => {
    if (band === "custom") return;
    const b = DIFFICULTY_BANDS[band];
    updatePrefs({ ratingMin: b.ratingMin, ratingMax: b.ratingMax });
  };

  const handleCategoryToggle = (cat: PuzzleCategory, on: boolean) => {
    if (!prefs) return;
    const next = on
      ? Array.from(new Set([...prefs.enabledCategories, cat]))
      : prefs.enabledCategories.filter((c) => c !== cat);
    if (next.length === 0) return; // at least one category required
    updatePrefs({ enabledCategories: next });
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading puzzle…</p>
      </div>
    );
  }

  const currentBand = bandForPrefs(prefs);

  if (empty || !puzzle) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <MobileNav
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onLogoClick={handleBack}
        />
        <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-6 min-h-[50vh] lg:min-h-screen relative">
          <div className="absolute top-4 left-4 hidden lg:block">
            <Logo size="xl" clickable={true} onLogoClick={handleBack} />
          </div>
          <div className="text-center space-y-4 max-w-md">
            <Trophy className="w-12 h-12 lg:w-16 lg:h-16 text-primary mx-auto" />
            <h2 className="text-xl lg:text-2xl font-semibold text-foreground">
              No puzzles to solve right now
            </h2>
            <p className="text-sm lg:text-base text-muted-foreground">
              You&apos;ve worked through every puzzle in your selected categories
              and rating range. Widen the filters below or come back when
              reviews are due.
            </p>
            {prefs && (
              <div className="text-left mt-6 space-y-4">
                <FiltersPanel
                  prefs={prefs}
                  band={currentBand}
                  onDifficultyChange={handleDifficultyChange}
                  onCategoryToggle={handleCategoryToggle}
                />
              </div>
            )}
            <Button onClick={handleBack} className="mt-4 btn-primary-gradient">
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const movesArr = puzzle.moves.split(" ").filter(Boolean);
  const orientation = computeOrientation(puzzle.fen, movesArr[0]);
  const solutionSan = computeSolutionSan(puzzle.fen, movesArr);

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

      {/* Left panel — board */}
      <div className="flex-1 flex flex-col items-center px-4 lg:px-6 min-w-0 h-below-nav lg:h-screen mt-nav lg:mt-0 pb-2 lg:pb-6 relative overflow-hidden">
        <div className="absolute top-4 left-4 hidden lg:block">
          <Logo size="xl" clickable={true} onLogoClick={handleBack} />
        </div>

        <div className="w-full max-w-xl flex-1 flex flex-col items-center gap-2 lg:gap-3 min-h-0 justify-start pt-4 lg:justify-center lg:pt-0">
          <div className="px-3 py-1.5 rounded-full bg-surface-2/60 border border-border/50 flex-shrink-0">
            <span className="text-sm font-medium text-foreground">
              {orientation === "white" ? "White" : "Black"} to move
            </span>
          </div>

          <div
            className="flex-shrink-0 w-full"
            style={{
              maxWidth: "min(100%, calc(100dvh - var(--mobile-nav-h) - 280px))",
            }}>
            <PuzzleBoard
              ref={boardRef}
              key={puzzle.id}
              initialFen={puzzle.fen}
              moves={movesArr}
              revealSolution={revealed}
              orientation={orientation}
            />
          </div>

          {revealed && (
            <div className="flex items-center justify-center flex-shrink-0">
              <BoardControls
                onFirstMove={() => boardRef.current?.goToFirst()}
                onPreviousMove={() => boardRef.current?.goToPrevious()}
                onNextMove={() => boardRef.current?.goToNext()}
                onLastMove={() => boardRef.current?.goToLast()}
                // Reset = jump back to the puzzle position (before any
                // solution move) — same as goToFirst for this view.
                onReset={() => boardRef.current?.goToFirst()}
              />
            </div>
          )}

          <div className="w-full flex-shrink-0 lg:min-h-[2.75rem]">
            {!revealed ? (
              <Button
                variant="outline"
                className="w-full h-11 text-sm rounded-xl border-border/50 hover:bg-surface-2"
                onClick={handleShowAnswer}>
                <Eye size={16} className="mr-2" />
                Show Answer
              </Button>
            ) : (
              <div className="lg:hidden space-y-2">
                <div className="glass-card rounded-xl p-2.5 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Solution</p>
                  <p className="text-base font-mono font-bold text-foreground break-words">
                    {solutionSan.join(" ")}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  How well did you know this?
                </p>
                <RatingButtons onRate={handleRate} disabled={submitting} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right sidebar */}
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
              <Target size={12} />
              Tactics
            </div>
          </div>

          <div className="flex items-center gap-3 lg:gap-4">
            <div className="relative w-12 h-12 lg:w-14 lg:h-14 rounded-xl lg:rounded-2xl flex items-center justify-center shadow-lg bg-gradient-to-br from-purple-500/30 to-blue-500/30 border border-purple-400/30">
              <Target className="w-6 h-6 lg:w-7 lg:h-7 text-purple-300" />
            </div>
            <div>
              <h2 className="text-lg lg:text-xl font-semibold text-foreground">
                Puzzle #{puzzle.lichessId}
              </h2>
              <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
                Rating {puzzle.rating} • {puzzle.categories.join(", ")}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 lg:p-5 flex flex-col overflow-y-auto gap-4 lg:gap-5">
          <div className="grid grid-cols-2 gap-3 lg:gap-4">
            <div className="glass-card rounded-xl p-3 lg:p-4">
              <p className="text-xs text-muted-foreground mb-1">Due reviews</p>
              <p className="text-2xl font-semibold text-foreground">
                {dueCount}
              </p>
            </div>
            <div className="glass-card rounded-xl p-3 lg:p-4">
              <p className="text-xs text-muted-foreground mb-1">Streak</p>
              <div className="flex items-center gap-2">
                <Flame
                  className={`w-5 h-5 ${streak > 0 ? "text-orange-500" : "text-muted-foreground"}`}
                />
                <p className="text-2xl font-semibold text-foreground">
                  {streak}
                </p>
              </div>
            </div>
          </div>

          {prefs && (
            <FiltersPanel
              prefs={prefs}
              band={currentBand}
              onDifficultyChange={handleDifficultyChange}
              onCategoryToggle={handleCategoryToggle}
            />
          )}

          {revealed && (
            <div className="hidden lg:flex flex-col gap-3">
              <div className="glass-card rounded-xl p-4 text-center">
                <p className="text-xs text-muted-foreground mb-2">Solution</p>
                <p className="text-lg font-mono font-bold text-foreground break-words">
                  {solutionSan.join(" ")}
                </p>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                How well did you know this?
              </p>
              <RatingButtons onRate={handleRate} disabled={submitting} />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function FiltersPanel({
  prefs,
  band,
  onDifficultyChange,
  onCategoryToggle,
}: {
  prefs: Prefs;
  band: DifficultyBand;
  onDifficultyChange: (b: DifficultyBand) => void;
  onCategoryToggle: (c: PuzzleCategory, on: boolean) => void;
}) {
  return (
    <div className="glass-card rounded-xl p-3 lg:p-4 space-y-4">
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
          Difficulty
        </label>
        <select
          value={band}
          onChange={(e) => onDifficultyChange(e.target.value as DifficultyBand)}
          className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
          {(
            Object.keys(DIFFICULTY_BANDS) as Array<
              keyof typeof DIFFICULTY_BANDS
            >
          ).map((k) => (
            <option key={k} value={k}>
              {DIFFICULTY_BANDS[k].label}
            </option>
          ))}
          {band === "custom" && (
            <option value="custom">
              Custom ({prefs.ratingMin}–{prefs.ratingMax})
            </option>
          )}
        </select>
      </div>
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
                  onChange={(e) => onCategoryToggle(cat, e.target.checked)}
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
  );
}

function RatingButtons({
  onRate,
  disabled,
}: {
  onRate: (r: ReviewResponse) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      <Button
        onClick={() => onRate("forgot")}
        disabled={disabled}
        className="h-11 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 flex flex-col items-center justify-center gap-0.5 rounded-xl"
        variant="ghost">
        <span className="text-xs font-medium">Forgot</span>
        <span className="text-[10px] opacity-70">Again</span>
      </Button>
      <Button
        onClick={() => onRate("partial")}
        disabled={disabled}
        className="h-11 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 flex flex-col items-center justify-center gap-0.5 rounded-xl"
        variant="ghost">
        <span className="text-xs font-medium">Hard</span>
        <span className="text-[10px] opacity-70">Struggled</span>
      </Button>
      <Button
        onClick={() => onRate("effort")}
        disabled={disabled}
        className="h-11 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 flex flex-col items-center justify-center gap-0.5 rounded-xl"
        variant="ghost">
        <span className="text-xs font-medium">Good</span>
        <span className="text-[10px] opacity-70">Effort</span>
      </Button>
      <Button
        onClick={() => onRate("easy")}
        disabled={disabled}
        className="h-11 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 flex flex-col items-center justify-center gap-0.5 rounded-xl"
        variant="ghost">
        <span className="text-xs font-medium">Easy</span>
        <span className="text-[10px] opacity-70">No problem</span>
      </Button>
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
