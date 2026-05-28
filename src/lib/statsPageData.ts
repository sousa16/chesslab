/**
 * /stats page data aggregation.
 *
 * Pulls everything the stats page renders, cached on (userId, lastChanged)
 * so repeat visits skip the work. Lastchanged is the most recent timestamp
 * across the data sources that contribute to stats — any review/edit/drill
 * naturally busts the cache.
 *
 * Sections returned:
 *  - openings: per-family aggregate from the repertoire tree + SRS state
 *  - tacticsOverall: top-line tactics counters (seen, reviews, avg ease)
 *  - tacticsCategories: per-category (Mates/Motifs/Middlegame/Endgame)
 *  - tacticsAdaptive: current adaptive-rating setpoint + EWMA accuracy
 *  - tacticsMotifs: per-canonical-motif counters + rating + unlock state
 *  - tacticsDrills: active / completed counts + recent completed sessions
 *
 * Rating-band stats were dropped when the adaptive controller replaced
 * the manual band selector — per-motif rating is the meaningful slice now.
 */

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCachedRepertoireFamilies } from "@/lib/repertoireTreeCache";
import {
  CANONICAL_MOTIFS,
  MOTIF_LABELS,
  type CanonicalMotif,
} from "@/lib/motifs";

export interface FamilyStats {
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

export interface TacticsCategoryStats {
  category: string;
  reviewed: number;
  avgEase: number;
  totalReps: number;
}

export interface TacticsOverallStats {
  reviewed: number;
  avgEase: number;
  totalReps: number;
}

export interface TacticsAdaptiveStats {
  currentTargetRating: number;
  globalAttempts: number;
  globalCorrect: number;
  /** Lifetime accuracy (correct / attempts). null when no attempts yet. */
  accuracyPct: number | null;
  /** Rolling EWMA from the controller. null when fewer than 3 attempts. */
  recentEwmaPct: number | null;
}

export interface TacticsMotifStats {
  motif: CanonicalMotif;
  label: string;
  attempts: number;
  correct: number;
  accuracyPct: number | null;
  recentEwmaPct: number | null;
  rating: number | null;
  unlocked: boolean;
}

export interface TacticsDrillSummary {
  id: string;
  motif: string;
  size: number;
  baselineMs: number | null;
  lastCycleMs: number | null;
  /** baseline / final cycle — how many times faster you got. null if either side is missing. */
  speedup: number | null;
  completedAt: string;
}

export interface TacticsDrillStats {
  activeCount: number;
  completedCount: number;
  recent: TacticsDrillSummary[];
}

export interface StatsPageData {
  openings: FamilyStats[];
  tacticsOverall: TacticsOverallStats;
  tacticsCategories: TacticsCategoryStats[];
  tacticsAdaptive: TacticsAdaptiveStats;
  tacticsMotifs: TacticsMotifStats[];
  tacticsDrills: TacticsDrillStats;
}

async function computeStatsPageData(userId: string): Promise<StatsPageData> {
  const [
    families,
    repertoires,
    reviews,
    puzzlePrefs,
    motifRatings,
    activeDrillCount,
    completedDrillCount,
    recentDrills,
  ] = await Promise.all([
    getCachedRepertoireFamilies(userId),
    prisma.repertoire.findMany({
      where: { userId },
      select: {
        color: true,
        entries: {
          select: {
            id: true,
            easeFactor: true,
            repetitions: true,
            phase: true,
            nextReviewDate: true,
            lastReviewDate: true,
          },
        },
      },
    }),
    prisma.puzzleReview.findMany({
      where: { userId },
      select: {
        easeFactor: true,
        repetitions: true,
        puzzle: { select: { categories: true } },
      },
    }),
    prisma.userPuzzlePrefs.findUnique({ where: { userId } }),
    prisma.userMotifRating.findMany({
      where: { userId, motif: { in: [...CANONICAL_MOTIFS] } },
    }),
    prisma.drillSession.count({ where: { userId, status: "active" } }),
    prisma.drillSession.count({ where: { userId, status: "completed" } }),
    prisma.drillSession.findMany({
      where: { userId, status: "completed" },
      orderBy: { completedAt: "desc" },
      take: 5,
    }),
  ]);

  const now = new Date();

  // ── Openings: build family-grouped stats per color ─────────────────────
  const familyAccum = new Map<
    string,
    {
      family: string;
      color: "white" | "black";
      totalEntries: number;
      mastered: number;
      easeSum: number;
      easeCount: number;
      totalReps: number;
      dueNow: number;
      lastReviewedAt: Date | null;
    }
  >();

  for (const r of repertoires) {
    const repColor: "white" | "black" =
      r.color === "White" ? "white" : "black";
    const familyInfo = families[repColor];

    for (const entry of r.entries) {
      const family = familyInfo.familyByEntryId[entry.id] ?? "Other Lines";
      const leafFams = familyInfo.leafFamiliesByEntryId[entry.id];
      if (!leafFams || !leafFams.includes(family)) continue;

      const key = `${repColor}::${family}`;
      let agg = familyAccum.get(key);
      if (!agg) {
        agg = {
          family,
          color: repColor,
          totalEntries: 0,
          mastered: 0,
          easeSum: 0,
          easeCount: 0,
          totalReps: 0,
          dueNow: 0,
          lastReviewedAt: null,
        };
        familyAccum.set(key, agg);
      }
      agg.totalEntries += 1;
      if (entry.phase === "exponential") agg.mastered += 1;
      agg.easeSum += entry.easeFactor;
      agg.easeCount += 1;
      agg.totalReps += entry.repetitions;
      if (entry.nextReviewDate <= now) agg.dueNow += 1;
      if (entry.lastReviewDate) {
        if (!agg.lastReviewedAt || entry.lastReviewDate > agg.lastReviewedAt) {
          agg.lastReviewedAt = entry.lastReviewDate;
        }
      }
    }
  }

  const openings: FamilyStats[] = Array.from(familyAccum.values()).map((a) => ({
    family: a.family,
    color: a.color,
    totalEntries: a.totalEntries,
    mastered: a.mastered,
    masteryPct: a.totalEntries > 0 ? (a.mastered / a.totalEntries) * 100 : 0,
    avgEase: a.easeCount > 0 ? a.easeSum / a.easeCount : 0,
    totalReps: a.totalReps,
    dueNow: a.dueNow,
    lastReviewedAt: a.lastReviewedAt ? a.lastReviewedAt.toISOString() : null,
  }));

  // ── Tactics: top-line + per-category ──────────────────────────────────
  const categoryAccum = new Map<
    string,
    { category: string; reviewed: number; easeSum: number; totalReps: number }
  >();

  let overallEaseSum = 0;
  let overallTotalReps = 0;

  for (const r of reviews) {
    overallEaseSum += r.easeFactor;
    overallTotalReps += r.repetitions;

    for (const cat of r.puzzle.categories) {
      let agg = categoryAccum.get(cat);
      if (!agg) {
        agg = { category: cat, reviewed: 0, easeSum: 0, totalReps: 0 };
        categoryAccum.set(cat, agg);
      }
      agg.reviewed += 1;
      agg.easeSum += r.easeFactor;
      agg.totalReps += r.repetitions;
    }
  }

  const tacticsCategories: TacticsCategoryStats[] = Array.from(
    categoryAccum.values(),
  ).map((a) => ({
    category: a.category,
    reviewed: a.reviewed,
    avgEase: a.reviewed > 0 ? a.easeSum / a.reviewed : 0,
    totalReps: a.totalReps,
  }));

  const tacticsOverall: TacticsOverallStats = {
    reviewed: reviews.length,
    avgEase: reviews.length > 0 ? overallEaseSum / reviews.length : 0,
    totalReps: overallTotalReps,
  };

  // ── Adaptive controller snapshot ──────────────────────────────────────
  // Defaults match the UserPuzzlePrefs schema defaults so a user who's
  // never opened tactics still gets meaningful zeros.
  const adaptive = puzzlePrefs ?? {
    currentTargetRating: 1200,
    globalEwmaSuccess: 0.5,
    globalAttempts: 0,
    globalCorrect: 0,
  };

  const tacticsAdaptive: TacticsAdaptiveStats = {
    currentTargetRating: adaptive.currentTargetRating,
    globalAttempts: adaptive.globalAttempts,
    globalCorrect: adaptive.globalCorrect,
    accuracyPct:
      adaptive.globalAttempts > 0
        ? (adaptive.globalCorrect / adaptive.globalAttempts) * 100
        : null,
    recentEwmaPct:
      adaptive.globalAttempts >= 3
        ? adaptive.globalEwmaSuccess * 100
        : null,
  };

  // ── Per-motif progress ────────────────────────────────────────────────
  const motifByName = new Map(motifRatings.map((m) => [m.motif, m]));
  const tacticsMotifs: TacticsMotifStats[] = CANONICAL_MOTIFS.map((m) => {
    const row = motifByName.get(m);
    return {
      motif: m as CanonicalMotif,
      label: MOTIF_LABELS[m],
      attempts: row?.attempts ?? 0,
      correct: row?.correct ?? 0,
      accuracyPct:
        row && row.attempts > 0
          ? (row.correct / row.attempts) * 100
          : null,
      recentEwmaPct:
        row && row.attempts >= 3 ? row.ewmaSuccess * 100 : null,
      rating: row?.rating ?? null,
      unlocked: row?.unlocked ?? false,
    };
  });

  // ── Drill sessions ────────────────────────────────────────────────────
  const tacticsDrills: TacticsDrillStats = {
    activeCount: activeDrillCount,
    completedCount: completedDrillCount,
    recent: recentDrills.map((d) => {
      const speedup =
        d.baselineMs && d.lastCycleMs && d.lastCycleMs > 0
          ? d.baselineMs / d.lastCycleMs
          : null;
      return {
        id: d.id,
        motif: d.motif,
        size: d.size,
        baselineMs: d.baselineMs,
        lastCycleMs: d.lastCycleMs,
        speedup,
        completedAt:
          d.completedAt?.toISOString() ?? d.updatedAt.toISOString(),
      };
    }),
  };

  return {
    openings,
    tacticsOverall,
    tacticsCategories,
    tacticsAdaptive,
    tacticsMotifs,
    tacticsDrills,
  };
}

// Cache keyed on userId + the latest entry/review/drill touch — writes
// naturally bust the key.
const cachedComputeStatsPageData = unstable_cache(
  async (userId: string, _lastChanged: number) =>
    computeStatsPageData(userId),
  ["stats-page-v2"],
  { revalidate: 300, tags: ["stats-page"] },
);

async function getStatsPageLastChanged(userId: string): Promise<number> {
  const [maxEntry, maxReview, maxMotif, maxDrill, maxPrefs] = await Promise.all([
    prisma.repertoireEntry.findFirst({
      where: { repertoire: { userId } },
      select: { updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.puzzleReview.findFirst({
      where: { userId },
      select: { updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.userMotifRating.findFirst({
      where: { userId },
      select: { updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.drillSession.findFirst({
      where: { userId },
      select: { updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.userPuzzlePrefs.findUnique({
      where: { userId },
      select: { updatedAt: true },
    }),
  ]);
  return Math.max(
    maxEntry?.updatedAt.getTime() ?? 0,
    maxReview?.updatedAt.getTime() ?? 0,
    maxMotif?.updatedAt.getTime() ?? 0,
    maxDrill?.updatedAt.getTime() ?? 0,
    maxPrefs?.updatedAt.getTime() ?? 0,
  );
}

export async function getStatsPageData(userId: string): Promise<StatsPageData> {
  const lastChanged = await getStatsPageLastChanged(userId);
  return cachedComputeStatsPageData(userId, lastChanged);
}
