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
    <div className="border-b border-border">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon && <div>{icon}</div>}
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          onClick={onBack}>
          <ChevronLeft size={20} />
        </Button>
      </div>
      {children}
    </div>
  );
}
