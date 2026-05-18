/**
 * Opening name lookup, backed by a precomputed ECO dataset.
 *
 * The source dataset (eco.json, derived from the Lichess chess-openings
 * repository) gives us each opening's SAN move list. To support lookup
 * both by SAN-prefix and by FEN, we need each opening's end-FEN plus the
 * FENs of every intermediate position along its path.
 *
 * Previously this module computed those FENs at import time by running
 * ~3,700 chess.js play-throughs twice — that dominated cold-start latency
 * on every serverless invocation. The work now lives in a build-time
 * script (scripts/precompute-eco.ts → eco.precomputed.json), and this
 * file just deserializes the result into the same two lookup maps.
 *
 * Server-side only — the JSON is not shipped to the client.
 */

import precomputed from "./openings/eco.precomputed.json";

interface PrecomputedEntry {
  eco: string;
  name: string;
  key: string;
  endFen: string | null;
  intermediateFens: string[];
}

const entries = precomputed as PrecomputedEntry[];

export interface OpeningMatch {
  eco: string;
  name: string;
}

// byKey: exact SAN-path lookup ("e4 c5 Nf3" → match).
// endFens: positions that *end* a named opening — they win over intermediates.
// intermediateFens: positions traversed mid-line — used when the user is on
//   a transposition but not at the canonical end position.
const byKey = new Map<string, OpeningMatch>();
const endFens = new Map<string, OpeningMatch>();
const intermediateFens = new Map<string, OpeningMatch>();

for (const e of entries) {
  byKey.set(e.key, { eco: e.eco, name: e.name });
  if (e.endFen && !endFens.has(e.endFen)) {
    endFens.set(e.endFen, { eco: e.eco, name: e.name });
  }
}

// "Skip if set" — dataset is pre-sorted longest-first, so collisions on a
// shared transposition keep the more-specific variation.
for (const e of entries) {
  for (const fen of e.intermediateFens) {
    if (!endFens.has(fen) && !intermediateFens.has(fen)) {
      intermediateFens.set(fen, { eco: e.eco, name: e.name });
    }
  }
}

// Compose: ends take precedence over intermediates.
const byFen = new Map<string, OpeningMatch>(intermediateFens);
for (const [k, v] of endFens) byFen.set(k, v);

/**
 * Look up the longest matching opening for a SAN move sequence.
 * Returns null if no prefix matches.
 */
export function lookupOpening(sanMoves: string[]): OpeningMatch | null {
  for (let len = sanMoves.length; len > 0; len--) {
    const hit = byKey.get(sanMoves.slice(0, len).join(" "));
    if (hit) return hit;
  }
  return null;
}

/**
 * Look up the opening that matches exactly at this FEN. Returns null when
 * the position isn't part of any named opening's path.
 */
export function lookupOpeningByFen(fen: string): OpeningMatch | null {
  return byFen.get(fen) ?? null;
}
