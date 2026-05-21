/**
 * Repertoire-gap analysis: pull games from chess.com / Lichess and look
 * for positions where the user found themselves without a saved response.
 *
 * Used by /api/gap-analysis. Kept here so the route handler is just glue.
 */

import { Chess } from "chess.js";

export interface GapFilters {
  chesscomUsername?: string;
  lichessUsername?: string;
  minRating?: number;
  maxRating?: number;
  // Normalized time-class names: bullet / blitz / rapid / classical.
  // Each platform's perf strings are mapped to these before filtering.
  timeClasses?: string[];
  color: "white" | "black" | "both";
  maxGames: number;
}

export interface FetchedGame {
  platform: "chesscom" | "lichess";
  url?: string;
  whiteUsername: string;
  blackUsername: string;
  whiteRating: number | null;
  blackRating: number | null;
  timeClass: string; // normalized
  // SAN moves only — we recompute FENs ourselves. Empty for malformed PGN.
  sanMoves: string[];
}

export interface RawGap {
  positionFen: string; // user-turn position with no saved entry
  opponentMove: string | null; // SAN of the move that put us here
  precedingSans: string[]; // full SAN path to positionFen
  gameUrl?: string;
}

export interface AggregatedGap {
  positionFen: string;
  opponentMove: string | null;
  precedingSans: string[];
  occurrences: number;
  sampleGameUrls: string[];
}

export interface GapAnalysisResult {
  gamesFetched: number;
  gamesAnalyzed: number;
  whiteGaps: AggregatedGap[];
  blackGaps: AggregatedGap[];
  errors: string[];
}

// FENs from different sources can disagree on the trailing halfmove/
// fullmove fields even when the actual position is identical. Strip them
// for comparison.
function fenKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

// chess.com calls "daily" anything correspondence-y; we drop it. Lichess
// distinguishes "ultraBullet" / "correspondence" which we also drop —
// users overwhelmingly care about bullet/blitz/rapid/classical prep.
function normalizeChesscomTimeClass(tc: string): string | null {
  if (tc === "bullet" || tc === "blitz" || tc === "rapid") return tc;
  return null;
}
function normalizeLichessPerf(perf: string): string | null {
  if (perf === "bullet" || perf === "blitz" || perf === "rapid") return perf;
  if (perf === "classical") return "classical";
  return null;
}

// ──────────────────────────────────────────────────────────────────────
// Chess.com fetcher
// ──────────────────────────────────────────────────────────────────────

interface ChesscomArchive {
  archives: string[];
}
interface ChesscomGamesResponse {
  games: ChesscomGame[];
}
interface ChesscomGame {
  url?: string;
  pgn?: string;
  time_class?: string;
  white?: { username?: string; rating?: number };
  black?: { username?: string; rating?: number };
}

async function fetchChesscom(
  username: string,
  max: number,
): Promise<{ games: FetchedGame[]; errors: string[] }> {
  const errors: string[] = [];
  const games: FetchedGame[] = [];
  try {
    const archRes = await fetch(
      `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`,
      { headers: { "User-Agent": "chesslab-gap-analysis" } },
    );
    if (!archRes.ok) {
      errors.push(`chess.com archives lookup failed: ${archRes.status}`);
      return { games, errors };
    }
    const arch = (await archRes.json()) as ChesscomArchive;
    // Walk newest archive first so we can stop as soon as we hit `max`.
    for (const url of [...arch.archives].reverse()) {
      if (games.length >= max) break;
      const monthRes = await fetch(url, {
        headers: { "User-Agent": "chesslab-gap-analysis" },
      });
      if (!monthRes.ok) continue;
      const month = (await monthRes.json()) as ChesscomGamesResponse;
      // newest first within the month too
      for (const g of (month.games ?? []).slice().reverse()) {
        if (games.length >= max) break;
        const tc = g.time_class
          ? normalizeChesscomTimeClass(g.time_class)
          : null;
        if (!tc || !g.pgn) continue;
        const sans = parsePgnMoves(g.pgn);
        if (sans.length === 0) continue;
        games.push({
          platform: "chesscom",
          url: g.url,
          whiteUsername: g.white?.username ?? "",
          blackUsername: g.black?.username ?? "",
          whiteRating: g.white?.rating ?? null,
          blackRating: g.black?.rating ?? null,
          timeClass: tc,
          sanMoves: sans,
        });
      }
    }
  } catch (err) {
    errors.push(
      `chess.com fetch error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return { games, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Lichess fetcher
// ──────────────────────────────────────────────────────────────────────

interface LichessGame {
  id?: string;
  perf?: string;
  moves?: string;
  players?: {
    white?: { user?: { name?: string }; rating?: number };
    black?: { user?: { name?: string }; rating?: number };
  };
}

async function fetchLichess(
  username: string,
  max: number,
  timeClasses: string[] | undefined,
): Promise<{ games: FetchedGame[]; errors: string[] }> {
  const errors: string[] = [];
  const games: FetchedGame[] = [];
  try {
    const perfQuery =
      timeClasses && timeClasses.length > 0
        ? `&perfType=${timeClasses.join(",")}`
        : "";
    const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${max}${perfQuery}&moves=true`;
    const res = await fetch(url, {
      headers: { Accept: "application/x-ndjson" },
    });
    if (!res.ok) {
      errors.push(`lichess fetch failed: ${res.status}`);
      return { games, errors };
    }
    const text = await res.text();
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const g = JSON.parse(line) as LichessGame;
        const perf = g.perf ? normalizeLichessPerf(g.perf) : null;
        if (!perf || !g.moves) continue;
        const sans = g.moves.split(/\s+/).filter(Boolean);
        games.push({
          platform: "lichess",
          url: g.id ? `https://lichess.org/${g.id}` : undefined,
          whiteUsername: g.players?.white?.user?.name ?? "",
          blackUsername: g.players?.black?.user?.name ?? "",
          whiteRating: g.players?.white?.rating ?? null,
          blackRating: g.players?.black?.rating ?? null,
          timeClass: perf,
          sanMoves: sans,
        });
      } catch {
        /* skip malformed line */
      }
    }
  } catch (err) {
    errors.push(
      `lichess fetch error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return { games, errors };
}

// Minimal PGN → SAN[] extractor. chess.js's loadPgn would work but we
// also want to handle the soft-wrapped move lines chess.com emits, and
// we don't need the full PGN model.
function parsePgnMoves(pgn: string): string[] {
  try {
    const g = new Chess();
    g.loadPgn(pgn.replace(/\r\n/g, "\n"), { strict: false });
    return g.history();
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────
// Analysis
// ──────────────────────────────────────────────────────────────────────

interface AnalyzeContext {
  whiteEntries: Set<string>; // FEN keys where the user has a saved response
  blackEntries: Set<string>;
}

/**
 * For a single game, find the first user-turn position where the user
 * has no saved response. We track an `inRepertoire` flag so that once a
 * game has left the repertoire we don't keep reporting subsequent plies.
 * Games where the user wasn't on a side we care about (color filter)
 * return null. Games entirely covered by the repertoire return null too.
 */
function findFirstGap(
  game: FetchedGame,
  side: "white" | "black",
  username: string,
  ctx: AnalyzeContext,
): RawGap | null {
  const userIsWhite =
    game.whiteUsername.toLowerCase() === username.toLowerCase();
  const userIsBlack =
    game.blackUsername.toLowerCase() === username.toLowerCase();
  if (side === "white" && !userIsWhite) return null;
  if (side === "black" && !userIsBlack) return null;

  const entries = side === "white" ? ctx.whiteEntries : ctx.blackEntries;

  const c = new Chess();
  const sansPlayed: string[] = [];
  let inRepertoire = true;

  for (let i = 0; i < game.sanMoves.length; i++) {
    const isWhiteTurn = c.turn() === "w";
    const isUserTurn =
      (side === "white" && isWhiteTurn) ||
      (side === "black" && !isWhiteTurn);

    if (isUserTurn) {
      const has = entries.has(fenKey(c.fen()));
      if (!has && inRepertoire) {
        // Found the exit. The move that caused it is the previous ply
        // (the opponent's last move). For ply-0 white games or ply-1
        // black games, no preceding move exists.
        const opponentMove = i > 0 ? sansPlayed[i - 1] : null;
        return {
          positionFen: c.fen(),
          opponentMove,
          precedingSans: sansPlayed.slice(),
          gameUrl: game.url,
        };
      }
      inRepertoire = inRepertoire && has;
    }

    const move = c.move(game.sanMoves[i]);
    if (!move) break;
    sansPlayed.push(move.san);
  }

  return null;
}

/**
 * Driver. Pulls games, applies filters, aggregates first-gap counts per
 * side. Aggregation key is the position FEN (whose-turn-included), so
 * transpositions reach the same bucket.
 */
export async function runGapAnalysis(
  filters: GapFilters,
  userRepertoires: {
    color: "white" | "black";
    fens: string[]; // FENs where the user has at least one saved response
  }[],
): Promise<GapAnalysisResult> {
  const errors: string[] = [];
  const ctx: AnalyzeContext = {
    whiteEntries: new Set(),
    blackEntries: new Set(),
  };
  for (const r of userRepertoires) {
    for (const f of r.fens) {
      (r.color === "white" ? ctx.whiteEntries : ctx.blackEntries).add(
        fenKey(f),
      );
    }
  }

  const fetchedGames: FetchedGame[] = [];

  if (filters.chesscomUsername) {
    const res = await fetchChesscom(
      filters.chesscomUsername,
      filters.maxGames,
    );
    fetchedGames.push(...res.games);
    errors.push(...res.errors);
  }
  if (filters.lichessUsername) {
    const res = await fetchLichess(
      filters.lichessUsername,
      filters.maxGames,
      filters.timeClasses,
    );
    fetchedGames.push(...res.games);
    errors.push(...res.errors);
  }

  // Apply post-fetch filters (chess.com doesn't filter server-side and
  // lichess's perfType filter is best-effort; both APIs return all games
  // for the user otherwise).
  const filtered = fetchedGames.filter((g) => {
    if (
      filters.timeClasses &&
      filters.timeClasses.length > 0 &&
      !filters.timeClasses.includes(g.timeClass)
    ) {
      return false;
    }
    if (filters.minRating != null || filters.maxRating != null) {
      const usernameLower = (
        filters.chesscomUsername ?? filters.lichessUsername ?? ""
      ).toLowerCase();
      const userIsWhite =
        g.whiteUsername.toLowerCase() === usernameLower;
      const myRating = userIsWhite ? g.whiteRating : g.blackRating;
      if (myRating == null) return false;
      if (filters.minRating != null && myRating < filters.minRating)
        return false;
      if (filters.maxRating != null && myRating > filters.maxRating)
        return false;
    }
    return true;
  });

  // Aggregate gaps by side + position.
  const whiteAgg = new Map<string, AggregatedGap>();
  const blackAgg = new Map<string, AggregatedGap>();
  let analyzedCount = 0;

  for (const game of filtered) {
    let touched = false;
    const sides: ("white" | "black")[] =
      filters.color === "both"
        ? ["white", "black"]
        : [filters.color];

    for (const side of sides) {
      const username =
        game.platform === "chesscom"
          ? filters.chesscomUsername
          : filters.lichessUsername;
      if (!username) continue;
      const gap = findFirstGap(game, side, username, ctx);
      if (!gap) continue;
      touched = true;
      const map = side === "white" ? whiteAgg : blackAgg;
      const key = fenKey(gap.positionFen);
      const existing = map.get(key);
      if (existing) {
        existing.occurrences += 1;
        if (gap.gameUrl && existing.sampleGameUrls.length < 5) {
          existing.sampleGameUrls.push(gap.gameUrl);
        }
      } else {
        map.set(key, {
          positionFen: gap.positionFen,
          opponentMove: gap.opponentMove,
          precedingSans: gap.precedingSans,
          occurrences: 1,
          sampleGameUrls: gap.gameUrl ? [gap.gameUrl] : [],
        });
      }
    }
    if (touched) analyzedCount += 1;
  }

  const sortDesc = (a: AggregatedGap, b: AggregatedGap) =>
    b.occurrences - a.occurrences ||
    a.precedingSans.length - b.precedingSans.length;

  return {
    gamesFetched: fetchedGames.length,
    gamesAnalyzed: filtered.length,
    whiteGaps: Array.from(whiteAgg.values()).sort(sortDesc),
    blackGaps: Array.from(blackAgg.values()).sort(sortDesc),
    errors,
  };
}
