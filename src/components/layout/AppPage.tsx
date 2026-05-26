"use client";

import { type ReactNode } from "react";
import { MobileNav } from "@/components/MobileNav";

interface AppPageProps {
  /**
   * `() => router.push("/home")` for top-level content routes; lets
   * the mobile-nav logo tap behave consistently across all pages.
   */
  onLogoClick: () => void;
  children: ReactNode;
}

/**
 * Standard layout for content routes — Stats, Gaps, future settings,
 * etc. Owns the iOS-correct `h-[100dvh]` outer, the MobileNav offset,
 * the scrollable main, the safe-area inset, AND a max-width container
 * with the canonical horizontal + vertical padding. Pages just render
 * `<AppPage onLogoClick={...}><PageHeader/>...content sections...</AppPage>`.
 *
 * `space-y-6` between top-level children is the canonical rhythm —
 * Stats was inadvertently using `space-y-8`, Gaps `space-y-6`. Picking
 * one keeps every content page visually consistent without callers
 * having to remember which value to type.
 */
export function AppPage({ onLogoClick, children }: AppPageProps) {
  return (
    // h-[100dvh] tracks the *current* visible viewport (vs h-screen's
    // 100vh which on iOS reserves space for the collapsed URL bar and
    // leaves an unscrollable strip at the bottom).
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-background">
      <MobileNav onLogoClick={onLogoClick} showMenuButton={false} />
      <main className="flex-1 mt-nav lg:mt-0 overflow-y-auto pb-safe">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6 lg:py-8 space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}
