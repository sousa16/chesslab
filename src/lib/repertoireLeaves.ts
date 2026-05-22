/**
 * Maintain RepertoireEntry.isLeaf.
 *
 * A leaf is an entry that no other entry in the same repertoire is a
 * direct child of. The parent-child relation comes from chess move
 * semantics — we have to play the parent's expectedMove + enumerate
 * legal opponent replies and see if any of them lands on a saved entry.
 * That logic already lives in buildRepertoireTree; we reuse it.
 *
 * Called by save-line / delete-entry on the write path so the home
 * dashboard can count leaves with a simple SQL filter on the read path.
 */
import { prisma } from "@/lib/prisma";
import { buildRepertoireTree } from "@/lib/repertoireTree";

/**
 * Recompute `isLeaf` for every entry in the given repertoire. Performs
 * one round-trip to load the entries, one tree-build in JS, then a
 * single bulk UPDATE per leaf-state (two queries — true and false sets).
 */
export async function recomputeRepertoireLeaves(
  repertoireId: string,
): Promise<void> {
  const repertoire = await prisma.repertoire.findUnique({
    where: { id: repertoireId },
    select: {
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
  if (!repertoire) return;

  const { byEntryId } = buildRepertoireTree(repertoire.entries, repertoire.color);

  const leafIds: string[] = [];
  const nonLeafIds: string[] = [];
  for (const entry of repertoire.entries) {
    const node = byEntryId.get(entry.id);
    const isLeaf = !node || node.children.length === 0;
    (isLeaf ? leafIds : nonLeafIds).push(entry.id);
  }

  // Bulk-update with two `IN` lists. Empty arrays short-circuit to
  // skip the round-trip.
  await Promise.all([
    leafIds.length > 0
      ? prisma.repertoireEntry.updateMany({
          where: { id: { in: leafIds } },
          data: { isLeaf: true },
        })
      : Promise.resolve(),
    nonLeafIds.length > 0
      ? prisma.repertoireEntry.updateMany({
          where: { id: { in: nonLeafIds } },
          data: { isLeaf: false },
        })
      : Promise.resolve(),
  ]);
}
