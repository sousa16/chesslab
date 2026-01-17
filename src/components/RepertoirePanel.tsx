"use client";

import { Hammer, GraduationCap } from "lucide-react";
import {
  PanelHeader,
  ColorBadge,
  ProgressCard,
  ActionButton,
  OpeningItem,
} from "@/components/repertoire";
import { repertoireData } from "@/components/repertoire/repertoireData";

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
  const colorOpenings = repertoireData[color];

  const totalLines = colorOpenings.reduce((sum, o) => sum + o.lines.length, 0);
  const learnedLines = colorOpenings.reduce(
    (sum, o) => sum + o.lines.filter((l) => l.learned).length,
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
            label="Overall Progress"
            current={learnedLines}
            total={totalLines}
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
          Openings
        </h3>
        <div className="space-y-1">
          {colorOpenings.map((opening) => (
            <OpeningItem
              key={opening.id}
              id={opening.id}
              name={opening.name}
              lines={opening.lines}
              onBuild={(openingId, lineId) => onBuild(openingId, lineId)}
              onLearn={(openingId, lineId) => onLearn(openingId, lineId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
