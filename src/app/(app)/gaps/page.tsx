import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import GapAnalysisClient from "@/components/GapAnalysisClient";

export default async function GapsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return <div>Please sign in to access the gap analysis</div>;
  }
  return <GapAnalysisClient />;
}
