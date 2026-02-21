"use client";

import { useEffect, useState, useCallback } from "react";
import { Hammer, GraduationCap } from "lucide-react";
import {
  PanelHeader,
  ColorBadge,
  ProgressCard,
  ActionButton,
} from "@/components/repertoire";
import { LineTree } from "@/components/repertoire/LineTree";

interface LineNode {
  id: string;
  fen: string;
  expectedMove: string;
  moveNumber: number;
  moveSequence: string;
  children: LineNode[];
  practiced?: boolean;
}

interface RepertoirePanelProps {
  color: "white" | "black";
  onBack: () => void;
  onBuild: (
    openingId?: string,
    lineId?: string,
    fen?: string,
    moveSequence?: string,
  ) => void;
  onLearn: (openingId?: string, lineId?: string) => void;
  onDelete?: (nodeId: string) => Promise<void>;
  onLineClick?: (moves: string[], startingFen: string) => void;
}

export function RepertoirePanel({
  color,
  onBack,
  onBuild,
  onLearn,
  onDelete,
  onLineClick,
}: RepertoirePanelProps) {
  const [rootNode, setRootNode] = useState<LineNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRepertoire = useCallback(async () => {
    try {
      const response = await fetch(`/api/repertoires?color=${color}`);
      if (response.ok) {
        const data = await response.json();
        setRootNode(data.root);
      }
    } catch (error) {
      console.error("Error fetching repertoire:", error);
    } finally {
      setIsLoading(false);
    }
  }, [color]);

  useEffect(() => {
    fetchRepertoire();
  }, [fetchRepertoire]);

  // Delete an entry and refresh
  const handleDeleteEntry = async (nodeId: string): Promise<void> => {
    try {
      const response = await fetch(`/api/repertoire-entries/${nodeId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        fetchRepertoire();
      }
    } catch (error) {
      console.error("Error deleting entry:", error);
    }
  };

  // Count total positions from root
  const countNodes = (node: LineNode | null): number => {
    if (!node) return 0;
    return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
  };

  const totalPositions = countNodes(rootNode);

  // Exclude first moves (moveNumber === 1) from mastery calculation
  const countNodesMatching = (
    node: LineNode | null,
    predicate: (n: LineNode) => boolean,
  ): number => {
    if (!node) return 0;
    let count = predicate(node) ? 1 : 0;
    for (const child of node.children) {
      count += countNodesMatching(child, predicate);
    }
    return count;
  };

  const firstMoveCount = countNodesMatching(
    rootNode,
    (n) => n.moveNumber === 1,
  );
  const totalPositionsExcludingFirst = totalPositions - firstMoveCount;

  const masteredPositions = countNodesMatching(
    rootNode,
    (n) => (n.practiced ?? false) && n.moveNumber !== 1,
  );

  const masteryPercentage =
    totalPositionsExcludingFirst > 0
      ? Math.round((masteredPositions / totalPositionsExcludingFirst) * 100)
      : 0;

  const getMasteryStatus = (percentage: number): string => {
    if (percentage === 0) return "Not started yet!";
    if (percentage < 50) return "Keep practicing!";
    if (percentage < 100) return "Almost there!";
    return "Complete!";
  };

  return (
    <div className="h-full flex flex-col">
      <PanelHeader
        title={`${color.charAt(0).toUpperCase() + color.slice(1)} Repertoire`}
        onBack={onBack}
        icon={<ColorBadge color={color} />}>
        <div className="p-3 lg:p-4 pt-0">
          <ProgressCard
            label="Mastery Level"
            current={masteredPositions}
            total={totalPositionsExcludingFirst}
          />
        </div>
      </PanelHeader>

      {/* Global Actions */}
      <div className="p-4 lg:p-5 space-y-2 lg:space-y-3 border-b border-border/50">
        <ActionButton
          icon={Hammer}
          title="Build"
          description="Add new opening lines"
          onClick={() => onBuild()}
          variant="outline"
        />
        <ActionButton
          icon={GraduationCap}
          title="Learn All"
          description="Train entire repertoire"
          onClick={() => onLearn()}
          variant="default"
        />
      </div>

      {/* Openings Tree */}
      <div className="flex-1 p-4 lg:p-5 overflow-hidden flex flex-col">
        <h3 className="text-[10px] lg:text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 lg:mb-4">
          Opening Lines
        </h3>
        {isLoading ? (
          <div className="text-center py-8 lg:py-12">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-3 lg:mb-4 animate-pulse">
              <span className="text-xl lg:text-2xl">♟</span>
            </div>
            <p className="text-xs lg:text-sm text-muted-foreground">
              Loading repertoire...
            </p>
          </div>
        ) : !rootNode || rootNode.children.length === 0 ? (
          <div className="glass-card rounded-xl p-6 lg:p-8 text-center">
            <div className="w-12 h-12 lg:w-16 lg:h-16 rounded-xl lg:rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-3 lg:mb-4">
              <span className="text-2xl lg:text-3xl">♔</span>
            </div>
            <p className="text-sm lg:text-base text-foreground font-medium mb-1 lg:mb-2">
              No openings yet
            </p>
            <p className="text-xs lg:text-sm text-muted-foreground mb-3 lg:mb-4">
              Start building your repertoire by adding your first opening line.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-1">
            <LineTree
              root={rootNode}
              onBuild={(nodeId, fen, moveSequence) =>
                onBuild(undefined, nodeId, fen, moveSequence)
              }
              onLearn={(nodeId) => onLearn(undefined, nodeId)}
              onDelete={handleDeleteEntry}
              onLineClick={onLineClick}
              onRefresh={fetchRepertoire}
            />
          </div>
        )}
      </div>
    </div>
  );
}
