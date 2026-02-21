/**
 * Anki SM-2 Spaced Repetition Algorithm Implementation
 *
 * Based on the algorithm described at:
 * https://www.ankiweb.net/shared/info/456622554
 *
 * This implementation provides the core SM-2 scheduling logic for chess repertoire training.
 */

export type ReviewResponse = "forgot" | "partial" | "effort" | "easy";

/**
 * SM-2 Algorithm Configuration
 * All timing values are in days
 */
export interface SM2Config {
  // Learning phase configuration (initial exposure to new cards)
  learningSteps: number[]; // e.g., [0.016, 0.083, 1] = [24min, 2h, 1 day]

  // Exponential phase configuration
  startingEase: number; // e.g., 2.5 = 250% (factor used to space out reviews)
  easyBonus: number; // e.g., 1.3 (additional multiplier when user says "easy")
  intervalMultiplier: number; // e.g., 1.0 (scale all intervals by this)
  lapseIntervalMultiplier: number; // e.g., 0.1 (when you forget, multiply interval by this)

  // Relearning phase configuration (after forgetting during exponential phase)
  relearningSteps: number[]; // e.g., [0.083, 0.5] = [2h, 12h]

  // Constraints
  minimumEase: number; // e.g., 1.3 = 130% (don't let ease drop below this)
  hardnessDividers: {
    partial: number; // e.g., 4 (divisor for "partially recalled" when late)
    effort: number; // e.g., 2 (divisor for "recalled with effort" when late)
    easy: number; // e.g., 1 (divisor for "easily recalled" when late)
  };
}

/**
 * Default SM-2 Configuration
 * Based on Anki's defaults and optimized for chess training
 */
export const defaultSM2Config: SM2Config = {
  // Learning: 24 minutes, 2 hours, 1 day
  learningSteps: [0.016, 0.083, 1],

  startingEase: 2.5,
  easyBonus: 1.3,
  intervalMultiplier: 1.0,
  lapseIntervalMultiplier: 0.1,

  // Relearning: 2 hours, 12 hours
  relearningSteps: [0.083, 0.5],

  minimumEase: 1.3,
  hardnessDividers: {
    partial: 4,
    effort: 2,
    easy: 1,
  },
};

/**
 * SM-2 Card State - Complete state tracking for spaced repetition
 */
export interface CardState {
  interval: number; // Current interval in days
  easeFactor: number; // Current ease factor (250 = 2.5)
  repetitions: number; // Number of successful reviews
  nextReviewDate: Date; // When card is due
  phase: "learning" | "exponential" | "relearning";
  learningStepIndex: number; // Current step in learning/relearning phase
  lastReviewDate?: Date | null; // Last time this card was reviewed
}

/**
 * Review Result - What happens after reviewing a card
 */
export interface ReviewResult {
  newCardState: CardState;
  nextReviewDate: Date;
  intervalDays: number;
  message: string;
}

/**
 * Get all cards due for review for a user
 */
export function getCardsForReview(
  entries: any[], // RepertoireEntry[]
  now: Date = new Date(),
): any[] {
  return entries.filter((entry) => new Date(entry.nextReviewDate) <= now);
}

/**
 * Calculate next interval in the learning/relearning phase
 */
function getNextLearningInterval(
  stepIndex: number,
  steps: number[],
): { intervalDays: number; nextStepIndex: number; isDone: boolean } {
  if (stepIndex >= steps.length - 1) {
    return {
      intervalDays: steps[steps.length - 1],
      nextStepIndex: steps.length - 1,
      isDone: true, // Ready to move to exponential phase
    };
  }

  return {
    intervalDays: steps[stepIndex],
    nextStepIndex: stepIndex + 1,
    isDone: false,
  };
}

/**
 * Calculate the interval factor based on response and ease
 */
function calculateIntervalFactor(
  response: ReviewResponse,
  easeFactor: number,
): number {
  switch (response) {
    case "forgot":
      return 0.1; // Will be replaced with lapseIntervalMultiplier
    case "partial":
      return 1.2;
    case "effort":
      return easeFactor;
    case "easy":
      return easeFactor * 1.3; // Will be replaced with easyBonus
    default:
      return 1.0;
  }
}

/**
 * Update ease factor based on response
 */
function updateEaseFactor(
  currentEase: number,
  response: ReviewResponse,
  config: SM2Config,
): number {
  let newEase = currentEase;

  switch (response) {
    case "forgot":
      newEase -= 0.2;
      break;
    case "partial":
      newEase -= 0.15;
      break;
    case "effort":
      // No change
      break;
    case "easy":
      newEase += 0.15;
      break;
  }

  // Ensure ease doesn't drop below minimum
  return Math.max(newEase, config.minimumEase);
}

/**
 * Process a review and calculate the new card state
 * This is the main function for the SM-2 algorithm
 */
export function processReview(
  cardState: CardState,
  response: ReviewResponse,
  config: SM2Config = defaultSM2Config,
  currentDate: Date = new Date(),
): ReviewResult {
  let newCardState = { ...cardState };
  let nextReviewDate: Date = currentDate;
  let message: string = "";

  if (cardState.phase === "learning") {
    // === LEARNING PHASE ===
    if (response === "forgot") {
      // Reset to first step
      newCardState.learningStepIndex = 0;
      const interval = config.learningSteps[0];
      nextReviewDate = addDays(currentDate, interval);
      message = "Back to first learning step";
    } else if (response === "partial") {
      // Stay on current step, wait half the time
      const currentStep = config.learningSteps[newCardState.learningStepIndex];
      const waitTime = currentStep / 2;
      nextReviewDate = addDays(currentDate, waitTime);
      message = "Waiting half the interval before advancing";
    } else if (response === "effort" || response === "easy") {
      // Move to next step
      const nextStep = getNextLearningInterval(
        newCardState.learningStepIndex,
        config.learningSteps,
      );
      newCardState.learningStepIndex = nextStep.nextStepIndex;

      if (nextStep.isDone) {
        // Exit learning phase - enter exponential phase
        newCardState.phase = "exponential";
        newCardState.interval = 1;
        newCardState.easeFactor =
          response === "easy"
            ? config.startingEase + 0.15
            : config.startingEase;
        newCardState.repetitions = 1;
        nextReviewDate = addDays(currentDate, 1);
        message = "Exiting learning phase - entering exponential phase";
      } else if (response === "easy") {
        // Jump straight to exponential phase
        newCardState.phase = "exponential";
        newCardState.interval = config.startingEase;
        newCardState.easeFactor = config.startingEase + 0.15;
        newCardState.repetitions = 1;
        nextReviewDate = addDays(currentDate, config.startingEase);
        message = "Easy - jumping to exponential phase";
      } else {
        // Continue with next learning step
        const interval = config.learningSteps[newCardState.learningStepIndex];
        nextReviewDate = addDays(currentDate, interval);
        message = `Moving to learning step ${newCardState.learningStepIndex + 1}`;
      }
    } else {
      throw new Error(`Unknown response: ${response}`);
    }
  } else if (cardState.phase === "exponential") {
    // === EXPONENTIAL PHASE ===
    if (response === "forgot") {
      // Enter relearning phase
      newCardState.phase = "relearning";
      newCardState.learningStepIndex = 0;
      newCardState.easeFactor = updateEaseFactor(
        newCardState.easeFactor,
        response,
        config,
      );

      const interval = config.relearningSteps[0];
      nextReviewDate = addDays(currentDate, interval);
      message = "Forgot - entering relearning phase";
    } else {
      // Update ease factor
      newCardState.easeFactor = updateEaseFactor(
        newCardState.easeFactor,
        response,
        config,
      );

      // Calculate interval factor
      let intervalFactor = calculateIntervalFactor(
        response,
        newCardState.easeFactor,
      );

      // Apply multipliers based on response ("forgot" is handled above)
      if (response === "easy") {
        intervalFactor = newCardState.easeFactor * config.easyBonus;
      }

      // Add late review bonus
      const daysSinceLastReview = cardState.lastReviewDate
        ? Math.floor(
            (currentDate.getTime() -
              new Date(cardState.lastReviewDate).getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 0;

      const daysLate = Math.max(
        0,
        daysSinceLastReview - Math.floor(cardState.interval),
      );

      let hardnessDivider = 1;
      if (response === "partial")
        hardnessDivider = config.hardnessDividers.partial;
      else if (response === "effort")
        hardnessDivider = config.hardnessDividers.effort;
      else if (response === "easy")
        hardnessDivider = config.hardnessDividers.easy;

      const lateBonus = daysLate / hardnessDivider;
      const newInterval = (cardState.interval + lateBonus) * intervalFactor;

      newCardState.interval = Math.max(1, Math.round(newInterval));
      newCardState.repetitions += 1;
      nextReviewDate = addDays(currentDate, newCardState.interval);
      message = `Interval increased to ${newCardState.interval} days`;
    }
  } else if (cardState.phase === "relearning") {
    // === RELEARNING PHASE ===
    if (response === "forgot") {
      // Reset to first relearning step
      newCardState.learningStepIndex = 0;
      const interval = config.relearningSteps[0];
      nextReviewDate = addDays(currentDate, interval);
      message = "Back to first relearning step";
    } else if (response === "partial") {
      // Stay on current step, wait half the time
      const currentStep =
        config.relearningSteps[newCardState.learningStepIndex];
      const waitTime = currentStep / 2;
      nextReviewDate = addDays(currentDate, waitTime);
      message = "Waiting half the interval before advancing relearning";
    } else if (response === "easy") {
      // Skip directly back to exponential phase
      newCardState.phase = "exponential";
      newCardState.easeFactor = updateEaseFactor(
        newCardState.easeFactor,
        response,
        config,
      );
      // Keep previous interval but apply multiplier
      newCardState.interval = Math.max(
        1,
        Math.round(newCardState.interval * config.easyBonus),
      );
      nextReviewDate = addDays(currentDate, newCardState.interval);
      message = "Easy - returning to exponential phase";
    } else if (response === "effort") {
      // Move to next relearning step
      const nextStep = getNextLearningInterval(
        newCardState.learningStepIndex,
        config.relearningSteps,
      );
      newCardState.learningStepIndex = nextStep.nextStepIndex;

      if (nextStep.isDone) {
        // Exit relearning phase - back to exponential
        newCardState.phase = "exponential";
        newCardState.easeFactor = updateEaseFactor(
          newCardState.easeFactor,
          response,
          config,
        );
        newCardState.interval = Math.max(1, newCardState.interval);
        nextReviewDate = addDays(currentDate, newCardState.interval);
        message = "Completed relearning - back to exponential phase";
      } else {
        // Continue with next relearning step
        const interval = config.relearningSteps[newCardState.learningStepIndex];
        nextReviewDate = addDays(currentDate, interval);
        message = `Moving to relearning step ${newCardState.learningStepIndex + 1}`;
      }
    } else {
      throw new Error(`Unknown response: ${response}`);
    }
  }

  newCardState.nextReviewDate = nextReviewDate;

  return {
    newCardState,
    nextReviewDate,
    intervalDays: newCardState.interval,
    message,
  };
}

/**
 * Utility function to add days to a date
 * Handles fractional days (e.g., 0.016 days = ~24 minutes)
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  result.setTime(result.getTime() + days * millisecondsPerDay);
  return result;
}

/**
 * Get statistics about a card's review history
 */
export function getCardStatistics(cardState: CardState) {
  return {
    phase: cardState.phase,
    interval: cardState.interval,
    easeFactor: cardState.easeFactor,
    repetitions: cardState.repetitions,
    nextReviewDate: cardState.nextReviewDate,
    daysUntilReview: Math.ceil(
      (cardState.nextReviewDate.getTime() - new Date().getTime()) /
        (1000 * 60 * 60 * 24),
    ),
  };
}
