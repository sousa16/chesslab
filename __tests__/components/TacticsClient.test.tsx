/**
 * TacticsClient tests.
 *
 * The component owns the puzzle queue + prefs flow. We mock fetch to drive
 * the four code paths that matter:
 *   1. initial load with a due puzzle on screen
 *   2. empty state when there are no due/new puzzles
 *   3. Show solution → revealed UI + analysis
 *   4. Skip / solve → POST /api/puzzles/review with the derived response
 *
 * PuzzleBoard, MobileNav, and react-chessboard are stubbed so this suite
 * stays focused on TacticsClient state + fetch logic.
 */
import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import TacticsClient from "@/components/TacticsClient";
import { SettingsProvider } from "@/contexts/SettingsContext";

// Replace heavy children with simple markers so the suite isn't testing
// them transitively. The PuzzleBoard mock stashes its props on globalThis
// so analysis-mode tests can drive `onPositionChange` directly.
jest.mock("@/components/PuzzleBoard", () => {
  const React = require("react");
  const PuzzleBoard = React.forwardRef(
    (
      props: {
        initialFen: string;
        analysisMode?: boolean;
        onPositionChange?: (fen: string) => void;
      },
      ref: React.Ref<unknown>,
    ) => {
      React.useImperativeHandle(ref, () => ({
        revealRemaining: () => Promise.resolve(),
        goToFirst: jest.fn(),
        goToPrevious: jest.fn(),
        goToNext: jest.fn(),
        goToLast: jest.fn(),
      }));
      (globalThis as any).__lastPuzzleBoardProps = props;
      return (
        <div
          data-testid="puzzle-board"
          data-fen={props.initialFen}
          data-analysis={String(Boolean(props.analysisMode))}
        />
      );
    },
  );
  return { __esModule: true, PuzzleBoard };
});
jest.mock("@/components/MobileNav", () => ({
  MobileNav: () => <div data-testid="mobile-nav" />,
}));
jest.mock("@/components/Logo", () => ({
  Logo: () => <div data-testid="logo" />,
}));
jest.mock("@/components/BoardControls", () => ({
  BoardControls: () => <div data-testid="board-controls" />,
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: jest.fn() }),
}));

global.fetch = jest.fn();

const samplePuzzle = {
  id: "p1",
  lichessId: "abc",
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  moves: "e2e4 e7e5",
  rating: 1200,
  themes: ["fork"],
  categories: ["middlegame"],
};

const samplePrefs = {
  mode: "auto",
  blockedFilterMotif: null,
  enabledCategories: ["middlegame", "endgame"],
  currentTargetRating: 1200,
  globalEwmaSuccess: 0.5,
  globalAttempts: 0,
  globalCorrect: 0,
};

const emptyNext = {
  puzzle: null,
  review: null,
  dueCount: 0,
  source: "empty",
};

/**
 * Routes fetch by URL. The component fires prefs, motif-progress and
 * /api/puzzles/next in parallel on mount, so a positional sequence is
 * order-sensitive. `responses[0]` is the prefs payload, the rest are served
 * to /api/puzzles/next in order (then an empty response; "pending" never
 * resolves, so the current puzzle stays on screen). Anything else
 * (review POST, analysis, PATCH) gets a plain ok response.
 */
function mockFetchSequence(responses: Array<unknown | "empty">) {
  const [prefs, ...nexts] = responses;
  let i = 0;
  (fetch as jest.Mock).mockImplementation((url: string) => {
    const ok = (body: unknown) =>
      Promise.resolve({ ok: true, json: async () => body });
    if (typeof url === "string") {
      if (url.startsWith("/api/puzzle-prefs")) return ok(prefs);
      if (url.startsWith("/api/puzzles/motif-progress")) {
        return ok({ motifs: [] });
      }
      if (url.startsWith("/api/puzzles/next")) {
        const next = nexts[i++] ?? "empty";
        if (next === "pending") return new Promise(() => {});
        return ok(next === "empty" ? emptyNext : next);
      }
    }
    return ok({});
  });
}

function renderClient() {
  return render(
    <SettingsProvider>
      <TacticsClient />
    </SettingsProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("TacticsClient", () => {
  it("renders the loading state on first mount", async () => {
    (fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
    renderClient();
    expect(screen.getByText(/Loading puzzle/i)).toBeInTheDocument();
  });

  it("shows the empty state when no puzzles are returned", async () => {
    mockFetchSequence([
      samplePrefs, // /api/puzzle-prefs
      // /api/puzzles/next → empty
    ]);
    renderClient();
    await waitFor(() =>
      expect(
        screen.getByText(/No puzzles to solve right now/i),
      ).toBeInTheDocument(),
    );
  });

  it("renders the puzzle board with Skip and Show solution when a puzzle is queued", async () => {
    mockFetchSequence([
      samplePrefs,
      {
        puzzle: samplePuzzle,
        review: { id: "r-1" },
        dueCount: 5,
        source: "due",
      },
      // Prefetch of the next puzzle returns nothing — fine, we don't care.
      "empty",
    ]);
    renderClient();
    const board = await screen.findByTestId("puzzle-board");
    expect(board).toHaveAttribute("data-fen", samplePuzzle.fen);
    expect(screen.getByText("Skip")).toBeInTheDocument();
    expect(screen.getByText("Show solution")).toBeInTheDocument();
  });

  function mockOnePuzzleThenPending() {
    mockFetchSequence([
      samplePrefs,
      {
        puzzle: samplePuzzle,
        review: { id: "r-1" },
        dueCount: 1,
        source: "due",
      },
      // The prefetch never resolves, so we stay on this puzzle.
      "pending",
    ]);
  }

  function reviewBody() {
    const reviewCall = (fetch as jest.Mock).mock.calls.find(
      (c) => typeof c[0] === "string" && c[0] === "/api/puzzles/review",
    );
    expect(reviewCall).toBeDefined();
    return JSON.parse(reviewCall![1].body as string);
  }

  // The rating is derived from how the puzzle was played, not picked by the
  // user: skipping is "forgot", a clean solve is "easy".
  it("posts a 'forgot' review for the active card when the user skips", async () => {
    mockOnePuzzleThenPending();
    renderClient();
    await screen.findByText("Skip");

    await act(async () => {
      fireEvent.click(screen.getByText("Skip"));
    });

    expect(reviewBody()).toEqual(
      expect.objectContaining({ reviewId: "r-1", response: "forgot" }),
    );
  });

  it("posts an 'easy' review when the board reports a clean solve", async () => {
    mockOnePuzzleThenPending();
    renderClient();
    await screen.findByTestId("puzzle-board");

    await act(async () => {
      (globalThis as any).__lastPuzzleBoardProps.onSolved();
    });

    expect(reviewBody()).toEqual(
      expect.objectContaining({ reviewId: "r-1", response: "easy" }),
    );
  });

  describe("analysis toggle", () => {
    function mockSequenceForOneReveal() {
      // initial prefs fetch, the active puzzle, and a next-puzzle prefetch
      // that never resolves, so the solution stays on screen to analyze.
      mockFetchSequence([
        samplePrefs,
        {
          puzzle: samplePuzzle,
          review: { id: "r-1" },
          dueCount: 1,
          source: "due",
        },
        "pending",
      ]);
    }

    it("only shows the Analyze toggle after Show solution is pressed", async () => {
      mockSequenceForOneReveal();
      renderClient();
      await screen.findByText("Show solution");
      expect(screen.queryByRole("button", { name: /analyze/i })).toBeNull();

      fireEvent.click(screen.getByText("Show solution"));

      const analyzeBtns = await screen.findAllByRole("button", {
        name: /analyze/i,
      });
      expect(analyzeBtns.length).toBeGreaterThan(0);
      // PuzzleBoard prop reflects the toggled-off state.
      expect(
        (globalThis as any).__lastPuzzleBoardProps?.analysisMode,
      ).toBe(false);
    });

    it("hits /api/analysis (debounced) and renders the eval / best move when the board reports a new position", async () => {
      jest.useFakeTimers();
      try {
        mockSequenceForOneReveal();
        renderClient();
        // findByText is async — fake-timers don't block microtasks, but
        // pending promises still need a real tick to resolve. waitFor
        // pumps them.
        await waitFor(() =>
          expect(screen.getByText("Show solution")).toBeInTheDocument(),
        );

        fireEvent.click(screen.getByText("Show solution"));
        const [analyzeBtn] = await screen.findAllByRole("button", {
          name: /analyze/i,
        });

        // Once the user toggles analysis on, the next /api/analysis call
        // we queue up should match this fixture.
        const analysisFen =
          "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
        (fetch as jest.Mock).mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              eval: 0.32,
              mate: null,
              bestMove: "g1f3",
              continuation: "g1f3 b8c6 f1b5",
            }),
          }),
        );

        await act(async () => {
          analyzeBtn.click();
        });
        // Drive a position update from the mocked PuzzleBoard.
        await act(async () => {
          (globalThis as any).__lastPuzzleBoardProps?.onPositionChange?.(
            analysisFen,
          );
        });

        // Debounce is 300ms in TacticsClient. Advance past it, then let
        // the queued promise resolve.
        await act(async () => {
          jest.advanceTimersByTime(350);
        });
        await waitFor(() => {
          const calls = (fetch as jest.Mock).mock.calls;
          expect(
            calls.some(
              (c) =>
                typeof c[0] === "string" &&
                (c[0] as string).startsWith("/api/analysis"),
            ),
          ).toBe(true);
        });

        // The panel surfaces the engine response. Both layouts (mobile
        // and desktop) render the panel concurrently, so use the All
        // variants to avoid "multiple elements" throws.
        await waitFor(() => {
          expect(screen.getAllByText(/Engine/i).length).toBeGreaterThan(0);
          // Best move SAN derived from g1f3 on the analysisFen is "Nf3".
          expect(screen.getAllByText("Nf3").length).toBeGreaterThan(0);
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it("debounces rapid position changes into a single /api/analysis call", async () => {
      jest.useFakeTimers();
      try {
        mockSequenceForOneReveal();
        renderClient();
        await waitFor(() =>
          expect(screen.getByText("Show solution")).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByText("Show solution"));
        const [analyzeBtn] = await screen.findAllByRole("button", {
          name: /analyze/i,
        });

        (fetch as jest.Mock).mockImplementation(() =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              eval: 0,
              mate: null,
              bestMove: null,
              continuation: null,
            }),
          }),
        );

        await act(async () => {
          analyzeBtn.click();
        });
        const propsRef = (globalThis as any).__lastPuzzleBoardProps;
        // Three quick position changes back-to-back.
        const fenA =
          "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
        const fenB =
          "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";
        const fenC =
          "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
        await act(async () => {
          propsRef.onPositionChange(fenA);
          propsRef.onPositionChange(fenB);
          propsRef.onPositionChange(fenC);
        });
        await act(async () => {
          jest.advanceTimersByTime(350);
        });
        const analysisCalls = (fetch as jest.Mock).mock.calls.filter(
          (c) =>
            typeof c[0] === "string" &&
            (c[0] as string).startsWith("/api/analysis"),
        );
        // The first two debounces were cancelled by subsequent position
        // changes; only the final fen should have actually hit the API.
        expect(analysisCalls.length).toBe(1);
        expect(analysisCalls[0][0]).toContain(encodeURIComponent(fenC));
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
