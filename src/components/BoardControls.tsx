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
    <div className="glass-card rounded-xl lg:rounded-2xl px-1.5 lg:px-2 py-1 lg:py-1.5 inline-flex items-center gap-0.5 lg:gap-1">
      <Button
        variant="ghost"
        className="h-9 w-9 lg:h-11 lg:w-11 p-0 rounded-lg lg:rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:size-auto transition-colors"
        title="First move"
        onClick={onFirstMove}
        disabled={isDisabled}>
        <ChevronFirst size={18} className="lg:hidden" />
        <ChevronFirst size={22} className="hidden lg:block" />
      </Button>
      <Button
        variant="ghost"
        className="h-9 w-9 lg:h-11 lg:w-11 p-0 rounded-lg lg:rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:size-auto transition-colors"
        title="Previous move"
        onClick={onPreviousMove}
        disabled={isDisabled}>
        <ChevronLeft size={18} className="lg:hidden" />
        <ChevronLeft size={22} className="hidden lg:block" />
      </Button>
      <Button
        variant="ghost"
        className="h-9 w-9 lg:h-11 lg:w-11 p-0 rounded-lg lg:rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:size-auto transition-colors"
        title="Next move"
        onClick={onNextMove}
        disabled={isDisabled}>
        <ChevronRight size={18} className="lg:hidden" />
        <ChevronRight size={22} className="hidden lg:block" />
      </Button>
      <Button
        variant="ghost"
        className="h-9 w-9 lg:h-11 lg:w-11 p-0 rounded-lg lg:rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:size-auto transition-colors"
        title="Last move"
        onClick={onLastMove}
        disabled={isDisabled}>
        <ChevronLast size={18} className="lg:hidden" />
        <ChevronLast size={22} className="hidden lg:block" />
      </Button>
      <div className="w-px h-5 lg:h-6 bg-border/50 mx-0.5 lg:mx-1" />
      <Button
        variant="ghost"
        className="h-9 w-9 lg:h-11 lg:w-11 p-0 rounded-lg lg:rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:size-auto transition-colors"
        title="Reset board"
        onClick={onReset}
        disabled={isDisabled}>
        <RotateCcw size={14} className="lg:hidden" />
        <RotateCcw size={18} className="hidden lg:block" />
      </Button>
    </div>
  );
}
