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
            where: { position: { NOT: { fen: { endsWith: " 1" } } } },
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
      const { byEntryId } = buildRepertoireTree(r.entries, r.color);
      const dueOnly = mode === "review";

      const entries = r.entries
        .filter((e) => !dueOnly || e.nextReviewDate <= now)
        .map((entry) => {
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
