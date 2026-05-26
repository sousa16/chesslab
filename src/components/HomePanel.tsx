"use client";

import {
  Play,
  Settings,
  ChevronRight,
  Target,
  Clock,
  BookOpen,
  Flame,
  Zap,
  Compass,
  BarChart3,
  Radar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect, useTransition, use, useRef } from "react";
import { SettingsModal } from "@/components/SettingsModal";
import {
  getCachedStats,
  setCachedStats,
  patchCachedStats,
} from "@/lib/statsCache";
import type { TrainingStats as ServerTrainingStats } from "@/lib/trainingStats";

interface ColorStats {
  // Counts are in LINES (= deepest saved position per branch), aligned with
  // the repertoire panel's "Mastery Level" metric. `mastered` = SRS has
  // promoted the leaf out of the learning phase.
  mastered: number;
  total: number;
}

interface TrainingStats {
  dueCount: number;
  colorStats: {
    white: ColorStats;
    black: ColorStats;
  };
  streak: number;
  accuracy: number;
  timeSpentMinutes: number;
  positionsReviewedToday?: number;
}

interface HomePanelProps {
  onSelectRepertoire: (color: "white" | "black") => void;
  onStartPractice: () => void;
  // Promise of pre-computed stats from the /home server page. Used as
  // the initial value when the client cache is empty (= cold load).
  // Revisits read from the cache and ignore this — `use()` of an
  // already-resolved promise is cheap and doesn't suspend.
  statsPromise?: Promise<ServerTrainingStats | null>;
}

interface RepertoireStats {
  lines: number;
  positions: number;
  percentage: number;
}

// Progress Circle Component
function ProgressCircle({
  value,
  max,
  size = 56,
  strokeWidth = 4,
  color = "primary",
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: "primary" | "white" | "black";
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percent = max > 0 ? (value / max) * 100 : 0;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  const colorClasses = {
    primary: "stroke-primary",
    white: "stroke-zinc-400",
    black: "stroke-zinc-600",
  };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="progress-ring" width={size} height={size}>
        <circle
          className="stroke-muted"
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={`${colorClasses[color]} transition-all duration-500 ease-out`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: strokeDashoffset,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-semibold text-foreground">
          {Math.round(percent)}%
        </span>
      </div>
    </div>
  );
}

// Get greeting based on time of day
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Get first name from email or name
function getFirstName(user: {
  name?: string | null;
  email?: string | null;
}): string {
  if (user.name) {
    return user.name.split(" ")[0];
  }
  if (user.email) {
    const emailName = user.email.split("@")[0];
    return emailName.charAt(0).toUpperCase() + emailName.slice(1);
  }
  return "there";
}

export function HomePanel({
  onSelectRepertoire,
  onStartPractice: onStartPracticeCallback,
  statsPromise,
}: HomePanelProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const greeting = getGreeting();
  const firstName = session?.user ? getFirstName(session.user) : "there";
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isStartingPractice, startPracticeTransition] = useTransition();

  const [whiteStats, setWhiteStats] = useState<RepertoireStats>({
    lines: 0,
    positions: 0,
    percentage: 0,
  });
  const [blackStats, setBlackStats] = useState<RepertoireStats>({
    lines: 0,
    positions: 0,
    percentage: 0,
  });
  // Seed precedence:
  //   1. JS module cache — populated by every successful fetchStats.
  //      Survives client-side nav, so /tactics → /home is instant.
  //   2. Server-streamed promise — populated by the /home RSC. Used
  //      for cold loads (no cache yet). `use()` of an already-resolved
  //      promise returns its value synchronously; only the first cold
  //      mount actually suspends.
  //   3. null — show "…" placeholders and rely on fetchStats below.
  const cachedInitial = getCachedStats();
  const streamedInitial: ServerTrainingStats | null =
    cachedInitial == null && statsPromise ? use(statsPromise) : null;
  const initialStats = cachedInitial ?? streamedInitial;
  const [trainingStats, setTrainingStats] = useState<TrainingStats | null>(
    initialStats,
  );
  const [positionsReviewedToday, setPositionsReviewedToday] = useState<number>(
    initialStats?.positionsReviewedToday ?? 0,
  );
  const [isLoading, setIsLoading] = useState(!initialStats);

  // The streamed stats are server-fresh on first cold mount, so push
  // them into the module cache once. After that, fetchStats keeps the
  // cache in sync.
  useEffect(() => {
    if (streamedInitial && !getCachedStats()) {
      setCachedStats(streamedInitial);
    }
  }, [streamedInitial]);

  const onStartPractice = () => {
    if (isStartingPractice) return;
    startPracticeTransition(() => {
      onStartPracticeCallback();
    });
  };

  // Warm the repertoire fetch + the Tactics route bundle before the user
  // actually navigates. By the time onClick fires, the response is sitting
  // in the browser's HTTP cache and the route's JS chunks have downloaded,
  // so the panel/page renders without the initial loading flash. The
  // prefetched fetch piggybacks on the existing ETag — repeated hovers
  // cost nothing once a 304 has been observed.
  const prefetchedColorsRef = useRef<Set<"white" | "black">>(new Set());
  const handleRepertoireHover = (color: "white" | "black") => {
    if (prefetchedColorsRef.current.has(color)) return;
    prefetchedColorsRef.current.add(color);
    try {
      void fetch(`/api/repertoires?color=${color}`, {
        credentials: "same-origin",
      }).catch(() => {
        prefetchedColorsRef.current.delete(color);
      });
    } catch {
      prefetchedColorsRef.current.delete(color);
    }
  };
  const tacticsPrefetchedRef = useRef(false);
  const handleTacticsHover = () => {
    if (tacticsPrefetchedRef.current) return;
    tacticsPrefetchedRef.current = true;
    try {
      router.prefetch("/tactics");
    } catch {
      tacticsPrefetchedRef.current = false;
    }
  };

  // Last etag the server sent us for /api/training-stats. Sending it back
  // as If-None-Match lets the server respond 304 without serializing the
  // full body — meaningful win on every nav/visibility-change refetch
  // since the actual stats only change after a review/save/delete.
  const trainingStatsEtagRef = useRef<string | null>(null);

  const fetchStats = async () => {
    try {
      const headers: Record<string, string> = {};
      if (trainingStatsEtagRef.current) {
        headers["If-None-Match"] = trainingStatsEtagRef.current;
      }
      const trainingRes = await fetch("/api/training-stats", { headers });
      if (trainingRes.ok) {
        const etag = trainingRes.headers.get("etag");
        if (etag) trainingStatsEtagRef.current = etag;
        const trainingData = (await trainingRes.json()) as ServerTrainingStats;
        setTrainingStats(trainingData);
        setCachedStats(trainingData);
        setPositionsReviewedToday(trainingData.positionsReviewedToday ?? 0);
      } else if (trainingRes.status === 304) {
        // Etag match — existing state is still valid; no work to do.
      } else {
        console.error("Training stats fetch failed:", trainingRes.status);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  // Fire the stats fetch as soon as we mount IF we don't already have
  // them. We deliberately don't wait on `useSession()` to resolve —
  // the JWT cookie is already attached by the browser, so the API auth
  // check works regardless of whether the React session context has
  // hydrated yet. When the RSC streamed stats (initialStats != null),
  // we skip the fetch entirely — the RSC payload already covered it.
  //
  // Reviews fired during a training session patch the module-level
  // cache directly via `recordReview` in statsCache, so HomePanel sees
  // the right numbers when it re-mounts on return from /training even
  // though its own React event listener was torn down for the session.
  useEffect(() => {
    if (initialStats) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const doFetch = async () => {
      await fetchStats();
      if (!cancelled) setIsLoading(false);
    };
    doFetch();
    return () => {
      cancelled = true;
    };
    // We intentionally only react to the initial mount-time value of
    // initialStats; subsequent updates come through fetchStats / the
    // training-stats-updated event handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for training updates from other parts of the app (e.g.,
  // TrainingClient / TacticsClient / BuildClient).
  //
  // Events with `positionsReviewed` in their detail are review writes
  // (one card finished). We patch the cached stats and React state in
  // place so re-navigating to /home shows the updated numbers without
  // waiting on the background refetch. `wasDue` (when present) decrements
  // dueCount — only opening reviews carry it; puzzle reviews don't
  // affect the repertoire's "moves to practice" counter.
  //
  // Events without that detail are full-change signals (save-line,
  // delete-line/family). For those we just refetch — too many fields
  // could have changed to patch reliably.
  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<{
        timeSpentMs?: number;
        positionsReviewed?: number;
        wasDue?: boolean;
      }>;
      const detail = custom?.detail;
      if (detail && typeof detail.positionsReviewed === "number") {
        const reviewed = detail.positionsReviewed;
        const wasDue = detail.wasDue === true;
        setPositionsReviewedToday((prev) => prev + reviewed);
        setTrainingStats((prev) => {
          if (!prev) return prev;
          const next: TrainingStats = {
            ...prev,
            positionsReviewedToday:
              (prev.positionsReviewedToday ?? 0) + reviewed,
            dueCount: wasDue ? Math.max(0, prev.dueCount - 1) : prev.dueCount,
          };
          patchCachedStats(next);
          return next;
        });
      } else {
        // Save/delete event — refetch the whole thing.
        fetchStats();
      }
    };

    window.addEventListener("training-stats-updated", handler as EventListener);
    return () =>
      window.removeEventListener(
        "training-stats-updated",
        handler as EventListener,
      );
  }, []);

  // Refetch when the tab becomes visible again (e.g. after returning from
  // practice). The `training-stats-updated` event already covers the hot
  // path of "just finished a review", so we don't poll on a timer.
  useEffect(() => {
    if (!session?.user) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchStats();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [session?.user]);

  // Per-color mastery percentage = mastered LINES / total LINES.
  const whitePercentage = trainingStats?.colorStats?.white?.total
    ? Math.round(
        (trainingStats.colorStats.white.mastered /
          trainingStats.colorStats.white.total) *
          100,
      )
    : 0;
  const blackPercentage = trainingStats?.colorStats?.black?.total
    ? Math.round(
        (trainingStats.colorStats.black.mastered /
          trainingStats.colorStats.black.total) *
          100,
      )
    : 0;

  const whiteLineCount =
    trainingStats?.colorStats?.white?.total ?? whiteStats.positions;
  const blackLineCount =
    trainingStats?.colorStats?.black?.total ?? blackStats.positions;

  // While the first stats fetch is in flight we render an ellipsis
  // placeholder so the dashboard never flashes "0" before the real values
  // arrive. `pending` is true on every cold load (login or back-from-
  // tactics nav); the visibility-change refetch reuses the stale data so
  // post-load refreshes don't blank out.
  const pending = trainingStats === null;
  const dash = "…";
  const dueCount = trainingStats?.dueCount ?? 0;
  const estimatedMinutes = Math.max(1, Math.ceil((dueCount * 15) / 60));

  // Calculate total mastered lines across both colors
  const totalMastered =
    (trainingStats?.colorStats?.white?.mastered ?? 0) +
    (trainingStats?.colorStats?.black?.mastered ?? 0);

  // Display positions reviewed today (no overlap with "lines learned")
  const displayedPositions = positionsReviewedToday;

  return (
    <div className="h-full flex flex-col">
      {/* Header with Greeting */}
      <div className="p-4 lg:p-5 pb-3 lg:pb-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs lg:text-sm text-muted-foreground">
            {greeting},
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground -mr-2"
            onClick={() => setShowSettingsModal(true)}>
            <Settings size={18} />
          </Button>
        </div>
        <h2 className="text-xl lg:text-2xl font-semibold text-foreground tracking-tight">
          {firstName}
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 lg:p-5 space-y-4 lg:space-y-6 overflow-y-auto">
        {/* Hero Practice Card */}
        <section className="glass-card rounded-xl p-4 lg:p-5 hover-lift">
          <div className="flex items-start justify-between mb-3 lg:mb-4">
            <div>
              <p className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">
                {pending ? dash : dueCount}
              </p>
              <p className="text-sm lg:text-base text-muted-foreground mt-1">
                moves to practice
              </p>
            </div>
            <div className="text-right">
              <div className="inline-flex items-center gap-1 lg:gap-1.5 px-2 lg:px-2.5 py-1 rounded-full bg-primary/15 text-primary text-xs lg:text-sm font-medium">
                <Clock size={12} className="lg:hidden" />
                <Clock size={14} className="hidden lg:block" />
                {pending ? dash : dueCount === 0 ? "0" : `~${estimatedMinutes}`}{" "}
                min
              </div>
            </div>
          </div>
          <Button
            onClick={onStartPractice}
            disabled={isStartingPractice}
            className="w-full gap-2 lg:gap-2.5 text-sm lg:text-base h-10 lg:h-12 btn-primary-gradient rounded-xl font-medium"
            size="lg">
            <Play size={18} className="lg:hidden" fill="currentColor" />
            <Play size={20} className="hidden lg:block" fill="currentColor" />
            {isStartingPractice ? "Starting..." : "Practice Now"}
          </Button>
        </section>

        {/* Repertoires - Hero Cards */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 lg:mb-3">
            Repertoires
          </h3>
          <div className="space-y-2 lg:space-y-3">
            {/* White Repertoire - Premium Card */}
            <button
              onClick={() => onSelectRepertoire("white")}
              onMouseEnter={() => handleRepertoireHover("white")}
              onFocus={() => handleRepertoireHover("white")}
              className="repertoire-card repertoire-card-white w-full relative overflow-hidden rounded-xl lg:rounded-2xl p-4 lg:p-5 transition-all duration-300 group text-left cursor-pointer">
              {/* Gradient border effect */}
              <div className="absolute inset-0 rounded-xl lg:rounded-2xl bg-gradient-to-br from-zinc-400/20 via-white/10 to-zinc-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {/* Content */}
              <div className="relative flex items-center gap-3 lg:gap-4">
                {/* King icon with glow */}
                <div className="relative">
                  <div className="absolute inset-0 bg-white/30 rounded-lg lg:rounded-xl blur-lg group-hover:bg-white/40 transition-all duration-300" />
                  <div className="relative w-12 h-12 lg:w-14 lg:h-14 rounded-lg lg:rounded-xl bg-gradient-to-br from-white via-zinc-100 to-zinc-300 flex items-center justify-center shadow-lg border border-white/50">
                    <span className="text-xl lg:text-2xl drop-shadow-sm">
                      ♔
                    </span>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm lg:text-base font-semibold text-foreground">
                      White Repertoire
                    </p>
                    <span className="px-1.5 lg:px-2 py-0.5 text-[9px] lg:text-[10px] font-medium rounded-full bg-primary/20 text-primary uppercase tracking-wide">
                      Build
                    </span>
                  </div>
                  <p className="text-xs lg:text-sm text-muted-foreground mt-0.5 lg:mt-1">
                    {pending
                      ? dash
                      : `${whiteLineCount} ${whiteLineCount === 1 ? "line" : "lines"}`}
                  </p>
                  {/* Progress bar */}
                  <div className="mt-2 lg:mt-3 h-1 lg:h-1.5 bg-zinc-700/50 rounded-full overflow-hidden w-full">
                    <div
                      className="h-full bg-gradient-to-r from-zinc-400 to-white rounded-full transition-all duration-500"
                      style={{ width: pending ? "0%" : `${whitePercentage}%` }}
                    />
                  </div>
                </div>

                {/* Percentage and arrow */}
                <div className="flex flex-col items-end gap-0.5 lg:gap-1 flex-shrink-0 w-12 lg:w-14">
                  <span className="text-xl lg:text-2xl font-bold text-foreground whitespace-nowrap">
                    {pending ? dash : `${whitePercentage}%`}
                  </span>
                  <div className="flex items-center gap-1 text-[10px] lg:text-xs text-muted-foreground group-hover:text-primary transition-colors">
                    <span>Edit</span>
                    <ChevronRight
                      size={12}
                      className="group-hover:translate-x-1 transition-transform duration-200"
                    />
                  </div>
                </div>
              </div>
            </button>

            {/* Black Repertoire - Premium Card */}
            <button
              onClick={() => onSelectRepertoire("black")}
              onMouseEnter={() => handleRepertoireHover("black")}
              onFocus={() => handleRepertoireHover("black")}
              className="repertoire-card repertoire-card-black w-full relative overflow-hidden rounded-xl lg:rounded-2xl p-4 lg:p-5 transition-all duration-300 group text-left cursor-pointer">
              {/* Gradient border effect */}
              <div className="absolute inset-0 rounded-xl lg:rounded-2xl bg-gradient-to-br from-zinc-600/20 via-zinc-800/10 to-zinc-900/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {/* Content */}
              <div className="relative flex items-center gap-3 lg:gap-4">
                {/* King icon with glow */}
                <div className="relative">
                  <div className="absolute inset-0 bg-zinc-500/20 rounded-lg lg:rounded-xl blur-lg group-hover:bg-zinc-400/30 transition-all duration-300" />
                  <div className="relative w-12 h-12 lg:w-14 lg:h-14 rounded-lg lg:rounded-xl bg-gradient-to-br from-zinc-600 via-zinc-800 to-zinc-900 flex items-center justify-center shadow-lg border border-zinc-600/50">
                    <span className="text-xl lg:text-2xl text-zinc-300 drop-shadow-sm">
                      ♚
                    </span>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm lg:text-base font-semibold text-foreground">
                      Black Repertoire
                    </p>
                    <span className="px-1.5 lg:px-2 py-0.5 text-[9px] lg:text-[10px] font-medium rounded-full bg-primary/20 text-primary uppercase tracking-wide">
                      Build
                    </span>
                  </div>
                  <p className="text-xs lg:text-sm text-muted-foreground mt-0.5 lg:mt-1">
                    {pending
                      ? dash
                      : `${blackLineCount} ${blackLineCount === 1 ? "line" : "lines"}`}
                  </p>
                  {/* Progress bar */}
                  <div className="mt-2 lg:mt-3 h-1 lg:h-1.5 bg-zinc-700/50 rounded-full overflow-hidden w-full">
                    <div
                      className="h-full bg-gradient-to-r from-zinc-600 to-zinc-400 rounded-full transition-all duration-500"
                      style={{ width: pending ? "0%" : `${blackPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Percentage and arrow */}
                <div className="flex flex-col items-end gap-0.5 lg:gap-1 flex-shrink-0 w-12 lg:w-14">
                  <span className="text-xl lg:text-2xl font-bold text-foreground whitespace-nowrap">
                    {pending ? dash : `${blackPercentage}%`}
                  </span>
                  <div className="flex items-center gap-1 text-[10px] lg:text-xs text-muted-foreground group-hover:text-primary transition-colors">
                    <span>Edit</span>
                    <ChevronRight
                      size={12}
                      className="group-hover:translate-x-1 transition-transform duration-200"
                    />
                  </div>
                </div>
              </div>
            </button>
          </div>
        </section>

        {/* Tactics */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 lg:mb-3">
            Tactics
          </h3>
          <button
            onClick={() => router.push("/tactics")}
            onMouseEnter={handleTacticsHover}
            onFocus={handleTacticsHover}
            className="repertoire-card w-full relative overflow-hidden rounded-xl lg:rounded-2xl p-4 lg:p-5 transition-all duration-300 group text-left cursor-pointer">
            <div className="absolute inset-0 rounded-xl lg:rounded-2xl bg-gradient-to-br from-purple-500/20 via-blue-500/10 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative flex items-center gap-3 lg:gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-purple-500/30 rounded-lg lg:rounded-xl blur-lg group-hover:bg-purple-500/40 transition-all duration-300" />
                <div className="relative w-12 h-12 lg:w-14 lg:h-14 rounded-lg lg:rounded-xl bg-gradient-to-br from-purple-500 via-purple-600 to-blue-600 flex items-center justify-center shadow-lg border border-purple-400/50">
                  <Target size={22} className="text-white drop-shadow-sm" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm lg:text-base font-semibold text-foreground">
                    Tactics Trainer
                  </p>
                  <span className="px-1.5 lg:px-2 py-0.5 text-[9px] lg:text-[10px] font-medium rounded-full bg-primary/20 text-primary uppercase tracking-wide">
                    SRS
                  </span>
                </div>
                <p className="text-xs lg:text-sm text-muted-foreground mt-0.5 lg:mt-1">
                  Mates, motifs, middlegame & endgame puzzles
                </p>
              </div>
              <ChevronRight
                size={16}
                className="text-muted-foreground group-hover:translate-x-1 transition-transform duration-200 flex-shrink-0"
              />
            </div>
          </button>
        </section>

        {/* Explorer */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 lg:mb-3">
            Explorer
          </h3>
          <button
            onClick={() => router.push("/explorer")}
            className="repertoire-card w-full relative overflow-hidden rounded-xl lg:rounded-2xl p-4 lg:p-5 transition-all duration-300 group text-left cursor-pointer">
            <div className="absolute inset-0 rounded-xl lg:rounded-2xl bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-emerald-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative flex items-center gap-3 lg:gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/30 rounded-lg lg:rounded-xl blur-lg group-hover:bg-emerald-500/40 transition-all duration-300" />
                <div className="relative w-12 h-12 lg:w-14 lg:h-14 rounded-lg lg:rounded-xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 flex items-center justify-center shadow-lg border border-emerald-400/50">
                  <Compass size={22} className="text-white drop-shadow-sm" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm lg:text-base font-semibold text-foreground">
                  Repertoire Explorer
                </p>
                <p className="text-xs lg:text-sm text-muted-foreground mt-0.5 lg:mt-1">
                  Replay games and see where lines leave your repertoire
                </p>
              </div>
              <ChevronRight
                size={16}
                className="text-muted-foreground group-hover:translate-x-1 transition-transform duration-200 flex-shrink-0"
              />
            </div>
          </button>
        </section>

        {/* Gaps */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 lg:mb-3">
            Gaps
          </h3>
          <button
            onClick={() => router.push("/gaps")}
            className="repertoire-card w-full relative overflow-hidden rounded-xl lg:rounded-2xl p-4 lg:p-5 transition-all duration-300 group text-left cursor-pointer">
            <div className="absolute inset-0 rounded-xl lg:rounded-2xl bg-gradient-to-br from-rose-500/20 via-pink-500/10 to-rose-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative flex items-center gap-3 lg:gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-rose-500/30 rounded-lg lg:rounded-xl blur-lg group-hover:bg-rose-500/40 transition-all duration-300" />
                <div className="relative w-12 h-12 lg:w-14 lg:h-14 rounded-lg lg:rounded-xl bg-gradient-to-br from-rose-500 via-rose-600 to-pink-600 flex items-center justify-center shadow-lg border border-rose-400/50">
                  <Radar size={22} className="text-white drop-shadow-sm" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm lg:text-base font-semibold text-foreground">
                  Repertoire Gaps
                </p>
                <p className="text-xs lg:text-sm text-muted-foreground mt-0.5 lg:mt-1">
                  Compare your repertoire to your chess.com / Lichess games
                </p>
              </div>
              <ChevronRight
                size={16}
                className="text-muted-foreground group-hover:translate-x-1 transition-transform duration-200 flex-shrink-0"
              />
            </div>
          </button>
        </section>

        {/* Stats */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 lg:mb-3">
            Stats
          </h3>
          <button
            onClick={() => router.push("/stats")}
            className="repertoire-card w-full relative overflow-hidden rounded-xl lg:rounded-2xl p-4 lg:p-5 transition-all duration-300 group text-left cursor-pointer">
            <div className="absolute inset-0 rounded-xl lg:rounded-2xl bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-amber-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative flex items-center gap-3 lg:gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-amber-500/30 rounded-lg lg:rounded-xl blur-lg group-hover:bg-amber-500/40 transition-all duration-300" />
                <div className="relative w-12 h-12 lg:w-14 lg:h-14 rounded-lg lg:rounded-xl bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 flex items-center justify-center shadow-lg border border-amber-400/50">
                  <BarChart3 size={22} className="text-white drop-shadow-sm" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm lg:text-base font-semibold text-foreground">
                  Stats
                </p>
                <p className="text-xs lg:text-sm text-muted-foreground mt-0.5 lg:mt-1">
                  Mastery and weak spots, per opening and tactics theme
                </p>
              </div>
              <ChevronRight
                size={16}
                className="text-muted-foreground group-hover:translate-x-1 transition-transform duration-200 flex-shrink-0"
              />
            </div>
          </button>
        </section>

        {/* Activity Hub */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 lg:mb-3">
            Activity Hub
          </h3>

          {/* Stats Grid - Small Tiles */}
          <div className="grid grid-cols-2 gap-2">
            <div className="glass-card rounded-xl p-3 lg:p-4 hover-lift border-glow transition-all">
              <div className="flex items-center gap-2 mb-1.5 lg:mb-2">
                <div className="w-6 h-6 lg:w-7 lg:h-7 rounded-lg bg-orange-500/15 flex items-center justify-center">
                  <Flame size={12} className="text-orange-400 lg:hidden" />
                  <Flame
                    size={14}
                    className="text-orange-400 hidden lg:block"
                  />
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-foreground tracking-tight">
                {pending ? dash : (trainingStats?.streak ?? 0)}
              </p>
              <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">
                day streak
              </p>
            </div>

            <div className="glass-card rounded-xl p-3 lg:p-4 hover-lift border-glow transition-all">
              <div className="flex items-center gap-2 mb-1.5 lg:mb-2">
                <div className="w-6 h-6 lg:w-7 lg:h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <Zap size={12} className="text-emerald-400 lg:hidden" />
                  <Zap size={14} className="text-emerald-400 hidden lg:block" />
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-foreground tracking-tight">
                {pending ? dash : `${trainingStats?.accuracy ?? 0}%`}
              </p>
              <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">
                accuracy
              </p>
            </div>

            <div className="glass-card rounded-xl p-3 lg:p-4 hover-lift border-glow transition-all">
              <div className="flex items-center gap-2 mb-1.5 lg:mb-2">
                <div className="w-6 h-6 lg:w-7 lg:h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <BookOpen size={12} className="text-blue-400 lg:hidden" />
                  <BookOpen
                    size={14}
                    className="text-blue-400 hidden lg:block"
                  />
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-foreground tracking-tight">
                {pending ? dash : totalMastered}
              </p>
              <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">
                lines learned
              </p>
            </div>

            <div className="glass-card rounded-xl p-3 lg:p-4 hover-lift border-glow transition-all">
              <div className="flex items-center gap-2 mb-1.5 lg:mb-2">
                <div className="w-6 h-6 lg:w-7 lg:h-7 rounded-lg bg-purple-500/15 flex items-center justify-center">
                  <Clock size={12} className="text-purple-400 lg:hidden" />
                  <Clock
                    size={14}
                    className="text-purple-400 hidden lg:block"
                  />
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-foreground tracking-tight">
                {pending ? dash : displayedPositions}
              </p>
              <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">
                reviews today
              </p>
            </div>
          </div>
        </section>
      </div>

      <SettingsModal
        open={showSettingsModal}
        onOpenChange={setShowSettingsModal}
      />
    </div>
  );
}
