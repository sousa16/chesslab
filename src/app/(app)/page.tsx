"use client";

import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // If session is loaded and user is not authenticated, redirect to auth
    if (status === "unauthenticated") {
      router.push("/auth");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-black dark:text-white">
                ChessLab
              </h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Master your opening repertoire
              </p>
            </div>
            <Button
              onClick={() => signOut({ callbackUrl: "/auth" })}
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950">
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-zinc-50 p-8 dark:bg-zinc-900">
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-black dark:text-white">
              Welcome, {session.user?.name || session.user?.email}!
            </h2>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              {session.user?.email}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
