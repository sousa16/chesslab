"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

/**
 * App-wide navigation feedback. Two things at once:
 *
 *   1. `<NavProgressBar />` renders a 2px gradient bar pinned to the top
 *      of the viewport that fills while a navigation is in flight. The
 *      previous page stays visible underneath — no context loss.
 *
 *   2. `useNavTransition()` returns `[isPending, navigate]`. Menu clicks
 *      use it instead of calling `router.push` directly, which lets the
 *      caller render a per-button pending state (spinner / dim card)
 *      AND drives the global progress bar at the same time.
 *
 * The pending state is owned by a single `useTransition` in the
 * provider. React's transition pending tracks the WHOLE navigation —
 * URL change + server component data fetch + render commit — not just
 * the URL flip. An earlier version cleared pending on `usePathname`
 * change, which fires as soon as the URL updates (before the new page
 * has finished loading), so the bar disappeared while the user was
 * still looking at the old page. Hoisting useTransition into the
 * provider fixes that: isPending stays true until the new page
 * actually commits.
 */

interface NavProgressContextValue {
  isPending: boolean;
  /** Push to `href` inside a transition; drives the progress bar. */
  navigate: (href: string) => void;
  /**
   * Wrap a custom handler that needs to do side effects (sessionStorage
   * writes, etc.) before `router.push`. Whatever you call inside this
   * callback runs synchronously inside the transition, so the progress
   * bar tracks it until the new page commits.
   */
  startNavTransition: (callback: () => void) => void;
}

const NavProgressContext = createContext<NavProgressContextValue | null>(null);

export function NavProgressProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = useCallback(
    (href: string) => {
      startTransition(() => {
        router.push(href);
      });
    },
    [router],
  );

  const startNavTransition = useCallback((callback: () => void) => {
    startTransition(() => {
      callback();
    });
  }, []);

  return (
    <NavProgressContext.Provider
      value={{ isPending, navigate, startNavTransition }}>
      {children}
    </NavProgressContext.Provider>
  );
}

function useNavProgressContext(): NavProgressContextValue {
  const ctx = useContext(NavProgressContext);
  if (!ctx) {
    throw new Error(
      "useNavTransition / useNavStart must be used within <NavProgressProvider>",
    );
  }
  return ctx;
}

/**
 * `[isPending, navigate]` for simple nav: navigate(href) pushes the
 * route inside a transition. The pending state matches the global one,
 * so per-button pending UI (dim card / spinner) stays in sync with the
 * top progress bar.
 */
export function useNavTransition(): [boolean, (href: string) => void] {
  const { isPending, navigate } = useNavProgressContext();
  return [isPending, navigate];
}

/**
 * For handlers that do work before/around `router.push` (e.g.
 * sessionStorage writes). Call this from inside your handler:
 *
 *     const startTx = useStartNavTransition();
 *     const handleBuild = () => {
 *       startTx(() => {
 *         sessionStorage.setItem(...);
 *         router.push(...);
 *       });
 *     };
 *
 * The transition tracks both the side effects and the resulting nav.
 */
export function useStartNavTransition(): (callback: () => void) => void {
  return useNavProgressContext().startNavTransition;
}

export function NavProgressBar() {
  const { isPending } = useNavProgressContext();
  // Three-stage state machine:
  //   idle    → bar isn't rendered at all (no DOM presence)
  //   loading → mount the bar; animate scaleX 0 → 0.85 over 8s with
  //             cubic ease-out so even a long server stall keeps
  //             showing "almost there" without ever hitting 100%
  //   done    → snap scaleX to 1, fade opacity to 0, then unmount
  //
  // Returning null while idle is intentional: keeping the element
  // mounted with opacity:0 turned out to leave a persistent 2px
  // strip visible at the top of the viewport on some browsers (the
  // gradient bleeds through low-opacity in certain compositing
  // paths). Conditional rendering avoids the whole class of issue.
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  useEffect(() => {
    if (isPending) {
      setState("loading");
      return;
    }
    if (state === "loading") {
      setState("done");
      const id = setTimeout(() => setState("idle"), 300);
      return () => clearTimeout(id);
    }
  }, [isPending, state]);

  if (state === "idle") return null;

  const scaleX = state === "loading" ? 0.85 : 1;
  const opacity = state === "loading" ? 1 : 0;
  const transitionDuration = state === "loading" ? "8000ms" : "300ms";

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[100] h-0.5 origin-left bg-gradient-to-r from-primary via-primary to-primary/60 pointer-events-none"
      style={{
        transform: `scaleX(${scaleX})`,
        opacity,
        transition: `transform ${transitionDuration} cubic-bezier(0.22, 1, 0.36, 1), opacity 300ms ease-out`,
      }}
    />
  );
}
