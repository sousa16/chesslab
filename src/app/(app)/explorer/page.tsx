import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ExplorerClient from "@/components/ExplorerClient";

export default async function ExplorerPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return <div>Please sign in to access the explorer</div>;
  }

  // Pull every repertoire entry the user owns, both colors. The client
  // builds a fen → expectedMove map locally and looks up each ply as the
  // game is replayed, so we ship the minimal projection: color + positionFen
  // + expectedMove. No SRS columns are needed here.
  const repertoiresRaw = await prisma.repertoire.findMany({
    where: { userId: session.user.id },
    select: {
      color: true,
      entries: {
        select: {
          expectedMove: true,
          position: { select: { fen: true } },
        },
      },
    },
  });

  const repertoires = repertoiresRaw.map((r) => ({
    color: r.color === "White" ? ("white" as const) : ("black" as const),
    entries: r.entries.map((e) => ({
      fen: e.position.fen,
      expectedMove: e.expectedMove,
    })),
  }));

  return <ExplorerClient repertoires={repertoires} />;
}
