import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import TacticsClient from "@/components/TacticsClient";

export default async function TacticsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return <div>Please sign in to access tactics</div>;
  }
  return <TacticsClient />;
}
