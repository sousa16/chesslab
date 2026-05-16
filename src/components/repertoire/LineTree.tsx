/**
 * Display the user's repertoire as a flat list of saved lines, grouped by
 * top-level opening family ("Sicilian Defense", "Vienna Game", …).
 *
 * The API returns a transposition tree (positions linked by chess moves);
 * here we flatten that tree to its LEAVES — each leaf represents the
 * deepest position the user has memorized along that line, which matches
 * how players think about "the lines I know." Internal nodes are
 * implementation artifacts of the transposition graph and are hidden.
 */

"use client";

import { ChevronDown, ChevronRight, Hammer, GraduationCap, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

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
}

interface LineTreeProps {
  root: LineNode;
  onBuild: (nodeId: string, fen?: string, sanMoves?: string[]) => void;
  onLearn: (nodeId: string) => void;
  onDelete?: (nodeId: string) => Promise<void>;
  onLineClick?: (
    moves: string[],
    openingName: string | null,
    openingEco: string | null,
  ) => void;
  onRefresh?: () => void;
}

const UNFAMILIED_LABEL = "Other Lines";

function familyOf(openingName: string | null): string {
  if (!openingName) return UNFAMILIED_LABEL;
  const colon = openingName.indexOf(":");
  return colon === -1 ? openingName : openingName.slice(0, colon).trim();
}

function subVariationOf(openingName: string | null, family: string): string | null {
  if (!openingName) return null;
  if (openingName === family) return null;
  // Strip "Family: " prefix if present, otherwise return name as-is.
  const prefix = family + ":";
  return openingName.startsWith(prefix)
    ? openingName.slice(prefix.length).trim()
    : openingName;
}

/** Collect all leaf nodes (deepest saved positions) in DFS order. */
function collectLeaves(node: LineNode, out: LineNode[]): void {
  if (node.children.length === 0) {
    out.push(node);
    return;
  }
  for (const child of node.children) collectLeaves(child, out);
}

export function LineTree({
  root,
  onBuild,
  onLearn,
  onDelete,
  onLineClick,
  onRefresh,
}: LineTreeProps) {
  // Flatten to leaves. A "virtual root" (multiple distinct openings) wraps
  // multiple real roots; in that case its children are the real roots.
  const isVirtualRoot =
    root.displaySequence === "Starting Position" ||
    root.displaySequence === "Initial Position";

  const leaves: LineNode[] = [];
  if (isVirtualRoot) {
    for (const child of root.children) collectLeaves(child, leaves);
  } else {
    collectLeaves(root, leaves);
  }

  if (leaves.length === 0) return null;

  // Group leaves by top-level opening family, preserving order of first
  // appearance.
  const groups = new Map<string, LineNode[]>();
  for (const leaf of leaves) {
    const family = familyOf(leaf.openingName);
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family)!.push(leaf);
  }

  return (
    <div className="space-y-2">
      {[...groups.entries()].map(([family, lines]) => (
        <FamilyGroup
          key={family}
          family={family}
          lines={lines}
          onBuild={onBuild}
          onLearn={onLearn}
          onDelete={onDelete}
          onLineClick={onLineClick}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}

interface FamilyGroupProps {
  family: string;
  lines: LineNode[];
  onBuild: (nodeId: string, fen?: string, sanMoves?: string[]) => void;
  onLearn: (nodeId: string) => void;
  onDelete?: (nodeId: string) => Promise<void>;
  onLineClick?: (
    moves: string[],
    openingName: string | null,
    openingEco: string | null,
  ) => void;
  onRefresh?: () => void;
}

function FamilyGroup({
  family,
  lines,
  onBuild,
  onLearn,
  onDelete,
  onLineClick,
  onRefresh,
}: FamilyGroupProps) {
  // Single-line families auto-expand; multi-line families default collapsed.
  const [expanded, setExpanded] = useState(lines.length <= 1);

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-surface-2/40 transition-colors"
        aria-expanded={expanded}>
        {expanded ? (
          <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
        )}
        <p className="text-sm font-semibold text-foreground flex-1 truncate">
          {family}
        </p>
        <span className="flex-shrink-0 text-xs text-muted-foreground tabular-nums">
          {lines.length} {lines.length === 1 ? "line" : "lines"}
        </span>
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-0.5 border-t border-border/30 pt-1">
          {lines.map((line) => (
            <LineItem
              key={line.id}
              node={line}
              family={family}
              onBuild={onBuild}
              onLearn={onLearn}
              onDelete={onDelete}
              onLineClick={onLineClick}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface LineItemProps {
  node: LineNode;
  family: string;
  onBuild: (nodeId: string, fen?: string, sanMoves?: string[]) => void;
  onLearn: (nodeId: string) => void;
  onDelete?: (nodeId: string) => Promise<void>;
  onLineClick?: (
    moves: string[],
    openingName: string | null,
    openingEco: string | null,
  ) => void;
  onRefresh?: () => void;
}

function LineItem({
  node,
  family,
  onBuild,
  onLearn,
  onDelete,
  onLineClick,
  onRefresh,
}: LineItemProps) {
  const subtitle = subVariationOf(node.openingName, family);

  return (
    <div className="relative flex items-center gap-2 p-2 rounded-lg hover:bg-surface-2/60 transition-colors text-left group">
      <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
      </div>

      <div
        onClick={() =>
          onLineClick?.(node.sanMoves, node.openingName, node.openingEco)
        }
        className="flex-1 min-w-0 cursor-pointer">
        {subtitle && (
          <p className="text-xs font-medium text-foreground/80 truncate hover:text-primary transition-colors mb-0.5">
            {subtitle}
          </p>
        )}
        <div
          className={`font-mono text-xs ${
            subtitle ? "text-muted-foreground" : "text-foreground hover:text-primary transition-colors"
          } truncate whitespace-nowrap overflow-hidden`}
          title={node.displaySequence}>
          {node.displaySequence}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 rounded-lg hover:bg-primary/15 hover:text-primary"
          onClick={(e) => {
            e.stopPropagation();
            onBuild(node.id, node.fen, node.sanMoves);
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
  );
}
