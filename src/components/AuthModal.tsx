"use client";

import { useState, useEffect } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { signIn } from "next-auth/react";
import { CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showResendButton, setShowResendButton] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess("");
    setShowResendButton(false);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        action: isLogin ? "login" : "register",
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
        if (
          result.error.includes("check your email") ||
          result.error.includes("verify your email")
        ) {
          setSuccess(result.error);
          setError("");
          setShowResendButton(true);
        }
      } else if (result?.ok) {
        window.location.href = "/home";
      }
    } catch (error) {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendEmail = async () => {
    if (!email) {
      setError("Please enter your email address");
      return;
    }

    setResendLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(
          data.message || "Verification email sent! Check your inbox."
        );
      } else {
        setError(data.error || "Couldn't send email. Please try again.");
      }
    } catch (error) {
      setError("Connection error. Please check your internet.");
    } finally {
      setResendLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    await signIn("google", { callbackUrl: "/home" });
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotPasswordEmail }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message);
        setShowForgotPassword(false);
        setForgotPasswordEmail("");
      } else {
        setError(data.error || "Failed to send reset email");
      }
    } catch (error) {
      setError("Something went wrong. Please try again.");
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Logo size="md" />
          </div>
          <DialogTitle className="text-2xl font-semibold text-white">
            {isLogin ? "Welcome back" : "Create your account"}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {isLogin ? "Login to your ChessLab account" : "Join ChessLab to build your repertoire"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Alert Messages */}
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
            <div>
              <div className="relative overflow-hidden flex items-start gap-3 p-4 rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-transparent backdrop-blur-sm">
                <div className="absolute top-0 left-0 w-24 h-24 bg-emerald-500/20 rounded-full blur-2xl -ml-12 -mt-12" />
                <div className="relative w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="relative text-emerald-300 text-sm font-medium pt-1.5">{success}</p>
              </div>
              {showResendButton && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 text-sm mt-4"
                  onClick={handleResendEmail}
                  disabled={resendLoading}>
                  {resendLoading ? "Sending..." : "Resend Verification Email"}
                </Button>
              )}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-slate-300">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-slate-800/50 border-slate-600 h-11 text-sm text-white placeholder:text-slate-500 focus:bg-slate-800 focus:border-slate-500"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="password"
                  className="text-sm font-medium text-slate-300">
                  Password
                </Label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-xs text-slate-400 hover:text-slate-300 transition-colors">
                    Forgot password?
                  </button>
                )}
              </div>
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
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-400 transition-colors"
                  disabled={isLoading}>
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-sm font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors"
              disabled={isLoading}>
              {isLoading ? "Loading..." : isLogin ? "Login" : "Create account"}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-4">
            <Separator className="bg-slate-700/50" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900/95 px-2 text-xs text-slate-400 font-medium">
              OR CONTINUE WITH
            </span>
          </div>

          {/* Google Sign In */}
          <Button
            variant="outline"
            className="w-full gap-2 h-11 text-sm font-medium border-slate-600 hover:bg-slate-800/50 transition-colors"
            onClick={handleGoogleSignIn}
            disabled={isLoading}>
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google
          </Button>

          {/* Footer */}
          <p className="text-center text-sm text-slate-400">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-green-400 hover:text-green-300 font-semibold transition-colors cursor-pointer">
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>

        {/* Forgot Password Modal */}
        <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
          <DialogContent className="max-w-md">
            <DialogHeader className="text-center">
              <DialogTitle className="text-2xl font-semibold text-white">
                Reset Password
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Enter your email address and we'll send you a link to reset your password.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleForgotPassword} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="forgotEmail" className="text-sm font-medium text-slate-300">
                  Email
                </Label>
                <Input
                  id="forgotEmail"
                  type="email"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="bg-slate-800/50 border-slate-600 h-11 text-sm text-white placeholder:text-slate-500 focus:bg-slate-800 focus:border-slate-500"
                  required
                  disabled={forgotPasswordLoading}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-11 text-sm font-medium border-slate-600 hover:bg-slate-800/50 transition-colors"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setForgotPasswordEmail("");
                  }}
                  disabled={forgotPasswordLoading}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 h-11 text-sm font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors"
                  disabled={forgotPasswordLoading}>
                  {forgotPasswordLoading ? "Sending..." : "Send Reset Link"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
