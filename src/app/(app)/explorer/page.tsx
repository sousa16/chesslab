import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ExplorerClient from "@/components/ExplorerClient";

export default async function ExplorerPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return <div>Please sign in to access the explorer</div>;
  }

  // Pull every repertoire entry the user owns, both colors. The client
  // builds a fen → expectedMove map locally and looks up each ply as the
  // game is replayed, so we ship the minimal projection: color + positionFen
  // + expectedMove. No SRS columns are needed here.
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      repertoires: {
        select: {
          color: true,
          entries: {
            select: {
              expectedMove: true,
              position: { select: { fen: true } },
            },
          },
        },
      },
    },
  });

  if (!user) {
    return <div>User not found</div>;
  }

  const repertoires = user.repertoires.map((r) => ({
    color: r.color === "White" ? ("white" as const) : ("black" as const),
    entries: r.entries.map((e) => ({
      fen: e.position.fen,
      expectedMove: e.expectedMove,
    })),
  }));

  return <ExplorerClient repertoires={repertoires} />;
}
