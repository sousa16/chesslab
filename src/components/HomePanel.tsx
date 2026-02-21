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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { SettingsModal } from "@/components/SettingsModal";

interface ColorStats {
  learned: number;
  total: number;
}

interface TrainingStats {
  dueCount: number;
  totalPositions: number;
  colorStats: {
    white: ColorStats;
    black: ColorStats;
  };
  streak: number;
  accuracy: number;
  timeSpentMinutes: number;
}

interface HomePanelProps {
  onSelectRepertoire: (color: "white" | "black") => void;
  onStartPractice: () => void;
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
}: HomePanelProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const greeting = getGreeting();
  const firstName = session?.user ? getFirstName(session.user) : "there";
  const [showSettingsModal, setShowSettingsModal] = useState(false);

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
  const [trainingStats, setTrainingStats] = useState<TrainingStats | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);

  const { isLoading: isStartingPractice, execute: onStartPractice } =
    useAsyncAction(
      async () => {
        // Simulate brief async operation to prevent accidental double-clicks
        await new Promise((resolve) => setTimeout(resolve, 100));
        onStartPracticeCallback();
      },
      () => {
        // Success - callback handles navigation
      },
      (error) => {
        console.error("Error starting practice:", error);
      },
    );

  const fetchStats = async () => {
    try {
      // Fetch training stats (due cards, total positions, learned count)
      const trainingRes = await fetch("/api/training-stats");
      if (trainingRes.ok) {
        const trainingData = await trainingRes.json();
        setTrainingStats(trainingData);
      } else {
        console.error("Training stats fetch failed:", trainingRes.status);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  useEffect(() => {
    // Wait for session to finish loading
    if (status === "loading") {
      return;
    }

    // Only fetch when session is available
    if (!session?.user) {
      setIsLoading(false);
      return;
    }

    const doFetch = async () => {
      setIsLoading(true);
      await fetchStats();
      setIsLoading(false);
    };

    doFetch();
  }, [session?.user, status]);

  // Refetch stats when page becomes visible (after returning from practice)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchStats();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Calculate percentages based on learned positions from training stats
  const whitePercentage = trainingStats?.colorStats?.white?.total
    ? Math.round(
        (trainingStats.colorStats.white.learned /
          trainingStats.colorStats.white.total) *
          100,
      )
    : 0;
  const blackPercentage = trainingStats?.colorStats?.black?.total
    ? Math.round(
        (trainingStats.colorStats.black.learned /
          trainingStats.colorStats.black.total) *
          100,
      )
    : 0;

  // Use training stats for position counts (more reliable than tree traversal)
  const whitePositionCount =
    trainingStats?.colorStats?.white?.total ?? whiteStats.positions;
  const blackPositionCount =
    trainingStats?.colorStats?.black?.total ?? blackStats.positions;

  // Estimate practice time (roughly 15 seconds per position)
  const dueCount = trainingStats?.dueCount ?? 0;
  const estimatedMinutes = Math.max(1, Math.ceil((dueCount * 15) / 60));

  // Calculate total learned positions
  const totalLearned =
    (trainingStats?.colorStats?.white?.learned ?? 0) +
    (trainingStats?.colorStats?.black?.learned ?? 0);

  return (
    <div className="h-full flex flex-col">
      {/* Header with Greeting */}
      <div className="p-4 lg:p-5 pb-3 lg:pb-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs lg:text-sm text-muted-foreground">{greeting},</p>
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
                {dueCount}
              </p>
              <p className="text-sm lg:text-base text-muted-foreground mt-1">
                moves to practice
              </p>
            </div>
            <div className="text-right">
              <div className="inline-flex items-center gap-1 lg:gap-1.5 px-2 lg:px-2.5 py-1 rounded-full bg-primary/15 text-primary text-xs lg:text-sm font-medium">
                <Clock size={12} className="lg:hidden" />
                <Clock size={14} className="hidden lg:block" />
                {dueCount === 0 ? "0" : `~${estimatedMinutes}`} min
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
              className="repertoire-card repertoire-card-white w-full relative overflow-hidden rounded-xl lg:rounded-2xl p-4 lg:p-5 transition-all duration-300 group text-left cursor-pointer">
              {/* Gradient border effect */}
              <div className="absolute inset-0 rounded-xl lg:rounded-2xl bg-gradient-to-br from-zinc-400/20 via-white/10 to-zinc-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {/* Content */}
              <div className="relative flex items-center gap-3 lg:gap-4">
                {/* King icon with glow */}
                <div className="relative">
                  <div className="absolute inset-0 bg-white/30 rounded-lg lg:rounded-xl blur-lg group-hover:bg-white/40 transition-all duration-300" />
                  <div className="relative w-12 h-12 lg:w-14 lg:h-14 rounded-lg lg:rounded-xl bg-gradient-to-br from-white via-zinc-100 to-zinc-300 flex items-center justify-center shadow-lg border border-white/50">
                    <span className="text-xl lg:text-2xl drop-shadow-sm">♔</span>
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
                    {whitePositionCount} positions
                  </p>
                  {/* Progress bar */}
                  <div className="mt-2 lg:mt-3 h-1 lg:h-1.5 bg-zinc-700/50 rounded-full overflow-hidden w-full">
                    <div
                      className="h-full bg-gradient-to-r from-zinc-400 to-white rounded-full transition-all duration-500"
                      style={{ width: `${whitePercentage}%` }}
                    />
                  </div>
                </div>

                {/* Percentage and arrow */}
                <div className="flex flex-col items-end gap-0.5 lg:gap-1 flex-shrink-0 w-12 lg:w-14">
                  <span className="text-xl lg:text-2xl font-bold text-foreground whitespace-nowrap">
                    {whitePercentage}%
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
                    {blackPositionCount} positions
                  </p>
                  {/* Progress bar */}
                  <div className="mt-2 lg:mt-3 h-1 lg:h-1.5 bg-zinc-700/50 rounded-full overflow-hidden w-full">
                    <div
                      className="h-full bg-gradient-to-r from-zinc-600 to-zinc-400 rounded-full transition-all duration-500"
                      style={{ width: `${blackPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Percentage and arrow */}
                <div className="flex flex-col items-end gap-0.5 lg:gap-1 flex-shrink-0 w-12 lg:w-14">
                  <span className="text-xl lg:text-2xl font-bold text-foreground whitespace-nowrap">
                    {blackPercentage}%
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
                  <Flame size={14} className="text-orange-400 hidden lg:block" />
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-foreground tracking-tight">
                {trainingStats?.streak ?? 0}
              </p>
              <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">day streak</p>
            </div>

            <div className="glass-card rounded-xl p-3 lg:p-4 hover-lift border-glow transition-all">
              <div className="flex items-center gap-2 mb-1.5 lg:mb-2">
                <div className="w-6 h-6 lg:w-7 lg:h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <Zap size={12} className="text-emerald-400 lg:hidden" />
                  <Zap size={14} className="text-emerald-400 hidden lg:block" />
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-foreground tracking-tight">
                {trainingStats?.accuracy ?? 0}%
              </p>
              <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">accuracy</p>
            </div>

            <div className="glass-card rounded-xl p-3 lg:p-4 hover-lift border-glow transition-all">
              <div className="flex items-center gap-2 mb-1.5 lg:mb-2">
                <div className="w-6 h-6 lg:w-7 lg:h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <BookOpen size={12} className="text-blue-400 lg:hidden" />
                  <BookOpen size={14} className="text-blue-400 hidden lg:block" />
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-foreground tracking-tight">
                {totalLearned}
              </p>
              <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">
                lines learned
              </p>
            </div>

            <div className="glass-card rounded-xl p-3 lg:p-4 hover-lift border-glow transition-all">
              <div className="flex items-center gap-2 mb-1.5 lg:mb-2">
                <div className="w-6 h-6 lg:w-7 lg:h-7 rounded-lg bg-purple-500/15 flex items-center justify-center">
                  <Clock size={12} className="text-purple-400 lg:hidden" />
                  <Clock size={14} className="text-purple-400 hidden lg:block" />
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-foreground tracking-tight">
                {trainingStats?.dueCount === 0
                  ? 0
                  : (trainingStats?.timeSpentMinutes ?? 0)}
                m
              </p>
              <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">today</p>
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
