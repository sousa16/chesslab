"use client";

import {
  User,
  LogOut,
  Mail,
  Key,
  Calendar,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Bell,
  Palette,
  Trash2,
  Volume2,
  Grid3x3,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogOverlay,
  DialogPortal,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useSettings } from "@/contexts/SettingsContext";
import * as DialogPrimitive from "@radix-ui/react-dialog";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const { success, error: showError } = useToast();
  const {
    soundEffects,
    setSoundEffects,
    showCoordinates,
    setShowCoordinates,
    moveAnimation,
    setMoveAnimation,
    dailyReminder,
    setDailyReminder,
  } = useSettings();
  const [name, setName] = useState(session?.user?.name || "");
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    onOpenChange(false);
    router.push("/auth");
  };

  const handleUpdateName = async () => {
    if (!name.trim()) {
      showError("Name cannot be empty");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/update-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (response.ok) {
        success("Name updated successfully");
        setShowNameDialog(false);
        window.location.reload();
      } else {
        const data = await response.json();
        showError(data.error || "Failed to update name");
      }
    } catch (error) {
      showError("Failed to update name");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showError("All fields are required");
      return;
    }

    if (newPassword !== confirmPassword) {
      showError("Passwords don't match");
      return;
    }

    if (newPassword.length < 8) {
      showError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (response.ok) {
        success("Password changed successfully");
        setShowPasswordDialog(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const data = await response.json();
        showError(data.error || "Failed to change password");
      }
    } catch (error) {
      showError("Failed to change password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/delete-account", {
        method: "DELETE",
      });

      if (response.ok) {
        success("Account deleted successfully");
        await signOut({ redirect: false });
        router.push("/");
      } else {
        const data = await response.json();
        showError(data.error || "Failed to delete account");
      }
    } catch (error) {
      showError("Failed to delete account");
    } finally {
      setIsLoading(false);
      setShowDeleteDialog(false);
    }
  };

  const hasPassword = session?.user?.email && !session.user.image;

  if (!session?.user) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPortal>
          <DialogOverlay className="!backdrop-blur-none bg-black/50" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] sm:w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-solid opacity-100 p-4 sm:p-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg max-h-[90vh] overflow-y-auto">
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none text-foreground z-10">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>

            {/* Header */}
            <DialogHeader>
              <DialogTitle className="text-xl sm:text-2xl font-semibold">
                Settings
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Account Section */}
              <section>
                <h2 className="text-xs sm:text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Account
                </h2>
                <div className="bg-background rounded-lg border border-border divide-y divide-border">
                  {/* Profile Picture & Basic Info */}
                  <div className="p-4 flex items-center gap-4">
                    <div className="relative w-14 h-14">
                      {session.user?.image ? (
                        <img
                          src={session.user.image}
                          alt=""
                          className="w-14 h-14 rounded-full border-2 border-primary/20 object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            const fallback = e.currentTarget
                              .nextElementSibling as HTMLElement;
                            if (fallback) fallback.style.display = "flex";
                          }}
                        />
                      ) : null}
                      <div
                        className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center border-2 border-primary/20"
                        style={{
                          display: session.user?.image ? "none" : "flex",
                        }}>
                        <User size={28} className="text-primary" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-medium text-foreground">
                        {session.user?.name ||
                          session.user?.email?.split("@")[0] ||
                          "User"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {session.user?.email}
                      </p>
                      {session.user?.emailVerified ? (
                        <div className="flex items-center gap-1 mt-1">
                          <CheckCircle2 size={14} className="text-green-500" />
                          <span className="text-xs text-green-500">
                            Verified
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertCircle size={14} className="text-yellow-500" />
                          <span className="text-xs text-yellow-500">
                            Not verified
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowNameDialog(true)}>
                      Edit
                    </Button>
                  </div>

                  {/* Email */}
                  <div
                    className="p-3 sm:p-4 flex items-center justify-between cursor-not-allowed opacity-60"
                    title="Email changes coming soon">
                    <div className="flex items-center gap-3">
                      <Mail size={20} className="text-muted-foreground" />
                      <div>
                        <p className="text-base font-medium text-foreground">
                          Email
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {session.user?.email}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Password Change */}
                  {hasPassword && (
                    <div
                      className="p-3 sm:p-4 flex items-center justify-between cursor-pointer hover:bg-surface-2 transition-colors"
                      onClick={() => setShowPasswordDialog(true)}>
                      <div className="flex items-center gap-3">
                        <Key size={20} className="text-muted-foreground" />
                        <div>
                          <p className="text-base font-medium text-foreground">
                            Change password
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Update your password
                          </p>
                        </div>
                      </div>
                      <ChevronRight
                        size={20}
                        className="text-muted-foreground"
                      />
                    </div>
                  )}

                  {/* Account Created */}
                  <div className="p-3 sm:p-4 flex items-center gap-3">
                    <Calendar size={20} className="text-muted-foreground" />
                    <div>
                      <p className="text-base font-medium text-foreground">
                        Member since
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {session.user?.createdAt
                          ? new Date(session.user.createdAt).toLocaleDateString(
                              "en-US",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              },
                            )
                          : "Recently"}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Appearance */}
              <section>
                <h2 className="text-xs sm:text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Appearance
                </h2>
                <div className="bg-background rounded-lg border border-border">
                  <div className="p-3 sm:p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Palette size={20} className="text-muted-foreground" />
                      <div>
                        <p className="text-base font-medium text-foreground">
                          Theme
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Toggle dark/light mode
                        </p>
                      </div>
                    </div>
                    <ThemeToggle />
                  </div>
                </div>
              </section>

              {/* Training Preferences */}
              <section>
                <h2 className="text-xs sm:text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Training
                </h2>
                <div className="bg-background rounded-lg border border-border divide-y divide-border">
                  <div className="p-3 sm:p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Bell size={20} className="text-muted-foreground" />
                      <div>
                        <p className="text-sm sm:text-base font-medium text-foreground">
                          Daily reminder
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          Get notified to practice
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={dailyReminder}
                      onCheckedChange={setDailyReminder}
                    />
                  </div>
                  <div className="p-3 sm:p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Volume2 size={20} className="text-muted-foreground" />
                      <div>
                        <p className="text-sm sm:text-base font-medium text-foreground">
                          Sound effects
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          Play sounds for moves
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={soundEffects}
                      onCheckedChange={setSoundEffects}
                    />
                  </div>
                  <div className="p-3 sm:p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Grid3x3 size={20} className="text-muted-foreground" />
                      <div>
                        <p className="text-sm sm:text-base font-medium text-foreground">
                          Show coordinates
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          Display board coordinates
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={showCoordinates}
                      onCheckedChange={setShowCoordinates}
                    />
                  </div>
                </div>
              </section>

              <Separator />

              {/* Danger Zone */}
              <section>
                <h2 className="text-xs sm:text-sm font-medium text-destructive uppercase tracking-wider mb-3">
                  Danger Zone
                </h2>
                <div className="bg-background rounded-lg border border-border">
                  <div
                    className="p-3 sm:p-4 flex items-center justify-between cursor-pointer hover:bg-destructive/5 transition-colors"
                    onClick={() => setShowDeleteDialog(true)}>
                    <div className="flex items-center gap-3">
                      <Trash2 size={20} className="text-destructive" />
                      <div>
                        <p className="text-base font-medium text-destructive">
                          Delete account
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Permanently delete your account and all data
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-muted-foreground" />
                  </div>
                </div>
              </section>

              <Separator />

              {/* Sign Out */}
              <Button
                variant="outline"
                className="w-full gap-2 text-base"
                onClick={handleSignOut}>
                <LogOut size={18} />
                Sign out
              </Button>

              {/* Footer */}
              <div className="text-center pt-2">
                <Logo size="lg" />
                <p className="text-xs text-muted-foreground mt-2">
                  Version 1.0.0
                </p>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>

      {/* Edit Name Dialog */}
      <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Name</DialogTitle>
            <DialogDescription>
              Change how your name appears in your profile
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNameDialog(false)}
              disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleUpdateName} disabled={isLoading}>
              {isLoading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPasswordDialog(false)}
              disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleChangePassword} disabled={isLoading}>
              {isLoading ? "Changing..." : "Change Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Delete Account
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete your account? This action cannot
              be undone. All your repertoires, training data, and progress will
              be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isLoading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={isLoading}>
              {isLoading ? "Deleting..." : "Delete Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
