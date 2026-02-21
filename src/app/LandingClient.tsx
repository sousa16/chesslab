"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthModal } from "@/components/AuthModal";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import {
  Brain,
  BookOpen,
  Zap,
  BarChart3,
  ChevronRight,
  Eye,
} from "lucide-react";
import { Chessboard } from "react-chessboard";

const DEMO_FEN =
  "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";

export default function LandingClient() {
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authError, setAuthError] = useState<string | undefined>();
  const [authSuccess, setAuthSuccess] = useState<string | undefined>();
  const [mounted, setMounted] = useState(false);

  const [showAnswer, setShowAnswer] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    setMounted(true);

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
    // Open the auth modal so the user can sign up instead of hiding the
    // feedback controls. Keep the answer visible so the user can see what
    // they rated while signing up.
    setAuthModalOpen(true);
  };

  const boardColors =
    theme === "dark"
      ? { dark: "#334155", light: "#64748b" }
      : { dark: "#8faa6e", light: "#eeeed2" };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-amber-50/40 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      <nav className="fixed top-0 w-full z-50 border-b border-stone-200/80 dark:border-slate-800/50 bg-stone-50/80 dark:bg-slate-950/80 backdrop-blur-md transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex-shrink-0">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              aria-label="Scroll to top"
              className="p-0 m-0 bg-transparent border-0 cursor-pointer">
              <Logo size="md" showIcon={true} forcePointer={true} />
            </button>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
            <ThemeToggle />
            <button
              onClick={() => setAuthModalOpen(true)}
              className="hidden sm:block text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors text-sm md:text-base cursor-pointer">
              Sign In
            </button>
            <Button
              onClick={() => setAuthModalOpen(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium shadow-lg shadow-emerald-500/20 text-sm md:text-base px-3 py-2 sm:px-4 sm:py-2 h-9 sm:h-10">
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      <section className="pt-24 sm:pt-28 md:pt-32 pb-12 sm:pb-16 md:pb-20 px-4 sm:px-6 bg-gradient-to-b from-amber-50/40 via-stone-50 to-amber-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 transition-colors duration-300">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-6 sm:space-y-8 max-w-4xl mx-auto">
            <div className="space-y-4 sm:space-y-6">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold leading-tight text-slate-900 dark:text-white px-2">
                Master Your{" "}
                <span className="bg-gradient-to-r from-emerald-500 to-teal-500 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                  Chess Openings
                </span>
              </h1>
              <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-slate-500 dark:text-slate-300 leading-relaxed px-2">
                A minimal, focused platform for building and training your
                opening repertoire with spaced repetition.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center pt-2 sm:pt-4 px-4">
              <Button
                onClick={() => setAuthModalOpen(true)}
                size="lg"
                className="h-12 sm:h-14 bg-emerald-500 hover:bg-emerald-600 text-white text-base sm:text-lg px-6 sm:px-8 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 transition-all w-full sm:w-auto">
                Start Training
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 md:py-20 px-4 sm:px-6 bg-stone-100/60 dark:bg-slate-900/50 transition-colors duration-300">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-3 sm:space-y-4 mb-10 sm:mb-12 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
              Core Features
            </h2>
            <p className="text-slate-500 dark:text-slate-300 text-base sm:text-lg max-w-2xl mx-auto px-4">
              Everything you need to build and master your chess repertoire
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 md:gap-6">
            <div className="bg-stone-50/70 dark:bg-slate-800/50 backdrop-blur-sm border border-stone-200/80 dark:border-slate-700/50 rounded-xl p-6 space-y-4 hover:border-emerald-400/60 dark:hover:border-emerald-500/50 hover:bg-stone-50 dark:hover:bg-slate-800/80 hover:shadow-lg hover:shadow-emerald-500/5 transition-all group">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-500/20 rounded-lg flex items-center justify-center group-hover:bg-emerald-200 dark:group-hover:bg-emerald-500/30 transition-colors">
                <BookOpen className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                Repertoire Builder
              </h3>
              <p className="text-slate-500 dark:text-slate-400">
                Build custom opening lines for White and Black. Organize your
                repertoire with a visual tree structure.
              </p>
            </div>

            <div className="bg-stone-50/70 dark:bg-slate-800/50 backdrop-blur-sm border border-stone-200/80 dark:border-slate-700/50 rounded-xl p-6 space-y-4 hover:border-emerald-400/60 dark:hover:border-emerald-500/50 hover:bg-stone-50 dark:hover:bg-slate-800/80 hover:shadow-lg hover:shadow-emerald-500/5 transition-all group">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-500/20 rounded-lg flex items-center justify-center group-hover:bg-emerald-200 dark:group-hover:bg-emerald-500/30 transition-colors">
                <Brain className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                Spaced Repetition
              </h3>
              <p className="text-slate-500 dark:text-slate-400">
                Train with the SM-2 algorithm. Review positions at optimal
                intervals for long-term retention.
              </p>
            </div>

            <div className="bg-stone-50/70 dark:bg-slate-800/50 backdrop-blur-sm border border-stone-200/80 dark:border-slate-700/50 rounded-xl p-6 space-y-4 hover:border-emerald-400/60 dark:hover:border-emerald-500/50 hover:bg-stone-50 dark:hover:bg-slate-800/80 hover:shadow-lg hover:shadow-emerald-500/5 transition-all group">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-500/20 rounded-lg flex items-center justify-center group-hover:bg-emerald-200 dark:group-hover:bg-emerald-500/30 transition-colors">
                <Zap className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                Smart Training
              </h3>
              <p className="text-slate-500 dark:text-slate-400">
                Daily dashboard showing positions due for review. Practice
                efficiently with intelligent scheduling.
              </p>
            </div>

            <div className="bg-stone-50/70 dark:bg-slate-800/50 backdrop-blur-sm border border-stone-200/80 dark:border-slate-700/50 rounded-xl p-6 space-y-4 hover:border-emerald-400/60 dark:hover:border-emerald-500/50 hover:bg-stone-50 dark:hover:bg-slate-800/80 hover:shadow-lg hover:shadow-emerald-500/5 transition-all group">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-500/20 rounded-lg flex items-center justify-center group-hover:bg-emerald-200 dark:group-hover:bg-emerald-500/30 transition-colors">
                <BarChart3 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                Progress Tracking
              </h3>
              <p className="text-slate-500 dark:text-slate-400">
                Monitor your learning with detailed statistics. Track mastery
                levels and review history.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 md:py-20 px-4 sm:px-6 bg-gradient-to-b from-stone-50 to-amber-50/40 dark:from-slate-900 dark:to-slate-950 transition-colors duration-300">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-3 sm:space-y-4 mb-8 sm:mb-10 md:mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
              Try It Out
            </h2>
            <p className="text-slate-500 dark:text-slate-300 text-base sm:text-lg">
              Experience the training workflow
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="bg-stone-50/80 dark:bg-slate-800/50 backdrop-blur-sm border border-stone-200/80 dark:border-slate-700/50 rounded-xl overflow-hidden shadow-xl shadow-stone-200/50 dark:shadow-black/20 transition-colors duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 p-4 sm:p-6 md:p-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                      WHITE REPERTOIRE
                    </p>
                    <span className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold">
                      Due Today
                    </span>
                  </div>

                  <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-md">
                    <Chessboard
                      options={{
                        position: DEMO_FEN,
                        boardOrientation: "white",
                        allowDragging: false,
                        allowDrawingArrows: false,
                        showNotation: true,
                        boardStyle: { borderRadius: "0.5rem" },
                        darkSquareStyle: { backgroundColor: boardColors.dark },
                        lightSquareStyle: {
                          backgroundColor: boardColors.light,
                        },
                      }}
                    />
                  </div>

                  <div className="text-center">
                    <p className="text-slate-500 dark:text-slate-400 text-sm">
                      Position after 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6??
                    </p>
                    <p className="text-slate-900 dark:text-white font-medium mt-1">
                      White to play and win
                    </p>
                  </div>
                </div>

                <div className="space-y-6 flex flex-col justify-center">
                  {!showAnswer && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                          TRAINING MODE
                        </p>
                        <p className="text-slate-600 dark:text-slate-300">
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
                      <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-lg p-3">
                        <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-1">
                          WINNING MOVE
                        </p>
                        <p className="text-xl font-bold text-slate-900 dark:text-white">
                          4. Qxf7#
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                          Scholar&apos;s Mate! The Queen captures on f7 with
                          checkmate.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                          RATE YOUR RECALL
                        </p>
                      </div>

                      <div className="space-y-3">
                        <button
                          onClick={handleFeedback}
                          className="w-full bg-red-50 dark:bg-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/30 border border-red-200 dark:border-red-500/50 text-red-600 dark:text-red-300 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2">
                          <span>❌</span>Again (1 day)
                        </button>
                        <button
                          onClick={handleFeedback}
                          className="w-full bg-orange-50 dark:bg-orange-500/20 hover:bg-orange-100 dark:hover:bg-orange-500/30 border border-orange-200 dark:border-orange-500/50 text-orange-600 dark:text-orange-300 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2">
                          <span>⚠️</span>Hard (3 days)
                        </button>
                        <button
                          onClick={handleFeedback}
                          className="w-full bg-emerald-50 dark:bg-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/30 border border-emerald-200 dark:border-emerald-500/50 text-emerald-600 dark:text-emerald-300 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2">
                          <span>✅</span>Good (5 days)
                        </button>
                        <button
                          onClick={handleFeedback}
                          className="w-full bg-teal-50 dark:bg-teal-500/20 hover:bg-teal-100 dark:hover:bg-teal-500/30 border border-teal-200 dark:border-teal-500/50 text-teal-600 dark:text-teal-300 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2">
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

      <section className="py-12 sm:py-16 md:py-20 px-4 sm:px-6 bg-gradient-to-b from-amber-50/40 to-stone-50 dark:from-slate-950 dark:to-slate-900 transition-colors duration-300">
        <div className="max-w-4xl mx-auto text-center space-y-6 sm:space-y-8">
          <div className="space-y-3 sm:space-y-4 px-2">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white">
              Ready to Start Training?
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-slate-500 dark:text-slate-300">
              Build your repertoire and train smarter with spaced repetition.
            </p>
          </div>

          <div className="px-4">
            <Button
              onClick={() => setAuthModalOpen(true)}
              size="lg"
              className="h-12 sm:h-14 bg-emerald-500 hover:bg-emerald-600 text-white text-base sm:text-lg px-6 sm:px-8 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 transition-all w-full sm:w-auto">
              Get Started Free
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-200/80 dark:border-slate-800/50 py-6 sm:py-8 px-4 bg-stone-50 dark:bg-slate-950 transition-colors duration-300">
        <div className="max-w-6xl mx-auto flex items-center justify-center">
          <p className="text-slate-400 dark:text-slate-400 text-xs sm:text-sm text-center">
            © 2026 ChessLab. Minimal, focused chess training.
          </p>
        </div>
      </footer>

      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        initialError={authError}
        initialSuccess={authSuccess}
      />
    </div>
  );
}
