"use client";

import { useEffect, useState, useCallback } from "react";
import { Hammer, GraduationCap, BookOpen, ChevronDown } from "lucide-react";
import {
  PanelHeader,
  ColorBadge,
  ProgressCard,
  ActionButton,
} from "@/components/repertoire";
import { LineTree } from "@/components/repertoire/LineTree";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LineNode {
  id: string;
  fen: string;
  expectedMove: string;
  moveNumber: number;
  moveSequence: string;
  children: LineNode[];
}

interface Opening {
  id: string;
  name: string;
  notes?: string;
  root: LineNode | null;
}

interface RepertoirePanelProps {
  color: "white" | "black";
  onBack: () => void;
  onBuild: (openingId?: string, lineId?: string) => void;
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
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRepertoire = useCallback(async () => {
    try {
      const response = await fetch(`/api/repertoires?color=${color}`);
      if (response.ok) {
        const data = await response.json();
        setOpenings(data.openings);
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

  // Count total positions from openings
  const countNodes = (node: LineNode | null): number => {
    if (!node) return 0;
    return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
  };

  const totalPositions = openings.reduce(
    (sum, opening) => sum + countNodes(opening.root),
    0,
  );

  // Count positions in review phase (mastered)
  const countMasteredPositions = (): number => {
    // This would need to fetch from API with phase data
    // For now return 0 as placeholder
    return 0;
  };

  const masteredPositions = countMasteredPositions();
  const masteryPercentage = totalPositions > 0 
    ? Math.round((masteredPositions / totalPositions) * 100) 
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
        <div className="p-4 pt-0">
          <ProgressCard
            label="Mastery Level"
            current={masteredPositions}
            total={totalPositions}
          />
        </div>
      </PanelHeader>

      {/* Global Actions */}
      <div className="p-5 space-y-3 border-b border-border/50">
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
      <div className="flex-1 p-5 overflow-hidden flex flex-col">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Opening Lines
        </h3>
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-4 animate-pulse">
              <span className="text-2xl">♟</span>
            </div>
            <p className="text-muted-foreground">Loading repertoire...</p>
          </div>
        ) : openings.length === 0 ? (
          <div className="glass-card rounded-xl p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">♔</span>
            </div>
            <p className="text-foreground font-medium mb-2">No openings yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Start building your repertoire by adding your first opening line.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {openings.map((opening) => (
              <OpeningCard
                key={opening.id}
                opening={opening}
                onBuild={onBuild}
                onLearn={onLearn}
                onLineClick={onLineClick}
                onRefresh={fetchRepertoire}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Opening Card Component
function OpeningCard({
  opening,
  onBuild,
  onLearn,
  onLineClick,
  onRefresh,
}: {
  opening: Opening;
  onBuild: (openingId?: string, lineId?: string) => void;
  onLearn: (openingId?: string, lineId?: string) => void;
  onLineClick?: (moves: string[], startingFen: string) => void;
  onRefresh: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [name, setName] = useState(opening.name);
  const [notes, setNotes] = useState(opening.notes || "");
  
  // Count total lines in the opening
  const countLines = (node: LineNode | null): number => {
    if (!node) return 0;
    return 1 + node.children.reduce((sum, child) => sum + countLines(child), 0);
  };
  
  const lineCount = countLines(opening.root);

  const handleRename = async () => {
    try {
      const response = await fetch(`/api/openings/${opening.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        throw new Error("Failed to rename opening");
      }

      setIsRenaming(false);
      onRefresh();
    } catch (error) {
      console.error("Error renaming opening:", error);
      setName(opening.name); // Reset on error
    }
  };

  const handleNotesUpdate = async () => {
    try {
      const response = await fetch(`/api/openings/${opening.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });

      if (!response.ok) {
        throw new Error("Failed to update notes");
      }

      setIsEditingNotes(false);
      onRefresh();
    } catch (error) {
      console.error("Error updating notes:", error);
    }
  };

  const handleCancelNotes = () => {
    setNotes(opening.notes || "");
    setIsEditingNotes(false);
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/openings/${opening.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete opening");
      }

      setShowDeleteDialog(false);
      onRefresh();
    } catch (error) {
      console.error("Error deleting opening:", error);
    }
  };

  return (
    <div className="glass-card rounded-xl overflow-hidden border-glow transition-all">
      {/* Opening Header */}
      <div className="flex items-center justify-between p-4 hover:bg-surface-2/50 transition-colors">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 flex-1 text-left min-w-0"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
            <BookOpen size={18} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            {isRenaming ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") {
                    setName(opening.name);
                    setIsRenaming(false);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="text-sm font-semibold text-foreground bg-surface-2 px-2 py-1 rounded border border-primary/30 focus:outline-none focus:border-primary w-full"
                autoFocus
              />
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground truncate">
                  {opening.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lineCount} {lineCount === 1 ? "line" : "lines"}
                </p>
              </>
            )}
          </div>
          <ChevronDown
            size={16}
            className={`text-muted-foreground transition-transform duration-200 ${
              isExpanded ? "" : "-rotate-90"
            }`}
          />
        </button>
        
        {/* Actions Menu */}
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsRenaming(true);
            }}
            className="p-2 hover:bg-surface-2 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            title="Rename"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditingNotes(!isEditingNotes);
            }}
            className="p-2 hover:bg-surface-2 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            title={isEditingNotes ? "Close notes" : "Add notes"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/>
              <path d="M15 3v4a2 2 0 0 0 2 2h4"/>
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteDialog(true);
            }}
            className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-muted-foreground hover:text-red-400"
            title="Delete"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18"/>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="glass-card border-glow">
          <DialogHeader>
            <DialogTitle className="text-foreground">Delete Opening</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to delete "{opening.name}"? This will remove all associated lines and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              className="border-border/50 hover:bg-surface-2"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="bg-red-500/20 text-red-400 hover:bg-red-500/30"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes Section */}
      {isEditingNotes && (
        <div className="border-t border-border/30 p-4 bg-surface-1/30">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about this opening..."
            className="w-full text-sm text-foreground bg-surface-2/50 px-3 py-2 rounded-lg border border-border/50 focus:outline-none focus:border-primary/50 resize-none min-h-[100px]"
          />
          <div className="flex items-center justify-end gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelNotes}
              className="border-border/50 hover:bg-surface-2"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleNotesUpdate}
              className="bg-primary/20 text-primary hover:bg-primary/30"
            >
              Save Notes
            </Button>
          </div>
        </div>
      )}

      {/* Lines Tree */}
      {isExpanded && opening.root && (
        <div className="border-t border-border/30 px-2 py-3 bg-surface-1/30">
          <LineTree
            root={opening.root}
            onBuild={onBuild}
            onLearn={onLearn}
            onLineClick={onLineClick}
            onRefresh={onRefresh}
          />
        </div>
      )}
    </div>
  );
}
