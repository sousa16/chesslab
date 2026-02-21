"use client";

import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

interface PanelHeaderProps {
  title: string;
  onBack: () => void;
  icon?: ReactNode;
  children?: ReactNode;
}

export function PanelHeader({
  title,
  onBack,
  icon,
  children,
}: PanelHeaderProps) {
  return (
    <div className="border-b border-border/50 glass-panel">
      <div className="p-4 lg:p-5 flex items-center justify-between">
        <div className="flex items-center gap-3 lg:gap-4">
          {icon && <div>{icon}</div>}
          <h2 className="text-lg lg:text-xl font-semibold text-foreground tracking-tight">{title}</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-xl"
          onClick={onBack}>
          <ChevronLeft size={20} />
        </Button>
      </div>
      {children}
    </div>
  );
}
