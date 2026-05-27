import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import DrillSessionClient from "@/components/DrillSessionClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DrillSessionPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return <div>Please sign in to access this drill</div>;
  }
  const { id } = await params;
  return <DrillSessionClient drillId={id} />;
}
