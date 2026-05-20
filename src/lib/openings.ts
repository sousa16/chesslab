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

// Only the SAN-prefix lookup is used by callers. The previous version also
// built per-FEN end/intermediate maps (~3700 entries × ~10 intermediate
// FENs each), which dominated module-load CPU on cold serverless
// invocations for endpoints that import this file — and nothing consumed
// them. If a by-FEN lookup is reintroduced, rebuild from `entries` lazily
// behind a memo rather than at module load.
const byKey = new Map<string, OpeningMatch>();
for (const e of entries) {
  byKey.set(e.key, { eco: e.eco, name: e.name });
}

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
