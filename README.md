# Chesslab

A personal chess training app for serious improvement. Build your opening repertoire by color, drill it with spaced repetition, train tactics from a 10k+ Lichess puzzle pool, and find the holes in your prep by replaying your real games against your saved lines.

**Live at [chesslab.club](https://chesslab.club).** Sign up with email or Google; everything below describes what the deployed app does.

## Features

### Opening repertoire

- **Build** lines on an interactive board, by color. Position dedup means two openings that transpose share their saved state.
- **Tree view** with per-family grouping (Caro-Kann, Sicilian, Queen's Pawn, …). Per-line and per-family delete; deletes cascade through the parents of a line that no longer has any surviving forks.
- **Opening name auto-recognition** via the ECO dataset — the name shown matches the longest opening prefix that fits the line, even when the entry sits mid-game.
- **Explorer** to browse a flat list of every saved position.

### Training (SM-2 spaced repetition)

- **Review mode** drills only due cards.
- **Practice mode** ("Learn All") drills every card in tree order, still records SRS updates for any card that happens to be due.
- **Practice by family** or by single leaf line.
- Per-card recall buttons (`Forgot / Hard / Good / Easy`) tied to keyboard shortcuts `1-4`. `Enter` reveals the answer.
- **Streak + accuracy + daily activity** tracked client-side and persisted server-side.
- **Mid-game-rooted entries** are handled: if the user's saved line is "after 1.e4 c6", the training card displays the full anchored "1.e4 c6 …" line, not just the suffix.

### Tactics

- Pulls puzzles from a precomputed Lichess dump, filtered by user-configurable **categories** (Mates / Motifs / Middlegame / Endgame).
- **Auto-detect on the board** — play the move; correct → opponent's reply auto-plays with a brief green ring, wrong → red ring and the drag is rejected. No "show answer + self-rate" step; SRS rating is derived from attempts (1st try clean → easy, 1 wrong → effort, 2+ → partial, gave up → forgot).
- **Adaptive difficulty** targeting ~85% success — the "Eighty Five Percent Rule" (Wilson et al., *Nature Communications* 2019). A per-user, per-motif EWMA controller raises or lowers the rating setpoint after every attempt, so the user is always being challenged without being stuck.
- **Blocked-then-interleaved** by motif (Shea & Morgan contextual-interference effect): `auto` mode drills the user's weakest unlocked motif until 20 attempts at ≥80%, then folds it into the mixed pool. Manual `blocked` / `mixed` modes available behind a settings cog.
- **Promotion picker** anywhere a pawn can reach the last rank — no silent auto-queen in tactics, build, or training.
- **"Review" chip** appears on puzzles served by the SRS due queue so the user knows why an old puzzle is back.
- SM-2 reviews shared with the opening engine, so the home dashboard's daily counters cover both.
- **Prefetches the next puzzle** as soon as the current one lands; the solve-to-next-puzzle transition is ~280ms with no layout shift.
- **Engine analysis after reveal**: an "Analyze" toggle turns the board into a Lichess-style scratchpad. Navigate any position in the solution with the board arrows, drag pieces to branch into your own variation (the promotion picker is wired up here too), and a Stockfish eval (best move + principal variation) updates per position. Built to answer "why wasn't *my* move the right one?" — try the candidate you had in mind, see how the engine refutes it, then snap back to the main line.

### Woodpecker drills (`/tactics/drills`)

- A focused acquisition mode based on the [Woodpecker Method](https://www.qualitychess.co.uk/products/2/335/the_woodpecker_method_by_axel_smith_and_hans_tikkanen/) (Smith & Tikkanen 2018): pick a fixed set of puzzles for a single motif (or mixed), cycle through them 5 times, and the cycle time drops 4–8× as the pattern moves from calculation to recognition.
- Set sizes: 20 (try it out), 50 (standard), 100 (serious). Puzzle selection seeds from the user's per-motif rating so the set sits at the right difficulty.
- On graduation all puzzles enter the SRS in exponential phase at 14d, so the pattern doesn't decay — Woodpecker burns it in, SRS keeps it alive.
- Per-cycle wall time is tracked; the UI shows baseline-vs-current ratio so the speedup curve is visible session over session.

### Gap analysis (`/gaps`)

- Pulls your recent games from **chess.com** and/or **Lichess**, filters by time class + rating, and replays each game in the browser to find the first position where you had no saved response.
- Aggregates by FEN — transpositions collapse into the same bucket.
- **Sub-line depth**: each gap row expands to show the most frequent continuations your opponents played after the gap position. Click "Add line" on a continuation to seed Build with that exact path.
- **Streaming progress + Cancel button** — chess.com archives fetch concurrently in batches, progress bar updates per-batch, and cancel actually aborts the in-flight upstream HTTP calls.

### Stats (`/stats`)

- Per-opening family breakdown: lines saved, mastered %, average ease factor, due-now count, last reviewed.
- Per-puzzle-category and per-rating-band breakdowns.
- Aggregated server-side via `unstable_cache` keyed on the latest entry/review update, so navigations are fast.

### Account

- Email/password (with verification flow via Resend) or Google OAuth.
- Password reset flow (request → time-boxed token → reset).
- Daily reminder email via cron route.
- Account/profile settings + delete-my-account.

## Tech stack

- **Next.js 16** (App Router, RSC, server actions) on Vercel
- **React 19** (`use()` for RSC-streamed promises)
- **TypeScript** end-to-end
- **PostgreSQL + Prisma 6**
- **NextAuth.js 4** (Google + Credentials providers)
- **chess.js** for move validation + replay; **react-chessboard 5** for the UI
- **Stockfish.online** for puzzle-side engine analysis
- **Tailwind CSS 4** + **Radix UI** primitives
- **Resend** for transactional email
- **Jest + React Testing Library** for tests

## Architecture notes

- **Route protection** lives in [src/proxy.ts](src/proxy.ts). It dispatches by path prefix: `/api/*` goes through IP rate limits (three buckets: sensitive auth flows, write paths, generic API), everything else goes through the NextAuth JWT gate (redirects signed-in users away from `/`, signed-out users away from protected pages).

- **Caching strategy**
  - `/api/repertoires` and `/api/training-stats` return an ETag keyed on `(maxUpdatedAt, count)`; both `HomePanel` and `RepertoirePanel` send `If-None-Match` on subsequent fetches so revisits short-circuit to 304.
  - `/stats` and `/training` cache the expensive per-entry opening-name enrichment via `next/cache`'s `unstable_cache`, keyed on the user's latest entry update timestamp. Writes naturally invalidate.
  - Home dashboard training stats are streamed via React 19 `use()` on the RSC payload, with a module-level cache so client-side nav is instant.

- **isLeaf denormalization** — leaf status is recomputed after every save / delete via `repertoireLeaves.ts` and the Next.js `after()` deferred-work API, so the home dashboard's "lines" counter is a single SQL aggregate.

- **Save-line race** — `BuildClient` increments a pending-save counter in `savesPending.ts`; `RepertoirePanel` waits for that counter to drain before its first fetch, so a panel that mounts faster than the save POST still sees the new line.

- **chess.js / Prisma bundle isolation** — `convertSanToUci` and other client-needed helpers live in [src/lib/chessMoves.ts](src/lib/chessMoves.ts) (chess.js only). The prisma-coupled `src/lib/repertoire.ts` re-exports them for server use but client components import directly from `chessMoves` to keep prisma out of their bundle.

- **Engine proxy** — `/api/analysis` is a thin auth-gated server route in front of stockfish.online. Going through the proxy keeps the upstream URL off the client, normalizes their UCI engine line into a clean JSON shape, and lets us swap engines later without touching the UI.

## License

Licensed under the MIT License — see [LICENSE](LICENSE).

---

## Development

Sections below are for working on chesslab locally.

### Prerequisites

- Node.js 20.9+ (Next.js 16 requirement)
- A Postgres instance
- A Resend API key (for email verification + password reset)
- Google OAuth credentials (optional, for the Google sign-in button)

### Setup

```bash
git clone https://github.com/sousa16/chesslab
cd chesslab
npm install        # also runs `prisma generate` via postinstall
cp .env.example .env.local   # fill in DATABASE_URL, NEXTAUTH_SECRET, etc.
npx prisma migrate deploy
npm run seed:puzzles  # one-time, populates the puzzle table from data/
npm run dev
```

### Environment variables

```
DATABASE_URL=postgres://...
NEXTAUTH_SECRET=<random 32+ bytes>
NEXTAUTH_URL=http://localhost:3000
RESEND_API_KEY=<your resend key>
EMAIL_FROM=...
# Optional (Google sign-in):
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# Optional (cron):
CRON_SECRET=<random>
```

### Scripts

```bash
npm run dev              # next dev (Turbopack)
npm run build            # next build
npm start                # next start
npm run lint             # eslint
npm test                 # full jest suite (node + jsdom configs)
npm run test:watch       # watch mode
npm run test:coverage    # coverage report
npm run seed:puzzles     # one-time puzzle table seed
npm run precompute:eco   # rebuild the ECO precomputed dataset
```

### Project structure

```
src/
  app/
    (app)/                  Authenticated routes — home, training, tactics
                            (+ tactics/drills), build/[color], explorer,
                            gaps, stats, settings
    (auth)/auth/            Sign-in / sign-up page
    reset-password/         Password reset landing page
    api/
      auth/[...nextauth]/   NextAuth handlers
      repertoires/          GET /api/repertoires (ETag-cached tree)
      repertoire-entries/   PATCH/DELETE, save-line, family delete, review
      puzzles/              next + review + motif-progress
      puzzle-prefs/         user puzzle config (adaptive controller state)
      drills/               Woodpecker drill sessions + per-attempt recording
      training-stats/       SQL-aggregated dashboard counts
      gap-analysis/         NDJSON-streaming game analyzer
      analysis/             Stockfish proxy for puzzle-side engine analysis
      openings/lookup/      ECO name lookup
      user/                 update-profile, update-settings, change-password, delete-account
      cron/                 daily reminder email
  components/               Board, BuildPanel, TrainingClient, TacticsClient,
                            DrillsClient, DrillSessionClient, PuzzleBoard,
                            PromotionPicker (shared overlay), RepertoirePanel,
                            HomePanel, GapAnalysisClient, ExplorerClient,
                            StatsClient, plus shared UI
  contexts/                 Settings, Theme
  lib/
    adaptiveRating.ts       EWMA controller targeting 85% success (Wilson et al. 2019)
    auth.ts                 NextAuth config
    chessMoves.ts           Pure chess.js helpers — safe to import from client
    drillSelection.ts       Picks the puzzle set for a Woodpecker drill
    email.ts                Resend wrapper + templates
    gapAnalysis.ts          Game pull + sub-line aggregator
    motifs.ts               Canonical tactical motif taxonomy
    openings.ts             ECO lookup over precomputed dataset
    prisma.ts               Singleton Prisma client
    puzzleCategories.ts     Puzzle category whitelist
    rateLimit.ts            In-memory IP token bucket used by proxy.ts
    repertoire.ts           save-line, repertoire DB helpers (prisma)
    repertoireLeaves.ts     isLeaf denormalization
    repertoireTree.ts       Tree-build + SAN anchoring
    savesPending.ts         Save-event bus
    sm2.ts                  SM-2 scheduler (shared opening + tactics)
    statsCache.ts           Module-level cache for the home stats card
    statsPageData.ts        unstable_cache aggregation for /stats
    trainingEnrichment.ts   unstable_cache for /training opening enrichment
    trainingStats.ts        SQL-aggregated home dashboard data
  proxy.ts                  Next 16 proxy: API rate limits + auth gate
__tests__/                  Jest suites (node) + jsdom suites for components
prisma/schema.prisma        DB schema
scripts/                    seed-puzzles, precompute-eco
data/                       Puzzle + ECO source data
```

### Testing

Two Jest configs:

- [jest.config.js](jest.config.js) — node env, picks up `__tests__/**/*.test.ts` (routes + libs)
- [jest-client.config.js](jest-client.config.js) — jsdom env, picks up `__tests__/**/*.test.tsx` (components)

`npm test` runs both. Most route tests mock `next-auth/next` + `@/lib/prisma`, lib tests use real `chess.js` and a mocked `fetch`, component tests stub `react-chessboard` and `next/navigation`.
