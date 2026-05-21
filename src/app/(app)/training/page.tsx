import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lookupOpening, sanPathToFen } from "@/lib/openings";
import { Chess } from "chess.js";
import { buildRepertoireTree } from "@/lib/repertoireTree";
import TrainingClient from "@/components/TrainingClient";

interface TrainingPageProps {
  searchParams: Promise<{
    color?: string;
    opening?: string;
    line?: string;
    family?: string;
    mode?: string;
  }>;
}

// Match an entry's full opening name to the user-selected family. We treat
// the substring before the first ":" as the family, mirroring the grouping
// rule in LineTree.familyOf so the in-app sidebar grouping and the
// "Practice this opening" filter agree.
function familyOf(openingName: string | null): string | null {
  if (!openingName) return null;
  const colon = openingName.indexOf(":");
  return colon === -1 ? openingName : openingName.slice(0, colon).trim();
}

// Compare FENs ignoring the halfmove clock and fullmove number — those
// fields can drift between the repertoire-tree replay and the entry's
// stored FEN even when the actual position is identical.
function fenKey(fen: string | null | undefined): string {
  if (!fen) return "";
  return fen.split(" ").slice(0, 4).join(" ");
}

// Try to replay a SAN sequence from a given start FEN. Returns the prefix
// of moves that brings us to `targetFen`, or null if we never reach it.
function replayToTarget(
  startFen: string | undefined,
  sans: string[],
  targetFen: string,
): string[] | null {
  try {
    const g = startFen ? new Chess(startFen) : new Chess();
    const targetKey = fenKey(targetFen);
    if (fenKey(g.fen()) === targetKey) return [];
    const played: string[] = [];
    for (const san of sans) {
      const move = g.move(san);
      if (!move) return null;
      played.push(san);
      if (fenKey(g.fen()) === targetKey) return played;
    }
  } catch {
    return null;
  }
  return null;
}

// Best-effort prior moves anchored at the standard starting position.
//
// Strategy:
//   1. Replay the repertoire tree's sans from the standard start. If we
//      reach the entry's FEN, that's our answer (covers entries whose
//      tree is rooted at the start).
//   2. Otherwise, look up the ECO mainline path to the tree's rootFen and
//      prepend it. This handles entries whose tree root is mid-game
//      (no ancestor entry at the standard start) but the root sits on a
//      known opening line.
//   3. As a final fallback, try ECO direct lookup of the entry's own FEN.
//   4. If nothing anchors, return [] and the client hides navigation.
function deriveAnchoredPriorMoves(
  sansFromTree: string[],
  positionFen: string,
  rootFen: string,
): string[] {
  // 1. Tree sans replay from standard start
  const fromStart = replayToTarget(undefined, sansFromTree, positionFen);
  if (fromStart) return fromStart;

  // 2. ECO path to tree root, then tree sans on top
  const ecoToRoot = sanPathToFen(rootFen);
  if (ecoToRoot && ecoToRoot.length > 0) {
    const combined = [...ecoToRoot, ...sansFromTree];
    const fromStartWithEco = replayToTarget(undefined, combined, positionFen);
    if (fromStartWithEco) return fromStartWithEco;
  }

  // 3. ECO direct lookup of the entry's own FEN
  const ecoDirect = sanPathToFen(positionFen);
  if (ecoDirect) return ecoDirect;

  return [];
}

export default async function TrainingPage({
  searchParams,
}: TrainingPageProps) {
  const session = await getServerSession(authOptions);
  const params = await searchParams;

  if (!session?.user?.email) {
    return <div>Please sign in to access training</div>;
  }

  // Determine mode: "review" (due cards, affects SRS) or "practice" (all cards, no SRS)
  const mode = params.mode === "practice" ? "practice" : "review";

  // Determine color filter (if any)
  const colorFilter =
    params.color === "white" || params.color === "black" ? params.color : null;
  const familyFilter = params.family?.trim() ? params.family.trim() : null;

  // We need ALL of a repertoire's entries (not just due ones) to reconstruct
  // the move tree — opening-name lookup relies on the SAN path from the
  // standard starting position to each card, which we can only derive by
  // walking the tree. Due-filtering is applied after enrichment.
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      repertoires: {
        where: colorFilter
          ? { color: colorFilter === "white" ? "White" : "Black" }
          : undefined,
        select: {
          id: true,
          color: true,
          entries: {
            where: { position: { fullmoveNumber: { gt: 1 } } },
            orderBy: { nextReviewDate: "asc" },
            select: {
              id: true,
              expectedMove: true,
              interval: true,
              easeFactor: true,
              repetitions: true,
              nextReviewDate: true,
              phase: true,
              learningStepIndex: true,
              position: { select: { id: true, fen: true } },
            },
          },
        },
      },
    },
  });

  if (!user) {
    return <div>User not found</div>;
  }

  const now = new Date();
  const enriched = {
    ...user,
    repertoires: user.repertoires.map((r) => {
      const { roots, byEntryId } = buildRepertoireTree(r.entries, r.color);
      const dueOnly = mode === "review";
      const entriesById = new Map(r.entries.map((e) => [e.id, e]));

      // Both modes traverse each opening from its root downward (DFS preorder)
      // so the user always drills lines from move 1, not in random SRS order.
      // Review mode then keeps only entries currently due for review;
      // practice mode keeps them all.
      const ordered: typeof r.entries = [];
      const visited = new Set<string>();
      const walk = (node: (typeof roots)[number]) => {
        if (visited.has(node.id)) return;
        visited.add(node.id);
        const entry = entriesById.get(node.id);
        if (entry) {
          if (!dueOnly || entry.nextReviewDate <= now) ordered.push(entry);
        }
        for (const c of node.children) walk(c);
      };
      for (const root of roots) walk(root);
      // Defensive sweep: any entry not reachable from a root still gets shown
      // (filtered by due if applicable) so we never silently drop a card.
      for (const e of r.entries) {
        if (visited.has(e.id)) continue;
        if (!dueOnly || e.nextReviewDate <= now) ordered.push(e);
      }

      const enrichedEntries = ordered.map((entry) => {
        const node = byEntryId.get(entry.id);
        const sans = node?.sanMoves ?? [];
        const rootFen = node?.rootFen ?? entry.position.fen;
        const match = lookupOpening(sans);
        return {
          ...entry,
          openingName: match?.name ?? null,
          openingEco: match?.eco ?? null,
          // Moves leading from the standard starting position to this
          // entry's FEN. We try the repertoire tree's SAN list first, and
          // fall back to ECO-derived prefixes when the tree anchors at a
          // mid-game root (so the tree's sans omit the opening prefix).
          priorMoves: deriveAnchoredPriorMoves(
            sans,
            entry.position.fen,
            rootFen,
          ),
          // In practice mode (Learn All) we still want to update SRS for
          // cards that happen to be due — otherwise a long Learn All session
          // hides them from the regular review queue without ever being
          // counted. The client uses this flag to decide whether to fire a
          // /review write after each card.
          isDue: entry.nextReviewDate <= now,
        };
      });

      // When the user picked "Practice <family>", drop entries whose opening
      // family doesn't match. Applied after enrichment so we have
      // `openingName` to derive the family from.
      const entries = familyFilter
        ? enrichedEntries.filter((e) => familyOf(e.openingName) === familyFilter)
        : enrichedEntries;

      return { ...r, entries };
    }),
  };

  return <TrainingClient user={enriched} mode={mode} />;
}
