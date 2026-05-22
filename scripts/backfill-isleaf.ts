/**
 * One-time backfill: stamp isLeaf for every existing RepertoireEntry.
 *
 * After the 20260522120000_add_isleaf_column migration all rows default
 * to isLeaf=true. That's wrong for any entry that has a child in the
 * same repertoire. Run this once to correct existing data.
 *
 * Usage:  npx tsx scripts/backfill-isleaf.ts
 */
import { prisma } from "../src/lib/prisma";
import { recomputeRepertoireLeaves } from "../src/lib/repertoireLeaves";

async function main() {
  const repertoires = await prisma.repertoire.findMany({
    select: { id: true, userId: true, color: true },
  });
  console.log(`Backfilling isLeaf for ${repertoires.length} repertoire(s)…`);

  let done = 0;
  for (const r of repertoires) {
    await recomputeRepertoireLeaves(r.id);
    done++;
    if (done % 10 === 0 || done === repertoires.length) {
      console.log(`  ${done}/${repertoires.length}`);
    }
  }

  const stats = await prisma.repertoireEntry.groupBy({
    by: ["isLeaf"],
    _count: { _all: true },
  });
  console.log("Final counts:", stats);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
