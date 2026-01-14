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
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="ghost"
        className="h-12 w-12 p-0 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:size-auto"
        title="First move"
        onClick={onFirstMove}
        disabled={isDisabled}>
        <ChevronFirst size={28} />
      </Button>
      <Button
        variant="ghost"
        className="h-12 w-12 p-0 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:size-auto"
        title="Previous move"
        onClick={onPreviousMove}
        disabled={isDisabled}>
        <ChevronLeft size={28} />
      </Button>
      <Button
        variant="ghost"
        className="h-12 w-12 p-0 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:size-auto"
        title="Next move"
        onClick={onNextMove}
        disabled={isDisabled}>
        <ChevronRight size={28} />
      </Button>
      <Button
        variant="ghost"
        className="h-12 w-12 p-0 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:size-auto"
        title="Last move"
        onClick={onLastMove}
        disabled={isDisabled}>
        <ChevronLast size={28} />
      </Button>
      <div className="w-px h-8 bg-border mx-2" />
      <Button
        variant="ghost"
        className="h-12 w-12 p-0 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:size-auto"
        title="Reset board"
        onClick={onReset}
        disabled={isDisabled}>
        <RotateCcw size={26} />
      </Button>
    </div>
  );
}
