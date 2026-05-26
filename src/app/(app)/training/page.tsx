import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTrainingEnrichment } from "@/lib/trainingEnrichment";
import TrainingClient from "@/components/TrainingClient";

interface TrainingPageProps {
  searchParams: Promise<{
    color?: string;
    opening?: string;
    line?: string;
    family?: string;
    mode?: string;
  }>;
}

// Match an entry's full opening name to the user-selected family. We treat
// the substring before the first ":" as the family, mirroring the grouping
// rule in LineTree.familyOf so the in-app sidebar grouping and the
// "Practice this opening" filter agree.
function familyOf(openingName: string | null): string | null {
  if (!openingName) return null;
  const colon = openingName.indexOf(":");
  return colon === -1 ? openingName : openingName.slice(0, colon).trim();
}


export default async function TrainingPage({
  searchParams,
}: TrainingPageProps) {
  const session = await getServerSession(authOptions);
  const params = await searchParams;

  if (!session?.user?.id) {
    return <div>Please sign in to access training</div>;
  }

  // Determine mode: "review" (due cards, affects SRS) or "practice" (all cards, no SRS)
  const mode = params.mode === "practice" ? "practice" : "review";

  // Determine color filter (if any)
  const colorFilter =
    params.color === "white" || params.color === "black" ? params.color : null;
  const familyFilter = params.family?.trim() ? params.family.trim() : null;
  // "Practice this line" passes the leaf entry id; we expand it server-side
  // to the leaf + every ancestor entry on its path (= the moves the user
  // actually plays to reach the leaf).
  const lineLeafId = params.line?.trim() ? params.line.trim() : null;

  const userId = session.user.id;

  // We need ALL of a repertoire's entries (including first-move ones) to
  // reconstruct the move tree — opening-name lookup relies on the SAN path
  // from the standard starting position to each card, and the SAN of the
  // parent first-move entry is required to compute the path for its
  // children. The first-move entries are filtered out *after* the tree is
  // built (see below) so they don't appear as training cards, but their
  // SAN contribution is preserved.
  const prismaColorFilter = colorFilter
    ? colorFilter === "white"
      ? ("White" as const)
      : ("Black" as const)
    : null;

  // Pull the SRS-flavored row data + the cached opening enrichment in
  // parallel. The enrichment cache is shared across navigations and is
  // automatically invalidated by entry writes (see trainingEnrichment.ts),
  // so the per-render work here is just the fast SRS row read.
  const [repertoiresRaw, enrichmentByRep] = await Promise.all([
    prisma.repertoire.findMany({
      where: {
        userId,
        ...(prismaColorFilter ? { color: prismaColorFilter } : {}),
      },
      select: {
        id: true,
        color: true,
        entries: {
          orderBy: { nextReviewDate: "asc" },
          select: {
            id: true,
            expectedMove: true,
            interval: true,
            easeFactor: true,
            repetitions: true,
            nextReviewDate: true,
            phase: true,
            learningStepIndex: true,
            position: {
              select: { id: true, fen: true, fullmoveNumber: true },
            },
          },
        },
      },
    }),
    getTrainingEnrichment(userId, prismaColorFilter),
  ]);

  const enrichmentMapByRep = new Map(
    enrichmentByRep.map((r) => [r.repertoireId, r]),
  );

  const user = { id: userId, repertoires: repertoiresRaw };

  const now = new Date();
  const enriched = {
    ...user,
    repertoires: user.repertoires.map((r) => {
      // The enrichment cache provides the DFS-preorder of entry IDs +
      // the parent map needed for "Practice this line". By consuming
      // those instead of rebuilding the tree here, we skip a ~3s
      // chess.js tree-build per training page render for ~450-entry
      // users — a wasted recomputation since the data we'd derive from
      // it is already in the unstable_cache result.
      const enrichmentForRep = enrichmentMapByRep.get(r.id);
      const dueOnly = mode === "review";
      const entriesById = new Map(r.entries.map((e) => [e.id, e]));

      // Walk in the cached DFS order. Review mode keeps only due entries;
      // practice mode keeps all. First-move entries (fullmoveNumber=1) are
      // skipped at display time — they're kept in the tree so child SAN
      // paths include the opener, but the user shouldn't drill "make your
      // first move from the standard starting position" as a flash-card.
      const include = (entry: (typeof r.entries)[number]) => {
        if (entry.position.fullmoveNumber <= 1) return false;
        if (dueOnly && entry.nextReviewDate > now) return false;
        return true;
      };
      const ordered: typeof r.entries = [];
      const orderedIds =
        enrichmentForRep?.orderedEntryIds ?? r.entries.map((e) => e.id);
      const seen = new Set<string>();
      for (const id of orderedIds) {
        const entry = entriesById.get(id);
        if (!entry || seen.has(id)) continue;
        seen.add(id);
        if (include(entry)) ordered.push(entry);
      }
      // Defensive sweep: any entry not in the cached order still gets
      // shown (filtered the same way) so we never silently drop a card.
      for (const e of r.entries) {
        if (seen.has(e.id)) continue;
        if (include(e)) ordered.push(e);
      }

      const enrichedEntries = ordered.map((entry) => {
        // Pull opening enrichment straight from the cached map. Falls back
        // to {null, null, []} for entries the cache hasn't seen yet (e.g.,
        // race with a very recent save — the next nav will pick it up).
        const cached = enrichmentForRep?.enrichmentByEntryId[entry.id];
        return {
          ...entry,
          openingName: cached?.openingName ?? null,
          openingEco: cached?.openingEco ?? null,
          priorMoves: cached?.priorMoves ?? [],
          // In practice mode (Learn All) we still want to update SRS for
          // cards that happen to be due — otherwise a long Learn All session
          // hides them from the regular review queue without ever being
          // counted. The client uses this flag to decide whether to fire a
          // /review write after each card.
          isDue: entry.nextReviewDate <= now,
        };
      });

      // When the user picked "Practice <family>", drop entries whose opening
      // family doesn't match. Applied after enrichment so we have
      // `openingName` to derive the family from.
      let entries = familyFilter
        ? enrichedEntries.filter((e) => familyOf(e.openingName) === familyFilter)
        : enrichedEntries;

      // "Practice this line": keep only the entries on the path from any
      // root down to the leaf with id=lineLeafId. The cached parent map
      // gives us this in O(depth) without rebuilding the tree.
      const parentByEntryId = enrichmentForRep?.parentByEntryId;
      if (lineLeafId && entriesById.has(lineLeafId) && parentByEntryId) {
        const pathIds = new Set<string>([lineLeafId]);
        let cursor: string | undefined = lineLeafId;
        while (cursor && parentByEntryId[cursor]) {
          cursor = parentByEntryId[cursor];
          if (cursor) pathIds.add(cursor);
        }
        entries = entries.filter((e) => pathIds.has(e.id));
      }

      return { ...r, entries };
    }),
  };

  return <TrainingClient user={enriched} mode={mode} />;
}
