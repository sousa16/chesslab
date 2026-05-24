import React, { Suspense } from "react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  getTrainingStats,
  type TrainingStats,
} from "@/lib/trainingStats";
import HomeClient from "./HomeClient";

export default async function HomePage() {
  // The session is needed for the JWT id; getServerSession is a JWT
  // decode + verify, no DB hit.
  const session = await getServerSession(authOptions);

  // Kick off the stats compute server-side, UN-AWAITED, and pass the
  // promise down. HomePanel `use()`s it inside Suspense — the page
  // shell flushes immediately while stats stream in. On a cold login
  // this saves a client → /api/training-stats round-trip. On a tactics
  // → home nav the client cache renders synchronously, so the promise
  // is effectively ignored and there's no fallback flash. Both paths
  // benefit from the unstable_cache on getTrainingStats.
  const statsPromise: Promise<TrainingStats | null> = session?.user?.id
    ? getTrainingStats(session.user.id).catch((err) => {
        console.error("Pre-fetch of training stats failed:", err);
        return null;
      })
    : Promise.resolve(null);

  return (
    <Suspense fallback={<div />}>
      <HomeClient statsPromise={statsPromise} />
    </Suspense>
  );
}
