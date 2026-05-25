# Chesslab

A personal chess training app for serious improvement. Build your opening repertoire by color, drill it with spaced repetition, train tactics from a 10k+ Lichess puzzle pool, and find the holes in your prep by replaying your real games against your saved lines.

Live at [chesslab.club](https://chesslab.club).

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

- Pulls puzzles from a precomputed Lichess dump, gated by user-configurable **rating band** + **categories** (mate, fork, pin, endgame, etc.).
- SM-2 reviews shared with the opening engine, so the home dashboard's daily counters cover both.
- **Prefetches the next puzzle** as soon as the current one lands; rating a card is instant, no spinner between cards.

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

- **Next.js 16** (App Router, RSC, server actions)
- **React 19** (`use()` for RSC-streamed promises)
- **TypeScript** end-to-end
- **PostgreSQL + Prisma 6**
- **NextAuth.js 4** (Google + Credentials providers)
- **chess.js** for move validation + replay; **react-chessboard 5** for the UI
- **Tailwind CSS 4** + **Radix UI** primitives
- **Resend** for transactional email
- **Jest + React Testing Library** for tests

## Getting started

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

### Required environment variables

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

## Project structure

```
src/
  app/
    (app)/                  Authenticated routes — home, training, tactics,
                            build/[color], explorer, gaps, stats, settings
    (auth)/auth/            Sign-in / sign-up page
    reset-password/         Password reset landing page
    api/
      auth/[...nextauth]/   NextAuth handlers
      repertoires/          GET /api/repertoires (ETag-cached tree)
      repertoire-entries/   PATCH/DELETE, save-line, family delete, review
      puzzles/              next + review
      puzzle-prefs/         user puzzle config
      training-stats/       SQL-aggregated dashboard counts
      gap-analysis/         NDJSON-streaming game analyzer
      openings/lookup/      ECO name lookup
      user/                 update-profile, update-settings, change-password, delete-account
      cron/                 daily reminder email
  components/               Board, BuildPanel, TrainingClient, TacticsClient,
                            RepertoirePanel, HomePanel, GapAnalysisClient,
                            ExplorerClient, StatsClient, plus shared UI
  contexts/                 Settings, Theme
  lib/
    auth.ts                 NextAuth config
    chessMoves.ts           Pure chess.js helpers — safe to import from client
    email.ts                Resend wrapper + templates
    gapAnalysis.ts          Game pull + sub-line aggregator
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
  middleware.ts             (removed — merged into proxy.ts under Next 16)
__tests__/                  Jest suites (node) + jsdom suites for components
prisma/schema.prisma        DB schema
scripts/                    seed-puzzles, precompute-eco
data/                       Puzzle + ECO source data
```

## Architecture notes

- **Route protection** lives in [src/proxy.ts](src/proxy.ts). It dispatches by path prefix: `/api/*` goes through IP rate limits (three buckets: sensitive auth flows, write paths, generic API), everything else goes through the NextAuth JWT gate (redirects signed-in users away from `/`, signed-out users away from protected pages).

- **Caching strategy**
  - `/api/repertoires` and `/api/training-stats` return an ETag keyed on `(maxUpdatedAt, count)`; both `HomePanel` and `RepertoirePanel` send `If-None-Match` on subsequent fetches so revisits short-circuit to 304.
  - `/stats` and `/training` cache the expensive per-entry opening-name enrichment via `next/cache`'s `unstable_cache`, keyed on the user's latest entry update timestamp. Writes naturally invalidate.
  - Home dashboard training stats are streamed via React 19 `use()` on the RSC payload, with a module-level cache so client-side nav is instant.

- **isLeaf denormalization** — leaf status is recomputed after every save / delete via `repertoireLeaves.ts` and the Next.js `after()` deferred-work API, so the home dashboard's "lines" counter is a single SQL aggregate.

- **Save-line race** — `BuildClient` increments a pending-save counter in `savesPending.ts`; `RepertoirePanel` waits for that counter to drain before its first fetch, so a panel that mounts faster than the save POST still sees the new line.

- **chess.js / Prisma bundle isolation** — `convertSanToUci` and other client-needed helpers live in [src/lib/chessMoves.ts](src/lib/chessMoves.ts) (chess.js only). The prisma-coupled `src/lib/repertoire.ts` re-exports them for server use but client components import directly from `chessMoves` to keep prisma out of their bundle.

## Scripts

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

## Testing

The suite covers API routes, core libs, and key client components. Two Jest configs:

- [jest.config.js](jest.config.js) — node env, picks up `__tests__/**/*.test.ts` (routes + libs)
- [jest-client.config.js](jest-client.config.js) — jsdom env, picks up `__tests__/**/*.test.tsx` (components)

`npm test` runs both. See [`__tests__/`](__tests__/) for fixtures and patterns; most route tests mock `next-auth/next` + `@/lib/prisma`, lib tests use real `chess.js` and a mocked `fetch`, component tests stub `react-chessboard` and `next/navigation`.

## License

Licensed under the MIT License — see [LICENSE](LICENSE).
