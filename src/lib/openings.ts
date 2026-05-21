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

// FEN → SAN sequence from the standard starting position to that FEN.
// Built lazily on first use so callers that only need byKey don't pay the
// ~30k-entry Map build at cold start. Used by the training page +
// repertoireTree to recover a "line so far" when the user's tree root is
// mid-game (and so the tree's own sans omit the opening prefix).
let sanPathByFen: Map<string, string[]> | null = null;
function getSanPathByFen(): Map<string, string[]> {
  if (sanPathByFen) return sanPathByFen;
  const map = new Map<string, string[]>();
  for (const e of entries) {
    const moves = e.key ? e.key.split(" ").filter(Boolean) : [];
    // intermediateFens[i] is the position after moves[0..i] is played.
    for (let i = 0; i < e.intermediateFens.length && i < moves.length; i++) {
      const fen = e.intermediateFens[i];
      if (!map.has(fen)) {
        map.set(fen, moves.slice(0, i + 1));
      }
    }
    if (e.endFen && !map.has(e.endFen)) {
      map.set(e.endFen, moves.slice());
    }
  }
  sanPathByFen = map;
  return map;
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

/**
 * Return the SAN sequence from the standard starting position to the given
 * FEN, or null when the position isn't on any known opening's path. The
 * sequence is the canonical mainline from the ECO dataset; transpositions
 * resolve to the longest stored prefix.
 */
export function sanPathToFen(fen: string): string[] | null {
  return getSanPathByFen().get(fen) ?? null;
}
