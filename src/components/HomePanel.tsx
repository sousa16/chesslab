"use client";

import { Play, Settings, ChevronRight, Flame, Target, Clock, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";

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
  color = "primary"
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
    black: "stroke-zinc-600"
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
        <span className="text-xs font-semibold text-foreground">{Math.round(percent)}%</span>
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
function getFirstName(user: { name?: string | null; email?: string | null }): string {
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
  onStartPractice,
}: HomePanelProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const greeting = getGreeting();
  const firstName = session?.user ? getFirstName(session.user) : "there";

  const [whiteStats, setWhiteStats] = useState<RepertoireStats>({ lines: 0, positions: 0, percentage: 0 });
  const [blackStats, setBlackStats] = useState<RepertoireStats>({ lines: 0, positions: 0, percentage: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch white repertoire
        const whiteRes = await fetch("/api/repertoires?color=white");
        if (whiteRes.ok) {
          const whiteData = await whiteRes.json();
          const whiteOpenings = whiteData.openings || [];
          const whiteLinesCount = whiteOpenings.length;
          // Count total positions by traversing all nodes
          const countPositions = (node: any): number => {
            if (!node) return 0;
            return 1 + (node.children || []).reduce((sum: number, child: any) => sum + countPositions(child), 0);
          };
          const whitePositionsCount = whiteOpenings.reduce((sum: number, opening: any) => sum + countPositions(opening.root), 0);
          setWhiteStats({
            lines: whiteLinesCount,
            positions: whitePositionsCount,
            percentage: whitePositionsCount > 0 ? Math.round((whitePositionsCount / 200) * 100) : 0, // Assuming 200 is target
          });
        }

        // Fetch black repertoire
        const blackRes = await fetch("/api/repertoires?color=black");
        if (blackRes.ok) {
          const blackData = await blackRes.json();
          const blackOpenings = blackData.openings || [];
          const blackLinesCount = blackOpenings.length;
          const countPositions = (node: any): number => {
            if (!node) return 0;
            return 1 + (node.children || []).reduce((sum: number, child: any) => sum + countPositions(child), 0);
          };
          const blackPositionsCount = blackOpenings.reduce((sum: number, opening: any) => sum + countPositions(opening.root), 0);
          setBlackStats({
            lines: blackLinesCount,
            positions: blackPositionsCount,
            percentage: blackPositionsCount > 0 ? Math.round((blackPositionsCount / 200) * 100) : 0,
          });
        }
      } catch (error) {
        console.error("Error fetching repertoire stats:", error);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header with Greeting */}
      <div className="p-5 pb-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-muted-foreground">{greeting},</p>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground -mr-2"
            onClick={() => router.push("/settings")}>
            <Settings size={18} />
          </Button>
        </div>
        <h2 className="text-2xl font-semibold text-foreground tracking-tight">{firstName}</h2>
      </div>

      {/* Content */}
      <div className="flex-1 p-5 space-y-6 overflow-y-auto">
        {/* Hero Practice Card */}
        <section className="glass-card rounded-xl p-5 hover-lift">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-4xl font-bold text-foreground tracking-tight">32</p>
              <p className="text-base text-muted-foreground mt-1">moves to practice</p>
            </div>
            <div className="text-right">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 text-primary text-sm font-medium">
                <Clock size={14} />
                ~8 min
              </div>
            </div>
          </div>
          <Button
            onClick={onStartPractice}
            className="w-full gap-2.5 text-base h-12 btn-primary-gradient rounded-xl font-medium"
            size="lg">
            <Play size={20} fill="currentColor" />
            Practice Now
          </Button>
        </section>

        {/* Repertoires - Hero Cards */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Repertoires
          </h3>
          <div className="space-y-3">
            {/* White Repertoire - Premium Card */}
            <button
              onClick={() => onSelectRepertoire("white")}
              className="repertoire-card repertoire-card-white w-full relative overflow-hidden rounded-2xl p-5 transition-all duration-300 group text-left cursor-pointer">
              {/* Gradient border effect */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-zinc-400/20 via-white/10 to-zinc-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              {/* Content */}
              <div className="relative flex items-center gap-4">
                {/* King icon with glow */}
                <div className="relative">
                  <div className="absolute inset-0 bg-white/30 rounded-xl blur-lg group-hover:bg-white/40 transition-all duration-300" />
                  <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-white via-zinc-100 to-zinc-300 flex items-center justify-center shadow-lg border border-white/50">
                    <span className="text-2xl drop-shadow-sm">♔</span>
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold text-foreground">White Repertoire</p>
                    <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-primary/20 text-primary uppercase tracking-wide">Build</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{whiteStats.lines} lines • {whiteStats.positions} positions</p>
                  {/* Progress bar */}
                  <div className="mt-3 h-1.5 bg-zinc-700/50 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-zinc-400 to-white rounded-full transition-all duration-500" style={{ width: `${whiteStats.percentage}%` }} />
                  </div>
                </div>
                
                {/* Percentage and arrow */}
                <div className="flex flex-col items-end gap-1">
                  <span className="text-2xl font-bold text-foreground">{whiteStats.percentage}%</span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                    <span>Edit</span>
                    <ChevronRight
                      size={14}
                      className="group-hover:translate-x-1 transition-transform duration-200"
                    />
                  </div>
                </div>
              </div>
            </button>

            {/* Black Repertoire - Premium Card */}
            <button
              onClick={() => onSelectRepertoire("black")}
              className="repertoire-card repertoire-card-black w-full relative overflow-hidden rounded-2xl p-5 transition-all duration-300 group text-left cursor-pointer">
              {/* Gradient border effect */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-zinc-600/20 via-zinc-800/10 to-zinc-900/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              {/* Content */}
              <div className="relative flex items-center gap-4">
                {/* King icon with glow */}
                <div className="relative">
                  <div className="absolute inset-0 bg-zinc-500/20 rounded-xl blur-lg group-hover:bg-zinc-400/30 transition-all duration-300" />
                  <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-zinc-600 via-zinc-800 to-zinc-900 flex items-center justify-center shadow-lg border border-zinc-600/50">
                    <span className="text-2xl text-zinc-300 drop-shadow-sm">♚</span>
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold text-foreground">Black Repertoire</p>
                    <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-primary/20 text-primary uppercase tracking-wide">Build</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{blackStats.lines} lines • {blackStats.positions} positions</p>
                  {/* Progress bar */}
                  <div className="mt-3 h-1.5 bg-zinc-700/50 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-zinc-600 to-zinc-400 rounded-full transition-all duration-500" style={{ width: `${blackStats.percentage}%` }} />
                  </div>
                </div>
                
                {/* Percentage and arrow */}
                <div className="flex flex-col items-end gap-1">
                  <span className="text-2xl font-bold text-foreground">{blackStats.percentage}%</span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                    <span>Edit</span>
                    <ChevronRight
                      size={14}
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
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Activity Hub
          </h3>
          
          {/* Stats Grid - Small Tiles */}
          <div className="grid grid-cols-2 gap-2">
            <div className="glass-card rounded-xl p-4 hover-lift border-glow transition-all">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center">
                  <Flame size={14} className="text-orange-400" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground tracking-tight">12</p>
              <p className="text-xs text-muted-foreground mt-0.5">day streak</p>
            </div>
            
            <div className="glass-card rounded-xl p-4 hover-lift border-glow transition-all">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <Target size={14} className="text-emerald-400" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground tracking-tight">84%</p>
              <p className="text-xs text-muted-foreground mt-0.5">accuracy</p>
            </div>
            
            <div className="glass-card rounded-xl p-4 hover-lift border-glow transition-all">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <BookOpen size={14} className="text-blue-400" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground tracking-tight">156</p>
              <p className="text-xs text-muted-foreground mt-0.5">lines learned</p>
            </div>
            
            <div className="glass-card rounded-xl p-4 hover-lift border-glow transition-all">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center">
                  <Clock size={14} className="text-purple-400" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground tracking-tight">23m</p>
              <p className="text-xs text-muted-foreground mt-0.5">today</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
