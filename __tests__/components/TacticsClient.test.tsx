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
// them transitively.
jest.mock("@/components/PuzzleBoard", () => ({
  __esModule: true,
  PuzzleBoard: ({ initialFen }: { initialFen: string }) => (
    <div data-testid="puzzle-board" data-fen={initialFen} />
  ),
}));
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
});
