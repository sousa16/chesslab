import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import DrillsClient from "@/components/DrillsClient";

export default async function DrillsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return <div>Please sign in to access drills</div>;
  }
  return <DrillsClient />;
}
