"use client";

import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "./ui/button";

interface MobileNavProps {
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onLogoClick?: () => void;
  // Hide the hamburger when the page has no sidebar to open. Otherwise
  // tapping it flips an unused state and the user sees nothing happen
  // (the stats and gaps pages are full-content with no aside).
  showMenuButton?: boolean;
}

export function MobileNav({
  isSidebarOpen,
  onToggleSidebar,
  onLogoClick,
  showMenuButton = true,
}: MobileNavProps) {
  return (
    <div
      className="lg:hidden fixed top-0 left-0 right-0 z-50 mobile-nav-safe bg-background border-b border-border flex items-center justify-between px-4 shadow-sm"
      style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <Logo size="lg" clickable={true} onLogoClick={onLogoClick} />
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
