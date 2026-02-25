"use client";

import { useEffect } from "react";

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("app-shell");
    return () => {
      document.documentElement.classList.remove("app-shell");
    };
  }, []);

  return <>{children}</>;
}