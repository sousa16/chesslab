import React, { Suspense } from "react";
import HomeClient from "./HomeClient";

export default function HomePage() {
  return (
    <Suspense fallback={<div />}>
      <HomeClient />
    </Suspense>
  );
}
