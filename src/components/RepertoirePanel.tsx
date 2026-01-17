"use client";

import { useEffect, useState } from "react";
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
}

interface Opening {
  id: string;
  name: string;
  root: LineNode | null;
}

interface RepertoirePanelProps {
  color: "white" | "black";
  onBack: () => void;
  onBuild: (openingId?: string, lineId?: string) => void;
  onLearn: (openingId?: string, lineId?: string) => void;
}

export function RepertoirePanel({
  color,
  onBack,
  onBuild,
  onLearn,
}: RepertoirePanelProps) {
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchRepertoire = async () => {
      try {
        const response = await fetch(`/api/repertoires?color=${color}`);
        if (response.ok) {
          const data = await response.json();
          setOpenings(data.openings);
        }
      } catch (error) {
        console.error("Error fetching repertoire:", error);
        // For now, don't fall back to static data - show empty
      } finally {
        setIsLoading(false);
      }
    };

    fetchRepertoire();
  }, [color]);

  // Count total positions from openings
  const countNodes = (node: LineNode | null): number => {
    if (!node) return 0;
    return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
  };

  const totalPositions = openings.reduce(
    (sum, opening) => sum + countNodes(opening.root),
    0
  );

  return (
    <div className="h-full flex flex-col">
      <PanelHeader
        title={`${color.charAt(0).toUpperCase() + color.slice(1)} Repertoire`}
        onBack={onBack}
        icon={<ColorBadge color={color} />}>
        <div className="p-4 pt-0">
          <ProgressCard
            label="Positions Added"
            current={totalPositions}
            total={Math.max(totalPositions, 1)}
          />
        </div>
      </PanelHeader>

      {/* Global Actions */}
      <div className="p-4 space-y-3 border-b border-border">
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
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          Lines
        </h3>
        {isLoading ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading repertoire...</p>
          </div>
        ) : openings.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">No openings yet</p>
            <p className="text-sm text-muted-foreground">
              Click "Build" to add your first opening line.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {openings.map((opening) => (
              <div key={opening.id}>
                <h4 className="text-sm font-semibold text-foreground mb-2">
                  {opening.name}
                </h4>
                {opening.root ? (
                  <LineTree
                    root={opening.root}
                    onBuild={onBuild}
                    onLearn={onLearn}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No lines</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
