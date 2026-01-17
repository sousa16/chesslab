"use client";

import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActionButtonProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
  variant?: "default" | "outline";
}

export function ActionButton({
  icon: Icon,
  title,
  description,
  onClick,
  variant = "default",
}: ActionButtonProps) {
  return (
    <Button
      onClick={onClick}
      variant={variant}
      className="w-full h-auto flex flex-col items-start gap-2 p-3">
      <div className="flex items-center gap-2 w-full">
        <Icon size={16} />
        <span className="font-medium text-sm">{title}</span>
      </div>
      <p className="text-sm opacity-90">{description}</p>
    </Button>
  );
}
