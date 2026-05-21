import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lookupOpening } from "@/lib/openings";
import { anchorSansToStart, buildRepertoireTree } from "@/lib/repertoireTree";
import StatsClient from "@/components/StatsClient";

// Family grouping mirrors LineTree / training page so the stats table
// matches what the user sees elsewhere in the app.
function familyOf(openingName: string | null): string {
  if (!openingName) return "Other Lines";
  const colon = openingName.indexOf(":");
  return colon === -1 ? openingName : openingName.slice(0, colon).trim();
}

interface FamilyStats {
  family: string;
  color: "white" | "black";
  totalEntries: number;
  mastered: number;
  masteryPct: number;
  avgEase: number;
  totalReps: number;
  dueNow: number;
  lastReviewedAt: string | null; // ISO string for serialization
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

const RATING_BANDS: { label: string; min: number; max: number }[] = [
  { label: "Beginner (800–1399)", min: 800, max: 1399 },
  { label: "Intermediate (1400–1799)", min: 1400, max: 1799 },
  { label: "Advanced (1800–2400)", min: 1800, max: 2400 },
];

export default async function StatsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return <div>Please sign in to view stats</div>;
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      repertoires: {
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
      },
    },
  });

  if (!user) {
    return <div>User not found</div>;
  }

  const now = new Date();

  // ── Openings: build family-grouped stats per color ───────────────────
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

  for (const r of user.repertoires) {
    const repColor: "white" | "black" =
      r.color === "White" ? "white" : "black";
    const { roots, byEntryId } = buildRepertoireTree(r.entries, r.color);

    // Compute the family of every entry up-front so the umbrella filter
    // can use it. Reuses the same anchored-sans + ECO lookup logic as
    // the rest of the app.
    const familyByEntryId = new Map<string, string>();
    for (const entry of r.entries) {
      const node = byEntryId.get(entry.id);
      const sans = node?.sanMoves ?? [];
      const rootFen = node?.rootFen ?? entry.position.fen;
      const anchored = anchorSansToStart(sans, entry.position.fen, rootFen);
      const lookupSans = anchored.length > 0 ? anchored : sans;
      const match = lookupOpening(lookupSans);
      familyByEntryId.set(entry.id, familyOf(match?.name ?? null));
    }

    // Bottom-up walk: for each tree node, collect the families of every
    // leaf reachable from it. Used below to decide whether an interior
    // entry's own family is a "real" memorized opening (a leaf below it
    // shares that family) or a transitional umbrella (e.g. "King's Pawn
    // Game" sitting above Caro-Kann + Vienna + Scandinavian branches).
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
      // Skip umbrella entries: nodes whose own family doesn't appear in
      // any leaf below them. These are shared prefixes (e.g. "King's
      // Pawn Game" sitting above Caro-Kann + Vienna + Scandinavian
      // branches) and don't represent an opening the user studies.
      // Real leaves trivially pass — collectLeafFamilies seeds them
      // with their own family.
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
        if (
          !agg.lastReviewedAt ||
          entry.lastReviewDate > agg.lastReviewedAt
        ) {
          agg.lastReviewedAt = entry.lastReviewDate;
        }
      }
    }
  }

  const openings: FamilyStats[] = Array.from(familyAccum.values()).map(
    (a) => ({
      family: a.family,
      color: a.color,
      totalEntries: a.totalEntries,
      mastered: a.mastered,
      masteryPct:
        a.totalEntries > 0 ? (a.mastered / a.totalEntries) * 100 : 0,
      avgEase: a.easeCount > 0 ? a.easeSum / a.easeCount : 0,
      totalReps: a.totalReps,
      dueNow: a.dueNow,
      lastReviewedAt: a.lastReviewedAt
        ? a.lastReviewedAt.toISOString()
        : null,
    }),
  );

  // ── Tactics: per-category + per-rating-band + overall ────────────────
  const reviews = await prisma.puzzleReview.findMany({
    where: { userId: user.id },
    select: {
      easeFactor: true,
      repetitions: true,
      puzzle: { select: { categories: true, rating: true } },
    },
  });

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

    // A puzzle can belong to multiple categories; count it under each
    // (so the per-category numbers aren't a partition — they may double-
    // count, but each category's avg reflects that category accurately).
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

  return (
    <StatsClient
      openings={openings}
      tacticsCategories={tacticsCategories}
      tacticsBands={tacticsBands}
      tacticsOverall={tacticsOverall}
    />
  );
}
