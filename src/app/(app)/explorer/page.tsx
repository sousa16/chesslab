import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getCachedExplorerEntries } from "@/lib/repertoireTreeCache";
import ExplorerClient from "@/components/ExplorerClient";

export default async function ExplorerPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return <div>Please sign in to access the explorer</div>;
  }

  // Cached projection keyed on structure version (max createdAt + count
  // per color) — SRS review writes don't bust it, only create/delete
  // do. Saves a per-nav prisma roundtrip + serialization for users with
  // hundreds of saved entries.
  const cached = await getCachedExplorerEntries(session.user.id);
  const repertoires = [
    { color: "white" as const, entries: cached.white },
    { color: "black" as const, entries: cached.black },
  ];

  return <ExplorerClient repertoires={repertoires} />;
}
