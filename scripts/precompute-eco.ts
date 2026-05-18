/**
 * Precompute the ECO opening dataset into a runtime-friendly shape.
 *
 * Input:  src/lib/openings/eco.json
 *   [{ eco, name, m: string[] }, ...]
 *
 * Output: src/lib/openings/eco.precomputed.json
 *   [{ eco, name, key, endFen, intermediateFens: string[] }, ...]
 *
 * Run with: npm run precompute:eco
 *
 * The runtime importer (src/lib/openings.ts) can then build its lookup
 * maps without ever instantiating chess.js — the original module load
 * was doing two passes of ~3,700 chess.js play-throughs on every cold
 * start, which dominated first-request latency for any route that
 * imported the opening lookup.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Chess } from "chess.js";

interface EcoEntry {
  eco: string;
  name: string;
  m: string[];
}

interface PrecomputedEntry {
  eco: string;
  name: string;
  key: string;
  endFen: string | null;
  intermediateFens: string[];
}

const SRC = join(process.cwd(), "src/lib/openings/eco.json");
const OUT = join(process.cwd(), "src/lib/openings/eco.precomputed.json");

const raw = JSON.parse(readFileSync(SRC, "utf8")) as EcoEntry[];

const out: PrecomputedEntry[] = [];
let skipped = 0;

for (const e of raw) {
  const game = new Chess();
  const intermediateFens: string[] = [];
  let ok = true;
  for (let i = 0; i < e.m.length; i++) {
    try {
      const move = game.move(e.m[i]);
      if (!move) {
        ok = false;
        break;
      }
    } catch {
      ok = false;
      break;
    }
    if (i < e.m.length - 1) intermediateFens.push(game.fen());
  }
  if (!ok) {
    skipped++;
    out.push({
      eco: e.eco,
      name: e.name,
      key: e.m.join(" "),
      endFen: null,
      intermediateFens: [],
    });
    continue;
  }
  out.push({
    eco: e.eco,
    name: e.name,
    key: e.m.join(" "),
    endFen: game.fen(),
    intermediateFens,
  });
}

writeFileSync(OUT, JSON.stringify(out));
console.log(
  `precomputed ${out.length} entries (${skipped} unplayable) -> ${OUT}`,
);
