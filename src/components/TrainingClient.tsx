"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Chessboard } from "react-chessboard";
import { Chess, Square } from "chess.js";
import { ChevronLeft, Eye, Flame, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
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
  const [currentRepertoireIndex, setCurrentRepertoireIndex] = useState(0);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [gameState, setGameState] = useState<Chess | null>(null);
  const [feedback, setFeedback] = useState<string>("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [showingAnswer, setShowingAnswer] = useState(false);
  const [streak, setStreak] = useState(0);
  const [feedbackSquare, setFeedbackSquare] = useState<{
    square: string;
    type: "correct" | "incorrect";
  } | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const gameRef = useRef<Chess | null>(null);

  const isPracticeMode = mode === "practice";
  const repertoires = user.repertoires;
  const currentRepertoire = repertoires[currentRepertoireIndex];

  // Calculate total cards due for review
  const totalCards =
    repertoires.reduce((sum, r) => sum + r.entries.length, 0) || 0;

  // Initialize or update game state
  useEffect(() => {
    if (currentRepertoire && currentRepertoire.entries.length > 0) {
      const entry = currentRepertoire.entries[currentCardIndex];
      if (entry) {
        const game = new Chess(entry.position.fen);
        gameRef.current = game;
        setGameState(game);
        setShowingAnswer(false);
        setFeedbackSquare(null);
        setSelectedSquare(null);
      }
    }
  }, [currentRepertoire, currentCardIndex]);

  const handleBack = () => {
    router.push("/home");
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

  const handleSquareClick = useCallback(
    (square: Square) => {
      if (!gameRef.current || isReviewing || showingAnswer) return;

      const game = gameRef.current;

      // If clicking on a piece of the side to move, select it
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
        return;
      }

      // If we have a selected square, try to make the move
      if (selectedSquare) {
        const from = selectedSquare;
        const to = square;

        // Check if this is a legal move
        const legalMoves = game.moves({ square: from, verbose: true });
        const isLegal = legalMoves.some((m) => m.to === to);

        if (isLegal) {
          // Check if the move matches the expected move
          const expectedFrom = currentEntry?.expectedMove.slice(0, 2);
          const expectedTo = currentEntry?.expectedMove.slice(2, 4);
          const isCorrect = from === expectedFrom && to === expectedTo;

          if (isCorrect) {
            // Make the move on the board
            try {
              game.move({ from, to });
              setGameState(new Chess(game.fen()));
            } catch {}

            setFeedbackSquare({ square: to, type: "correct" });
            setStreak((s) => s + 1);

            // Clear feedback and move to next after delay
            setTimeout(() => {
              setFeedbackSquare(null);
              moveToNextCard();
            }, 1000);
          } else {
            // Incorrect move
            setFeedbackSquare({ square: to, type: "incorrect" });
            setStreak(0);

            // Clear feedback after delay
            setTimeout(() => {
              setFeedbackSquare(null);
            }, 1000);
          }
        }

        setSelectedSquare(null);
      }
    },
    [selectedSquare, currentEntry, isReviewing, showingAnswer],
  );

  const handleShowAnswer = () => {
    setShowingAnswer(true);
    setStreak(0);

    // Show the correct move on the board
    if (currentEntry && gameRef.current) {
      try {
        const from = currentEntry.expectedMove.slice(0, 2) as Square;
        const to = currentEntry.expectedMove.slice(2, 4) as Square;
        const promotion = currentEntry.expectedMove.slice(4) || undefined;
        gameRef.current.move({ from, to, promotion });
        setGameState(new Chess(gameRef.current.fen()));
        setFeedbackSquare({ square: to, type: "correct" });
      } catch {}
    }
  };

  const moveToNextCard = () => {
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
    setSelectedSquare(null);
  };

  const handleRecallRating = async (rating: ReviewResponse) => {
    if (!currentEntry) return;

    setIsReviewing(true);
    setFeedbackSquare(null);

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
            <Logo size="xl" />
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
            <Button onClick={handleBack} className="mt-4">
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
            <Logo size="xl" />
          </div>
          <div className="text-center space-y-4">
            <Trophy className="w-16 h-16 text-primary mx-auto" />
            <h2 className="text-2xl font-semibold text-foreground">
              Session Complete!
            </h2>
            <p className="text-muted-foreground">
              You reviewed {totalCards} position{totalCards !== 1 ? "s" : ""}.
            </p>
            <Button onClick={handleBack} className="mt-4">
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
          <Logo size="xl" />
        </div>

        <div className="w-full max-w-2xl h-full flex flex-col items-center justify-center gap-4">
          {/* Board */}
          <div
            className="w-full max-w-[min(calc(100vh-120px),640px)]"
            onClick={(e) => {
              const target = e.target as HTMLElement;
              const square = target.getAttribute("data-square");
              if (square) {
                handleSquareClick(square as Square);
              }
            }}>
            <Chessboard
              options={{
                position: gameState?.fen() || currentEntry.position.fen,
                boardOrientation: repertoireColor,
                showNotation: true,
                lightSquareStyle: { backgroundColor: "#b8a06d" },
                darkSquareStyle: { backgroundColor: "#2c5233" },
                allowDragging: false,
                squareStyles: {
                  ...(feedbackSquare
                    ? {
                        [feedbackSquare.square]: {
                          backgroundColor:
                            feedbackSquare.type === "correct"
                              ? "rgba(34, 197, 94, 0.5)"
                              : "rgba(239, 68, 68, 0.5)",
                        },
                      }
                    : {}),
                  ...(selectedSquare
                    ? {
                        [selectedSquare]: {
                          backgroundColor: "rgba(255, 200, 0, 0.4)",
                        },
                      }
                    : {}),
                },
              }}
            />
          </div>
        </div>
      </div>

      {/* Right Panel - Training Sidebar */}
      <aside className="w-80 border-l border-border bg-surface-1 flex-shrink-0 flex flex-col h-screen">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-surface-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={handleBack}>
            <ChevronLeft size={20} />
          </Button>
          <div className="flex-1 flex flex-col items-center gap-1">
            <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
              {isPracticeMode ? "Practice" : "Training"}
            </h2>
            {isBothColors ? (
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1">
                  <div className="w-6 h-6 rounded flex items-center justify-center text-sm bg-zinc-100 text-zinc-900 border-2 border-surface-2">
                    ♔
                  </div>
                  <div className="w-6 h-6 rounded flex items-center justify-center text-sm bg-zinc-800 text-zinc-100 border-2 border-surface-2">
                    ♚
                  </div>
                </div>
                <span className="text-lg font-semibold text-foreground">
                  Both Colors
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded flex items-center justify-center text-base ${
                    repertoireColor === "white"
                      ? "bg-zinc-100 text-zinc-900"
                      : "bg-zinc-800 text-zinc-100"
                  }`}>
                  {repertoireColor === "white" ? "♔" : "♚"}
                </div>
                <span className="text-lg font-semibold text-foreground capitalize">
                  {repertoireColor}
                </span>
              </div>
            )}
          </div>
          <div className="w-10" />
        </div>

        {/* Content */}
        <div className="flex-1 p-4 flex flex-col">
          {/* Progress */}
          <div className="space-y-2 mb-6">
            <div className="flex justify-between text-sm">
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
          <div className="bg-surface-2 rounded-lg p-4 border border-border/50 mb-6">
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
              <div className="text-center space-y-6 w-full">
                <div className="bg-surface-2 rounded-lg p-6 border border-border/50">
                  <p className="text-lg text-foreground font-medium mb-2">
                    What&apos;s your move?
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Click on the board to play the move from your repertoire
                  </p>
                </div>

                <Button
                  variant="outline"
                  className="w-full h-12 text-base"
                  onClick={handleShowAnswer}>
                  <Eye size={18} className="mr-2" />
                  Show Answer
                </Button>
              </div>
            ) : (
              /* Answer revealed - show move and feedback buttons */
              <div className="text-center space-y-6 w-full">
                {/* The Move */}
                <div className="bg-surface-2 rounded-lg p-6 border border-border/50">
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
                      className="h-14 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 flex flex-col items-center justify-center gap-0.5"
                      variant="ghost">
                      <span className="text-sm font-medium">Forgot</span>
                      <span className="text-xs opacity-70">Again</span>
                    </Button>
                    <Button
                      onClick={() => handleRecallRating("partial")}
                      disabled={isReviewing}
                      className="h-14 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 flex flex-col items-center justify-center gap-0.5"
                      variant="ghost">
                      <span className="text-sm font-medium">Hard</span>
                      <span className="text-xs opacity-70">Struggled</span>
                    </Button>
                    <Button
                      onClick={() => handleRecallRating("effort")}
                      disabled={isReviewing}
                      className="h-14 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 flex flex-col items-center justify-center gap-0.5"
                      variant="ghost">
                      <span className="text-sm font-medium">Good</span>
                      <span className="text-xs opacity-70">With effort</span>
                    </Button>
                    <Button
                      onClick={() => handleRecallRating("easy")}
                      disabled={isReviewing}
                      className="h-14 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 flex flex-col items-center justify-center gap-0.5"
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
              className={`mt-4 p-3 rounded-lg text-sm text-center ${
                feedback.includes("Error")
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "bg-primary/20 text-primary border border-primary/30"
              }`}>
              {feedback}
            </div>
          )}
        </div>

        {/* Footer with session info */}
        <div className="border-t border-border p-4 bg-surface-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Current</span>
            <div className="flex items-center gap-2">
              <div
                className={`w-5 h-5 rounded flex items-center justify-center text-xs ${
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
