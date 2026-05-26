"use client";

import { useEffect } from "react";
import { NavProgressBar, NavProgressProvider } from "@/components/NavProgress";

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("app-shell");
    return () => {
      document.documentElement.classList.remove("app-shell");
    };
  }, []);

  return (
    <NavProgressProvider>
      <NavProgressBar />
      {children}
    </NavProgressProvider>
  );
}