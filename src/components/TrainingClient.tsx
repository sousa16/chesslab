"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Chess, Square } from "chess.js";
import {
  ChevronLeft,
  Eye,
  Flame,
  Trophy,
  GraduationCap,
  Dumbbell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Board, BoardHandle } from "@/components/Board";
import { type ReviewResponse } from "@/lib/sm2";

interface Position {
  id: string;
  fen: string;
}

interface RepertoireEntry {
  id: string;
  expectedMove: string;
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReviewDate: Date;
  phase: string;
  learningStepIndex: number;
  position: Position;
}

interface Repertoire {
  id: string;
  color: string;
  entries: RepertoireEntry[];
}

interface User {
  id: string;
  repertoires: Repertoire[];
}

interface TrainingClientProps {
  user: User;
  mode?: "review" | "practice"; // review = SRS updates, practice = no SRS updates
}

export default function TrainingClient({
  user,
  mode = "review",
}: TrainingClientProps) {
  const router = useRouter();
  const boardRef = useRef<BoardHandle>(null);
  const [currentRepertoireIndex, setCurrentRepertoireIndex] = useState(0);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [feedback, setFeedback] = useState<string>("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [showingAnswer, setShowingAnswer] = useState(false);
  const [streak, setStreak] = useState(0);
  const [feedbackSquare, setFeedbackSquare] = useState<{
    square: string;
    color: "correct" | "incorrect";
  } | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const cardStartTimeRef = useRef<number>(Date.now());

  // Reset timer when card changes
  const resetCardTimer = useCallback(() => {
    cardStartTimeRef.current = Date.now();
  }, []);

  // Get time spent on current card
  const getTimeSpentMs = useCallback(() => {
    return Date.now() - cardStartTimeRef.current;
  }, []);

  const isPracticeMode = mode === "practice";
  const repertoires = user.repertoires;
  const currentRepertoire = repertoires[currentRepertoireIndex];

  // Calculate total cards due for review
  const totalCards =
    repertoires.reduce((sum, r) => sum + r.entries.length, 0) || 0;

  const handleBack = () => {
    router.push("/home");
    router.refresh();
  };

  const currentEntry = currentRepertoire?.entries[currentCardIndex];

  // Get the expected move in a readable format
  const getExpectedMoveDisplay = () => {
    if (!currentEntry) return "";
    // expectedMove is in UCI format (e.g., "e2e4")
    // Convert to SAN for display
    try {
      const tempGame = new Chess(currentEntry.position.fen);
      const from = currentEntry.expectedMove.slice(0, 2) as Square;
      const to = currentEntry.expectedMove.slice(2, 4) as Square;
      const promotion = currentEntry.expectedMove.slice(4) || undefined;
      const move = tempGame.move({ from, to, promotion });
      return move ? move.san : currentEntry.expectedMove;
    } catch {
      return currentEntry.expectedMove;
    }
  };

  // Handle training move - validate against expected move
  const handleTrainingMove = useCallback(
    (move: { from: string; to: string; san: string }): boolean => {
      if (!currentEntry || isReviewing || showingAnswer) return false;

      const expectedFrom = currentEntry.expectedMove.slice(0, 2);
      const expectedTo = currentEntry.expectedMove.slice(2, 4);
      const isCorrect = move.from === expectedFrom && move.to === expectedTo;

      if (isCorrect) {
        setFeedbackSquare({ square: move.to, color: "correct" });
        setStreak((s) => s + 1);

        // Clear feedback and move to next after delay
        setTimeout(() => {
          setFeedbackSquare(null);
          moveToNextCard();
        }, 1000);
      } else {
        setFeedbackSquare({ square: move.to, color: "incorrect" });
        setStreak(0);

        // Clear feedback after delay
        setTimeout(() => {
          setFeedbackSquare(null);
        }, 1000);
      }

      return isCorrect;
    },
    [currentEntry, isReviewing, showingAnswer],
  );

  const handleShowAnswer = () => {
    setShowingAnswer(true);
    setStreak(0);

    // Show the correct move on the board
    if (currentEntry && boardRef.current) {
      const from = currentEntry.expectedMove.slice(0, 2);
      const to = currentEntry.expectedMove.slice(2, 4);
      const promotion = currentEntry.expectedMove.slice(4) || undefined;
      boardRef.current.makeMove(from, to, promotion);
      setFeedbackSquare({ square: to, color: "correct" });
    }
  };

  const moveToNextCard = useCallback(() => {
    // Check if there are more cards in current repertoire
    if (
      currentRepertoire &&
      currentCardIndex < currentRepertoire.entries.length - 1
    ) {
      setCurrentCardIndex(currentCardIndex + 1);
    } else if (currentRepertoireIndex < repertoires.length - 1) {
      // Move to next repertoire
      setCurrentRepertoireIndex(currentRepertoireIndex + 1);
      setCurrentCardIndex(0);
    } else {
      // Session complete
      setSessionComplete(true);
    }
    setShowingAnswer(false);
    setFeedbackSquare(null);
    resetCardTimer();
  }, [
    currentRepertoire,
    currentCardIndex,
    currentRepertoireIndex,
    repertoires.length,
    resetCardTimer,
  ]);

  const handleRecallRating = async (rating: ReviewResponse) => {
    if (!currentEntry) {
      return;
    }

    setIsReviewing(true);
    setFeedbackSquare(null);
    const timeSpentMs = getTimeSpentMs();

    // In practice mode, skip the API call - just move to next card
    if (isPracticeMode) {
      setTimeout(() => {
        moveToNextCard();
        setIsReviewing(false);
      }, 300);
      return;
    }

    // In review mode, call the API to update SRS
    try {
      const result = await fetch("/api/repertoire-entries/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: currentEntry.id,
          response: rating,
          timeSpentMs,
        }),
      });

      const data = await result.json();

      if (data.success) {
        // Move to next card
        setTimeout(() => {
          moveToNextCard();
          setIsReviewing(false);
        }, 500);
      } else {
        setFeedback("Error: " + data.error);
        setIsReviewing(false);
      }
    } catch (error) {
      setFeedback("Error submitting review");
      setIsReviewing(false);
    }
  };

  // Calculate progress
  const totalReviewed =
    repertoires
      .slice(0, currentRepertoireIndex)
      .reduce((sum, r) => sum + r.entries.length, 0) + currentCardIndex;
  const progress = totalCards > 0 ? (totalReviewed / totalCards) * 100 : 0;

  // Empty state
  if (!currentRepertoire || currentRepertoire.entries.length === 0) {
    return (
      <div className="h-screen bg-background flex">
        {/* Left Panel - Empty Board */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 min-w-0 h-screen">
          <div className="absolute top-4 left-4">
            <Logo size="xl" clickable={true} onLogoClick={handleBack} />
          </div>
          <div className="text-center space-y-4">
            <Trophy className="w-16 h-16 text-primary mx-auto" />
            <h2 className="text-2xl font-semibold text-foreground">
              All caught up!
            </h2>
            <p className="text-muted-foreground max-w-md">
              No cards to review right now. Add new positions to your repertoire
              or come back later.
            </p>
            <Button onClick={handleBack} className="mt-4 btn-primary-gradient">
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Session complete state
  if (sessionComplete) {
    return (
      <div className="h-screen bg-background flex">
        <div className="flex-1 flex flex-col items-center justify-center p-6 min-w-0 h-screen">
          <div className="absolute top-4 left-4">
            <Logo size="xl" clickable={true} onLogoClick={handleBack} />
          </div>
          <div className="text-center space-y-4">
            <Trophy className="w-16 h-16 text-primary mx-auto" />
            <h2 className="text-2xl font-semibold text-foreground">
              Session Complete!
            </h2>
            <p className="text-muted-foreground">
              You reviewed {totalCards} position{totalCards !== 1 ? "s" : ""}.
            </p>
            <Button onClick={handleBack} className="mt-4 btn-primary-gradient">
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const repertoireColor = (
    currentRepertoire.color === "White" ? "white" : "black"
  ) as "white" | "black";
  const isBothColors =
    repertoires.length > 1 &&
    repertoires.some((r) => r.color === "White") &&
    repertoires.some((r) => r.color === "Black");

  return (
    <div className="h-screen bg-background flex">
      {/* Left Panel - Board */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-w-0 h-screen">
        {/* Logo in corner */}
        <div className="absolute top-4 left-4">
          <Logo size="xl" clickable={true} onLogoClick={handleBack} />
        </div>

        <div className="w-full max-w-2xl h-full flex flex-col items-center justify-center gap-4">
          {/* Player Info - Top (Opponent) */}
          <div className="h-14 flex items-center gap-4 px-1">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                repertoireColor === "black"
                  ? "bg-zinc-100"
                  : "bg-zinc-800 border border-zinc-700"
              }`}>
              <span
                className={`text-lg font-medium ${
                  repertoireColor === "black"
                    ? "text-zinc-800"
                    : "text-zinc-300"
                }`}>
                {repertoireColor === "black" ? "W" : "B"}
              </span>
            </div>
            <p className="text-base text-muted-foreground">
              {repertoireColor === "black" ? "White" : "Black"}
            </p>
          </div>

          {/* Board */}
          <Board
            ref={boardRef}
            playerColor={repertoireColor}
            initialFen={currentEntry?.position.fen}
            key={`${currentRepertoireIndex}-${currentCardIndex}`}
            trainingMode={true}
            showingAnswer={showingAnswer}
            onTrainingMove={handleTrainingMove}
            highlightSquare={feedbackSquare}
          />

          {/* Player Info - Bottom (You) */}
          <div className="h-14 flex items-center gap-4 px-1">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                repertoireColor === "white"
                  ? "bg-zinc-100"
                  : "bg-zinc-800 border border-zinc-700"
              }`}>
              <span
                className={`text-lg font-medium ${
                  repertoireColor === "white"
                    ? "text-zinc-800"
                    : "text-zinc-300"
                }`}>
                {repertoireColor === "white" ? "W" : "B"}
              </span>
            </div>
            <p className="text-base text-foreground font-medium">You</p>
          </div>

          {/* Status indicator */}
          <div className="flex items-center justify-center h-12">
            {feedbackSquare && (
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${
                  feedbackSquare.color === "correct"
                    ? "bg-green-500/20 border border-green-500/30 text-green-400"
                    : "bg-red-500/20 border border-red-500/30 text-red-400"
                }`}>
                <span className="text-sm font-medium">
                  {feedbackSquare.color === "correct"
                    ? "Correct!"
                    : "Try again"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Training Sidebar */}
      <aside className="w-96 xl:w-[28rem] border-l border-border bg-surface-1 flex-shrink-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border/50 glass-panel">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-xl -ml-2"
              onClick={handleBack}>
              <ChevronLeft size={20} />
            </Button>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium uppercase tracking-wide">
              {isPracticeMode ? (
                <GraduationCap size={12} />
              ) : (
                <Dumbbell size={12} />
              )}
              {isPracticeMode ? "Practice" : "Training"}
            </div>
          </div>

          {/* Color Badge - Hero Style */}
          <div className="flex items-center gap-4">
            {isBothColors ? (
              <>
                <div className="relative flex -space-x-3">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg bg-gradient-to-br from-white via-zinc-100 to-zinc-300 border border-white/50 z-10">
                    <span className="text-2xl drop-shadow-sm">♔</span>
                  </div>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg bg-gradient-to-br from-zinc-600 via-zinc-800 to-zinc-900 border border-zinc-600/50">
                    <span className="text-2xl drop-shadow-sm text-zinc-300">
                      ♚
                    </span>
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Both Colors
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {totalCards} positions to{" "}
                    {isPracticeMode ? "practice" : "review"}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div
                  className={`relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
                    repertoireColor === "white"
                      ? "bg-gradient-to-br from-white via-zinc-100 to-zinc-300 border border-white/50"
                      : "bg-gradient-to-br from-zinc-600 via-zinc-800 to-zinc-900 border border-zinc-600/50"
                  }`}>
                  <span
                    className={`text-2xl drop-shadow-sm ${repertoireColor === "black" ? "text-zinc-300" : ""}`}>
                    {repertoireColor === "white" ? "♔" : "♚"}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground capitalize">
                    {repertoireColor} Repertoire
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {totalCards} positions to{" "}
                    {isPracticeMode ? "practice" : "review"}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-5 flex flex-col overflow-y-auto">
          {/* Progress */}
          <div className="glass-card rounded-xl p-4 mb-5">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Progress</span>
              <span className="text-foreground font-medium">
                {totalReviewed + 1} / {totalCards}
              </span>
            </div>
            <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Streak */}
          <div className="glass-card rounded-xl p-4 mb-5">
            <div className="flex items-center justify-center gap-3">
              <Flame
                className={`w-6 h-6 ${streak > 0 ? "text-orange-500" : "text-muted-foreground"}`}
              />
              <span className="text-2xl font-bold text-foreground">
                {streak}
              </span>
              <span className="text-sm text-muted-foreground">streak</span>
            </div>
          </div>

          {/* Main Action Area */}
          <div className="flex-1 flex flex-col items-center justify-center">
            {!showingAnswer ? (
              /* Prompt to make move or show answer */
              <div className="text-center space-y-5 w-full">
                <div className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/30">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-12 -mt-12" />
                  <div className="relative">
                    <p className="text-lg text-foreground font-semibold mb-2">
                      Ready to reveal?
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Click below to see the answer
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full h-12 text-base rounded-xl border-border/50 hover:bg-surface-2"
                  onClick={handleShowAnswer}>
                  <Eye size={18} className="mr-2" />
                  Show Answer
                </Button>
              </div>
            ) : (
              /* Answer revealed - show move and feedback buttons */
              <div className="text-center space-y-5 w-full">
                {/* The Move */}
                <div className="glass-card rounded-xl p-6">
                  <p className="text-sm text-muted-foreground mb-2">
                    The move was
                  </p>
                  <p className="text-3xl font-mono font-bold text-foreground">
                    {getExpectedMoveDisplay()}
                  </p>
                </div>

                {/* Feedback Question */}
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    How well did you know this?
                  </p>

                  {/* Feedback Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => handleRecallRating("forgot")}
                      disabled={isReviewing}
                      className="h-14 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 flex flex-col items-center justify-center gap-0.5 rounded-xl"
                      variant="ghost">
                      <span className="text-sm font-medium">Forgot</span>
                      <span className="text-xs opacity-70">Again</span>
                    </Button>
                    <Button
                      onClick={() => handleRecallRating("partial")}
                      disabled={isReviewing}
                      className="h-14 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 flex flex-col items-center justify-center gap-0.5 rounded-xl"
                      variant="ghost">
                      <span className="text-sm font-medium">Hard</span>
                      <span className="text-xs opacity-70">Struggled</span>
                    </Button>
                    <Button
                      onClick={() => handleRecallRating("effort")}
                      disabled={isReviewing}
                      className="h-14 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 flex flex-col items-center justify-center gap-0.5 rounded-xl"
                      variant="ghost">
                      <span className="text-sm font-medium">Good</span>
                      <span className="text-xs opacity-70">With effort</span>
                    </Button>
                    <Button
                      onClick={() => handleRecallRating("easy")}
                      disabled={isReviewing}
                      className="h-14 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 flex flex-col items-center justify-center gap-0.5 rounded-xl"
                      variant="ghost">
                      <span className="text-sm font-medium">Easy</span>
                      <span className="text-xs opacity-70">No problem</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Feedback message */}
          {feedback && (
            <div
              className={`mt-4 p-3 rounded-xl text-sm text-center ${
                feedback.includes("Error")
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "bg-primary/20 text-primary border border-primary/30"
              }`}>
              {feedback}
            </div>
          )}
        </div>

        {/* Footer with current color indicator */}
        <div className="border-t border-border/50 p-5 glass-panel">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Currently reviewing</span>
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center text-sm ${
                  repertoireColor === "white"
                    ? "bg-zinc-100 text-zinc-900"
                    : "bg-zinc-800 text-zinc-100"
                }`}>
                {repertoireColor === "white" ? "♔" : "♚"}
              </div>
              <span className="text-foreground font-medium capitalize">
                {repertoireColor}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
