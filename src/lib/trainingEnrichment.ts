/**
 * Per-entry opening-name enrichment for the /training page.
 *
 * The expensive parts of the training page render are:
 *   1. buildRepertoireTree (chess.js — quadratic in entries on link step)
 *   2. anchorSansToStart per entry (chess.js replay)
 *   3. lookupOpening per entry (Map lookup, but ~thousands of entries)
 *
 * All three are pure functions of the user's saved positions/expected
 * moves — they don't depend on SRS state, due dates, or session. So we
 * cache the result keyed on (userId, lastChanged). When the user
 * navigates back into /training without having added/edited a position
 * the cache returns the prebuilt enrichment instantly; only the SRS
 * filtering and order-walk repeat per render.
 *
 * Mirrors the pattern already used by statsPageData.ts.
 */

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { lookupOpening } from "@/lib/openings";
import {
  buildRepertoireTree,
  getAnchoredSansForNode,
} from "@/lib/repertoireTree";
import { PieceColor } from "@prisma/client";

export interface EntryEnrichment {
  openingName: string | null;
  openingEco: string | null;
  priorMoves: string[];
}

export interface RepertoireEnrichment {
  repertoireId: string;
  color: PieceColor;
  // Order of entry IDs as discovered by tree DFS from each root, then a
  // defensive sweep of any unreachable entries. Callers walk this list and
  // skip first-move entries to match the previous behavior.
  orderedEntryIds: string[];
  enrichmentByEntryId: Record<string, EntryEnrichment>;
  // entryId → parent entryId. Lets the training page resolve "practice
  // this line" (= path from root to a leaf) without rebuilding the tree.
  // Entries that are roots in the user's tree don't appear as keys.
  parentByEntryId: Record<string, string>;
}

async function computeEnrichment(
  userId: string,
  colorFilter: PieceColor | null,
): Promise<RepertoireEnrichment[]> {
  const repertoires = await prisma.repertoire.findMany({
    where: {
      userId,
      ...(colorFilter ? { color: colorFilter } : {}),
    },
    select: {
      id: true,
      color: true,
      entries: {
        select: {
          id: true,
          expectedMove: true,
          position: { select: { fen: true } },
        },
      },
    },
  });

  return repertoires.map((r) => {
    const { roots, byEntryId } = buildRepertoireTree(r.entries, r.color);

    const orderedEntryIds: string[] = [];
    const visited = new Set<string>();
    const parentByEntryId: Record<string, string> = {};
    const walk = (
      node: ReturnType<typeof byEntryId.get>,
      parentId: string | null,
    ) => {
      if (!node || visited.has(node.id)) return;
      visited.add(node.id);
      orderedEntryIds.push(node.id);
      if (parentId) parentByEntryId[node.id] = parentId;
      for (const child of node.children) walk(child, node.id);
    };
    for (const root of roots) walk(root, null);
    // Defensive sweep — unreachable entries still get enrichment so the
    // caller can include them with the same display logic.
    for (const e of r.entries) {
      if (!visited.has(e.id)) orderedEntryIds.push(e.id);
    }

    const enrichmentByEntryId: Record<string, EntryEnrichment> = {};
    for (const entry of r.entries) {
      const node = byEntryId.get(entry.id);
      const priorMoves = node ? getAnchoredSansForNode(node) : [];
      const lookupSans =
        priorMoves.length > 0 ? priorMoves : (node?.sanMoves ?? []);
      const match = lookupOpening(lookupSans);
      enrichmentByEntryId[entry.id] = {
        openingName: match?.name ?? null,
        openingEco: match?.eco ?? null,
        priorMoves,
      };
    }

    return {
      repertoireId: r.id,
      color: r.color,
      orderedEntryIds,
      enrichmentByEntryId,
      parentByEntryId,
    };
  });
}

const cachedComputeEnrichment = unstable_cache(
  async (userId: string, _structureVersion: string, colorFilter: PieceColor | null) =>
    computeEnrichment(userId, colorFilter),
  ["training-enrichment-v3"],
  // 5 min matches statsPageData. Creates/deletes bust the key via
  // _structureVersion; SRS review writes do not (intentional — tree
  // shape doesn't change on review). v3 adds parentByEntryId — old v2
  // entries don't have it and would break the training page.
  { revalidate: 300, tags: ["training-enrichment"] },
);

async function getEnrichmentStructureVersion(
  userId: string,
  colorFilter: PieceColor | null,
): Promise<string> {
  const where = {
    repertoire: {
      userId,
      ...(colorFilter ? { color: colorFilter } : {}),
    },
  } as const;
  // Tree shape + opening enrichment depend ONLY on the set of
  // (positionId, expectedMove) tuples — i.e., on which entries exist.
  // SRS review writes bump `updatedAt` but don't change tree shape.
  // Using createdAt+count instead of updatedAt+count means review
  // writes don't bust the cache, so a 457-entry user's nav back to
  // /training after a review hits the cached enrichment (~ms) instead
  // of recomputing the full tree (~4–5s).
  const [latest, count] = await Promise.all([
    prisma.repertoireEntry.findFirst({
      where,
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.repertoireEntry.count({ where }),
  ]);
  return `${latest?.createdAt.getTime() ?? 0}-${count}`;
}

/**
 * Build (or fetch from cache) the per-entry opening-name + priorMoves
 * data needed by the training page. The cache key includes a
 * structure version (max createdAt + entry count) so the cache only
 * busts on create/delete — not on SRS review writes, which only
 * touch update fields irrelevant to tree shape.
 */
export async function getTrainingEnrichment(
  userId: string,
  colorFilter: PieceColor | null,
): Promise<RepertoireEnrichment[]> {
  const version = await getEnrichmentStructureVersion(userId, colorFilter);
  return cachedComputeEnrichment(userId, version, colorFilter);
}
