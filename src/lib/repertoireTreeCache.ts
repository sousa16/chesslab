/**
 * Shared cache for the expensive part of /api/repertoires: building the
 * repertoire tree + anchoring SAN paths + looking up opening names.
 *
 * The tree shape depends ONLY on which (positionId, expectedMove) pairs
 * exist — not on SRS state. Splitting this cache from the per-request
 * `mastered` decoration means SRS review writes (which only touch
 * interval/phase/etc) don't bust the heavy tree-build cache. For a
 * ~450-entry user this turns a 4–5s cold rebuild into a < 5ms cache
 * hit on every nav back to the Repertoire panel after a review session.
 */

import { unstable_cache } from "next/cache";
import { PieceColor, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { lookupOpening } from "@/lib/openings";
import {
  buildRepertoireTree,
  getAnchoredSansForNode,
} from "@/lib/repertoireTree";

export interface CachedLineNode {
  id: string;
  fen: string;
  expectedMove: string;
  moveNumber: number;
  displaySequence: string;
  sanMoves: string[];
  openingName: string | null;
  openingEco: string | null;
  opponentMove?: string;
  children: CachedLineNode[];
}

export interface CachedRepertoireTree {
  repertoireId: string;
  // null when the repertoire has no entries
  root: CachedLineNode | null;
}

/**
 * Per-entry family + "is this entry's family represented at a leaf in
 * its subtree?" — both are pure structure-derived facts (depend only on
 * positionId + expectedMove + opening lookup, not on SRS state). Lifted
 * out of statsPageData so the stats page hits the same cache as
 * /api/repertoires on review writes instead of rebuilding the tree.
 */
export interface CachedFamilyInfo {
  // entryId → family name (e.g. "Vienna Game", "Caro-Kann Defense", or
  // "Other Lines" when the opening lookup misses).
  familyByEntryId: Record<string, string>;
  // entryId → list of families that appear as leaves below this node in
  // the user's tree. Used by stats to skip non-leaf-representative
  // entries when counting "lines" per family.
  leafFamiliesByEntryId: Record<string, string[]>;
}

export interface CachedRepertoireFamilies {
  // color → family info
  white: CachedFamilyInfo;
  black: CachedFamilyInfo;
}

function formatSanSequence(moves: string[]): string {
  if (moves.length === 0) return "Initial Position";
  const parts: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) parts.push(`${Math.floor(i / 2) + 1}.${moves[i]}`);
    else parts.push(moves[i]);
  }
  return parts.join(" ");
}

async function computeTree(
  userId: string,
  color: PieceColor,
): Promise<CachedRepertoireTree> {
  const repertoire = await prisma.repertoire.findUnique({
    where: { userId_color: { userId, color } },
    select: {
      id: true,
      color: true,
      entries: {
        select: {
          id: true,
          expectedMove: true,
          position: { select: { fen: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!repertoire || repertoire.entries.length === 0) {
    return { repertoireId: repertoire?.id ?? "", root: null };
  }

  const { roots: builtRoots } = buildRepertoireTree(
    repertoire.entries,
    repertoire.color,
  );

  const decorate = (built: (typeof builtRoots)[number]): CachedLineNode => {
    const anchoredSans = getAnchoredSansForNode(built);
    const userMoveSan = built.sanMoves[built.sanMoves.length - 1];
    const displaySans =
      anchoredSans.length > 0 && userMoveSan
        ? [...anchoredSans, userMoveSan]
        : built.sanMoves;
    const match = lookupOpening(displaySans);
    return {
      id: built.id,
      fen: built.fen,
      expectedMove: built.expectedMove,
      moveNumber: Math.ceil(displaySans.length / 2),
      displaySequence: formatSanSequence(displaySans),
      sanMoves: displaySans,
      openingName: match?.name ?? null,
      openingEco: match?.eco ?? null,
      opponentMove: built.opponentMove,
      children: built.children.map(decorate),
    };
  };

  const rootNodes = builtRoots.map(decorate);

  let finalRoot: CachedLineNode | null = null;
  if (rootNodes.length === 1) {
    finalRoot = rootNodes[0];
  } else if (rootNodes.length > 1) {
    finalRoot = {
      id: "virtual-root-" + repertoire.id,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      expectedMove: "",
      moveNumber: 0,
      displaySequence: "Starting Position",
      sanMoves: [],
      openingName: null,
      openingEco: null,
      children: rootNodes,
    };
  }

  return { repertoireId: repertoire.id, root: finalRoot };
}

const cachedComputeTree = unstable_cache(
  async (userId: string, color: PieceColor, _structureVersion: string) =>
    computeTree(userId, color),
  ["repertoire-tree-v1"],
  // The structure version (max createdAt + count) is part of the args,
  // so adds/deletes naturally bust the key. Revalidate at 5min as a
  // backstop; mid-flight invalidation is implicit via the version arg.
  { revalidate: 300, tags: ["repertoire-tree"] },
);

/**
 * Structure version for the cache key. Changes only on entry create/delete,
 * NOT on SRS review writes — those only touch SRS fields that don't
 * affect tree shape or opening names.
 */
async function getStructureVersion(
  userId: string,
  color: PieceColor,
): Promise<string> {
  const where: Prisma.RepertoireEntryWhereInput = {
    repertoire: { userId, color },
  };
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

export async function getCachedRepertoireTree(
  userId: string,
  color: PieceColor,
): Promise<CachedRepertoireTree> {
  const version = await getStructureVersion(userId, color);
  return cachedComputeTree(userId, color, version);
}

/**
 * Compute the per-color family info from the same fetched entries that
 * computeTree consumes. Lifted into its own function so both consumers
 * (the tree cache + the stats family cache) share the cost when called
 * in a single request — but each has its own cache slot.
 */
async function computeFamilyInfo(
  userId: string,
  color: PieceColor,
): Promise<CachedFamilyInfo> {
  const repertoire = await prisma.repertoire.findUnique({
    where: { userId_color: { userId, color } },
    select: {
      entries: {
        select: {
          id: true,
          expectedMove: true,
          position: { select: { fen: true } },
        },
      },
    },
  });
  if (!repertoire || repertoire.entries.length === 0) {
    return { familyByEntryId: {}, leafFamiliesByEntryId: {} };
  }
  const { roots, byEntryId } = buildRepertoireTree(
    repertoire.entries,
    color,
  );
  const familyOf = (openingName: string | null): string => {
    if (!openingName) return "Other Lines";
    const colon = openingName.indexOf(":");
    return colon === -1 ? openingName : openingName.slice(0, colon).trim();
  };
  const familyByEntryId: Record<string, string> = {};
  for (const entry of repertoire.entries) {
    const node = byEntryId.get(entry.id);
    const anchored = node ? getAnchoredSansForNode(node) : [];
    const lookupSans =
      anchored.length > 0 ? anchored : (node?.sanMoves ?? []);
    const match = lookupOpening(lookupSans);
    familyByEntryId[entry.id] = familyOf(match?.name ?? null);
  }
  const leafFamiliesByEntryId: Record<string, string[]> = {};
  const collect = (
    n: ReturnType<typeof byEntryId.get>,
    memo: Map<string, Set<string>>,
  ): Set<string> => {
    if (!n) return new Set();
    const cached = memo.get(n.id);
    if (cached) return cached;
    const out = new Set<string>();
    if (n.children.length === 0) {
      const fam = familyByEntryId[n.id];
      if (fam) out.add(fam);
    } else {
      for (const c of n.children) for (const f of collect(c, memo)) out.add(f);
    }
    memo.set(n.id, out);
    return out;
  };
  const memo = new Map<string, Set<string>>();
  for (const root of roots) collect(root, memo);
  for (const [id, set] of memo) {
    leafFamiliesByEntryId[id] = Array.from(set);
  }
  return { familyByEntryId, leafFamiliesByEntryId };
}

const cachedComputeFamilies = unstable_cache(
  async (userId: string, _structureVersion: string) => {
    const [white, black] = await Promise.all([
      computeFamilyInfo(userId, "White" as PieceColor),
      computeFamilyInfo(userId, "Black" as PieceColor),
    ]);
    return { white, black };
  },
  ["repertoire-families-v1"],
  { revalidate: 300, tags: ["repertoire-tree"] },
);

/**
 * Per-color family + leaf-family info, cached by structure version.
 * The /stats page uses this with fresh SRS aggregates patched on top
 * to avoid rebuilding the tree on every nav after a review.
 */
export async function getCachedRepertoireFamilies(
  userId: string,
): Promise<CachedRepertoireFamilies> {
  const [vw, vb] = await Promise.all([
    getStructureVersion(userId, "White" as PieceColor),
    getStructureVersion(userId, "Black" as PieceColor),
  ]);
  return cachedComputeFamilies(userId, `${vw}|${vb}`);
}

/**
 * Per-color (fen, expectedMove) projection — the minimal shape the
 * Explorer client needs to look up "is this position in my repertoire,
 * and if so what's the planned move". Cached on structure version so
 * SRS review writes don't bust it. Avoids a fresh prisma roundtrip per
 * Explorer nav.
 */
export interface CachedExplorerEntries {
  white: { fen: string; expectedMove: string }[];
  black: { fen: string; expectedMove: string }[];
}

async function computeExplorerEntries(
  userId: string,
): Promise<CachedExplorerEntries> {
  const repertoires = await prisma.repertoire.findMany({
    where: { userId },
    select: {
      color: true,
      entries: {
        select: {
          expectedMove: true,
          position: { select: { fen: true } },
        },
      },
    },
  });
  const result: CachedExplorerEntries = { white: [], black: [] };
  for (const r of repertoires) {
    const color = r.color === "White" ? "white" : "black";
    result[color] = r.entries.map((e) => ({
      fen: e.position.fen,
      expectedMove: e.expectedMove,
    }));
  }
  return result;
}

const cachedComputeExplorerEntries = unstable_cache(
  async (userId: string, _structureVersion: string) =>
    computeExplorerEntries(userId),
  ["explorer-entries-v1"],
  { revalidate: 300, tags: ["repertoire-tree"] },
);

export async function getCachedExplorerEntries(
  userId: string,
): Promise<CachedExplorerEntries> {
  const [vw, vb] = await Promise.all([
    getStructureVersion(userId, "White" as PieceColor),
    getStructureVersion(userId, "Black" as PieceColor),
  ]);
  return cachedComputeExplorerEntries(userId, `${vw}|${vb}`);
}
