/**
 * /stats page data aggregation.
 *
 * Identical contract to the previous inline computation in stats/page.tsx
 * but lifted out so we can cache it. The heavy parts are: building the
 * repertoire tree (chess.js), computing ECO families per entry, and the
 * puzzle-review join. All three repeat for every navigation; caching
 * keyed on userId + lastChanged means re-visits within the cache window
 * skip them entirely.
 */

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { lookupOpening } from "@/lib/openings";
import {
  buildRepertoireTree,
  getAnchoredSansForNode,
} from "@/lib/repertoireTree";

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

export interface TacticsRatingBandStats {
  band: string;
  reviewed: number;
  avgEase: number;
  totalReps: number;
}

export interface TacticsOverallStats {
  reviewed: number;
  avgEase: number;
  totalReps: number;
}

export interface StatsPageData {
  openings: FamilyStats[];
  tacticsCategories: TacticsCategoryStats[];
  tacticsBands: TacticsRatingBandStats[];
  tacticsOverall: TacticsOverallStats;
}

const RATING_BANDS: { label: string; min: number; max: number }[] = [
  { label: "Beginner (800–1399)", min: 800, max: 1399 },
  { label: "Intermediate (1400–1799)", min: 1400, max: 1799 },
  { label: "Advanced (1800–2400)", min: 1800, max: 2400 },
];

function familyOf(openingName: string | null): string {
  if (!openingName) return "Other Lines";
  const colon = openingName.indexOf(":");
  return colon === -1 ? openingName : openingName.slice(0, colon).trim();
}

async function computeStatsPageData(userId: string): Promise<StatsPageData> {
  const [repertoires, reviews] = await Promise.all([
    prisma.repertoire.findMany({
      where: { userId },
      select: {
        color: true,
        entries: {
          select: {
            id: true,
            expectedMove: true,
            easeFactor: true,
            repetitions: true,
            phase: true,
            nextReviewDate: true,
            lastReviewDate: true,
            position: { select: { fen: true } },
          },
        },
      },
    }),
    prisma.puzzleReview.findMany({
      where: { userId },
      select: {
        easeFactor: true,
        repetitions: true,
        puzzle: { select: { categories: true, rating: true } },
      },
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
    const { roots, byEntryId } = buildRepertoireTree(r.entries, r.color);

    const familyByEntryId = new Map<string, string>();
    for (const entry of r.entries) {
      const node = byEntryId.get(entry.id);
      const anchored = node ? getAnchoredSansForNode(node) : [];
      const lookupSans =
        anchored.length > 0 ? anchored : (node?.sanMoves ?? []);
      const match = lookupOpening(lookupSans);
      familyByEntryId.set(entry.id, familyOf(match?.name ?? null));
    }

    const leafFamiliesByNode = new Map<string, Set<string>>();
    const collectLeafFamilies = (
      node: ReturnType<typeof byEntryId.get>,
    ): Set<string> => {
      if (!node) return new Set();
      const cached = leafFamiliesByNode.get(node.id);
      if (cached) return cached;
      const out = new Set<string>();
      if (node.children.length === 0) {
        const fam = familyByEntryId.get(node.id);
        if (fam) out.add(fam);
      } else {
        for (const child of node.children) {
          for (const f of collectLeafFamilies(child)) out.add(f);
        }
      }
      leafFamiliesByNode.set(node.id, out);
      return out;
    };
    for (const root of roots) collectLeafFamilies(root);

    for (const entry of r.entries) {
      const family = familyByEntryId.get(entry.id) ?? "Other Lines";
      const leafFams = leafFamiliesByNode.get(entry.id);
      if (!leafFams || !leafFams.has(family)) continue;

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

  // ── Tactics: per-category + per-rating-band + overall ─────────────────
  const categoryAccum = new Map<
    string,
    { category: string; reviewed: number; easeSum: number; totalReps: number }
  >();
  const bandAccum: TacticsRatingBandStats[] = RATING_BANDS.map((b) => ({
    band: b.label,
    reviewed: 0,
    avgEase: 0,
    totalReps: 0,
  }));
  const bandEaseSums: number[] = RATING_BANDS.map(() => 0);

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

    for (let i = 0; i < RATING_BANDS.length; i++) {
      const b = RATING_BANDS[i];
      if (r.puzzle.rating >= b.min && r.puzzle.rating <= b.max) {
        bandAccum[i].reviewed += 1;
        bandAccum[i].totalReps += r.repetitions;
        bandEaseSums[i] += r.easeFactor;
        break;
      }
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

  const tacticsBands = bandAccum.map((b, i) => ({
    ...b,
    avgEase: b.reviewed > 0 ? bandEaseSums[i] / b.reviewed : 0,
  }));

  const tacticsOverall: TacticsOverallStats = {
    reviewed: reviews.length,
    avgEase: reviews.length > 0 ? overallEaseSum / reviews.length : 0,
    totalReps: overallTotalReps,
  };

  return { openings, tacticsCategories, tacticsBands, tacticsOverall };
}

// Cache keyed on userId + the latest entry/review touch — same pattern
// as training stats. Writes naturally bust the key.
const cachedComputeStatsPageData = unstable_cache(
  async (userId: string, _lastChanged: number) =>
    computeStatsPageData(userId),
  ["stats-page-v1"],
  { revalidate: 300, tags: ["stats-page"] },
);

async function getStatsPageLastChanged(userId: string): Promise<number> {
  const [maxEntry, maxReview] = await Promise.all([
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
  ]);
  return Math.max(
    maxEntry?.updatedAt.getTime() ?? 0,
    maxReview?.updatedAt.getTime() ?? 0,
  );
}

export async function getStatsPageData(userId: string): Promise<StatsPageData> {
  const lastChanged = await getStatsPageLastChanged(userId);
  return cachedComputeStatsPageData(userId, lastChanged);
}
