/**
 * Curated import of the Lichess puzzle database.
 *
 * Run with:
 *   npx tsx scripts/seed-puzzles.ts <path-to-lichess_db_puzzle.csv>
 *
 * The full dump is ~4M puzzles and ~600MB; this script streams the file,
 * applies a popularity floor, and keeps a balanced sample across
 * (category × rating-band) buckets so the catalog covers all four
 * user-facing categories at every difficulty level.
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { PrismaClient } from "@prisma/client";
import { mapThemesToCategories, PUZZLE_CATEGORIES } from "../src/lib/puzzleCategories";

const prisma = new PrismaClient();

const POPULARITY_MIN = 80;
const PER_BUCKET_TARGET = 1500;
const BATCH_SIZE = 1000;

const RATING_BANDS: { name: string; min: number; max: number }[] = [
  { name: "beginner", min: 800, max: 1399 },
  { name: "intermediate", min: 1400, max: 1799 },
  { name: "advanced", min: 1800, max: 2400 },
];

function bandFor(rating: number): string | null {
  for (const b of RATING_BANDS) {
    if (rating >= b.min && rating <= b.max) return b.name;
  }
  return null;
}

/**
 * Lichess CSV columns: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,
 * NbPlays,Themes,GameUrl,OpeningTags
 * Themes is a space-separated list inside the field (no quotes/commas to escape).
 */
function parseRow(line: string): {
  lichessId: string;
  fen: string;
  moves: string;
  rating: number;
  popularity: number;
  themes: string[];
} | null {
  const cols = line.split(",");
  if (cols.length < 8) return null;
  const [lichessId, fen, moves, ratingStr, , popularityStr, , themesStr] = cols;
  const rating = parseInt(ratingStr, 10);
  const popularity = parseInt(popularityStr, 10);
  if (Number.isNaN(rating) || Number.isNaN(popularity)) return null;
  const themes = themesStr ? themesStr.trim().split(/\s+/).filter(Boolean) : [];
  return { lichessId, fen, moves, rating, popularity, themes };
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: npx tsx scripts/seed-puzzles.ts <csv-path>");
    process.exit(1);
  }

  // bucket key: `${category}|${band}` → count
  const counts = new Map<string, number>();
  const targetCells: string[] = [];
  for (const cat of PUZZLE_CATEGORIES) {
    for (const band of RATING_BANDS) {
      targetCells.push(`${cat}|${band.name}`);
      counts.set(`${cat}|${band.name}`, 0);
    }
  }

  const stream = createReadStream(csvPath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  const seen = new Set<string>();
  const buffer: Array<{
    lichessId: string;
    fen: string;
    moves: string;
    rating: number;
    popularity: number;
    themes: string[];
    categories: string[];
  }> = [];

  let scanned = 0;
  let kept = 0;
  let header = true;

  const flush = async () => {
    if (buffer.length === 0) return;
    await prisma.puzzle.createMany({
      data: buffer.map((p) => ({
        lichessId: p.lichessId,
        fen: p.fen,
        moves: p.moves,
        rating: p.rating,
        popularity: p.popularity,
        themes: p.themes,
        categories: p.categories,
      })),
      skipDuplicates: true,
    });
    buffer.length = 0;
  };

  const allFull = () =>
    targetCells.every((k) => (counts.get(k) ?? 0) >= PER_BUCKET_TARGET);

  for await (const line of rl) {
    if (header) {
      header = false;
      continue;
    }
    scanned++;
    const row = parseRow(line);
    if (!row) continue;
    if (row.popularity < POPULARITY_MIN) continue;
    const band = bandFor(row.rating);
    if (!band) continue;
    const categories = mapThemesToCategories(row.themes);
    if (categories.length === 0) continue;

    // Keep the puzzle if it helps fill at least one not-yet-full cell.
    const helps = categories.some(
      (c) => (counts.get(`${c}|${band}`) ?? 0) < PER_BUCKET_TARGET,
    );
    if (!helps) continue;
    if (seen.has(row.lichessId)) continue;
    seen.add(row.lichessId);
    for (const c of categories) {
      const k = `${c}|${band}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    buffer.push({ ...row, categories });
    kept++;
    if (buffer.length >= BATCH_SIZE) await flush();
    if (scanned % 100000 === 0) {
      console.log(`scanned=${scanned} kept=${kept}`);
    }
    if (allFull()) break;
  }

  await flush();

  console.log("\nDone.");
  console.log(`Scanned: ${scanned}, kept: ${kept}`);
  console.log("Bucket fill:");
  for (const k of targetCells) {
    console.log(`  ${k}: ${counts.get(k)}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
