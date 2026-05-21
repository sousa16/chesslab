import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lookupOpening } from "@/lib/openings";
import { anchorSansToStart, buildRepertoireTree } from "@/lib/repertoireTree";
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
        // Resolve the canonical line from the standard starting position
        // first, then look up the opening name from THAT — using raw tree
        // sans would misname mid-game-rooted entries (e.g., a Caro-Kann
        // Advance entry would resolve to "Queen's Pawn Game" because its
        // sans start at "d4 d5").
        const priorMoves = anchorSansToStart(sans, entry.position.fen, rootFen);
        const lookupSans = priorMoves.length > 0 ? priorMoves : sans;
        const match = lookupOpening(lookupSans);
        return {
          ...entry,
          openingName: match?.name ?? null,
          openingEco: match?.eco ?? null,
          priorMoves,
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
