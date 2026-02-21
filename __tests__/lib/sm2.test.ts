/**
 * SM-2 Spaced Repetition Algorithm Tests
 *
 * Tests for the SM-2 algorithm implementation including:
 * - Card state transitions (learning → exponential → relearning)
 * - Review response handling (forgot, partial, effort, easy)
 * - Ease factor updates
 * - Interval calculations
 */

import {
  defaultSM2Config,
  getCardsForReview,
  processReview,
  type CardState,
} from "@/lib/sm2";

// Helper to create initial card state for testing
function createTestCardState(overrides: Partial<CardState> = {}): CardState {
  return {
    phase: "learning",
    learningStepIndex: 0,
    easeFactor: defaultSM2Config.startingEase,
    interval: 0,
    repetitions: 0,
    nextReviewDate: new Date(),
    lastReviewDate: null,
    ...overrides,
  };
}

describe("SM-2 Algorithm", () => {
  describe("getCardsForReview", () => {
    it("should return cards that are due", () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago
      const futureDate = new Date(now.getTime() + 1000 * 60 * 60 * 24); // 1 day ahead

      const entries = [
        { id: "1", nextReviewDate: pastDate },
        { id: "2", nextReviewDate: futureDate },
        { id: "3", nextReviewDate: now },
      ];

      const due = getCardsForReview(entries, now);

      expect(due).toHaveLength(2);
      expect(due.map((e) => e.id)).toContain("1");
      expect(due.map((e) => e.id)).toContain("3");
    });

    it("should return empty array when no cards are due", () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 1000 * 60 * 60 * 24);

      const entries = [
        { id: "1", nextReviewDate: futureDate },
        { id: "2", nextReviewDate: futureDate },
      ];

      const due = getCardsForReview(entries, now);

      expect(due).toHaveLength(0);
    });
  });

  describe("processReview - Learning Phase", () => {
    it("should progress through learning steps on successful recall", () => {
      const state = createTestCardState();

      const result = processReview(state, "effort");

      expect(result.newCardState.learningStepIndex).toBe(1);
      expect(result.newCardState.phase).toBe("learning");
    });

    it("should reset to step 0 on forgot response", () => {
      const state = createTestCardState({ learningStepIndex: 2 });

      const result = processReview(state, "forgot");

      expect(result.newCardState.learningStepIndex).toBe(0);
      expect(result.newCardState.phase).toBe("learning");
    });

    it("should graduate to exponential phase after completing learning steps", () => {
      const state = createTestCardState({
        learningStepIndex: defaultSM2Config.learningSteps.length - 1,
      });

      const result = processReview(state, "effort");

      expect(result.newCardState.phase).toBe("exponential");
      expect(result.newCardState.repetitions).toBe(1);
    });

    it("should skip to exponential phase on easy response", () => {
      const state = createTestCardState();

      const result = processReview(state, "easy");

      expect(result.newCardState.phase).toBe("exponential");
    });
  });

  describe("processReview - Exponential Phase", () => {
    it("should increase interval on successful recall", () => {
      const state = createTestCardState({
        phase: "exponential",
        interval: 1,
        repetitions: 1,
      });

      const result = processReview(state, "effort");

      expect(result.newCardState.interval).toBeGreaterThan(state.interval);
      expect(result.newCardState.repetitions).toBe(2);
    });

    it("should decrease ease factor on partial recall", () => {
      const state = createTestCardState({
        phase: "exponential",
        interval: 1,
        repetitions: 1,
      });

      const result = processReview(state, "partial");

      expect(result.newCardState.easeFactor).toBeLessThan(state.easeFactor);
    });

    it("should enter relearning phase on forgot", () => {
      const state = createTestCardState({
        phase: "exponential",
        interval: 10,
        repetitions: 5,
      });

      const result = processReview(state, "forgot");

      expect(result.newCardState.phase).toBe("relearning");
      expect(result.newCardState.easeFactor).toBeLessThan(state.easeFactor);
    });

    it("should apply easy bonus on easy response", () => {
      // Use interval: 10 to avoid rounding issues
      // effort: 10 * 2.5 = 25
      // easy: 10 * 2.5 * 1.3 = 32.5 → 33
      const state = createTestCardState({
        phase: "exponential",
        interval: 10,
        repetitions: 1,
      });

      const effortResult = processReview(state, "effort");
      const easyResult = processReview(state, "easy");

      expect(easyResult.newCardState.interval).toBeGreaterThan(
        effortResult.newCardState.interval,
      );
    });

    it("should not drop ease below minimum", () => {
      const state = createTestCardState({
        phase: "exponential",
        easeFactor: defaultSM2Config.minimumEase,
        interval: 1,
        repetitions: 1,
      });

      const result = processReview(state, "forgot");

      expect(result.newCardState.easeFactor).toBeGreaterThanOrEqual(
        defaultSM2Config.minimumEase,
      );
    });
  });

  describe("processReview - Relearning Phase", () => {
    it("should progress through relearning steps", () => {
      const state = createTestCardState({
        phase: "relearning",
        easeFactor: 2.0,
        interval: 1,
        repetitions: 3,
      });

      const result = processReview(state, "effort");

      expect(result.newCardState.learningStepIndex).toBe(1);
      expect(result.newCardState.phase).toBe("relearning");
    });

    it("should return to exponential phase after completing relearning", () => {
      const state = createTestCardState({
        phase: "relearning",
        learningStepIndex: defaultSM2Config.relearningSteps.length - 1,
        easeFactor: 2.0,
        interval: 1,
        repetitions: 3,
      });

      const result = processReview(state, "effort");

      expect(result.newCardState.phase).toBe("exponential");
    });

    it("should reset to start of relearning on forgot", () => {
      const state = createTestCardState({
        phase: "relearning",
        learningStepIndex: 1,
        easeFactor: 2.0,
        interval: 1,
        repetitions: 3,
      });

      const result = processReview(state, "forgot");

      expect(result.newCardState.learningStepIndex).toBe(0);
      expect(result.newCardState.phase).toBe("relearning");
    });
  });

  describe("Review Response Messages", () => {
    it("should return descriptive message for each response type", () => {
      const state = createTestCardState({
        phase: "exponential",
        interval: 1,
        repetitions: 1,
      });

      const forgotResult = processReview(state, "forgot");
      const partialResult = processReview(state, "partial");
      const effortResult = processReview(state, "effort");
      const easyResult = processReview(state, "easy");

      expect(forgotResult.message).toBeTruthy();
      expect(partialResult.message).toBeTruthy();
      expect(effortResult.message).toBeTruthy();
      expect(easyResult.message).toBeTruthy();
    });
  });
});
