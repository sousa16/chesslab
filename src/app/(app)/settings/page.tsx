"use client";

import { ArrowLeft, User, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/Logo";

export default function Settings() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/", redirect: true });
  };

  if (status === "loading" || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-y-auto z-50 bg-[#1a1c21]">
      <div className="max-w-2xl mx-auto p-6 min-h-screen bg-[#1a1c21]">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/")}
            className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={24} />
          </Button>
          <h1 className="text-3xl font-semibold text-foreground">Settings</h1>
        </div>

        <div className="space-y-6">
          {/* Account */}
          <section>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              Account
            </h2>
            <div className="bg-surface-1 rounded-lg border border-border">
              <div className="p-4 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                  <User size={28} className="text-primary" />
                </div>
                <div>
                  <p className="text-base font-medium text-foreground">
                    {session.user?.email || "User"}
                  </p>
                  <p className="text-sm text-muted-foreground">Free plan</p>
                </div>
              </div>
            </div>
          </section>

          {/* Training */}
          <section>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              Training
            </h2>
            <div className="bg-surface-1 rounded-lg border border-border divide-y divide-border">
              <div className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-base font-medium text-foreground">
                    Daily reminder
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Get notified to practice
                  </p>
                </div>
                <Switch />
              </div>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-base font-medium text-foreground">
                    Sound effects
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Play sounds for moves
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-base font-medium text-foreground">
                    Show coordinates
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Display board coordinates
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </section>

          <Separator />

          {/* Sign Out */}
          <Button
            variant="outline"
            className="w-full gap-2 text-destructive hover:text-destructive text-base"
            onClick={handleSignOut}>
            <LogOut size={18} />
            Sign out
          </Button>

          {/* Footer */}
          <div className="text-center pt-4">
            <Logo size="xl" />
            <p className="text-sm text-muted-foreground mt-2">Version 1.0.0</p>
          </div>
        </div>
      </div>
    </div>
  );
}
