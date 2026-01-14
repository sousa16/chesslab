"use client";

import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function BoardControls() {
  return (
    <div className="flex items-center justify-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        title="First move">
        <ChevronFirst size={18} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        title="Previous move">
        <ChevronLeft size={18} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        title="Next move">
        <ChevronRight size={18} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        title="Last move">
        <ChevronLast size={18} />
      </Button>
      <div className="w-px h-5 bg-border mx-1" />
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        title="Reset board">
        <RotateCcw size={16} />
      </Button>
    </div>
  );
}
