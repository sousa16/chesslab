import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getStatsPageData } from "@/lib/statsPageData";
import StatsClient from "@/components/StatsClient";

export default async function StatsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return <div>Please sign in to view stats</div>;
  }

  const {
    openings,
    tacticsOverall,
    tacticsCategories,
    tacticsAdaptive,
    tacticsMotifs,
    tacticsDrills,
  } = await getStatsPageData(session.user.id);

  return (
    <StatsClient
      openings={openings}
      tacticsOverall={tacticsOverall}
      tacticsCategories={tacticsCategories}
      tacticsAdaptive={tacticsAdaptive}
      tacticsMotifs={tacticsMotifs}
      tacticsDrills={tacticsDrills}
    />
  );
}
