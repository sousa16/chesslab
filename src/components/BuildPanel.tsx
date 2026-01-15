"use client";

import { ChevronLeft, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Move {
  number: number;
  white: string;
  black?: string;
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
}: BuildPanelProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between bg-surface-2">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          onClick={onBack}>
          <ChevronLeft size={20} />
        </Button>
        <div className="flex-1 flex flex-col items-center gap-1">
          <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            Building
          </h2>
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded flex items-center justify-center text-base ${
                color === "white"
                  ? "bg-zinc-100 text-zinc-900"
                  : "bg-zinc-800 text-zinc-100"
              }`}>
              {color === "white" ? "♔" : "♚"}
            </div>
            <span className="text-lg font-semibold text-foreground capitalize">
              {color}
            </span>
          </div>
        </div>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Opening Info */}
        {(openingName || lineName) && (
          <div className="bg-surface-2 rounded-lg p-3 border border-border/50">
            {openingName && (
              <p className="text-base font-medium text-foreground mb-1">
                {openingName}
              </p>
            )}
            {lineName && (
              <p className="text-sm text-muted-foreground">{lineName}</p>
            )}
          </div>
        )}

        {/* Repertoire Color */}
        <div className="bg-surface-2 rounded-lg p-3 border border-border/50">
          <p className="text-sm text-muted-foreground mb-2">Building</p>
          <div className="flex items-center gap-2">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                color === "white"
                  ? "bg-zinc-100"
                  : "bg-zinc-800 border border-zinc-700"
              }`}>
              <span className="text-xl">{color === "white" ? "♔" : "♚"}</span>
            </div>
            <span className="text-base font-medium text-foreground capitalize">
              {color} Repertoire
            </span>
          </div>
        </div>

        {/* Move List */}
        <div>
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Moves
          </p>
          <div className="space-y-1">
            {moves.map((move, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                  index < currentMoveIndex
                    ? "bg-surface-2 text-foreground"
                    : "bg-muted text-muted-foreground"
                }`}>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-sm font-medium w-6">
                    {move.number}.
                  </span>
                  <span className="font-mono text-base">{move.white}</span>
                  {move.black && (
                    <>
                      <span className="font-mono text-base">{move.black}</span>
                    </>
                  )}
                </div>
                {index < currentMoveIndex && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => onDeleteMove?.(index)}>
                    <X size={16} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Add Move Prompt */}
        {currentMoveIndex === moves.length && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
            <p className="text-base text-foreground font-medium mb-2">
              Add next move
            </p>
            <p className="text-sm text-muted-foreground">
              Click on a square on the board to add a move.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-4 space-y-2">
        <Button
          className="w-full h-12 text-base"
          onClick={() => onAddMove?.("")}>
          <Plus size={20} className="mr-2" />
          Save Line
        </Button>
      </div>
    </div>
  );
}
