"use client";

import { useMemo, useState } from "react";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/layout/PageHeader";
import { useNavTransition } from "@/components/NavProgress";

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

interface TacticsOverallStats {
  reviewed: number;
  avgEase: number;
  totalReps: number;
}

interface TacticsAdaptiveStats {
  currentTargetRating: number;
  globalAttempts: number;
  globalCorrect: number;
  accuracyPct: number | null;
  recentEwmaPct: number | null;
}

interface TacticsMotifStats {
  motif: string;
  label: string;
  attempts: number;
  correct: number;
  accuracyPct: number | null;
  recentEwmaPct: number | null;
  rating: number | null;
  unlocked: boolean;
}

interface TacticsDrillSummary {
  id: string;
  motif: string;
  size: number;
  baselineMs: number | null;
  lastCycleMs: number | null;
  speedup: number | null;
  completedAt: string;
}

interface TacticsDrillStats {
  activeCount: number;
  completedCount: number;
  recent: TacticsDrillSummary[];
}

interface StatsClientProps {
  openings: FamilyStats[];
  tacticsOverall: TacticsOverallStats;
  tacticsCategories: TacticsCategoryStats[];
  tacticsAdaptive: TacticsAdaptiveStats;
  tacticsMotifs: TacticsMotifStats[];
  tacticsDrills: TacticsDrillStats;
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
  tacticsOverall,
  tacticsCategories,
  tacticsAdaptive,
  tacticsMotifs,
  tacticsDrills,
}: StatsClientProps) {
  // Default to "worst openings first" — low ease = struggling. Falls back
  // to family name for ties so the order is deterministic.
  const [sort, setSort] = useState<SortState>({
    key: "avgEase",
    direction: "asc",
  });
  const [colorFilter, setColorFilter] = useState<"all" | "white" | "black">(
    "all",
  );

  // useNavTransition wraps router.push in a React transition so the
  // global progress bar tracks the back-nav. Note: NO router.refresh
  // here — /home's RSC payload is already in the Next router cache
  // from the trip in, and the home page's client cache + the
  // training-stats-updated event listener keep the dashboard fresh
  // without a server re-render. Calling refresh used to force a full
  // /home recompute on every back-nav (cache miss on getTrainingStats
  // + getStatsPageData), which was the source of "back is suddenly
  // slow".
  const [, navigate] = useNavTransition();
  const handleBack = () => navigate("/home");

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
    <AppPage onLogoClick={handleBack}>
      <PageHeader
        title="Stats"
        subtitle="Where you struggle and where you've mastered things."
        onBack={handleBack}
      />

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
                Adaptive difficulty targets ~85% recent success. Motifs
                unlock once you&apos;ve done 20 at &ge; 80% — the bar fills
                as you build pattern fluency.
              </p>
            </div>

            {tacticsOverall.reviewed === 0 ? (
              <div className="glass-card rounded-xl p-6 text-center text-sm text-muted-foreground">
                No puzzles solved yet. Run the tactics trainer first.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatTile
                    label="Puzzles seen"
                    value={tacticsOverall.reviewed.toString()}
                  />
                  <StatTile
                    label="Adaptive level"
                    value={tacticsAdaptive.currentTargetRating.toString()}
                  />
                  <StatTile
                    label="Recent acc"
                    value={
                      tacticsAdaptive.recentEwmaPct !== null
                        ? `${Math.round(tacticsAdaptive.recentEwmaPct)}%`
                        : "—"
                    }
                  />
                  <StatTile
                    label="Lifetime acc"
                    value={
                      tacticsAdaptive.accuracyPct !== null
                        ? `${Math.round(tacticsAdaptive.accuracyPct)}%`
                        : "—"
                    }
                  />
                </div>

                {/* Motif progress — closest-to-unlock first, then unlocked. */}
                <MotifTable motifs={tacticsMotifs} />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="glass-card rounded-xl p-3 lg:p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      By category
                    </p>
                    <SimpleRows
                      rows={tacticsCategories.map((c) => ({
                        label: c.category,
                        a: `${c.reviewed} seen`,
                        b: `ease ${formatEase(c.avgEase)}`,
                        ease: c.avgEase,
                      }))}
                    />
                  </div>
                  <DrillSummary drills={tacticsDrills} />
                </div>
              </>
            )}
          </section>
    </AppPage>
  );
}

/**
 * Per-canonical-motif progress table. Locked motifs (closest to unlock,
 * highest attempts) at the top, unlocked at the bottom. Empty motifs
 * (0 attempts) are still listed so the user sees what's available.
 */
function MotifTable({ motifs }: { motifs: TacticsMotifStats[] }) {
  const UNLOCK_ATTEMPTS = 20;
  const locked = motifs
    .filter((m) => !m.unlocked)
    .sort((a, b) => b.attempts - a.attempts);
  const unlocked = motifs.filter((m) => m.unlocked);
  const ordered = [...locked, ...unlocked];

  if (motifs.length === 0) {
    return null;
  }

  return (
    <div className="glass-card rounded-xl overflow-x-auto">
      <table className="w-full text-xs lg:text-sm">
        <thead className="text-[10px] lg:text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border/50">
            <Th>Motif</Th>
            <Th align="right">Done</Th>
            <Th align="right">Acc</Th>
            <Th align="right">Recent</Th>
            <Th align="right">Level</Th>
            <Th align="right">Status</Th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((m) => (
            <tr
              key={m.motif}
              className="border-b border-border/20 last:border-b-0">
              <td className="px-3 py-2 lg:px-4 lg:py-3 text-foreground">
                <span className="font-medium">
                  {m.unlocked && (
                    <span className="text-emerald-400 mr-1">✓</span>
                  )}
                  {m.label}
                </span>
              </td>
              <td className="px-3 py-2 lg:px-4 lg:py-3 text-right tabular-nums">
                {m.unlocked ? (
                  <span className="text-muted-foreground">
                    {m.attempts}
                  </span>
                ) : (
                  <span className="tabular-nums">
                    {Math.min(m.attempts, UNLOCK_ATTEMPTS)}/{UNLOCK_ATTEMPTS}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 lg:px-4 lg:py-3 text-right tabular-nums text-muted-foreground">
                {m.accuracyPct !== null ? `${Math.round(m.accuracyPct)}%` : "—"}
              </td>
              <td className="px-3 py-2 lg:px-4 lg:py-3 text-right tabular-nums">
                {m.recentEwmaPct !== null ? (
                  <span
                    className={
                      m.recentEwmaPct >= 80
                        ? "text-emerald-400"
                        : m.recentEwmaPct >= 60
                          ? "text-foreground"
                          : "text-amber-400"
                    }>
                    {Math.round(m.recentEwmaPct)}%
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-3 py-2 lg:px-4 lg:py-3 text-right tabular-nums text-muted-foreground">
                {m.rating ?? "—"}
              </td>
              <td className="px-3 py-2 lg:px-4 lg:py-3 text-right">
                {m.unlocked ? (
                  <span className="text-emerald-400 text-[10px] uppercase tracking-wider">
                    Unlocked
                  </span>
                ) : (
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider">
                    Drilling
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DrillSummary({ drills }: { drills: TacticsDrillStats }) {
  return (
    <div className="glass-card rounded-xl p-3 lg:p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Woodpecker drills
      </p>
      <div className="flex gap-4 text-sm mb-3">
        <div>
          <span className="text-muted-foreground text-xs mr-1">Active</span>
          <span className="tabular-nums font-semibold">{drills.activeCount}</span>
        </div>
        <div>
          <span className="text-muted-foreground text-xs mr-1">Completed</span>
          <span className="tabular-nums font-semibold">
            {drills.completedCount}
          </span>
        </div>
      </div>
      {drills.recent.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No drills completed yet.
        </p>
      ) : (
        <div className="space-y-1.5">
          {drills.recent.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between text-xs lg:text-sm gap-2">
              <span className="text-foreground truncate">
                {d.motif === "mixed" ? "Mixed" : d.motif} · {d.size}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {d.speedup
                  ? `${d.speedup.toFixed(1)}× faster`
                  : "completed"}
              </span>
            </div>
          ))}
        </div>
      )}
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
