"use client";

import { useState } from "react";
import { ChevronDown, Hammer, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Line } from "./repertoireData";

interface OpeningItemProps {
  id: string;
  name: string;
  lines: Line[];
  onBuild: (openingId: string, lineId?: string) => void;
  onLearn: (openingId: string, lineId?: string) => void;
}

export function OpeningItem({
  id,
  name,
  lines,
  onBuild,
  onLearn,
}: OpeningItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const learnedCount = lines.filter((l) => l.learned).length;

  return (
    <div className="space-y-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 p-3 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border/50 transition-colors text-left group">
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-base font-medium text-foreground">{name}</p>
          <p className="text-sm text-muted-foreground">
            {learnedCount}/{lines.length} lines learned
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onBuild(id);
            }}
            title="Build">
            <Hammer size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onLearn(id);
            }}
            title="Learn">
            <GraduationCap size={14} />
          </Button>
        </div>
      </button>

      {/* Lines */}
      {isExpanded && (
        <div className="ml-4 space-y-1">
          {lines.map((line) => (
            <div
              key={line.id}
              className="flex items-center gap-2 p-2 rounded-lg bg-surface-1 border border-border/30 text-left group">
              <div
                className={`w-3 h-3 rounded-full flex-shrink-0 ${
                  line.learned ? "bg-primary" : "bg-border"
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {line.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {line.moves}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => onBuild(id, line.id)}
                  title="Build">
                  <Hammer size={12} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => onLearn(id, line.id)}
                  title="Learn">
                  <GraduationCap size={12} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
