"use client";

import { Play, Settings, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface HomePanelProps {
  onSelectRepertoire: (color: "white" | "black") => void;
  onStartPractice: () => void;
}

export function HomePanel({
  onSelectRepertoire,
  onStartPractice,
}: HomePanelProps) {
  const router = useRouter();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Dashboard</h2>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => router.push("/settings")}>
          <Settings size={18} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Repertoires */}
        <section>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Repertoires
          </h3>
          <div className="space-y-2">
            {/* White Repertoire */}
            <button
              onClick={() => onSelectRepertoire("white")}
              className="w-full flex items-center gap-3 p-4 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border/50 transition-colors group text-left cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center shadow-sm">
                <span className="text-lg">♔</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  White Repertoire
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1.5 flex-1 bg-zinc-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: "68%" }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">68%</span>
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
              className="w-full flex items-center gap-3 p-4 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border/50 transition-colors group text-left cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shadow-sm">
                <span className="text-lg">♚</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Black Repertoire
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1.5 flex-1 bg-zinc-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: "45%" }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">45%</span>
                </div>
              </div>
              <ChevronRight
                size={16}
                className="text-muted-foreground group-hover:text-foreground transition-colors"
              />
            </button>
          </div>
        </section>

        {/* Daily Tasks */}
        <section>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Daily Tasks
          </h3>
          <div className="bg-surface-2 rounded-lg border border-border/50 p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-2xl font-semibold text-foreground">32</p>
                <p className="text-sm text-muted-foreground">
                  moves to practice
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-primary font-medium">Due today</p>
                <p className="text-xs text-muted-foreground">~8 min</p>
              </div>
            </div>
            <Button
              onClick={onStartPractice}
              className="w-full gap-2"
              size="lg">
              <Play size={18} />
              Practice Now
            </Button>
          </div>
        </section>

        {/* Progress Overview */}
        <section>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Progress
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-2 rounded-lg p-3 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">
                Lines Learned
              </p>
              <p className="text-xl font-semibold text-foreground">156</p>
            </div>
            <div className="bg-surface-2 rounded-lg p-3 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Accuracy</p>
              <p className="text-xl font-semibold text-foreground">84%</p>
            </div>
            <div className="bg-surface-2 rounded-lg p-3 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Streak</p>
              <p className="text-xl font-semibold text-foreground">12 days</p>
            </div>
            <div className="bg-surface-2 rounded-lg p-3 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Time Today</p>
              <p className="text-xl font-semibold text-foreground">23m</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
