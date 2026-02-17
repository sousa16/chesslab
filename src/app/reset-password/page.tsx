"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const tokenParam = searchParams.get("token");
    if (tokenParam) {
      setToken(tokenParam);
    } else {
      setError("Invalid reset link. Please request a new password reset.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message);
        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.push("/auth");
        }, 2000);
      } else {
        setError(data.error || "Failed to reset password");
      }
    } catch (error) {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-8 space-y-6 shadow-2xl">
          <div className="flex justify-center mb-2">
            <div className="inline-block">
              <Logo size="lg" clickable={false} />
            </div>
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-3xl font-semibold text-white">
              Reset your password
            </h1>
            <p className="text-sm text-slate-400">
              Enter your new password below
            </p>
          </div>

          {error && (
            <div className="relative overflow-hidden flex items-start gap-3 p-4 rounded-xl border border-red-500/30 bg-gradient-to-r from-red-500/20 via-red-500/10 to-transparent backdrop-blur-sm">
              <div className="absolute top-0 left-0 w-24 h-24 bg-red-500/20 rounded-full blur-2xl -ml-12 -mt-12" />
              <div className="relative w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-red-400" />
              </div>
              <p className="relative text-red-300 text-sm font-medium pt-1.5">{error}</p>
            </div>
          )}

          {success && (
            <div className="relative overflow-hidden flex items-start gap-3 p-4 rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-transparent backdrop-blur-sm">
              <div className="absolute top-0 left-0 w-24 h-24 bg-emerald-500/20 rounded-full blur-2xl -ml-12 -mt-12" />
              <div className="relative w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="relative text-emerald-300 text-sm font-medium pt-1.5">{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-slate-300">
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-800/50 border-slate-600 h-11 text-sm text-white placeholder:text-slate-500 pr-10 focus:bg-slate-800 focus:border-slate-500"
                  required
                  minLength={8}
                  disabled={isLoading || !!success}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-400 transition-colors"
                  disabled={isLoading || !!success}>
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-300">
                Confirm New Password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-800/50 border-slate-600 h-11 text-sm text-white placeholder:text-slate-500 pr-10 focus:bg-slate-800 focus:border-slate-500"
                  required
                  minLength={8}
                  disabled={isLoading || !!success}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-400 transition-colors"
                  disabled={isLoading || !!success}>
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-sm font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors mt-6"
              disabled={isLoading || !!success || !token}>
              {isLoading ? "Resetting..." : success ? "Redirecting..." : "Reset Password"}
            </Button>
          </form>

          <p className="text-center text-sm text-slate-400">
            Remember your password?{" "}
            <a
              href="/auth"
              className="text-green-400 hover:text-green-300 font-semibold transition-colors">
              Back to login
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
