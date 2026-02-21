import React, { Suspense } from "react";
import BuildClient from "./BuildClient";

export async function generateStaticParams() {
  return [{ color: "white" }, { color: "black" }];
}

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
