/**
 * Canonical tactical motifs tracked by the adaptive controller.
 *
 * A subset of Lichess' raw theme tags: the ones that actually correspond to
 * a teachable pattern a player can drill. Everything else (`master`,
 * `oneMove`, `short`, structural tags…) is excluded because there's no
 * pedagogical benefit to "drilling middlegame puzzles" in the abstract.
 *
 * Used by:
 *  - UserMotifRating (one row per motif per user, lazily created)
 *  - /api/puzzles/next "auto" mode to pick the next motif to block on
 *  - the FiltersPanel motif dropdown in blocked mode
 *  - DrillSession.motif when seeding a Woodpecker-style set
 */

export const CANONICAL_MOTIFS = [
  "fork",
  "pin",
  "skewer",
  "deflection",
  "decoy",
  "discoveredAttack",
  "doubleCheck",
  "backRankMate",
  "sacrifice",
  "hangingPiece",
  "xRayAttack",
  "clearance",
] as const;

export type CanonicalMotif = (typeof CANONICAL_MOTIFS)[number];

const MOTIF_SET = new Set<string>(CANONICAL_MOTIFS);

/**
 * Intersect a puzzle's themes with the canonical list — used when crediting
 * an attempt to its motifs in /api/puzzles/review.
 */
export function canonicalMotifsFromThemes(themes: string[]): CanonicalMotif[] {
  const out: CanonicalMotif[] = [];
  for (const t of themes) {
    if (MOTIF_SET.has(t)) out.push(t as CanonicalMotif);
  }
  return out;
}

/**
 * Human-readable label for the UI.
 */
export const MOTIF_LABELS: Record<CanonicalMotif, string> = {
  fork: "Fork",
  pin: "Pin",
  skewer: "Skewer",
  deflection: "Deflection",
  decoy: "Decoy",
  discoveredAttack: "Discovered Attack",
  doubleCheck: "Double Check",
  backRankMate: "Back-Rank Mate",
  sacrifice: "Sacrifice",
  hangingPiece: "Hanging Piece",
  xRayAttack: "X-Ray Attack",
  clearance: "Clearance",
};

export function isCanonicalMotif(s: string): s is CanonicalMotif {
  return MOTIF_SET.has(s);
}
