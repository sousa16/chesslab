/**
 * GapAnalysisClient tests.
 *
 * Covers the form → POST → render-results path, validation when neither
 * username is provided, error display, and the "Add" → sessionStorage +
 * router.push flow on a result row.
 */
import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import GapAnalysisClient from "@/components/GapAnalysisClient";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: jest.fn() }),
}));

jest.mock("@/components/MobileNav", () => ({
  MobileNav: () => <div data-testid="mobile-nav" />,
}));
jest.mock("@/components/Logo", () => ({
  Logo: () => <div data-testid="logo" />,
}));

global.fetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
});

describe("GapAnalysisClient", () => {
  it("renders the input form", () => {
    render(<GapAnalysisClient />);
    expect(
      screen.getByPlaceholderText(/sousa16/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Analyze games/i)).toBeInTheDocument();
  });

  it("shows an inline error when no username is entered", async () => {
    render(<GapAnalysisClient />);
    fireEvent.click(screen.getByText(/Analyze games/i));
    expect(
      await screen.findByText(
        /Enter a chess\.com or Lichess username/i,
      ),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts to /api/gap-analysis and renders aggregated gap rows", async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        gamesFetched: 12,
        gamesAnalyzed: 10,
        whiteGaps: [
          {
            positionFen: "fen-1",
            opponentMove: "e5",
            precedingSans: ["e4", "e5"],
            occurrences: 3,
            sampleGameUrls: ["https://chess.com/game/1"],
          },
        ],
        blackGaps: [],
        errors: [],
      }),
    });

    render(<GapAnalysisClient />);
    fireEvent.change(screen.getByPlaceholderText(/sousa16/i), {
      target: { value: "alice" },
    });

    await act(async () => {
      fireEvent.click(screen.getByText(/Analyze games/i));
    });

    await waitFor(() =>
      expect(screen.getByText(/Gaps when you played White/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("×3")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument(); // gamesFetched stat
    expect(screen.getByText("10")).toBeInTheDocument(); // gamesAnalyzed stat
  });

  it("renders the lib error message when the API returns 500", async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "upstream down" }),
    });

    render(<GapAnalysisClient />);
    fireEvent.change(screen.getByPlaceholderText(/sousa16/i), {
      target: { value: "alice" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/Analyze games/i));
    });

    expect(await screen.findByText(/upstream down/i)).toBeInTheDocument();
  });

  it("Add button stashes the preceding line into sessionStorage and routes to /build/<color>", async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        gamesFetched: 1,
        gamesAnalyzed: 1,
        whiteGaps: [
          {
            positionFen: "fen-1",
            opponentMove: "e5",
            precedingSans: ["e4", "e5"],
            occurrences: 2,
            sampleGameUrls: [],
          },
        ],
        blackGaps: [],
        errors: [],
      }),
    });

    render(<GapAnalysisClient />);
    fireEvent.change(screen.getByPlaceholderText(/sousa16/i), {
      target: { value: "alice" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/Analyze games/i));
    });

    const addBtn = await screen.findByText(/^Add$/);
    fireEvent.click(addBtn);

    expect(sessionStorage.getItem("buildSanMoves")).toBe(
      JSON.stringify(["e4", "e5"]),
    );
    expect(mockPush).toHaveBeenCalledWith("/build/white");
  });

  it("rehydrates form + last result from sessionStorage on mount", async () => {
    sessionStorage.setItem(
      "gapAnalysisState",
      JSON.stringify({
        chesscomUsername: "alice",
        lichessUsername: "",
        color: "white",
        timeClasses: ["blitz"],
        minRating: "1500",
        maxRating: "1800",
        maxGames: "100",
        result: {
          gamesFetched: 7,
          gamesAnalyzed: 7,
          whiteGaps: [
            {
              positionFen: "fen-1",
              opponentMove: "e5",
              precedingSans: ["e4", "e5"],
              occurrences: 4,
              sampleGameUrls: [],
            },
          ],
          blackGaps: [],
          errors: [],
        },
      }),
    );

    render(<GapAnalysisClient />);
    await waitFor(() =>
      expect(screen.getByDisplayValue("alice")).toBeInTheDocument(),
    );
    expect(screen.getByText("×4")).toBeInTheDocument();
  });
});
