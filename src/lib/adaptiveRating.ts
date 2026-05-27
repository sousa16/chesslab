/**
 * Adaptive difficulty controller — targets a ~85% success rate.
 *
 * Implements the "Eighty Five Percent Rule" (Wilson et al., Nature
 * Communications 2019). The empirically-optimal training error rate for a
 * gradient-based learner — humans included — is ~15%, i.e. 85% success. Hold
 * the learner there and pattern acquisition is fastest; train much harder
 * and most of the time is spent stuck rather than encoding patterns.
 *
 * Design:
 *  - Maintain a rolling EWMA of correctness per motif (and one global).
 *  - When EWMA leaves the [LOW, HIGH] band, bump the rating setpoint up/down.
 *  - Larger steps during the cold-start window (first 20 attempts) so a new
 *    user converges in a session, not a month.
 *
 * The controller is intentionally simple — proportional, not PID. SRS
 * already handles long-horizon retention; this only has to keep difficulty
 * sane between attempts.
 */

export const TARGET_SUCCESS_RATE = 0.85;

// Hysteresis window. Tightening either side will oscillate the rating; loosening
// drifts away from the 85% target. ±5pp matches roughly one std-error on a
// 20-trial EWMA, so we wait until the signal is plausibly real.
const HIGH = 0.9;
const LOW = 0.8;

// Smoothing factor for the EWMA. α=0.15 gives a ~5-attempt half-life on
// recent form — fast enough to react to a real difficulty mismatch, slow
// enough that a single bad puzzle doesn't whiplash the controller.
const ALPHA = 0.15;

// Step sizes in puzzle-rating points. Cold-start step is bigger because a
// brand-new user/motif has no signal yet — converge fast, then settle.
const STEP_NORMAL = 25;
const STEP_COLD = 50;
const COLD_THRESHOLD = 20;

// Clamps. 600 keeps us above the absolute floor of the puzzle catalog;
// 2600 caps at where Lichess puzzle density drops off sharply.
export const MIN_RATING = 600;
export const MAX_RATING = 2600;

export interface MotifRatingState {
  rating: number;
  ewmaSuccess: number;
  attempts: number;
  correct: number;
  unlocked: boolean;
}

export interface MotifRatingUpdate {
  rating: number;
  ewmaSuccess: number;
  attempts: number;
  correct: number;
  unlocked: boolean;
  /** True when this attempt crossed the unlock threshold for the first time. */
  becameUnlocked: boolean;
}

/**
 * Apply one attempt's result to a motif's adaptive state.
 *
 * Note: this is pure — the caller persists the result. Both the per-motif
 * controller and the global "currentTargetRating" use the same shape, so
 * the same function services both.
 */
export function updateMotifRating(
  prior: MotifRatingState,
  isCorrect: boolean,
): MotifRatingUpdate {
  const hit = isCorrect ? 1 : 0;
  const ewmaSuccess = (1 - ALPHA) * prior.ewmaSuccess + ALPHA * hit;
  const attempts = prior.attempts + 1;
  const correct = prior.correct + hit;

  const step = attempts <= COLD_THRESHOLD ? STEP_COLD : STEP_NORMAL;

  let rating = prior.rating;
  // Only react once we have at least 3 attempts in the window — otherwise
  // the EWMA is dominated by the 0.5 seed and we'd see spurious bumps.
  if (attempts >= 3) {
    if (ewmaSuccess > HIGH) rating += step;
    else if (ewmaSuccess < LOW) rating -= step;
  }
  rating = Math.max(MIN_RATING, Math.min(MAX_RATING, rating));

  // Unlock criterion: ≥20 attempts AND EWMA ≥ 0.80 (the lower edge of the
  // hysteresis band). Sticky once true — bad days shouldn't relock.
  const alreadyUnlocked = prior.unlocked;
  const meetsCriteria = attempts >= 20 && ewmaSuccess >= LOW;
  const unlocked = alreadyUnlocked || meetsCriteria;
  const becameUnlocked = !alreadyUnlocked && unlocked;

  return {
    rating,
    ewmaSuccess,
    attempts,
    correct,
    unlocked,
    becameUnlocked,
  };
}

/**
 * Seed values for a fresh per-user-per-motif row. Starts EWMA at 0.5 (no
 * evidence either way) and rating at the user's global currentTargetRating
 * — without that the user would have to re-converge from 1200 for every new
 * motif, which would take dozens of attempts each.
 */
export function seedMotifRating(globalTargetRating: number): MotifRatingState {
  return {
    rating: Math.max(MIN_RATING, Math.min(MAX_RATING, globalTargetRating)),
    ewmaSuccess: 0.5,
    attempts: 0,
    correct: 0,
    unlocked: false,
  };
}
