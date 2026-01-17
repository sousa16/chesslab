/**
 * Component to display a hierarchical opening line tree
 * Shows positions and expected moves with proper algebraic notation
 */

import { ChevronDown, Hammer, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

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
}

export function LineTree({ root, onBuild, onLearn }: LineTreeProps) {
  return (
    <div className="space-y-1">
      <LineNodeComponent
        node={root}
        depth={0}
        onBuild={onBuild}
        onLearn={onLearn}
      />
    </div>
  );
}

interface LineNodeComponentProps {
  node: LineNode;
  depth: number;
  onBuild: (nodeId: string) => void;
  onLearn: (nodeId: string) => void;
}

function LineNodeComponent({
  node,
  depth,
  onBuild,
  onLearn,
}: LineNodeComponentProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  // Display the full move sequence
  // e.g., "1. e4" or "1. e4 c5" or "1. e4 c5 2. Nf3 d6"
  const displayText = node.moveSequence;

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

        <span className="font-mono text-sm text-foreground flex-1">
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
