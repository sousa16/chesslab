"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { MobileNav } from "@/components/MobileNav";

interface FamilyStats {
  family: string;
  color: "white" | "black";
  totalEntries: number;
  mastered: number;
  masteryPct: number;
  avgEase: number;
  totalReps: number;
  dueNow: number;
  lastReviewedAt: string | null;
}

interface TacticsCategoryStats {
  category: string;
  reviewed: number;
  avgEase: number;
  totalReps: number;
}

interface TacticsRatingBandStats {
  band: string;
  reviewed: number;
  avgEase: number;
  totalReps: number;
}

interface TacticsOverallStats {
  reviewed: number;
  avgEase: number;
  totalReps: number;
}

interface StatsClientProps {
  openings: FamilyStats[];
  tacticsCategories: TacticsCategoryStats[];
  tacticsBands: TacticsRatingBandStats[];
  tacticsOverall: TacticsOverallStats;
}

type SortKey =
  | "family"
  | "totalEntries"
  | "masteryPct"
  | "avgEase"
  | "totalReps"
  | "dueNow"
  | "lastReviewedAt";

interface SortState {
  key: SortKey;
  direction: "asc" | "desc";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString();
}

function formatEase(ease: number): string {
  if (ease <= 0) return "—";
  return ease.toFixed(2);
}

function formatPct(p: number): string {
  return `${p.toFixed(0)}%`;
}

export default function StatsClient({
  openings,
  tacticsCategories,
  tacticsBands,
  tacticsOverall,
}: StatsClientProps) {
  const router = useRouter();
  // Default to "worst openings first" — low ease = struggling. Falls back
  // to family name for ties so the order is deterministic.
  const [sort, setSort] = useState<SortState>({
    key: "avgEase",
    direction: "asc",
  });
  const [colorFilter, setColorFilter] = useState<"all" | "white" | "black">(
    "all",
  );

  const handleBack = () => {
    router.push("/home");
    router.refresh();
  };

  const filteredOpenings = useMemo(
    () =>
      colorFilter === "all"
        ? openings
        : openings.filter((o) => o.color === colorFilter),
    [openings, colorFilter],
  );

  const sortedOpenings = useMemo(() => {
    const copy = [...filteredOpenings];
    copy.sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      const key = sort.key;
      if (key === "family") {
        return dir * a.family.localeCompare(b.family);
      }
      if (key === "lastReviewedAt") {
        // Null = never reviewed → sort as oldest (treat as 0).
        const aT = a.lastReviewedAt
          ? new Date(a.lastReviewedAt).getTime()
          : 0;
        const bT = b.lastReviewedAt
          ? new Date(b.lastReviewedAt).getTime()
          : 0;
        if (aT !== bT) return dir * (aT - bT);
        return a.family.localeCompare(b.family);
      }
      const aV = a[key] as number;
      const bV = b[key] as number;
      if (aV !== bV) return dir * (aV - bV);
      return a.family.localeCompare(b.family);
    });
    return copy;
  }, [filteredOpenings, sort]);

  const cycleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev.key !== key) {
        // Numeric columns default to ascending (= worst-first for ease,
        // mastery, etc.); strings default to ascending alphabetical.
        return { key, direction: "asc" };
      }
      return {
        key,
        direction: prev.direction === "asc" ? "desc" : "asc",
      };
    });
  };

  const sortGlyph = (key: SortKey) =>
    sort.key === key ? (sort.direction === "asc" ? "↑" : "↓") : "";

  return (
    // AppShell locks body/html overflow, so the page scroll has to live
    // inside main. h-[100dvh] keeps the outer matched to the *current*
    // visible viewport (not the iOS pre-collapse 100vh), and main owns
    // the scroll with pb-safe so iOS's home indicator doesn't eat the
    // last row.
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-background">
      <MobileNav onLogoClick={handleBack} showMenuButton={false} />

      <main className="flex-1 mt-nav lg:mt-0 overflow-y-auto pb-safe">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6 lg:py-10 space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="hidden lg:block">
                <Logo size="lg" clickable={true} onLogoClick={handleBack} />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBack}
                className="rounded-xl">
                <ChevronLeft size={20} />
              </Button>
              <div>
                <h1 className="text-2xl lg:text-3xl font-semibold text-foreground">
                  Stats
                </h1>
                <p className="text-xs lg:text-sm text-muted-foreground mt-1">
                  Where you struggle and where you've mastered things.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 lg:px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium uppercase tracking-wide">
              <BarChart3 size={12} />
              Stats
            </div>
          </div>

          {/* ── Openings ───────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg lg:text-xl font-semibold text-foreground">
                  Openings
                </h2>
                <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                  Lower average ease = positions you've forgotten more
                  often (SM-2 drops ease on Forgot / Hard). Sort by any
                  column; the default puts the hardest families first.
                </p>
              </div>
              <div className="flex gap-1">
                {(["all", "white", "black"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setColorFilter(c)}
                    className={`px-3 h-8 rounded-lg text-xs font-medium border capitalize transition-colors ${
                      colorFilter === c
                        ? "bg-primary/20 border-primary/40 text-foreground"
                        : "bg-surface-2/40 border-border/40 text-muted-foreground hover:bg-surface-2"
                    }`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {sortedOpenings.length === 0 ? (
              <div className="glass-card rounded-xl p-6 text-center text-sm text-muted-foreground">
                No saved openings yet. Build a line first.
              </div>
            ) : (
              <div className="glass-card rounded-xl overflow-x-auto">
                <table className="w-full text-xs lg:text-sm">
                  <thead className="text-[10px] lg:text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <Th onClick={() => cycleSort("family")}>
                        Family {sortGlyph("family")}
                      </Th>
                      <Th
                        align="right"
                        onClick={() => cycleSort("totalEntries")}>
                        Entries {sortGlyph("totalEntries")}
                      </Th>
                      <Th
                        align="right"
                        onClick={() => cycleSort("masteryPct")}>
                        Mastery {sortGlyph("masteryPct")}
                      </Th>
                      <Th
                        align="right"
                        onClick={() => cycleSort("avgEase")}>
                        Avg ease {sortGlyph("avgEase")}
                      </Th>
                      <Th
                        align="right"
                        onClick={() => cycleSort("totalReps")}>
                        Reviews {sortGlyph("totalReps")}
                      </Th>
                      <Th
                        align="right"
                        onClick={() => cycleSort("dueNow")}>
                        Due {sortGlyph("dueNow")}
                      </Th>
                      <Th
                        align="right"
                        onClick={() => cycleSort("lastReviewedAt")}>
                        Last {sortGlyph("lastReviewedAt")}
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedOpenings.map((o) => (
                      <tr
                        key={`${o.color}::${o.family}`}
                        className="border-b border-border/20 last:border-b-0">
                        <td className="px-3 py-2 lg:px-4 lg:py-3 text-foreground">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                o.color === "white"
                                  ? "bg-zinc-100"
                                  : "bg-zinc-800 border border-zinc-600"
                              }`}
                              title={`${o.color} repertoire`}
                            />
                            <span className="font-medium">{o.family}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 lg:px-4 lg:py-3 text-right tabular-nums">
                          {o.totalEntries}
                        </td>
                        <td className="px-3 py-2 lg:px-4 lg:py-3 text-right tabular-nums">
                          <span
                            className={
                              o.masteryPct >= 80
                                ? "text-emerald-400"
                                : o.masteryPct >= 50
                                  ? "text-foreground"
                                  : "text-amber-400"
                            }>
                            {formatPct(o.masteryPct)}
                          </span>
                        </td>
                        <td className="px-3 py-2 lg:px-4 lg:py-3 text-right tabular-nums">
                          <span
                            className={
                              o.avgEase >= 2.5
                                ? "text-emerald-400"
                                : o.avgEase >= 2.0
                                  ? "text-foreground"
                                  : "text-red-400"
                            }>
                            {formatEase(o.avgEase)}
                          </span>
                        </td>
                        <td className="px-3 py-2 lg:px-4 lg:py-3 text-right tabular-nums text-muted-foreground">
                          {o.totalReps}
                        </td>
                        <td className="px-3 py-2 lg:px-4 lg:py-3 text-right tabular-nums">
                          {o.dueNow > 0 ? (
                            <span className="text-amber-400">{o.dueNow}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2 lg:px-4 lg:py-3 text-right text-muted-foreground">
                          {formatDate(o.lastReviewedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Tactics ─────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div>
              <h2 className="text-lg lg:text-xl font-semibold text-foreground">
                Tactics
              </h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                Same ease-factor proxy. Categories may overlap (a puzzle
                tagged both Mates and Motifs counts in each); rating bands
                are mutually exclusive.
              </p>
            </div>

            {tacticsOverall.reviewed === 0 ? (
              <div className="glass-card rounded-xl p-6 text-center text-sm text-muted-foreground">
                No puzzles solved yet. Run the tactics trainer first.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <StatTile
                    label="Puzzles seen"
                    value={tacticsOverall.reviewed.toString()}
                  />
                  <StatTile
                    label="Total reviews"
                    value={tacticsOverall.totalReps.toString()}
                  />
                  <StatTile
                    label="Avg ease"
                    value={formatEase(tacticsOverall.avgEase)}
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="glass-card rounded-xl p-3 lg:p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      By category
                    </p>
                    <SimpleRows rows={tacticsCategories.map((c) => ({
                      label: c.category,
                      a: `${c.reviewed} seen`,
                      b: `ease ${formatEase(c.avgEase)}`,
                      ease: c.avgEase,
                    }))} />
                  </div>
                  <div className="glass-card rounded-xl p-3 lg:p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      By rating band
                    </p>
                    <SimpleRows rows={tacticsBands.map((b) => ({
                      label: b.band,
                      a: `${b.reviewed} seen`,
                      b: `ease ${formatEase(b.avgEase)}`,
                      ease: b.avgEase,
                    }))} />
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Th({
  children,
  align,
  onClick,
}: {
  children: React.ReactNode;
  align?: "right" | "left";
  onClick?: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2 lg:px-4 lg:py-2 font-semibold select-none ${
        onClick ? "cursor-pointer hover:text-foreground transition-colors" : ""
      } ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card rounded-xl p-3 lg:p-4">
      <p className="text-[10px] lg:text-xs text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="text-xl lg:text-2xl font-semibold text-foreground tabular-nums mt-1">
        {value}
      </p>
    </div>
  );
}

function SimpleRows({
  rows,
}: {
  rows: { label: string; a: string; b: string; ease: number }[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No data yet.</p>
    );
  }
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-center justify-between gap-2 text-xs lg:text-sm">
          <span className="text-foreground truncate">{r.label}</span>
          <div className="flex items-center gap-3 text-muted-foreground tabular-nums">
            <span>{r.a}</span>
            <span
              className={
                r.ease <= 0
                  ? "text-muted-foreground"
                  : r.ease >= 2.5
                    ? "text-emerald-400"
                    : r.ease >= 2.0
                      ? "text-foreground"
                      : "text-red-400"
              }>
              {r.b}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
