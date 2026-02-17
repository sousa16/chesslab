"use client";

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
  Eye,
} from "lucide-react";
import { Chessboard } from "react-chessboard";

// Scholar's Mate position: after 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? — White to play Qxf7#
const DEMO_FEN =
  "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";

export default function LandingPage() {
  const searchParams = useSearchParams();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authError, setAuthError] = useState<string | undefined>();
  const [authSuccess, setAuthSuccess] = useState<string | undefined>();
  const [mounted, setMounted] = useState(false);

  // Demo board state
  const [showAnswer, setShowAnswer] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  useEffect(() => {
    setMounted(true);

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

  const handleShowAnswer = () => {
    setShowAnswer(true);
    setShowFeedback(true);
  };

  const handleFeedback = () => {
    // Reset demo
    setShowAnswer(false);
    setShowFeedback(false);
  };

  // Prevent hydration mismatch by not rendering theme-dependent content until mounted
  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo size="lg" />
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <button
              onClick={() => setAuthModalOpen(true)}
              className="text-slate-300 hover:text-white transition-colors">
              Sign In
            </button>
            <Button
              onClick={() => setAuthModalOpen(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium shadow-lg shadow-emerald-500/20">
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-8 max-w-4xl mx-auto">
            <div className="space-y-6">
              <h1 className="text-5xl md:text-7xl font-bold leading-tight">
                Master Your{" "}
                <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  Chess Openings
                </span>
              </h1>
              <p className="text-xl md:text-2xl text-slate-300 leading-relaxed">
                A minimal, focused platform for building and training your
                opening repertoire with spaced repetition.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button
                onClick={() => setAuthModalOpen(true)}
                size="lg"
                className="h-14 bg-emerald-500 hover:bg-emerald-600 text-white text-lg px-8 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 transition-all">
                Start Training
                <ChevronRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-slate-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-bold text-white">Core Features</h2>
            <p className="text-slate-300 text-lg max-w-2xl mx-auto">
              Everything you need to build and master your chess repertoire
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1 */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 space-y-4 hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all group">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                <BookOpen className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-white">
                Repertoire Builder
              </h3>
              <p className="text-slate-400">
                Build custom opening lines for White and Black. Organize your
                repertoire with a visual tree structure.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 space-y-4 hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all group">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                <Brain className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-white">
                Spaced Repetition
              </h3>
              <p className="text-slate-400">
                Train with the SM-2 algorithm. Review positions at optimal
                intervals for long-term retention.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 space-y-4 hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all group">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                <Zap className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-white">
                Smart Training
              </h3>
              <p className="text-slate-400">
                Daily dashboard showing positions due for review. Practice
                efficiently with intelligent scheduling.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 space-y-4 hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all group">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                <BarChart3 className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-white">
                Progress Tracking
              </h3>
              <p className="text-slate-400">
                Monitor your learning with detailed statistics. Track mastery
                levels and review history.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 px-4 bg-slate-950">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-bold text-white">How It Works</h2>
            <p className="text-slate-300 text-lg">
              Simple workflow, powerful results
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
                <span className="text-2xl font-bold text-white">1</span>
              </div>
              <h3 className="text-xl font-semibold text-white">
                Build Your Repertoire
              </h3>
              <p className="text-slate-400">
                Add opening lines for White and Black. Create a personalized
                repertoire that fits your style.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
                <span className="text-2xl font-bold text-white">2</span>
              </div>
              <h3 className="text-xl font-semibold text-white">Train Daily</h3>
              <p className="text-slate-400">
                Practice positions that are due for review. Rate your recall to
                adjust future scheduling.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
                <span className="text-2xl font-bold text-white">3</span>
              </div>
              <h3 className="text-xl font-semibold text-white">
                Master Openings
              </h3>
              <p className="text-slate-400">
                Watch your repertoire become second nature. Build confidence in
                your opening preparation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Demo Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-4xl font-bold text-white">Try It Out</h2>
            <p className="text-slate-300 text-lg">
              Experience the training workflow
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="grid md:grid-cols-2 gap-8 p-8">
                {/* Chessboard */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-emerald-400 font-medium">
                      WHITE REPERTOIRE
                    </p>
                    <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold">
                      Due Today
                    </span>
                  </div>

                  <div className="rounded-lg overflow-hidden border border-slate-700">
                    <Chessboard
                      options={{
                        position: DEMO_FEN,
                        boardOrientation: "white",
                        allowDragging: false,
                        allowDrawingArrows: false,
                        showNotation: true,
                        boardStyle: {
                          borderRadius: "0.5rem",
                        },
                        darkSquareStyle: { backgroundColor: "#334155" },
                        lightSquareStyle: { backgroundColor: "#64748b" },
                      }}
                    />
                  </div>

                  <div className="text-center">
                    <p className="text-slate-400 text-sm">
                      Position after 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6??
                    </p>
                    <p className="text-white font-medium mt-1">
                      White to play and win
                    </p>
                  </div>
                </div>

                {/* Controls */}
                <div className="space-y-6 flex flex-col justify-center">
                  {!showAnswer && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-sm text-slate-400 font-medium">
                          TRAINING MODE
                        </p>
                        <p className="text-slate-300">
                          Find the winning move for White before revealing the
                          answer.
                        </p>
                      </div>

                      <Button
                        onClick={handleShowAnswer}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2">
                        <Eye className="w-4 h-4" />
                        Show Answer
                      </Button>
                    </div>
                  )}

                  {showAnswer && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                        <p className="text-sm text-emerald-400 font-medium mb-1">
                          WINNING MOVE
                        </p>
                        <p className="text-xl font-bold text-white">4. Qxf7#</p>
                        <p className="text-slate-400 text-xs mt-1">
                          Scholar&apos;s Mate! The Queen captures on f7 with
                          checkmate.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm text-slate-400 font-medium">
                          RATE YOUR RECALL
                        </p>
                      </div>

                      <div className="space-y-3">
                        <button
                          onClick={handleFeedback}
                          className="w-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-300 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2">
                          <span>❌</span>Again (1 day)
                        </button>
                        <button
                          onClick={handleFeedback}
                          className="w-full bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 text-orange-300 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2">
                          <span>⚠️</span>Hard (3 days)
                        </button>
                        <button
                          onClick={handleFeedback}
                          className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2">
                          <span>✅</span>Good (5 days)
                        </button>
                        <button
                          onClick={handleFeedback}
                          className="w-full bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/50 text-teal-300 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2">
                          <span>⭐</span>Easy (7 days)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-slate-950 to-slate-900">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold text-white">
              Ready to Start Training?
            </h2>
            <p className="text-xl text-slate-300">
              Build your repertoire and train smarter with spaced repetition.
            </p>
          </div>

          <Button
            onClick={() => setAuthModalOpen(true)}
            size="lg"
            className="h-14 bg-emerald-500 hover:bg-emerald-600 text-white text-lg px-8 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 transition-all">
            Get Started Free
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 py-8 px-4 bg-slate-950">
        <div className="max-w-6xl mx-auto flex items-center justify-center">
          <p className="text-slate-400 text-sm">
            © 2026 ChessLab. Minimal, focused chess training.
          </p>
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
