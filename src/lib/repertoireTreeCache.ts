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
import { anchorSansToStart, buildRepertoireTree } from "@/lib/repertoireTree";

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
    const anchoredSans = anchorSansToStart(
      built.sanMoves,
      built.fen,
      built.rootFen,
    );
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
