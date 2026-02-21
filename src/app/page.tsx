import React, { Suspense } from "react";
import LandingClient from "./LandingClient";

export default function LandingPage() {
  return (
    <Suspense fallback={<div />}>
      <LandingClient />
    </Suspense>
  );
}
