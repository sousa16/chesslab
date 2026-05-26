"use client";

import { ChevronLeft, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

export interface PageAccent {
  icon: LucideIcon;
  label: string;
}

interface PageHeaderProps {
  /** Visible page title, e.g. "Stats". */
  title: string;
  /** One-line context under the title — optional. */
  subtitle?: string;
  /** Optional themed pill rendered on the right of the header row. */
  accent?: PageAccent;
  /** Click handler for the back button — typically `() => router.push("/home")`. */
  onBack: () => void;
}

/**
 * Standard top-of-page header for content routes (Stats, Gaps, future
 * settings list, etc.). On desktop the Chesslab logo sits in the
 * leading slot; on mobile it's hidden (MobileNav already shows the
 * logo at the very top). The back-arrow is always visible.
 */
export function PageHeader({
  title,
  subtitle,
  accent,
  onBack,
}: PageHeaderProps) {
  const Icon = accent?.icon;
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="hidden lg:block flex-shrink-0">
          <Logo size="lg" clickable={true} onLogoClick={onBack} />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="rounded-xl flex-shrink-0"
          aria-label="Back to home">
          <ChevronLeft size={20} />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-3xl font-semibold text-foreground tracking-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs lg:text-sm text-muted-foreground mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {accent && Icon && (
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 lg:px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium uppercase tracking-wide flex-shrink-0">
          <Icon size={12} />
          {accent.label}
        </div>
      )}
    </header>
  );
}
