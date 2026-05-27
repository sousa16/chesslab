/**
 * Per-motif progress snapshot for the tactics sidebar.
 *
 * Returns every canonical motif (whether or not the user has a row yet) so
 * the UI can render a stable list with "not started" entries instead of
 * having to merge the catalog and the user's data on the client.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CANONICAL_MOTIFS, MOTIF_LABELS, type CanonicalMotif } from "@/lib/motifs";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const rows = await prisma.userMotifRating.findMany({
      where: { userId, motif: { in: [...CANONICAL_MOTIFS] } },
    });
    const byMotif = new Map(rows.map((r) => [r.motif, r]));

    const motifs = CANONICAL_MOTIFS.map((m) => {
      const row = byMotif.get(m);
      return {
        motif: m as CanonicalMotif,
        label: MOTIF_LABELS[m],
        attempts: row?.attempts ?? 0,
        correct: row?.correct ?? 0,
        ewmaSuccess: row?.ewmaSuccess ?? null,
        rating: row?.rating ?? null,
        unlocked: row?.unlocked ?? false,
      };
    });

    return NextResponse.json({ motifs });
  } catch (err) {
    console.error("Error reading motif progress:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
