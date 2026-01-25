"use client";

import { CheckCircle2 } from "lucide-react";

interface ProgressCardProps {
  label: string;
  current: number;
  total: number;
}

export function ProgressCard({ label, current, total }: ProgressCardProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  const isComplete = percentage === 100;

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2">
          {isComplete && (
            <CheckCircle2 size={14} className="text-primary" />
          )}
          <p className="text-sm font-semibold text-foreground">
            {current}/{total}
          </p>
        </div>
      </div>
      <div className="h-1.5 bg-zinc-700/50 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isComplete 
              ? "bg-gradient-to-r from-primary to-emerald-400" 
              : "bg-gradient-to-r from-primary/80 to-primary"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className={`text-sm mt-2 ${
        isComplete ? "text-primary font-medium" : "text-muted-foreground"
      }`}>
        {isComplete ? "Complete!" : `${percentage}% complete`}
      </p>
    </div>
  );
}
