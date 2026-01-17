/**
 * Component to display a hierarchical opening line tree
 * Shows positions and expected moves with proper algebraic notation
 */

import { ChevronDown, Hammer, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  onLineClick?: (moves: string[], startingFen: string) => void; // Callback with moves and starting position
}

export function LineTree({ root, onBuild, onLearn, onLineClick }: LineTreeProps) {
  // Helper function to extract all moves from a node's moveSequence and convert to SAN
  const extractMovesForNode = (targetNode: LineNode): string[] => {
    const moveSequence = targetNode.moveSequence;

    if (!moveSequence || moveSequence === "Initial Position") {
      return [];
    }

    // Parse the moveSequence string (e.g., "1.e2e4 c7c5 2.f2f4" or "1.g1f3 ...")
    // Extract UCI moves by removing move numbers and "..."
    const parts = moveSequence.split(" ");
    const uciMoves: string[] = [];

    for (const part of parts) {
      // Skip invalid parts
      if (!part || part === "..." || part === "[object Object]" || part.includes("[object Object]")) {
        continue;
      }

      if (part.includes(".")) {
        // Format: "1.e2e4" - extract the move part after the dot
        const movePart = part.split(".")[1];
        // Validate it's a string and looks like a valid UCI move
        if (movePart && typeof movePart === "string" && movePart.length >= 4 && /^[a-h][1-8][a-h][1-8]/.test(movePart)) {
          uciMoves.push(movePart);
        }
      } else if (part.length >= 4 && !part.includes(".") && typeof part === "string" && /^[a-h][1-8][a-h][1-8]/.test(part)) {
        // Format: "c7c5" - bare move without number (validate square notation)
        uciMoves.push(part);
      }
    }

    // Convert UCI moves to SAN format, starting from the node's FEN position
    // Create a completely fresh Chess instance with the starting FEN
    const game = new Chess(targetNode.fen);
    const sanMoves: string[] = [];

    for (const uciMove of uciMoves) {
      try {
        // Parse UCI string (e.g., "e2e4")
        const from = uciMove.substring(0, 2);
        const to = uciMove.substring(2, 4);
        const promotion = uciMove.length > 4 ? uciMove[4] : undefined;

        const move = game.move({
          from,
          to,
          promotion,
        });

        if (move) {
          sanMoves.push(move.san);
        }
      } catch (e) {
        // Silently skip invalid moves
      }
    }

    return sanMoves;
  };

  return (
    <div className="space-y-1">
      <LineNodeComponent
        node={root}
        depth={0}
        onBuild={onBuild}
        onLearn={onLearn}
        onLineClick={onLineClick}
        extractMovesForNode={extractMovesForNode}
      />
    </div>
  );
}

interface LineNodeComponentProps {
  node: LineNode;
  depth: number;
  onBuild: (nodeId: string) => void;
  onLearn: (nodeId: string) => void;
  onLineClick?: (moves: string[], startingFen: string) => void;
  extractMovesForNode: (node: LineNode) => string[];
}

function LineNodeComponent({
  node,
  depth,
  onBuild,
  onLearn,
  onLineClick,
  extractMovesForNode,
}: LineNodeComponentProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  // Display the full move sequence
  // e.g., "1. e4" or "1. e4 c5" or "1. e4 c5 2. Nf3 d6"
  const displayText = node.moveSequence;

  const handleLineClick = () => {
    if (onLineClick) {
      const moves = extractMovesForNode(node);
      onLineClick(moves, node.fen);
    }
  };

  return (
    <div style={{ marginLeft: `${depth * 16}px` }}>
      <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-2 transition-colors text-left">
        {hasChildren && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-0 h-5 w-5 flex items-center justify-center hover:bg-surface-1 rounded transition-colors flex-shrink-0"
            title={isExpanded ? "Collapse" : "Expand"}>
            <ChevronDown
              size={14}
              className={`text-muted-foreground transition-transform ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
        )}
        {!hasChildren && <div className="w-5" />}

        <span
          onClick={handleLineClick}
          className="font-mono text-sm text-foreground flex-1 cursor-pointer hover:text-accent transition-colors"
          title="Click to display on board">
          {displayText}
        </span>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => onBuild(node.id)}
            title="Build">
            <Hammer size={12} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => onLearn(node.id)}
            title="Learn">
            <GraduationCap size={12} />
          </Button>
        </div>
      </div>

      {/* Render children */}
      {hasChildren && isExpanded && (
        <div className="space-y-1">
          {node.children.map((child) => (
            <LineNodeComponent
              key={child.id}
              node={child}
              depth={depth + 1}
              onBuild={onBuild}
              onLearn={onLearn}
              onLineClick={onLineClick}
              extractMovesForNode={extractMovesForNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
