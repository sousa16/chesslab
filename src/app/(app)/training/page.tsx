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

  if (!session?.user?.id) {
    return <div>Please sign in to access training</div>;
  }

  // Determine mode: "review" (due cards, affects SRS) or "practice" (all cards, no SRS)
  const mode = params.mode === "practice" ? "practice" : "review";

  // Determine color filter (if any)
  const colorFilter =
    params.color === "white" || params.color === "black" ? params.color : null;
  const familyFilter = params.family?.trim() ? params.family.trim() : null;
  // "Practice this line" passes the leaf entry id; we expand it server-side
  // to the leaf + every ancestor entry on its path (= the moves the user
  // actually plays to reach the leaf).
  const lineLeafId = params.line?.trim() ? params.line.trim() : null;

  const userId = session.user.id;

  // We need ALL of a repertoire's entries (including first-move ones) to
  // reconstruct the move tree — opening-name lookup relies on the SAN path
  // from the standard starting position to each card, and the SAN of the
  // parent first-move entry is required to compute the path for its
  // children. The first-move entries are filtered out *after* the tree is
  // built (see below) so they don't appear as training cards, but their
  // SAN contribution is preserved.
  const repertoiresRaw = await prisma.repertoire.findMany({
    where: {
      userId,
      ...(colorFilter
        ? { color: colorFilter === "white" ? "White" : "Black" }
        : {}),
    },
    select: {
      id: true,
      color: true,
      entries: {
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
          position: {
            select: { id: true, fen: true, fullmoveNumber: true },
          },
        },
      },
    },
  });

  const user = { id: userId, repertoires: repertoiresRaw };

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
      //
      // First-move entries (fullmoveNumber=1) are skipped at display time
      // — they're kept in the tree so child SAN paths include the opener,
      // but the user shouldn't drill "make your first move from the
      // standard starting position" as a flash-card.
      const ordered: typeof r.entries = [];
      const visited = new Set<string>();
      const include = (entry: (typeof r.entries)[number]) => {
        if (entry.position.fullmoveNumber <= 1) return false;
        if (dueOnly && entry.nextReviewDate > now) return false;
        return true;
      };
      const walk = (node: (typeof roots)[number]) => {
        if (visited.has(node.id)) return;
        visited.add(node.id);
        const entry = entriesById.get(node.id);
        if (entry && include(entry)) ordered.push(entry);
        for (const c of node.children) walk(c);
      };
      for (const root of roots) walk(root);
      // Defensive sweep: any entry not reachable from a root still gets shown
      // (filtered the same way) so we never silently drop a card.
      for (const e of r.entries) {
        if (visited.has(e.id)) continue;
        if (include(e)) ordered.push(e);
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
      let entries = familyFilter
        ? enrichedEntries.filter((e) => familyOf(e.openingName) === familyFilter)
        : enrichedEntries;

      // "Practice this line": keep only the entries on the path from any
      // root down to the leaf with id=lineLeafId. We derive the path by
      // building a parent map over `roots` and walking up.
      if (lineLeafId && byEntryId.has(lineLeafId)) {
        const parentOf = new Map<string, string>();
        const buildParentMap = (node: (typeof roots)[number]) => {
          for (const child of node.children) {
            parentOf.set(child.id, node.id);
            buildParentMap(child);
          }
        };
        for (const root of roots) buildParentMap(root);

        const pathIds = new Set<string>([lineLeafId]);
        let cursor: string = lineLeafId;
        while (parentOf.has(cursor)) {
          const pid = parentOf.get(cursor)!;
          pathIds.add(pid);
          cursor = pid;
        }
        entries = entries.filter((e) => pathIds.has(e.id));
      }

      return { ...r, entries };
    }),
  };

  return <TrainingClient user={enriched} mode={mode} />;
}
