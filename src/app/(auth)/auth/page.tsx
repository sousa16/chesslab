import React, { Suspense } from "react";
import AuthClient from "./AuthClient";

export default function AuthPage() {
  return (
    <Suspense fallback={<div />}>
      <AuthClient />
    </Suspense>
  );
}
