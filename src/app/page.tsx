"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthModal } from "@/components/AuthModal";
import { Button } from "@/components/ui/button";
import {
  Brain,
  BookOpen,
  Zap,
  BarChart3,
  ChevronRight,
  Flame,
  Target,
  Grid3x3,
} from "lucide-react";

export default function LandingPage() {
  const searchParams = useSearchParams();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authError, setAuthError] = useState<string | undefined>();
  const [authSuccess, setAuthSuccess] = useState<string | undefined>();

  useEffect(() => {
    // Check for verification success or error from URL params
    const verified = searchParams.get("verified");
    const error = searchParams.get("error");

    if (verified === "true") {
      setAuthSuccess("Email verified successfully! You can now sign in.");
      setAuthModalOpen(true);
    } else if (error) {
      setAuthError(error);
      setAuthModalOpen(true);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-white light:from-white light:via-slate-50 light:to-white light:text-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-slate-800/50 dark:border-slate-800/50 light:border-slate-200 bg-slate-950/80 dark:bg-slate-950/80 light:bg-white/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo size="md" />
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <button
              onClick={() => setAuthModalOpen(true)}
              className="text-slate-400 dark:text-slate-400 light:text-slate-600 hover:text-white dark:hover:text-white light:hover:text-slate-900 transition-colors">
              Sign In
            </button>
            <Button
              onClick={() => setAuthModalOpen(true)}
              className="bg-green-500 hover:bg-green-600 text-white">
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-5xl md:text-6xl font-bold leading-tight">
                  Master Your Openings,{" "}
                  <span className="bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                    Never Forget a Move
                  </span>
                </h1>
                <p className="text-xl text-slate-400 leading-relaxed">
                  The intelligent training platform that uses the SM-2 Spaced
                  Repetition algorithm to schedule your chess reviews at the
                  perfect moment.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  onClick={() => setAuthModalOpen(true)}
                  className="w-full sm:w-auto h-12 bg-green-500 hover:bg-green-600 text-white text-lg flex items-center justify-center gap-2">
                  Start White Repertoire
                  <ChevronRight className="w-5 h-5" />
                </Button>
                <Button
                  onClick={() => setAuthModalOpen(true)}
                  variant="outline"
                  className="w-full sm:w-auto h-12 border-slate-600 text-white hover:bg-slate-800/50 text-lg flex items-center justify-center gap-2">
                  Build Black Repertoire
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>

              <div className="flex items-center gap-8 pt-4">
                <div className="space-y-1">
                  <p className="text-sm text-slate-400">
                    Positions Ready Today
                  </p>
                  <p className="text-2xl font-bold text-green-400">0</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-slate-400">Users Training</p>
                  <p className="text-2xl font-bold text-green-400">1000+</p>
                </div>
              </div>
            </div>

            {/* Hero Visual - Chess Board Illustration */}
            <div className="relative h-96 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-64 h-64">
                  {/* Chessboard Grid */}
                  <div className="absolute inset-0 grid grid-cols-8 gap-0 bg-slate-800">
                    {Array.from({ length: 64 }).map((_, i) => (
                      <div
                        key={i}
                        className={`${
                          (Math.floor(i / 8) + (i % 8)) % 2 === 0
                            ? "bg-slate-600"
                            : "bg-slate-700"
                        }`}
                      />
                    ))}
                  </div>

                  {/* Pieces */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="grid grid-cols-8 gap-0 w-full h-full">
                      {/* e4 highlight */}
                      <div className="col-start-5 row-start-4 bg-green-500/30 flex items-center justify-center">
                        <div className="w-8 h-8 bg-green-400 rounded-full animate-pulse" />
                      </div>
                    </div>
                  </div>

                  {/* Floating cards */}
                  <div className="absolute -top-4 -right-4 bg-slate-900 border border-green-500/30 rounded-lg p-3 text-xs space-y-1">
                    <p className="text-slate-400">Next Review</p>
                    <p className="text-green-400 font-bold">2 days</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-slate-900/50 border-y border-slate-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-bold">Powerful Features</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Everything you need to master chess openings with scientific
              precision
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1 */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 space-y-4 hover:border-slate-600 transition-colors">
              <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold">
                Personal Repertoire Builder
              </h3>
              <p className="text-slate-400">
                Create custom lines for any opening. Organize variations by
                color and prepare for any opponent.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 space-y-4 hover:border-slate-600 transition-colors">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <Brain className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold">
                Spaced Repetition Training
              </h3>
              <p className="text-slate-400">
                Active recall for chess positions. Train with the
                scientifically-proven SM-2 algorithm.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 space-y-4 hover:border-slate-600 transition-colors">
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <Zap className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold">Dual-Sided Support</h3>
              <p className="text-slate-400">
                Dedicated management for both White and Black repertoires with
                independent tracking.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 space-y-4 hover:border-slate-600 transition-colors">
              <div className="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-orange-400" />
              </div>
              <h3 className="text-xl font-semibold">Smart Scheduling</h3>
              <p className="text-slate-400">
                Automated dashboard showing what's due for review today with
                optimal training suggestions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SM-2 Algorithm Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-bold">The Science Behind ChessLab</h2>
            <p className="text-slate-400 text-lg">
              Powered by the SM-2 Spaced Repetition algorithm
            </p>
          </div>

          <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700 rounded-xl p-8 mb-12">
            <p className="text-slate-300 text-lg leading-relaxed mb-8">
              Every chess position in your repertoire is tracked with scientific
              precision. Our system monitors four critical metrics that optimize
              your learning:
            </p>

            <div className="grid md:grid-cols-4 gap-6">
              {/* Metric 1 */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 space-y-3">
                <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <Grid3x3 className="w-5 h-5 text-green-400" />
                </div>
                <h4 className="font-semibold text-white">Interval</h4>
                <p className="text-slate-400 text-sm">
                  Days until the next review is scheduled
                </p>
                <div className="text-2xl font-bold text-green-400">N days</div>
              </div>

              {/* Metric 2 */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 space-y-3">
                <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <Zap className="w-5 h-5 text-purple-400" />
                </div>
                <h4 className="font-semibold text-white">Ease Factor</h4>
                <p className="text-slate-400 text-sm">
                  Difficulty multiplier (1.3 - 2.5)
                </p>
                <div className="text-2xl font-bold text-purple-400">
                  1.3-2.5
                </div>
              </div>

              {/* Metric 3 */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 space-y-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <Flame className="w-5 h-5 text-blue-400" />
                </div>
                <h4 className="font-semibold text-white">Repetitions</h4>
                <p className="text-slate-400 text-sm">
                  Number of times mastered
                </p>
                <div className="text-2xl font-bold text-blue-400">Count</div>
              </div>

              {/* Metric 4 */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 space-y-3">
                <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                  <Target className="w-5 h-5 text-orange-400" />
                </div>
                <h4 className="font-semibold text-white">Next Review</h4>
                <p className="text-slate-400 text-sm">
                  Optimal date to review this line
                </p>
                <div className="text-2xl font-bold text-orange-400">Date</div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-6">
            <p className="text-slate-300 text-center">
              ✨ Positions are indexed by due date for efficient daily
              training—review exactly what you need, when you need it.
            </p>
          </div>
        </div>
      </section>

      {/* Training Dashboard Preview */}
      <section className="py-20 px-4 bg-slate-900/50 border-y border-slate-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-bold">Training Session</h2>
            <p className="text-slate-400 text-lg">
              Experience intelligent learning in action
            </p>
          </div>

          <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="grid md:grid-cols-2 gap-8 p-8">
              {/* Chessboard */}
              <div className="space-y-4">
                <p className="text-sm text-slate-400 font-medium">
                  WHITE REPERTOIRE
                </p>
                <div className="relative h-80 bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                  <div className="absolute inset-0 grid grid-cols-8 gap-0">
                    {Array.from({ length: 64 }).map((_, i) => (
                      <div
                        key={i}
                        className={`${
                          (Math.floor(i / 8) + (i % 8)) % 2 === 0
                            ? "bg-slate-600"
                            : "bg-slate-700"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                    <span className="text-sm">1. e4 c5 2. Nf3</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">
                    Sicilian Defense - Najdorf
                  </span>
                  <span className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-xs font-semibold">
                    Due Today
                  </span>
                </div>
              </div>

              {/* Feedback Section */}
              <div className="space-y-6 flex flex-col justify-center">
                <div className="space-y-2">
                  <p className="text-sm text-slate-400 font-medium">
                    RATE YOUR PERFORMANCE
                  </p>
                  <p className="text-slate-300">
                    How well did you recall this position?
                  </p>
                </div>

                <div className="space-y-3">
                  <button className="w-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-300 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer">
                    <span>❌</span>Again
                  </button>
                  <button className="w-full bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 text-orange-300 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer">
                    <span>⚠️</span>Hard
                  </button>
                  <button className="w-full bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 text-green-300 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer">
                    <span>✅</span>Good
                  </button>
                  <button className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer">
                    <span>⭐</span>Easy
                  </button>
                </div>

                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-2">
                  <p className="text-xs text-slate-400 font-medium">
                    NEXT REVIEW ESTIMATE
                  </p>
                  <p className="text-lg font-semibold text-green-400">
                    5 days (Good) / 7 days (Easy)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">
              Ready to master your openings?
            </h2>
            <p className="text-xl text-slate-400">
              Join thousands of chess players using ChessLab to train smarter,
              not harder.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={() => setAuthModalOpen(true)}
              className="h-12 bg-green-500 hover:bg-green-600 text-white text-lg px-8">
              Start Training Now
            </Button>
            <Button
              onClick={() => setAuthModalOpen(true)}
              variant="outline"
              className="h-12 border-slate-600 text-white hover:bg-slate-800/50 text-lg px-8">
              See Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <Logo size="sm" />
          <p className="text-slate-400 text-sm mt-4 md:mt-0">
            © 2026 ChessLab. Master your openings with spaced repetition.
          </p>
          <div className="flex gap-6 mt-4 md:mt-0">
            <a
              href="#"
              className="text-slate-400 hover:text-white transition-colors text-sm">
              Privacy
            </a>
            <a
              href="#"
              className="text-slate-400 hover:text-white transition-colors text-sm">
              Terms
            </a>
            <a
              href="#"
              className="text-slate-400 hover:text-white transition-colors text-sm">
              Contact
            </a>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        initialError={authError}
        initialSuccess={authSuccess}
      />
    </div>
  );
}
