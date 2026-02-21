/**
 * Component to display a hierarchical opening line tree
 * Shows positions and expected moves with proper algebraic notation
 */

"use client";

import {
  ChevronDown,
  ChevronRight,
  Hammer,
  GraduationCap,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { Chess } from "chess.js";

interface LineNode {
  id: string;
  fen: string;
  expectedMove: string;
  moveNumber: number;
  moveSequence: string;
  children: LineNode[];
}

interface LineTreeProps {
  root: LineNode;
  onBuild: (nodeId: string) => void;
  onLearn: (nodeId: string) => void;
  onDelete?: (nodeId: string) => Promise<void>;
  onLineClick?: (moves: string[], startingFen: string) => void;
  onRefresh?: () => void;
}

export function LineTree({
  root,
  onBuild,
  onLearn,
  onDelete,
  onLineClick,
  onRefresh,
}: LineTreeProps) {
  // Helper function to extract all moves from a node's moveSequence and convert to SAN
  const extractMovesForNode = (targetNode: LineNode): string[] => {
    const moveSequence = targetNode.moveSequence;

    if (!moveSequence || moveSequence === "Initial Position") {
      return [];
    }

    const parts = moveSequence.split(" ");
    const uciMoves: string[] = [];

    for (const part of parts) {
      if (
        !part ||
        part === "..." ||
        part === "[object Object]" ||
        part.includes("[object Object]")
      ) {
        continue;
      }

      if (part.includes(".")) {
        const movePart = part.split(".")[1];
        if (
          movePart &&
          typeof movePart === "string" &&
          movePart.length >= 4 &&
          /^[a-h][1-8][a-h][1-8]/.test(movePart)
        ) {
          uciMoves.push(movePart);
        }
      } else if (
        part.length >= 4 &&
        !part.includes(".") &&
        typeof part === "string" &&
        /^[a-h][1-8][a-h][1-8]/.test(part)
      ) {
        uciMoves.push(part);
      }
    }

    const game = new Chess(targetNode.fen);
    const sanMoves: string[] = [];

    for (const uciMove of uciMoves) {
      try {
        const from = uciMove.substring(0, 2);
        const to = uciMove.substring(2, 4);
        const promotion = uciMove.length > 4 ? uciMove[4] : undefined;
        const move = game.move({ from, to, promotion });
        if (move) sanMoves.push(move.san);
      } catch (e) {
        // Skip invalid moves
      }
    }

    return sanMoves;
  };

  // If root is a virtual "Starting Position" or "Initial Position" node, render its children directly
  if (
    (root.moveSequence === "Starting Position" ||
      root.moveSequence === "Initial Position") &&
    root.children.length > 0
  ) {
    return (
      <div className="space-y-1">
        {root.children.map((child) => (
          <LineNodeComponent
            key={child.id}
            node={child}
            depth={0}
            onBuild={onBuild}
            onLearn={onLearn}
            onDelete={onDelete}
            onLineClick={onLineClick}
            onRefresh={onRefresh}
            extractMovesForNode={extractMovesForNode}
            isRoot={true}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <LineNodeComponent
        node={root}
        depth={0}
        onBuild={onBuild}
        onLearn={onLearn}
        onDelete={onDelete}
        onLineClick={onLineClick}
        onRefresh={onRefresh}
        extractMovesForNode={extractMovesForNode}
        isRoot={true}
      />
    </div>
  );
}

interface LineNodeComponentProps {
  node: LineNode;
  depth: number;
  onBuild: (nodeId: string) => void;
  onLearn: (nodeId: string) => void;
  onDelete?: (nodeId: string) => Promise<void>;
  onRefresh?: () => void;
  onLineClick?: (moves: string[], startingFen: string) => void;
  extractMovesForNode: (node: LineNode) => string[];
  isRoot?: boolean;
}

function LineNodeComponent({
  node,
  depth,
  onBuild,
  onLearn,
  onDelete,
  onLineClick,
  extractMovesForNode,
  isRoot = false,
  onRefresh,
}: LineNodeComponentProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = node.children.length > 0;

  const handleLineClick = () => {
    if (onLineClick) {
      const moves = extractMovesForNode(node);
      onLineClick(moves, node.fen);
    }
  };

  // Display abbreviated branch: hide earlier moves as "..." and show only the
  // last two moves (opponent + user). Keep full sequence in title.
  const formatBranchMoveSequence = (parts: string[]): string => {
    const totalPathLength = parts.length;

    // Helper to strip any leading move number (e.g., "1.e2e4" -> "e2e4")
    const stripNumber = (part: string) => {
      if (part.includes(".")) return part.split(".")[1];
      return part;
    };

    const lastIndex = totalPathLength - 1;
    const opponentIndex = Math.max(0, totalPathLength - 2);

    const opponentMove = stripNumber(parts[opponentIndex]);
    const userMove = stripNumber(parts[lastIndex]);

    // Compute move numbers for display
    const opponentMoveNumber = Math.ceil((opponentIndex + 1) / 2);
    const userMoveNumber = Math.ceil((lastIndex + 1) / 2);

    const opponentMoveStr = `${opponentMoveNumber}.${opponentMove}`;
    const userMoveStr = `${userMoveNumber}.${userMove}`;

    return `${opponentMoveStr} ${userMoveStr}`;
  };

  let displayMoves = node.moveSequence;
  if (displayMoves && displayMoves !== "Initial Position") {
    const parts = displayMoves.split(" ").filter((p) => p && p !== "...");
    if (parts.length > 2) {
      // Show only the last two moves (opponent + user) to fit mobile
      displayMoves = formatBranchMoveSequence(parts);
    }
  }

  return (
    <div
      className={`${depth > 0 ? "ml-3 pl-3 border-l border-border/30" : ""}`}>
      <div
        className={`
        relative flex items-center gap-2 p-3 rounded-xl 
        transition-all duration-200 text-left group
        ${isRoot ? "glass-card mb-2" : "hover:bg-surface-2/60"}
      `}>
        {/* Expand/Collapse Button */}
        <div className="flex-shrink-0">
          {hasChildren ? (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 h-6 w-6 flex items-center justify-center hover:bg-surface-3 rounded-lg transition-colors"
              title={isExpanded ? "Collapse" : "Expand"}>
              {isExpanded ? (
                <ChevronDown size={14} className="text-muted-foreground" />
              ) : (
                <ChevronRight size={14} className="text-muted-foreground" />
              )}
            </button>
          ) : (
            <div className="w-6 h-6 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Move sequence */}
          <div
            onClick={handleLineClick}
            className="font-mono text-sm cursor-pointer transition-colors truncate whitespace-nowrap overflow-hidden text-foreground hover:text-primary"
            title={displayMoves}>
            {displayMoves}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 rounded-lg hover:bg-primary/15 hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              onBuild(node.id);
            }}
            title="Continue building from here">
            <Hammer size={13} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 rounded-lg hover:bg-primary/15 hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              onLearn(node.id);
            }}
            title="Practice this line">
            <GraduationCap size={13} />
          </Button>
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 rounded-lg hover:bg-destructive/15 hover:text-destructive"
              onClick={async (e) => {
                e.stopPropagation();
                const ok = confirm(
                  "Delete this line and all following child positions? This cannot be undone.",
                );
                if (!ok) return;
                try {
                  await onDelete(node.id);
                  onRefresh?.();
                } catch (err) {
                  console.error("Failed to delete entry:", err);
                }
              }}
              title="Delete this line">
              <Trash2 size={13} />
            </Button>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="space-y-1 mt-1">
          {node.children.map((child) => (
            <LineNodeComponent
              key={child.id}
              node={child}
              depth={depth + 1}
              onBuild={onBuild}
              onLearn={onLearn}
              onDelete={onDelete}
              onLineClick={onLineClick}
              onRefresh={onRefresh}
              extractMovesForNode={extractMovesForNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
