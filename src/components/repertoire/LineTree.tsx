/**
 * Component to display a hierarchical opening line tree
 * Shows positions and expected moves with proper algebraic notation
 */

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
            extractMovesForNode={extractMovesForNode}
            isRoot={true}
            parentMoveSequence=""
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
        extractMovesForNode={extractMovesForNode}
        isRoot={true}
        parentMoveSequence=""
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
  onLineClick?: (moves: string[], startingFen: string) => void;
  extractMovesForNode: (node: LineNode) => string[];
  isRoot?: boolean;
  parentMoveSequence: string;
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
  parentMoveSequence,
}: LineNodeComponentProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const hasChildren = node.children.length > 0;

  const handleLineClick = () => {
    if (onLineClick) {
      const moves = extractMovesForNode(node);
      onLineClick(moves, node.fen);
    }
  };

  const handleDelete = async () => {
    if (onDelete) {
      await onDelete(node.id);
      setShowDeleteDialog(false);
    }
  };

  // Calculate the differential moves (only show what's new from parent)
  const getDifferentialMoves = (): string => {
    const fullSequence = node.moveSequence;
    if (!parentMoveSequence || parentMoveSequence === "") {
      return fullSequence;
    }
    // Remove parent's move sequence from the start
    let trimmed = fullSequence.replace(parentMoveSequence, "").trim();

    if (!trimmed) return fullSequence;

    // If the trimmed result starts with a move (not a move number), we need to add the move number
    // Check if it starts with a letter (like "e7e5") rather than a number (like "2.")
    if (trimmed && /^[a-h]/.test(trimmed)) {
      // Count how many moves are in the parent to figure out the next move number
      const parentParts = parentMoveSequence.split(" ").filter((p) => p);
      // Each "X." token is a white move, each bare move is a black move
      let moveCount = 0;
      for (const part of parentParts) {
        if (/^\d+\./.test(part)) {
          moveCount++; // white move
        } else if (/^[a-h]/.test(part)) {
          moveCount++; // black move
        }
      }
      // The differential starts at moveCount + 1
      // If moveCount is odd (after white's move), next is black's move at same move number
      // If moveCount is even (after black's move), next is white's move at next number
      const isBlackMove = moveCount % 2 === 1;
      const moveNumber = Math.floor(moveCount / 2) + 1;

      if (isBlackMove) {
        // Black's move - prefix with "N..."
        trimmed = `${moveNumber}...${trimmed}`;
      } else {
        // White's move - prefix with "N."
        trimmed = `${moveNumber}.${trimmed}`;
      }
    }

    return trimmed;
  };

  const displayMoves = getDifferentialMoves();

  return (
    <div
      className={`${depth > 0 ? "ml-3 pl-3 border-l border-border/30" : ""}`}>
      <div
        className={`
        relative flex items-start gap-2 p-3 rounded-xl 
        transition-all duration-200 text-left group
        ${isRoot ? "glass-card mb-2" : "hover:bg-surface-2/60"}
      `}>
        {/* Expand/Collapse Button */}
        <div className="flex-shrink-0 mt-0.5">
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
            className="font-mono text-sm cursor-pointer transition-colors truncate text-foreground hover:text-primary"
            title="Click to display on board">
            {displayMoves}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 rounded-lg hover:bg-primary/15 hover:text-primary"
            onClick={() => onBuild(node.id)}
            title="Continue building from here">
            <Hammer size={13} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 rounded-lg hover:bg-primary/15 hover:text-primary"
            onClick={() => onLearn(node.id)}
            title="Practice this line">
            <GraduationCap size={13} />
          </Button>
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 rounded-lg hover:bg-red-500/15 hover:text-red-400"
              onClick={() => setShowDeleteDialog(true)}
              title="Delete this line">
              <Trash2 size={13} />
            </Button>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="glass-card border-glow">
          <DialogHeader>
            <DialogTitle className="text-foreground">Delete Line</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to delete this line?{" "}
              {hasChildren ? "This will also delete all child lines." : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              className="border-border/50 hover:bg-surface-2">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="bg-red-500/20 text-red-400 hover:bg-red-500/30">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              extractMovesForNode={extractMovesForNode}
              parentMoveSequence={node.moveSequence}
            />
          ))}
        </div>
      )}
    </div>
  );
}
