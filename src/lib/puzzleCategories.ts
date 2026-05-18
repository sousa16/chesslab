/**
 * Maps raw Lichess puzzle themes to a small user-facing taxonomy.
 *
 * A puzzle can belong to multiple categories (e.g. a mateIn2 in an endgame
 * counts as both Mates and Endgame), which keeps category filters expressive
 * without forcing a "primary theme" judgement call at ingest time.
 */

export const PUZZLE_CATEGORIES = [
  "Mates",
  "Motifs",
  "Middlegame",
  "Endgame",
] as const;

export type PuzzleCategory = (typeof PUZZLE_CATEGORIES)[number];

const MATE_THEMES = new Set([
  "mate",
  "mateIn1",
  "mateIn2",
  "mateIn3",
  "mateIn4",
  "mateIn5",
  "smotheredMate",
  "backRankMate",
  "anastasiaMate",
  "arabianMate",
  "bodenMate",
  "doubleBishopMate",
  "dovetailMate",
  "hookMate",
  "killBoxMate",
  "vukovicMate",
]);

const MOTIF_THEMES = new Set([
  "fork",
  "pin",
  "skewer",
  "discoveredAttack",
  "doubleCheck",
  "sacrifice",
  "deflection",
  "attraction",
  "decoy",
  "clearance",
  "interference",
  "xRayAttack",
  "intermezzo",
  "zwischenzug",
  "trappedPiece",
  "hangingPiece",
  "capturingDefender",
  "exposedKing",
  "attackingF2F7",
  "kingsideAttack",
  "queensideAttack",
  "quietMove",
  "underPromotion",
  "promotion",
]);

const MIDDLEGAME_THEMES = new Set(["middlegame"]);

const ENDGAME_THEMES = new Set([
  "endgame",
  "pawnEndgame",
  "rookEndgame",
  "queenEndgame",
  "bishopEndgame",
  "knightEndgame",
  "queenRookEndgame",
  "zugzwang",
]);

export function mapThemesToCategories(themes: string[]): PuzzleCategory[] {
  const out = new Set<PuzzleCategory>();
  for (const t of themes) {
    if (MATE_THEMES.has(t)) out.add("Mates");
    if (MOTIF_THEMES.has(t)) out.add("Motifs");
    if (MIDDLEGAME_THEMES.has(t)) out.add("Middlegame");
    if (ENDGAME_THEMES.has(t)) out.add("Endgame");
  }
  return Array.from(out);
}
