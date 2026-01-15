"use client";

interface ProgressCardProps {
  label: string;
  current: number;
  total: number;
}

export function ProgressCard({ label, current, total }: ProgressCardProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="bg-surface-2 rounded-lg p-4 border border-border/50">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-base font-semibold text-foreground">
          {current}/{total}
        </p>
      </div>
      <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground mt-2">
        {percentage}% complete
      </p>
    </div>
  );
}
