import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lookupOpening } from "@/lib/openings";
import { buildRepertoireTree } from "@/lib/repertoireTree";
import TrainingClient from "@/components/TrainingClient";

interface TrainingPageProps {
  searchParams: Promise<{
    color?: string;
    opening?: string;
    line?: string;
    mode?: string;
  }>;
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

  // We need ALL of a repertoire's entries (including first-move ones) to
  // reconstruct the move tree — opening-name lookup relies on the SAN path
  // from the standard starting position to each card, and the SAN of the
  // parent first-move entry is required to compute the path for its
  // children. The first-move entries are filtered out *after* the tree is
  // built (see below) so they don't appear as training cards, but their
  // SAN contribution is preserved.
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

      const entries = ordered.map((entry) => {
        const sans = byEntryId.get(entry.id)?.sanMoves ?? [];
        const match = lookupOpening(sans);
        return {
          ...entry,
          openingName: match?.name ?? null,
          openingEco: match?.eco ?? null,
        };
      });

      return { ...r, entries };
    }),
  };

  return <TrainingClient user={enriched} mode={mode} />;
}
