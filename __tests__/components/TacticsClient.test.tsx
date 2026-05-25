/**
 * TacticsClient tests.
 *
 * The component owns the puzzle queue + prefs flow. We mock fetch to drive
 * the four code paths that matter:
 *   1. initial load with a due puzzle on screen
 *   2. empty state when there are no due/new puzzles
 *   3. Show Answer → revealed UI
 *   4. Rate flow → POST /api/puzzles/review + advance to next puzzle
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
      _ref: React.Ref<unknown>,
    ) => {
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
  ratingMin: 1400,
  ratingMax: 1799,
  enabledCategories: ["middlegame", "endgame"],
};

function mockFetchSequence(responses: Array<unknown | "empty">) {
  let i = 0;
  (fetch as jest.Mock).mockImplementation(() => {
    const next = responses[i++] ?? "empty";
    if (next === "empty") {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          puzzle: null,
          review: null,
          dueCount: 0,
          source: "empty",
        }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => next });
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

  it("renders the puzzle board and Show Answer button when a puzzle is queued", async () => {
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
    expect(screen.getByText("Show Answer")).toBeInTheDocument();
  });

  it("posts to /api/puzzles/review when the user rates the puzzle", async () => {
    mockFetchSequence([
      samplePrefs,
      {
        puzzle: samplePuzzle,
        review: { id: "r-1" },
        dueCount: 1,
        source: "due",
      },
      // prefetch
      {
        puzzle: { ...samplePuzzle, id: "p2" },
        review: { id: "r-2" },
        dueCount: 0,
        source: "due",
      },
    ]);
    renderClient();
    await screen.findByText("Show Answer");

    // Reveal solution first — rating buttons only render after.
    fireEvent.click(screen.getByText("Show Answer"));

    // RatingButtons renders labels like "Easy" once revealed. There are
    // two copies (mobile + desktop layouts both render); use the first.
    const easyBtns = await screen.findAllByText(/^Easy$/i);
    expect(easyBtns.length).toBeGreaterThan(0);
    await act(async () => {
      easyBtns[0].click();
    });

    // The review POST happened with the reviewId of the active card.
    const calls = (fetch as jest.Mock).mock.calls;
    const reviewCall = calls.find(
      (c) => typeof c[0] === "string" && c[0] === "/api/puzzles/review",
    );
    expect(reviewCall).toBeDefined();
    const body = JSON.parse(reviewCall![1].body as string);
    expect(body).toEqual(
      expect.objectContaining({
        reviewId: "r-1",
        response: "easy",
      }),
    );
  });

  describe("analysis toggle", () => {
    function mockSequenceForOneReveal() {
      // initial prefs fetch, the active puzzle, and the speculative
      // next-puzzle prefetch the component fires in the background.
      mockFetchSequence([
        samplePrefs,
        {
          puzzle: samplePuzzle,
          review: { id: "r-1" },
          dueCount: 1,
          source: "due",
        },
        "empty",
      ]);
    }

    it("only shows the Analyze toggle after Show Answer is pressed", async () => {
      mockSequenceForOneReveal();
      renderClient();
      await screen.findByText("Show Answer");
      expect(screen.queryByRole("button", { name: /analyze/i })).toBeNull();

      fireEvent.click(screen.getByText("Show Answer"));

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
          expect(screen.getByText("Show Answer")).toBeInTheDocument(),
        );

        fireEvent.click(screen.getByText("Show Answer"));
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
          expect(screen.getByText("Show Answer")).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByText("Show Answer"));
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
