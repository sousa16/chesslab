"use client";

import { ChevronLeft, Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "./ui/button";

interface MobileNavProps {
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onLogoClick?: () => void;
  /**
   * When set, renders a back-arrow on the left of the nav bar that
   * calls this handler. Use this for drawer-style board pages
   * (Training, Tactics, Explorer, Build) where the existing back
   * button lived inside the side drawer — mobile users couldn't see
   * it without opening the drawer first.
   */
  onBack?: () => void;
  /**
   * Hide the hamburger when the page has no sidebar to open. Otherwise
   * tapping it flips an unused state and the user sees nothing happen
   * (the stats and gaps pages are full-content with no aside).
   */
  showMenuButton?: boolean;
}

export function MobileNav({
  isSidebarOpen,
  onToggleSidebar,
  onLogoClick,
  onBack,
  showMenuButton = true,
}: MobileNavProps) {
  return (
    <div
      className="lg:hidden fixed top-0 left-0 right-0 z-50 mobile-nav-safe bg-background border-b border-border flex items-center justify-between px-2 shadow-sm"
      style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="flex items-center gap-1">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={onBack}
            aria-label="Back">
            <ChevronLeft size={24} />
          </Button>
        )}
        <Logo size="lg" clickable={true} onLogoClick={onLogoClick} />
      </div>
      {showMenuButton && onToggleSidebar && (
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? "Close menu" : "Open menu"}>
          {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </Button>
      )}
    </div>
  );
}
