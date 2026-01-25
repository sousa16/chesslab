"use client";

import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface BoardControlsProps {
  onFirstMove?: () => void;
  onPreviousMove?: () => void;
  onNextMove?: () => void;
  onLastMove?: () => void;
  onReset?: () => void;
  isDisabled?: boolean;
}

export function BoardControls({
  onFirstMove,
  onPreviousMove,
  onNextMove,
  onLastMove,
  onReset,
  isDisabled = false,
}: BoardControlsProps) {
  return (
    <div className="glass-card rounded-2xl px-2 py-1.5 inline-flex items-center gap-1">
      <Button
        variant="ghost"
        className="h-11 w-11 p-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:size-auto transition-colors"
        title="First move"
        onClick={onFirstMove}
        disabled={isDisabled}>
        <ChevronFirst size={22} />
      </Button>
      <Button
        variant="ghost"
        className="h-11 w-11 p-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:size-auto transition-colors"
        title="Previous move"
        onClick={onPreviousMove}
        disabled={isDisabled}>
        <ChevronLeft size={22} />
      </Button>
      <Button
        variant="ghost"
        className="h-11 w-11 p-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:size-auto transition-colors"
        title="Next move"
        onClick={onNextMove}
        disabled={isDisabled}>
        <ChevronRight size={22} />
      </Button>
      <Button
        variant="ghost"
        className="h-11 w-11 p-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:size-auto transition-colors"
        title="Last move"
        onClick={onLastMove}
        disabled={isDisabled}>
        <ChevronLast size={22} />
      </Button>
      <div className="w-px h-6 bg-border/50 mx-1" />
      <Button
        variant="ghost"
        className="h-11 w-11 p-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:size-auto transition-colors"
        title="Reset board"
        onClick={onReset}
        disabled={isDisabled}>
        <RotateCcw size={18} />
      </Button>
    </div>
  );
}
