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
import { useToast } from "@/components/ui/toast";
import {
  hasPendingSave,
  whenAllSavesSettle,
} from "@/lib/savesPending";

interface LineNode {
  id: string;
  fen: string;
  expectedMove: string;
  moveNumber: number;
  displaySequence: string;
  sanMoves: string[];
  openingName: string | null;
  openingEco: string | null;
  children: LineNode[];
  mastered?: boolean;
}

interface RepertoirePanelProps {
  color: "white" | "black";
  onBack: () => void;
  onBuild: (
    openingId?: string,
    lineId?: string,
    fen?: string,
    sanMoves?: string[],
  ) => void;
  onLearn: (openingId?: string, lineId?: string) => void;
  onLearnFamily?: (family: string) => void;
  onDelete?: (nodeId: string) => Promise<void>;
  onLineClick?: (
    moves: string[],
    openingName: string | null,
    openingEco: string | null,
  ) => void;
}

export function RepertoirePanel({
  color,
  onBack,
  onBuild,
  onLearn,
  onLearnFamily,
  onLineClick,
}: RepertoirePanelProps) {
  const [rootNode, setRootNode] = useState<LineNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();

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

  // Initial fetch on mount. If a save POST from BuildClient is still
  // pending (the panel mounted faster than the save round-trip), we wait
  // for it to settle BEFORE the first fetch — otherwise the server
  // returns the pre-save tree and the new line never appears until the
  // user manually re-enters the panel. whenAllSavesSettle fires
  // immediately when nothing is pending, so the steady-state cost is a
  // single function call.
  useEffect(() => {
    if (hasPendingSave()) {
      const cancel = whenAllSavesSettle(() => {
        fetchRepertoire();
      });
      return cancel;
    }
    fetchRepertoire();
  }, [fetchRepertoire]);

  // Live updates from other parts of the app. Covers the case where the
  // panel was already mounted when a save / delete event fires (the
  // pending-saves path above only runs on mount). Review writes
  // (TrainingClient) carry a `positionsReviewed` detail — those don't
  // change the tree shape, so we ignore them here.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ positionsReviewed?: number }>).detail;
      if (detail && typeof detail.positionsReviewed === "number") return;
      fetchRepertoire();
    };
    window.addEventListener(
      "training-stats-updated",
      handler as EventListener,
    );
    return () =>
      window.removeEventListener(
        "training-stats-updated",
        handler as EventListener,
      );
  }, [fetchRepertoire]);

  // Delete every entry under a family (e.g. "Caro-Kann Defense") in one
  // request, then refresh so the panel reflects the new state. Mirrors
  // the existing per-line delete but acts on a family-shaped bucket.
  const handleDeleteFamily = async (family: string): Promise<void> => {
    try {
      const response = await fetch(`/api/repertoire-entries/family`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color, family }),
      });
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        const count = data?.deletedCount ?? 0;
        toast.success(
          count > 0
            ? `Deleted ${count} position${count === 1 ? "" : "s"} under "${family}".`
            : `Nothing to delete under "${family}".`,
        );
        fetchRepertoire();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data?.error || "Couldn't delete the family.");
      }
    } catch (error) {
      console.error("Error deleting family:", error);
      toast.error("Network error deleting the family.");
    }
  };

  // Delete an entry and refresh
  const handleDeleteEntry = async (nodeId: string): Promise<void> => {
    try {
      const response = await fetch(`/api/repertoire-entries/${nodeId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        const count = data?.deletedCount ?? 0;
        toast.success(
          count === 1
            ? "Line deleted."
            : `Deleted ${count} positions in this line.`,
        );
        fetchRepertoire();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data?.error || "Couldn't delete the line.");
      }
    } catch (error) {
      console.error("Error deleting entry:", error);
      toast.error("Network error deleting the line.");
    }
  };

  // Count by SAVED LINES, not individual positions. A "line" is a leaf of
  // the repertoire tree — the deepest saved position along that branch.
  // Counting positions is misleading: a single saved 6-move line produces
  // ~3 positions which doesn't match how players think about "lines I know".
  const countLeaves = (
    node: LineNode | null,
    predicate: (n: LineNode) => boolean,
  ): number => {
    if (!node) return 0;
    if (node.children.length === 0) return predicate(node) ? 1 : 0;
    return node.children.reduce(
      (sum, c) => sum + countLeaves(c, predicate),
      0,
    );
  };

  const totalLines = countLeaves(rootNode, () => true);
  const masteredLines = countLeaves(rootNode, (n) => n.mastered ?? false);

  return (
    <div className="h-full flex flex-col">
      <PanelHeader
        title={`${color.charAt(0).toUpperCase() + color.slice(1)} Repertoire`}
        onBack={onBack}
        icon={<ColorBadge color={color} />}>
        <div className="p-3 lg:p-4 pt-0">
          <ProgressCard
            label="Mastery Level"
            current={masteredLines}
            total={totalLines}
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
              onBuild={(nodeId, fen, sanMoves) =>
                onBuild(undefined, nodeId, fen, sanMoves)
              }
              onLearn={(nodeId) => onLearn(undefined, nodeId)}
              onLearnFamily={onLearnFamily}
              onDelete={handleDeleteEntry}
              onDeleteFamily={handleDeleteFamily}
              onLineClick={onLineClick}
              onRefresh={fetchRepertoire}
            />
          </div>
        )}
      </div>
    </div>
  );
}
