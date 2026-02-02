"use client";

import { LucideIcon, ChevronRight } from "lucide-react";

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
  const isDefault = variant === "default";

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200 group text-left cursor-pointer ${
        isDefault
          ? "btn-primary-gradient text-primary-foreground hover-lift"
          : "glass-card hover-lift border-glow"
      }`}>
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isDefault ? "bg-white/20" : "bg-primary/15"
        }`}>
        <Icon size={18} className={isDefault ? "text-white" : "text-primary"} />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`font-semibold text-sm ${
            isDefault ? "text-white" : "text-foreground"
          }`}>
          {title}
        </p>
        <p
          className={`text-xs mt-0.5 ${
            isDefault ? "text-white/80" : "text-muted-foreground"
          }`}>
          {description}
        </p>
      </div>
      <ChevronRight
        size={16}
        className={`flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${
          isDefault ? "text-white/70" : "text-muted-foreground"
        }`}
      />
    </button>
  );
}
