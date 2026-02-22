"use client";

import { ChevronLeft, Plus, X, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface Move {
  number: number;
  white: string;
  whiteUci: string;
  black?: string;
  blackUci?: string;
}

interface BuildPanelProps {
  color: "white" | "black";
  onBack: () => void;
  moves: Move[];
  currentMoveIndex: number;
  openingName?: string;
  lineName?: string;
  onAddMove?: (move: string) => void;
  onDeleteMove?: (moveIndex: number) => void;
  isSavingLine?: boolean;
}

export function BuildPanel({
  color,
  onBack,
  moves,
  currentMoveIndex,
  openingName,
  lineName,
  onAddMove,
  onDeleteMove,
  isSavingLine,
}: BuildPanelProps) {
  const [deletingMoveIndex, setDeletingMoveIndex] = useState<number | null>(
    null,
  );

  const handleDeleteMove = async (moveIndex: number) => {
    setDeletingMoveIndex(moveIndex);
    try {
      await onDeleteMove?.(moveIndex);
    } finally {
      setDeletingMoveIndex(null);
    }
  };
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 lg:p-5 border-b border-border/50 glass-panel">
        <div className="flex items-center justify-between mb-3 lg:mb-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-xl -ml-2"
            onClick={onBack}>
            <ChevronLeft size={20} />
          </Button>
          <div className="flex items-center gap-1.5 px-2.5 lg:px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium uppercase tracking-wide">
            <Sparkles size={12} />
            Building Mode
          </div>
        </div>

        {/* Color Badge - Hero Style */}
        <div className="flex items-center gap-3 lg:gap-4">
          <div
            className={`relative w-12 h-12 lg:w-14 lg:h-14 rounded-xl lg:rounded-2xl flex items-center justify-center shadow-lg ${
              color === "white"
                ? "bg-gradient-to-br from-white via-zinc-100 to-zinc-300 border border-white/50"
                : "bg-gradient-to-br from-zinc-600 via-zinc-800 to-zinc-900 border border-zinc-600/50"
            }`}>
            <span
              className={`text-xl lg:text-2xl drop-shadow-sm ${color === "black" ? "text-zinc-300" : ""}`}>
              {color === "white" ? "♔" : "♚"}
            </span>
          </div>
          <div>
            <h2 className="text-lg lg:text-xl font-semibold text-foreground capitalize">
              {color} Repertoire
            </h2>
            <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
              {moves.length} moves added
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 lg:p-5 space-y-4 lg:space-y-5 overflow-y-auto">
        {/* Opening Info */}
        {(openingName || lineName) && (
          <div className="glass-card rounded-xl p-3 lg:p-4">
            {openingName && (
              <p className="text-sm lg:text-base font-semibold text-foreground mb-1">
                {openingName}
              </p>
            )}
            {lineName && (
              <p className="text-xs lg:text-sm text-muted-foreground">
                {lineName}
              </p>
            )}
          </div>
        )}

        {/* Add Move Prompt - Prominent with animation */}
        <div className="relative overflow-hidden rounded-xl p-4 lg:p-5 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/30 animate-pulse-subtle">
          <div className="absolute top-0 right-0 w-24 lg:w-32 h-24 lg:h-32 bg-primary/10 rounded-full blur-3xl -mr-8 lg:-mr-12 -mt-8 lg:-mt-12 animate-glow" />
          <div className="relative">
            <div className="flex items-center gap-2 lg:gap-3 mb-2 lg:mb-3">
              <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg lg:rounded-xl bg-primary/20 flex items-center justify-center">
                <Sparkles size={14} className="text-primary lg:hidden" />
                <Sparkles size={18} className="text-primary hidden lg:block" />
              </div>
              <div>
                <p className="text-sm lg:text-base text-foreground font-semibold">
                  {moves.length === 0
                    ? "Start building your line"
                    : "Add next move"}
                </p>
                <p className="text-[10px] lg:text-xs text-primary font-medium">
                  {moves.length === 0
                    ? "Make your first move"
                    : "Continue the sequence"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 pl-10 lg:pl-13">
              <div className="w-1 h-1 rounded-full bg-primary mt-2 flex-shrink-0" />
              <p className="text-xs lg:text-sm text-muted-foreground">
                Click any piece on the board, then click where you want to move
                it.
              </p>
            </div>
          </div>
        </div>

        {/* Move List */}
        <div>
          <div className="flex items-center justify-between mb-2 lg:mb-3">
            <p className="text-[10px] lg:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Move Sequence
            </p>
            {moves.length > 0 && (
              <span className="text-[10px] lg:text-xs text-muted-foreground">
                {moves.length} {moves.length === 1 ? "move" : "moves"}
              </span>
            )}
          </div>

          <div className="glass-card rounded-xl overflow-hidden">
            {moves.length === 0 ? (
              <div className="p-4 lg:p-6 text-center">
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-2 lg:mb-3">
                  <span className="text-xl lg:text-2xl opacity-50">♟</span>
                </div>
                <p className="text-xs lg:text-sm text-muted-foreground">
                  No moves yet. Start building your line!
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {moves.map((move, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-2.5 lg:p-3 transition-all group ${
                      index < currentMoveIndex
                        ? "bg-transparent hover:bg-surface-2"
                        : "bg-muted/30"
                    }`}>
                    <div className="flex items-center gap-2 lg:gap-3 flex-1">
                      <span className="text-[10px] lg:text-xs font-medium text-muted-foreground w-5 lg:w-6 text-right">
                        {move.number}.
                      </span>
                      <div className="flex items-center gap-1.5 lg:gap-2">
                        <span className="move-badge move-badge-white text-xs lg:text-sm">
                          {move.whiteUci || move.white}
                        </span>
                        {(move.blackUci || move.black) && (
                          <span className="move-badge move-badge-black text-xs lg:text-sm">
                            {move.blackUci || move.black}
                          </span>
                        )}
                      </div>
                    </div>
                    {index < currentMoveIndex && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 lg:h-7 lg:w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                        onClick={() => handleDeleteMove(index)}
                        disabled={deletingMoveIndex === index}>
                        <X size={12} className="lg:hidden" />
                        <X size={14} className="hidden lg:block" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer - Always visible */}
      <div className="border-t border-border/50 p-4 lg:p-5 glass-panel flex-shrink-0">
        <Button
          className="w-full h-10 lg:h-12 text-sm lg:text-base btn-primary-gradient rounded-xl font-medium gap-2"
          onClick={() => onAddMove?.("")}
          disabled={moves.length === 0 || isSavingLine}>
          <Save size={16} className="lg:hidden" />
          <Save size={18} className="hidden lg:block" />
          {isSavingLine ? "Saving..." : "Save Line"}
        </Button>
        {moves.length > 0 && (
          <p className="hidden md:block text-[10px] lg:text-xs text-muted-foreground text-center mt-2 lg:mt-3">
            This will add {moves.length} positions to your repertoire
          </p>
        )}
      </div>
    </div>
  );
}
