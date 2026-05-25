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
  // SAN moves played AFTER the gap position in this game, in order.
  // Capped at CONTINUATION_DEPTH plies. First entry is what the user
  // improvised; subsequent entries alternate opponent / user. Used to
  // bucket sub-lines on aggregation so the UI can show "here's what
  // your opponents pushed you into" rather than just one flat count.
  continuationSans: string[];
  gameUrl?: string;
}

/**
 * One sub-line that follows the gap position, with how often it appeared.
 * The bucket key is the exact SAN prefix; the UI uses these to show the
 * user "in 7 of your 12 1...c5 games you saw 2.Nf3 d6 3.d4 cxd4 next" etc.
 */
export interface GapContinuation {
  sans: string[];
  count: number;
  sampleGameUrls: string[];
}

export interface AggregatedGap {
  positionFen: string;
  opponentMove: string | null;
  precedingSans: string[];
  occurrences: number;
  sampleGameUrls: string[];
  // Top continuations following this gap, sorted by count desc. Capped
  // at MAX_CONTINUATIONS_PER_GAP so a noisy bucket doesn't ship 50
  // distinct sub-lines back to the UI.
  continuations: GapContinuation[];
}

// How many plies past the gap position to capture per game. 4 = two full
// moves, enough to identify the line the opponent is pushing you into
// without exploding the bucket cardinality.
const CONTINUATION_DEPTH = 4;
// We render at most this many sub-lines per gap. Long-tail moves still
// roll up into the parent gap's `occurrences`, just not as a row of
// their own.
const MAX_CONTINUATIONS_PER_GAP = 5;

export interface GapAnalysisResult {
  gamesFetched: number;
  gamesAnalyzed: number;
  whiteGaps: AggregatedGap[];
  blackGaps: AggregatedGap[];
  errors: string[];
}

/**
 * Progress events emitted by runGapAnalysis as it works. The route
 * handler turns these into NDJSON lines so the client can drive a
 * real progress bar. Phases are coarse on purpose — we want visible
 * motion, not microsecond accuracy.
 */
export type GapProgressEvent =
  | { type: "fetching"; platform: "chesscom" | "lichess" }
  | { type: "fetched"; platform: "chesscom" | "lichess"; games: number }
  | { type: "analyzing"; total: number }
  | { type: "analysis-progress"; processed: number; total: number };

export interface RunGapAnalysisOptions {
  onProgress?: (event: GapProgressEvent) => void;
  // When aborted mid-flight we throw a DOMException with name "AbortError",
  // matching the convention used by `fetch`.
  signal?: AbortSignal;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Gap analysis aborted", "AbortError");
  }
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

// Fetch up to CHESSCOM_CONCURRENCY months in parallel. The old code did one
// monthRes round-trip at a time which dominated wall time for active users
// with many archives. The cap keeps us well below chess.com's per-host
// throttle (which is enforced per-IP for serverless) and bounds memory.
const CHESSCOM_CONCURRENCY = 4;

interface ParsedMonth {
  games: FetchedGame[];
}

function parseChesscomMonth(month: ChesscomGamesResponse): ParsedMonth {
  const games: FetchedGame[] = [];
  for (const g of (month.games ?? []).slice().reverse()) {
    const tc = g.time_class ? normalizeChesscomTimeClass(g.time_class) : null;
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
  return { games };
}

async function fetchChesscom(
  username: string,
  max: number,
  signal: AbortSignal | undefined,
): Promise<{ games: FetchedGame[]; errors: string[] }> {
  const errors: string[] = [];
  const games: FetchedGame[] = [];
  try {
    const archRes = await fetch(
      `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`,
      { headers: { "User-Agent": "chesslab-gap-analysis" }, signal },
    );
    if (!archRes.ok) {
      errors.push(`chess.com archives lookup failed: ${archRes.status}`);
      return { games, errors };
    }
    const arch = (await archRes.json()) as ChesscomArchive;
    // Newest first — we stop the moment we have enough games.
    const monthUrls = [...arch.archives].reverse();

    for (let i = 0; i < monthUrls.length && games.length < max; i += CHESSCOM_CONCURRENCY) {
      throwIfAborted(signal);
      const batch = monthUrls.slice(i, i + CHESSCOM_CONCURRENCY);
      // Fetch the batch concurrently. allSettled so a single 5xx doesn't
      // poison the whole window — we just skip that month. The shared
      // signal aborts every in-flight request the moment the caller cancels.
      const settled = await Promise.allSettled(
        batch.map((url) =>
          fetch(url, {
            headers: { "User-Agent": "chesslab-gap-analysis" },
            signal,
          }).then(async (res) => {
            if (!res.ok) return null;
            return (await res.json()) as ChesscomGamesResponse;
          }),
        ),
      );

      // Preserve the newest-first ordering so the `max` cap consistently
      // returns the most recent games. The batch was built newest-first;
      // walk it in that same order when draining results.
      for (const result of settled) {
        if (games.length >= max) break;
        if (result.status !== "fulfilled" || !result.value) continue;
        const { games: monthGames } = parseChesscomMonth(result.value);
        for (const g of monthGames) {
          if (games.length >= max) break;
          games.push(g);
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
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
  signal: AbortSignal | undefined,
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
      signal,
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
    if (err instanceof Error && err.name === "AbortError") throw err;
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

        // Capture up to CONTINUATION_DEPTH plies following the gap
        // position. These are the moves the user actually improvised
        // plus the opponent's responses. Sub-line aggregation uses
        // this to show "in N games, your opponents pushed you into X".
        // We use chess.js to validate each SAN as we walk forward so a
        // typo-corrupted PGN can't leak garbage into the continuation.
        const continuationSans: string[] = [];
        const probe = new Chess(c.fen());
        for (
          let j = i;
          j < game.sanMoves.length &&
          continuationSans.length < CONTINUATION_DEPTH;
          j++
        ) {
          const m = probe.move(game.sanMoves[j]);
          if (!m) break;
          continuationSans.push(m.san);
        }

        return {
          positionFen: c.fen(),
          opponentMove,
          precedingSans: sansPlayed.slice(),
          continuationSans,
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
 *
 * Optional `options.onProgress` is fired at phase boundaries; the route
 * handler turns those into NDJSON lines for the client's progress bar.
 * Optional `options.signal` is honored by every upstream fetch and by
 * the analysis loop — a client `AbortController.abort()` propagates all
 * the way to the chess.com/lichess sockets.
 */
export async function runGapAnalysis(
  filters: GapFilters,
  userRepertoires: {
    color: "white" | "black";
    fens: string[]; // FENs where the user has at least one saved response
  }[],
  options: RunGapAnalysisOptions = {},
): Promise<GapAnalysisResult> {
  const { onProgress, signal } = options;
  // Surface a pre-aborted signal immediately rather than relying on the
  // first internal checkpoint — that one might be skipped on small
  // inputs (no archives, no games to analyze).
  throwIfAborted(signal);
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
    onProgress?.({ type: "fetching", platform: "chesscom" });
    const res = await fetchChesscom(
      filters.chesscomUsername,
      filters.maxGames,
      signal,
    );
    fetchedGames.push(...res.games);
    errors.push(...res.errors);
    onProgress?.({
      type: "fetched",
      platform: "chesscom",
      games: res.games.length,
    });
  }
  if (filters.lichessUsername) {
    throwIfAborted(signal);
    onProgress?.({ type: "fetching", platform: "lichess" });
    const res = await fetchLichess(
      filters.lichessUsername,
      filters.maxGames,
      filters.timeClasses,
      signal,
    );
    fetchedGames.push(...res.games);
    errors.push(...res.errors);
    onProgress?.({
      type: "fetched",
      platform: "lichess",
      games: res.games.length,
    });
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

  onProgress?.({ type: "analyzing", total: filtered.length });

  // Internal aggregation bucket — carries an extra continuation counter
  // that we don't expose in the public AggregatedGap. Each entry in
  // `contMap` is keyed on the SAN-prefix string (e.g. "Nf3 d6 d4 cxd4")
  // and counts how many games went down that exact sub-line.
  interface InternalGap {
    positionFen: string;
    opponentMove: string | null;
    precedingSans: string[];
    occurrences: number;
    sampleGameUrls: string[];
    contMap: Map<
      string,
      { sans: string[]; count: number; sampleGameUrls: string[] }
    >;
  }

  const whiteAgg = new Map<string, InternalGap>();
  const blackAgg = new Map<string, InternalGap>();
  let analyzedCount = 0;

  // Fire a progress event every ~5% of the total (capped at 50 games per
  // tick) so the bar moves visibly without flooding the stream.
  const PROGRESS_TICK = Math.max(1, Math.min(50, Math.ceil(filtered.length / 20)));
  let processedSinceTick = 0;

  for (let i = 0; i < filtered.length; i++) {
    if (i % 20 === 0) throwIfAborted(signal);
    const game = filtered[i];
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
      const bucket =
        existing ??
        ({
          positionFen: gap.positionFen,
          opponentMove: gap.opponentMove,
          precedingSans: gap.precedingSans,
          occurrences: 0,
          sampleGameUrls: [],
          contMap: new Map(),
        } as InternalGap);
      if (!existing) map.set(key, bucket);

      bucket.occurrences += 1;
      if (gap.gameUrl && bucket.sampleGameUrls.length < 5) {
        bucket.sampleGameUrls.push(gap.gameUrl);
      }

      // Bucket the continuation. Empty continuation (game ended right
      // at the gap position) gets a sentinel key so we still record it
      // but it'll just show as "(no further moves recorded)" in the UI.
      const contKey = gap.continuationSans.join(" ");
      const contExisting = bucket.contMap.get(contKey);
      if (contExisting) {
        contExisting.count += 1;
        if (gap.gameUrl && contExisting.sampleGameUrls.length < 3) {
          contExisting.sampleGameUrls.push(gap.gameUrl);
        }
      } else {
        bucket.contMap.set(contKey, {
          sans: gap.continuationSans.slice(),
          count: 1,
          sampleGameUrls: gap.gameUrl ? [gap.gameUrl] : [],
        });
      }
    }
    if (touched) analyzedCount += 1;
    processedSinceTick++;
    if (processedSinceTick >= PROGRESS_TICK) {
      onProgress?.({
        type: "analysis-progress",
        processed: i + 1,
        total: filtered.length,
      });
      processedSinceTick = 0;
    }
  }
  // Final 100% tick — the loop's modular emitter usually undershoots a few.
  if (filtered.length > 0) {
    onProgress?.({
      type: "analysis-progress",
      processed: filtered.length,
      total: filtered.length,
    });
  }

  void analyzedCount; // already reflected in `filtered.length`

  const sortDesc = (a: AggregatedGap, b: AggregatedGap) =>
    b.occurrences - a.occurrences ||
    a.precedingSans.length - b.precedingSans.length;

  // Project the internal buckets into the public shape: collapse the
  // continuation map into a sorted, capped list and drop the bookkeeping
  // fields the client doesn't need.
  function project(internal: InternalGap): AggregatedGap {
    const continuations: GapContinuation[] = Array.from(
      internal.contMap.values(),
    )
      .sort(
        (a, b) =>
          b.count - a.count ||
          // Tie-break: shorter sub-lines first so the most general
          // bucket wins ties (less noise in the UI).
          a.sans.length - b.sans.length,
      )
      .slice(0, MAX_CONTINUATIONS_PER_GAP);
    return {
      positionFen: internal.positionFen,
      opponentMove: internal.opponentMove,
      precedingSans: internal.precedingSans,
      occurrences: internal.occurrences,
      sampleGameUrls: internal.sampleGameUrls,
      continuations,
    };
  }

  return {
    gamesFetched: fetchedGames.length,
    gamesAnalyzed: filtered.length,
    whiteGaps: Array.from(whiteAgg.values()).map(project).sort(sortDesc),
    blackGaps: Array.from(blackAgg.values()).map(project).sort(sortDesc),
    errors,
  };
}
