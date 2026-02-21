import React, { Suspense } from "react";
import BuildClient from "./BuildClient";

export const dynamic = "force-dynamic";

export default function BuildPage({
  params,
}: {
  params: { color: "white" | "black" };
}) {
  return (
    <Suspense fallback={<div />}>
      <BuildClient params={params} />
    </Suspense>
  );
}
