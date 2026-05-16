/**
 * Opening name lookup, backed by a bundled ECO dataset derived from the
 * Lichess chess-openings repository (~3,700 named openings).
 *
 * Lookup is "longest-prefix match" against a SAN move sequence: given the
 * moves played so far, return the most-specific named opening that matches
 * a prefix of those moves. Runs server-side only — the dataset is not
 * shipped to the client; only the resolved name is sent in API responses.
 */

import { Chess } from "chess.js";
import eco from "./openings/eco.json";

interface EcoEntry {
  eco: string;
  name: string;
  m: string[];
}

const entries = eco as EcoEntry[];

export interface OpeningMatch {
  eco: string;
  name: string;
}

// Two indices, both built once at module load:
// - byKey: exact SAN-path lookup (used when caller has the full move history).
// - byFen: position lookup by FEN (used when caller only has a FEN, e.g. a
//   training card). Built in two passes so end-of-opening positions win over
//   intermediate ones, while intermediate positions still get tagged with
//   whatever the most-specific opening passing through them is. Dataset is
//   pre-sorted longest-first, so "skip-if-set" naturally keeps the deepest
//   variation on transposition collisions.
const byKey = new Map<string, OpeningMatch>();
const endFens = new Map<string, OpeningMatch>();
const intermediateFens = new Map<string, OpeningMatch>();

for (const e of entries) {
  byKey.set(e.m.join(" "), { eco: e.eco, name: e.name });

  const game = new Chess();
  let ok = true;
  for (const san of e.m) {
    try {
      if (!game.move(san)) {
        ok = false;
        break;
      }
    } catch {
      ok = false;
      break;
    }
  }
  if (!ok) continue;
  const fen = game.fen();
  if (!endFens.has(fen)) {
    endFens.set(fen, { eco: e.eco, name: e.name });
  }
}

// Pass 2: tag every intermediate FEN along each opening's path. Skip
// positions that are already a named endpoint (those keep the precise name).
for (const e of entries) {
  const game = new Chess();
  const lastIdx = e.m.length - 1;
  for (let i = 0; i < lastIdx; i++) {
    try {
      if (!game.move(e.m[i])) break;
    } catch {
      break;
    }
    const fen = game.fen();
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
 * Look up the opening that ends exactly at this FEN. Returns null when the
 * position isn't the end of any named opening (e.g. you're deeper than any
 * book line for that variation).
 */
export function lookupOpeningByFen(fen: string): OpeningMatch | null {
  return byFen.get(fen) ?? null;
}
