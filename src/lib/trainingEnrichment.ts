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
import { anchorSansToStart, buildRepertoireTree } from "@/lib/repertoireTree";
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
    const walk = (node: ReturnType<typeof byEntryId.get>) => {
      if (!node || visited.has(node.id)) return;
      visited.add(node.id);
      orderedEntryIds.push(node.id);
      for (const child of node.children) walk(child);
    };
    for (const root of roots) walk(root);
    // Defensive sweep — unreachable entries still get enrichment so the
    // caller can include them with the same display logic.
    for (const e of r.entries) {
      if (!visited.has(e.id)) orderedEntryIds.push(e.id);
    }

    const enrichmentByEntryId: Record<string, EntryEnrichment> = {};
    for (const entry of r.entries) {
      const node = byEntryId.get(entry.id);
      const sans = node?.sanMoves ?? [];
      const rootFen = node?.rootFen ?? entry.position.fen;
      const priorMoves = anchorSansToStart(sans, entry.position.fen, rootFen);
      const lookupSans = priorMoves.length > 0 ? priorMoves : sans;
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
    };
  });
}

const cachedComputeEnrichment = unstable_cache(
  async (userId: string, _lastChanged: number, colorFilter: PieceColor | null) =>
    computeEnrichment(userId, colorFilter),
  ["training-enrichment-v1"],
  // 5 min matches statsPageData. Writes bust the key via lastChanged.
  { revalidate: 300, tags: ["training-enrichment"] },
);

async function getEnrichmentLastChanged(
  userId: string,
  colorFilter: PieceColor | null,
): Promise<number> {
  const latest = await prisma.repertoireEntry.findFirst({
    where: {
      repertoire: {
        userId,
        ...(colorFilter ? { color: colorFilter } : {}),
      },
    },
    select: { updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return latest?.updatedAt.getTime() ?? 0;
}

/**
 * Build (or fetch from cache) the per-entry opening-name + priorMoves
 * data needed by the training page. The cache key includes the latest
 * `updatedAt` across the user's entries, so any add/edit/delete naturally
 * invalidates without an explicit cache bust.
 */
export async function getTrainingEnrichment(
  userId: string,
  colorFilter: PieceColor | null,
): Promise<RepertoireEnrichment[]> {
  const lastChanged = await getEnrichmentLastChanged(userId, colorFilter);
  return cachedComputeEnrichment(userId, lastChanged, colorFilter);
}
