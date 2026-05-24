"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Chess, Square } from "chess.js";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Flame,
  RotateCcw,
  Trophy,
  GraduationCap,
  Dumbbell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { MobileNav } from "@/components/MobileNav";
import { Board, BoardHandle } from "@/components/Board";
import { type ReviewResponse } from "@/lib/sm2";
import { useSettings } from "@/contexts/SettingsContext";
import { playCorrectSound, playIncorrectSound } from "@/lib/sounds";

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
  openingName: string | null;
  openingEco: string | null;
  // SAN moves from the standard starting position up to the position the
  // user is being asked to play from. Used to render a "previous moves"
  // strip so the user can step back through the line.
  priorMoves: string[];
  // Whether this card was due for review at page-load time. In practice
  // mode (Learn All) we only fire SRS writes for due cards — non-due cards
  // stay a pure refresher.
  isDue: boolean;
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

/**
 * Normalize a FEN for equality comparison. chess.js's FEN includes the
 * halfmove clock and fullmove number, which can disagree between the
 * repertoire-tree replay and the entry's stored FEN even when the actual
 * position (pieces, castling, en passant) is identical. Stripping those
 * trailing fields gives a stable identity for position comparisons.
 */
function fenKey(fen: string | undefined | null): string {
  if (!fen) return "";
  const parts = fen.split(" ");
  return parts.slice(0, 4).join(" ");
}

export default function TrainingClient({
  user,
  mode = "review",
}: TrainingClientProps) {
  const router = useRouter();
  const boardRef = useRef<BoardHandle>(null);
  const { soundEffects } = useSettings();
  const [currentRepertoireIndex, setCurrentRepertoireIndex] = useState(0);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [feedback, setFeedback] = useState<string>("");
  const [showingAnswer, setShowingAnswer] = useState(false);
  const [streak, setStreak] = useState(0);
  const [feedbackSquare, setFeedbackSquare] = useState<{
    square: string;
    color: "correct" | "incorrect";
  } | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const cardStartTimeRef = useRef<number>(Date.now());

  // Initialize to first non-empty repertoire
  useEffect(() => {
    const firstNonEmptyIndex = user.repertoires.findIndex(
      (r) => r.entries.length > 0,
    );
    if (firstNonEmptyIndex >= 0) {
      setCurrentRepertoireIndex(firstNonEmptyIndex);
    }
  }, [user.repertoires]);

  // Keyboard shortcuts: Enter = Show Answer, 1-4 = recall rating after reveal.
  // Mapping mirrors the on-screen button order (Forgot, Hard, Good, Easy) so
  // pressing 1 always means the harshest rating and 4 the most lenient.
  useEffect(() => {
    if (sessionComplete) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't hijack typing in inputs or content-editable areas.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (!showingAnswer) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleShowAnswer();
        }
        return;
      }
      const ratings: Record<string, ReviewResponse> = {
        "1": "forgot",
        "2": "partial",
        "3": "effort",
        "4": "easy",
      };
      const rating = ratings[e.key];
      if (rating) {
        e.preventDefault();
        handleRecallRating(rating);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingAnswer, sessionComplete]);

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

  // Preview navigation state: which ply of the line leading up to the live
  // position should the board show? `null` means "live position" — the card
  // the user is being asked to recall. Otherwise it's a 0-based index into
  // `currentEntry.priorMoves` showing the position right after that move.
  const [previewPly, setPreviewPly] = useState<number | null>(null);
  const priorMoves = currentEntry?.priorMoves ?? [];

  // FENs for each step of the line leading to the live position. Replays
  // priorMoves from the standard starting position and stops as soon as we
  // either hit the entry's actual FEN (= live position) or a move fails to
  // apply. The slice up to the live FEN is what the prev/next arrows step
  // through; anything past it (which would be the user's expectedMove
  // applied) is discarded.
  const precedingFens = useMemo(() => {
    const livePositionFen = currentEntry?.position.fen;
    const fens: string[] = [];
    try {
      const g = new Chess();
      fens.push(g.fen());
      if (fenKey(g.fen()) === fenKey(livePositionFen)) return fens;
      for (const san of priorMoves) {
        const move = g.move(san);
        if (!move) break;
        fens.push(g.fen());
        if (fenKey(g.fen()) === fenKey(livePositionFen)) break;
      }
    } catch {
      // Fall back to whatever we collected so far.
    }
    return fens;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEntry?.id, currentEntry?.position.fen]);

  // Whether the replayed line actually reaches the entry's position. If
  // not (transposition or out-of-tree root), the line we have is misleading
  // — pressing back would jump to an unrelated position — so navigation is
  // hidden in that case.
  const chainReachesLive =
    precedingFens.length > 0 &&
    fenKey(precedingFens[precedingFens.length - 1]) ===
      fenKey(currentEntry?.position.fen);

  // Reset preview when card changes so each new card starts at its live
  // position, not at a leftover history ply.
  useEffect(() => {
    setPreviewPly(null);
  }, [currentEntry?.id]);

  const isPreviewing = previewPly !== null;
  const viewFen = isPreviewing
    ? precedingFens[previewPly] ?? currentEntry?.position.fen
    : currentEntry?.position.fen;

  // Render the prior moves as numbered pairs for the move list in the
  // sidebar, with each ply clickable to jump there. `ply` here means
  // "number of moves applied from the starting position", so clicking move
  // i lands the board on the position *after* that move (= ply i+1).
  // Cap at precedingFens.length-1 so SANs that didn't replay cleanly aren't
  // surfaced as clickable rows that map to undefined positions.
  const moveListPairs = useMemo(() => {
    const pairs: {
      number: number;
      whitePly: number | null;
      whiteSan: string | null;
      blackPly: number | null;
      blackSan: string | null;
    }[] = [];
    const limit = Math.min(priorMoves.length, precedingFens.length - 1);
    for (let i = 0; i < limit; i++) {
      const moveNumber = Math.floor(i / 2) + 1;
      const isWhite = i % 2 === 0;
      const plyAfter = i + 1;
      if (isWhite) {
        pairs.push({
          number: moveNumber,
          whitePly: plyAfter,
          whiteSan: priorMoves[i],
          blackPly: null,
          blackSan: null,
        });
      } else {
        const last = pairs[pairs.length - 1];
        if (last) {
          last.blackPly = plyAfter;
          last.blackSan = priorMoves[i];
        }
      }
    }
    return pairs;
  }, [priorMoves, precedingFens.length]);

  // Helpers used by the prev/next arrows and the move list. Use the
  // number of plies that actually replayed cleanly — not priorMoves.length —
  // so transpositions or unreachable SANs in the saved line can't push
  // previewPly past the end of precedingFens.
  const totalPlies = Math.max(0, precedingFens.length - 1);
  // `displayedPly` always reflects what the board is showing — even when
  // previewPly is null (live), so highlighting logic can compare uniformly.
  const displayedPly = previewPly ?? totalPlies;
  const canStepBack = displayedPly > 0;
  const canStepForward = isPreviewing; // forward returns to live when at last ply
  const jumpToPly = (ply: number) => {
    if (ply >= totalPlies) setPreviewPly(null);
    else if (ply <= 0) setPreviewPly(0);
    else setPreviewPly(ply);
  };
  const stepBack = () => jumpToPly(displayedPly - 1);
  const stepForward = () => jumpToPly(displayedPly + 1);
  const returnToLive = () => setPreviewPly(null);

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

  // Fire-and-forget SRS write. Used by both the auto-correct path
  // (handleTrainingMove) and the manual-rating path (handleRecallRating)
  // so they share the exact same payload + error handling.
  const submitReview = useCallback(
    (
      entryId: string,
      rating: ReviewResponse,
      timeSpentMs: number,
      wasDue: boolean,
    ) => {
      try {
        // wasDue lets HomePanel decrement the dashboard's dueCount
        // optimistically — a card that was due is no longer due after a
        // review (SRS bumps nextReviewDate forward regardless of rating).
        window.dispatchEvent(
          new CustomEvent("training-stats-updated", {
            detail: { timeSpentMs, positionsReviewed: 1, wasDue },
          }),
        );
      } catch {}

      fetch("/api/repertoire-entries/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, response: rating, timeSpentMs }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setFeedback("Error: " + (data.error ?? "review failed"));
          }
        })
        .catch(() => {
          setFeedback("Error submitting review");
        });
    },
    [],
  );

  // Handle training move - validate against expected move
  const handleTrainingMove = useCallback(
    (move: { from: string; to: string; san: string }): boolean => {
      if (!currentEntry || showingAnswer) return false;

      const expectedFrom = currentEntry.expectedMove.slice(0, 2);
      const expectedTo = currentEntry.expectedMove.slice(2, 4);
      const isCorrect = move.from === expectedFrom && move.to === expectedTo;

      if (isCorrect) {
        setFeedbackSquare({ square: move.to, color: "correct" });
        setStreak((s) => s + 1);

        // Play correct sound
        if (soundEffects) {
          playCorrectSound();
        }

        // Auto-rate "effort" (Good) for correct plays without Show Answer.
        // In review mode this finally closes the previously-missing SRS
        // write for cards the user nailed; in practice mode we still write
        // for cards that are due so Learn All counts toward SRS. Non-due
        // practice cards stay a pure refresher.
        const shouldWriteSRS = !isPracticeMode || currentEntry.isDue;
        if (shouldWriteSRS) {
          submitReview(
            currentEntry.id,
            "effort",
            getTimeSpentMs(),
            currentEntry.isDue,
          );
        }

        // Clear feedback and move to next after delay
        setTimeout(() => {
          setFeedbackSquare(null);
          moveToNextCard();
        }, 1000);
      } else {
        setFeedbackSquare({ square: move.to, color: "incorrect" });
        setStreak(0);

        // Play incorrect sound
        if (soundEffects) {
          playIncorrectSound();
        }

        // Clear feedback after delay
        setTimeout(() => {
          setFeedbackSquare(null);
        }, 1000);
      }

      return isCorrect;
    },
    [currentEntry, showingAnswer, isPracticeMode, submitReview, getTimeSpentMs],
  );

  const handleShowAnswer = () => {
    // If user was browsing prior moves, snap back to the live position so
    // the revealed answer is shown on the position they're actually meant
    // to recall.
    setPreviewPly(null);
    setShowingAnswer(true);

    // Show the correct move on the board
    if (currentEntry && boardRef.current) {
      const from = currentEntry.expectedMove.slice(0, 2);
      const to = currentEntry.expectedMove.slice(2, 4);
      const promotion = currentEntry.expectedMove.slice(4) || undefined;
      boardRef.current.makeMove(from, to, promotion);
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

  const handleRecallRating = (rating: ReviewResponse) => {
    if (!currentEntry) {
      return;
    }

    setFeedbackSquare(null);
    // Streak counts "remembered well enough" — Good/Easy keep it growing,
    // Hard/Forgot break it. Show Answer no longer resets on its own; the
    // rating is the source of truth for whether the user knew the position.
    if (rating === "easy" || rating === "effort") {
      setStreak((s) => s + 1);
    } else {
      setStreak(0);
    }
    const timeSpentMs = getTimeSpentMs();
    const entryId = currentEntry.id;
    const isDue = currentEntry.isDue;

    // Advance the UI immediately — the SRS write is server-side bookkeeping
    // and the user shouldn't have to wait for it.
    moveToNextCard();

    // Review mode always writes; practice mode writes only for cards that
    // were due at page load (Learn All shouldn't bump intervals on cards
    // that weren't yet due — that would defeat the schedule).
    if (isPracticeMode && !isDue) {
      return;
    }

    submitReview(entryId, rating, timeSpentMs, isDue);
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
      <div className="min-h-screen bg-background flex flex-col lg:flex-row">
        {/* Left Panel - Empty Board */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-6 min-w-0 min-h-[50vh] lg:min-h-screen relative">
          <div className="absolute top-4 left-4 hidden lg:block">
            <Logo size="xl" clickable={true} onLogoClick={handleBack} />
          </div>
          <div className="text-center space-y-4">
            <Trophy className="w-12 h-12 lg:w-16 lg:h-16 text-primary mx-auto" />
            <h2 className="text-xl lg:text-2xl font-semibold text-foreground">
              {isPracticeMode ? "Nothing to practice" : "All caught up!"}
            </h2>
            <p className="text-sm lg:text-base text-muted-foreground max-w-md">
              {isPracticeMode
                ? "No positions match this selection. Add lines to your repertoire and try again."
                : "No cards to review right now. Add new positions to your repertoire or come back later."}
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
      <div className="min-h-screen bg-background flex flex-col lg:flex-row">
        <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-6 min-w-0 min-h-[50vh] lg:min-h-screen relative">
          <div className="absolute top-4 left-4 hidden lg:block">
            <Logo size="xl" clickable={true} onLogoClick={handleBack} />
          </div>
          <div className="text-center space-y-4">
            <Trophy className="w-12 h-12 lg:w-16 lg:h-16 text-primary mx-auto" />
            <h2 className="text-xl lg:text-2xl font-semibold text-foreground">
              Session Complete!
            </h2>
            <p className="text-sm lg:text-base text-muted-foreground">
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
    <div className="h-screen bg-background flex flex-col lg:flex-row overflow-hidden">
      {/* Mobile Navigation - sticky, above everything */}
      <MobileNav
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onLogoClick={handleBack}
      />

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Left Panel - Board */}
      <div className="flex-1 flex flex-col items-center px-4 lg:px-6 min-w-0 h-below-nav lg:h-screen mt-nav lg:mt-0 pb-2 lg:pb-6 relative overflow-hidden">
        {/* Logo in corner - hidden on mobile */}
        <div className="absolute top-4 left-4 hidden lg:block">
          <Logo size="xl" clickable={true} onLogoClick={handleBack} />
        </div>

        <div className="w-full max-w-xl flex-1 flex flex-col items-center gap-2 lg:gap-3 min-h-0 justify-start pt-4 lg:justify-center lg:pt-0">
          {/* Opening name banner */}
          {currentEntry?.openingName && (
            <div className="px-3 py-1.5 rounded-full bg-surface-2/60 border border-border/50 flex-shrink-0 max-w-full">
              <span className="text-sm font-medium text-foreground truncate">
                {currentEntry.openingName}
              </span>
            </div>
          )}

          {/* Player Info - Top (Opponent) — desktop only. Mobile keeps the
              opening pill above the board; the opponent indicator is
              redundant on small screens and steals vertical real estate. */}
          <div className="hidden lg:flex items-center gap-3 px-1 flex-shrink-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                repertoireColor === "black"
                  ? "bg-zinc-100"
                  : "bg-zinc-800 border border-zinc-700"
              }`}>
              <span
                className={`text-sm font-medium ${
                  repertoireColor === "black"
                    ? "text-zinc-800"
                    : "text-zinc-300"
                }`}>
                {repertoireColor === "black" ? "W" : "B"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {repertoireColor === "black" ? "White" : "Black"}
            </p>
          </div>

          {/* Board */}
          <div
            className="flex-shrink-0 w-full"
            style={{
              maxWidth: "min(100%, calc(100dvh - var(--mobile-nav-h) - 280px))",
            }}>
            <Board
              ref={boardRef}
              playerColor={repertoireColor}
              initialFen={viewFen}
              trainingMode={!isPreviewing}
              showingAnswer={showingAnswer && !isPreviewing}
              onTrainingMove={handleTrainingMove}
              highlightSquare={isPreviewing ? null : feedbackSquare}
            />
          </div>

          {/* Prior-moves navigation arrows. Only shown when the replayed
              line actually reaches the live position — otherwise the
              priorMoves we have wouldn't trace back from the entry, and
              "back" would jump to an unrelated position. */}
          {chainReachesLive && totalPlies > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg disabled:opacity-30"
                onClick={stepBack}
                disabled={!canStepBack}
                title="Previous move">
                <ChevronLeft size={16} />
              </Button>
              <span className="text-[11px] text-muted-foreground tabular-nums w-[5rem] text-center">
                {!isPreviewing
                  ? "Current"
                  : previewPly === 0
                    ? "Start"
                    : `${previewPly} / ${totalPlies}`}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg disabled:opacity-30"
                onClick={stepForward}
                disabled={!canStepForward}
                title="Next move">
                <ChevronRight size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[11px] rounded-lg disabled:opacity-30"
                onClick={returnToLive}
                disabled={!isPreviewing}
                title="Return to current position">
                <RotateCcw size={12} className="mr-1" />
                Current
              </Button>
            </div>
          )}

          {/* Player Info - Bottom (You) — desktop only. */}
          <div className="hidden lg:flex items-center gap-3 px-1 flex-shrink-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                repertoireColor === "white"
                  ? "bg-zinc-100"
                  : "bg-zinc-800 border border-zinc-700"
              }`}>
              <span
                className={`text-sm font-medium ${
                  repertoireColor === "white"
                    ? "text-zinc-800"
                    : "text-zinc-300"
                }`}>
                {repertoireColor === "white" ? "W" : "B"}
              </span>
            </div>
            <p className="text-sm text-foreground font-medium">You</p>
          </div>

          {/* Status indicator */}
          <div className="flex items-center justify-center min-h-7 flex-shrink-0">
            {feedbackSquare && (
              <div
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl ${
                  feedbackSquare.color === "correct"
                    ? "bg-green-500/20 border border-green-500/30 text-green-400"
                    : "bg-red-500/20 border border-red-500/30 text-red-400"
                }`}>
                <span className="text-xs font-medium">
                  {feedbackSquare.color === "correct"
                    ? "Correct!"
                    : "Try again"}
                </span>
              </div>
            )}
          </div>

          {/* Main: Show Answer / Rating Buttons inline below board.
              On desktop the slot collapses to empty when the answer is shown
              (rating UI lives in the sidebar); reserve the button's height so
              the centered column doesn't shift the board upward. */}
          <div className="w-full flex-shrink-0 lg:min-h-[2.75rem]">
            {!showingAnswer ? (
              <Button
                variant="outline"
                className="w-full h-11 text-sm rounded-xl border-border/50 hover:bg-surface-2"
                onClick={handleShowAnswer}>
                <Eye size={16} className="mr-2" />
                Show Answer
              </Button>
            ) : (
              /* Answer revealed — only shown in main panel on mobile */
              <div className="lg:hidden space-y-2">
                <div className="glass-card rounded-xl p-2.5 text-center">
                  <p className="text-xs text-muted-foreground mb-1">
                    The move was
                  </p>
                  <p className="text-xl font-mono font-bold text-foreground">
                    {getExpectedMoveDisplay()}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  How well did you know this?
                </p>
                <div className="grid grid-cols-4 gap-2">
                  <Button
                    onClick={() => handleRecallRating("forgot")}
                    className="h-11 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 flex flex-col items-center justify-center gap-0.5 rounded-xl"
                    variant="ghost">
                    <span className="text-xs font-medium">Forgot</span>
                    <span className="text-[10px] opacity-70">Again</span>
                  </Button>
                  <Button
                    onClick={() => handleRecallRating("partial")}
                    className="h-11 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 flex flex-col items-center justify-center gap-0.5 rounded-xl"
                    variant="ghost">
                    <span className="text-xs font-medium">Hard</span>
                    <span className="text-[10px] opacity-70">Struggled</span>
                  </Button>
                  <Button
                    onClick={() => handleRecallRating("effort")}
                    className="h-11 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 flex flex-col items-center justify-center gap-0.5 rounded-xl"
                    variant="ghost">
                    <span className="text-xs font-medium">Good</span>
                    <span className="text-[10px] opacity-70">Effort</span>
                  </Button>
                  <Button
                    onClick={() => handleRecallRating("easy")}
                    className="h-11 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 flex flex-col items-center justify-center gap-0.5 rounded-xl"
                    variant="ghost">
                    <span className="text-xs font-medium">Easy</span>
                    <span className="text-[10px] opacity-70">No problem</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Training Sidebar */}
      <aside
        className={`fixed lg:relative top-[var(--mobile-nav-h)] lg:top-0 right-0 z-40 w-80 lg:w-96 xl:w-[28rem] h-below-nav lg:h-screen border-l border-border bg-solid flex-shrink-0 flex flex-col overflow-hidden pb-safe transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}>
        {/* Header */}
        <div className="p-4 lg:p-5 border-b border-border/50 glass-panel">
          <div className="flex items-center justify-between mb-3 lg:mb-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-xl -ml-2"
              onClick={handleBack}>
              <ChevronLeft size={20} />
            </Button>
            <div className="flex items-center gap-1.5 px-2.5 lg:px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium uppercase tracking-wide">
              {isPracticeMode ? (
                <GraduationCap size={12} />
              ) : (
                <Dumbbell size={12} />
              )}
              {isPracticeMode ? "Practice" : "Training"}
            </div>
          </div>

          {/* Color Badge - Hero Style */}
          <div className="flex items-center gap-3 lg:gap-4">
            {isBothColors ? (
              <>
                <div className="relative flex -space-x-3">
                  <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-xl lg:rounded-2xl flex items-center justify-center shadow-lg bg-gradient-to-br from-white via-zinc-100 to-zinc-300 border border-white/50 z-10">
                    <span className="text-xl lg:text-2xl drop-shadow-sm">
                      ♔
                    </span>
                  </div>
                  <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-xl lg:rounded-2xl flex items-center justify-center shadow-lg bg-gradient-to-br from-zinc-600 via-zinc-800 to-zinc-900 border border-zinc-600/50">
                    <span className="text-xl lg:text-2xl drop-shadow-sm text-zinc-300">
                      ♚
                    </span>
                  </div>
                </div>
                <div>
                  <h2 className="text-lg lg:text-xl font-semibold text-foreground">
                    Both Colors
                  </h2>
                  <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
                    {totalCards} positions to{" "}
                    {isPracticeMode ? "practice" : "review"}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div
                  className={`relative w-12 h-12 lg:w-14 lg:h-14 rounded-xl lg:rounded-2xl flex items-center justify-center shadow-lg ${
                    repertoireColor === "white"
                      ? "bg-gradient-to-br from-white via-zinc-100 to-zinc-300 border border-white/50"
                      : "bg-gradient-to-br from-zinc-600 via-zinc-800 to-zinc-900 border border-zinc-600/50"
                  }`}>
                  <span
                    className={`text-xl lg:text-2xl drop-shadow-sm ${repertoireColor === "black" ? "text-zinc-300" : ""}`}>
                    {repertoireColor === "white" ? "♔" : "♚"}
                  </span>
                </div>
                <div>
                  <h2 className="text-lg lg:text-xl font-semibold text-foreground capitalize">
                    {repertoireColor} Repertoire
                  </h2>
                  <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
                    {totalCards} positions to{" "}
                    {isPracticeMode ? "practice" : "review"}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 lg:p-5 flex flex-col overflow-y-auto">
          {/* Progress */}
          <div className="glass-card rounded-xl p-3 lg:p-4 mb-4 lg:mb-5">
            <div className="flex justify-between text-xs lg:text-sm mb-2">
              <span className="text-muted-foreground">Progress</span>
              <span className="text-foreground font-medium">
                {totalReviewed + 1} / {totalCards}
              </span>
            </div>
            <div className="h-1.5 lg:h-2 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Streak */}
          <div className="glass-card rounded-xl p-3 lg:p-4 mb-4 lg:mb-5">
            <div className="flex items-center justify-center gap-2 lg:gap-3">
              <Flame
                className={`w-5 h-5 lg:w-6 lg:h-6 ${streak > 0 ? "text-orange-500" : "text-muted-foreground"}`}
              />
              <span className="text-xl lg:text-2xl font-bold text-foreground">
                {streak}
              </span>
              <span className="text-xs lg:text-sm text-muted-foreground">
                streak
              </span>
            </div>
          </div>

          {/* Prior moves — clickable list so the user can jump directly to
              any ply that led to the current card. Only shown when the
              line traces all the way to the live position (otherwise the
              SAN list is partial and misleading). */}
          {chainReachesLive && totalPlies > 0 && (
            <div className="glass-card rounded-xl p-3 lg:p-4 mb-4 lg:mb-5 hidden lg:block">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Line so far
              </p>
              <div className="font-mono text-xs leading-relaxed max-h-32 overflow-y-auto">
                {moveListPairs.map((pair) => (
                  <span key={pair.number} className="mr-2">
                    <span className="text-muted-foreground">{pair.number}.</span>{" "}
                    {pair.whiteSan && pair.whitePly !== null && (
                      <button
                        type="button"
                        onClick={() => jumpToPly(pair.whitePly!)}
                        className={`px-1 rounded hover:bg-primary/15 transition-colors ${
                          displayedPly === pair.whitePly
                            ? "bg-primary/25 text-primary"
                            : "text-foreground"
                        }`}>
                        {pair.whiteSan}
                      </button>
                    )}{" "}
                    {pair.blackSan && pair.blackPly !== null && (
                      <button
                        type="button"
                        onClick={() => jumpToPly(pair.blackPly!)}
                        className={`px-1 rounded hover:bg-primary/15 transition-colors ${
                          displayedPly === pair.blackPly
                            ? "bg-primary/25 text-primary"
                            : "text-foreground"
                        }`}>
                        {pair.blackSan}
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Main Action Area — desktop only (mobile uses inline below board) */}
          <div className="hidden lg:flex flex-1 flex-col items-center justify-center">
            {!showingAnswer ? (
              <div className="text-center space-y-4 lg:space-y-5 w-full">
                <div className="relative overflow-hidden rounded-xl p-4 lg:p-5 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/30">
                  <div className="relative">
                    <p className="text-base lg:text-lg text-foreground font-semibold mb-1 lg:mb-2">
                      Know the answer?
                    </p>
                    <p className="text-xs lg:text-sm text-muted-foreground">
                      Use the "Show Answer" control
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Answer revealed - show move and feedback buttons */
              <div className="text-center space-y-4 lg:space-y-5 w-full">
                {/* The Move */}
                <div className="glass-card rounded-xl p-4 lg:p-6">
                  <p className="text-xs lg:text-sm text-muted-foreground mb-1 lg:mb-2">
                    The move was
                  </p>
                  <p className="text-2xl lg:text-3xl font-mono font-bold text-foreground">
                    {getExpectedMoveDisplay()}
                  </p>
                </div>

                {/* Feedback Question */}
                <div className="space-y-2 lg:space-y-3">
                  <p className="text-xs lg:text-sm text-muted-foreground">
                    How well did you know this?
                  </p>

                  {/* Feedback Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => handleRecallRating("forgot")}
                        className="h-12 lg:h-14 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 flex flex-col items-center justify-center gap-0.5 rounded-xl"
                      variant="ghost">
                      <span className="text-xs lg:text-sm font-medium">
                        Forgot
                      </span>
                      <span className="text-[10px] lg:text-xs opacity-70">
                        Again
                      </span>
                    </Button>
                    <Button
                      onClick={() => handleRecallRating("partial")}
                        className="h-12 lg:h-14 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 flex flex-col items-center justify-center gap-0.5 rounded-xl"
                      variant="ghost">
                      <span className="text-xs lg:text-sm font-medium">
                        Hard
                      </span>
                      <span className="text-[10px] lg:text-xs opacity-70">
                        Struggled
                      </span>
                    </Button>
                    <Button
                      onClick={() => handleRecallRating("effort")}
                        className="h-12 lg:h-14 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 flex flex-col items-center justify-center gap-0.5 rounded-xl"
                      variant="ghost">
                      <span className="text-xs lg:text-sm font-medium">
                        Good
                      </span>
                      <span className="text-[10px] lg:text-xs opacity-70">
                        With effort
                      </span>
                    </Button>
                    <Button
                      onClick={() => handleRecallRating("easy")}
                        className="h-12 lg:h-14 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 flex flex-col items-center justify-center gap-0.5 rounded-xl"
                      variant="ghost">
                      <span className="text-xs lg:text-sm font-medium">
                        Easy
                      </span>
                      <span className="text-[10px] lg:text-xs opacity-70">
                        No problem
                      </span>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Feedback message */}
          {feedback && (
            <div
              className={`mt-3 lg:mt-4 p-2 lg:p-3 rounded-xl text-xs lg:text-sm text-center ${
                feedback.includes("Error")
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "bg-primary/20 text-primary border border-primary/30"
              }`}>
              {feedback}
            </div>
          )}
        </div>

        {/* Footer with current color indicator */}
        <div className="border-t border-border/50 p-4 lg:p-5 glass-panel">
          <div className="flex items-center justify-between text-xs lg:text-sm">
            <span className="text-muted-foreground">Currently reviewing</span>
            <div className="flex items-center gap-2">
              <div
                className={`w-5 h-5 lg:w-6 lg:h-6 rounded-lg flex items-center justify-center text-xs lg:text-sm ${
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
