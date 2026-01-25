"use client";

import { useState, useEffect } from "react";
import { Play, Settings, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

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
}

interface HomePanelProps {
  onSelectRepertoire: (color: "white" | "black") => void;
  onStartPractice: () => void;
}

export function HomePanel({
  onSelectRepertoire,
  onStartPractice,
}: HomePanelProps) {
  const router = useRouter();
  const [stats, setStats] = useState<TrainingStats>({
    dueCount: 0,
    totalPositions: 0,
    colorStats: {
      white: { learned: 0, total: 0 },
      black: { learned: 0, total: 0 },
    },
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/training-stats");
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Error fetching training stats:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-foreground">Dashboard</h2>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => router.push("/settings")}>
          <Settings size={20} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-4">
        {/* Repertoires */}
        <section>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Repertoires
          </h3>
          <div className="space-y-2">
            {/* White Repertoire */}
            <button
              onClick={() => onSelectRepertoire("white")}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border/50 transition-colors group text-left cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center shadow-sm">
                <span className="text-lg">♔</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  White Repertoire
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-2 flex-1 bg-zinc-300 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-zinc-100 transition-all"
                      style={{
                        width: `${stats.colorStats.white.total > 0 ? Math.round((stats.colorStats.white.learned / stats.colorStats.white.total) * 100) : 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {stats.colorStats.white.total > 0
                      ? `${Math.round((stats.colorStats.white.learned / stats.colorStats.white.total) * 100)}%`
                      : "100%"}
                  </span>
                </div>
              </div>
              <ChevronRight
                size={16}
                className="text-muted-foreground group-hover:text-foreground transition-colors"
              />
            </button>

            {/* Black Repertoire */}
            <button
              onClick={() => onSelectRepertoire("black")}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border/50 transition-colors group text-left cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shadow-sm">
                <span className="text-lg">♚</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Black Repertoire
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-2 flex-1 bg-zinc-300 dark:bg-zinc-600 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-zinc-800 transition-all"
                      style={{
                        width: `${stats.colorStats.black.total > 0 ? Math.round((stats.colorStats.black.learned / stats.colorStats.black.total) * 100) : 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {stats.colorStats.black.total > 0
                      ? `${Math.round((stats.colorStats.black.learned / stats.colorStats.black.total) * 100)}%`
                      : "100%"}
                  </span>
                </div>
              </div>
              <ChevronRight
                size={18}
                className="text-muted-foreground group-hover:text-foreground transition-colors"
              />
            </button>
          </div>
        </section>

        {/* Daily Tasks */}
        <section>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Daily Tasks
          </h3>
          <div className="bg-surface-2 rounded-lg border border-border/50 p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {isLoading ? "..." : stats.dueCount}
                </p>
                <p className="text-sm text-muted-foreground">
                  moves to practice
                </p>
              </div>
              <div className="text-right">
                <p className="text-base text-primary font-medium">
                  {stats.dueCount > 0 ? "Due now" : "All caught up!"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {stats.dueCount > 0
                    ? `~${Math.max(1, Math.ceil(stats.dueCount / 4))} min`
                    : "Great job!"}
                </p>
              </div>
            </div>
            <Button
              onClick={onStartPractice}
              className="w-full gap-2 text-base"
              size="lg"
              disabled={stats.dueCount === 0}>
              <Play size={20} />
              {stats.dueCount > 0 ? "Practice Now" : "Nothing to Practice"}
            </Button>
          </div>
        </section>

        {/* Progress Overview */}
        <section>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Progress
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-2 rounded-lg p-3 border border-border/50">
              <p className="text-sm text-muted-foreground mb-2">
                Total Positions
              </p>
              <p className="text-2xl font-semibold text-foreground">
                {isLoading ? "..." : stats.totalPositions}
              </p>
            </div>
            <div className="bg-surface-2 rounded-lg p-3 border border-border/50">
              <p className="text-sm text-muted-foreground mb-2">Due Today</p>
              <p className="text-2xl font-semibold text-foreground">
                {isLoading ? "..." : stats.dueCount}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
